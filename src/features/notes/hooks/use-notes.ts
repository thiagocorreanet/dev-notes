import { applyWorkspaceAction, recordRevision } from '../workspace-actions'
import type { WorkspaceAction } from '../workspace-actions'
import { remapNoteLinks } from '../note-links'
import { WorkspaceError } from '../workspace-error'
import { useRef, useState } from 'react'
import {
  loadWorkspace,
  persistWorkspace,
  WORKSPACE_KEY,
} from '../workspace-storage'
import type { Note, Workspace, WorkspaceFolder } from '../types'

export function useNotes() {
  const [state, setState] = useState(loadWorkspace)
  const current = useRef(state.workspace)

  function commit(workspace: Workspace) {
    current.current = workspace
    const saved = persistWorkspace(workspace)
    setState({
      workspace,
      error: saved
        ? null
        : 'Não foi possível salvar neste navegador. Seus documentos continuam abertos; baixe uma cópia antes de sair.',
    })
    return saved
  }

  function saveNote(note: Note, forceRevision = false) {
    const workspace = current.current
    const previous = workspace.notes.find((item) => item.id === note.id)
    const savedNote = previous
      ? recordRevision(previous, note, forceRevision)
      : note
    return commit({
      ...workspace,
      notes: previous
        ? workspace.notes.map((item) =>
            item.id === note.id ? savedNote : item,
          )
        : [note, ...workspace.notes],
    })
  }

  function addNote(title: string, content: string, folderId?: string) {
    const note: Note = {
      id: crypto.randomUUID(),
      title: title.trim(),
      content: content.trim(),
      ...(folderId ? { folderId } : {}),
    }
    saveNote(note)
    return note
  }

  function addFolder(name: string, parentId?: string) {
    const workspace = current.current
    if (
      workspace.folders.some(
        (folder) =>
          !folder.deletedAt &&
          folder.parentId === parentId &&
          folder.name.toLowerCase() === name.trim().toLowerCase(),
      )
    ) {
      throw new WorkspaceError('Já existe uma pasta com esse nome neste local.')
    }
    const folder: WorkspaceFolder = {
      id: crypto.randomUUID(),
      name: name.trim(),
      ...(parentId ? { parentId } : {}),
    }
    commit({ ...workspace, folders: [...workspace.folders, folder] })
    return folder
  }

  function mergeWorkspace(incoming: Workspace) {
    const workspace = current.current
    const ids = new Map(
      [...incoming.folders, ...incoming.notes].map((item) => [
        item.id,
        crypto.randomUUID(),
      ]),
    )
    const folders = incoming.folders.map((folder) => ({
      ...folder,
      id: ids.get(folder.id)!,
      ...(folder.parentId ? { parentId: ids.get(folder.parentId)! } : {}),
    }))
    const notes = incoming.notes.map((note) => ({
      ...note,
      content: remapNoteLinks(note.content, ids),
      ...(note.revisions
        ? {
            revisions: note.revisions.map((revision) => ({
              ...revision,
              content: remapNoteLinks(revision.content, ids),
            })),
          }
        : {}),
      id: ids.get(note.id)!,
      ...(note.folderId ? { folderId: ids.get(note.folderId)! } : {}),
    }))
    commit({
      ...workspace,
      suppressedExampleIds: [
        ...new Set([
          ...(workspace.suppressedExampleIds ?? []),
          ...(incoming.suppressedExampleIds ?? []),
        ]),
      ],
      folders: [...workspace.folders, ...folders],
      notes: [...notes, ...workspace.notes],
    })
    return { notes, folders }
  }

  function importFolder(notes: Note[], folders: WorkspaceFolder[]) {
    const workspace = current.current
    commit({
      ...workspace,
      notes: [...notes, ...workspace.notes],
      folders: [...workspace.folders, ...folders],
    })
  }

  function saveAll(notes: Note[]) {
    const workspace = {
      ...current.current,
      notes: [
        ...notes,
        ...current.current.notes.filter(
          (note) =>
            note.deletedAt && !notes.some((value) => value.id === note.id),
        ),
      ],
    }
    commit(workspace)
    return workspace
  }

  function runAction(action: WorkspaceAction) {
    return commit(applyWorkspaceAction(current.current, action))
  }

  function restoreRevision(id: string, revisionId: string) {
    const note = current.current.notes.find((item) => item.id === id)
    const revision = note?.revisions?.find((item) => item.id === revisionId)
    if (!note || !revision)
      throw new WorkspaceError('Esta versão não está mais disponível.')
    return saveNote(
      { ...note, title: revision.title, content: revision.content },
      true,
    )
  }

  function replaceFromBackup(
    workspace: Workspace,
    expectedStored: string | null,
  ) {
    if (localStorage.getItem(WORKSPACE_KEY) !== expectedStored)
      throw new WorkspaceError(
        'O espaço de trabalho mudou em outra aba. Abra o backup novamente para conferir a importação.',
      )
    if (!persistWorkspace(workspace))
      throw new WorkspaceError(
        'Não há espaço disponível para importar o backup. Seus documentos atuais foram mantidos.',
      )
    current.current = workspace
    setState({ workspace, error: null })
  }

  return {
    replaceFromBackup,
    runAction,
    restoreRevision,
    suppressedExampleIds: state.workspace.suppressedExampleIds ?? [],
    notes: state.workspace.notes,
    folders: state.workspace.folders,
    workspaceName: state.workspace.name,
    error: state.error,
    saveNote,
    addNote,
    addFolder,
    importFolder,
    saveAll,
    mergeWorkspace,
  }
}
