import {
  applyWorkspaceAction,
  descendantFolderIds,
  recordRevision,
} from '../workspace-actions'
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
import type {
  FileSource,
  ImportedFolder,
  ImportedPdf,
} from '../workspace-files'
import { useNotes } from './use-notes'
import { useLocalFolder } from './use-local-folder'
import {
  createFolderProtection,
  protectNote,
  unlockNote,
  updateProtectedNote,
  verifyFolderPassword,
} from '../document-protection'
import type { WorkspaceTarget } from '../workspace-actions'
import { clearTextHighlights } from '../text-highlights'
import { isPdfFilename, readPdfFile } from '../pdf-files'

type PdfWorkspaceDocument = ImportedPdf

export function useWorkspace() {
  const store = useNotes()
  const [drafts, setDrafts] = useState<Note[]>([])
  const [pdfFiles, setPdfFiles] = useState(
    new Map<string, PdfWorkspaceDocument>(),
  )
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
  const [unlockedNotes, setUnlockedNotes] = useState(new Map<string, Note>())
  const [unlockedOwners, setUnlockedOwners] = useState(new Set<string>())
  const protectionKeys = useRef(new Map<string, CryptoKey>())
  const protectionPasswords = useRef(new Map<string, string>())
  const protectionEditVersions = useRef(new Map<string, number>())
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
  function revealNote(note: Note) {
    const unlocked = unlockedNotes.get(note.id)
    if (!unlocked) return note
    const revealed: Note = { ...note, content: unlocked.content }
    if (unlocked.revisions) revealed.revisions = unlocked.revisions
    return revealed
  }
  const documents = [
    ...localDocuments.notes.map(revealNote),
    ...[...pdfFiles.values()].map((file) => file.note),
    ...drafts,
    ...store.notes
      .map(revealNote)
      .filter(
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

  function protectedFolderOwner(folderId?: string) {
    const visited = new Set<string>()
    let current = folderId
    while (current && !visited.has(current)) {
      visited.add(current)
      const folder = store.folders.find((item) => item.id === current)
      if (!folder) return undefined
      if (folder.protection) return folder.id
      current = folder.parentId
    }
    return undefined
  }

  function protectionOwner(target: WorkspaceTarget) {
    if (target.kind === 'note')
      return [...store.notes, ...localDocuments.notes].find(
        (note) => note.id === target.id,
      )?.protection?.ownerId
    return protectedFolderOwner(target.id)
  }

  function targetNotes(target: WorkspaceTarget) {
    if (target.kind === 'note') {
      const note = documents.find((item) => item.id === target.id)
      return note?.mediaType === 'pdf' ? [] : note ? [note] : []
    }
    const folders = descendantFolderIds(store.folders, target.id)
    return documents.filter(
      (note) =>
        note.mediaType !== 'pdf' && note.folderId && folders.has(note.folderId),
    )
  }

  function isNoteLocked(id: string) {
    const note = [...store.notes, ...localDocuments.notes].find(
      (item) => item.id === id,
    )
    return !!note?.protection && !unlockedNotes.has(id)
  }

  function isFolderLocked(id: string) {
    const owner = protectedFolderOwner(id)
    return !!owner && !unlockedOwners.has(owner)
  }

  async function runProtection(action: () => Promise<void>) {
    setBusy(true)
    setActionError(null)
    try {
      await action()
      return true
    } catch (error) {
      reportError(error)
      return false
    } finally {
      setBusy(false)
    }
  }

  async function protectItem(target: WorkspaceTarget, password: string) {
    return runProtection(async () => {
      const notes = targetNotes(target)
      if (!notes.length && target.kind === 'note')
        throw new WorkspaceError('Este documento não está mais disponível.')
      if (
        protectionOwner(target) ||
        notes.some((note) => note.protection) ||
        (target.kind === 'folder' &&
          store.folders.some(
            (folder) =>
              descendantFolderIds(store.folders, target.id).has(folder.id) &&
              folder.protection,
          ))
      )
        throw new WorkspaceError('Este item já possui proteção por senha.')
      if (notes.some((note) => localDocuments.has(note.id)))
        throw new WorkspaceError(
          'Salve o documento no espaço de trabalho antes de protegê-lo.',
        )
      const ownerId = target.id
      const protectedNotes = await Promise.all(
        notes.map((note) => protectNote(note, password, ownerId)),
      )
      const byId = new Map(protectedNotes.map((item) => [item.locked.id, item]))
      const nextNotes = store.notes.map(
        (note) => byId.get(note.id)?.locked ?? note,
      )
      for (const item of protectedNotes)
        if (!nextNotes.some((note) => note.id === item.locked.id))
          nextNotes.unshift(item.locked)
      let nextFolders = store.folders
      if (target.kind === 'folder') {
        const protection = await createFolderProtection(password)
        nextFolders = store.folders.map((folder) =>
          folder.id === target.id ? { ...folder, protection } : folder,
        )
      }
      store.replaceItems(nextNotes, nextFolders)
      for (const item of protectedNotes) clearTextHighlights(item.locked.id)
      setDrafts((current) => current.filter((note) => !byId.has(note.id)))
      setUnlockedNotes((current) => {
        const next = new Map(current)
        for (const item of protectedNotes)
          next.set(item.unlocked.id, item.unlocked)
        return next
      })
      for (const item of protectedNotes)
        protectionKeys.current.set(item.locked.id, item.key)
      protectionPasswords.current.set(ownerId, password)
      setUnlockedOwners((current) => new Set([...current, ownerId]))
      if (target.kind === 'folder')
        setExpandedFolders((current) => new Set([...current, target.id]))
      setMessage(
        target.kind === 'folder'
          ? 'Pasta protegida. Os documentos serão gravados de forma criptografada.'
          : 'Documento protegido. O conteúdo será gravado de forma criptografada.',
      )
    })
  }

  async function unlockItem(target: WorkspaceTarget, password: string) {
    return runProtection(async () => {
      const ownerId = protectionOwner(target)
      if (!ownerId) throw new WorkspaceError('Este item não está protegido.')
      const folder = store.folders.find((item) => item.id === ownerId)
      if (folder?.protection)
        await verifyFolderPassword(folder.protection, password)
      const candidates = [...store.notes, ...localDocuments.notes].filter(
        (note) =>
          note.protection?.ownerId === ownerId &&
          (target.kind === 'folder' || note.id === target.id),
      )
      const unlocked = await Promise.all(
        candidates.map((note) => unlockNote(note, password)),
      )
      if (!folder && !unlocked.length)
        throw new WorkspaceError('Este documento não está mais disponível.')
      setUnlockedNotes((current) => {
        const next = new Map(current)
        for (const item of unlocked) next.set(item.note.id, item.note)
        return next
      })
      for (const item of unlocked)
        protectionKeys.current.set(item.note.id, item.key)
      protectionPasswords.current.set(ownerId, password)
      setUnlockedOwners((current) => new Set([...current, ownerId]))
      if (target.kind === 'folder')
        setExpandedFolders((current) => new Set([...current, target.id]))
      setMessage(
        target.kind === 'folder'
          ? 'Pasta desbloqueada nesta sessão.'
          : 'Documento desbloqueado nesta sessão.',
      )
    })
  }

  function lockItem(target: WorkspaceTarget) {
    const ownerId = protectionOwner(target)
    if (!ownerId) return
    setUnlockedNotes((current) => {
      const next = new Map(current)
      for (const [id, note] of next)
        if (note.protection?.ownerId === ownerId) next.delete(id)
      return next
    })
    for (const note of [...store.notes, ...localDocuments.notes])
      if (note.protection?.ownerId === ownerId) {
        protectionKeys.current.delete(note.id)
        protectionEditVersions.current.set(
          note.id,
          (protectionEditVersions.current.get(note.id) ?? 0) + 1,
        )
      }
    protectionPasswords.current.delete(ownerId)
    setUnlockedOwners((current) => {
      const next = new Set(current)
      next.delete(ownerId)
      return next
    })
    setMode('read')
    setMessage('Proteção bloqueada. Informe a senha para acessar novamente.')
  }

  async function removeProtection(target: WorkspaceTarget, password: string) {
    return runProtection(async () => {
      const ownerId = protectionOwner(target)
      if (!ownerId) throw new WorkspaceError('Este item não está protegido.')
      if (target.kind === 'note' && ownerId !== target.id)
        throw new WorkspaceError(
          'A senha pertence à pasta. Remova a proteção pela pasta.',
        )
      if (target.kind === 'note' && localDocuments.has(target.id))
        throw new WorkspaceError(
          'Abra uma cópia no espaço de trabalho antes de remover a proteção.',
        )
      const folder = store.folders.find((item) => item.id === ownerId)
      if (folder?.protection)
        await verifyFolderPassword(folder.protection, password)
      const protectedNotes = store.notes.filter(
        (note) => note.protection?.ownerId === ownerId,
      )
      const decrypted = await Promise.all(
        protectedNotes.map((note) => unlockNote(note, password)),
      )
      const clearById = new Map(
        decrypted.map(({ note }) => {
          const clear: Note = { ...note }
          delete clear.protection
          return [note.id, clear]
        }),
      )
      const nextNotes = store.notes.map(
        (note) => clearById.get(note.id) ?? note,
      )
      const nextFolders = store.folders.map((item) => {
        if (item.id !== ownerId) return item
        const clear = { ...item }
        delete clear.protection
        return clear
      })
      store.replaceItems(nextNotes, nextFolders)
      setUnlockedNotes((current) => {
        const next = new Map(current)
        for (const note of protectedNotes) next.delete(note.id)
        return next
      })
      for (const note of protectedNotes) protectionKeys.current.delete(note.id)
      protectionPasswords.current.delete(ownerId)
      setUnlockedOwners((current) => {
        const next = new Set(current)
        next.delete(ownerId)
        return next
      })
      setMessage(
        'Proteção removida. O conteúdo voltou a ser salvo como Markdown comum.',
      )
    })
  }

  function performAction(action: WorkspaceAction) {
    setActionError(null)
    if (
      action.kind === 'note' &&
      documents.find((note) => note.id === action.id)?.mediaType === 'pdf'
    )
      throw new WorkspaceError('PDFs ficam disponíveis somente para leitura.')
    if (action.type === 'duplicate') {
      const protectedDescendant =
        action.kind === 'folder' &&
        (targetNotes(action).some((note) => note.protection) ||
          store.folders.some(
            (folder) =>
              descendantFolderIds(store.folders, action.id).has(folder.id) &&
              folder.protection,
          ))
      if (protectionOwner(action) || protectedDescendant)
        throw new WorkspaceError(
          'Remova a proteção antes de duplicar este item.',
        )
    }
    if (action.type === 'move') {
      const sourceOwner = protectionOwner(action)
      const destinationOwner = protectedFolderOwner(action.parentId)
      if (sourceOwner !== destinationOwner)
        throw new WorkspaceError(
          'Remova a proteção antes de mover este item para dentro ou para fora de uma pasta protegida.',
        )
    }
    const actionableDocuments = documents.filter(
      (note) => note.mediaType !== 'pdf',
    )
    const localResult = localDocuments.notes.some(
      (note) => note.mediaType !== 'pdf',
    )
      ? applyWorkspaceAction(
          {
            ...emptyWorkspace(),
            notes: [
              ...actionableDocuments,
              ...store.notes.filter((note) => note.deletedAt),
            ],
            folders: store.folders,
          },
          action,
        )
      : null
    if (localResult)
      for (const note of localDocuments.notes)
        if (note.mediaType !== 'pdf') store.saveNote(note)
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
    const note = documents.find((note) => note.id === id)
    setSelectedFolder(note?.folderId)
    if (note?.mediaType === 'pdf') setMode('read')
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
    if (note.mediaType === 'pdf') return
    const stored = [...store.notes, ...localDocuments.notes].find(
      (item) => item.id === note.id,
    )
    if (stored?.protection) {
      if (localDocuments.has(note.id)) {
        setActionError(
          'Arquivos protegidos abertos diretamente ficam somente para leitura. Abra uma cópia no espaço de trabalho para editar.',
        )
        return
      }
      const key = protectionKeys.current.get(note.id)
      const previous = unlockedNotes.get(note.id)
      if (!key || !previous) {
        setActionError('Desbloqueie o documento antes de editá-lo.')
        return
      }
      const nextNote = recordRevision(previous, note)
      const version = (protectionEditVersions.current.get(note.id) ?? 0) + 1
      protectionEditVersions.current.set(note.id, version)
      setUnlockedNotes((current) => new Map(current).set(note.id, nextNote))
      void updateProtectedNote(nextNote, key)
        .then((result) => {
          if (protectionEditVersions.current.get(note.id) !== version) return
          store.saveNote(result.locked)
          setUnlockedNotes((current) =>
            new Map(current).set(note.id, result.unlocked),
          )
          setMessage('Alterações protegidas salvas neste navegador.')
        })
        .catch((error: unknown) => reportError(error))
      return
    }
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
    const note = activeNote
    if (note.mediaType === 'pdf') {
      setMessage('PDF aberto somente para leitura.')
      return false
    }
    pageSaveInProgress.current = true
    setSaveFeedback({ note, phase: 'saving' })
    setActionError(null)
    try {
      const saved = note.protection
        ? !!protectionKeys.current.get(note.id)
        : localDocuments.has(note.id)
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

  function finishCreatedPage(note: Note) {
    activate(note.id)
    setQuery('')
    setMode('read')
    setDialog(null)
    if (selectedFolder)
      setExpandedFolders((current) => new Set([...current, selectedFolder]))
  }

  function createPage(title: string, content: string) {
    const ownerId = protectedFolderOwner(selectedFolder)
    if (ownerId) {
      const password = protectionPasswords.current.get(ownerId)
      if (!password) {
        setActionError('Desbloqueie a pasta antes de adicionar um documento.')
        return
      }
      void runProtection(async () => {
        const note: Note = {
          id: crypto.randomUUID(),
          title: title.trim(),
          content: content.trim(),
          ...(selectedFolder ? { folderId: selectedFolder } : {}),
        }
        const protectedNote = await protectNote(note, password, ownerId)
        store.replaceItems(
          [protectedNote.locked, ...store.notes],
          store.folders,
        )
        protectionKeys.current.set(note.id, protectedNote.key)
        setUnlockedNotes((current) =>
          new Map(current).set(note.id, protectedNote.unlocked),
        )
        finishCreatedPage(protectedNote.unlocked)
      })
      return
    }
    const note = store.addNote(title, content, selectedFolder)
    finishCreatedPage(note)
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
    setPdfFiles((current) => {
      const next = new Map(current)
      for (const pdf of result.pdfs) next.set(pdf.note.id, pdf)
      return next
    })
    setExpandedFolders(
      (current) =>
        new Set([...current, ...result.folders.map((folder) => folder.id)]),
    )
    setSelectedFolder(result.folders[0]?.id)
    const imported = [...result.notes, ...result.pdfs.map((pdf) => pdf.note)]
    const first = imported[0]
    setEmptyFolderOpen(!first)
    setActiveId(first?.id ?? null)
    setOpenIds(
      openAll ? imported.map((note) => note.id) : first ? [first.id] : [],
    )
    setQuery('')
    setMessage(
      `Importação concluída: ${result.notes.length} ${result.notes.length === 1 ? 'arquivo Markdown' : 'arquivos Markdown'} e ${result.pdfs.length} ${result.pdfs.length === 1 ? 'PDF' : 'PDFs'}. Os originais não foram alterados; PDFs ficam disponíveis nesta sessão.`,
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

  async function openDocumentFile(file?: File) {
    if (!file) return
    setBusy(true)
    setActionError(null)
    try {
      if (isPdfFilename(file.name)) {
        const pdf = await readPdfFile(file)
        const note: Note = {
          id: crypto.randomUUID(),
          title: pdf.title,
          content: '',
          mediaType: 'pdf',
          sourcePath: file.name,
        }
        setPdfFiles((current) =>
          new Map(current).set(note.id, {
            note,
            data: pdf.data,
            fileName: file.name,
          }),
        )
        setEmptyFolderOpen(false)
        setActiveId(note.id)
        setOpenIds([note.id])
        setSelectedFolder(undefined)
        setQuery('')
        setMode('read')
        setMessage(
          `PDF "${file.name}" aberto somente para leitura nesta sessão.`,
        )
        return
      }
      const parsed = await readMarkdownFile(file)
      const note = { id: crypto.randomUUID(), ...parsed, sourcePath: file.name }
      if (note.protection)
        note.protection = { ...note.protection, ownerId: note.id }
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
        files.reduce((total, file) => total + file.size, 0) > 100 * 1024 * 1024
      )
        throw new WorkspaceError(
          'Solte até 100 arquivos, com no máximo 100 MB no total.',
        )
      if (files.some((file) => !/\.(md|markdown|pdf)$/i.test(file.name)))
        throw new WorkspaceError('Selecione apenas arquivos Markdown ou PDF.')
      const result = await importFileList(files)
      finishImport(result, true)
      const documents = result.notes.length + result.pdfs.length
      setSelectedFolder(undefined)
      setQuery('')
      setMode('read')
      setMessage(
        `${documents} ${documents === 1 ? 'documento aberto' : 'documentos abertos'}. Os originais não foram alterados; PDFs ficam somente para leitura nesta sessão.`,
      )
    } catch (error) {
      reportError(error)
    } finally {
      setBusy(false)
    }
  }

  async function applyRefresh(note: Note, file: File) {
    if (note.mediaType === 'pdf') {
      const pdf = await readPdfFile(file)
      setPdfFiles((current) => {
        const previous = current.get(note.id)
        if (!previous) return current
        return new Map(current).set(note.id, {
          ...previous,
          note: { ...note, title: pdf.title },
          data: pdf.data,
          fileName: file.name,
        })
      })
      setMessage(`PDF "${file.name}" recarregado do original.`)
      return
    }
    if (note.protection)
      throw new WorkspaceError(
        'Remova a proteção antes de recarregar este documento do original.',
      )
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
    if (note.mediaType === 'pdf') {
      const pdf = pdfFiles.get(note.id)
      if (!pdf?.handle) {
        refreshTarget.current = note
        setMessage(
          `Selecione "${pdf?.fileName ?? note.sourcePath?.split('/').at(-1) ?? 'o PDF original'}" para recarregá-lo.`,
        )
        refreshInput.current?.click()
        return
      }
      setBusy(true)
      setActionError(null)
      try {
        await applyRefresh(note, await pdf.handle.getFile())
      } catch (error) {
        reportError(error)
      } finally {
        setBusy(false)
      }
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
    if (activeNote.mediaType === 'pdf') {
      void refreshFile(activeNote)
      return
    }
    if (activeNote.protection) {
      setActionError(
        'Remova a proteção antes de recarregar este documento do original.',
      )
      return
    }
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
        (note.mediaType === 'pdf'
          ? pdfFiles.get(note.id)?.fileName
          : sources.current.get(note.id)?.fileName) ??
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
    notes: [
      ...documents.filter((note) => note.mediaType !== 'pdf'),
      ...store.notes.filter((note) => note.deletedAt),
    ],
    pdfs: [...pdfFiles.values()],
    folders: store.folders,
    saveNote: (note, forceRevision) => {
      const saved = store.saveNote(note, forceRevision)
      setDrafts((items) => items.filter((item) => item.id !== note.id))
      return saved
    },
    importFolder: store.importFolder,
    syncPdfs: (nextPdfs, previousIds) => {
      setPdfFiles((current) => {
        const next = new Map(current)
        for (const id of previousIds) next.delete(id)
        for (const pdf of nextPdfs) next.set(pdf.note.id, pdf)
        return next
      })
    },
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
    pdfData: (id: string) =>
      localDocuments.pdfData(id) ?? pdfFiles.get(id)?.data,
    localFolder,
    localDocuments,
    restoreRevision: (id: string, revisionId: string) => {
      const protectedNote = documents.find(
        (note) => note.id === id && note.protection,
      )
      if (protectedNote) {
        const revision = protectedNote.revisions?.find(
          (item) => item.id === revisionId,
        )
        if (!revision)
          throw new WorkspaceError('Esta versão não está mais disponível.')
        editNote({
          ...protectedNote,
          title: revision.title,
          content: revision.content,
        })
        return true
      }
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
    protectItem,
    unlockItem,
    lockItem,
    removeProtection,
    protectionOwner,
    isNoteLocked,
    isFolderLocked,
    unlockedOwners,
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
    openDocumentFile,
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
