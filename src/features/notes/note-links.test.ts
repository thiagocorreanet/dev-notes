import { describe, expect, it } from 'vitest'
import { remapNoteLinks, resolveNoteLink } from './note-links'

const notes = [
  { id: 'a', title: 'Guia', content: '', folderId: 'api' },
  { id: 'b', title: 'Guia', content: '', folderId: 'web' },
]
const folders = [
  { id: 'api', name: 'API' },
  { id: 'web', name: 'Web' },
]
describe('Internal document links', () => {
  it('resolves IDs and paths while refusing ambiguous titles', () => {
    expect(resolveNoteLink('Guia', notes, folders)).toBeUndefined()
    expect(resolveNoteLink('api/guia', notes, folders)?.id).toBe('a')
    expect(resolveNoteLink('b', notes, folders)?.id).toBe('b')
    expect(
      resolveNoteLink(
        'b',
        [{ ...notes[1]!, deletedAt: new Date().toISOString() }],
        folders,
      ),
    ).toBeUndefined()
  })
  it('remaps internal links without replacing external links or document titles', () => {
    expect(
      remapNoteLinks(
        '[Guia](#note/a) [Site](https://example.com) a',
        new Map([['a', 'copy']]),
      ),
    ).toBe('[Guia](#note/copy) [Site](https://example.com) a')
  })
  it('preserves literal link examples in code and external URL fragments', () => {
    const content =
      '[Internal](#note/a)\n\n`[Code](#note/a)`\n\n```md\n[Example](#note/a)\n```\n\n[External](https://example.com/#note/a)'
    expect(remapNoteLinks(content, new Map([['a', 'copy']]))).toBe(
      content.replace('[Internal](#note/a)', '[Internal](#note/copy)'),
    )
  })
})
