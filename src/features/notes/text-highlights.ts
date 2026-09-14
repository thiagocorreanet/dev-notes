export const TEXT_HIGHLIGHT_PREFIX = 'dev-notes:text-highlights:v1:'

export const textHighlightColors = ['yellow', 'green', 'blue', 'pink'] as const

export type TextHighlightColor = (typeof textHighlightColors)[number]

export interface TextHighlight {
  id: string
  text: string
  prefix: string
  suffix: string
  start: number
  color: TextHighlightColor
}

interface TextSegment {
  node: Text
  start: number
  end: number
}

export interface TextDocumentMap {
  text: string
  segments: TextSegment[]
}

export interface ResolvedTextHighlight {
  start: number
  end: number
  range: Range
}

const CONTEXT_LENGTH = 32
const BLOCK_SELECTOR = 'p,li,h1,h2,h3,h4,h5,h6,pre,td,th,blockquote'

function isTextHighlight(value: unknown): value is TextHighlight {
  return (
    typeof value === 'object' &&
    value !== null &&
    'id' in value &&
    typeof value.id === 'string' &&
    !!value.id &&
    'text' in value &&
    typeof value.text === 'string' &&
    !!value.text.trim() &&
    'prefix' in value &&
    typeof value.prefix === 'string' &&
    'suffix' in value &&
    typeof value.suffix === 'string' &&
    'start' in value &&
    typeof value.start === 'number' &&
    Number.isSafeInteger(value.start) &&
    value.start >= 0 &&
    'color' in value &&
    textHighlightColors.includes(value.color as TextHighlightColor)
  )
}

function storageKey(documentId: string) {
  return `${TEXT_HIGHLIGHT_PREFIX}${encodeURIComponent(documentId)}`
}

export function loadTextHighlights(documentId: string): TextHighlight[] {
  try {
    const value: unknown = JSON.parse(
      localStorage.getItem(storageKey(documentId)) ?? '[]',
    )
    return Array.isArray(value) && value.every(isTextHighlight) ? value : []
  } catch {
    return []
  }
}

export function saveTextHighlights(
  documentId: string,
  highlights: TextHighlight[],
) {
  try {
    if (highlights.length)
      localStorage.setItem(storageKey(documentId), JSON.stringify(highlights))
    else localStorage.removeItem(storageKey(documentId))
    return true
  } catch {
    return false
  }
}

export function mapTextDocument(root: HTMLElement): TextDocumentMap {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode: (node) => {
      const parent = node.parentElement
      if (
        !parent ||
        parent.closest(
          '[data-highlight-ignore], [data-search-ignore], [contenteditable="false"], script, style',
        )
      )
        return NodeFilter.FILTER_REJECT
      return NodeFilter.FILTER_ACCEPT
    },
  })
  const segments: TextSegment[] = []
  let text = ''
  let previousBlock: Element | null = null
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const block = node.parentElement?.closest(BLOCK_SELECTOR) ?? null
    if (previousBlock && block !== previousBlock) text += '\n'
    previousBlock = block
    const start = text.length
    text += node.textContent ?? ''
    segments.push({ node: node as Text, start, end: text.length })
  }
  return { text, segments }
}

function pointOffset(map: TextDocumentMap, container: Node, offset: number) {
  if (container.nodeType === Node.TEXT_NODE) {
    const segment = map.segments.find((item) => item.node === container)
    return segment
      ? segment.start + Math.min(offset, segment.end - segment.start)
      : null
  }
  const element = container as Element
  const child = element.childNodes[offset]
  const following = child
    ? map.segments.find(
        (item) => child === item.node || child.contains(item.node),
      )
    : undefined
  if (following) return following.start
  const preceding = [...map.segments]
    .reverse()
    .find((item) => element.contains(item.node))
  return preceding?.end ?? null
}

function rangeFromOffsets(map: TextDocumentMap, start: number, end: number) {
  const first = map.segments.find(
    (segment) => segment.start <= start && segment.end > start,
  )
  const last = [...map.segments]
    .reverse()
    .find((segment) => segment.start < end && segment.end >= end)
  if (!first || !last) return null
  const range = document.createRange()
  range.setStart(first.node, start - first.start)
  range.setEnd(last.node, end - last.start)
  return range
}

export function createTextHighlight(
  root: HTMLElement,
  range: Range,
  color: TextHighlightColor,
  id: string = crypto.randomUUID(),
): (TextHighlight & { end: number }) | null {
  if (
    !root.contains(range.startContainer) ||
    !root.contains(range.endContainer)
  )
    return null
  const map = mapTextDocument(root)
  let start = pointOffset(map, range.startContainer, range.startOffset)
  let end = pointOffset(map, range.endContainer, range.endOffset)
  if (start === null || end === null || start >= end) return null
  const selected = map.text.slice(start, end)
  const leading = selected.length - selected.trimStart().length
  const trailing = selected.length - selected.trimEnd().length
  start += leading
  end -= trailing
  const text = map.text.slice(start, end)
  if (!text) return null
  return {
    id,
    text,
    prefix: map.text.slice(Math.max(0, start - CONTEXT_LENGTH), start),
    suffix: map.text.slice(end, end + CONTEXT_LENGTH),
    start,
    end,
    color,
  }
}

function matchingContext(left: string, right: string, fromEnd: boolean) {
  const length = Math.min(left.length, right.length)
  let matched = 0
  while (
    matched < length &&
    left[fromEnd ? left.length - matched - 1 : matched] ===
      right[fromEnd ? right.length - matched - 1 : matched]
  )
    matched++
  return matched
}

export function resolveTextHighlight(
  map: TextDocumentMap,
  highlight: TextHighlight,
): ResolvedTextHighlight | null {
  const candidates: number[] = []
  for (let index = map.text.indexOf(highlight.text); index >= 0;) {
    candidates.push(index)
    index = map.text.indexOf(
      highlight.text,
      index + Math.max(1, highlight.text.length),
    )
  }
  let best: { start: number; score: number; distance: number } | undefined
  for (const start of candidates) {
    const end = start + highlight.text.length
    const prefix = map.text.slice(
      Math.max(0, start - highlight.prefix.length),
      start,
    )
    const suffix = map.text.slice(end, end + highlight.suffix.length)
    const score =
      matchingContext(prefix, highlight.prefix, true) +
      matchingContext(suffix, highlight.suffix, false)
    const distance = Math.abs(start - highlight.start)
    if (
      !best ||
      score > best.score ||
      (score === best.score && distance < best.distance)
    )
      best = { start, score, distance }
  }
  if (!best) return null
  const end = best.start + highlight.text.length
  const range = rangeFromOffsets(map, best.start, end)
  return range ? { start: best.start, end, range } : null
}

export function overlappingHighlightIds(
  root: HTMLElement,
  highlights: TextHighlight[],
  selection: { start: number; end: number },
) {
  const map = mapTextDocument(root)
  return new Set(
    highlights.flatMap((highlight) => {
      const resolved = resolveTextHighlight(map, highlight)
      return resolved &&
        resolved.start < selection.end &&
        resolved.end > selection.start
        ? [highlight.id]
        : []
    }),
  )
}
