import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { NotesPage } from './notes-page'
import { NoteForm } from './note-form'
import { MarkdownPreview } from './markdown-preview'
import { VisualEditor } from './visual-editor'
import { TooltipProvider } from '@/components/ui/tooltip'
import { NoteNavigationContext } from '../note-navigation'
import {
  emptyWorkspace,
  parseWorkspace,
  WORKSPACE_KEY,
} from '../workspace-storage'
import { useNotes } from '../hooks/use-notes'
import { renderHook, act } from '@testing-library/react'

function seed() {
  localStorage.setItem(
    WORKSPACE_KEY,
    JSON.stringify({
      ...emptyWorkspace(),
      notes: [
        { id: 'a', title: 'First', content: 'Original text' },
        { id: 'b', title: 'Second', content: 'Another document' },
      ],
    }),
  )
}

describe('Document workflows', () => {
  it('renames, duplicates, favorites, trashes, and restores a document through its menu', async () => {
    seed()
    const user = userEvent.setup()
    render(<NotesPage />)
    await user.click(screen.getByRole('button', { name: 'Ações de First' }))
    await user.click(screen.getByRole('menuitem', { name: 'Renomear' }))
    await user.clear(screen.getByLabelText('Nome'))
    await user.type(screen.getByLabelText('Nome'), 'Renamed')
    await user.click(screen.getByRole('button', { name: 'Salvar nome' }))
    expect(screen.getByRole('heading', { name: 'Renamed' })).toBeVisible()
    await user.click(
      screen.getByRole('button', {
        name: 'Adicionar aos favoritos',
      }),
    )
    expect(
      screen.getByRole('button', { name: 'Favorito: Renamed' }),
    ).toBeVisible()
    await user.click(screen.getByRole('button', { name: 'Ações de Renamed' }))
    await user.click(screen.getByRole('menuitem', { name: 'Duplicar' }))
    expect(
      screen.getByRole('heading', { name: 'Renamed (cópia)' }),
    ).toBeVisible()
    await user.click(
      screen.getByRole('button', { name: 'Ações de Renamed (cópia)' }),
    )
    await user.click(
      screen.getByRole('menuitem', { name: 'Mover para a lixeira' }),
    )
    expect(
      screen.queryByRole('button', { name: 'Renamed (cópia)' }),
    ).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Lixeira' }))
    await user.click(
      screen.getByRole('button', { name: 'Restaurar Renamed (cópia)' }),
    )
    expect(
      within(screen.getByRole('dialog', { name: 'Lixeira' })).getByText(
        'A lixeira está vazia.',
      ),
    ).toBeVisible()
    expect(
      parseWorkspace(localStorage.getItem(WORKSPACE_KEY)!).notes.some(
        (note) => note.title === 'Renamed (cópia)' && !note.deletedAt,
      ),
    ).toBe(true)
  }, 15000)

  it('keeps edits while switching and closing tabs and restores favorites and tabs on reload', async () => {
    seed()
    const user = userEvent.setup()
    const { unmount } = render(<NotesPage />)
    await user.click(screen.getByRole('tab', { name: 'Markdown' }))
    fireEvent.change(screen.getByRole('textbox', { name: 'Markdown' }), {
      target: { value: 'Updated content' },
    })
    await user.click(screen.getByRole('button', { name: 'Second' }))
    await user.click(screen.getByRole('tab', { name: 'Abrir aba First' }))
    expect(screen.getByRole('textbox', { name: 'Markdown' })).toHaveValue(
      'Updated content',
    )
    await user.click(screen.getByRole('button', { name: 'Fechar aba Second' }))
    expect(
      screen.queryByRole('tab', { name: 'Abrir aba Second' }),
    ).not.toBeInTheDocument()
    unmount()
    render(<NotesPage />)
    expect(screen.getByRole('heading', { name: 'First' })).toBeVisible()
    expect(screen.getByText('Updated content')).toBeVisible()
    expect(
      screen.queryByRole('tab', { name: 'Abrir aba Second' }),
    ).not.toBeInTheDocument()
  }, 15000)

  it('compares and restores a previous version while retaining the replaced text', async () => {
    seed()
    const user = userEvent.setup()
    render(<NotesPage />)
    await user.click(screen.getByRole('tab', { name: 'Markdown' }))
    fireEvent.change(screen.getByRole('textbox', { name: 'Markdown' }), {
      target: { value: 'Changed text' },
    })
    await user.click(
      screen.getByRole('button', { name: 'Histórico de versões' }),
    )
    expect(
      screen.getByLabelText('Alterações entre as versões'),
    ).toHaveTextContent('Original text')
    expect(
      screen.getByLabelText('Alterações entre as versões'),
    ).toHaveTextContent('Changed text')
    await user.click(
      screen.getByRole('button', { name: 'Restaurar esta versão' }),
    )
    expect(screen.getByRole('textbox', { name: 'Markdown' })).toHaveValue(
      'Original text',
    )
    const note = parseWorkspace(localStorage.getItem(WORKSPACE_KEY)!).notes[0]!
    expect(note.revisions?.[0]?.content).toBe('Changed text')
  }, 15000)

  it('keeps favorites, trash, revisions, images, and internal links when exporting and merging a backup', () => {
    const image = '![Screenshot](data:image/png;base64,eA==)'
    const { result } = renderHook(useNotes)
    let firstId = ''
    let secondId = ''
    act(() => {
      firstId = result.current.addNote('First', image).id
      secondId = result.current.addNote(
        'Second',
        `[First](#note/${firstId})`,
      ).id
    })
    act(() => {
      result.current.runAction({ kind: 'note', id: firstId, type: 'favorite' })
      result.current.runAction({
        kind: 'note',
        id: firstId,
        type: 'rename',
        name: 'Renamed',
      })
      result.current.runAction({ kind: 'note', id: firstId, type: 'trash' })
    })
    const backup = parseWorkspace(localStorage.getItem(WORKSPACE_KEY)!)
    let imported: ReturnType<typeof result.current.mergeWorkspace> | undefined
    act(() => {
      imported = result.current.mergeWorkspace(backup)
    })
    const restored = imported!.notes.find((note) => note.title === 'Renamed')!
    expect(restored).toMatchObject({ content: image, favorite: true })
    expect(restored.deletedAt).toBeTruthy()
    expect(restored.revisions?.[0]?.title).toBe('First')
    expect(restored.id).not.toBe(firstId)
    expect(
      imported!.notes.find((note) => note.title === 'Second')?.content,
    ).toBe(`[First](#note/${restored.id})`)
    expect(result.current.notes.some((note) => note.id === secondId)).toBe(true)
  })
})

