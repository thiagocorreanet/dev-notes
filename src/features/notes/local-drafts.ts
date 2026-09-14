import type { Note } from './types'
import type { LocalDocument } from './local-document'

const PREFIX = 'devnotes:local-draft:v1:'
export interface LocalDraft {
  key: string
  serialized: string
  savedAt: string
  note: Pick<Note, 'title' | 'content'>
  disk: LocalDocument
}

export function draftKey(path: string, writer: string) {
  return `${PREFIX}${encodeURIComponent(path)}:${writer}`
}

export function readLocalDrafts(path: string): LocalDraft[] {
  const drafts: LocalDraft[] = []
  for (let index = 0; index < localStorage.length; index++) {
    const key = localStorage.key(index)
    if (!key?.startsWith(`${PREFIX}${encodeURIComponent(path)}:`)) continue
    const serialized = localStorage.getItem(key)
    if (!serialized) continue
    try {
      const value: unknown = JSON.parse(serialized)
      if (!value || typeof value !== 'object') continue
      const record = value as Partial<LocalDraft>
      if (
        !record.note ||
        typeof record.note.title !== 'string' ||
        typeof record.note.content !== 'string' ||
        !record.disk ||
        record.disk.path !== path ||
        typeof record.disk.name !== 'string' ||
        typeof record.disk.raw !== 'string' ||
        typeof record.disk.version !== 'string' ||
        typeof record.savedAt !== 'string' ||
        !Number.isFinite(Date.parse(record.savedAt))
      )
        continue
      drafts.push({
        key,
        serialized,
        note: record.note,
        disk: record.disk,
        savedAt: record.savedAt,
      })
    } catch {
      /* Keep unreadable entries untouched; they might be recoverable externally. */
    }
  }
  return drafts.sort(
    (left, right) => Date.parse(right.savedAt) - Date.parse(left.savedAt),
  )
}

export function persistLocalDraft(
  note: Note,
  disk: LocalDocument,
  writer: string,
) {
  localStorage.setItem(
    draftKey(disk.path, writer),
    JSON.stringify({
      note: { title: note.title, content: note.content },
      disk,
      savedAt: new Date().toISOString(),
    }),
  )
}

export function discardLocalDraft(draft: LocalDraft) {
  // Another tab may have continued editing since this recovery option was loaded.
  if (localStorage.getItem(draft.key) === draft.serialized)
    localStorage.removeItem(draft.key)
}

export function clearLocalDrafts(path: string) {
  const prefix = `${PREFIX}${encodeURIComponent(path)}:`
  const keys: string[] = []
  for (let index = 0; index < localStorage.length; index++) {
    const key = localStorage.key(index)
    if (key?.startsWith(prefix)) keys.push(key)
  }
  for (const key of keys) localStorage.removeItem(key)
}
