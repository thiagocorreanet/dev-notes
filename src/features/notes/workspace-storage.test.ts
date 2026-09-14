import { describe, expect, it, vi } from 'vitest'
import {
  emptyWorkspace,
  loadWorkspace,
  parseWorkspace,
  persistWorkspace,
  WORKSPACE_KEY,
} from './workspace-storage'
import { protectNote } from './document-protection'

describe('Workspace persistence', () => {
  it('reads legacy notes without deleting or rewriting the original storage', () => {
    const legacy = JSON.stringify([
      { id: 'legacy', title: 'Existing note', content: 'Keep this' },
    ])
    localStorage.setItem('dev-notes:notes:v1', legacy)
    const { workspace } = loadWorkspace()
    expect(workspace.notes[0]?.title).toBe('Existing note')
    expect(localStorage.getItem(WORKSPACE_KEY)).toBeNull()
    expect(persistWorkspace(workspace)).toBe(true)
    expect(localStorage.getItem('dev-notes:notes:v1')).toBe(legacy)
    expect(loadWorkspace().workspace).toEqual(workspace)
  })

  it.each([
    { folders: [{ id: 'a', name: 'A', parentId: 'a' }] },
    {
      folders: [
        { id: 'a', name: 'A', parentId: 'b' },
        { id: 'b', name: 'B', parentId: 'a' },
      ],
    },
    { folders: [{ id: 'a', name: 'A', parentId: 'missing' }] },
    { notes: [{ id: 'a', title: 'A', content: '', folderId: 'missing' }] },
    {
      notes: [
        { id: 'a', title: 'A', content: '' },
        { id: 'a', title: 'B', content: '' },
      ],
    },
  ])(
    'rejects invalid folder references and duplicate identifiers: %j',
    (fields) => {
      expect(() =>
        parseWorkspace(JSON.stringify({ ...emptyWorkspace(), ...fields })),
      ).toThrow()
    },
  )

  it('keeps malformed workspace data untouched until an explicit save', () => {
    localStorage.setItem(WORKSPACE_KEY, '{broken')
    expect(loadWorkspace().error).toBeTruthy()
    expect(localStorage.getItem(WORKSPACE_KEY)).toBe('{broken')
  })

  it('never persists clear content or revisions for a protected document', async () => {
    const { locked } = await protectNote(
      { id: 'private', title: 'Private', content: 'plain-text secret' },
      'secure-password',
    )
    const unsafeRuntimeCopy = {
      ...locked,
      content: 'plain-text secret',
      revisions: [
        {
          id: 'revision',
          title: 'Private',
          content: 'revision secret',
          createdAt: '2026-09-14T12:00:00.000Z',
        },
      ],
    }

    expect(
      persistWorkspace({ ...emptyWorkspace(), notes: [unsafeRuntimeCopy] }),
    ).toBe(true)
    const stored = localStorage.getItem(WORKSPACE_KEY) ?? ''
    expect(stored).not.toContain('plain-text secret')
    expect(stored).not.toContain('revision secret')
    expect(parseWorkspace(stored).notes[0]?.protection).toBeDefined()
  })

  it('reports storage failures', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError')
    })
    expect(persistWorkspace(emptyWorkspace())).toBe(false)
  })
})
