import type { Note } from './types'

const STORAGE_KEY = 'dev-notes:notes:v1'

export function validTimestamp(value: unknown): value is string {
  return typeof value === 'string' && Number.isFinite(Date.parse(value))
}

export function isNote(value: unknown): value is Note {
  return (
    typeof value === 'object' &&
    value !== null &&
    'id' in value &&
    typeof value.id === 'string' &&
    'title' in value &&
    typeof value.title === 'string' &&
    'content' in value &&
    typeof value.content === 'string' &&
    (!('folderId' in value) || typeof value.folderId === 'string') &&
    (!('sourcePath' in value) || typeof value.sourcePath === 'string') &&
    (!('favorite' in value) || typeof value.favorite === 'boolean') &&
    (!('deletedAt' in value) || validTimestamp(value.deletedAt)) &&
    (!('trashBatchId' in value) || typeof value.trashBatchId === 'string') &&
    (!('revisions' in value) ||
      (Array.isArray(value.revisions) &&
        value.revisions.length <= 30 &&
        value.revisions.every(
          (revision: unknown) =>
            typeof revision === 'object' &&
            revision !== null &&
            'id' in revision &&
            typeof revision.id === 'string' &&
            'title' in revision &&
            typeof revision.title === 'string' &&
            'content' in revision &&
            typeof revision.content === 'string' &&
            'createdAt' in revision &&
            validTimestamp(revision.createdAt),
        )))
  )
}

export function loadNotes(): { notes: Note[]; error: string | null } {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored === null) return { notes: [], error: null }
    const parsed: unknown = JSON.parse(stored)
    if (!Array.isArray(parsed) || !parsed.every(isNote)) {
      throw new Error('Invalid notes format.')
    }
    return { notes: parsed, error: null }
  } catch {
    return {
      notes: [],
      error:
        'Não foi possível recuperar suas notas neste navegador. Ao salvar uma nota, você substituirá os dados guardados nele.',
    }
  }
}

export function saveNotes(notes: Note[]): boolean {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(notes))
    return true
  } catch {
    return false
  }
}
