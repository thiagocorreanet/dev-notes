import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { NotesPage } from './notes-page'
import { downloadFile } from '../workspace-files'
import {
  emptyWorkspace,
  parseWorkspace,
  WORKSPACE_KEY,
} from '../workspace-storage'

vi.mock('../workspace-files', async (importOriginal) => {
  const original = await importOriginal<typeof import('../workspace-files')>()
  return { ...original, downloadFile: vi.fn() }
})

afterEach(() => {
  vi.restoreAllMocks()
})

function setup() {
  localStorage.setItem(
    WORKSPACE_KEY,
    JSON.stringify({
      ...emptyWorkspace(),
      notes: [
        {
          id: 'guide',
          title: 'Team guide',
          content: '## Overview\n\nWelcome\n\n## Delivery\n\nShip it',
        },
      ],
    }),
  )
  const view = render(<NotesPage />)
  return { ...view, user: userEvent.setup() }
}

async function command(
  user: ReturnType<typeof userEvent.setup>,
  query: string,
  label: string,
) {
  await user.keyboard('{Control>}k{/Control}')
  const input = screen.getByRole('combobox', {
    name: 'Buscar documentos e comandos',
  })
  expect(input).toHaveFocus()
  await user.paste(query)
  await user.click(screen.getByRole('option', { name: new RegExp(label) }))
}

