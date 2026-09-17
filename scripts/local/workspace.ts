import { spawn } from 'node:child_process'
import { cp, lstat, mkdir, readdir, rename, rm } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'
import {
  createDocument,
  errorCode,
  HttpError,
  MAX_BYTES,
  readDocument,
  replaceDocument,
  writePrivateFile,
} from './files.ts'

export const METADATA_PATH = '.devnotes/workspace.json'
const MAX_ENTRIES = 10_000
const MAX_MARKDOWN_BYTES = 20 * 1024 * 1024
const MAX_METADATA_BYTES = 5 * 1024 * 1024
export const MAX_HISTORY_BYTES = 16 * 1024 * 1024
const MAX_TOTAL_HISTORY_BYTES = 64 * 1024 * 1024
const ID = /^[A-Za-z0-9_-]{1,100}$/
const MARKDOWN = /\.(md|markdown)$/i

export type WorkspaceEntry =
  | { kind: 'directory'; path: string }
  | { kind: 'markdown'; path: string; raw: string; version: string }
  | { kind: 'pdf'; path: string; size: number }

type Area = 'content' | 'metadata' | 'history' | 'trash'

function visibleName(name: string) {
  return (
    !!name &&
    name !== '.' &&
    name !== '..' &&
    !name.startsWith('.') &&
    name !== 'node_modules' &&
    !name.includes('\\') &&
    ![...name].some((character) => character.charCodeAt(0) < 32) &&
    Buffer.byteLength(name) <= 255
  )
}

/** Splits a workspace-relative path and reports which part of the workspace it may touch. */
export function workspacePath(path: unknown) {
  if (typeof path !== 'string' || !path || path.length > 4096)
    throw new HttpError(400, 'Invalid workspace path.')
  const parts = path.split('/')
  if (path === METADATA_PATH) return { parts, area: 'metadata' as Area }
  if (parts[0] === '.devnotes') {
    if (
      parts.length === 3 &&
      parts[1] === 'history' &&
      parts[2]!.endsWith('.json') &&
      ID.test(parts[2]!.slice(0, -5))
    )
      return { parts, area: 'history' as Area }
    if (
      (parts.length === 3 || parts.length === 4) &&
      parts[1] === 'trash' &&
      ID.test(parts[2]!) &&
      (parts.length === 3 || visibleName(parts[3]!))
    )
      return { parts, area: 'trash' as Area }
    throw new HttpError(403, 'This workspace path is reserved.')
  }
  if (!parts.every(visibleName))
    throw new HttpError(400, 'Invalid workspace path.')
  return { parts, area: 'content' as Area }
}

/** Resolves a path whose existing ancestors are real directories inside the root. */
async function locate(root: string, parts: string[]) {
  let current = root
  for (const part of parts.slice(0, -1)) {
    current = join(current, part)
    let info
    try {
      info = await lstat(current)
    } catch (error) {
      if (errorCode(error) === 'ENOENT')
        throw new HttpError(404, 'The parent folder does not exist.')
      throw error
    }
    if (!info.isDirectory() || info.isSymbolicLink())
      throw new HttpError(400, 'Invalid workspace path.')
  }
  return join(current, parts.at(-1)!)
}

async function exists(path: string) {
  try {
    return await lstat(path)
  } catch (error) {
    if (errorCode(error) === 'ENOENT') return null
    throw error
  }
}

async function ensureInternalDirectory(root: string, parts: string[]) {
  let current = root
  for (const part of parts) {
    current = join(current, part)
    try {
      await mkdir(current)
    } catch (error) {
      if (errorCode(error) !== 'EEXIST') throw error
    }
    const info = await lstat(current)
    if (!info.isDirectory() || info.isSymbolicLink())
      throw new HttpError(400, 'Invalid workspace path.')
  }
}

