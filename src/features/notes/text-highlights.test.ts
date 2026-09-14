import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  createTextHighlight,
  loadTextHighlights,
  mapTextDocument,
  resolveTextHighlight,
  saveTextHighlights,
  TEXT_HIGHLIGHT_PREFIX,
} from './text-highlights'

function selectText(node: Text, start: number, end: number) {
  const range = document.createRange()
  range.setStart(node, start)
  range.setEnd(node, end)
  return range
}

describe('Visual text highlights', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
  })

  it('anchors a selected passage and finds it again after surrounding edits', () => {
    const root = document.createElement('div')
    root.innerHTML = '<p>Before selected passage after.</p>'
    document.body.append(root)
    const text = root.querySelector('p')!.firstChild as Text
    const highlight = createTextHighlight(
      root,
      selectText(text, 7, 23),
      'yellow',
      'highlight-1',
    )
    expect(highlight).toMatchObject({
      id: 'highlight-1',
      text: 'selected passage',
      color: 'yellow',
    })

    root.querySelector('p')!.prepend('New introduction. ')
    const resolved = resolveTextHighlight(mapTextDocument(root), highlight!)
    expect(resolved?.range.toString()).toBe('selected passage')
  })

  it('uses surrounding context to distinguish repeated passages', () => {
    const root = document.createElement('div')
    root.innerHTML = '<p>First repeated text.</p><p>Second repeated text.</p>'
    document.body.append(root)
    const second = root.querySelectorAll('p')[1]!.firstChild as Text
    const highlight = createTextHighlight(
      root,
      selectText(second, 7, 20),
      'blue',
      'highlight-2',
    )
    const resolved = resolveTextHighlight(mapTextDocument(root), highlight!)
    expect(resolved?.range.startContainer).toBe(second)
  })

  it('stores valid metadata separately and rejects malformed entries', () => {
    const highlights = [
      {
        id: 'highlight-3',
        text: 'Passage',
        prefix: '',
        suffix: '',
        start: 0,
        color: 'green' as const,
      },
    ]
    expect(saveTextHighlights('document.md', highlights)).toBe(true)
    expect(loadTextHighlights('document.md')).toEqual(highlights)

    localStorage.setItem(
      `${TEXT_HIGHLIGHT_PREFIX}${encodeURIComponent('invalid')}`,
      JSON.stringify([{ ...highlights[0], color: 'orange' }]),
    )
    expect(loadTextHighlights('invalid')).toEqual([])
  })

  it('reports unavailable browser storage without losing the current state', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError')
    })
    expect(
      saveTextHighlights('document', [
        {
          id: 'highlight-4',
          text: 'Passage',
          prefix: '',
          suffix: '',
          start: 0,
          color: 'pink',
        },
      ]),
    ).toBe(false)
  })
})
