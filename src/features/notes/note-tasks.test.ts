import { describe, expect, it } from 'vitest'
import { isWithinFolder, noteTasks, toggleNoteTask } from './note-tasks'

const note = { id: 'note', title: 'Tasks', content: '' }

describe('Markdown task extraction', () => {
  it('extracts nested, ordered and quoted tasks but excludes code and ordinary lists', () => {
    const content =
      '- [ ] **Parent**\n  - [x] Child\n\n> 1. [X] Quoted\n\n```md\n- [ ] Example\n```\n\n    - [ ] Indented code\n\n- Ordinary list\n\n`- [ ] Inline code`'
    expect(
      noteTasks({ ...note, content }).map(({ label, checked }) => ({
        label,
        checked,
      })),
    ).toEqual([
      { label: 'Parent', checked: false },
      { label: 'Child', checked: true },
      { label: 'Quoted', checked: true },
    ])
  })
  it('changes only the selected checkbox and preserves duplicate labels, CRLF and formatting', () => {
    const original = {
      ...note,
      content: '* [ ] **Repeat**\r\n* [ ] **Repeat**\r\n',
    }
    const tasks = noteTasks(original)
    const updated = toggleNoteTask(original, tasks[1]!, true)
    expect(updated.content).toBe('* [ ] **Repeat**\r\n* [x] **Repeat**\r\n')
    expect(toggleNoteTask(updated, tasks[1]!, false).content).toBe(
      original.content,
    )
  })
  it('ignores stale task positions and trashed notes', () => {
    const original = { ...note, content: '- [ ] Deliver' }
    const task = noteTasks(original)[0]!
    const changed = { ...original, content: 'Intro\n\n- [ ] Deliver' }
    expect(toggleNoteTask(changed, task, true)).toBe(changed)
    expect(
      noteTasks({ ...original, deletedAt: new Date().toISOString() }),
    ).toEqual([])
  })
  it('includes descendant folders without looping through invalid hierarchies', () => {
    const folders = [
      { id: 'a', name: 'A' },
      { id: 'b', name: 'B', parentId: 'a' },
    ]
    expect(isWithinFolder({ ...note, folderId: 'b' }, 'a', folders)).toBe(true)
    expect(
      isWithinFolder({ ...note, folderId: 'b' }, 'other', [
        { ...folders[1]!, parentId: 'b' },
      ]),
    ).toBe(false)
  })
})
