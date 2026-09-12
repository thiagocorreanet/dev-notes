import { describe, expect, it } from 'vitest'
import { markdownUrl, readImageFile } from './image-files'
import { emptyWorkspace, parseWorkspace } from './workspace-storage'
import { prepareVisualMarkdown } from './visual-markdown'

describe('Embedded images', () => {
  it('pastes raster images that survive visual conversion and a workspace backup', async () => {
    const src = await readImageFile(
      new File(['image bytes'], 'capture.png', { type: 'image/png' }),
    )
    const content = `![Capture](${src})`
    expect(markdownUrl(src, 'src')).toBe(src)
    expect(prepareVisualMarkdown(content)).not.toBeNull()
    expect(
      parseWorkspace(
        JSON.stringify({
          ...emptyWorkspace(),
          notes: [{ id: 'n', title: 'Images', content }],
        }),
      ).notes[0]?.content,
    ).toBe(content)
  })
  it('rejects SVG, oversized images, and executable data URLs', async () => {
    await expect(
      readImageFile(
        new File(['<svg/>'], 'image.svg', { type: 'image/svg+xml' }),
      ),
    ).rejects.toThrow('PNG')
    const file = new File(['x'], 'large.png', { type: 'image/png' })
    Object.defineProperty(file, 'size', { value: 2 * 1024 * 1024 })
    await expect(readImageFile(file)).rejects.toThrow('1 MB')
    expect(markdownUrl('data:image/svg+xml;base64,PHN2Zy8+', 'src')).toBe('')
    expect(markdownUrl('data:text/html;base64,PHNjcmlwdD4=', 'href')).toBe('')
    expect(markdownUrl('javascript:alert(1)', 'href')).toBe('')
    expect(markdownUrl('data:image/png;base64,eA==', 'href')).toBe('')
  })
})
