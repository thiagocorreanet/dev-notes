import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { NotesPage } from './notes-page'
import { downloadFile } from '../workspace-files'
import type { LocalDirectoryHandle, LocalFileHandle } from '../workspace-files'
import { parseWorkspace, WORKSPACE_KEY } from '../workspace-storage'

vi.mock('../workspace-files', async (importOriginal) => {
  const original = await importOriginal<typeof import('../workspace-files')>()
  return { ...original, downloadFile: vi.fn() }
})

afterEach(() => {
  delete window.showDirectoryPicker
})

function markdownFile(name: string, content: string, path = '') {
  const file = new File([content], name)
  Object.defineProperties(file, {
    text: { value: () => Promise.resolve(content) },
    webkitRelativePath: { value: path },
  })
  return file
}

async function addNote(title: string, content: string) {
  const user = userEvent.setup()
  await user.click(screen.getByRole('button', { name: 'Nova página' }))
  await user.click(screen.getByLabelText('Título'))
  await user.paste(title)
  await user.click(screen.getByLabelText('Conteúdo', { exact: true }))
  await user.paste(content)
  await user.click(screen.getByRole('button', { name: /Criar nota/ }))
}

describe('Notes workspace', () => {
  it('opens a workspace search result and clears the sidebar filter', async () => {
    render(<NotesPage />)
    await addNote('Background processing', 'Retry the worker after a timeout')
    await addNote('User interface', 'Accessible controls')
    const user = userEvent.setup()
    await user.type(
      screen.getByRole('searchbox', { name: 'Buscar notas' }),
      'interface',
    )
    await user.keyboard('{Control>}k{/Control}')
    await user.type(
      screen.getByRole('combobox', { name: 'Buscar documentos e comandos' }),
      'worker',
    )
    await user.keyboard('{Enter}')
    expect(
      screen.getByRole('heading', { name: 'Background processing' }),
    ).toBeVisible()
    expect(screen.getByRole('searchbox', { name: 'Buscar notas' })).toHaveValue(
      '',
    )
    expect(screen.getByRole('tab', { name: 'Ler' })).toHaveAttribute(
      'aria-selected',
      'true',
    )
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
  it('saves visual checklist changes as Markdown and restores them after reload', async () => {
    const { unmount } = render(<NotesPage />)
    await addNote('Lista de tarefas', '- [ ] Ship the editor')
    const user = userEvent.setup()
    await user.click(screen.getByRole('tab', { name: 'Editar' }))
    await user.click(screen.getByRole('checkbox', { name: 'Tarefa concluída' }))
    expect(
      parseWorkspace(localStorage.getItem(WORKSPACE_KEY) ?? '').notes[0]
        ?.content,
    ).toContain('- [x] Ship the editor')
    await user.click(screen.getByRole('tab', { name: 'Markdown' }))
    expect(screen.getByRole('textbox', { name: 'Markdown' })).toHaveValue(
      '- [x] Ship the editor',
    )
    unmount()
    render(<NotesPage />)
    expect(
      screen.getByRole('checkbox', { name: 'Status da tarefa' }),
    ).toBeChecked()
  })
  it('finds document occurrences, navigates in both directions, and closes the search', async () => {
    render(<NotesPage />)
    await addNote('Search example', 'Worker **worker** WORKER')
    const user = userEvent.setup()
    await user.click(
      screen.getByRole('button', { name: 'Buscar no documento' }),
    )
    await user.type(
      screen.getByRole('textbox', { name: 'Texto da busca' }),
      'worker',
    )
    await waitFor(() =>
      expect(
        screen.getByRole('status', { name: 'Resultados da busca' }),
      ).toHaveTextContent('1/3'),
    )
    await user.click(screen.getByRole('button', { name: 'Próximo resultado' }))
    expect(
      screen.getByRole('status', { name: 'Resultados da busca' }),
    ).toHaveTextContent('2/3')
    await user.click(screen.getByRole('button', { name: 'Resultado anterior' }))
    await user.click(screen.getByRole('button', { name: 'Resultado anterior' }))
    expect(
      screen.getByRole('status', { name: 'Resultados da busca' }),
    ).toHaveTextContent('3/3')
    await user.clear(screen.getByRole('textbox', { name: 'Texto da busca' }))
    await user.type(
      screen.getByRole('textbox', { name: 'Texto da busca' }),
      'missing',
    )
    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: 'Próximo resultado' }),
      ).toBeDisabled(),
    )
    await user.keyboard('{Escape}')
    expect(
      screen.queryByRole('textbox', { name: 'Texto da busca' }),
    ).not.toBeInTheDocument()
    await user.keyboard('{Control>}f{/Control}')
    expect(
      screen.getByRole('textbox', { name: 'Texto da busca' }),
    ).toBeVisible()
    await user.click(screen.getByRole('button', { name: 'Fechar busca' }))
    expect(
      screen.queryByRole('textbox', { name: 'Texto da busca' }),
    ).not.toBeInTheDocument()
  })

  it('opens visual editing without rewriting Markdown and preserves unsupported source', async () => {
    render(<NotesPage />)
    await addNote('Formatting', '__Bold__ text')
    const original = localStorage.getItem(WORKSPACE_KEY)
    const user = userEvent.setup()
    await user.click(screen.getByRole('tab', { name: 'Editar' }))
    expect(
      screen.getByRole('textbox', { name: 'Conteúdo do documento' }),
    ).toHaveTextContent('Bold text')
    expect(localStorage.getItem(WORKSPACE_KEY)).toBe(original)
    await user.click(screen.getByRole('tab', { name: 'Markdown' }))
    await user.clear(screen.getByRole('textbox', { name: 'Markdown' }))
    await user.type(
      screen.getByRole('textbox', { name: 'Markdown' }),
      '<!-- Keep this -->\n\nBody',
    )
    await user.click(screen.getByRole('tab', { name: 'Editar' }))
    expect(screen.getByRole('alert')).toHaveTextContent(
      'não consegue preservar',
    )
    await user.click(screen.getByRole('button', { name: 'Editar em Markdown' }))
    expect(screen.getByRole('textbox', { name: 'Markdown' })).toHaveValue(
      '<!-- Keep this -->\n\nBody',
    )
  })
  it('creates and selects a note, closes the form, and restores it after remounting', async () => {
    const { unmount } = render(<NotesPage />)
    await addNote(' React ', ' Component composition ')
    expect(screen.getByRole('heading', { name: 'React' })).toBeVisible()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    unmount()
    render(<NotesPage />)
    expect(screen.getByRole('heading', { name: 'React' })).toBeVisible()
    expect(screen.getByText('Component composition')).toBeVisible()
  })

  it('searches titles and content without changing the open document', async () => {
    render(<NotesPage />)
    await addNote('React', 'Reusable components')
    await addNote('TypeScript', 'Safe types')
    const user = userEvent.setup()
    const search = screen.getByRole('searchbox', { name: 'Buscar notas' })
    await user.type(search, ' REACT ')
    expect(screen.getByRole('button', { name: 'React' })).toBeVisible()
    expect(
      screen.queryByRole('button', { name: 'TypeScript' }),
    ).not.toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'TypeScript' })).toBeVisible()
    await user.clear(search)
    await user.type(search, 'SAFE TYPES')
    expect(screen.getByRole('button', { name: 'TypeScript' })).toBeVisible()
    await user.clear(search)
    await user.type(search, 'missing document')
    expect(
      screen.getByText('Nenhuma nota ou pasta encontrada. Tente outra busca.'),
    ).toBeVisible()
  })

  it('rejects fields containing only whitespace', async () => {
    render(<NotesPage />)
    await addNote('   ', '   ')
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Preencha o título e o conteúdo',
    )
    expect(screen.getByRole('dialog')).toBeVisible()
    expect(localStorage.getItem('dev-notes:notes:v1')).toBeNull()
  })

  it('keeps a note in the session and reports storage failures', async () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError')
    })
    render(<NotesPage />)
    await addNote('Important note', 'Download before leaving')
    expect(
      screen.getByRole('heading', { name: 'Important note' }),
    ).toBeVisible()
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Não foi possível salvar neste navegador',
    )
    expect(screen.getByText('Não salvo')).toBeInTheDocument()
  })

  it('edits Markdown, preserves changes across note selection, and saves for reload', async () => {
    const { unmount } = render(<NotesPage />)
    await addNote('Draft', 'Original text')
    const user = userEvent.setup()
    await user.click(screen.getByRole('tab', { name: 'Markdown' }))
    await user.clear(screen.getByLabelText('Título'))
    await user.type(screen.getByLabelText('Título'), 'Updated note')
    await user.clear(screen.getByRole('textbox', { name: 'Markdown' }))
    await user.type(
      screen.getByRole('textbox', { name: 'Markdown' }),
      '## Saved section\n\n**Updated content**',
    )
    await user.click(screen.getByRole('button', { name: 'Guia de Markdown' }))
    await user.click(screen.getByRole('button', { name: 'Updated note' }))
    await user.click(screen.getByRole('tab', { name: 'Dividir' }))
    expect(screen.getByRole('textbox', { name: 'Markdown' })).toHaveValue(
      '## Saved section\n\n**Updated content**',
    )
    expect(screen.getByRole('heading', { name: 'Saved section' })).toBeVisible()
    unmount()
    render(<NotesPage />)
    expect(screen.getByRole('heading', { name: 'Updated note' })).toBeVisible()
    expect(screen.getByText('Updated content').tagName).toBe('STRONG')
  })

  it('shows examples without writing them to storage and supports the official themes', async () => {
    render(<NotesPage />)
    expect(screen.getByRole('table')).toBeVisible()
    expect(localStorage.getItem('dev-notes:notes:v1')).toBeNull()
    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: 'Usar tema escuro' }))
    expect(document.documentElement).toHaveClass('dark')
    await user.click(screen.getByRole('button', { name: 'Usar tema claro' }))
    expect(document.documentElement).not.toHaveClass('dark')
  })

  it('does not execute embedded HTML or unsafe Markdown links', () => {
    localStorage.setItem(
      'dev-notes:notes:v1',
      JSON.stringify([
        {
          id: 'unsafe',
          title: 'Untrusted document',
          content:
            '<script>alert(1)</script>\n\n[Unsafe link](javascript:alert)',
        },
      ]),
    )
    const { container } = render(<NotesPage />)
    expect(container.querySelector('script')).toBeNull()
    expect(screen.getByText('Unsafe link')).not.toHaveAttribute(
      'href',
      'javascript:alert',
    )
  })
})

