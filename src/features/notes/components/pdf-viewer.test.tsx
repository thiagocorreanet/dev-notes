import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { PdfViewer } from './pdf-viewer'

const mocks = vi.hoisted(() => ({
  destroy: vi.fn(() => Promise.resolve()),
  openPdfDocument: vi.fn(),
}))

vi.mock('../pdf-renderer', () => ({
  openPdfDocument: mocks.openPdfDocument,
}))

describe('PDF viewer', () => {
  beforeEach(() => {
    mocks.destroy.mockClear()
    mocks.openPdfDocument.mockResolvedValue({
      document: {
        numPages: 2,
        getPage: vi.fn((number: number) =>
          Promise.resolve({
            getViewport: ({ scale }: { scale: number }) => ({
              width: 600 * scale,
              height: 800 * scale,
            }),
            getTextContent: () =>
              Promise.resolve({
                items: [{ str: `Conteúdo da página ${number}` }],
              }),
            render: () => ({ promise: Promise.resolve(), cancel: vi.fn() }),
          }),
        ),
      },
      destroy: mocks.destroy,
    })
  })

  it('renders pages, exposes extracted text, and supports navigation and zoom', async () => {
    const user = userEvent.setup()
    const { unmount } = render(
      <PdfViewer
        data={new TextEncoder().encode('%PDF-1.7')}
        title="Arquitetura"
      />,
    )

    expect(
      screen.getByRole('region', { name: 'Leitor de PDF: Arquitetura' }),
    ).toBeVisible()
    await waitFor(() =>
      expect(screen.getByRole('status')).toHaveTextContent('Página 1 de 2'),
    )
    expect(screen.getByLabelText('Texto da página 1')).toHaveTextContent(
      'Conteúdo da página 1',
    )

    await user.click(screen.getByRole('button', { name: 'Próxima página' }))
    await waitFor(() =>
      expect(screen.getByRole('status')).toHaveTextContent('Página 2 de 2'),
    )
    expect(
      screen.getByRole('button', { name: 'Próxima página' }),
    ).toBeDisabled()

    await user.click(screen.getByRole('button', { name: 'Aumentar zoom' }))
    expect(screen.getByText('125%')).toBeVisible()

    unmount()
    expect(mocks.destroy).toHaveBeenCalledOnce()
  })

  it('reports unavailable PDF data clearly', () => {
    render(<PdfViewer data={undefined} title="Ausente" />)
    expect(screen.getByRole('alert')).toHaveTextContent(
      'O conteúdo deste PDF não está mais disponível',
    )
  })
})
