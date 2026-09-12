export interface TextMatch {
  range: Range
}

export function findTextMatches(root: HTMLElement, query: string): TextMatch[] {
  if (!query) return []
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode: (node) =>
      node.parentElement?.closest('[data-search-ignore]')
        ? NodeFilter.FILTER_REJECT
        : NodeFilter.FILTER_ACCEPT,
  })
  const segments: { node: Text; start: number; end: number }[] = []
  let text = ''
  let previousBlock: Element | null = null
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const block =
      node.parentElement?.closest(
        'p,li,h1,h2,h3,h4,h5,h6,pre,td,th,blockquote',
      ) ?? null
    if (previousBlock && block !== previousBlock) text += '\n'
    previousBlock = block
    const start = text.length
    text += node.textContent ?? ''
    segments.push({ node: node as Text, start, end: text.length })
  }
  let cursor = 0
  return findOffsets(text, query).flatMap(({ start, end }) => {
    while (segments[cursor] && segments[cursor]!.end <= start) cursor++
    const first = segments[cursor]
    while (segments[cursor] && segments[cursor]!.end < end) cursor++
    const last = segments[cursor]
    if (!first || !last) return []
    const range = document.createRange()
    range.setStart(first.node, start - first.start)
    range.setEnd(last.node, end - last.start)
    return [{ range }]
  })
}

export function findOffsets(text: string, query: string) {
  if (!query) return []
  const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return Array.from(text.matchAll(new RegExp(escaped, 'giu')), (match) => ({
    start: match.index,
    end: match.index + match[0].length,
  }))
}
