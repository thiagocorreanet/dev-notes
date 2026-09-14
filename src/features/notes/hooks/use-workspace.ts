import { applyWorkspaceAction } from '../workspace-actions'
import { emptyWorkspace } from '../workspace-storage'
import { useLocalDocuments } from './use-local-documents'
import { requestedLocalFile } from '../local-document'
import { loadTabs, TABS_KEY } from '../workspace-tabs'
import type { WorkspaceAction } from '../workspace-actions'
import { WorkspaceError } from '../workspace-error'
import { useEffect, useRef, useState } from 'react'
import { exampleNotes } from '../example-notes'
import type { Note } from '../types'
import {
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
  const [localLaunch] = useState(() => requestedLocalFile() !== null)
  const [initialTabs] = useState(() =>
    localLaunch ? { ids: [], activeId: null } : loadTabs(),
  )
  const [activeId, setActiveId] = useState<string | null>(initialTabs.activeId)
  const [openIds, setOpenIds] = useState(initialTabs.ids)
  const [emptyFolderOpen, setEmptyFolderOpen] = useState(false)
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
    setEmptyFolderOpen(false)
    setActiveId(id)
    setOpenIds([id])
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
  const activeNote =
    documents.find((note) => note.id === activeId) ??
    (emptyFolderOpen ||
    (localLaunch && (localDocuments.loading || localDocuments.error))
      ? { id: 'empty-workspace', title: '', content: '' }
      : (documents[0] ?? { id: 'empty-workspace', title: '', content: '' }))
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
    if (localLaunch) return
    try {
      localStorage.setItem(TABS_KEY, tabsSnapshot)
    } catch {
      /* Document persistence reports storage failures separately. */
    }
  }, [localLaunch, tabsSnapshot])

  function activate(id: string | null) {
    if (id) setEmptyFolderOpen(false)
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
      'Documento temporário criado. Salve a página para guardá-lo neste navegador.',
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

  function finishImport(result: ImportedFolder, openAll = false) {
    store.importFolder(result.notes, result.folders)
    for (const [id, source] of result.sources) sources.current.set(id, source)
    setExpandedFolders(
      (current) =>
        new Set([...current, ...result.folders.map((folder) => folder.id)]),
    )
    setSelectedFolder(result.folders[0]?.id)
    const first = result.notes[0]
    setEmptyFolderOpen(!first)
    setActiveId(first?.id ?? null)
    setOpenIds(
      openAll ? result.notes.map((note) => note.id) : first ? [first.id] : [],
    )
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
      setEmptyFolderOpen(false)
      setActiveId(note.id)
      setOpenIds([note.id])
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
      if (files.some((file) => !/\.(md|markdown)$/i.test(file.name)))
        throw new WorkspaceError('Selecione apenas arquivos Markdown.')
      const result = await importFileList(files)
      finishImport(result, true)
      const notes = result.notes
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
    onConnect: (ids, folderId) => {
      if (ids[0]) {
        setEmptyFolderOpen(false)
        setActiveId(ids[0])
        setOpenIds([ids[0]])
        setMode('read')
      }
      if (folderId) {
        setSelectedFolder(folderId)
        setExpandedFolders((current) => new Set([...current, folderId]))
      }
    },
  })

  return {
    ...store,
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
      localFolder.message ||
      (localDocuments.has(activeNote.id) || localDocuments.error
        ? localDocuments.message
        : message),
    error:
      actionError || localFolder.error || localDocuments.error || store.error,
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
    directoryInput,
    refreshInput,
    fileInput,
    collapseAll: () => {
      setExpandedFolders(new Set())
      setQuery('')
    },
  }
}