export async function scanWorkspace(root: string) {
  const entries: WorkspaceEntry[] = []
  const skipped: string[] = []
  let count = 0
  let markdownBytes = 0
  async function visit(directory: string, prefix: string) {
    const items = await readdir(directory, { withFileTypes: true })
    items.sort((a, b) => a.name.localeCompare(b.name))
    for (const item of items) {
      if (item.name.startsWith('.') || item.name === 'node_modules') continue
      if (++count > MAX_ENTRIES)
        throw new HttpError(
          413,
          'Esta pasta tem mais de 10.000 itens. Escolha uma pasta menor.',
        )
      const path = `${prefix}${item.name}`
      const absolute = join(directory, item.name)
      if (item.isSymbolicLink()) continue
      if (!visibleName(item.name)) {
        skipped.push(path)
        continue
      }
      if (item.isDirectory()) {
        entries.push({ kind: 'directory', path })
        await visit(absolute, `${path}/`)
      } else if (item.isFile() && MARKDOWN.test(item.name)) {
        let document
        try {
          document = await readDocument(absolute)
        } catch (error) {
          if (!(error instanceof HttpError)) throw error
          skipped.push(path)
          continue
        }
        markdownBytes += Buffer.byteLength(document.raw)
        if (markdownBytes > MAX_MARKDOWN_BYTES)
          throw new HttpError(
            413,
            'Esta pasta tem mais de 20 MB de Markdown. Escolha uma pasta menor.',
          )
        entries.push({
          kind: 'markdown',
          path,
          raw: document.raw,
          version: document.version,
        })
      } else if (item.isFile() && /\.pdf$/i.test(item.name)) {
        entries.push({ kind: 'pdf', path, size: (await lstat(absolute)).size })
      }
    }
  }
  await visit(root, '')

  let metadata: string | null = null
  const history: Record<string, string> = {}
  const internal = await exists(join(root, '.devnotes'))
  if (!internal?.isDirectory() || internal.isSymbolicLink())
    return { entries, skipped, metadata, history }
  const metadataPath = join(root, METADATA_PATH)
  if (await exists(metadataPath)) {
    try {
      metadata = (await readDocument(metadataPath, MAX_METADATA_BYTES)).raw
    } catch (error) {
      if (!(error instanceof HttpError)) throw error
      skipped.push(METADATA_PATH)
    }
  }

  let historyBytes = 0
  const historyDirectory = join(root, '.devnotes', 'history')
  const historyInfo = await exists(historyDirectory)
  if (historyInfo?.isDirectory() && !historyInfo.isSymbolicLink()) {
    for (const item of await readdir(historyDirectory, {
      withFileTypes: true,
    })) {
      const id = item.name.slice(0, -5)
      if (!item.isFile() || !item.name.endsWith('.json') || !ID.test(id))
        continue
      try {
        const { raw } = await readDocument(
          join(historyDirectory, item.name),
          MAX_HISTORY_BYTES,
        )
        historyBytes += Buffer.byteLength(raw)
        if (historyBytes > MAX_TOTAL_HISTORY_BYTES) break
        history[id] = raw
      } catch (error) {
        if (!(error instanceof HttpError)) throw error
      }
    }
  }
  return { entries, skipped, metadata, history }
}

export async function readWorkspaceFile(root: string, path: unknown) {
  const { parts, area } = workspacePath(path)
  if (area !== 'content' || !MARKDOWN.test(parts.at(-1)!))
    throw new HttpError(400, 'Expected a Markdown file.')
  return readDocument(await locate(root, parts))
}

export async function workspacePdfPath(root: string, path: unknown) {
  const { parts, area } = workspacePath(path)
  if (area !== 'content' || !/\.pdf$/i.test(parts.at(-1)!))
    throw new HttpError(400, 'Expected a PDF file.')
  return locate(root, parts)
}

export async function writeWorkspaceFile(
  root: string,
  path: unknown,
  raw: unknown,
  version: unknown,
) {
  const { parts, area } = workspacePath(path)
  if (typeof raw !== 'string')
    throw new HttpError(400, 'Expected file content.')
  if (area === 'metadata' || area === 'history') {
    const limit = area === 'metadata' ? MAX_METADATA_BYTES : MAX_HISTORY_BYTES
    if (Buffer.byteLength(raw) > limit)
      throw new HttpError(413, 'Workspace metadata is too large.')
    await ensureInternalDirectory(root, parts.slice(0, -1))
    return writePrivateFile(await locate(root, parts), raw)
  }
  if (area !== 'content' || !MARKDOWN.test(parts.at(-1)!))
    throw new HttpError(400, 'Expected a Markdown file.')
  if (Buffer.byteLength(raw) > MAX_BYTES)
    throw new HttpError(413, 'Document exceeds 2 MB.')
  const target = await locate(root, parts)
  if (version === null) return createDocument(target, raw)
  if (typeof version !== 'string')
    throw new HttpError(400, 'Expected a document version.')
  try {
    return await replaceDocument(target, raw, version)
  } catch (error) {
    if (errorCode(error) === 'ENOENT')
      throw new HttpError(404, 'The file no longer exists.')
    throw error
  }
}

export async function createWorkspaceDirectory(root: string, path: unknown) {
  const { parts, area } = workspacePath(path)
  if (area !== 'content') throw new HttpError(400, 'Invalid folder path.')
  const target = await locate(root, parts)
  try {
    await mkdir(target)
  } catch (error) {
    if (errorCode(error) === 'EEXIST')
      throw new HttpError(409, 'An item already exists at this path.')
    throw error
  }
}

function assertMovable(from: Area, to: Area) {
  const allowed =
    (from === 'content' && to === 'content') ||
    (from === 'content' && to === 'trash') ||
    (from === 'trash' && to === 'content')
  if (!allowed) throw new HttpError(403, 'This workspace path is reserved.')
}

