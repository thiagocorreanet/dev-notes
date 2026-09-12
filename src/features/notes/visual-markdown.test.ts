import { describe, expect, it } from 'vitest'
import { Editor } from '@tiptap/core'
import { prepareVisualMarkdown, visualExtensions } from './visual-markdown'
import { exampleNotes } from './example-notes'

describe('Visual Markdown conversion', () => {
  it('preserves supported document structures and the bundled examples', () => {
    const content =
      '## Heading\n\n**Bold** and *italic* with `code`.\n\n> Quote\n\n- First\n- Second\n\n1. Ordered\n2. List\n\n- [ ] Todo\n- [x] Done\n\n```ts\nconst answer = 42\n```\n\n| Name | Value |\n| --- | --- |\n| Alpha | **42** |\n\n![Image](https://example.com/image.png)\n\n[Link](https://example.com)'
    for (const markdown of [
      content,
      '```mermaid\nflowchart TD\n  A[Start] --> B{Valid?}\n  B -->|Yes| C[Save]\n```',
      ...exampleNotes.map((note) => note.content),
      '',
    ]) {
      expect(prepareVisualMarkdown(markdown), markdown).not.toBeNull()
    }
  })

  it.each([
    '<!-- Keep this comment -->\n\nText',
    '---\ntitle: Metadata\n---\n\nBody',
    'Footnote[^a]\n\n[^a]: Keep me',
    '[Reference][r]\n\n[r]: https://example.com',
    '[Unsafe](javascript:alert)',
  ])('retains unsupported content for source editing: %s', (content) => {
    expect(prepareVisualMarkdown(content)).toBeNull()
  })

  it('serializes table cell edits, row changes, and undo as Markdown', () => {
    const editor = new Editor({
      extensions: visualExtensions,
      content: '| Name | Value |\n| --- | --- |\n| Alpha | 42 |',
      contentType: 'markdown',
    })
    try {
      editor.commands.setTextSelection(3)
      editor.commands.insertContent('New ')
      editor.commands.addRowAfter()
      const markdown = editor.getMarkdown()
      expect(markdown).toContain('New Name')
      expect(markdown).toContain('Alpha')
      expect(prepareVisualMarkdown(markdown)).not.toBeNull()
      expect(editor.getJSON().content?.[0]?.content).toHaveLength(3)
      editor.commands.undo()
      expect(editor.getJSON().content?.[0]?.content).toHaveLength(2)
      editor.commands.undo()
      expect(editor.getMarkdown()).not.toContain('New Name')
    } finally {
      editor.destroy()
    }
  })
})
