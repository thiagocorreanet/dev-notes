import { act, renderHook } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import {
  emptyWorkspace,
  WORKSPACE_KEY,
  parseWorkspace,
} from './workspace-storage'
import { prepareWorkspaceBackup, readWorkspaceBackup } from './workspace-backup'
import { useNotes } from './hooks/use-notes'
import type { Workspace } from './types'

const backup: Workspace = {
  ...emptyWorkspace(),
  name: 'Recovered project',
  folders: [
    { id: 'folder', name: 'Design' },
    {
      id: 'trash',
      name: 'Old',
      deletedAt: '2026-09-12',
      trashBatchId: 'batch',
    },
  ],
  notes: [
    {
      id: 'a',
      title: 'First',
      content: '[Second](#note/b)',
      folderId: 'folder',
      sourcePath: '/private/original.md',
      favorite: true,
      revisions: [
        {
          id: 'revision',
          title: 'Before',
          content: '[Second](#note/b)',
          createdAt: '2026-09-12',
        },
      ],
    },
    {
      id: 'b',
      title: 'Second',
      content: 'Kept in trash',
      folderId: 'trash',
      deletedAt: '2026-09-12',
      trashBatchId: 'batch',
    },
  ],
}
function file(text: string, name = 'backup.json') {
  return { name, size: text.length, text: () => Promise.resolve(text) } as File
}

describe('Workspace backup recovery', () => {
  it('merges without overwriting collisions and remaps history links and trash groups', () => {
    const current = {
      ...emptyWorkspace(),
      notes: [{ id: 'a', title: 'Keep me', content: 'Original' }],
    }
    const result = prepareWorkspaceBackup(current, backup, 'merge', ['example'])
    expect(result.notes[0]).toEqual(current.notes[0])
    const imported = result.notes.find((note) => note.title === 'First')!
    const second = result.notes.find((note) => note.title === 'Second')!
    expect(imported.id).not.toBe('a')
    expect(imported.sourcePath).toBeUndefined()
    expect(imported.favorite).toBe(true)
    expect(imported.content).toBe(`[Second](#note/${second.id})`)
    expect(imported.revisions?.[0]?.content).toBe(imported.content)
    expect(second.trashBatchId).toBe(
      result.folders.find((folder) => folder.name === 'Old')?.trashBatchId,
    )
    expect(
      result.folders.find((folder) => folder.name === 'Design')?.parentId,
    ).toBe(result.folders[0]?.id)
    expect(parseWorkspace(JSON.stringify(result))).toEqual(result)
  })

  it('restores hierarchy and metadata while removing old notes and live source paths', () => {
    const current = {
      ...emptyWorkspace(),
      notes: [{ id: 'old', title: 'Old', content: 'Old' }],
    }
    const result = prepareWorkspaceBackup(current, backup, 'replace', [
      'example',
    ])
    expect(result.name).toBe('Recovered project')
    expect(result.notes).toHaveLength(2)
    expect(result.folders).toHaveLength(2)
    expect(result.folders[0]?.parentId).toBeUndefined()
    expect(result.suppressedExampleIds).toContain('example')
    expect(parseWorkspace(JSON.stringify(result))).toEqual(result)
  })

  it('rejects invalid formats, cyclic folders and oversized files', async () => {
    await expect(readWorkspaceBackup(file('{'))).rejects.toThrow('JSON válido')
    await expect(readWorkspaceBackup(file('{}', 'backup.md'))).rejects.toThrow(
      'JSON do DevNotes',
    )
    await expect(
      readWorkspaceBackup(file(JSON.stringify({ ...backup, version: 99 }))),
    ).rejects.toThrow('backup válido')
    await expect(
      readWorkspaceBackup(
        file(
          JSON.stringify({
            ...backup,
            folders: [{ id: 'folder', name: 'Cycle', parentId: 'folder' }],
          }),
        ),
      ),
    ).rejects.toThrow('estrutura de pastas')
    await expect(
      readWorkspaceBackup({ ...file('{}'), size: 21 * 1024 * 1024 }),
    ).rejects.toThrow('20 MB')
    await expect(
      readWorkspaceBackup(
        file(
          JSON.stringify({
            ...backup,
            notes: Array.from({ length: 2001 }, (_, i) => ({
              id: `${i}`,
              title: '',
              content: '',
            })),
          }),
        ),
      ),
    ).rejects.toThrow('2.000')
  })

  it('keeps memory and disk unchanged when storage is full or another tab changed the workspace', () => {
    const initial = JSON.stringify({
      ...emptyWorkspace(),
      notes: [{ id: 'old', title: 'Original', content: 'Keep' }],
    })
    localStorage.setItem(WORKSPACE_KEY, initial)
    const { result } = renderHook(useNotes)
    const set = vi
      .spyOn(Storage.prototype, 'setItem')
      .mockImplementation(() => {
        throw new DOMException('Quota exceeded', 'QuotaExceededError')
      })
    expect(() =>
      act(() => result.current.replaceFromBackup(backup, initial)),
    ).toThrow('mantidos')
    expect(result.current.notes[0]?.title).toBe('Original')
    expect(localStorage.getItem(WORKSPACE_KEY)).toBe(initial)
    set.mockRestore()
    localStorage.setItem(WORKSPACE_KEY, JSON.stringify(emptyWorkspace()))
    expect(() =>
      act(() => result.current.replaceFromBackup(backup, initial)),
    ).toThrow('outra aba')
    expect(result.current.notes[0]?.title).toBe('Original')
  })
})
