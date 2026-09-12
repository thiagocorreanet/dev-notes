import { parseWorkspace } from './workspace-storage'
import { WorkspaceError } from './workspace-error'
import { remapNoteLinks } from './note-links'
import type { Workspace } from './types'

export type BackupMode = 'merge' | 'replace'
export const MAX_BACKUP_BYTES = 20 * 1024 * 1024

export async function readWorkspaceBackup(file: File) {
  if (!/\.json$/i.test(file.name))
    throw new WorkspaceError('Selecione um backup JSON do DevNotes.')
  if (file.size > MAX_BACKUP_BYTES)
    throw new WorkspaceError('O backup pode ter até 20 MB.')
  const text = await file.text()
  let data: unknown
  try {
    data = JSON.parse(text)
  } catch {
    throw new WorkspaceError('O arquivo não contém um JSON válido.')
  }
  if (
    data &&
    typeof data === 'object' &&
    'notes' in data &&
    Array.isArray(data.notes) &&
    'folders' in data &&
    Array.isArray(data.folders) &&
    data.notes.length + data.folders.length > 2000
  )
    throw new WorkspaceError(
      'O backup pode conter até 2.000 documentos e pastas.',
    )
  return parseWorkspace(text)
}

export function prepareWorkspaceBackup(
  current: Workspace,
  incoming: Workspace,
  mode: BackupMode,
  exampleIds: string[],
): Workspace {
  // New identifiers keep imported copies separate from live file permissions.
  const ids = new Map(
    [...incoming.notes, ...incoming.folders].map((item) => [
      item.id,
      crypto.randomUUID(),
    ]),
  )
  const batches = new Map(
    [...incoming.notes, ...incoming.folders].flatMap((item) =>
      item.trashBatchId
        ? [[item.trashBatchId, crypto.randomUUID()] as const]
        : [],
    ),
  )
  const groupId = crypto.randomUUID()
  const groupBase = `Backup: ${incoming.name || 'Espaço de trabalho'}`
  let groupName = groupBase
  for (
    let suffix = 2;
    current.folders.some(
      (folder) => !folder.parentId && folder.name === groupName,
    );
    suffix++
  )
    groupName = `${groupBase} (${suffix})`
  const folders = incoming.folders.map((folder) => ({
    ...folder,
    id: ids.get(folder.id)!,
    ...(folder.parentId
      ? { parentId: ids.get(folder.parentId)! }
      : mode === 'merge'
        ? { parentId: groupId }
        : {}),
    ...(folder.trashBatchId
      ? { trashBatchId: batches.get(folder.trashBatchId)! }
      : {}),
  }))
  const notes = incoming.notes.map((note) => {
    const copy = { ...note }
    delete copy.sourcePath
    return {
      ...copy,
      id: ids.get(note.id)!,
      content: remapNoteLinks(note.content, ids),
      ...(note.folderId
        ? { folderId: ids.get(note.folderId)! }
        : mode === 'merge'
          ? { folderId: groupId }
          : {}),
      ...(note.trashBatchId
        ? { trashBatchId: batches.get(note.trashBatchId)! }
        : {}),
      ...(note.revisions
        ? {
            revisions: note.revisions.map((revision) => ({
              ...revision,
              content: remapNoteLinks(revision.content, ids),
            })),
          }
        : {}),
    }
  })
  return {
    format: 'dev-notes-workspace',
    version: 1,
    name: mode === 'replace' ? incoming.name : current.name,
    suppressedExampleIds: [
      ...new Set([
        ...exampleIds,
        ...(current.suppressedExampleIds ?? []),
        ...(incoming.suppressedExampleIds ?? []),
      ]),
    ],
    folders:
      mode === 'replace'
        ? folders
        : [...current.folders, { id: groupId, name: groupName }, ...folders],
    notes: mode === 'replace' ? notes : [...current.notes, ...notes],
  }
}
