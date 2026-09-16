import { act, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { localFolderFixture } from '@/test/local-folder-fixture'
import { useWorkspace } from './use-workspace'

const original = '# Guide\n\n- [ ] Deliver'

function setup() {
  const fixture = localFolderFixture({ 'guide.md': original })
  window.showDirectoryPicker = vi.fn().mockResolvedValue(fixture.root)
  return { ...fixture, ...renderHook(() => useWorkspace()) }
}

afterEach(() => {
  delete window.showDirectoryPicker
})

describe('Connected workspace', () => {
  it('creates a named folder in a chosen computer location', async () => {
    const { result, directories } = setup()
    await act(() => result.current.localFolder.create('Loggi'))
    const folder = result.current.folders.find((item) => item.name === 'Loggi')
    expect(window.showDirectoryPicker).toHaveBeenCalledWith({
      mode: 'readwrite',
    })
    expect(directories.has('Loggi')).toBe(true)
    expect(result.current.localFolder.rootName).toBe('Loggi')
    expect(result.current.selectedFolder).toBe(folder?.id)
    expect(result.current.localFolder.message).toContain('criada no computador')
  })

  it('keeps a new computer folder under the selected workspace parent', async () => {
    const { result, disk } = setup()
    act(() => result.current.createFolder('docs'))
    const docs = result.current.folders.find((item) => item.name === 'docs')!
    await act(() => result.current.localFolder.create('Loggiq', docs.id))
    const loggiq = result.current.folders.find(
      (item) => item.name === 'Loggiq',
    )!
    expect(loggiq.parentId).toBe(docs.id)
    expect(result.current.selectedFolder).toBe(loggiq.id)
    act(() => result.current.createPage('Guide', 'Nested content'))
    const note = result.current.documents.find(
      (item) => item.title === 'Guide',
    )!
    await act(() => result.current.localFolder.save(note.id, 'guide.md'))
    expect(disk.get('Loggiq/guide.md')).toBe('# Guide\n\nNested content')
    expect(
      result.current.folders.filter((item) => item.name === 'Loggiq'),
    ).toHaveLength(1)
    expect(
      result.current.documents.find((item) => item.id === note.id)?.folderId,
    ).toBe(loggiq.id)
  })

  it('saves an existing workspace folder and its Markdown files on the computer', async () => {
    const { result, directories, disk } = setup()
    act(() => result.current.createFolder('Loggi'))
    const folder = result.current.folders.find((item) => item.name === 'Loggi')!
    act(() => result.current.createFolder('Empty'))
    act(() => result.current.setSelectedFolder(folder.id))
    act(() => result.current.createPage('Runbook', 'Deployment notes'))
    await act(() => result.current.localFolder.saveWorkspaceFolder(folder.id))
    expect(directories.has('Loggi')).toBe(true)
    expect(directories.has('Loggi/Empty')).toBe(true)
    expect(disk.get('Loggi/Runbook.md')).toBe('# Runbook\n\nDeployment notes')
    expect(
      result.current.documents.find((note) => note.title === 'Runbook')
        ?.sourcePath,
    ).toBe('Loggi/Runbook.md')
    expect(result.current.localFolder.rootName).toBe('Loggi')
  })

  it('imports without writing, persists explicit edits and loads external changes', async () => {
    const { result, disk, writes } = setup()
    await act(() => result.current.localFolder.connect())
    expect(window.showDirectoryPicker).toHaveBeenCalledWith({
      mode: 'readwrite',
    })
    expect(writes).not.toHaveBeenCalled()
    expect(result.current.openNotes.map((note) => note.title)).toEqual([
      'Guide',
    ])
    const note = result.current.documents.find(
      (item) => item.sourcePath === 'Project/guide.md',
    )!
    act(() => result.current.editNote({ ...note, content: '- [x] Deliver' }))
    expect(result.current.localFolder.files[0]?.status).toBe('modified')
    expect(disk.get('guide.md')).toBe(original)
    await act(() => result.current.localFolder.save(note.id))
    expect(disk.get('guide.md')).toBe('# Guide\n\n- [x] Deliver')
    disk.set('guide.md', '# Guide\n\nExternal change')
    await act(() => result.current.localFolder.check())
    expect(
      result.current.documents.find((item) => item.id === note.id)?.content,
    ).toBe('External change')
    expect(result.current.localFolder.files[0]?.status).toBe('saved')
  })
  it('requires a conflict decision and rejects a decision made against stale disk content', async () => {
    const { result, disk, writes } = setup()
    await act(() => result.current.localFolder.connect())
    const note = result.current.localFolder.files[0]!.note
    act(() => result.current.editNote({ ...note, content: 'Local' }))
    disk.set('guide.md', '# Guide\n\nExternal')
    await act(() => result.current.localFolder.save(note.id))
    expect(result.current.localFolder.files[0]?.status).toBe('conflict')
    expect(writes).not.toHaveBeenCalled()
    disk.set('guide.md', '# Guide\n\nNewer external')
    await act(() =>
      result.current.localFolder.save(note.id, undefined, 'local'),
    )
    expect(result.current.localFolder.error).toContain('mudou')
    expect(writes).not.toHaveBeenCalled()
    await act(() => result.current.localFolder.save(note.id, undefined, 'disk'))
    const updated = result.current.documents.find(
      (item) => item.id === note.id,
    )!
    expect(updated.content).toBe('Newer external')
    expect(
      updated.revisions?.some((revision) => revision.content === 'Local'),
    ).toBe(true)
  })
  it('reconnects after reload without duplicating notes or discarding unsaved content', async () => {
    const { result, unmount } = setup()
    await act(() => result.current.localFolder.connect())
    const note = result.current.localFolder.files[0]!.note
    act(() => result.current.editNote({ ...note, content: 'Unsaved local' }))
    unmount()
    const second = renderHook(() => useWorkspace())
    expect(second.result.current.localFolder.rootName).toBeUndefined()
    await act(() => second.result.current.localFolder.connect())
    expect(
      second.result.current.documents.filter(
        (item) => item.sourcePath === 'Project/guide.md',
      ),
    ).toHaveLength(1)
    expect(second.result.current.localFolder.files[0]?.status).toBe('conflict')
    expect(second.result.current.localFolder.files[0]?.note.content).toBe(
      'Unsaved local',
    )
  })
  it('imports newly discovered files and reports deletions without removing notes', async () => {
    const { result, disk } = setup()
    await act(() => result.current.localFolder.connect())
    disk.delete('guide.md')
    disk.set('new.md', '# New\n\nNew content')
    await act(() => result.current.localFolder.check())
    const missing = result.current.localFolder.files.find(
      (file) => file.path === 'guide.md',
    )!
    expect(missing.status).toBe('missing')
    expect(
      result.current.documents.some((note) => note.title === 'Guide'),
    ).toBe(true)
    expect(result.current.documents.some((note) => note.title === 'New')).toBe(
      true,
    )
    await act(() => result.current.localFolder.save(missing.noteId))
    expect(disk.has('guide.md')).toBe(false)
    await act(() =>
      result.current.localFolder.save(missing.noteId, undefined, 'local'),
    )
    expect(disk.get('guide.md')).toBe(original)
  })
  it('discovers PDFs added to a connected folder and removes missing PDFs from the sidebar', async () => {
    const { result, disk } = setup()
    await act(() => result.current.localFolder.connect())
    const bytes = new TextEncoder().encode('%PDF-1.7\n%%EOF')
    disk.set('reference.pdf', bytes)

    await act(() => result.current.localFolder.check())

    const pdf = result.current.documents.find(
      (item) => item.sourcePath === 'Project/reference.pdf',
    )
    expect(pdf).toMatchObject({
      title: 'reference',
      mediaType: 'pdf',
    })
    expect(pdf?.folderId).toBe(
      result.current.folders.find((folder) => folder.name === 'Project')?.id,
    )
    expect(Array.from(result.current.pdfData(pdf!.id) ?? [])).toEqual(
      Array.from(bytes),
    )
    expect(result.current.localFolder.pdfCount).toBe(1)
    expect(result.current.localFolder.message).toContain(
      '1 PDF está disponível',
    )

    disk.delete('reference.pdf')
    await act(() => result.current.localFolder.check())

    expect(result.current.documents.some((item) => item.id === pdf?.id)).toBe(
      false,
    )
    expect(result.current.localFolder.pdfCount).toBe(0)
  })
  it('saves a temporary note as a new file and clears its draft status', async () => {
    const { result, disk } = setup()
    await act(() => result.current.localFolder.connect())
    act(() => result.current.newDocument())
    act(() =>
      result.current.editNote({
        ...result.current.activeNote,
        title: 'New',
        content: 'Draft',
      }),
    )
    await act(() =>
      result.current.localFolder.save(
        result.current.activeNote.id,
        'sub/new.md',
      ),
    )
    expect(disk.get('sub/new.md')).toBe('# New\n\nDraft')
    expect(result.current.isDraft).toBe(false)
  })
  it('uses the filename for an untitled draft and reports it as saved', async () => {
    const { result, disk } = setup()
    await act(() => result.current.localFolder.connect())
    act(() => result.current.newDocument())
    act(() =>
      result.current.editNote({
        ...result.current.activeNote,
        content: 'Untitled body',
      }),
    )
    await act(() =>
      result.current.localFolder.save(
        result.current.activeNote.id,
        'untitled.md',
      ),
    )
    expect(disk.get('untitled.md')).toBe('Untitled body')
    expect(result.current.activeNote.title).toBe('untitled')
    expect(
      result.current.localFolder.files.find(
        (file) => file.path === 'untitled.md',
      )?.status,
    ).toBe('saved')
  })

  it('retains the replaced external version in history when resolving with local content', async () => {
    const { result, disk } = setup()
    await act(() => result.current.localFolder.connect())
    const note = result.current.localFolder.files[0]!.note
    act(() => result.current.editNote({ ...note, content: 'Local choice' }))
    disk.set('guide.md', '# Guide\n\nExternal choice')
    await act(() => result.current.localFolder.check())
    await act(() =>
      result.current.localFolder.save(note.id, undefined, 'local'),
    )
    expect(disk.get('guide.md')).toBe('# Guide\n\nLocal choice')
    expect(
      result.current.documents
        .find((item) => item.id === note.id)
        ?.revisions?.some((revision) => revision.content === 'External choice'),
    ).toBe(true)
  })

  it('preserves both documents on name collision and ignores trashed files during scans', async () => {
    const { result, disk } = setup()
    await act(() => result.current.localFolder.connect())
    const note = result.current.localFolder.files[0]!.note
    act(() => result.current.newDocument())
    await act(() =>
      result.current.localFolder.save(result.current.activeNote.id, 'guide.md'),
    )
    expect(result.current.localFolder.error).toContain('outro documento')
    expect(disk.get('guide.md')).toBe(original)
    act(() =>
      result.current.performAction({
        kind: 'note',
        type: 'trash',
        id: note.id,
      }),
    )
    await act(() => result.current.localFolder.check())
    expect(result.current.localFolder.files).toHaveLength(0)
    expect(result.current.documents.some((item) => item.id === note.id)).toBe(
      false,
    )
    expect(disk.get('guide.md')).toBe(original)
  })
  it('keeps the workspace and disk intact on permission failure or cancellation', async () => {
    const { result, writes } = setup()
    window.showDirectoryPicker = vi
      .fn()
      .mockRejectedValue(new DOMException('Denied', 'NotAllowedError'))
    await act(() => result.current.localFolder.connect())
    expect(result.current.localFolder.error).toContain('permissão')
    expect(writes).not.toHaveBeenCalled()
    window.showDirectoryPicker = vi
      .fn()
      .mockRejectedValue(new DOMException('Canceled', 'AbortError'))
    await act(() => result.current.localFolder.connect())
    expect(result.current.localFolder.error).toBe('')
    expect(result.current.localFolder.rootName).toBeUndefined()
  })
})