describe('Writing tools', () => {
  it('starts a document from a template and protects text when switching templates', async () => {
    const user = userEvent.setup()
    const onAdd = vi.fn()
    render(<NoteForm onAdd={onAdd} />)
    await user.click(screen.getByRole('combobox', { name: 'Modelo' }))
    await user.click(
      screen.getByRole('option', { name: 'Investigação de bug' }),
    )
    expect(
      screen.getByLabelText<HTMLTextAreaElement>('Conteúdo', { exact: true })
        .value,
    ).toContain('## Como reproduzir')
    await user.click(screen.getByRole('combobox', { name: 'Modelo' }))
    await user.click(
      screen.getByRole('option', { name: 'Anotação de reunião' }),
    )
    await user.click(screen.getByRole('button', { name: 'Manter meu texto' }))
    expect(screen.getByLabelText('Título')).toHaveValue('Investigação de bug')
    await user.click(screen.getByRole('button', { name: 'Criar nota' }))
    expect(onAdd).toHaveBeenCalledWith(
      'Investigação de bug',
      expect.stringContaining('## Como reproduzir'),
    )
  })

  it('renders internal links outside code and navigates by title or stable ID', async () => {
    const onSelect = vi.fn()
    const user = userEvent.setup()
    render(
      <NoteNavigationContext.Provider
        value={{
          notes: [{ id: 'a', title: 'Guide', content: '' }],
          folders: [],
          onSelect,
        }}
      >
        <MarkdownPreview
          content={
            '[[Guide]]\n\n[Stable](#note/a)\n\n`[[Code]]`\n\n[[Missing]]'
          }
        />
      </NoteNavigationContext.Provider>,
    )
    await user.click(screen.getByRole('button', { name: 'Guide' }))
    await user.click(screen.getByRole('button', { name: 'Stable' }))
    expect(onSelect.mock.calls).toEqual([['a'], ['a']])
    expect(screen.getByText('[[Code]]').tagName).toBe('CODE')
    expect(screen.getByRole('button', { name: 'Missing' })).toBeDisabled()
  })

  it('highlights code and copies its exact content', async () => {
    const user = userEvent.setup()
    const { container } = render(
      <MarkdownPreview content={'```ts\nconst value = 1\n```'} />,
    )
    expect(container.querySelector('.hljs-keyword')).toHaveTextContent('const')
    await user.click(screen.getByRole('button', { name: 'Copiar código' }))
    expect(await navigator.clipboard.readText()).toBe('const value = 1\n')
    expect(screen.getByRole('status')).toHaveTextContent('Copiado')
  })

  it('inserts a table through the slash menu using the keyboard', async () => {
    const onChange = vi.fn()
    const user = userEvent.setup()
    render(
      <TooltipProvider>
        <VisualEditor
          content=""
          onChange={onChange}
          disabled={false}
          onSource={vi.fn()}
        />
      </TooltipProvider>,
    )
    const editor = screen.getByRole('textbox', {
      name: 'Conteúdo do documento',
    })
    await user.click(editor)
    await user.keyboard('/tabela')
    expect(screen.getByRole('option', { name: /Tabela/ })).toBeVisible()
    await user.keyboard('{Enter}')
    await waitFor(() =>
      expect(onChange).toHaveBeenLastCalledWith(expect.stringContaining('|')),
    )
    expect(
      screen.queryByRole('option', { name: /Tabela/ }),
    ).not.toBeInTheDocument()
  })
})
