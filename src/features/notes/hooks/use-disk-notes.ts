import { useEffect, useRef, useState } from 'react'
import {
  availablePath,
  baseName,
  buildDiskModel,
  childPath,
  DISK_METADATA_PATH,
  diskFilename,
  diskFolderName,
  emptyDiskMetadata,
  historyPath,
  parentPath,
  repath,
  serializeDiskHistory,
  serializeDiskMetadata,
  validateDiskFolderName,
} from '../disk-workspace'
import type { DiskSnapshot } from '../disk-workspace'
import {
  createDiskWorkspaceClient,
  DiskConflictError,
  DiskMissingError,
} from '../disk-workspace-client'
import { serializeLocalNote } from '../local-folder'
import { remapNoteLinks } from '../note-links'
import type { Note, NoteRevision, Workspace, WorkspaceFolder } from '../types'
import { applyWorkspaceAction, recordRevision } from '../workspace-actions'
import type { WorkspaceAction } from '../workspace-actions'
import { WorkspaceError } from '../workspace-error'
import { parseMarkdownFile } from '../workspace-files'
import { emptyWorkspace } from '../workspace-storage'

export interface DiskConflict {
  id: string
  path: string
  kind: 'changed' | 'missing'
}

const MAX_HISTORY_BYTES = 16 * 1024 * 1024

function sameRevisions(a?: NoteRevision[], b?: NoteRevision[]) {
  return (
    (a?.length ?? 0) === (b?.length ?? 0) &&
    (a ?? []).every((revision, index) => revision.id === b?.[index]?.id)
  )
}

function historyWithinLimit(revisions: NoteRevision[]) {
  let kept = revisions
  while (
    kept.length > 1 &&
    new Blob([serializeDiskHistory(kept)]).size > MAX_HISTORY_BYTES
  )
    kept = kept.slice(0, -1)
  return kept
}

/**
 * Keeps the workspace model in a folder on the computer. Edits update the model at once and are
 * written in order; structural changes run on disk and then reload the folder so both views agree.
 */
