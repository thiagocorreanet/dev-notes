import {
  clearLocalDrafts,
  discardLocalDraft,
  draftKey,
  persistLocalDraft,
  readLocalDrafts,
} from '../local-drafts'
import type { LocalDraft } from '../local-drafts'
import { recordRevision } from '../workspace-actions'
import { useEffect, useEffectEvent, useRef, useState } from 'react'
import type { Note } from '../types'
import type { LocalDocument } from '../local-document'
import { requestLocalDocument, requestedLocalFile } from '../local-document'
import { parseMarkdownFile } from '../workspace-files'
import { serializeLocalNote } from '../local-folder'
import { WorkspaceError } from '../workspace-error'
import { clearTextHighlights } from '../text-highlights'

interface OpenDocument {
  note: Note
  disk: LocalDocument
}

function modified({ note, disk }: OpenDocument) {
  const baseline = parseMarkdownFile(disk.name, disk.raw)
  return note.title !== baseline.title || note.content !== baseline.content
}

export function useLocalDocuments(onOpen: (id: string) => void) {
  const [files, setFiles] = useState<OpenDocument[]>([])
  const [busy, setBusy] = useState(() => !!requestedLocalFile())
  const saving = useRef(false)
  const [writer] = useState(() => crypto.randomUUID())
  const [recoveries, setRecoveries] = useState<LocalDraft[]>([])
  const [recoveryError, setRecoveryError] = useState<string | null>(null)
  function cacheDraft(note: Note, disk: LocalDocument) {
    try {
      if (modified({ note, disk })) persistLocalDraft(note, disk, writer)
      else localStorage.removeItem(draftKey(disk.path, writer))
      setRecoveryError(null)
    } catch {
      setRecoveryError(
        'Não foi possível guardar o rascunho de recuperação. Salve o arquivo ou baixe uma cópia antes de sair.',
      )
    }
  }
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState('')
  const didOpen = useEffectEvent(onOpen)

  useEffect(() => {
    const controller = new AbortController()
    const file = requestedLocalFile()
    if (!file) return
    void requestLocalDocument(file, controller.signal)
      .then((disk) => {
        if (controller.signal.aborted) return
        const note: Note = {
          id: `local:${encodeURIComponent(disk.path)}`,
          ...parseMarkdownFile(disk.name, disk.raw),
          sourcePath: disk.path,
        }
        if (note.protection)
          note.protection = { ...note.protection, ownerId: note.id }
        if (note.protection) {
          clearLocalDrafts(disk.path)
          clearTextHighlights(note.id)
        }
        try {
          const candidates = readLocalDrafts(disk.path)
          setRecoveries(
            candidates.filter(
              (draft) =>
                draft.note.title !== note.title ||
                draft.note.content !== note.content,
            ),
          )
        } catch {
          setRecoveryError(
            'Não foi possível consultar os rascunhos deste navegador.',
          )
        }
        setFiles([{ note, disk }])
        setMessage(`Arquivo aberto: ${disk.path}. Salvar grava no original.`)
        didOpen(note.id)
      })
      .catch((failure: unknown) => {
        if (controller.signal.aborted) return
        try {
          const candidates = readLocalDrafts(file)
          const first = candidates[0]
          if (first) {
            const note: Note = {
              id: `local:${encodeURIComponent(first.disk.path)}`,
              ...parseMarkdownFile(first.disk.name, first.disk.raw),
              sourcePath: first.disk.path,
            }
            if (note.protection)
              note.protection = { ...note.protection, ownerId: note.id }
            setFiles([{ note, disk: first.disk }])
            setRecoveries(candidates)
            didOpen(note.id)
          }
        } catch {
          setRecoveryError(
            'Não foi possível consultar os rascunhos deste navegador.',
          )
        }
        setError(
          failure instanceof WorkspaceError
            ? failure.message
            : 'Não foi possível abrir o arquivo local.',
        )
      })
      .finally(() => {
        if (!controller.signal.aborted) setBusy(false)
      })
    return () => controller.abort()
  }, [])

  const dirty = files.some(modified)
  useEffect(() => {
    if (!dirty) return
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault()
      event.returnValue = ''
    }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [dirty])

  function edit(note: Note) {
    const current = files.find((file) => file.note.id === note.id)
    if (current) cacheDraft(note, current.disk)
    setFiles((current) =>
      current.map((file) =>
        file.note.id === note.id
          ? { ...file, note: recordRevision(file.note, note) }
          : file,
      ),
    )
    setMessage(
      'Alterações pendentes no arquivo original. Use Salvar ou Ctrl/Cmd+S.',
    )
  }

  async function save(note: Note) {
    const file = files.find((item) => item.note.id === note.id)
    if (!file || saving.current) return false
    saving.current = true
    setBusy(true)
    setError(null)
    try {
      const raw = serializeLocalNote(note, {
        noteId: note.id,
        path: file.disk.name,
        baseline: file.disk.raw,
        disk: file.disk.raw,
      })
      const disk = await requestLocalDocument(file.disk.path, {
        raw,
        version: file.disk.version,
      })
      cacheDraft(note, disk)
      setFiles((current) =>
        current.map((item) =>
          item.note.id === note.id ? { ...item, disk } : item,
        ),
      )
      setMessage(`Arquivo salvo: ${disk.path}`)
      return true
    } catch (failure) {
      setError(
        failure instanceof WorkspaceError
          ? failure.message
          : 'Não foi possível salvar o arquivo original.',
      )
      return false
    } finally {
      saving.current = false
      setBusy(false)
    }
  }

  async function reload(id: string) {
    const file = files.find((item) => item.note.id === id)
    if (!file || saving.current) return
    saving.current = true
    setBusy(true)
    setError(null)
    try {
      const disk = await requestLocalDocument(file.disk.path)
      const parsed = parseMarkdownFile(disk.name, disk.raw)
      if (parsed.protection)
        parsed.protection = { ...parsed.protection, ownerId: file.note.id }
      cacheDraft({ ...file.note, ...parsed }, disk)
      setFiles((current) =>
        current.map((item) =>
          item.note.id === id
            ? {
                disk,
                note: {
                  ...item.note,
                  ...parsed,
                },
              }
            : item,
        ),
      )
      setMessage(`Arquivo recarregado: ${disk.path}`)
    } catch (failure) {
      setError(
        failure instanceof WorkspaceError
          ? failure.message
          : 'Não foi possível recarregar o arquivo original.',
      )
    } finally {
      saving.current = false
      setBusy(false)
    }
  }

  function recover(restore: boolean) {
    const draft = recoveries[0]
    const file = files.find((item) => item.disk.path === draft?.disk.path)
    if (!draft || !file) return
    if (restore) {
      const note = { ...file.note, ...draft.note }
      try {
        persistLocalDraft(note, draft.disk, writer)
        discardLocalDraft(draft)
      } catch {
        setRecoveryError(
          'O rascunho foi recuperado, mas não foi possível atualizar sua cópia de recuperação. Salve ou baixe uma cópia.',
        )
      }
      setFiles((current) =>
        current.map((item) =>
          item.note.id === note.id ? { note, disk: draft.disk } : item,
        ),
      )
      setMessage(
        draft.disk.version === file.disk.version
          ? 'Rascunho recuperado. Use Salvar para gravar no arquivo original.'
          : 'Rascunho recuperado. O original mudou no disco; confira as versões antes de salvar.',
      )
      // Keep the remaining independent recovery snapshots for future openings.
      setRecoveries([])
    } else {
      try {
        discardLocalDraft(draft)
      } catch {
        setRecoveryError('Não foi possível remover o rascunho do navegador.')
      }
      setRecoveries((current) => current.slice(1))
    }
  }

  return {
    recovery: recoveries[0],
    recover,
    reconcile: (notes: Note[]) => {
      for (const file of files) {
        const note = notes.find(
          (item) => item.id === file.note.id && !item.deletedAt,
        )
        if (note) cacheDraft(note, file.disk)
      }
      setFiles((current) =>
        current.flatMap((file) => {
          const note = notes.find(
            (item) => item.id === file.note.id && !item.deletedAt,
          )
          return note ? [{ ...file, note }] : []
        }),
      )
    },
    notes: files.map((file) => file.note),
    busy,
    loading: busy && files.length === 0,
    error: error ?? recoveryError,
    message,
    edit,
    save,
    reload,
    has: (id: string) => files.some((file) => file.note.id === id),
    isDirty: (id: string) =>
      files.some((file) => file.note.id === id && modified(file)),
  }
}