describe('Editor command palette', () => {
  it('lists all editor actions, changes theme, and opens focused document search', async () => {
    const { user } = setup()
    await user.keyboard('{Control>}k{/Control}')
    const group = screen.getByRole('group', { name: 'Ações do editor' })
    expect(within(group).getAllByRole('option')).toHaveLength(16)
    await user.keyboard('{Escape}')
    await command(user, 'tema', 'Alterar tema')
    expect(document.documentElement).toHaveClass('dark')
    await command(user, 'localizar', 'Buscar no documento')
    const input = screen.getByRole('textbox', { name: 'Texto da busca' })
    await waitFor(() => expect(input).toHaveFocus())
    await user.type(input, 'Welcome')
    await waitFor(() =>
      expect(
        screen.getByRole('status', { name: 'Resultados da busca' }),
      ).toHaveTextContent('1/1'),
    )
  })

  it('creates a temporary document and saves only the active page using the command and shortcut', async () => {
    const { user } = setup()
    await command(user, 'novo documento', 'Novo documento')
    await user.type(screen.getByLabelText('Título'), 'First draft')
    expect(screen.getByLabelText('Título')).toHaveValue('First draft')
    await command(user, 'novo documento', 'Novo documento')
    await user.type(screen.getByLabelText('Título'), 'Second draft')
    expect(screen.getByLabelText('Título')).toHaveValue('Second draft')
    await command(user, 'salvar pagina', 'Salvar página')
    let stored = parseWorkspace(localStorage.getItem(WORKSPACE_KEY) ?? '')
    expect(stored.notes.map((note) => note.title)).toEqual([
      'Second draft',
      'Team guide',
    ])
    await user.click(screen.getByRole('button', { name: 'First draft' }))
    await user.keyboard('{Control>}s{/Control}')
    stored = parseWorkspace(localStorage.getItem(WORKSPACE_KEY) ?? '')
    expect(stored.notes.map((note) => note.title)).toContain('First draft')
  })

  it('opens Markdown file and folder pickers', async () => {
    const { user } = setup()
    const click = vi.spyOn(HTMLInputElement.prototype, 'click')
    await command(user, 'arquivo pc', 'Abrir arquivo Markdown')
    expect(click.mock.instances.at(-1)).toHaveAttribute(
      'aria-label',
      'Selecionar arquivo Markdown',
    )
    const file = new File(['# Imported\n\nExternal content'], 'imported.md', {
      type: 'text/markdown',
    })
    Object.defineProperty(file, 'text', {
      value: () => Promise.resolve('# Imported\n\nExternal content'),
    })
    await user.upload(
      screen.getByLabelText('Selecionar arquivo Markdown'),
      file,
    )
    expect(
      await screen.findByRole('heading', { name: 'Imported' }),
    ).toBeVisible()
    expect(
      screen.queryByRole('tab', { name: 'Abrir aba Team guide' }),
    ).not.toBeInTheDocument()
    await command(user, 'abrir pasta', 'Abrir pasta')
    expect(click.mock.instances.at(-1)).toHaveAttribute(
      'aria-label',
      'Selecionar pasta',
    )
  })

  it('creates a folder and downloads the current page under a chosen filename', async () => {
    const { user } = setup()
    await command(user, 'nova pasta', 'Nova pasta')
    await user.type(screen.getByLabelText('Nome da pasta'), 'Guides')
    await user.click(
      screen.getByRole('button', {
        name: 'Criar somente neste navegador',
      }),
    )
    expect(
      parseWorkspace(localStorage.getItem(WORKSPACE_KEY) ?? '').folders[0]
        ?.name,
    ).toBe('Guides')
    await command(user, 'salvar como', 'Salvar como')
    await user.clear(screen.getByLabelText('Nome do arquivo'))
    await user.type(screen.getByLabelText('Nome do arquivo'), 'guide-copy')
    await user.click(screen.getByRole('button', { name: 'Baixar arquivo' }))
    expect(downloadFile).toHaveBeenCalledWith(
      'guide-copy.md',
      '# Team guide\n\n## Overview\n\nWelcome\n\n## Delivery\n\nShip it\n',
      'text/markdown;charset=utf-8',
    )
  })

  it('presents sections and navigates from the minimap without changing document content', async () => {
    const { user } = setup()
    const before = localStorage.getItem(WORKSPACE_KEY)
    await command(user, 'apresentacao', 'Modo apresentação')
    expect(screen.getByRole('article', { name: 'Slide 1' })).toHaveTextContent(
      'Welcome',
    )
    await user.keyboard('{ArrowRight}')
    expect(screen.getByRole('article', { name: 'Slide 2' })).toHaveTextContent(
      'Ship it',
    )
    expect(screen.getByRole('button', { name: 'Próximo slide' })).toBeDisabled()
    await user.keyboard('{Escape}')
    await user.click(screen.getByRole('tab', { name: 'Markdown' }))
    await command(user, 'minipam', 'Abrir minimapa')
    await user.click(screen.getByRole('button', { name: 'Ir para Delivery' }))
    await waitFor(() =>
      expect(screen.getByRole('heading', { name: 'Delivery' })).toHaveFocus(),
    )
    expect(screen.getByRole('tab', { name: 'Ler' })).toHaveAttribute(
      'aria-selected',
      'true',
    )
    expect(localStorage.getItem(WORKSPACE_KEY)).toBe(before)
  })

  it('prints only a snapshot of the active document for PDF export', async () => {
    const { user } = setup()
    const print = vi.spyOn(window, 'print').mockImplementation(() => {
      const article = document.querySelector('[data-print-document]')
      expect(article).toHaveTextContent('Team guide')
      expect(article).toHaveTextContent('Ship it')
      expect(article).not.toHaveTextContent('Workspace')
      expect(document.title).toBe('Team guide')
      window.dispatchEvent(new Event('afterprint'))
    })
    await command(user, 'pdf', 'Salvar arquivo aberto em PDF')
    await waitFor(() => expect(print).toHaveBeenCalledOnce())
    await waitFor(() =>
      expect(document.querySelector('[data-print-document]')).toBeNull(),
    )
  })

  it('opens the Codex account dialog and checks the ChatGPT connection', async () => {
    const fetch = vi.spyOn(window, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          available: true,
          state: 'connected',
          email: 'writer@example.com',
          plan: 'pro',
          model: 'Padrão do Codex',
          primary: { usedPercent: 8, resetsAt: null },
          secondary: null,
        }),
      ),
    )
    const { user } = setup()
    await command(user, 'codex', 'Conta do Codex')
    expect(
      await screen.findByRole('heading', { name: 'Assistente Codex' }),
    ).toBeVisible()
    expect(screen.getByText('Conectado com o ChatGPT')).toBeVisible()
    expect(screen.getByText('ChatGPT Pro')).toBeVisible()
    expect(fetch).toHaveBeenCalledWith(
      '/api/codex/status',
      expect.objectContaining({ credentials: 'same-origin' }),
    )
    expect(localStorage.getItem('dev-notes-ai-settings')).toBeNull()
  })
})
