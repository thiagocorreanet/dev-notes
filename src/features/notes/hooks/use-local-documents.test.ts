import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useWorkspace } from './use-workspace'
import { TABS_KEY } from '../workspace-tabs'

const path = '/home/user/Notes/a space & ação.md'
const original = {
  path,
  name: 'a space & ação.md',
  raw: '# Guide\r\n\r\nOriginal\r\n',
  version: 'initial-version',
}

afterEach(() => {
  history.replaceState(null, '', '/')
  vi.unstubAllGlobals()
})

function setup() {
  history.replaceState(
    null,
    '',
    `/?ws=1&${new URLSearchParams({ file: path })}`,
  )
  const fetch = vi
    .fn<typeof window.fetch>()
    .mockResolvedValue(new Response(JSON.stringify(original)))
  vi.stubGlobal('fetch', fetch)
  return { fetch, ...renderHook(() => useWorkspace()) }
}

describe('Local document launch', () => {
  it('opens only the requested document instead of restoring workspace tabs', async () => {
    const previousTabs = JSON.stringify({
      ids: ['example-getting-started', 'example-markdown-reference'],
      activeId: 'example-markdown-reference',
    })
    localStorage.setItem(TABS_KEY, previousTabs)
    const { result } = setup()
    expect(result.current.openNotes).toEqual([])
    await waitFor(() => expect(result.current.activeNote.sourcePath).toBe(path))
    expect(result.current.openNotes.map((note) => note.id)).toEqual([
      `local:${encodeURIComponent(path)}`,
    ])
    expect(localStorage.getItem(TABS_KEY)).toBe(previousTabs)
  })

  it('opens the URL file and writes only on explicit save, preserving the original heading and line endings', async () => {
    const { result, fetch } = setup()
    await waitFor(() => expect(result.current.activeNote.sourcePath).toBe(path))
    expect(result.current.activeNote.title).toBe('Guide')
    expect(result.current.activeNote.content).toBe('Original\r\n')
    expect(fetch).toHaveBeenCalledWith(
      `/api/document?${new URLSearchParams({ file: path })}`,
      expect.objectContaining({ method: 'GET' }),
    )
    act(() =>
      result.current.editNote({
        ...result.current.activeNote,
        content: 'Edited\r\n',
      }),
    )
    expect(fetch).toHaveBeenCalledTimes(1)
    expect(
      result.current.localDocuments.isDirty(result.current.activeNote.id),
    ).toBe(true)
    const leave = new Event('beforeunload', { cancelable: true })
    window.dispatchEvent(leave)
    expect(leave.defaultPrevented).toBe(true)
    fetch.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          ...original,
          raw: '# Guide\r\n\r\nEdited\r\n',
          version: 'saved-version',
        }),
      ),
    )
    await act(() => result.current.savePage())
    expect(fetch).toHaveBeenLastCalledWith(
      expect.any(String),
      expect.objectContaining({
        method: 'PUT',
        body: JSON.stringify({
          raw: '# Guide\r\n\r\nEdited\r\n',
          version: 'initial-version',
        }),
      }),
    )
    expect(
      result.current.localDocuments.isDirty(result.current.activeNote.id),
    ).toBe(false)
    expect(result.current.message).toContain('Arquivo salvo:')
  })

  it('shows saving until the disk confirms and clears success when the document changes', async () => {
    const { result, fetch } = setup()
    expect(result.current.localDocuments.loading).toBe(true)
    await waitFor(() => expect(result.current.activeNote.sourcePath).toBe(path))
    expect(result.current.localDocuments.loading).toBe(false)
    let finish!: (response: Response) => void
    fetch.mockReturnValueOnce(
      new Promise<Response>((resolve) => {
        finish = resolve
      }),
    )
    let saving!: Promise<boolean>
    act(() => {
      saving = result.current.savePage()
    })
    expect(result.current.pageSaveState).toBe('saving')
    expect(result.current.busy).toBe(true)
    await act(async () => {
      finish(new Response(JSON.stringify(original)))
      await saving
    })
    expect(result.current.pageSaveState).toBe('saved')
    act(() =>
      result.current.editNote({
        ...result.current.activeNote,
        content: 'Another edit',
      }),
    )
    expect(result.current.pageSaveState).toBe('idle')
    fetch.mockResolvedValueOnce(new Response('{}', { status: 409 }))
    await act(() => result.current.savePage())
    expect(result.current.pageSaveState).toBe('error')
    expect(result.current.error).toContain('mudou no computador')
  })

  it('keeps the draft on conflict and reloads the original only after the refresh action', async () => {
    const { result, fetch } = setup()
    await waitFor(() => expect(result.current.activeNote.sourcePath).toBe(path))
    act(() =>
      result.current.editNote({
        ...result.current.activeNote,
        content: 'My draft',
      }),
    )
    fetch.mockResolvedValueOnce(new Response('{}', { status: 409 }))
    await act(() => result.current.savePage())
    expect(result.current.error).toContain('mudou no computador')
    expect(result.current.activeNote.content).toBe('My draft')
    act(() => result.current.requestRefresh())
    expect(result.current.refreshConfirmation?.content).toBe('My draft')
    fetch.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          ...original,
          raw: '# Guide\n\nExternal',
          version: 'external',
        }),
      ),
    )
    await act(() => result.current.refreshFile(result.current.activeNote))
    expect(result.current.activeNote.content).toBe('External')
    expect(result.current.error).toBeNull()
  })

  it('keeps workspace actions and history available without changing the original file', async () => {
    const { result, fetch } = setup()
    await waitFor(() => expect(result.current.activeNote.sourcePath).toBe(path))
    const id = result.current.activeNote.id
    act(() =>
      result.current.editNote({
        ...result.current.activeNote,
        content: 'Draft for history',
      }),
    )
    const revision = result.current.activeNote.revisions?.[0]
    expect(revision?.content).toBe('Original\r\n')
    act(() => {
      result.current.restoreRevision(id, revision!.id)
    })
    expect(result.current.activeNote.content).toBe('Original\r\n')
    act(() =>
      result.current.performAction({ kind: 'note', id, type: 'favorite' }),
    )
    expect(result.current.activeNote.favorite).toBe(true)
    act(() =>
      result.current.performAction({
        kind: 'note',
        id,
        type: 'rename',
        name: 'Renamed title',
      }),
    )
    expect(result.current.activeNote.title).toBe('Renamed title')
    act(() =>
      result.current.performAction({
        kind: 'note',
        id,
        type: 'duplicate',
        newId: 'copy',
      }),
    )
    expect(result.current.documents.some((note) => note.id === 'copy')).toBe(
      true,
    )
    expect(result.current.localDocuments.has('copy')).toBe(false)
    act(() => result.current.createFolder('Folder'))
    const folder = result.current.folders[0]!
    act(() =>
      result.current.performAction({
        kind: 'note',
        id,
        type: 'move',
        parentId: folder.id,
      }),
    )
    act(() =>
      result.current.performAction({
        kind: 'folder',
        id: folder.id,
        type: 'trash',
      }),
    )
    expect(result.current.localDocuments.has(id)).toBe(false)
    expect(result.current.allNotes.find((note) => note.id === id)?.title).toBe(
      'Renamed title',
    )
    expect(fetch).toHaveBeenCalledTimes(1)
  })

  it('offers an unsaved local draft after remount and clears it only after a successful disk save', async () => {
    const first = setup()
    await waitFor(() =>
      expect(first.result.current.activeNote.sourcePath).toBe(path),
    )
    act(() =>
      first.result.current.editNote({
        ...first.result.current.activeNote,
        content: 'Recover me',
      }),
    )
    first.unmount()
    const second = setup()
    await waitFor(() =>
      expect(second.result.current.localDocuments.recovery?.note.content).toBe(
        'Recover me',
      ),
    )
    expect(second.result.current.activeNote.content).toBe('Original\r\n')
    expect(second.result.current.busy).toBe(true)
    act(() => second.result.current.localDocuments.recover(true))
    expect(second.result.current.activeNote.content).toBe('Recover me')
    expect(second.result.current.busy).toBe(false)
    second.fetch.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          ...original,
          raw: '# Guide\r\n\r\nRecover me',
          version: 'saved-version',
        }),
      ),
    )
    await act(() => second.result.current.savePage())
    second.unmount()
    const third = setup()
    await waitFor(() =>
      expect(third.result.current.activeNote.sourcePath).toBe(path),
    )
    expect(third.result.current.localDocuments.recovery).toBeUndefined()
  })

  it('retains the original disk version when recovering against an externally changed file', async () => {
    const first = setup()
    await waitFor(() =>
      expect(first.result.current.activeNote.sourcePath).toBe(path),
    )
    act(() =>
      first.result.current.editNote({
        ...first.result.current.activeNote,
        content: 'My recovered text',
      }),
    )
    first.unmount()
    const fetch = vi.fn<typeof window.fetch>().mockResolvedValue(
      new Response(
        JSON.stringify({
          ...original,
          raw: '# Guide\n\nExternal edit',
          version: 'external-version',
        }),
      ),
    )
    vi.stubGlobal('fetch', fetch)
    const second = renderHook(() => useWorkspace())
    await waitFor(() =>
      expect(second.result.current.localDocuments.recovery).toBeDefined(),
    )
    act(() => second.result.current.localDocuments.recover(true))
    fetch.mockResolvedValueOnce(new Response('{}', { status: 409 }))
    await act(() => second.result.current.savePage())
    expect(fetch).toHaveBeenLastCalledWith(
      expect.any(String),
      expect.objectContaining({
        body: JSON.stringify({
          raw: '# Guide\r\n\r\nMy recovered text',
          version: 'initial-version',
        }),
      }),
    )
    expect(second.result.current.error).toContain('mudou no computador')
    expect(second.result.current.activeNote.content).toBe('My recovered text')
  })

  it('shows authorization errors without importing a document and does not call the local API in ordinary web mode', async () => {
    history.replaceState(null, '', '/?ws=1&file=/private.md')
    const fetch = vi
      .fn<typeof window.fetch>()
      .mockResolvedValue(new Response('{}', { status: 403 }))
    vi.stubGlobal('fetch', fetch)
    const view = renderHook(() => useWorkspace())
    await waitFor(() =>
      expect(view.result.current.error).toContain('não está autorizado'),
    )
    expect(view.result.current.localDocuments.notes).toHaveLength(0)
    view.unmount()
    fetch.mockClear()
    history.replaceState(null, '', '/')
    renderHook(() => useWorkspace())
    expect(fetch).not.toHaveBeenCalled()
  })
})
