import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { NotesPage } from './notes-page'
import { WORKSPACE_KEY } from '../workspace-storage'

const mocks = vi.hoisted(() => ({ openPdfDocument: vi.fn() }))

vi.mock('../pdf-renderer', () => ({
  openPdfDocument: mocks.openPdfDocument,
}))

function pdfFile(name: string) {
  const bytes = new TextEncoder().encode('%PDF-1.7\n%%EOF')
  const file = new File([bytes], name, { type: 'application/pdf' })
  Object.defineProperty(file, 'arrayBuffer', {
    value: () => Promise.resolve(bytes.buffer),
  })
  return file
}

describe('PDF documents', () => {
  it('opens a PDF in a read-only viewer without storing its bytes as a note', async () => {
    mocks.openPdfDocument.mockResolvedValue({
      document: {
        numPages: 1,
        getPage: () =>
          Promise.resolve({
            getViewport: ({ scale }: { scale: number }) => ({
              width: 600 * scale,
              height: 800 * scale,
            }),
            getTextContent: () =>
              Promise.resolve({ items: [{ str: 'Conteúdo do relatório' }] }),
            render: () => ({ promise: Promise.resolve(), cancel: vi.fn() }),
          }),
      },
      destroy: () => Promise.resolve(),
    })
    const user = userEvent.setup()
    render(<NotesPage />)

    await user.upload(
      screen.getByLabelText('Selecionar documento Markdown ou PDF'),
      pdfFile('relatorio.pdf'),
    )

    expect(
      await screen.findByRole('region', {
        name: 'Leitor de PDF: relatorio',
      }),
    ).toBeVisible()
    await waitFor(() =>
      expect(screen.getByLabelText('Texto da página 1')).toHaveTextContent(
        'Conteúdo do relatório',
      ),
    )
    expect(screen.getByText('PDF · Somente leitura')).toBeVisible()
    expect(screen.getByRole('button', { name: 'Baixar PDF' })).toBeVisible()
    expect(
      screen.queryByRole('tab', { name: 'Editar' }),
    ).not.toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: 'Ações de relatorio' }),
    ).not.toBeInTheDocument()
    expect(localStorage.getItem(WORKSPACE_KEY)).toBeNull()
  })
})
