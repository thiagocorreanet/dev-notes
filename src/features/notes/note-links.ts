import { unified } from 'unified'
import remarkParse from 'remark-parse'
import type { Note, WorkspaceFolder } from './types'
import type { Root, RootContent } from 'mdast'

export function notePath(note: Note, folders: WorkspaceFolder[]) {
  const parts = [note.title || 'Documento sem título']
  const visited = new Set<string>()
  let parent = note.folderId
  while (parent && !visited.has(parent)) {
    visited.add(parent)
    const folder = folders.find((value) => value.id === parent)
    if (!folder) break
    parts.unshift(folder.name)
    parent = folder.parentId
  }
  return parts.join('/')
}

export function resolveNoteLink(
  target: string,
  notes: Note[],
  folders: WorkspaceFolder[],
) {
  const normalized = target.trim().normalize('NFC').toLocaleLowerCase('pt-BR')
  const matches = notes.filter(
    (note) =>
      !note.deletedAt &&
      [note.id, note.title, notePath(note, folders)].some(
        (value) =>
          value.normalize('NFC').toLocaleLowerCase('pt-BR') === normalized,
      ),
  )
  return matches.length === 1 ? matches[0] : undefined
}

export function remapNoteLinks(content: string, ids: Map<string, string>) {
  const tree = unified().use(remarkParse).parse(content)
  const replacements: { start: number; end: number; value: string }[] = []
  function visit(node: Root | RootContent) {
    if (
      (node.type === 'link' || node.type === 'definition') &&
      node.url.startsWith('#note/')
    ) {
      const start = node.position?.start.offset
      const end = node.position?.end.offset
      const destination = ids.get(node.url.slice(6))
      if (destination && start !== undefined && end !== undefined) {
        const source = content.slice(start, end)
        const pattern =
          node.type === 'link'
            ? /(\]\(\s*<?)#note\/([^\s)>]+)/
            : /(^\[[^\]]+\]:\s*<?)#note\/([^\s>]+)/
        replacements.push({
          start,
          end,
          value: source.replace(
            pattern,
            (_match: string, prefix: string) => `${prefix}#note/${destination}`,
          ),
        })
      }
    }
    if ('children' in node) node.children.forEach(visit)
  }
  visit(tree)
  let result = content
  for (const replacement of replacements.sort((a, b) => b.start - a.start))
    result =
      result.slice(0, replacement.start) +
      replacement.value +
      result.slice(replacement.end)
  return result
}

export function remarkNoteLinks() {
  return (tree: Root) => {
    function visit(node: Root | RootContent) {
      if (
        !('children' in node) ||
        node.type === 'link' ||
        node.type === 'linkReference'
      )
        return
      const children: RootContent[] = []
      for (const child of node.children) {
        if (child.type === 'text') {
          let start = 0
          for (const match of child.value.matchAll(/\[\[([^\]\n]+)\]\]/g)) {
            if (match.index > start)
              children.push({
                type: 'text',
                value: child.value.slice(start, match.index),
              })
            const [target, ...label] = match[1]!.split('|')
            children.push({
              type: 'link',
              url: `#wiki/${encodeURIComponent(target!.trim())}`,
              children: [{ type: 'text', value: label.join('|') || target! }],
            })
            start = match.index + match[0].length
          }
          if (start < child.value.length)
            children.push({ type: 'text', value: child.value.slice(start) })
        } else {
          visit(child)
          children.push(child)
        }
      }
      // Each replacement retains the parent's content category: text becomes a phrasing link.
      node.children = children
    }
    visit(tree)
  }
}
