import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { NotesPage } from './notes-page'
import { exampleNotes } from '../example-notes'
import {
  emptyWorkspace,
  parseWorkspace,
  WORKSPACE_KEY,
} from '../workspace-storage'

function setup() {
  localStorage.setItem(
    WORKSPACE_KEY,
    JSON.stringify({
      ...emptyWorkspace(),
      suppressedExampleIds: exampleNotes.map((note) => note.id),
      notes: [
        {
          id: 'a',
          title: 'Delivery',
          content: '- [ ] Release API\n- [x] Build API',
          folderId: 'backend',
        },
        {
          id: 'b',
          title: 'Design',
          content: '- [ ] Review colors',
          folderId: 'frontend',
        },
      ],
      folders: [
        { id: 'backend', name: 'Backend' },
        { id: 'frontend', name: 'Frontend' },
      ],
    }),
  )
  render(<NotesPage />)
  return userEvent.setup()
}

describe('Task panel', () => {
  it('filters by status, folder and document, and persists checkbox changes in the source', async () => {
    const user = setup()
    await user.click(screen.getByRole('button', { name: 'Painel de tarefas' }))
    const dialog = within(screen.getByRole('dialog'))
    expect(dialog.getAllByRole('checkbox')).toHaveLength(2)
    await user.click(dialog.getByRole('combobox', { name: 'Pasta' }))
    await user.click(screen.getByRole('option', { name: 'Backend' }))
    expect(dialog.getAllByRole('checkbox')).toHaveLength(1)
    await user.click(dialog.getByRole('combobox', { name: 'Documento' }))
    await user.click(screen.getByRole('option', { name: 'Delivery' }))
    await user.click(
      dialog.getByRole('checkbox', { name: 'Concluir tarefa: Release API' }),
    )
    expect(dialog.queryByRole('checkbox')).not.toBeInTheDocument()
    expect(
      parseWorkspace(localStorage.getItem(WORKSPACE_KEY)!).notes.find(
        (note) => note.id === 'a',
      )?.content,
    ).toBe('- [x] Release API\n- [x] Build API')
    await user.click(dialog.getByRole('combobox', { name: 'Status' }))
    await user.click(screen.getByRole('option', { name: 'Concluídas' }))
    expect(dialog.getAllByRole('checkbox')).toHaveLength(2)
  })
  it('opens the selected task at its exact source position', async () => {
    const user = setup()
    await user.click(screen.getByRole('button', { name: 'Painel de tarefas' }))
    await user.click(
      within(screen.getByRole('dialog')).getByRole('button', {
        name: 'Design',
      }),
    )
    const editor: HTMLTextAreaElement = screen.getByRole('textbox', {
      name: 'Markdown',
    })
    await waitFor(() => expect(editor).toHaveFocus())
    expect(editor.value.slice(editor.selectionStart, editor.selectionEnd)).toBe(
      '[ ] Review colors',
    )
  })
})
