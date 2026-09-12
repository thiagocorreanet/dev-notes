import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach, vi } from 'vitest'
import { createElement } from 'react'
import type { ComponentProps } from 'react'

// Pointer hit testing requires real geometry. JSDOM reports every control at
// (0, 0), so disable panel dragging in domain tests; browser QA covers resizing.
vi.mock('@/components/ui/resizable', async (importOriginal) => {
  const original =
    await importOriginal<typeof import('@/components/ui/resizable')>()
  return {
    ...original,
    ResizablePanelGroup: (
      props: ComponentProps<typeof original.ResizablePanelGroup>,
    ) =>
      createElement(original.ResizablePanelGroup, { ...props, disabled: true }),
  }
})

// JSDOM has no layout engine; Radix still subscribes to element size changes.
globalThis.ResizeObserver = class ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}

// cmdk scrolls the active option into view; JSDOM cannot perform layout.
HTMLElement.prototype.scrollIntoView = () => {}

// Radix pointer capture and ProseMirror range geometry need browser layout APIs.
HTMLElement.prototype.hasPointerCapture = () => false
HTMLElement.prototype.setPointerCapture = () => {}
HTMLElement.prototype.releasePointerCapture = () => {}
document.elementFromPoint = () => null
Object.defineProperty(Range.prototype, 'getBoundingClientRect', {
  value: () => new DOMRect(),
})
Object.defineProperty(Range.prototype, 'getClientRects', { value: () => [] })

Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: (query: string): MediaQueryList => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => true,
  }),
})

afterEach(() => {
  cleanup()
  localStorage.clear()
})
