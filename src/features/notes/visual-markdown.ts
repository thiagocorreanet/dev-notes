import CodeBlockLowlight from '@tiptap/extension-code-block-lowlight'
import { lowlight } from './code-highlighting'
import { CodeBlockView } from './components/code-block'
import { isEmbeddedImage } from './image-files'
import { Extension, getSchema } from '@tiptap/core'
import type { JSONContent } from '@tiptap/core'
import StarterKit from '@tiptap/starter-kit'
import { Markdown, MarkdownManager } from '@tiptap/markdown'
import { TableKit, TableCell, TableHeader } from '@tiptap/extension-table'
import TaskList from '@tiptap/extension-task-list'
import TaskItem from '@tiptap/extension-task-item'
import Image from '@tiptap/extension-image'
import { ReactNodeViewRenderer } from '@tiptap/react'
import { unified } from 'unified'
import remarkParse from 'remark-parse'
import remarkGfm from 'remark-gfm'
import { defaultUrlTransform } from 'react-markdown'
import { TaskItemView } from './components/task-item-view'

// Markdown tables support inline content, without merged cells or block nesting.
const MarkdownTableKeys = Extension.create({
  name: 'markdownTableKeys',
  priority: 1000,
  addKeyboardShortcuts() {
    return {
      Enter: () =>
        this.editor.isActive('table') && this.editor.commands.goToNextCell(),
      'Shift-Enter': () => this.editor.isActive('table'),
    }
  },
})

export const visualExtensions = [
  StarterKit.configure({
    underline: false,
    codeBlock: false,
    trailingNode: false,
    link: { openOnClick: false, autolink: false },
  }),
  CodeBlockLowlight.extend({
    addNodeView() {
      return ReactNodeViewRenderer(CodeBlockView)
    },
  }).configure({ lowlight, defaultLanguage: null }),
  TableKit.configure({ tableCell: false, tableHeader: false }),
  TableCell.extend({ content: 'paragraph' }),
  TableHeader.extend({ content: 'paragraph' }),
  MarkdownTableKeys,
  TaskList,
  TaskItem.extend({
    addNodeView() {
      return ReactNodeViewRenderer(TaskItemView)
    },
  }).configure({ nested: true }),
  Image.configure({ allowBase64: true }),
  Markdown.configure({ markedOptions: { gfm: true } }),
]

const manager = new MarkdownManager({
  extensions: visualExtensions,
  markedOptions: { gfm: true },
})
const schema = getSchema(visualExtensions)
const parser = unified().use(remarkParse).use(remarkGfm)

function semanticTree(markdown: string) {
  return JSON.stringify(parser.parse(markdown), (key, value: unknown) => {
    // Source locations and list spacing may change without changing content.
    if (key === 'position' || key === 'spread') return undefined
    return value
  })
}

export function prepareVisualMarkdown(content: string): JSONContent | null {
  if (!content.trim()) return { type: 'doc', content: [{ type: 'paragraph' }] }
  if (/^---\r?\n[\s\S]*?\r?\n---(?:\r?\n|$)/.test(content)) return null
  const tree = parser.parse(content)
  let unsupported = false
  function inspect(node: unknown) {
    if (!node || typeof node !== 'object') return
    if (
      'type' in node &&
      (node.type === 'html' ||
        node.type === 'definition' ||
        node.type === 'footnoteDefinition')
    )
      unsupported = true
    if (
      'url' in node &&
      typeof node.url === 'string' &&
      defaultUrlTransform(node.url) !== node.url &&
      !('type' in node && node.type === 'image' && isEmbeddedImage(node.url))
    )
      unsupported = true
    if ('children' in node && Array.isArray(node.children))
      node.children.forEach(inspect)
  }
  inspect(tree)
  if (unsupported) return null
  try {
    const document = schema.nodeFromJSON(manager.parse(content))
    document.check()
    const json = document.toJSON() as JSONContent
    // Refuse lossy conversion before mounting the editable document.
    if (semanticTree(content) !== semanticTree(manager.serialize(json)))
      return null
    return json
  } catch {
    return null
  }
}
