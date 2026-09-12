import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { WorkspaceSearch } from './workspace-search'
import { editorCommandDefinitions } from '../editor-commands'

const notes = [
  {
    id: 'api',
    title: 'API guide',
    content: 'Retry workers after a timeout.',
    folderId: 'backend',
  },
  {
    id: 'ui',
    title: 'UI guide',
    content: 'Accessible dialogs and keyboard navigation.',
  },
  { id: 'draft', title: '', content: 'A temporary idea.' },
]
const folders = [
  { id: 'engineering', name: 'Engineering' },
  { id: 'backend', name: 'Backend', parentId: 'engineering' },
]

describe('Workspace command search', () => {
  it('prioritizes a matching action label over descriptions and prevents disabled commands', async () => {
    const run = vi.fn()
    const commands = editorCommandDefinitions.map((command) => ({
      ...command,
      disabled: command.id === 'pdf',
      onSelect: () => {
        run(command.id)
      },
    }))
    render(
      <WorkspaceSearch
        notes={[]}
        folders={[]}
        onSelect={vi.fn()}
        commands={commands}
      />,
    )
    const user = userEvent.setup()
    await user.keyboard('{Control>}k{/Control}')
    await user.type(screen.getByRole('combobox'), 'salvar como')
    expect(screen.getAllByRole('option')[0]).toHaveAccessibleName('Salvar como')
    await user.keyboard('{Enter}')
    expect(run).toHaveBeenCalledExactlyOnceWith('save-as')
    await user.keyboard('{Control>}k{/Control}')
    await user.type(screen.getByRole('combobox'), 'pdf')
    expect(screen.getByRole('option')).toHaveAttribute('aria-disabled', 'true')
    await user.keyboard('{Enter}')
    expect(run).toHaveBeenCalledOnce()
  })
  it('opens from its button, searches content, and opens the selected document', async () => {
    const onSelect = vi.fn()
    render(
      <WorkspaceSearch notes={notes} folders={folders} onSelect={onSelect} />,
    )
    const user = userEvent.setup()
    await user.click(
      screen.getByRole('button', { name: 'Buscar no espaço de trabalho' }),
    )
    const dialog = screen.getByRole('dialog', {
      name: 'Buscar no espaço de trabalho',
    })
    const input = within(dialog).getByRole('combobox', {
      name: 'Buscar documentos e comandos',
    })
    expect(input).toHaveFocus()
    await user.type(input, 'WORKERS')
    expect(within(dialog).getAllByRole('option')).toHaveLength(1)
    expect(within(dialog).getByRole('option')).toHaveTextContent(
      'Retry workers after a timeout.',
    )
    await user.keyboard('{Enter}')
    expect(onSelect).toHaveBeenCalledWith('api')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('supports Ctrl/Cmd+K, arrow navigation, Escape, and resetting the query', async () => {
    const onSelect = vi.fn()
    render(
      <WorkspaceSearch notes={notes} folders={folders} onSelect={onSelect} />,
    )
    const user = userEvent.setup()
    await user.keyboard('{Control>}k{/Control}')
    await user.keyboard('{ArrowDown}{Enter}')
    expect(onSelect).toHaveBeenCalledWith('ui')
    await user.keyboard('{Meta>}k{/Meta}')
    await user.type(screen.getByRole('combobox'), 'missing')
    expect(
      screen.getByText('Nenhum documento ou comando encontrado.'),
    ).toBeVisible()
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    await user.click(
      screen.getByRole('button', { name: 'Buscar no espaço de trabalho' }),
    )
    expect(screen.getByRole('combobox')).toHaveValue('')
    expect(screen.getAllByRole('option')).toHaveLength(3)
  })

  it('finds folder paths and unnamed drafts and supports selecting by click', async () => {
    const onSelect = vi.fn()
    render(
      <WorkspaceSearch notes={notes} folders={folders} onSelect={onSelect} />,
    )
    const user = userEvent.setup()
    await user.click(
      screen.getByRole('button', { name: 'Buscar no espaço de trabalho' }),
    )
    await user.type(screen.getByRole('combobox'), 'engineering / backend')
    expect(screen.getByRole('option')).toHaveTextContent('API guide')
    await user.clear(screen.getByRole('combobox'))
    await user.type(screen.getByRole('combobox'), 'temporary idea')
    await user.click(
      screen.getByRole('option', { name: /Documento sem título/ }),
    )
    expect(onSelect).toHaveBeenCalledWith('draft')
  })
})