describe('Workspace toolbar', () => {
  it('keeps new documents temporary until Save workspace, then exports and restores them', async () => {
    const user = userEvent.setup()
    const { unmount } = render(<NotesPage />)
    await user.click(screen.getByRole('button', { name: 'Novo documento' }))
    await user.click(screen.getByRole('tab', { name: 'Markdown' }))
    await user.type(screen.getByLabelText('Título'), 'Temporary idea')
    await user.type(
      screen.getByRole('textbox', { name: 'Markdown' }),
      'Keep this draft',
    )
    expect(localStorage.getItem(WORKSPACE_KEY)).toBeNull()
    await user.click(
      screen.getByRole('button', { name: 'Salvar espaço de trabalho' }),
    )
    const exported = vi.mocked(downloadFile).mock.calls.at(-1)
    expect(exported?.[0]).toBe('dev-notes-workspace.json')
    const backup = parseWorkspace(exported?.[1] ?? '')
    expect(backup.notes.some((note) => note.title === 'Temporary idea')).toBe(
      true,
    )
    unmount()
    render(<NotesPage />)
    expect(
      screen.getByRole('heading', { name: 'Temporary idea' }),
    ).toBeVisible()
  })

  it('creates nested folders and pages, collapses all, and restores the hierarchy', async () => {
    const user = userEvent.setup()
    const { unmount } = render(<NotesPage />)
    await user.click(screen.getByRole('button', { name: 'Nova pasta' }))
    await user.type(screen.getByLabelText('Nome da pasta'), 'Engineering')
    await user.click(screen.getByRole('button', { name: 'Criar pasta' }))
    await user.click(screen.getByRole('button', { name: 'Pasta principal' }))
    await user.click(
      screen.getByRole('button', { name: 'Nova pasta em Engineering' }),
    )
    await user.type(screen.getByLabelText('Nome da pasta'), 'Decisions')
    await user.click(screen.getByRole('button', { name: 'Criar pasta' }))
    await addNote('ADR', 'A design decision')
    const saved = parseWorkspace(localStorage.getItem(WORKSPACE_KEY) ?? '')
    const parent = saved.folders.find((folder) => folder.name === 'Engineering')
    const child = saved.folders.find((folder) => folder.name === 'Decisions')
    expect(child?.parentId).toBe(parent?.id)
    expect(saved.notes[0]?.folderId).toBe(child?.id)
    await user.click(screen.getByRole('button', { name: 'Recolher tudo' }))
    expect(
      screen.queryByRole('button', { name: 'ADR' }),
    ).not.toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'ADR' })).toBeVisible()
    unmount()
    render(<NotesPage />)
    await user.click(screen.getByRole('button', { name: 'Pasta: Engineering' }))
    await user.click(screen.getByRole('button', { name: 'Pasta: Decisions' }))
    expect(screen.getByRole('button', { name: 'ADR' })).toBeVisible()
  })

  it('opens a folder and confirms before refreshing over workspace edits', async () => {
    let content = '# Imported guide\n\nOriginal content'
    const handle: LocalFileHandle = {
      kind: 'file',
      name: 'guide.md',
      getFile: () => Promise.resolve(markdownFile('guide.md', content)),
    }
    const directory: LocalDirectoryHandle = {
      kind: 'directory',
      name: 'Project',
      values: async function* () {
        yield await Promise.resolve(handle)
      },
    }
    window.showDirectoryPicker = vi.fn().mockResolvedValue(directory)
    const user = userEvent.setup()
    render(<NotesPage />)
    expect(
      screen.getByRole('button', { name: 'Recarregar arquivo' }),
    ).toBeDisabled()
    await user.click(screen.getByRole('button', { name: 'Abrir pasta' }))
    expect(
      await screen.findByRole('heading', { name: 'Imported guide' }),
    ).toBeVisible()
    expect(window.showDirectoryPicker).toHaveBeenCalledWith({ mode: 'read' })
    await user.click(screen.getByRole('tab', { name: 'Markdown' }))
    await user.type(
      screen.getByRole('textbox', { name: 'Markdown' }),
      ' with local changes',
    )
    content = '# Imported guide\n\nUpdated on disk'
    await user.click(screen.getByRole('button', { name: 'Recarregar arquivo' }))
    expect(screen.getByRole('alertdialog')).toBeVisible()
    await user.click(
      screen.getByRole('button', { name: 'Manter minhas alterações' }),
    )
    expect(screen.getByRole('textbox', { name: 'Markdown' })).toHaveValue(
      'Original content with local changes',
    )
    await user.click(screen.getByRole('button', { name: 'Recarregar arquivo' }))
    await user.click(screen.getByRole('button', { name: 'Recarregar arquivo' }))
    expect(screen.getByRole('textbox', { name: 'Markdown' })).toHaveValue(
      'Updated on disk',
    )
  })

  it('imports Markdown folders without the directory API and preserves existing notes', async () => {
    const user = userEvent.setup()
    render(<NotesPage />)
    await addNote('Existing note', 'Keep me')
    await user.upload(screen.getByLabelText('Selecionar pasta'), [
      markdownFile(
        'import.md',
        '# From folder\n\nImported body',
        'Folder/sub/import.md',
      ),
      markdownFile('config.json', '{}', 'Folder/config/config.json'),
    ])
    expect(
      await screen.findByRole('heading', { name: 'From folder' }),
    ).toBeVisible()
    const saved = parseWorkspace(localStorage.getItem(WORKSPACE_KEY) ?? '')
    expect(saved.notes.map((note) => note.title)).toEqual([
      'From folder',
      'Existing note',
    ])
    expect(saved.folders.map((folder) => folder.name)).toEqual([
      'Folder',
      'sub',
    ])
  })

  it('rejects non-Markdown files even when the file picker filter is bypassed', async () => {
    render(<NotesPage />)
    await addNote('Existing note', 'Keep the original content')
    const saved = localStorage.getItem(WORKSPACE_KEY)
    const user = userEvent.setup({ applyAccept: false })
    await user.upload(
      screen.getByLabelText('Selecionar arquivo Markdown'),
      markdownFile('backup.json', '{}'),
    )
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Selecione um arquivo Markdown (.md ou .markdown).',
    )
    expect(localStorage.getItem(WORKSPACE_KEY)).toBe(saved)
    expect(screen.getByRole('heading', { name: 'Existing note' })).toBeVisible()
    expect(screen.queryByText('Abrir backup')).not.toBeInTheDocument()
    expect(
      screen.queryByLabelText('Selecionar backup do espaço de trabalho'),
    ).not.toBeInTheDocument()
  })

  it('leaves the workspace untouched when a folder contains no Markdown files', async () => {
    render(<NotesPage />)
    await addNote('Existing note', 'Keep me')
    const saved = localStorage.getItem(WORKSPACE_KEY)
    const user = userEvent.setup()
    await user.upload(
      screen.getByLabelText('Selecionar pasta'),
      markdownFile('image.png', 'ignored', 'Images/image.png'),
    )
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Esta pasta não contém arquivos Markdown',
    )
    expect(localStorage.getItem(WORKSPACE_KEY)).toBe(saved)
    expect(screen.getByRole('heading', { name: 'Existing note' })).toBeVisible()
  })

  it.each([
    [
      new DOMException('Permission denied', 'NotAllowedError'),
      'Não foi possível acessar o arquivo ou a pasta.',
    ],
    [new TypeError('Failed to read file'), 'Não foi possível concluir a ação.'],
  ])('localizes native file access errors: %s', async (error, message) => {
    window.showDirectoryPicker = vi.fn().mockRejectedValue(error)
    render(<NotesPage />)
    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: 'Abrir pasta' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(message)
    expect(screen.getByRole('alert')).not.toHaveTextContent(error.message)
    expect(localStorage.getItem(WORKSPACE_KEY)).toBeNull()
  })

  it('leaves the workspace untouched when the folder picker is canceled', async () => {
    window.showDirectoryPicker = vi
      .fn()
      .mockRejectedValue(new DOMException('Canceled', 'AbortError'))
    const user = userEvent.setup()
    render(<NotesPage />)
    await user.click(screen.getByRole('button', { name: 'Abrir pasta' }))
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(localStorage.getItem(WORKSPACE_KEY)).toBeNull()
  })
})
