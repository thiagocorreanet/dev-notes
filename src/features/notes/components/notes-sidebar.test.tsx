import { useState } from 'react'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { SidebarProvider } from '@/components/ui/sidebar'
import { TooltipProvider } from '@/components/ui/tooltip'
import { NotesSidebar } from './notes-sidebar'

const folders = [
  { id: 'engineering', name: 'Engineering' },
  { id: 'backend', name: 'Backend', parentId: 'engineering' },
  { id: 'archive', name: 'Archive' },
  { id: 'empty', name: 'Empty', parentId: 'backend' },
]
const notes = [
  { id: 'root', title: 'Welcome', content: 'Overview' },
  {
    id: 'worker',
    title: 'Worker',
    content: 'Retry policy',
    folderId: 'backend',
  },
  { id: 'api', title: 'API', content: 'Endpoints', folderId: 'backend' },
]

function setup({
  sidebarNotes = notes,
  sidebarFolders = folders,
}: {
  sidebarNotes?: typeof notes
  sidebarFolders?: typeof folders
} = {}) {
  const onSelect = vi.fn()
  const onNewFolder = vi.fn()
  const onOpenFile = vi.fn()
  const onOpenFolder = vi.fn()
  function Workspace() {
    const [query, setQuery] = useState('')
    const [selectedFolder, setSelectedFolder] = useState<string>()
    const [expandedFolders, setExpandedFolders] = useState(new Set<string>())
    return (
      <SidebarProvider>
        <NotesSidebar
          notes={sidebarNotes}
          folders={sidebarFolders}
          activeId="worker"
          selectedFolder={selectedFolder}
          expandedFolders={expandedFolders}
          query={query}
          busy={false}
          canRefresh={false}
          onQueryChange={setQuery}
          onSelect={onSelect}
          onSelectRoot={() => setSelectedFolder(undefined)}
          onToggleFolder={(id, open) => {
            setSelectedFolder(id)
            setExpandedFolders((current) => {
              const next = new Set(current)
              if (open) next.add(id)
              else next.delete(id)
              return next
            })
          }}
          onOpenFile={onOpenFile}
          actions={{
            onNewDocument: vi.fn(),
            onNewPage: vi.fn(),
            onNewFolder,
            onRefresh: vi.fn(),
            onCollapseAll: () => setExpandedFolders(new Set()),
            onOpenFolder,
          }}
        />
      </SidebarProvider>
    )
  }
  render(
    <TooltipProvider>
      <Workspace />
    </TooltipProvider>,
  )
  return {
    user: userEvent.setup(),
    onSelect,
    onNewFolder,
    onOpenFile,
    onOpenFolder,
  }
}

describe('Sidebar folder hierarchy', () => {
  it('nests folders under the workspace and supports keyboard expansion and document selection', async () => {
    const { user, onSelect } = setup()
    const engineering = screen.getByTitle('Engineering')
    const rootList = engineering.closest('ul')!
    expect(screen.queryByText('Documentos')).not.toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: 'Pasta principal' }),
    ).not.toBeInTheDocument()
    expect(
      within(rootList)
        .getAllByRole('button')
        .filter((button) => button.hasAttribute('data-active'))
        .map((button) => button.title),
    ).toEqual(['Archive', 'Engineering', 'Welcome'])
    engineering.focus()
    await user.keyboard('{Enter}')
    const backend = screen.getByTitle('Engineering / Backend')
    backend.focus()
    await user.keyboard(' ')
    const contents = screen.getByRole('list', { name: 'Engineering / Backend' })
    expect(
      within(contents)
        .getAllByRole('button')
        .filter((button) => button.hasAttribute('data-active'))
        .map((button) => button.title),
    ).toEqual(['Engineering / Backend / Empty', 'API', 'Worker'])
    expect(screen.getByRole('button', { name: 'Worker' })).toHaveAttribute(
      'aria-current',
      'page',
    )
    await user.click(screen.getByRole('button', { name: 'Worker' }))
    expect(onSelect).toHaveBeenCalledWith('worker')
    await user.click(engineering)
    expect(
      screen.queryByRole('button', { name: 'Worker' }),
    ).not.toBeInTheDocument()
  })

  it('reveals matching descendants and empty folders without changing the collapsed state', async () => {
    const { user } = setup()
    const search = screen.getByRole('searchbox')
    await user.type(search, 'retry')
    expect(screen.getByRole('button', { name: 'Worker' })).toBeVisible()
    expect(
      screen.queryByRole('button', { name: 'API' }),
    ).not.toBeInTheDocument()
    expect(screen.queryByTitle('Archive')).not.toBeInTheDocument()
    await user.clear(search)
    expect(
      screen.queryByRole('button', { name: 'Worker' }),
    ).not.toBeInTheDocument()
    await user.type(search, 'ENGINEERING / BACKEND')
    expect(screen.getByRole('button', { name: 'API' })).toBeVisible()
    expect(screen.getByTitle('Engineering / Backend / Empty')).toBeVisible()
    await user.clear(search)
    await user.type(search, 'empty')
    expect(
      screen.getByRole('list', { name: 'Engineering / Backend / Empty' }),
    ).toBeVisible()
    expect(
      screen.queryByRole('button', { name: 'API' }),
    ).not.toBeInTheDocument()
  })

  it('selects and expands the parent when creating a subfolder', async () => {
    const { user, onNewFolder } = setup()
    await user.click(
      screen.getByRole('button', { name: 'Nova pasta em Engineering' }),
    )
    expect(onNewFolder).toHaveBeenCalledOnce()
    expect(screen.getByTitle('Engineering')).toHaveAttribute(
      'data-active',
      'true',
    )
    expect(screen.getByTitle('Engineering')).toHaveAttribute(
      'aria-expanded',
      'true',
    )
    expect(screen.getByTitle('Engineering / Backend')).toBeVisible()
  })

  it('shows only explicit open actions when no file or folder is available', async () => {
    const { user, onOpenFile, onOpenFolder } = setup({
      sidebarNotes: [],
      sidebarFolders: [],
    })
    expect(screen.queryByText('Documentos')).not.toBeInTheDocument()
    expect(screen.getByText('Nenhum arquivo ou pasta aberto')).toBeVisible()
    expect(
      screen.getByText(
        'Abra um documento Markdown ou PDF, ou escolha uma pasta para começar.',
      ),
    ).toBeVisible()
    await user.click(screen.getByRole('button', { name: 'Abrir arquivo' }))
    await user.click(screen.getByRole('button', { name: 'Escolher pasta' }))
    expect(onOpenFile).toHaveBeenCalledOnce()
    expect(onOpenFolder).toHaveBeenCalledOnce()
  })
})
