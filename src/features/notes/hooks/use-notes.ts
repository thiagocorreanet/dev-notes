import { applyWorkspaceAction, recordRevision } from '../workspace-actions'
import type { WorkspaceAction } from '../workspace-actions'
import { WorkspaceError } from '../workspace-error'
import { useRef, useState } from 'react'
import { loadWorkspace, persistWorkspace } from '../workspace-storage'
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

  function importFolder(notes: Note[], folders: WorkspaceFolder[]) {
    const workspace = current.current
    commit({
      ...workspace,
      notes: [...notes, ...workspace.notes],
      folders: [...workspace.folders, ...folders],
    })
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

  return {
    runAction,
    restoreRevision,
    suppressedExampleIds: state.workspace.suppressedExampleIds ?? [],
    notes: state.workspace.notes,
    folders: state.workspace.folders,
    error: state.error,
    saveNote,
    addNote,
    addFolder,
    importFolder,
  }
}
