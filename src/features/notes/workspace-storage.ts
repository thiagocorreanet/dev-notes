import { WorkspaceError } from './workspace-error'
import { isNote, loadNotes, validTimestamp } from './storage'
import type { Workspace, WorkspaceFolder } from './types'

export const WORKSPACE_KEY = 'dev-notes:workspace:v1'

export function emptyWorkspace(): Workspace {
  return {
    format: 'dev-notes-workspace',
    version: 1,
    name: 'Espaço de trabalho',
    notes: [],
    folders: [],
  }
}

function isFolder(value: unknown): value is WorkspaceFolder {
  return (
    typeof value === 'object' &&
    value !== null &&
    'id' in value &&
    typeof value.id === 'string' &&
    'name' in value &&
    typeof value.name === 'string' &&
    !!value.name.trim() &&
    (!('parentId' in value) || typeof value.parentId === 'string') &&
    (!('deletedAt' in value) || validTimestamp(value.deletedAt)) &&
    (!('trashBatchId' in value) || typeof value.trashBatchId === 'string')
  )
}

export function parseWorkspace(json: string): Workspace {
  let value: unknown
  try {
    value = JSON.parse(json)
  } catch {
    throw new WorkspaceError(
      'Não foi possível ler o backup. Selecione um arquivo JSON válido do DevNotes.',
    )
  }
  if (
    typeof value !== 'object' ||
    value === null ||
    !('format' in value) ||
    value.format !== 'dev-notes-workspace' ||
    !('version' in value) ||
    value.version !== 1 ||
    !('name' in value) ||
    typeof value.name !== 'string' ||
    !('notes' in value) ||
    !Array.isArray(value.notes) ||
    !value.notes.every(isNote) ||
    !('folders' in value) ||
    !Array.isArray(value.folders) ||
    !value.folders.every(isFolder) ||
    ('suppressedExampleIds' in value &&
      (!Array.isArray(value.suppressedExampleIds) ||
        !value.suppressedExampleIds.every((id) => typeof id === 'string')))
  ) {
    throw new WorkspaceError('Este arquivo não é um backup válido do DevNotes.')
  }
  const { notes, folders } = value
  const ids = [
    ...notes.map((note) => note.id),
    ...folders.map((folder) => folder.id),
  ]
  if (ids.some((id) => !id) || new Set(ids).size !== ids.length) {
    throw new WorkspaceError(
      'O backup contém documentos ou pastas com identificadores repetidos ou vazios.',
    )
  }
  const byId = new Map(folders.map((folder) => [folder.id, folder]))
  for (const folder of folders) {
    const visited = new Set([folder.id])
    let parent = folder.parentId
    while (parent !== undefined) {
      if (visited.has(parent) || !byId.has(parent))
        throw new WorkspaceError('A estrutura de pastas do backup é inválida.')
      visited.add(parent)
      parent = byId.get(parent)?.parentId
    }
  }
  if (
    notes.some(
      (note) => note.folderId !== undefined && !byId.has(note.folderId),
    )
  ) {
    throw new WorkspaceError(
      'Uma página do backup pertence a uma pasta que não existe.',
    )
  }
  return {
    format: 'dev-notes-workspace',
    version: 1,
    name: value.name,
    ...('suppressedExampleIds' in value
      ? { suppressedExampleIds: value.suppressedExampleIds as string[] }
      : {}),
    notes,
    folders,
  }
}

export function loadWorkspace(): {
  workspace: Workspace
  error: string | null
} {
  try {
    const stored = localStorage.getItem(WORKSPACE_KEY)
    if (stored !== null)
      return { workspace: parseWorkspace(stored), error: null }
    const legacy = loadNotes()
    return {
      workspace: { ...emptyWorkspace(), notes: legacy.notes },
      error: legacy.error,
    }
  } catch {
    return {
      workspace: emptyWorkspace(),
      error:
        'Não foi possível recuperar o espaço de trabalho. Ao salvar, você substituirá os dados guardados neste navegador.',
    }
  }
}

export function persistWorkspace(workspace: Workspace): boolean {
  try {
    localStorage.setItem(WORKSPACE_KEY, JSON.stringify(workspace))
    return true
  } catch {
    return false
  }
}
