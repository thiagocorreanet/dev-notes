import type { Note } from './types'
import type { LocalDirectoryHandle, LocalFileHandle } from './workspace-files'
import { parseMarkdownFile } from './workspace-files'
import { WorkspaceError } from './workspace-error'
import { serializeProtectedMarkdown } from './document-protection'
import { readPdfFile } from './pdf-files'

export interface DiskMarkdownFile {
  type: 'markdown'
  path: string
  raw: string
}

export interface DiskPdfFile {
  type: 'pdf'
  path: string
  title: string
  data: Uint8Array
  fileName: string
  handle: LocalFileHandle
}

export type DiskFile = DiskMarkdownFile | DiskPdfFile

export interface SyncedFile {
  noteId: string
  path: string
  baseline: string | null
  disk: string | null
}

export type SyncStatus =
  'saved' | 'modified' | 'external' | 'conflict' | 'missing'

export function sameDocument(
  note: Pick<Note, 'title' | 'content' | 'protection'>,
  raw: string,
  path: string,
) {
  const parsed = parseMarkdownFile(path.split('/').at(-1)!, raw)
  return (
    note.title === parsed.title &&
    note.content === parsed.content &&
    JSON.stringify(note.protection?.payload) ===
      JSON.stringify(parsed.protection?.payload)
  )
}

export function syncStatus(note: Note, file: SyncedFile): SyncStatus {
  if (file.disk === null) return 'missing'
  if (sameDocument(note, file.disk, file.path)) return 'saved'
  if (file.baseline === null) return 'conflict'
  const localChanged = !sameDocument(note, file.baseline, file.path)
  const diskChanged = file.disk !== file.baseline
  return localChanged ? (diskChanged ? 'conflict' : 'modified') : 'external'
}

export function serializeLocalNote(note: Note, file?: SyncedFile): string {
  if (note.protection) return serializeProtectedMarkdown(note)
  const raw = file?.baseline
  if (file && raw != null) {
    const parsed = parseMarkdownFile(file.path.split('/').at(-1)!, raw)
    if (note.title === parsed.title) {
      return raw.slice(0, raw.length - parsed.content.length) + note.content
    }
  }
  const eol = raw?.includes('\r\n') ? '\r\n' : '\n'
  return note.title.trim()
    ? `# ${note.title}${eol}${eol}${note.content}`
    : note.content
}

export function validateLocalPath(path: string): string[] {
  const parts = path.split('/')
  if (
    !/\.(md|markdown)$/i.test(path) ||
    parts.some(
      (part) =>
        !part.trim() ||
        part !== part.trim() ||
        part === '.' ||
        part === '..' ||
        /[\\:*?"<>|]/.test(part) ||
        [...part].some((character) => character.charCodeAt(0) < 32) ||
        part === '.git' ||
        part === 'node_modules',
    )
  )
    throw new WorkspaceError(
      'Use um caminho relativo para um arquivo .md ou .markdown, sem segmentos vazios, “..” ou caracteres especiais.',
    )
  return parts
}

export async function scanLocalFolder(
  root: LocalDirectoryHandle,
): Promise<DiskFile[]> {
  const files: DiskFile[] = []
  let entries = 0
  let markdownBytes = 0
  let pdfBytes = 0
  async function visit(directory: LocalDirectoryHandle, prefix: string) {
    for await (const entry of directory.values()) {
      if (++entries > 10000)
        throw new WorkspaceError(
          'Esta pasta tem mais de 10.000 entradas. Conecte uma pasta menor.',
        )
      if (entry.kind === 'directory') {
        if (entry.name !== '.git' && entry.name !== 'node_modules')
          await visit(entry, `${prefix}${entry.name}/`)
      } else if (/\.(md|markdown)$/i.test(entry.name)) {
        const file = await entry.getFile()
        markdownBytes += file.size
        if (file.size > 2 * 1024 * 1024 || markdownBytes > 20 * 1024 * 1024)
          throw new WorkspaceError(
            'A pasta excede os limites: 2 MB por arquivo e 20 MB de Markdown no total.',
          )
        files.push({
          type: 'markdown',
          path: `${prefix}${entry.name}`,
          raw: await file.text(),
        })
      } else if (/\.pdf$/i.test(entry.name)) {
        const file = await entry.getFile()
        pdfBytes += file.size
        if (pdfBytes > 100 * 1024 * 1024)
          throw new WorkspaceError(
            'A pasta excede o limite de 100 MB de PDFs no total.',
          )
        const pdf = await readPdfFile(file)
        files.push({
          type: 'pdf',
          path: `${prefix}${entry.name}`,
          title: pdf.title,
          data: pdf.data,
          fileName: entry.name,
          handle: entry,
        })
      }
    }
  }
  await visit(root, '')
  return files
}

async function fileHandle(
  root: LocalDirectoryHandle,
  path: string,
  create: boolean,
): Promise<LocalFileHandle> {
  const parts = validateLocalPath(path)
  let directory = root
  for (const part of parts.slice(0, -1)) {
    if (!directory.getDirectoryHandle)
      throw new WorkspaceError('Este navegador não permite gravar nesta pasta.')
    directory = await directory.getDirectoryHandle(part, { create })
  }
  if (!directory.getFileHandle)
    throw new WorkspaceError('Este navegador não permite gravar nesta pasta.')
  return directory.getFileHandle(parts.at(-1)!, { create })
}

export async function readLocalPath(
  root: LocalDirectoryHandle,
  path: string,
): Promise<string | null> {
  try {
    const file = await (await fileHandle(root, path, false)).getFile()
    if (file.size > 2 * 1024 * 1024)
      throw new WorkspaceError('O arquivo ultrapassa o limite de 2 MB.')
    return await file.text()
  } catch (error) {
    if (error instanceof DOMException && error.name === 'NotFoundError')
      return null
    throw error
  }
}

export class FileChangedError extends WorkspaceError {
  constructor() {
    super(
      'O arquivo mudou desde a última verificação. Confira as versões antes de salvar novamente.',
    )
  }
}

export async function writeLocalPath(
  root: LocalDirectoryHandle,
  path: string,
  content: string,
  expected: string | null,
) {
  if (new Blob([content]).size > 2 * 1024 * 1024)
    throw new WorkspaceError('O documento ultrapassa o limite de 2 MB.')
  if ((await readLocalPath(root, path)) !== expected)
    throw new FileChangedError()
  const handle = await fileHandle(root, path, true)
  if (!handle.createWritable)
    throw new WorkspaceError(
      'Este navegador não permite gravar arquivos. Use a opção Baixar Markdown.',
    )
  const writable = await handle.createWritable()
  try {
    // Recheck after opening the temporary writable stream, before committing it.
    const current = await (await handle.getFile()).text()
    if (current !== (expected ?? '')) throw new FileChangedError()
    await writable.write(content)
    if ((await (await handle.getFile()).text()) !== (expected ?? ''))
      throw new FileChangedError()
    await writable.close()
  } catch (error) {
    await writable.abort().catch(() => undefined)
    throw error
  }
}
