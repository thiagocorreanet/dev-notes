import { ItemContextMenu, ItemDropdown } from './item-actions'
import type { ItemActionRequest } from './item-actions'
import { Star, Trash2 } from 'lucide-react'
import {
  ChevronRight,
  FileType2,
  FileText,
  Folder,
  FolderOpen,
  FolderPlus,
  Upload,
  LockKeyhole,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import { Label } from '@/components/ui/label'
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarHeader,
  SidebarInput,
  SidebarMenu,
  SidebarMenuAction,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarSeparator,
  useSidebar,
} from '@/components/ui/sidebar'
import type { Note, WorkspaceFolder } from '../types'
import { WorkspaceToolbar } from './workspace-toolbar'
import type { ComponentProps } from 'react'
import { DevNotesBrand } from './devnotes-brand'

interface NotesSidebarProps {
  onItemAction?: ((request: ItemActionRequest) => void) | undefined
  onOpenTrash?: (() => void) | undefined
  notes: Note[]
  folders: WorkspaceFolder[]
  activeId: string
  selectedFolder: string | undefined
  expandedFolders: Set<string>
  query: string
  busy: boolean
  canRefresh: boolean
  localFile?: boolean
  onQueryChange: (query: string) => void
  onSelect: (id: string) => void
  onSelectRoot: () => void
  onToggleFolder: (id: string, open: boolean) => void
  actions: Omit<
    ComponentProps<typeof WorkspaceToolbar>,
    'busy' | 'canRefresh' | 'hasFolders'
  >
  onOpenFile: () => void
  protectionOwner?: (target: {
    kind: 'note' | 'folder'
    id: string
  }) => string | undefined
  isNoteLocked?: (id: string) => boolean
  isFolderLocked?: (id: string) => boolean
}

