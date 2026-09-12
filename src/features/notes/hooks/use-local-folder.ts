import { useRef, useState } from 'react'
import type { Note, WorkspaceFolder } from '../types'
import type { LocalDirectoryHandle } from '../workspace-files'
import { parseMarkdownFile } from '../workspace-files'
import { folderPath } from '../note-tasks'
import { WorkspaceError } from '../workspace-error'
import {
  FileChangedError,
  readLocalPath,
  sameDocument,
  scanLocalFolder,
  serializeLocalNote,
  syncStatus,
  validateLocalPath,
  writeLocalPath,
} from '../local-folder'
import type { DiskFile, SyncedFile } from '../local-folder'

interface Connection {
  root: LocalDirectoryHandle
  files: SyncedFile[]
}

export function useLocalFolder({
  notes,
  folders,
  saveNote,
  importFolder,
}: {
  notes: Note[]
  folders: WorkspaceFolder[]
  saveNote: (note: Note, forceRevision?: boolean) => boolean
  importFolder: (notes: Note[], folders: WorkspaceFolder[]) => void
}) {
  const [connection, setConnection] = useState<Connection | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const running = useRef(false)

  async function run(action: () => Promise<void>) {
    if (running.current) return
    running.current = true
    setBusy(true)
    setError('')
    setMessage('')
    try {
      await action()
    } catch (error) {
      if (!(error instanceof DOMException && error.name === 'AbortError')) {
        setError(
          error instanceof WorkspaceError
            ? error.message
            : 'Não foi possível acessar a pasta. Confira a permissão do navegador e tente novamente.',
        )
      }
    } finally {
      running.current = false
      setBusy(false)
    }
  }

  function updateEntry(entry: SyncedFile) {
    setConnection((current) =>
      current
        ? {
            ...current,
            files: [
              ...current.files.filter((file) => file.noteId !== entry.noteId),
              entry,
            ],
          }
        : current,
    )
  }

  function reconcile(
    root: LocalDirectoryHandle,
    disk: DiskFile[],
    previous: SyncedFile[],
  ) {
    const next: SyncedFile[] = []
    const additions: Note[] = []
    const newFolders: WorkspaceFolder[] = []
    const updates: Note[] = []
    const availableFolders = folders.filter((folder) => !folder.deletedAt)
    const byPath = new Map<string, string>()
    for (const folder of availableFolders)
      byPath.set(folderPath(folder.id, availableFolders), folder.id)
    function ensureFolder(path: string): string {
      const known = byPath.get(path)
      if (known) return known
      const parts = path.split('/')
      const parentId =
        parts.length > 1
          ? ensureFolder(parts.slice(0, -1).join('/'))
          : undefined
      const folder: WorkspaceFolder = {
        id: crypto.randomUUID(),
        name: parts.at(-1)!,
        ...(parentId ? { parentId } : {}),
      }
      byPath.set(path, folder.id)
      newFolders.push(folder)
      return folder.id
    }
    // Read and validate the complete scan before committing any workspace changes.
    ensureFolder(root.name)
    for (const item of disk) {
      const sourcePath = `${root.name}/${item.path}`
      const old = previous.find((file) => file.path === item.path)
      const matches = notes.filter((note) => note.sourcePath === sourcePath)
      const activeMatches = matches.filter((note) => !note.deletedAt)
      if (!old && activeMatches.length > 1)
        throw new WorkspaceError(
          `Há mais de uma cópia de "${sourcePath}". Remova as cópias extras antes de conectar a pasta.`,
        )
      const existing = old
        ? notes.find((note) => note.id === old.noteId)
        : (activeMatches[0] ?? matches[0])
      if (existing?.deletedAt) {
        // Keep the association so scans never resurrect notes from the trash.
        next.push({
          noteId: existing.id,
          path: item.path,
          baseline: old?.baseline ?? null,
          disk: item.raw,
        })
        continue
      }
      const parsed = parseMarkdownFile(item.path.split('/').at(-1)!, item.raw)
      const note = existing ?? {
        id: crypto.randomUUID(),
        ...parsed,
        sourcePath,
        folderId: ensureFolder(sourcePath.split('/').slice(0, -1).join('/')),
      }
      if (!existing) additions.push(note)
      const entry: SyncedFile = {
        noteId: note.id,
        path: item.path,
        baseline:
          old?.baseline ??
          (sameDocument(note, item.raw, item.path) ? item.raw : null),
        disk: item.raw,
      }
      const status = syncStatus(note, entry)
      if (status === 'external') updates.push({ ...note, ...parsed })
      if (status === 'external' || status === 'saved') entry.baseline = item.raw
      next.push(entry)
    }
    for (const old of previous)
      if (!disk.some((item) => item.path === old.path))
        next.push({ ...old, disk: null })
    // Reconnecting must also retain workspace copies of files removed while offline.
    for (const note of notes) {
      if (
        note.sourcePath?.startsWith(`${root.name}/`) &&
        !next.some((file) => file.noteId === note.id) &&
        !next.some((file) => `${root.name}/${file.path}` === note.sourcePath)
      ) {
        next.push({
          noteId: note.id,
          path: note.sourcePath.slice(root.name.length + 1),
          baseline: null,
          disk: null,
        })
      }
    }
    if (newFolders.length || additions.length)
      importFolder(additions, newFolders)
    for (const note of updates) saveNote(note, true)
    setConnection({ root, files: next })
    setMessage(
      'Verificação concluída. Alterações externas sem conflito foram carregadas; confira os arquivos pendentes abaixo.',
    )
  }

  async function connect() {
    await run(async () => {
      if (!window.showDirectoryPicker)
        throw new WorkspaceError(
          'Este navegador não permite conectar uma pasta com gravação. Você pode continuar usando Abrir pasta e Baixar Markdown.',
        )
      const root = await window.showDirectoryPicker({ mode: 'readwrite' })
      reconcile(root, await scanLocalFolder(root), [])
    })
  }

  async function check() {
    if (!connection) return
    await run(async () =>
      reconcile(
        connection.root,
        await scanLocalFolder(connection.root),
        connection.files,
      ),
    )
  }

  async function save(
    id: string,
    path?: string,
    resolution?: 'local' | 'disk',
  ) {
    if (!connection) return
    await run(async () => {
      const note = notes.find((item) => item.id === id && !item.deletedAt)
      if (!note)
        throw new WorkspaceError('Este documento não está mais disponível.')
      const old = connection.files.find((file) => file.noteId === id)
      const target = old?.path ?? path?.trim()
      if (!target)
        throw new WorkspaceError('Informe o caminho do arquivo na pasta.')
      validateLocalPath(target)
      if (
        !old &&
        connection.files.some(
          (file) =>
            file.path.toLocaleLowerCase() === target.toLocaleLowerCase(),
        )
      )
        throw new WorkspaceError(
          'Este caminho já está conectado a outro documento. Escolha outro nome.',
        )
      const disk = await readLocalPath(connection.root, target)
      if (!old && disk !== null)
        throw new WorkspaceError(
          'Já existe um arquivo nesse caminho. Verifique as alterações da pasta para importá-lo ou escolha outro nome.',
        )
      const entry: SyncedFile = old
        ? { ...old, disk }
        : { noteId: id, path: target, baseline: null, disk }
      if (old) updateEntry(entry)
      if (resolution && old?.disk !== disk) throw new FileChangedError()
      const status = old ? syncStatus(note, entry) : 'modified'
      if (!resolution && (status === 'conflict' || status === 'missing')) {
        setMessage(
          'O arquivo precisa de uma decisão. Abra Comparar versões para continuar.',
        )
        return
      }
      if (resolution === 'disk' || (!resolution && status === 'external')) {
        if (disk === null)
          throw new WorkspaceError(
            'O arquivo não existe mais na pasta. Recrie o arquivo ou mantenha somente a cópia do navegador.',
          )
        saveNote(
          { ...note, ...parseMarkdownFile(target.split('/').at(-1)!, disk) },
          true,
        )
        updateEntry({ ...entry, baseline: disk })
        setMessage(
          'Versão da pasta carregada. A versão anterior está no histórico do documento.',
        )
        return
      }
      if (status === 'saved') {
        updateEntry({ ...entry, baseline: disk })
        setMessage('O documento já está igual ao arquivo da pasta.')
        return
      }
      const content = serializeLocalNote(note, old)
      try {
        await writeLocalPath(connection.root, target, content, disk)
      } catch (error) {
        if (error instanceof FileChangedError && old)
          updateEntry({
            ...entry,
            disk: await readLocalPath(connection.root, target),
          })
        throw error
      }
      let folderId = note.folderId
      if (!old) {
        const nextFolders: WorkspaceFolder[] = []
        const parts = [connection.root.name, ...target.split('/').slice(0, -1)]
        let parentId: string | undefined
        for (const name of parts) {
          const existing = [...folders, ...nextFolders].find(
            (item) =>
              !item.deletedAt &&
              item.name === name &&
              item.parentId === parentId,
          )
          const folder = existing ?? {
            id: crypto.randomUUID(),
            name,
            ...(parentId ? { parentId } : {}),
          }
          if (!existing) nextFolders.push(folder)
          parentId = folder.id
        }
        folderId = parentId
        if (nextFolders.length) importFolder([], nextFolders)
      }
      if (resolution === 'local' && disk !== null && status === 'conflict') {
        saveNote(
          { ...note, ...parseMarkdownFile(target.split('/').at(-1)!, disk) },
          true,
        )
      }
      saveNote(
        {
          ...note,
          ...parseMarkdownFile(target.split('/').at(-1)!, content),
          ...(folderId ? { folderId } : {}),
          sourcePath: `${connection.root.name}/${target}`,
        },
        resolution === 'local',
      )
      updateEntry({ ...entry, baseline: content, disk: content })
      setMessage(`Arquivo "${target}" salvo na pasta.`)
    })
  }

  function disconnect() {
    if (running.current) return
    setConnection(null)
    setError('')
    setMessage('Pasta desconectada. Seus documentos continuam neste navegador.')
  }

  const files = (connection?.files ?? []).flatMap((file) => {
    const note = notes.find(
      (item) => item.id === file.noteId && !item.deletedAt,
    )
    return note ? [{ ...file, note, status: syncStatus(note, file) }] : []
  })
  return {
    rootName: connection?.root.name,
    files,
    busy,
    error,
    message,
    connect,
    check,
    save,
    disconnect,
  }
}
