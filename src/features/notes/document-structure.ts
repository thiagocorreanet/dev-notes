import { unified } from 'unified'
import remarkParse from 'remark-parse'
import type { RootContent } from 'mdast'

const parser = unified().use(remarkParse)

function nodeText(node: RootContent): string {
  if ('value' in node) return node.value
  if ('alt' in node) return node.alt ?? ''
  if ('children' in node) return node.children.map(nodeText).join('')
  return ''
}

export function documentHeadings(content: string) {
  const headings: { id: string; title: string; depth: number }[] = []
  function visit(node: RootContent) {
    if (node.type === 'heading') {
      headings.push({
        id: `document-heading-${node.position?.start.offset ?? 0}`,
        title: nodeText(node),
        depth: node.depth,
      })
    }
    if ('children' in node) node.children.forEach(visit)
  }
  parser.parse(content).children.forEach(visit)
  return headings
}

export function presentationSlides(content: string) {
  const boundaries = parser
    .parse(content)
    .children.filter((node) => node.type === 'heading' && node.depth <= 2)
    .map((node) => node.position?.start.offset ?? 0)
  return [...new Set([0, ...boundaries])]
    .map((start, index, starts) =>
      content.slice(start, starts[index + 1]).trim(),
    )
    .filter(Boolean)
}