export function NotesSidebar({
  onItemAction,
  onOpenTrash,
  notes,
  folders,
  activeId,
  selectedFolder,
  expandedFolders,
  query,
  busy,
  canRefresh,
  localFile = false,
  onQueryChange,
  onSelect,
  onSelectRoot,
  onToggleFolder,
  actions,
  onOpenFile,
  protectionOwner = () => undefined,
  isNoteLocked = () => false,
  isFolderLocked = () => false,
}: NotesSidebarProps) {
  const { setOpenMobile, isMobile } = useSidebar()
  const search = query.trim().toLowerCase()
  const folderById = new Map(folders.map((folder) => [folder.id, folder]))
  function folderPath(id?: string) {
    const names: string[] = []
    const visited = new Set<string>()
    while (id && !visited.has(id)) {
      visited.add(id)
      const folder = folderById.get(id)
      if (!folder) break
      names.unshift(folder.name)
      id = folder.parentId
    }
    return names.join(' / ')
  }
  const filteredNotes = notes.filter((note) =>
    `${note.title} ${note.content} ${folderPath(note.folderId)}`
      .toLowerCase()
      .includes(search),
  )
  const visibleFolders = new Set<string>()
  function revealFolder(id?: string) {
    while (id && !visibleFolders.has(id)) {
      visibleFolders.add(id)
      id = folderById.get(id)?.parentId
    }
  }
  for (const note of filteredNotes) revealFolder(note.folderId)
  for (const folder of folders) {
    if (folderPath(folder.id).toLowerCase().includes(search))
      revealFolder(folder.id)
  }

  function renderItems(parentId?: string) {
    const childFolders = folders
      .filter(
        (folder) =>
          folder.parentId === parentId && visibleFolders.has(folder.id),
      )
      .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR', { numeric: true }))
    const childNotes = filteredNotes
      .filter((note) => note.folderId === parentId)
      .sort((a, b) =>
        a.title.localeCompare(b.title, 'pt-BR', { numeric: true }),
      )
    return (
      <>
        {childFolders.map((folder) => {
          const open = !!search || expandedFolders.has(folder.id)
          const ownerId = protectionOwner({ kind: 'folder', id: folder.id })
          const protectedFolder = !!ownerId
          const locked = isFolderLocked(folder.id)
          return (
            <Collapsible
              key={folder.id}
              asChild
              open={locked ? false : open}
              onOpenChange={(next) => {
                if (locked) {
                  onItemAction?.({
                    kind: 'folder',
                    id: folder.id,
                    action: 'unlock',
                  })
                  return
                }
                onToggleFolder(folder.id, next)
              }}
            >
              <SidebarMenuItem>
                <ItemContextMenu
                  target={{ kind: 'folder', id: folder.id }}
                  name={folder.name}
                  disabled={busy || !onItemAction}
                  protected={protectedFolder}
                  locked={locked}
                  protectionOwner={ownerId === folder.id}
                  onAction={(request) => onItemAction?.(request)}
                >
                  <CollapsibleTrigger asChild>
                    <SidebarMenuButton
                      className={onItemAction ? 'pr-14' : undefined}
                      isActive={selectedFolder === folder.id}
                      title={folderPath(folder.id)}
                      aria-label={`Pasta: ${folder.name}`}
                    >
                      <ChevronRight
                        className={`transition-transform duration-150 motion-reduce:transition-none ${open ? 'rotate-90' : ''}`}
                        aria-hidden="true"
                      />
                      {open ? (
                        <FolderOpen aria-hidden="true" />
                      ) : (
                        <Folder aria-hidden="true" />
                      )}
                      <span>{folder.name}</span>
                      {protectedFolder && (
                        <LockKeyhole
                          className="ml-auto size-3.5"
                          aria-label={
                            locked ? 'Pasta bloqueada' : 'Pasta protegida'
                          }
                        />
                      )}
                    </SidebarMenuButton>
                  </CollapsibleTrigger>
                </ItemContextMenu>
                {onItemAction && (
                  <ItemDropdown
                    target={{ kind: 'folder', id: folder.id }}
                    name={folder.name}
                    disabled={busy}
                    protected={protectedFolder}
                    locked={locked}
                    protectionOwner={ownerId === folder.id}
                    onAction={onItemAction}
                  />
                )}
                <SidebarMenuAction
                  showOnHover
                  disabled={busy}
                  aria-label={`Nova pasta em ${folderPath(folder.id)}`}
                  title="Nova subpasta"
                  onClick={() => {
                    onToggleFolder(folder.id, true)
                    leaveSidebar(actions.onNewFolder)
                  }}
                >
                  <FolderPlus aria-hidden="true" />
                </SidebarMenuAction>
                <CollapsibleContent className="overflow-hidden duration-200 data-open:animate-collapsible-down data-closed:animate-collapsible-up motion-reduce:animate-none">
                  <SidebarMenuSub
                    className="mr-0"
                    aria-label={folderPath(folder.id)}
                  >
                    {renderItems(folder.id)}
                  </SidebarMenuSub>
                </CollapsibleContent>
              </SidebarMenuItem>
            </Collapsible>
          )
        })}
        {childNotes.map((note) => {
          const ownerId = protectionOwner({ kind: 'note', id: note.id })
          const protectedNote = !!ownerId
          const locked = isNoteLocked(note.id)
          const pdf = note.mediaType === 'pdf'
          const button = (
            <SidebarMenuButton
              isActive={note.id === activeId}
              aria-current={note.id === activeId ? 'page' : undefined}
              title={note.sourcePath ?? note.title}
              onClick={() => {
                onSelect(note.id)
                setOpenMobile(false)
              }}
            >
              {pdf ? (
                <FileType2 aria-hidden="true" />
              ) : (
                <FileText aria-hidden="true" />
              )}
              <span>{note.title || 'Documento sem título'}</span>
              {protectedNote && (
                <LockKeyhole
                  className="ml-auto size-3.5"
                  aria-label={
                    locked ? 'Documento bloqueado' : 'Documento protegido'
                  }
                />
              )}
            </SidebarMenuButton>
          )
          return (
            <SidebarMenuItem key={note.id}>
              {pdf ? (
                button
              ) : (
                <ItemContextMenu
                  target={{ kind: 'note', id: note.id }}
                  name={note.title}
                  favorite={note.favorite}
                  disabled={busy || !onItemAction}
                  protected={protectedNote}
                  locked={locked}
                  protectionOwner={ownerId === note.id}
                  onAction={(request) => onItemAction?.(request)}
                >
                  {button}
                </ItemContextMenu>
              )}
              {onItemAction && !pdf && (
                <ItemDropdown
                  target={{ kind: 'note', id: note.id }}
                  name={note.title || 'Documento sem título'}
                  favorite={note.favorite}
                  disabled={busy}
                  protected={protectedNote}
                  locked={locked}
                  protectionOwner={ownerId === note.id}
                  onAction={onItemAction}
                />
              )}
            </SidebarMenuItem>
          )
        })}
        {!childFolders.length && !childNotes.length && parentId && (
          <SidebarMenuItem className="px-2 py-1 text-xs text-muted-foreground">
            Pasta vazia
          </SidebarMenuItem>
        )}
      </>
    )
  }

  function leaveSidebar(action: () => void) {
    setOpenMobile(false)
    action()
  }

  return (
    <Sidebar
      collapsible={isMobile ? 'offcanvas' : 'none'}
      className={isMobile ? undefined : 'w-full'}
    >
      <SidebarHeader className="gap-4 p-4">
        <div className="space-y-2">
          <DevNotesBrand />
          <p className="text-xs text-muted-foreground">
            Seus documentos de desenvolvimento em Markdown e PDF.
          </p>
        </div>
        <div className="flex items-center justify-between gap-2">
          <Button
            variant="ghost"
            size="sm"
            className="-ml-2 h-7 min-w-0 px-2 text-xs font-medium text-muted-foreground"
            aria-label="Selecionar raiz do espaço de trabalho"
            aria-pressed={selectedFolder === undefined}
            onClick={onSelectRoot}
          >
            Espaço de trabalho
          </Button>
          <WorkspaceToolbar
            {...actions}
            onNewDocument={() => leaveSidebar(actions.onNewDocument)}
            onNewPage={() => leaveSidebar(actions.onNewPage)}
            onNewFolder={() => leaveSidebar(actions.onNewFolder)}
            onRefresh={() => leaveSidebar(actions.onRefresh)}
            busy={busy}
            canRefresh={canRefresh}
            hasFolders={folders.length > 0}
          />
        </div>
        <div>
          <Label htmlFor="note-search" className="sr-only">
            Buscar documentos
          </Label>
          <SidebarInput
            id="note-search"
            type="search"
            placeholder="Buscar documentos e pastas…"
            value={query}
            onChange={(event) => onQueryChange(event.target.value)}
          />
        </div>
      </SidebarHeader>
      <SidebarSeparator />
      <SidebarContent>
        {notes.some((note) => note.favorite) && (
          <SidebarGroup>
            <p className="px-2 py-1 text-xs font-medium text-muted-foreground">
              Favoritos
            </p>
            <SidebarMenu>
              {notes
                .filter((note) => note.favorite)
                .map((note) => (
                  <SidebarMenuItem key={note.id}>
                    <SidebarMenuButton
                      isActive={note.id === activeId}
                      aria-label={`Favorito: ${note.title || 'Documento sem título'}`}
                      onClick={() => {
                        onSelect(note.id)
                        setOpenMobile(false)
                      }}
                    >
                      <Star aria-hidden="true" />
                      <span>{note.title || 'Documento sem título'}</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
            </SidebarMenu>
          </SidebarGroup>
        )}
        <SidebarGroup>
          {filteredNotes.length || visibleFolders.size ? (
            <>
              <nav aria-label="Arquivos e pastas">
                <SidebarMenu>{renderItems()}</SidebarMenu>
              </nav>
              <p role="status" className="sr-only">
                {`${filteredNotes.length} ${filteredNotes.length === 1 ? 'documento' : 'documentos'} e ${visibleFolders.size} ${visibleFolders.size === 1 ? 'pasta encontrada' : 'pastas encontradas'}.`}
              </p>
            </>
          ) : search ? (
            <p role="status" className="p-3 text-sm text-muted-foreground">
              Nenhum documento ou pasta encontrado. Tente outra busca.
            </p>
          ) : (
            <>
              <p role="status" className="sr-only">
                Nenhum arquivo ou pasta está aberto.
              </p>
              <Empty className="px-2 py-8">
                <EmptyHeader>
                  <EmptyMedia variant="icon">
                    <FolderOpen aria-hidden="true" />
                  </EmptyMedia>
                  <EmptyTitle>Nenhum arquivo ou pasta aberto</EmptyTitle>
                  <EmptyDescription>
                    Abra um documento Markdown ou PDF, ou escolha uma pasta para
                    começar.
                  </EmptyDescription>
                </EmptyHeader>
                <EmptyContent className="flex-row justify-center">
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={busy}
                    onClick={() => leaveSidebar(onOpenFile)}
                  >
                    <Upload aria-hidden="true" />
                    Abrir arquivo
                  </Button>
                  <Button
                    size="sm"
                    disabled={busy}
                    onClick={() => leaveSidebar(actions.onOpenFolder)}
                  >
                    <FolderOpen aria-hidden="true" />
                    Escolher pasta
                  </Button>
                </EmptyContent>
              </Empty>
            </>
          )}
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter className="gap-2 border-t p-4 text-xs text-muted-foreground">
        {onOpenTrash && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => leaveSidebar(onOpenTrash)}
          >
            <Trash2 aria-hidden="true" />
            Lixeira
          </Button>
        )}
        <Button
          variant="ghost"
          size="sm"
          disabled={busy}
          onClick={() => leaveSidebar(onOpenFile)}
        >
          <Upload aria-hidden="true" />
          Abrir documento
        </Button>
        <p className="font-medium text-sidebar-foreground">
          Guarde o que aprende. Desenvolva melhor.
        </p>
        <p>
          {localFile
            ? 'Salvar grava as alterações no arquivo original.'
            : notes.length || folders.length
              ? 'Você edita cópias. Os arquivos originais não mudam.'
              : 'Abra um arquivo ou escolha uma pasta para começar.'}
        </p>
      </SidebarFooter>
    </Sidebar>
  )
}
