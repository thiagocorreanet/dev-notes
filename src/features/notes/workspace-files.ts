import { WorkspaceError } from './workspace-error'
import { parseProtectedMarkdown } from './document-protection'
import { isPdfFilename, readPdfFile } from './pdf-files'
import type { Note, WorkspaceFolder } from './types'

export interface LocalFileHandle {
  kind: 'file'
  name: string
  getFile: () => Promise<File>
  createWritable?: () => Promise<{
    write: (content: string) => Promise<void>
    close: () => Promise<void>
    abort: () => Promise<void>
  }>
}

export interface LocalDirectoryHandle {
  kind: 'directory'
  name: string
  values: () => AsyncIterable<LocalDirectoryHandle | LocalFileHandle>
  getFileHandle?: (
    name: string,
    options?: { create?: boolean },
  ) => Promise<LocalFileHandle>
  getDirectoryHandle?: (
    name: string,
    options?: { create?: boolean },
  ) => Promise<LocalDirectoryHandle>
}

declare global {
  interface Window {
    showDirectoryPicker?: (options: {
      mode: 'read' | 'readwrite'
    }) => Promise<LocalDirectoryHandle>
  }
}

export interface FileSource {
  handle?: LocalFileHandle
  fileName: string
  baseline: Pick<Note, 'title' | 'content' | 'protection'>
}

export interface ImportedFolder {
  notes: Note[]
  pdfs: ImportedPdf[]
  folders: WorkspaceFolder[]
  sources: Map<string, FileSource>
}

export interface ImportedPdf {
  note: Note
  data: Uint8Array
  handle?: LocalFileHandle
  fileName: string
}

const MAX_FILE_BYTES = 2 * 1024 * 1024
const MAX_TOTAL_BYTES = 20 * 1024 * 1024
const MAX_TOTAL_PDF_BYTES = 100 * 1024 * 1024
const MAX_ENTRIES = 10000
const MARKDOWN_EXTENSION = /\.(md|markdown)$/i
const IGNORED_DIRECTORIES = new Set(['.git', 'node_modules'])

export function parseMarkdownFile(
  name: string,
  text: string,
): Pick<Note, 'title' | 'content' | 'protection'> {
  const protectedDocument = parseProtectedMarkdown(name, text)
  if (protectedDocument) return protectedDocument
  const heading = /^# ([^\r\n]+)\r?\n(?:\r?\n)?/.exec(text)
  return {
    title: heading?.[1]?.trim() || name.replace(MARKDOWN_EXTENSION, ''),
    content: heading ? text.slice(heading[0].length) : text,
  }
}

export async function readMarkdownFile(file: File) {
  if (!MARKDOWN_EXTENSION.test(file.name))
    throw new WorkspaceError(
      'Selecione um arquivo Markdown (.md ou .markdown).',
    )
  if (file.size > MAX_FILE_BYTES)
    throw new WorkspaceError(
      `O arquivo "${file.name}" ultrapassa o limite de 2 MB.`,
    )
  return parseMarkdownFile(file.name, await file.text())
}

function finishDirectoryImport(result: ImportedFolder): ImportedFolder {
  if (!result.notes.length && !result.pdfs.length && !result.folders.length)
    throw new WorkspaceError('Nenhuma pasta ou documento pôde ser lido.')
  return result
}

