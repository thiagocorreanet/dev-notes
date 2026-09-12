import type { Note, Workspace, WorkspaceFolder } from './types'
import { remapNoteLinks } from './note-links'
import { WorkspaceError } from './workspace-error'

export type WorkspaceTarget = { kind: 'note' | 'folder'; id: string }
export type WorkspaceAction = WorkspaceTarget &
  (
    | { type: 'rename'; name: string }
    | { type: 'move'; parentId: string | undefined }
    | { type: 'duplicate'; newId: string }
    | { type: 'trash' | 'restore' | 'purge' | 'favorite' }
  )

export function descendantFolderIds(folders: WorkspaceFolder[], id: string) {
  const ids = new Set([id])
  let changed = true
  while (changed) {
    changed = false
    for (const folder of folders) {
      if (folder.parentId && ids.has(folder.parentId) && !ids.has(folder.id)) {
        ids.add(folder.id)
        changed = true
      }
    }
  }
  return ids
}

function validName(name: string, folder: boolean) {
  const trimmed = name.trim()
  if (
    !trimmed ||
    trimmed.length > 100 ||
    (folder && (/[/\\]/.test(trimmed) || trimmed === '.' || trimmed === '..'))
  )
    throw new WorkspaceError(
      folder
        ? 'Digite um nome de pasta válido, com até 100 caracteres e sem barras.'
        : 'Digite um título com até 100 caracteres.',
    )
  return trimmed
}

function checkDestination(workspace: Workspace, parentId?: string) {
  if (
    parentId &&
    !workspace.folders.some(
      (folder) => folder.id === parentId && !folder.deletedAt,
    )
  )
    throw new WorkspaceError('A pasta de destino não está disponível.')
}

function availableFolderName(
  workspace: Workspace,
  name: string,
  parentId?: string,
  exceptId?: string,
) {
  if (
    workspace.folders.some(
      (folder) =>
        !folder.deletedAt &&
        folder.id !== exceptId &&
        folder.parentId === parentId &&
        folder.name.toLocaleLowerCase('pt-BR') ===
          name.toLocaleLowerCase('pt-BR'),
    )
  )
    throw new WorkspaceError('Já existe uma pasta com esse nome neste local.')
}

export function recordRevision(
  previous: Note,
  next: Note,
  force = false,
  now = new Date().toISOString(),
): Note {
  if (previous.title === next.title && previous.content === next.content)
    return next
  const revisions = previous.revisions ?? []
  // Group consecutive typing into a one-minute recovery point; always preserve pre-restore content.
  if (
    !force &&
    revisions[0] &&
    Date.parse(now) >= Date.parse(revisions[0].createdAt) &&
    Date.parse(now) - Date.parse(revisions[0].createdAt) < 60_000
  )
    return { ...next, revisions }
  return {
    ...next,
    revisions: [
      {
        id: crypto.randomUUID(),
        title: previous.title,
        content: previous.content,
        createdAt: now,
      },
      ...revisions,
    ].slice(0, 30),
  }
}

