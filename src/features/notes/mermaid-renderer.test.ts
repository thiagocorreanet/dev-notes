import { beforeEach, describe, expect, it, vi } from 'vitest'
import mermaid from 'mermaid'
import { renderMermaid, type DiagramPalette } from './mermaid-renderer'

vi.mock('mermaid', () => ({
  default: { initialize: vi.fn(), render: vi.fn() },
}))

const palette: DiagramPalette = {
  dark: false,
  background: '#ffffff',
  foreground: '#0f172a',
  surface: '#f1f5f9',
  border: '#cbd5e1',
  primary: '#2563eb',
  fontFamily: 'Inter',
}

beforeEach(() => {
  vi.mocked(mermaid.render).mockReset().mockResolvedValue({
    svg: '<svg xmlns="http://www.w3.org/2000/svg" width="100%" viewBox="0 0 420 360"><text>Start</text></svg>',
    diagramType: 'flowchart',
  })
})

describe('Mermaid rendering', () => {
  it('uses strict settings and preserves intrinsic image dimensions', async () => {
    const image = await renderMermaid('graph TD; A --> B', palette)
    const svg = new DOMParser().parseFromString(
      decodeURIComponent(image.split(',')[1]!),
      'image/svg+xml',
    )
    expect(svg.documentElement.getAttribute('width')).toBe('420')
    expect(svg.documentElement.getAttribute('height')).toBe('360')
    expect(svg.documentElement.style.backgroundColor).toBe('rgb(255, 255, 255)')
    expect(mermaid.initialize).toHaveBeenCalledWith(
      expect.objectContaining({
        securityLevel: 'strict',
        htmlLabels: false,
        startOnLoad: false,
      }),
    )
    const container = vi.mocked(mermaid.render).mock.calls[0]![2]
    expect(container?.isConnected).toBe(false)
  })

  it('cleans up failed renders and allows subsequent diagrams to render', async () => {
    vi.mocked(mermaid.render).mockRejectedValueOnce(new Error('Invalid syntax'))
    await expect(renderMermaid('invalid', palette)).rejects.toThrow(
      'Invalid syntax',
    )
    expect(vi.mocked(mermaid.render).mock.calls[0]![2]?.isConnected).toBe(false)
    await expect(renderMermaid('graph LR; A --> B', palette)).resolves.toMatch(
      /^data:image\/svg\+xml/,
    )
    const calls = vi.mocked(mermaid.render).mock.calls
    expect(calls[0]![0]).not.toBe(calls[1]![0])
  })

  it('skips cancelled and oversized diagrams before invoking the engine', async () => {
    const controller = new AbortController()
    controller.abort()
    await expect(
      renderMermaid('graph TD; A --> B', palette, controller.signal),
    ).rejects.toThrow()
    await expect(renderMermaid('x'.repeat(50_001), palette)).rejects.toThrow(
      'rendering limit',
    )
    expect(mermaid.render).not.toHaveBeenCalled()
  })
})