export function useDiskNotes(
  workspaceId: string | null,
  onFirstLoad?: (path: string) => void,
) {
  const [client] = useState(() =>
    workspaceId ? createDiskWorkspaceClient(workspaceId) : null,
  )
  const [state, setState] = useState(() => ({
    workspace: emptyWorkspace(),
    pdfs: [] as Note[],
    paths: new Map<string, string>(),
    loading: !!workspaceId,
    error: null as string | null,
    name: '',
    path: '',
    skipped: [] as string[],
    conflicts: [] as DiskConflict[],
    saving: false,
    pdfData: new Map<string, Uint8Array>(),
  }))
  const current = useRef<Workspace>(state.workspace)
  const pdfs = useRef<Note[]>([])
  const paths = useRef(new Map<string, string>())
  const files = useRef(new Map<string, { raw: string; version: string }>())
  const history = useRef(new Map<string, NoteRevision[] | undefined>())
  const metadata = useRef(emptyDiskMetadata())
  const metadataDirty = useRef(false)
  const pending = useRef(new Set<string>())
  const conflicts = useRef(new Map<string, DiskConflict>())
  const queue = useRef(Promise.resolve())
  const active = useRef(0)
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const pdfRequests = useRef(new Set<string>())
  const loaded = useRef(false)

  function publish(changes: Partial<typeof state> = {}) {
    setState((previous) => ({
      ...previous,
      workspace: current.current,
      pdfs: pdfs.current,
      paths: new Map(paths.current),
      conflicts: [...conflicts.current.values()],
      saving: active.current > 0 || pending.current.size > 0,
      ...changes,
    }))
  }

  function setModel(workspace: Workspace) {
    current.current = workspace
    publish()
  }

  function report(error: unknown) {
    if (error instanceof DOMException && error.name === 'AbortError') return
    publish({
      loading: false,
      error:
        error instanceof WorkspaceError
          ? error.message
          : 'Não foi possível atualizar a pasta do workspace.',
    })
  }

  function enqueue(task: () => Promise<void>) {
    active.current++
    const run = queue.current.then(task).then(
      () => true,
      (error: unknown) => {
        report(error)
        return false
      },
    )
    queue.current = run.then(() => {
      active.current--
      publish()
    })
    return run
  }

  function apply(snapshot: DiskSnapshot) {
    const built = buildDiskModel(snapshot)
    const local = current.current
    const kept = new Set([...pending.current, ...conflicts.current.keys()])
    const nextPaths = built.paths
    const nextFiles = built.files
    const notes = built.notes.map((note) =>
      kept.has(note.id)
        ? (local.notes.find((item) => item.id === note.id) ?? note)
        : note,
    )
    for (const id of kept) {
      // Unsaved edits keep their old baseline, so a changed file is reported instead of replaced.
      const file = files.current.get(id)
      if (file) nextFiles.set(id, file)
      else nextFiles.delete(id)
      if (notes.some((note) => note.id === id)) continue
      const note = local.notes.find((item) => item.id === id)
      if (!note || note.deletedAt) continue
      notes.unshift(note)
      const path = paths.current.get(id)
      if (path && file) {
        nextPaths.set(id, path)
        conflicts.current.set(id, { id, path, kind: 'missing' })
      }
    }
    for (const id of kept) {
      const revisions = history.current.get(id)
      built.history.set(id, revisions)
    }
    paths.current = nextPaths
    files.current = nextFiles
    history.current = built.history
    metadata.current = built.metadata
    if (built.metadataChanged) metadataDirty.current = true
    pdfs.current = built.pdfs
    current.current = {
      ...emptyWorkspace(),
      name: snapshot.name,
      notes,
      folders: built.folders,
    }
    const pdfIds = new Set(built.pdfs.map((pdf) => pdf.id))
    setState((previous) => ({
      ...previous,
      pdfData: new Map([...previous.pdfData].filter(([id]) => pdfIds.has(id))),
    }))
    publish({
      loading: false,
      name: snapshot.name,
      path: snapshot.path,
      skipped: snapshot.skipped,
    })
    if (!loaded.current) {
      loaded.current = true
      onFirstLoad?.(snapshot.path)
    }
  }

  async function refresh() {
    if (!client) return
    apply(await client.snapshot())
    await persistMetadata()
  }

  async function persistMetadata() {
    if (!client || !metadataDirty.current) return
    metadataDirty.current = false
    try {
      await client.writeFile(
        DISK_METADATA_PATH,
        serializeDiskMetadata(metadata.current),
        null,
      )
    } catch (error) {
      metadataDirty.current = true
      throw error
    }
  }

  function trackItem(id: string, path: string) {
    paths.current.set(id, path)
    metadata.current.items = [
      ...metadata.current.items.filter((item) => item.id !== id),
      { id, path },
    ]
    metadataDirty.current = true
  }

  function movePaths(from: string, to: string) {
    for (const [id, path] of paths.current)
      paths.current.set(id, repath(path, from, to))
    metadata.current.items = metadata.current.items.map((item) => ({
      ...item,
      path: repath(item.path, from, to),
    }))
    for (const [id, conflict] of conflicts.current)
      conflicts.current.set(id, {
        ...conflict,
        path: repath(conflict.path, from, to),
      })
    metadataDirty.current = true
  }

  async function writeHistory(note: Note) {
    if (!client) return
    const revisions = note.protection ? undefined : note.revisions
    if (sameRevisions(history.current.get(note.id), revisions)) return
    // Protected history lives inside the encrypted envelope; remove any readable copy.
    if (revisions?.length)
      await client.writeFile(
        historyPath(note.id),
        serializeDiskHistory(historyWithinLimit(revisions)),
        null,
      )
    else await client.remove(historyPath(note.id))
    history.current.set(note.id, revisions)
  }

  async function writeNote(id: string) {
    if (!client) return
    pending.current.delete(id)
    if (conflicts.current.has(id)) return
    const note = current.current.notes.find((item) => item.id === id)
    let path = paths.current.get(id)
    // A document sent to the trash still gets its last edits before the file moves.
    if (!note || (note.deletedAt && !path)) return
    const file = files.current.get(id)
    if (!path) {
      const directory = note.folderId ? paths.current.get(note.folderId) : ''
      if (directory === undefined) {
        // The folder may still be waiting in the queue to be created.
        if (
          current.current.folders.some(
            (folder) => folder.id === note.folderId && !folder.deletedAt,
          )
        ) {
          pending.current.add(id)
          return
        }
        throw new WorkspaceError(
          'A pasta deste documento não existe mais no computador.',
        )
      }
      path = availablePath(
        paths.current.values(),
        directory,
        diskFilename(note.title),
      )
    }
    const raw = serializeLocalNote(
      note,
      file
        ? { noteId: id, path, baseline: file.raw, disk: file.raw }
        : undefined,
    )
    if (!file || raw !== file.raw) {
      try {
        for (let attempt = 0; ; attempt++) {
          try {
            const { version } = await client.writeFile(
              path,
              raw,
              file?.version ?? null,
            )
            files.current.set(id, { raw, version })
            break
          } catch (error) {
            if (file || attempt > 4 || !(error instanceof DiskConflictError))
              throw error
            // Another program created this filename; use the next free one.
            path = availablePath(
              [...paths.current.values(), path],
              parentPath(path),
              baseName(path),
            )
          }
        }
      } catch (error) {
        if (
          file &&
          (error instanceof DiskConflictError ||
            error instanceof DiskMissingError)
        ) {
          conflicts.current.set(id, {
            id,
            path,
            kind: error instanceof DiskMissingError ? 'missing' : 'changed',
          })
          publish()
          return
        }
        pending.current.add(id)
        throw error
      }
      if (!paths.current.has(id)) trackItem(id, path)
    }
    await writeHistory(note)
  }

  async function writePending() {
    for (const id of [...pending.current]) await writeNote(id)
    await persistMetadata()
  }

  /** Writes pending edits; resolves false when a write failed or needs a decision. */
  async function flush() {
    clearTimeout(timer.current)
    const written = await enqueue(writePending)
    return written && conflicts.current.size === 0
  }

  function scheduleFlush() {
    clearTimeout(timer.current)
    timer.current = setTimeout(() => void flush(), 500)
  }

  /** Runs a change on disk, then reloads the folder even when the change fails. */
  function structural(task: () => Promise<void>) {
    clearTimeout(timer.current)
    return enqueue(async () => {
      let failure: unknown
      try {
        await writePending()
        await task()
        await writePending()
      } catch (error) {
        failure = error
      }
      try {
        await refresh()
      } catch (error) {
        failure ??= error
      }
      if (failure)
        throw failure instanceof Error
          ? failure
          : new WorkspaceError(
              'Não foi possível atualizar a pasta do workspace.',
            )
    })
  }

  function requirePath(id: string) {
    const path = paths.current.get(id)
    if (path === undefined)
      throw new WorkspaceError('Este item não está mais disponível na pasta.')
    return path
  }

  async function ensureDirectory(directory: string) {
    if (!client || !directory) return
    const known = new Set(paths.current.values())
    const parts = directory.split('/')
    for (let index = 1; index <= parts.length; index++) {
      const path = parts.slice(0, index).join('/')
      if (known.has(path)) continue
      await client.createDirectory(path).catch((error: unknown) => {
        if (!(error instanceof DiskConflictError)) throw error
      })
    }
  }

  async function move(id: string, directory: string, name: string) {
    if (!client) return
    const path = requirePath(id)
    const target = childPath(directory, name)
    if (target === path) return
    try {
      await client.move(path, target)
    } catch (error) {
      if (error instanceof DiskConflictError)
        throw new WorkspaceError(
          `Já existe um item chamado "${name}" nesse local.`,
        )
      throw error
    }
    movePaths(path, target)
  }

  async function renameNote(id: string) {
    const note = current.current.notes.find((item) => item.id === id)
    const path = requirePath(id)
    if (!note) return
    const name = baseName(
      availablePath(
        [...paths.current.values()].filter((item) => item !== path),
        parentPath(path),
        diskFilename(note.title),
      ),
    )
    await move(id, parentPath(path), name)
    await writeNote(id)
  }

  async function trash(action: WorkspaceAction) {
    if (!client) return
    const path = requirePath(action.id)
    const item =
      action.kind === 'note'
        ? current.current.notes.find((note) => note.id === action.id)
        : current.current.folders.find((folder) => folder.id === action.id)
    if (!item?.trashBatchId || !item.deletedAt) return
    await client.move(
      path,
      `.devnotes/trash/${item.trashBatchId}/${baseName(path)}`,
    )
    const inside = (itemPath: string) =>
      itemPath === path || itemPath.startsWith(`${path}/`)
    metadata.current.trash.push({
      id: action.id,
      kind: action.kind,
      name:
        'title' in item
          ? item.title || baseName(path).replace(/\.(md|markdown)$/i, '')
          : item.name,
      path,
      batch: item.trashBatchId,
      deletedAt: item.deletedAt,
      items: metadata.current.items
        .filter((entry) => inside(entry.path))
        .map((entry) => ({
          ...entry,
          path: entry.path === path ? '' : entry.path.slice(path.length + 1),
        })),
    })
    metadata.current.items = metadata.current.items.filter(
      (entry) => !inside(entry.path),
    )
    metadataDirty.current = true
  }

  async function restore(id: string) {
    if (!client) return
    const entry = metadata.current.trash.find((item) => item.id === id)
    if (!entry) throw new WorkspaceError('Este item não está mais na lixeira.')
    const directory = parentPath(entry.path)
    await ensureDirectory(directory)
    const target = availablePath(
      paths.current.values(),
      directory,
      baseName(entry.path),
    )
    await client.move(
      `.devnotes/trash/${entry.batch}/${baseName(entry.path)}`,
      target,
    )
    await client.remove(`.devnotes/trash/${entry.batch}`)
    metadata.current.trash = metadata.current.trash.filter(
      (item) => item !== entry,
    )
    metadata.current.items.push(
      ...entry.items.map((item) => ({
        ...item,
        path: item.path ? `${target}/${item.path}` : target,
      })),
    )
    metadataDirty.current = true
  }

  async function purge(id: string) {
    if (!client) return
    const entry = metadata.current.trash.find((item) => item.id === id)
    if (!entry) return
    await client.remove(`.devnotes/trash/${entry.batch}`)
    for (const item of entry.items) await client.remove(historyPath(item.id))
    metadata.current.trash = metadata.current.trash.filter(
      (item) => item !== entry,
    )
    metadataDirty.current = true
  }

  async function duplicateFolder(id: string, newId: string) {
    if (!client) return
    const path = requirePath(id)
    const target = availablePath(
      paths.current.values(),
      parentPath(path),
      `${baseName(path).slice(0, 80)} (cópia)`,
    )
    const inside = (itemPath: string) =>
      itemPath === path || itemPath.startsWith(`${path}/`)
    const originals = metadata.current.items.filter((item) => inside(item.path))
    const ids = new Map(
      originals.map((item) => [
        item.id,
        item.id === id ? newId : crypto.randomUUID(),
      ]),
    )
    await client.copy(path, target)
    for (const item of originals)
      trackItem(ids.get(item.id)!, repath(item.path, path, target))
    // Links between copied documents should point to the copies, as in the browser workspace.
    for (const note of current.current.notes) {
      const file = files.current.get(note.id)
      const notePath = paths.current.get(note.id)
      if (!file || !notePath || !inside(notePath) || note.protection) continue
      const content = remapNoteLinks(note.content, ids)
      if (content === note.content) continue
      const copyPath = repath(notePath, path, target)
      await client.writeFile(
        copyPath,
        serializeLocalNote(
          { ...note, content },
          {
            noteId: note.id,
            path: copyPath,
            baseline: file.raw,
            disk: file.raw,
          },
        ),
        file.version,
      )
    }
  }

  function saveNote(note: Note, forceRevision = false) {
    const workspace = current.current
    const previous = workspace.notes.find((item) => item.id === note.id)
    const saved = previous
      ? recordRevision(previous, note, forceRevision)
      : note
    setModel({
      ...workspace,
      notes: previous
        ? workspace.notes.map((item) => (item.id === note.id ? saved : item))
        : [saved, ...workspace.notes],
    })
    pending.current.add(note.id)
    if (previous && paths.current.has(note.id)) scheduleFlush()
    else void flush()
    return true
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
    const trimmed = validateDiskFolderName(name)
    if (
      workspace.folders.some(
        (folder) =>
          !folder.deletedAt &&
          folder.parentId === parentId &&
          folder.name.toLocaleLowerCase('pt-BR') ===
            trimmed.toLocaleLowerCase('pt-BR'),
      )
    )
      throw new WorkspaceError('Já existe uma pasta com esse nome neste local.')
    const directory = parentId ? requirePath(parentId) : ''
    const folder: WorkspaceFolder = {
      id: crypto.randomUUID(),
      name: trimmed,
      ...(parentId ? { parentId } : {}),
    }
    publish({ error: null })
    setModel({ ...workspace, folders: [...workspace.folders, folder] })
    void structural(async () => {
      const path = childPath(directory, trimmed)
      await client?.createDirectory(path)
      trackItem(folder.id, path)
    })
    return folder
  }

  function importFolder(notes: Note[], folders: WorkspaceFolder[]) {
    const workspace = current.current
    setModel({
      ...workspace,
      notes: [...notes, ...workspace.notes],
      folders: [...workspace.folders, ...folders],
    })
    void structural(async () => {
      const remaining = [...folders]
      while (remaining.length) {
        const index = remaining.findIndex(
          (folder) => !folder.parentId || paths.current.has(folder.parentId),
        )
        if (index < 0) break
        const [folder] = remaining.splice(index, 1)
        const directory = folder!.parentId
          ? paths.current.get(folder!.parentId)!
          : ''
        const path = availablePath(
          paths.current.values(),
          directory,
          diskFolderName(folder!.name),
        )
        await client?.createDirectory(path)
        trackItem(folder!.id, path)
      }
      for (const note of notes) await writeNote(note.id)
    })
  }

  function replaceItems(notes: Note[], folders: WorkspaceFolder[]) {
    const workspace = current.current
    for (const folder of folders) {
      const previous = workspace.folders.find((item) => item.id === folder.id)
      if (
        !previous ||
        JSON.stringify(previous.protection) ===
          JSON.stringify(folder.protection)
      )
        continue
      metadata.current.items = metadata.current.items.map((item) => {
        if (item.id !== folder.id) return item
        const next = { ...item }
        delete next.protection
        return folder.protection
          ? { ...next, protection: folder.protection }
          : next
      })
      metadataDirty.current = true
    }
    for (const note of notes) {
      const previous = workspace.notes.find((item) => item.id === note.id)
      if (
        !previous ||
        previous.title !== note.title ||
        previous.content !== note.content ||
        previous.revisions !== note.revisions ||
        JSON.stringify(previous.protection) !== JSON.stringify(note.protection)
      )
        pending.current.add(note.id)
    }
    setModel({ ...workspace, notes, folders })
    void flush()
    return true
  }

  function runAction(action: WorkspaceAction): boolean {
    const workspace = current.current
    publish({ error: null })
    const waiting = (id: string | undefined) =>
      !!id &&
      !paths.current.has(id) &&
      [...workspace.notes, ...workspace.folders].some(
        (item) => item.id === id && !item.deletedAt,
      )
    if (
      action.type !== 'restore' &&
      action.type !== 'purge' &&
      (waiting(action.id) ||
        (action.type === 'move' && waiting(action.parentId)))
    ) {
      // A new page or folder is still being written; act once it exists on disk.
      void enqueue(writePending).then(() => {
        try {
          runAction(action)
        } catch (error) {
          report(error)
        }
      })
      return true
    }
    if (action.type === 'duplicate' && action.kind === 'folder') {
      const folder = workspace.folders.find((item) => item.id === action.id)
      if (!folder || folder.deletedAt)
        throw new WorkspaceError('Este item não está mais disponível.')
      requirePath(action.id)
      void structural(() => duplicateFolder(action.id, action.newId))
      return true
    }
    if (action.type === 'rename' && action.kind === 'folder')
      validateDiskFolderName(action.name)
    if (action.type !== 'restore' && action.type !== 'purge')
      requirePath(action.id)
    if (action.type === 'move' && action.parentId) requirePath(action.parentId)
    const next = applyWorkspaceAction(workspace, action)
    setModel(next)
    if (action.type === 'favorite') {
      const favorite = next.notes.find(
        (note) => note.id === action.id,
      )?.favorite
      metadata.current.items = metadata.current.items.map((item) => {
        if (item.id !== action.id) return item
        const updated = { ...item }
        delete updated.favorite
        return favorite ? { ...updated, favorite: true as const } : updated
      })
      metadataDirty.current = true
      void enqueue(persistMetadata)
    } else if (action.type === 'duplicate') {
      pending.current.add(action.newId)
      void flush()
    } else if (action.type === 'rename' && action.kind === 'note') {
      void structural(() => renameNote(action.id))
    } else if (action.type === 'rename') {
      const path = requirePath(action.id)
      void structural(() =>
        move(action.id, parentPath(path), action.name.trim()),
      )
    } else if (action.type === 'move') {
      const path = requirePath(action.id)
      const directory = action.parentId ? requirePath(action.parentId) : ''
      void structural(() => move(action.id, directory, baseName(path)))
    } else if (action.type === 'trash') {
      void structural(() => trash(action))
    } else if (action.type === 'restore') {
      void structural(() => restore(action.id))
    } else if (action.type === 'purge') {
      void structural(() => purge(action.id))
    }
    return true
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

  function resolveConflict(id: string, choice: 'disk' | 'local') {
    const conflict = conflicts.current.get(id)
    if (!conflict || !client) return
    publish({ error: null })
    void enqueue(async () => {
      conflicts.current.delete(id)
      const local = current.current.notes.find((note) => note.id === id)
      if (choice === 'local') {
        if (conflict.kind === 'changed')
          files.current.set(id, await client.readFile(conflict.path))
        else files.current.delete(id)
        pending.current.add(id)
        await writePending()
      } else if (conflict.kind === 'changed' && local) {
        const disk = await client.readFile(conflict.path)
        const parsed = parseMarkdownFile(baseName(conflict.path), disk.raw)
        if (parsed.protection)
          parsed.protection = {
            ...parsed.protection,
            ownerId: local.protection?.ownerId ?? id,
          }
        const loaded = { ...local, ...parsed }
        if (!parsed.protection) delete loaded.protection
        files.current.set(id, disk)
        pending.current.delete(id)
        // The discarded text remains available in the document history.
        setModel({
          ...current.current,
          notes: current.current.notes.map((note) =>
            note.id === id ? recordRevision(local, loaded, true) : note,
          ),
        })
        await writeNote(id)
      } else {
        pending.current.delete(id)
        paths.current.delete(id)
        files.current.delete(id)
        metadata.current.items = metadata.current.items.filter(
          (item) => item.id !== id,
        )
        metadataDirty.current = true
        setModel({
          ...current.current,
          notes: current.current.notes.filter((note) => note.id !== id),
        })
        await persistMetadata()
      }
      publish()
    })
  }

  function loadPdf(id: string) {
    const path = paths.current.get(id)
    if (!client || !path || pdfRequests.current.has(id)) return
    pdfRequests.current.add(id)
    void client
      .pdf(path)
      .then((data) =>
        setState((previous) => ({
          ...previous,
          pdfData: new Map(previous.pdfData).set(id, data),
        })),
      )
      .catch((error: unknown) => {
        pdfRequests.current.delete(id)
        report(error)
      })
  }

  useEffect(() => {
    if (!client) return
    let last = Date.now()
    const initial = setTimeout(() => void enqueue(refresh), 0)
    function refreshWhenIdle() {
      if (
        document.visibilityState === 'hidden' ||
        Date.now() - last < 2000 ||
        active.current > 0 ||
        pending.current.size > 0
      )
        return
      last = Date.now()
      void enqueue(refresh)
    }
    window.addEventListener('focus', refreshWhenIdle)
    document.addEventListener('visibilitychange', refreshWhenIdle)
    return () => {
      clearTimeout(initial)
      window.removeEventListener('focus', refreshWhenIdle)
      document.removeEventListener('visibilitychange', refreshWhenIdle)
    }
    // The client is fixed for the page; the queue functions only read refs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [client])

  useEffect(() => {
    if (!state.saving) return
    function warnBeforeLeaving(event: BeforeUnloadEvent) {
      event.preventDefault()
      event.returnValue = ''
    }
    window.addEventListener('beforeunload', warnBeforeLeaving)
    return () => window.removeEventListener('beforeunload', warnBeforeLeaving)
  }, [state.saving])

  return {
    runAction,
    restoreRevision,
    suppressedExampleIds: [] as string[],
    notes: state.workspace.notes,
    folders: state.workspace.folders,
    error: state.error,
    saveNote,
    addNote,
    addFolder,
    importFolder,
    replaceItems,
    disk: {
      active: !!client,
      loading: state.loading,
      name: state.name,
      path: state.path,
      skipped: state.skipped,
      saving: state.saving,
      pdfs: state.pdfs,
      pdfData: (id: string) => state.pdfData.get(id),
      pathOf: (id: string) => state.paths.get(id),
      conflict: state.conflicts[0] ?? null,
      loadPdf,
      flush,
      resolveConflict,
      refresh: () => enqueue(refresh),
    },
  }
}