export function applyWorkspaceAction(
  workspace: Workspace,
  action: WorkspaceAction,
): Workspace {
  const note = workspace.notes.find((item) => item.id === action.id)
  const folder = workspace.folders.find((item) => item.id === action.id)
  const item = action.kind === 'note' ? note : folder
  if (!item) throw new WorkspaceError('Este item não está mais disponível.')
  if (action.type !== 'restore' && action.type !== 'purge' && item.deletedAt)
    throw new WorkspaceError(
      'Restaure este item da lixeira antes de alterá-lo.',
    )
  const updateNote = (next: Note) => ({
    ...workspace,
    notes: workspace.notes.map((value) =>
      value.id === action.id ? next : value,
    ),
  })
  const updateFolder = (next: WorkspaceFolder) => ({
    ...workspace,
    folders: workspace.folders.map((value) =>
      value.id === action.id ? next : value,
    ),
  })
  if (action.type === 'rename') {
    const name = validName(action.name, action.kind === 'folder')
    if (note && action.kind === 'note')
      return updateNote(recordRevision(note, { ...note, title: name }, true))
    if (folder) {
      availableFolderName(workspace, name, folder.parentId, folder.id)
      return updateFolder({ ...folder, name })
    }
  }
  if (action.type === 'move') {
    checkDestination(workspace, action.parentId)
    if (note && action.kind === 'note') {
      const next = { ...note }
      delete next.folderId
      if (action.parentId) next.folderId = action.parentId
      return updateNote(next)
    }
    if (folder) {
      if (
        action.parentId &&
        descendantFolderIds(workspace.folders, folder.id).has(action.parentId)
      )
        throw new WorkspaceError(
          'Uma pasta não pode ficar dentro dela mesma ou de uma de suas subpastas.',
        )
      availableFolderName(workspace, folder.name, action.parentId, folder.id)
      const next = { ...folder }
      delete next.parentId
      if (action.parentId) next.parentId = action.parentId
      return updateFolder(next)
    }
  }
  if (action.type === 'favorite' && note && action.kind === 'note')
    return updateNote({ ...note, favorite: !note.favorite })
  if (action.type === 'duplicate') {
    if (
      !action.newId ||
      [...workspace.notes, ...workspace.folders].some(
        (value) => value.id === action.newId,
      )
    )
      throw new WorkspaceError(
        'Não foi possível criar uma cópia com esse identificador.',
      )
    if (note && action.kind === 'note') {
      const copy: Note = {
        id: action.newId,
        title: `${note.title || 'Documento sem título'} (cópia)`.slice(0, 100),
        content: note.content,
        ...(note.folderId ? { folderId: note.folderId } : {}),
      }
      return { ...workspace, notes: [copy, ...workspace.notes] }
    }
    if (folder) {
      const descendants = descendantFolderIds(
        workspace.folders.filter((value) => !value.deletedAt),
        folder.id,
      )
      const copies = workspace.folders.filter(
        (value) => descendants.has(value.id) && !value.deletedAt,
      )
      const ids = new Map(
        copies.map((value) => [
          value.id,
          value.id === folder.id ? action.newId : crypto.randomUUID(),
        ]),
      )
      let index = 1
      let name = `${folder.name.slice(0, 80)} (cópia)`
      while (
        workspace.folders.some(
          (value) =>
            !value.deletedAt &&
            value.parentId === folder.parentId &&
            value.name === name,
        )
      )
        name = `${folder.name.slice(0, 80)} (cópia ${++index})`
      const folders = copies.map((value) => {
        const copy = {
          ...value,
          id: ids.get(value.id)!,
          name: value.id === folder.id ? name : value.name,
        }
        if (value.parentId && ids.has(value.parentId))
          copy.parentId = ids.get(value.parentId)!
        return copy
      })
      const sourceNotes = workspace.notes.filter(
        (value) =>
          !value.deletedAt && value.folderId && descendants.has(value.folderId),
      )
      for (const note of sourceNotes) ids.set(note.id, crypto.randomUUID())
      const notes = sourceNotes.map((value) => ({
        id: ids.get(value.id)!,
        title: value.title,
        content: remapNoteLinks(value.content, ids),
        folderId: ids.get(value.folderId!)!,
      }))
      return {
        ...workspace,
        folders: [...workspace.folders, ...folders],
        notes: [...notes, ...workspace.notes],
      }
    }
  }
  const affected =
    action.kind === 'folder'
      ? descendantFolderIds(workspace.folders, action.id)
      : new Set<string>()
  const includesNote = (value: Note) =>
    action.kind === 'note'
      ? value.id === action.id
      : !!value.folderId && affected.has(value.folderId)
  if (action.type === 'trash') {
    const deletedAt = new Date().toISOString()
    const trashBatchId = crypto.randomUUID()
    return {
      ...workspace,
      notes: workspace.notes.map((value) =>
        includesNote(value) && !value.deletedAt
          ? { ...value, deletedAt, trashBatchId }
          : value,
      ),
      folders: workspace.folders.map((value) =>
        affected.has(value.id) && !value.deletedAt
          ? { ...value, deletedAt, trashBatchId }
          : value,
      ),
    }
  }
  if (action.type === 'restore') {
    const parents = new Set<string>()
    let parent = action.kind === 'note' ? note?.folderId : folder?.parentId
    while (parent && !parents.has(parent)) {
      parents.add(parent)
      parent = workspace.folders.find((value) => value.id === parent)?.parentId
    }
    const restore = <T extends Note | WorkspaceFolder>(value: T): T => {
      const next = { ...value }
      delete next.deletedAt
      delete next.trashBatchId
      return next
    }
    const folders = workspace.folders.map((value) =>
      parents.has(value.id) ||
      (affected.has(value.id) && value.trashBatchId === item.trashBatchId)
        ? restore(value)
        : { ...value },
    )
    // Give restored folders an available name when their original location now has a namesake.
    const used = new Set<string>()
    for (const value of [
      ...folders.filter(
        (value) =>
          !workspace.folders.find((old) => old.id === value.id)?.deletedAt,
      ),
      ...folders.filter(
        (value) =>
          workspace.folders.find((old) => old.id === value.id)?.deletedAt,
      ),
    ]) {
      if (value.deletedAt) continue
      const base = value.name.slice(0, 75)
      let index = 1
      while (
        used.has(
          `${value.parentId ?? ''}/${value.name.toLocaleLowerCase('pt-BR')}`,
        )
      )
        value.name = `${base} (restaurada ${index++})`
      used.add(
        `${value.parentId ?? ''}/${value.name.toLocaleLowerCase('pt-BR')}`,
      )
    }
    return {
      ...workspace,
      folders,
      notes: workspace.notes.map((value) =>
        includesNote(value) &&
        (action.kind === 'note' || value.trashBatchId === item.trashBatchId)
          ? restore(value)
          : { ...value },
      ),
    }
  }
  if (action.type === 'purge') {
    if (!item.deletedAt)
      throw new WorkspaceError(
        'Envie o item para a lixeira antes de excluir definitivamente.',
      )
    const removed = workspace.notes.filter(includesNote)
    return {
      ...workspace,
      notes: workspace.notes.filter((value) => !includesNote(value)),
      folders: workspace.folders.filter((value) => !affected.has(value.id)),
      suppressedExampleIds: [
        ...new Set([
          ...(workspace.suppressedExampleIds ?? []),
          ...removed
            .filter((value) => value.id.startsWith('example-'))
            .map((value) => value.id),
        ]),
      ],
    }
  }
  return workspace
}
