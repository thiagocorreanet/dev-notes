import { isEncryptedPayload } from './document-protection'
import { pdfTitle } from './pdf-files'
import { validTimestamp } from './storage'
import type {
  FolderProtection,
  Note,
  NoteRevision,
  WorkspaceFolder,
} from './types'
import { WorkspaceError } from './workspace-error'
import { parseMarkdownFile } from './workspace-files'

export const DISK_METADATA_PATH = '.devnotes/workspace.json'

export type DiskEntry =
  | { kind: 'directory'; path: string }
  | { kind: 'markdown'; path: string; raw: string; version: string }
  | { kind: 'pdf'; path: string; size: number }

export interface DiskSnapshot {
  name: string
  path: string
  entries: DiskEntry[]
  skipped: string[]
  metadata: string | null
  history: Record<string, string>
}

export interface DiskItem {
  id: string
  path: string
  favorite?: true
  protection?: FolderProtection
}

export interface DiskTrashEntry {
  id: string
  kind: 'note' | 'folder'
  name: string
  /** Original workspace path, used when restoring. */
  path: string
  batch: string
  deletedAt: string
  /** Metadata for the item and its descendants, with paths relative to the item. */
  items: DiskItem[]
}

export interface DiskMetadata {
  format: 'devnotes-workspace-folder'
  version: 1
  items: DiskItem[]
  trash: DiskTrashEntry[]
}

export function emptyDiskMetadata(): DiskMetadata {
  return {
    format: 'devnotes-workspace-folder',
    version: 1,
    items: [],
    trash: [],
  }
}

function isFolderProtection(value: unknown): value is FolderProtection {
  return (
    typeof value === 'object' &&
    value !== null &&
    'format' in value &&
    value.format === 'devnotes-folder-protection' &&
    'version' in value &&
    value.version === 1 &&
    'verifier' in value &&
    isEncryptedPayload(value.verifier)
  )
}

function parseItem(value: unknown): DiskItem | null {
  if (
    typeof value !== 'object' ||
    value === null ||
    !('id' in value) ||
    typeof value.id !== 'string' ||
    !value.id ||
    !('path' in value) ||
    typeof value.path !== 'string'
  )
    return null
  return {
    id: value.id,
    path: value.path,
    ...('favorite' in value && value.favorite === true
      ? { favorite: true as const }
      : {}),
    ...('protection' in value && isFolderProtection(value.protection)
      ? { protection: value.protection }
      : {}),
  }
}

/** Reads workspace metadata, dropping malformed entries instead of rejecting the folder. */
export function parseDiskMetadata(raw: string | null): DiskMetadata {
  const metadata = emptyDiskMetadata()
  if (!raw) return metadata
  let value: unknown
  try {
    value = JSON.parse(raw)
  } catch {
    return metadata
  }
  if (
    typeof value !== 'object' ||
    value === null ||
    !('format' in value) ||
    value.format !== metadata.format
  )
    return metadata
  if ('items' in value && Array.isArray(value.items))
    metadata.items = value.items.flatMap((item) => parseItem(item) ?? [])
  if ('trash' in value && Array.isArray(value.trash))
    metadata.trash = value.trash.flatMap((entry: unknown) => {
      if (
        typeof entry !== 'object' ||
        entry === null ||
        !('id' in entry) ||
        typeof entry.id !== 'string' ||
        !('kind' in entry) ||
        (entry.kind !== 'note' && entry.kind !== 'folder') ||
        !('name' in entry) ||
        typeof entry.name !== 'string' ||
        !('path' in entry) ||
        typeof entry.path !== 'string' ||
        !('batch' in entry) ||
        typeof entry.batch !== 'string' ||
        !/^[A-Za-z0-9_-]{1,100}$/.test(entry.batch) ||
        !('deletedAt' in entry) ||
        !validTimestamp(entry.deletedAt)
      )
        return []
      return [
        {
          id: entry.id,
          kind: entry.kind,
          name: entry.name,
          path: entry.path,
          batch: entry.batch,
          deletedAt: entry.deletedAt,
          items:
            'items' in entry && Array.isArray(entry.items)
              ? entry.items.flatMap((item) => parseItem(item) ?? [])
              : [],
        },
      ]
    })
  return metadata
}

