import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { MarkdownPreview } from './markdown-preview'
import { renderMermaid } from '../mermaid-renderer'

vi.mock('../mermaid-renderer', () => ({ renderMermaid: vi.fn() }))
const diagramImage = 'data:image/svg+xml;charset=utf-8,%3Csvg%2F%3E'

beforeEach(() => {
  vi.mocked(renderMermaid).mockReset().mockResolvedValue(diagramImage)
})

describe('Markdown diagrams', () => {
  it('renders Mermaid fences while preserving ordinary code and source text', async () => {
    const user = userEvent.setup()
    const code = 'flowchart TD\n  A[Start] --> B[Finish]\n'
    render(
      <MarkdownPreview
        content={`\`\`\`mermaid\n${code}\`\`\`\n\n\`\`\`js\nconst answer = 42\n\`\`\``}
      />,
    )
    expect(
      await screen.findByRole('img', { name: 'Diagrama Mermaid' }),
    ).toHaveAttribute('src', diagramImage)
    expect(renderMermaid).toHaveBeenCalledWith(
      code,
      expect.any(Object),
      expect.any(AbortSignal),
    )
    expect(screen.getByText('42')).toBeVisible()
    await user.click(screen.getByRole('button', { name: 'Ver código' }))
    expect(screen.getByText(/A\[Start\]/).textContent).toBe(code)
  })

  it('keeps malformed code visible and renders it again after a correction', async () => {
    vi.mocked(renderMermaid).mockRejectedValueOnce(new Error('Invalid syntax'))
    const { rerender } = render(
      <MarkdownPreview content={'```mermaid\ninvalid diagram\n```'} />,
    )
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Não foi possível renderizar',
    )
    expect(screen.getByText('invalid diagram')).toBeVisible()
    rerender(
      <MarkdownPreview content={'```mermaid\ngraph LR\n A --> B\n```'} />,
    )
    expect(await screen.findByRole('img')).toBeVisible()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('ignores an obsolete rendering result when the source changes', async () => {
    let finish: (value: string) => void = () => undefined
    vi.mocked(renderMermaid).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve
        }),
    )
    const { rerender } = render(
      <MarkdownPreview content={'```mermaid\ngraph TD\n A --> B\n```'} />,
    )
    await waitFor(() => expect(renderMermaid).toHaveBeenCalledTimes(1))
    const oldSignal = vi.mocked(renderMermaid).mock.calls[0]![2]
    rerender(
      <MarkdownPreview content={'```mermaid\ngraph TD\n C --> D\n```'} />,
    )
    expect(oldSignal?.aborted).toBe(true)
    finish('obsolete-image')
    expect(await screen.findByRole('img')).toHaveAttribute('src', diagramImage)
  })
})
