import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { NotesPage } from './notes-page'
import { APPEARANCE_KEY } from '../appearance'
import {
  emptyWorkspace,
  WORKSPACE_KEY,
  parseWorkspace,
} from '../workspace-storage'

function setup() {
  localStorage.setItem(
    WORKSPACE_KEY,
    JSON.stringify({
      ...emptyWorkspace(),
      notes: [{ id: 'guide', title: 'Guide', content: 'Original text' }],
    }),
  )
  return { ...render(<NotesPage />), user: userEvent.setup() }
}
function file(name: string, content: string) {
  const value = new File([content], name, { type: 'text/markdown' })
  Object.defineProperty(value, 'text', {
    value: () => Promise.resolve(content),
  })
  return value
}

describe('Editor comfort', () => {
  it('preserves the mounted editor when focus mode changes and lets dialogs handle Escape first', async () => {
    const { user } = setup()
    await user.click(screen.getByRole('tab', { name: 'Markdown' }))
    const editor = screen.getByRole('textbox', {
      name: 'Markdown',
    })
    await user.click(screen.getByRole('button', { name: 'Ativar modo foco' }))
    expect(screen.getByRole('textbox', { name: 'Markdown' })).toBe(editor)
    expect(document.querySelector('[data-focus-mode]')).toHaveAttribute(
      'data-focus-mode',
      'true',
    )
    expect(
      screen.getByRole('button', { name: 'Painel de tarefas' }),
    ).toHaveAttribute('data-focus-secondary')
    await user.keyboard('{Control>}k{/Control}')
    await user.type(
      screen.getByRole('combobox', { name: 'Buscar documentos e comandos' }),
      'preferencias',
    )
    await user.click(
      screen.getByRole('option', { name: /Preferências de aparência/ }),
    )
    expect(
      screen.getByRole('dialog', { name: 'Preferências de aparência' }),
    ).toBeVisible()
    await user.keyboard('{Escape}')
    expect(
      screen.getByRole('button', { name: 'Sair do modo foco' }),
    ).toBeVisible()
    await user.keyboard('{Escape}')
    expect(
      screen.getByRole('button', { name: 'Ativar modo foco' }),
    ).toHaveFocus()
    expect(screen.getByRole('textbox', { name: 'Markdown' })).toBe(editor)
    expect(editor).toHaveValue('Original text')
  })

  it('persists appearance and applies it again after reopening the editor', async () => {
    const { user, unmount } = setup()
    await user.click(
      screen.getByRole('button', { name: 'Preferências de aparência' }),
    )
    await user.click(screen.getByRole('combobox', { name: 'Tamanho do texto' }))
    await user.click(screen.getByRole('option', { name: '20 px' }))
    await user.click(
      screen.getByRole('combobox', { name: 'Largura do documento' }),
    )
    await user.click(screen.getByRole('option', { name: 'Confortável' }))
    await user.click(screen.getByRole('combobox', { name: 'Tema' }))
    await user.click(screen.getByRole('option', { name: 'Escuro' }))
    await user.click(screen.getByRole('switch', { name: 'Animações' }))
    expect(JSON.parse(localStorage.getItem(APPEARANCE_KEY)!)).toEqual({
      fontSize: 20,
      width: 'comfortable',
      theme: 'dark',
      animations: false,
    })
    unmount()
    render(<NotesPage />)
    expect(document.documentElement).toHaveClass('dark')
    expect(document.documentElement).toHaveAttribute('data-motion', 'off')
    const content = document.querySelector<HTMLElement>('.document-content')!
    expect(content.style.maxWidth).toBe('48rem')
    expect(content.style.getPropertyValue('--document-font-size')).toBe('20px')
  })

  it('opens multiple dropped Markdown files as copies without navigating away', async () => {
    setup()
    const dataTransfer = {
      types: ['Files'],
      files: [
        file('first.md', '# First\n\nBody'),
        file('second.markdown', '# Second\n\nMore'),
      ],
    }
    fireEvent.dragEnter(window, { dataTransfer })
    expect(screen.getByText('Solte os arquivos Markdown aqui')).toBeVisible()
    const drop = new Event('drop', { cancelable: true, bubbles: true })
    Object.defineProperty(drop, 'dataTransfer', { value: dataTransfer })
    fireEvent(window, drop)
    expect(drop.defaultPrevented).toBe(true)
    expect(await screen.findByRole('heading', { name: 'First' })).toBeVisible()
    expect(screen.getByRole('tab', { name: 'Abrir aba Second' })).toBeVisible()
    expect(
      parseWorkspace(localStorage.getItem(WORKSPACE_KEY)!).notes,
    ).toHaveLength(3)
    expect(
      screen.queryByText('Solte os arquivos Markdown aqui'),
    ).not.toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: 'Salvar arquivo original' }),
    ).not.toBeInTheDocument()
  })

  it('rejects a mixed drop atomically and leaves the existing document intact', async () => {
    setup()
    fireEvent.drop(window, {
      dataTransfer: {
        types: ['Files'],
        files: [
          file('valid.md', '# Valid\n\nNew'),
          file('invalid.txt', 'Unsupported'),
        ],
      },
    })
    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent(
        'Selecione um arquivo Markdown',
      ),
    )
    expect(screen.getByRole('heading', { name: 'Guide' })).toBeVisible()
    expect(
      parseWorkspace(localStorage.getItem(WORKSPACE_KEY)!).notes,
    ).toHaveLength(1)
  })
})