export function serializeDiskMetadata(metadata: DiskMetadata) {
  return `${JSON.stringify(metadata, null, 2)}\n`
}

function isRevision(value: unknown): value is NoteRevision {
  return (
    typeof value === 'object' &&
    value !== null &&
    'id' in value &&
    typeof value.id === 'string' &&
    'title' in value &&
    typeof value.title === 'string' &&
    'content' in value &&
    typeof value.content === 'string' &&
    'createdAt' in value &&
    validTimestamp(value.createdAt)
  )
}

export function parseDiskHistory(raw: string | undefined) {
  if (!raw) return undefined
  try {
    const value: unknown = JSON.parse(raw)
    if (
      typeof value === 'object' &&
      value !== null &&
      'format' in value &&
      value.format === 'devnotes-history' &&
      'revisions' in value &&
      Array.isArray(value.revisions)
    ) {
      const revisions = value.revisions.filter(isRevision).slice(0, 30)
      return revisions.length ? revisions : undefined
    }
  } catch {
    /* A damaged history file must not hide the document itself. */
  }
  return undefined
}

export function serializeDiskHistory(revisions: NoteRevision[]) {
  return `${JSON.stringify({ format: 'devnotes-history', version: 1, revisions })}\n`
}

export function historyPath(id: string) {
  return `.devnotes/history/${id}.json`
}

export function parentPath(path: string) {
  const index = path.lastIndexOf('/')
  return index < 0 ? '' : path.slice(0, index)
}

export function baseName(path: string) {
  return path.slice(path.lastIndexOf('/') + 1)
}

export function childPath(directory: string, name: string) {
  return directory ? `${directory}/${name}` : name
}

function visibleCharacters(value: string) {
  return [...value]
    .map((character) => (character.charCodeAt(0) < 32 ? ' ' : character))
    .join('')
}

