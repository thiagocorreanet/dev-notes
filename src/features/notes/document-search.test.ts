import { describe, expect, it } from 'vitest'
import { findOffsets, findTextMatches } from './document-search'

describe('Document search', () => {
  it('matches literal punctuation and case without treating input as a pattern', () => {
    expect(findOffsets('a.b A.B a-b', 'a.b')).toEqual([
      { start: 0, end: 3 },
      { start: 4, end: 7 },
    ])
    expect(findOffsets('text', '')).toEqual([])
    expect(findOffsets('text', 'missing')).toEqual([])
  })
  it('finds text across formatting boundaries but does not join paragraphs or metadata', () => {
    const root = document.createElement('article')
    root.innerHTML =
      '<p>Work<strong>er</strong> worker</p><p>worker</p><p data-search-ignore>worker</p>'
    expect(
      findTextMatches(root, 'worker').map(({ range }) => range.toString()),
    ).toEqual(['Worker', 'worker', 'worker'])
    expect(findTextMatches(root, 'workerworker')).toEqual([])
  })
})
