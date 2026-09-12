import { applyWorkspaceAction } from '../workspace-actions'
import { prepareWorkspaceBackup } from '../workspace-backup'
import type { BackupMode } from '../workspace-backup'
import type { Workspace } from '../types'
import { emptyWorkspace } from '../workspace-storage'
import { useLocalDocuments } from './use-local-documents'
import { loadTabs, TABS_KEY } from '../workspace-tabs'
import type { WorkspaceAction } from '../workspace-actions'
import { WorkspaceError } from '../workspace-error'
import { useEffect, useRef, useState } from 'react'
import { exampleNotes } from '../example-notes'
import type { Note } from '../types'
import {
  downloadFile,
  importDirectory,
  importFileList,
  readMarkdownFile,
} from '../workspace-files'
import type { FileSource, ImportedFolder } from '../workspace-files'
import { useNotes } from './use-notes'
import { useLocalFolder } from './use-local-folder'

export function useWorkspace() {
  const store = useNotes()
  const [drafts, setDrafts] = useState<Note[]>([])
  const [initialTabs] = useState(loadTabs)
  const [activeId, setActiveId] = useState<string | null>(initialTabs.activeId)
  const [openIds, setOpenIds] = useState(initialTabs.ids)
  const [selectedFolder, setSelectedFolder] = useState<string | undefined>()
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(
    () => new Set(),
  )
  const [query, setQuery] = useState('')
  const [mode, setMode] = useState('read')
  const [dialog, setDialog] = useState<'page' | 'folder' | null>(null)
  const [refreshConfirmation, setRefreshConfirmation] = useState<Note | null>(
    null,
  )
  const [saveFeedback, setSaveFeedback] = useState<{
    note: Pick<Note, 'id' | 'title' | 'content'>
    phase: 'saving' | 'saved' | 'error'
  } | null>(null)
  const pageSaveInProgress = useRef(false)
  useEffect(() => {
    if (saveFeedback?.phase !== 'saved') return
    const timer = setTimeout(() => setSaveFeedback(null), 2200)
    return () => clearTimeout(timer)
  }, [saveFeedback])
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [actionError, setActionError] = useState<string | null>(null)
  const directoryInput = useRef<HTMLInputElement>(null)
  const refreshInput = useRef<HTMLInputElement>(null)
  const fileInput = useRef<HTMLInputElement>(null)
  const refreshTarget = useRef<Note | null>(null)
  const sources = useRef(new Map<string, FileSource>())
  const localDocuments = useLocalDocuments((id) => {
    setActiveId(id)
    setOpenIds((current) => [...new Set([...current, id])])
    setMode('read')
  })
  const documents = [
    ...localDocuments.notes,
    ...drafts,
    ...store.notes.filter(
      (note) =>
        !note.deletedAt &&
        !localDocuments.has(note.id) &&
        !drafts.some((draft) => draft.id === note.id),
    ),
    ...exampleNotes.filter(
      (example) =>
        !store.notes.some((note) => note.id === example.id) &&
        !store.suppressedExampleIds.includes(example.id),
    ),
  ]
  const activeNote = documents.find((note) => note.id === activeId) ??
    documents[0] ?? { id: 'empty-workspace', title: '', content: '' }
  const isDraft = drafts.some((note) => note.id === activeNote.id)
  const isSaved = store.notes.some((note) => note.id === activeNote.id)

  useEffect(() => {
    if (!drafts.some((note) => note.title || note.content)) return
    function warnBeforeLeaving(event: BeforeUnloadEvent) {
      event.preventDefault()
      event.returnValue = ''
    }
    window.addEventListener('beforeunload', warnBeforeLeaving)
    return () => window.removeEventListener('beforeunload', warnBeforeLeaving)
  }, [drafts])

  const openNotes = [...new Set([...openIds, activeNote.id])].flatMap((id) => {
    const note = documents.find((item) => item.id === id)
    return note ? [note] : []
  })

  const tabsSnapshot = JSON.stringify({
    ids: openNotes.map((note) => note.id),
    activeId: activeNote.id,
  })
  useEffect(() => {
    try {
      localStorage.setItem(TABS_KEY, tabsSnapshot)
    } catch {
      /* Document persistence reports storage failures separately. */
    }
  }, [tabsSnapshot])

  function activate(id: string | null) {
    setActiveId(id)
    if (id)
      setOpenIds((current) => [...new Set([...current, activeNote.id, id])])
  }

  function closeTab(id: string) {
    if (openNotes.length < 2) return
    const remaining = openNotes.filter((note) => note.id !== id)
    setOpenIds(remaining.map((note) => note.id))
    if (id === activeNote.id) setActiveId(remaining.at(-1)?.id ?? null)
  }

  function performAction(action: WorkspaceAction) {
    setActionError(null)
    const localResult = localDocuments.notes.length
      ? applyWorkspaceAction(
          {
            ...emptyWorkspace(),
            notes: [
              ...documents,
              ...store.notes.filter((note) => note.deletedAt),
            ],
            folders: store.folders,
          },
          action,
        )
      : null
    if (localResult)
      for (const note of localDocuments.notes) store.saveNote(note)
    const virtual = documents.find((note) => note.id === action.id)
    if (
      action.kind === 'note' &&
      virtual &&
      !store.notes.some((note) => note.id === virtual.id)
    ) {
      store.saveNote(virtual)
      setDrafts((items) => items.filter((note) => note.id !== virtual.id))
    }
    const saved = store.runAction(action)
    if (localResult) localDocuments.reconcile(localResult.notes)
    if (action.type === 'duplicate') {
      if (action.kind === 'note') activate(action.newId)
      else setExpandedFolders((current) => new Set([...current, action.newId]))
    }
    if (action.type === 'trash' || action.type === 'purge') {
      setSelectedFolder(undefined)
      setOpenIds((current) => current.filter((id) => id !== action.id))
    }
    if (action.type === 'move' && action.parentId)
      setExpandedFolders((current) => new Set([...current, action.parentId!]))
    setMessage(saved ? 'Alteração salva neste navegador.' : '')
  }

  function reportError(error: unknown) {
    if (error instanceof DOMException && error.name === 'AbortError') return
    if (error instanceof DOMException) {
      setActionError(
        'Não foi possível acessar o arquivo ou a pasta. Verifique a permissão de acesso e tente abrir novamente.',
      )
      return
    }
    setActionError(
      error instanceof WorkspaceError
        ? error.message
        : 'Não foi possível concluir a ação. Tente novamente.',
    )
  }

  function selectNote(id: string) {
    activate(id)
    setSelectedFolder(documents.find((note) => note.id === id)?.folderId)
  }

  function openSearchResult(id: string) {
    const note = documents.find((document) => document.id === id)
    if (!note) return
    selectNote(id)
    setQuery('')
    setMode('read')
    setExpandedFolders((current) => {
      const next = new Set(current)
      const visited = new Set<string>()
      let folderId = note.folderId
      while (folderId && !visited.has(folderId)) {
        visited.add(folderId)
        next.add(folderId)
        folderId = store.folders.find(
          (folder) => folder.id === folderId,
        )?.parentId
      }
      return next
    })
  }

  function newDocument() {
    const note: Note = { id: crypto.randomUUID(), title: '', content: '' }
    setDrafts((items) => [note, ...items])
    activate(note.id)
    setSelectedFolder(undefined)
    setQuery('')
    setMode('edit')
    setMessage(
      'Documento temporário criado. Salve o espaço de trabalho para guardá-lo.',
    )
  }

  function editNote(note: Note) {
    if (localDocuments.has(note.id)) {
      localDocuments.edit(note)
      return
    }
    if (drafts.some((draft) => draft.id === note.id)) {
      setDrafts((items) =>
        items.map((item) => (item.id === note.id ? note : item)),
      )
    } else {
      const previous = documents.find((item) => item.id === note.id)
      if (previous && !store.notes.some((item) => item.id === note.id))
        store.saveNote(previous)
      store.saveNote(note)
    }
  }

  async function savePage() {
    if (pageSaveInProgress.current || localDocuments.recovery) return false
    pageSaveInProgress.current = true
    const note = activeNote
    setSaveFeedback({ note, phase: 'saving' })
    setActionError(null)
    try {
      const saved = localDocuments.has(note.id)
        ? await localDocuments.save(note)
        : store.saveNote(note)
      if (saved && !localDocuments.has(note.id)) {
        setDrafts((items) => items.filter((item) => item.id !== note.id))
        setMessage('Página salva neste navegador.')
      }
      setSaveFeedback({ note, phase: saved ? 'saved' : 'error' })
      return saved
    } catch (error) {
      setSaveFeedback({ note, phase: 'error' })
      reportError(error)
      return false
    } finally {
      pageSaveInProgress.current = false
    }
  }

  function createPage(title: string, content: string) {
    const note = store.addNote(title, content, selectedFolder)
    activate(note.id)
    setQuery('')
    setMode('read')
    setDialog(null)
    if (selectedFolder)
      setExpandedFolders((current) => new Set([...current, selectedFolder]))
  }

  function createFolder(name: string) {
    const folder = store.addFolder(name, selectedFolder)
    setExpandedFolders(
      (current) =>
        new Set([
          ...current,
          folder.id,
          ...(selectedFolder ? [selectedFolder] : []),
        ]),
    )
    setSelectedFolder(folder.id)
    setQuery('')
    setDialog(null)
    setMessage(`Pasta "${folder.name}" criada.`)
  }

  function finishImport(result: ImportedFolder) {
    store.importFolder(result.notes, result.folders)
    for (const [id, source] of result.sources) sources.current.set(id, source)
    setExpandedFolders(
      (current) =>
        new Set([...current, ...result.folders.map((folder) => folder.id)]),
    )
    setSelectedFolder(result.folders[0]?.id)
    if (result.notes[0]) activate(result.notes[0].id)
    setQuery('')
    setMessage(
      `Importação concluída: ${result.folders.length} ${result.folders.length === 1 ? 'pasta' : 'pastas'} e ${result.notes.length} ${result.notes.length === 1 ? 'arquivo Markdown' : 'arquivos Markdown'}. Os arquivos originais não foram alterados.`,
    )
  }

  async function openFolder() {
    if (!window.showDirectoryPicker) {
      directoryInput.current?.click()
      return
    }
    setBusy(true)
    setActionError(null)
    try {
      const handle = await window.showDirectoryPicker({ mode: 'read' })
      finishImport(await importDirectory(handle))
    } catch (error) {
      reportError(error)
    } finally {
      setBusy(false)
    }
  }

  async function openFiles(files: File[]) {
    if (!files.length) return
    setBusy(true)
    setActionError(null)
    try {
      finishImport(await importFileList(files))
    } catch (error) {
      reportError(error)
    } finally {
      setBusy(false)
    }
  }

  async function openMarkdownFile(file?: File) {
    if (!file) return
    setBusy(true)
    setActionError(null)
    try {
      const parsed = await readMarkdownFile(file)
      const note = { id: crypto.randomUUID(), ...parsed, sourcePath: file.name }
      store.saveNote(note)
      sources.current.set(note.id, { fileName: file.name, baseline: parsed })
      activate(note.id)
      setSelectedFolder(undefined)
      setQuery('')
      setMode('read')
      setMessage(
        `Arquivo "${file.name}" aberto como cópia no espaço de trabalho.`,
      )
    } catch (error) {
      reportError(error)
    } finally {
      setBusy(false)
    }
  }

  async function openDroppedFiles(files: File[]) {
    if (!files.length) return
    setBusy(true)
    setActionError(null)
    try {
      if (
        files.length > 100 ||
        files.reduce((total, file) => total + file.size, 0) > 20 * 1024 * 1024
      )
        throw new WorkspaceError(
          'Solte até 100 arquivos, com no máximo 20 MB no total.',
        )
      const notes = await Promise.all(
        files.map(async (file) => ({
          id: crypto.randomUUID(),
          ...(await readMarkdownFile(file)),
          sourcePath: file.name,
        })),
      )
      store.importFolder(notes, [])
      for (const note of notes)
        sources.current.set(note.id, {
          fileName: note.sourcePath,
          baseline: note,
        })
      setOpenIds((current) => [
        ...new Set([
          ...current,
          activeNote.id,
          ...notes.map((note) => note.id),
        ]),
      ])
      if (notes[0]) activate(notes[0].id)
      setSelectedFolder(undefined)
      setQuery('')
      setMode('read')
      setMessage(
        `${notes.length} ${notes.length === 1 ? 'arquivo aberto como cópia' : 'arquivos abertos como cópias'}. Os originais não foram alterados.`,
      )
    } catch (error) {
      reportError(error)
    } finally {
      setBusy(false)
    }
  }

  async function applyRefresh(note: Note, file: File) {
    const parsed = await readMarkdownFile(file)
    store.saveNote({ ...note, ...parsed })
    const previous = sources.current.get(note.id)
    sources.current.set(note.id, {
      ...previous,
      fileName: file.name,
      baseline: parsed,
    })
    setMessage(`Arquivo "${file.name}" recarregado do original.`)
  }

  async function refreshFile(note: Note) {
    setRefreshConfirmation(null)
    if (localDocuments.has(note.id)) {
      await localDocuments.reload(note.id)
      return
    }
    const source = sources.current.get(note.id)
    if (!source?.handle) {
      refreshTarget.current = note
      setMessage(
        `Selecione "${source?.fileName ?? note.sourcePath?.split('/').at(-1) ?? 'o arquivo Markdown original'}" para recarregá-lo.`,
      )
      refreshInput.current?.click()
      return
    }
    setBusy(true)
    setActionError(null)
    try {
      await applyRefresh(note, await source.handle.getFile())
    } catch (error) {
      reportError(error)
    } finally {
      setBusy(false)
    }
  }

  function requestRefresh() {
    if (!activeNote.sourcePath) return
    const baseline = sources.current.get(activeNote.id)?.baseline
    if (
      !baseline ||
      baseline.title !== activeNote.title ||
      baseline.content !== activeNote.content
    ) {
      setRefreshConfirmation(activeNote)
    } else void refreshFile(activeNote)
  }

  async function refreshFromSelection(file?: File) {
    const note = refreshTarget.current
    refreshTarget.current = null
    if (!file || !note) return
    setBusy(true)
    setActionError(null)
    try {
      const expectedName =
        sources.current.get(note.id)?.fileName ??
        note.sourcePath?.split('/').at(-1)
      if (file.name !== expectedName)
        throw new WorkspaceError(
          `Selecione o arquivo original "${expectedName ?? 'nome desconhecido'}".`,
        )
      await applyRefresh(note, file)
    } catch (error) {
      reportError(error)
    } finally {
      setBusy(false)
    }
  }

  function saveWorkspace() {
    setActionError(null)
    try {
      const workspace = store.saveAll(documents)
      setDrafts([])
      downloadFile(
        'dev-notes-workspace.json',
        JSON.stringify(workspace, null, 2),
        'application/json',
      )
      setMessage('Backup baixado com todos os documentos e pastas.')
    } catch (error) {
      reportError(error)
    }
  }

  function toggleFolder(id: string, open: boolean) {
    setSelectedFolder(id)
    setExpandedFolders((current) => {
      const next = new Set(current)
      if (open) next.add(id)
      else next.delete(id)
      return next
    })
  }

  const localFolder = useLocalFolder({
    notes: [...documents, ...store.notes.filter((note) => note.deletedAt)],
    folders: store.folders,
    saveNote: (note, forceRevision) => {
      const saved = store.saveNote(note, forceRevision)
      setDrafts((items) => items.filter((item) => item.id !== note.id))
      return saved
    },
    importFolder: store.importFolder,
  })

  function backupSnapshot(): Workspace {
    return {
      ...emptyWorkspace(),
      name: store.workspaceName,
      suppressedExampleIds: store.suppressedExampleIds,
      folders: store.folders,
      notes: [
        ...documents,
        ...store.notes.filter(
          (note) =>
            note.deletedAt && !documents.some((item) => item.id === note.id),
        ),
      ],
    }
  }

  function importBackup(
    incoming: Workspace,
    mode: BackupMode,
    expectedStored: string | null,
  ) {
    if (
      busy ||
      localFolder.busy ||
      localDocuments.busy ||
      pageSaveInProgress.current ||
      localDocuments.recovery
    )
      throw new WorkspaceError(
        'Aguarde a operação atual antes de importar o backup.',
      )
    const next = prepareWorkspaceBackup(
      backupSnapshot(),
      incoming,
      mode,
      exampleNotes.map((note) => note.id),
    )
    store.replaceFromBackup(next, expectedStored)
    setDrafts([])
    if (mode === 'replace') {
      localFolder.disconnect()
      sources.current.clear()
      localDocuments.reconcile(
        localDocuments.notes.map((note) => {
          const copy = { ...note }
          delete copy.folderId
          return copy
        }),
      )
    }
    setQuery('')
    setSelectedFolder(undefined)
    setExpandedFolders(new Set())
    const first = next.notes.find(
      (note) =>
        !note.deletedAt &&
        (mode === 'replace' || !documents.some((item) => item.id === note.id)),
    )
    setActiveId(first?.id ?? null)
    setOpenIds(first ? [first.id] : [])
    setMode('read')
    setActionError(null)
    setMessage(
      'Backup importado neste navegador. Os arquivos originais no computador não foram alterados.',
    )
  }

  return {
    ...store,
    importBackup,
    downloadCurrentBackup: () =>
      downloadFile(
        'devnotes-before-import.json',
        JSON.stringify(backupSnapshot(), null, 2),
        'application/json',
      ),
    localFolder,
    localDocuments,
    restoreRevision: (id: string, revisionId: string) => {
      const local = localDocuments.notes.find((note) => note.id === id)
      if (!local) return store.restoreRevision(id, revisionId)
      const revision = local.revisions?.find((item) => item.id === revisionId)
      if (!revision)
        throw new WorkspaceError('Esta versão não está mais disponível.')
      localDocuments.edit({
        ...local,
        title: revision.title,
        content: revision.content,
      })
      return true
    },
    allNotes: store.notes,
    allFolders: store.folders,
    folders: store.folders.filter((folder) => !folder.deletedAt),
    performAction,
    openNotes,
    closeTab,
    documents,
    activeNote,
    selectedFolder,
    setSelectedFolder,
    expandedFolders,
    toggleFolder,
    query,
    setQuery,
    mode,
    setMode,
    dialog,
    setDialog,
    isDraft,
    isSaved,
    pageSaveState:
      saveFeedback?.note.id === activeNote.id &&
      saveFeedback.note.title === activeNote.title &&
      saveFeedback.note.content === activeNote.content
        ? saveFeedback.phase
        : 'idle',
    busy:
      busy ||
      localFolder.busy ||
      localDocuments.busy ||
      saveFeedback?.phase === 'saving' ||
      !!localDocuments.recovery,
    message:
      localDocuments.has(activeNote.id) || localDocuments.error
        ? localDocuments.message
        : message,
    error: actionError ?? localDocuments.error ?? store.error,
    selectNote,
    openSearchResult,
    newDocument,
    editNote,
    savePage,
    openMarkdownFile,
    openDroppedFiles,
    createPage,
    createFolder,
    openFolder,
    openFiles,
    requestRefresh,
    refreshFile,
    refreshFromSelection,
    refreshConfirmation,
    setRefreshConfirmation,
    saveWorkspace,
    directoryInput,
    refreshInput,
    fileInput,
    collapseAll: () => {
      setExpandedFolders(new Set())
      setQuery('')
    },
  }
}