function diskName(name: string, fallback: string) {
  const base = visibleCharacters(name.normalize('NFC'))
    .replace(/[/\\:*?"<>|]/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^\.+/, '')
    .slice(0, 100)
    .trim()
  return base && base !== 'node_modules' ? base : fallback
}

/** Builds a readable Markdown filename that keeps accents and spaces from the title. */
export function diskFilename(title: string) {
  return `${diskName(title, 'Documento sem título')}.md`
}

export function diskFolderName(name: string) {
  return diskName(name, 'Pasta sem nome')
}

export function validateDiskFolderName(name: string) {
  const trimmed = name.trim()
  if (
    !trimmed ||
    trimmed.length > 100 ||
    /[/\\]/.test(trimmed) ||
    trimmed.startsWith('.') ||
    trimmed === 'node_modules' ||
    [...trimmed].some((character) => character.charCodeAt(0) < 32)
  )
    throw new WorkspaceError(
      'Digite um nome de pasta com até 100 caracteres, sem barras e sem começar com ponto.',
    )
  return trimmed
}

/** Returns a sibling path that is not taken, adding " (2)", " (3)"… before the extension. */
export function availablePath(
  taken: Iterable<string>,
  directory: string,
  name: string,
) {
  const used = new Set(
    [...taken].map((path) => path.toLocaleLowerCase('pt-BR')),
  )
  const extension = /\.(md|markdown|pdf)$/i.exec(name)?.[0] ?? ''
  const stem = extension ? name.slice(0, -extension.length) : name
  let candidate = childPath(directory, name)
  for (let index = 2; used.has(candidate.toLocaleLowerCase('pt-BR')); index++)
    candidate = childPath(directory, `${stem} (${index})${extension}`)
  return candidate
}

export function repath(path: string, from: string, to: string) {
  if (path === from) return to
  if (path.startsWith(`${from}/`)) return `${to}${path.slice(from.length)}`
  return path
}

export interface DiskModel {
  notes: Note[]
  folders: WorkspaceFolder[]
  pdfs: Note[]
  paths: Map<string, string>
  files: Map<string, { raw: string; version: string }>
  history: Map<string, NoteRevision[] | undefined>
  metadata: DiskMetadata
  metadataChanged: boolean
}

/** Maps a folder scan onto the workspace model, keeping identifiers stable through metadata. */
export function buildDiskModel(snapshot: DiskSnapshot): DiskModel {
  const stored = parseDiskMetadata(snapshot.metadata)
  const byPath = new Map<string, DiskItem>()
  for (const item of stored.items)
    if (!byPath.has(item.path)) byPath.set(item.path, item)
  const usedIds = new Set<string>()
  const items: DiskItem[] = []
  const paths = new Map<string, string>()
  const itemFor = (path: string) => {
    const known = byPath.get(path)
    const id = known && !usedIds.has(known.id) ? known.id : crypto.randomUUID()
    usedIds.add(id)
    const item: DiskItem = { ...known, id, path }
    items.push(item)
    paths.set(id, path)
    return item
  }

  const folders: WorkspaceFolder[] = []
  const folderIds = new Map<string, string>()
  const protectedFolders = new Map<string, string>()
  for (const entry of snapshot.entries) {
    if (entry.kind !== 'directory') continue
    const item = itemFor(entry.path)
    const parentId = folderIds.get(parentPath(entry.path))
    folderIds.set(entry.path, item.id)
    if (item.protection) protectedFolders.set(entry.path, item.id)
    folders.push({
      id: item.id,
      name: baseName(entry.path),
      ...(parentId ? { parentId } : {}),
      ...(item.protection ? { protection: item.protection } : {}),
    })
  }

  const protectionOwner = (path: string) => {
    for (
      let directory = parentPath(path);
      directory;
      directory = parentPath(directory)
    ) {
      const owner = protectedFolders.get(directory)
      if (owner) return owner
    }
    return undefined
  }

  const notes: Note[] = []
  const pdfs: Note[] = []
  const files = new Map<string, { raw: string; version: string }>()
  const history = new Map<string, NoteRevision[] | undefined>()
  for (const entry of snapshot.entries) {
    if (entry.kind === 'directory') continue
    const item = itemFor(entry.path)
    const folderId = folderIds.get(parentPath(entry.path))
    if (entry.kind === 'pdf') {
      pdfs.push({
        id: item.id,
        title: pdfTitle(baseName(entry.path)),
        content: '',
        mediaType: 'pdf',
        sourcePath: entry.path,
        ...(folderId ? { folderId } : {}),
      })
      continue
    }
    const parsed = parseMarkdownFile(baseName(entry.path), entry.raw)
    const note: Note = {
      id: item.id,
      ...parsed,
      ...(folderId ? { folderId } : {}),
      ...(item.favorite ? { favorite: true } : {}),
    }
    if (note.protection)
      note.protection = {
        ...note.protection,
        ownerId: protectionOwner(entry.path) ?? note.id,
      }
    const revisions = parseDiskHistory(snapshot.history[item.id])
    history.set(item.id, revisions)
    if (revisions && !note.protection) note.revisions = revisions
    files.set(item.id, { raw: entry.raw, version: entry.version })
    notes.push(note)
  }

  for (const entry of stored.trash) {
    const parentId = folderIds.get(parentPath(entry.path))
    const trashed = {
      id: entry.id,
      deletedAt: entry.deletedAt,
      trashBatchId: entry.batch,
    }
    if (entry.kind === 'note')
      notes.push({
        ...trashed,
        title: entry.name,
        content: '',
        ...(parentId ? { folderId: parentId } : {}),
      })
    else
      folders.push({
        ...trashed,
        name: entry.name,
        ...(parentId ? { parentId } : {}),
      })
  }

  const metadata: DiskMetadata = { ...stored, items }
  return {
    notes,
    folders,
    pdfs,
    paths,
    files,
    history,
    metadata,
    metadataChanged:
      serializeDiskMetadata(metadata) !== serializeDiskMetadata(stored),
  }
}