export async function importDirectory(
  handle: LocalDirectoryHandle,
): Promise<ImportedFolder> {
  const result: ImportedFolder = {
    notes: [],
    pdfs: [],
    folders: [],
    sources: new Map(),
  }
  let entries = 0
  let totalBytes = 0
  let totalPdfBytes = 0
  async function visit(
    directory: LocalDirectoryHandle,
    path: string,
    parentId?: string,
  ) {
    if (++entries > MAX_ENTRIES)
      throw new WorkspaceError(
        'Esta pasta tem arquivos e subpastas demais. Abra uma pasta menor.',
      )
    const folder: WorkspaceFolder = {
      id: crypto.randomUUID(),
      name: directory.name,
      ...(parentId ? { parentId } : {}),
    }
    result.folders.push(folder)
    for await (const entry of directory.values()) {
      if (++entries > MAX_ENTRIES)
        throw new WorkspaceError(
          'Esta pasta tem arquivos e subpastas demais. Abra uma pasta menor.',
        )
      if (entry.kind === 'directory') {
        if (!IGNORED_DIRECTORIES.has(entry.name))
          await visit(entry, `${path}/${entry.name}`, folder.id)
      } else if (MARKDOWN_EXTENSION.test(entry.name)) {
        const file = await entry.getFile()
        totalBytes += file.size
        if (totalBytes > MAX_TOTAL_BYTES)
          throw new WorkspaceError(
            'Os arquivos Markdown ultrapassam o limite total de 20 MB. Abra uma pasta menor.',
          )
        const parsed = await readMarkdownFile(file)
        const note: Note = {
          id: crypto.randomUUID(),
          ...parsed,
          folderId: folder.id,
          sourcePath: `${path}/${entry.name}`,
        }
        if (note.protection)
          note.protection = { ...note.protection, ownerId: note.id }
        result.notes.push(note)
        result.sources.set(note.id, {
          handle: entry,
          fileName: entry.name,
          baseline: parsed,
        })
      } else if (isPdfFilename(entry.name)) {
        const file = await entry.getFile()
        totalPdfBytes += file.size
        if (totalPdfBytes > MAX_TOTAL_PDF_BYTES)
          throw new WorkspaceError(
            'Os arquivos PDF ultrapassam o limite total de 100 MB. Abra uma pasta menor.',
          )
        const pdf = await readPdfFile(file)
        result.pdfs.push({
          note: {
            id: crypto.randomUUID(),
            title: pdf.title,
            content: '',
            mediaType: 'pdf',
            folderId: folder.id,
            sourcePath: `${path}/${entry.name}`,
          },
          data: pdf.data,
          handle: entry,
          fileName: entry.name,
        })
      }
    }
  }
  await visit(handle, handle.name)
  return finishDirectoryImport(result)
}

export async function importFileList(files: File[]): Promise<ImportedFolder> {
  const result: ImportedFolder = {
    notes: [],
    pdfs: [],
    folders: [],
    sources: new Map(),
  }
  const foldersByPath = new Map<string, string>()
  let totalBytes = 0
  let totalPdfBytes = 0
  if (files.length > MAX_ENTRIES)
    throw new WorkspaceError(
      'Esta pasta tem arquivos e subpastas demais. Abra uma pasta menor.',
    )
  for (const file of files) {
    const path = file.webkitRelativePath || file.name
    const parts = path.split('/')
    if (parts.some((part) => IGNORED_DIRECTORIES.has(part))) continue
    let parentId: string | undefined
    for (let index = 0; index < parts.length - 1; index++) {
      const folderPath = parts.slice(0, index + 1).join('/')
      let id = foldersByPath.get(folderPath)
      if (!id) {
        id = crypto.randomUUID()
        foldersByPath.set(folderPath, id)
        result.folders.push({
          id,
          name: parts[index]!,
          ...(parentId ? { parentId } : {}),
        })
      }
      parentId = id
    }
    if (MARKDOWN_EXTENSION.test(file.name)) {
      totalBytes += file.size
      if (totalBytes > MAX_TOTAL_BYTES)
        throw new WorkspaceError(
          'Os arquivos Markdown ultrapassam o limite total de 20 MB. Abra uma pasta menor.',
        )
      const parsed = await readMarkdownFile(file)
      const note: Note = {
        id: crypto.randomUUID(),
        ...parsed,
        sourcePath: path,
        ...(parentId ? { folderId: parentId } : {}),
      }
      if (note.protection)
        note.protection = { ...note.protection, ownerId: note.id }
      result.notes.push(note)
      result.sources.set(note.id, { fileName: file.name, baseline: parsed })
    } else if (isPdfFilename(file.name)) {
      totalPdfBytes += file.size
      if (totalPdfBytes > MAX_TOTAL_PDF_BYTES)
        throw new WorkspaceError(
          'Os arquivos PDF ultrapassam o limite total de 100 MB. Abra uma pasta menor.',
        )
      const pdf = await readPdfFile(file)
      result.pdfs.push({
        note: {
          id: crypto.randomUUID(),
          title: pdf.title,
          content: '',
          mediaType: 'pdf',
          sourcePath: path,
          ...(parentId ? { folderId: parentId } : {}),
        },
        data: pdf.data,
        fileName: file.name,
      })
    }
  }
  return finishDirectoryImport(result)
}

export function downloadFile(name: string, content: BlobPart, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }))
  const link = document.createElement('a')
  link.href = url
  link.download = name
  link.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export function markdownFilename(title: string) {
  return `${
    title
      .replace(/[^a-zA-Z0-9_-]/g, '-')
      .replace(/-+/g, '-')
      .slice(0, 100) || 'documento-sem-titulo'
  }.md`
}