export async function moveWorkspaceEntry(
  root: string,
  from: unknown,
  to: unknown,
) {
  const source = workspacePath(from)
  const destination = workspacePath(to)
  assertMovable(source.area, destination.area)
  if (
    (source.area === 'trash' && source.parts.length !== 4) ||
    (destination.area === 'trash' && destination.parts.length !== 4)
  )
    throw new HttpError(400, 'Invalid trash path.')
  const sourcePath = await locate(root, source.parts)
  if (destination.area === 'trash')
    await ensureInternalDirectory(root, destination.parts.slice(0, -1))
  const targetPath = await locate(root, destination.parts)
  const info = await exists(sourcePath)
  if (!info) throw new HttpError(404, 'The item no longer exists.')
  if (info.isSymbolicLink()) throw new HttpError(400, 'Invalid workspace path.')
  if (sourcePath === targetPath) return
  if (targetPath.startsWith(`${sourcePath}/`))
    throw new HttpError(400, 'A folder cannot be moved inside itself.')
  const existing = await exists(targetPath)
  // Allow case-only renames on case-insensitive filesystems, where both names are one entry.
  if (existing && !(existing.ino === info.ino && existing.dev === info.dev))
    throw new HttpError(409, 'An item already exists at the destination.')
  await rename(sourcePath, targetPath)
}

export async function copyWorkspaceEntry(
  root: string,
  from: unknown,
  to: unknown,
) {
  const source = workspacePath(from)
  const destination = workspacePath(to)
  if (source.area !== 'content' || destination.area !== 'content')
    throw new HttpError(403, 'This workspace path is reserved.')
  const sourcePath = await locate(root, source.parts)
  const targetPath = await locate(root, destination.parts)
  const info = await exists(sourcePath)
  if (!info) throw new HttpError(404, 'The item no longer exists.')
  if (info.isSymbolicLink()) throw new HttpError(400, 'Invalid workspace path.')
  if (targetPath.startsWith(`${sourcePath}/`))
    throw new HttpError(400, 'A folder cannot be copied inside itself.')
  if (await exists(targetPath))
    throw new HttpError(409, 'An item already exists at the destination.')
  await cp(sourcePath, targetPath, {
    recursive: true,
    errorOnExist: true,
    force: false,
    verbatimSymlinks: true,
  })
}

export async function deleteWorkspaceEntry(root: string, path: unknown) {
  const { parts, area } = workspacePath(path)
  if (area !== 'history' && !(area === 'trash' && parts.length === 3))
    throw new HttpError(403, 'Only trash and history entries can be deleted.')
  const target = await locate(root, parts).catch((error: unknown) => {
    if (error instanceof HttpError && error.status === 404) return null
    throw error
  })
  const info = target ? await exists(target) : null
  if (!target || !info) return
  if (info.isSymbolicLink()) throw new HttpError(400, 'Invalid workspace path.')
  await rm(target, { recursive: true, force: true })
}

export async function authorizeWorkspaceRoot(path: string) {
  const info = await lstat(path).catch((error: unknown) => {
    if (errorCode(error) === 'ENOENT')
      throw new HttpError(404, 'Folder not found.')
    throw error
  })
  if (!info.isDirectory()) throw new HttpError(400, 'Expected a folder.')
}

export function validFolderName(name: unknown) {
  if (
    typeof name !== 'string' ||
    name.length > 100 ||
    name.includes('/') ||
    !visibleName(name.trim())
  )
    throw new HttpError(
      400,
      'Use um nome de pasta com até 100 caracteres, sem barras e sem começar com ponto.',
    )
  return name.trim()
}

export type DirectoryChooser = (title: string) => Promise<string | null>

function run(command: string, parameters: string[]) {
  return new Promise<{ code: number | null; output: string }>(
    (resolveRun, reject) => {
      const child = spawn(command, parameters, {
        stdio: ['ignore', 'pipe', 'ignore'],
      })
      let output = ''
      child.stdout.setEncoding('utf8')
      child.stdout.on('data', (chunk: string) => {
        output += chunk
      })
      child.once('error', reject)
      child.once('close', (code) => resolveRun({ code, output }))
    },
  )
}

/** Opens a native folder dialog so the person, not the page, chooses what DevNotes may access. */
export const chooseDirectoryWithDialog: DirectoryChooser = async (title) => {
  const dialogs: [string, string[]][] = [
    ['zenity', ['--file-selection', '--directory', `--title=${title}`]],
    ['kdialog', ['--getexistingdirectory', homedir(), '--title', title]],
  ]
  for (const [command, parameters] of dialogs) {
    let result
    try {
      result = await run(command, parameters)
    } catch (error) {
      if (errorCode(error) === 'ENOENT') continue
      throw error
    }
    if (result.code === 0 && result.output.trim())
      return result.output.replace(/\r?\n$/, '')
    if (result.code === 1) return null
    throw new HttpError(502, 'Não foi possível abrir a janela de pastas.')
  }
  throw new HttpError(
    501,
    'Não encontramos uma janela de seleção de pastas. Instale o zenity ou abra o workspace pelo terminal com: devnotes /caminho/da/pasta',
  )
}
