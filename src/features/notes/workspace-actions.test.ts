import { describe, expect, it } from 'vitest'
import { applyWorkspaceAction, recordRevision } from './workspace-actions'
import { emptyWorkspace, parseWorkspace } from './workspace-storage'
import type { Note, Workspace } from './types'

function fixture(): Workspace {
  return {
    ...emptyWorkspace(),
    folders: [
      { id: 'root', name: 'Project' },
      { id: 'child', name: 'API', parentId: 'root' },
      { id: 'other', name: 'Other' },
    ],
    notes: [
      {
        id: 'a',
        title: 'Guide',
        content: '[Second](#note/b)',
        folderId: 'child',
        sourcePath: 'Project/API/guide.md',
      },
      { id: 'b', title: 'Second', content: 'Body', folderId: 'child' },
    ],
  }
}

describe('Workspace organization', () => {
  it('renames and moves notes without changing their source files and records the old title', () => {
    const initial = fixture()
    const renamed = applyWorkspaceAction(initial, {
      kind: 'note',
      id: 'a',
      type: 'rename',
      name: ' Renamed ',
    })
    const moved = applyWorkspaceAction(renamed, {
      kind: 'note',
      id: 'a',
      type: 'move',
      parentId: 'other',
    })
    expect(moved.notes[0]).toMatchObject({
      title: 'Renamed',
      folderId: 'other',
      sourcePath: 'Project/API/guide.md',
    })
    expect(moved.notes[0]?.revisions?.[0]?.title).toBe('Guide')
    expect(initial.notes[0]?.title).toBe('Guide')
    expect(parseWorkspace(JSON.stringify(moved))).toEqual(moved)
  })
  it('rejects folder cycles, missing destinations, duplicate sibling names, and invalid names', () => {
    expect(() =>
      applyWorkspaceAction(fixture(), {
        kind: 'folder',
        id: 'root',
        type: 'move',
        parentId: 'child',
      }),
    ).toThrow('dela mesma')
    expect(() =>
      applyWorkspaceAction(fixture(), {
        kind: 'note',
        id: 'a',
        type: 'move',
        parentId: 'missing',
      }),
    ).toThrow('destino')
    expect(() =>
      applyWorkspaceAction(fixture(), {
        kind: 'folder',
        id: 'root',
        type: 'rename',
        name: 'Other',
      }),
    ).toThrow('Já existe')
    expect(() =>
      applyWorkspaceAction(fixture(), {
        kind: 'folder',
        id: 'root',
        type: 'rename',
        name: '../bad',
      }),
    ).toThrow('válido')
  })
  it('duplicates a folder subtree with fresh IDs and remaps links within the copy', () => {
    const copied = applyWorkspaceAction(fixture(), {
      kind: 'folder',
      id: 'root',
      type: 'duplicate',
      newId: 'copy',
    })
    const copyChild = copied.folders.find(
      (folder) => folder.parentId === 'copy',
    )!
    const copyNotes = copied.notes.filter(
      (note) => note.folderId === copyChild.id,
    )
    expect(copyNotes).toHaveLength(2)
    expect(copyNotes[0]?.content).toBe(`[Second](#note/${copyNotes[1]!.id})`)
    expect(copyNotes[0]?.sourcePath).toBeUndefined()
    expect(
      new Set([...copied.notes, ...copied.folders].map((item) => item.id)).size,
    ).toBe(9)
    expect(parseWorkspace(JSON.stringify(copied))).toEqual(copied)
  })
  it('restores folder batches while keeping previously deleted notes in the trash', () => {
    const first = applyWorkspaceAction(fixture(), {
      kind: 'note',
      id: 'a',
      type: 'trash',
    })
    const removed = applyWorkspaceAction(first, {
      kind: 'folder',
      id: 'root',
      type: 'trash',
    })
    expect(removed.notes.every((note) => note.deletedAt)).toBe(true)
    const restored = applyWorkspaceAction(removed, {
      kind: 'folder',
      id: 'root',
      type: 'restore',
    })
    expect(
      restored.notes.find((note) => note.id === 'a')?.deletedAt,
    ).toBeTruthy()
    expect(
      restored.notes.find((note) => note.id === 'b')?.deletedAt,
    ).toBeUndefined()
    expect(restored.folders.every((folder) => !folder.deletedAt)).toBe(true)
  })
  it('restores a single note with its ancestor folders and resolves name collisions without mutation', () => {
    const removed = applyWorkspaceAction(fixture(), {
      kind: 'folder',
      id: 'root',
      type: 'trash',
    })
    removed.folders.push({ id: 'new-root', name: 'Project' })
    const snapshot = JSON.stringify(removed)
    const restored = applyWorkspaceAction(removed, {
      kind: 'note',
      id: 'a',
      type: 'restore',
    })
    expect(
      restored.folders.find((folder) => folder.id === 'root')?.name,
    ).toMatch(/restaurada/)
    expect(restored.notes[0]?.deletedAt).toBeUndefined()
    expect(restored.notes[1]?.deletedAt).toBeTruthy()
    expect(JSON.stringify(removed)).toBe(snapshot)
    expect(parseWorkspace(JSON.stringify(restored))).toEqual(restored)
  })
  it('permanently removes only trashed subtrees and remembers deleted examples', () => {
    const initial = fixture()
    initial.notes.push({
      id: 'example-getting-started',
      title: 'Example',
      content: '',
      folderId: 'child',
    })
    expect(() =>
      applyWorkspaceAction(initial, {
        kind: 'folder',
        id: 'root',
        type: 'purge',
      }),
    ).toThrow('lixeira')
    const removed = applyWorkspaceAction(initial, {
      kind: 'folder',
      id: 'root',
      type: 'trash',
    })
    const purged = applyWorkspaceAction(removed, {
      kind: 'folder',
      id: 'root',
      type: 'purge',
    })
    expect(purged.folders).toEqual([{ id: 'other', name: 'Other' }])
    expect(purged.notes).toEqual([])
    expect(purged.suppressedExampleIds).toContain('example-getting-started')
  })
})

describe('Revision retention', () => {
  it('groups typing, bounds the history, and preserves the pre-restore content', () => {
    let note: Note = { id: 'n', title: 'Title', content: 'Original' }
    note = recordRevision(
      note,
      { ...note, content: 'First edit' },
      false,
      '2026-09-11T12:00:00Z',
    )
    note = recordRevision(
      note,
      { ...note, content: 'Second edit' },
      false,
      '2026-09-11T12:00:10Z',
    )
    expect(note.revisions).toHaveLength(1)
    expect(note.revisions?.[0]?.content).toBe('Original')
    note = recordRevision(
      note,
      { ...note, content: 'Original' },
      true,
      '2026-09-11T12:00:20Z',
    )
    expect(note.revisions?.[0]?.content).toBe('Second edit')
    for (let index = 0; index < 35; index++)
      note = recordRevision(note, { ...note, content: `Edit ${index}` }, true)
    expect(note.revisions).toHaveLength(30)
    expect(
      parseWorkspace(JSON.stringify({ ...emptyWorkspace(), notes: [note] }))
        .notes[0],
    ).toEqual(note)
  })
  it('rejects malformed revision metadata instead of discarding it silently', () => {
    expect(() =>
      parseWorkspace(
        JSON.stringify({
          ...emptyWorkspace(),
          notes: [
            {
              id: 'n',
              title: 'Title',
              content: '',
              revisions: [
                { id: 'r', title: '', content: '', createdAt: 'invalid' },
              ],
            },
          ],
        }),
      ),
    ).toThrow('backup válido')
  })
})
