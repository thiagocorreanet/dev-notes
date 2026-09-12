import { describe, expect, it } from 'vitest'
import { documentHeadings, presentationSlides } from './document-structure'

describe('Document navigation structure', () => {
  it('includes formatted and setext headings while ignoring headings inside code', () => {
    const content =
      '## **First** section\n\n```md\n## Not a heading\n```\n\nSecond\n------\n\n### Detail'
    expect(
      documentHeadings(content).map(({ title, depth }) => ({ title, depth })),
    ).toEqual([
      { title: 'First section', depth: 2 },
      { title: 'Second', depth: 2 },
      { title: 'Detail', depth: 3 },
    ])
    expect(presentationSlides(content)).toHaveLength(2)
    expect(presentationSlides(content)[0]).toContain('## Not a heading')
    expect(presentationSlides(content)[1]).toContain('### Detail')
  })

  it('keeps introductory text and documents without headings', () => {
    expect(presentationSlides('Introduction\n\n## Topic\nBody')).toEqual([
      'Introduction',
      '## Topic\nBody',
    ])
    expect(presentationSlides('Only a paragraph')).toEqual(['Only a paragraph'])
    expect(presentationSlides('')).toEqual([])
  })
})
