import { describe, expect, it, vi } from 'vitest'
import { loadNotes, saveNotes } from './storage'

describe('Note storage', () => {
  it('starts empty when there is no saved data', () => {
    expect(loadNotes()).toEqual({ notes: [], error: null })
  })

  it.each([
    '{invalid',
    '{}',
    '[{"id":1,"title":"Test","content":"Text"}]',
    '[null]',
  ])('recovers from invalid data without overwriting it: %s', (value) => {
    localStorage.setItem('dev-notes:notes:v1', value)
    const result = loadNotes()
    expect(result.notes).toEqual([])
    expect(result.error).toEqual(expect.any(String))
    expect(localStorage.getItem('dev-notes:notes:v1')).toBe(value)
  })

  it('handles unavailable browser storage', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('SecurityError')
    })
    expect(loadNotes().error).toBeTruthy()
  })

  it('saves and restores valid notes', () => {
    const notes = [{ id: 'note-1', title: 'React', content: 'Hooks' }]
    expect(saveNotes(notes)).toBe(true)
    expect(loadNotes()).toEqual({ notes, error: null })
  })
})
