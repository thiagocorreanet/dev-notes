import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { NotesPage } from './notes-page'
import { diskWorkspaceFixture } from '@/test/disk-workspace-fixture'
import { WORKSPACE_KEY } from '../workspace-storage'

afterEach(() => {
  history.replaceState(null, '', '/')
  vi.unstubAllGlobals()
})

describe('Folder workspace', () => {
  it('creates folders and pages in the same place on disk and in the sidebar', async () => {
    const fixture = diskWorkspaceFixture({
      'Clientes/Acme.md': '# Acme\n\nContrato assinado',
    })
    fixture.install()
    const user = userEvent.setup()
    render(<NotesPage />)

    await user.click(
      await screen.findByRole('button', { name: 'Pasta: Clientes' }),
    )
    expect(
      screen.getByRole('button', {
        name: 'Selecionar raiz do espaço de trabalho',
      }),
    ).toHaveTextContent('Notas')
    expect(
      screen.queryByRole('button', { name: 'Pasta local' }),
    ).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Nova pasta' }))
    const folderDialog = screen.getByRole('dialog')
    expect(folderDialog).toHaveTextContent(
      'A pasta será criada dentro de Clientes',
    )
    await user.type(
      within(folderDialog).getByLabelText('Nome da pasta'),
      'Arquivo',
    )
    await user.click(
      within(folderDialog).getByRole('button', { name: 'Criar pasta' }),
    )
    await waitFor(() => expect(fixture.paths()).toContain('Clientes/Arquivo'))

    await user.click(screen.getByRole('button', { name: 'Nova página' }))
    await user.click(screen.getByLabelText('Título'))
    await user.paste('Proposta 2027')
    await user.click(screen.getByLabelText('Conteúdo', { exact: true }))
    await user.paste('Escopo inicial')
    await user.click(screen.getByRole('button', { name: /Criar nota/ }))

    await waitFor(() =>
      expect(fixture.read('Clientes/Arquivo/Proposta 2027.md')).toBe(
        '# Proposta 2027\n\nEscopo inicial',
      ),
    )
    expect(
      await screen.findByRole('region', { name: 'Local de salvamento' }),
    ).toHaveTextContent('Clientes/Arquivo/Proposta 2027.md')
    expect(await screen.findByText('Salvo na pasta')).toBeInTheDocument()
    expect(localStorage.getItem(WORKSPACE_KEY)).toBeNull()
  })

  it('asks which version to keep when a file changes outside DevNotes', async () => {
    const fixture = diskWorkspaceFixture({ 'Guia.md': '# Guia\n\nOriginal' })
    fixture.install()
    const user = userEvent.setup()
    render(<NotesPage />)

    await user.click(await screen.findByRole('tab', { name: 'Markdown' }))
    fixture.write('Guia.md', '# Guia\n\nEditado no terminal')
    const editor = screen.getByRole('textbox', { name: 'Markdown' })
    await user.clear(editor)
    await user.type(editor, 'Minha versão')
    await user.keyboard('{Control>}s{/Control}')

    expect(
      await screen.findByText('O arquivo mudou fora do DevNotes'),
    ).toBeVisible()
    expect(fixture.read('Guia.md')).toBe('# Guia\n\nEditado no terminal')
    await user.click(
      screen.getByRole('button', { name: 'Manter a minha versão' }),
    )
    await waitFor(() =>
      expect(fixture.read('Guia.md')).toBe('# Guia\n\nMinha versão'),
    )
    expect(
      screen.queryByText('O arquivo mudou fora do DevNotes'),
    ).not.toBeInTheDocument()
  })

  it('copies the browser workspace into a new folder with the same structure', async () => {
    localStorage.setItem(
      WORKSPACE_KEY,
      JSON.stringify({
        format: 'dev-notes-workspace',
        version: 1,
        name: 'Espaço de trabalho',
        folders: [
          { id: 'clientes', name: 'Clientes' },
          { id: 'acme', name: 'Acme', parentId: 'clientes' },
        ],
        notes: [
          {
            id: 'contrato',
            title: 'Contrato',
            content: 'Assinado',
            folderId: 'acme',
            favorite: true,
          },
          { id: 'leia', title: 'Leia', content: 'Início' },
        ],
      }),
    )
    const fixture = diskWorkspaceFixture({}, { id: 'nova-pasta' })
    vi.stubGlobal('fetch', fixture.fetch)
    history.replaceState(null, '', '/?ws=1')
    const user = userEvent.setup()
    render(<NotesPage />)

    await user.click(screen.getByRole('button', { name: 'Trocar workspace' }))
    await user.click(
      screen.getByRole('menuitem', {
        name: 'Copiar documentos deste navegador para uma pasta…',
      }),
    )
    const dialog = screen.getByRole('dialog')
    await user.clear(within(dialog).getByLabelText('Nome da pasta'))
    await user.type(within(dialog).getByLabelText('Nome da pasta'), 'Notas')
    await user.click(
      within(dialog).getByRole('button', { name: 'Escolher local' }),
    )

    await waitFor(() => expect(fixture.metadata()?.items).toHaveLength(4))
    expect(fixture.chosen).toEqual([{ mode: 'create', name: 'Notas' }])
    expect(fixture.paths()).toEqual([
      'Clientes',
      'Clientes/Acme',
      'Clientes/Acme/Contrato.md',
      'Leia.md',
    ])
    expect(fixture.read('Clientes/Acme/Contrato.md')).toBe(
      '# Contrato\n\nAssinado',
    )
    expect(fixture.metadata()?.items).toContainEqual({
      id: 'contrato',
      path: 'Clientes/Acme/Contrato.md',
      favorite: true,
    })
    expect(localStorage.getItem(WORKSPACE_KEY)).toContain('Assinado')
  })
})
