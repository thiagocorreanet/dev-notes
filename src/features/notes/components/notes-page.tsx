import { BackupDialog } from './backup-dialog'
import { SaveDestination } from './save-destination'
import { useAppearance } from '../hooks/use-appearance'
import { useReadingPosition } from '../hooks/use-reading-position'
import { motionEnabled } from '../appearance'
import { AppearanceDialog } from './appearance-dialog'
import { MarkdownDropZone } from './markdown-drop-zone'
import { DraftRecovery } from './draft-recovery'
import { Focus, Settings2 } from 'lucide-react'
import { Spinner } from '@/components/ui/spinner'
import { DocumentLoading } from './document-loading'
import { NoteNavigationContext } from '../note-navigation'
import { DocumentTabs } from './document-tabs'
import { ItemDialog, TrashDialog, HistoryDialog } from './workspace-dialogs'
import type { ItemActionRequest } from './item-actions'
import { WorkspaceError } from '../workspace-error'
import { TaskPanel } from './task-panel'
import { LocalFolderDialog } from './local-folder-dialog'
import type { NoteTask } from '../note-tasks'
import { History, Star, ListTodo, FolderSync } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import {
  BookOpen,
  Check,
  CircleAlert,
  Columns2,
  Code2,
  Download,
  Save,
  FileText,
  Moon,
  Pencil,
  Sun,
} from 'lucide-react'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from '@/components/ui/sidebar'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { useWorkspace } from '../hooks/use-workspace'
import { downloadFile, markdownFilename } from '../workspace-files'
import { FolderForm } from './folder-form'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import type { Note } from '../types'
import { MarkdownPreview } from './markdown-preview'
import { NoteForm } from './note-form'
import { NotesSidebar } from './notes-sidebar'
import { VisualEditor } from './visual-editor'
import { DocumentSearch } from './document-search'
import { WorkspaceSearch } from './workspace-search'
import { editorCommandDefinitions } from '../editor-commands'
import type { EditorCommandId } from '../editor-commands'
import { AiSettingsDialog } from './ai-settings-dialog'
import { AiChat } from './ai-chat'
import { loadAiSettings } from '../ai-settings'
import type { DocumentSearchHandle } from './document-search'
import { DocumentMinimap } from './document-minimap'
import { DocumentPresentation } from './document-presentation'
import { PrintDocument } from './print-document'
import { SaveAsDialog } from './save-as-dialog'
import { ResizableWorkspace } from './resizable-workspace'

function downloadNote(note: Note) {
  downloadFile(
    markdownFilename(note.title),
    `# ${note.title}\n\n${note.content}\n`,
    'text/markdown;charset=utf-8',
  )
}

function NoteEditor({
  note,
  onChange,
  temporary,
  local,
  disabled,
  visual,
  onSource,
}: {
  note: Note
  onChange: (note: Note) => void
  temporary: boolean
  local: boolean
  disabled: boolean
  visual: boolean
  onSource: () => void
}) {
  return (
    <section
      aria-label={visual ? 'Editor visual' : 'Editor Markdown'}
      className="flex min-w-0 flex-col gap-5"
    >
      <div className="space-y-2">
        <Label htmlFor="editor-title">Título</Label>
        <Input
          id="editor-title"
          disabled={disabled}
          maxLength={100}
          value={note.title}
          onChange={(event) => onChange({ ...note, title: event.target.value })}
        />
      </div>
      {visual ? (
        <VisualEditor
          content={note.content}
          onChange={(content) => onChange({ ...note, content })}
          disabled={disabled}
          onSource={onSource}
        />
      ) : (
        <div className="flex flex-1 flex-col gap-2">
          <Label htmlFor="editor-content">Markdown</Label>
          <Textarea
            id="editor-content"
            disabled={disabled}
            className="min-h-96 flex-1 font-mono text-sm leading-5"
            value={note.content}
            onChange={(event) =>
              onChange({ ...note, content: event.target.value })
            }
            spellCheck={false}
          />
        </div>
      )}
      <p className="text-xs text-muted-foreground">
        {local
          ? 'Use Salvar ou Ctrl/Cmd+S para gravar as alterações no arquivo original.'
          : temporary
            ? 'Documento temporário. Salve o espaço de trabalho para guardar suas alterações.'
            : 'As alterações são salvas automaticamente neste navegador.'}
      </p>
    </section>
  )
}

export function NotesPage() {
  const workspace = useWorkspace()
  const {
    directoryInput: directoryInputRef,
    refreshInput: refreshInputRef,
    fileInput: fileInputRef,
    activeNote,
    isSaved,
    isDraft,
    error,
    query,
    setQuery,
    mode,
    setMode,
  } = workspace
  const [itemRequest, setItemRequest] = useState<ItemActionRequest | null>(null)
  const [showTrash, setShowTrash] = useState(false)
  const [managementError, setManagementError] = useState('')
  function requestItemAction(request: ItemActionRequest) {
    if (
      request.action === 'rename' ||
      request.action === 'move' ||
      request.action === 'history'
    ) {
      setItemRequest(request)
      return
    }
    try {
      if (request.action === 'duplicate')
        workspace.performAction({
          ...request,
          type: 'duplicate',
          newId: crypto.randomUUID(),
        })
      else workspace.performAction({ ...request, type: request.action })
      setManagementError('')
    } catch (error) {
      setManagementError(
        error instanceof WorkspaceError
          ? error.message
          : 'Não foi possível concluir a ação.',
      )
    }
  }
  const historyNote =
    itemRequest?.action === 'history'
      ? workspace.documents.find((note) => note.id === itemRequest.id)
      : undefined
  const {
    appearance,
    update: updateAppearance,
    error: appearanceError,
  } = useAppearance()
  const dark = appearance.theme === 'dark'
  const [focusMode, setFocusMode] = useState(false)
  const focusButton = useRef<HTMLButtonElement>(null)
  const [navigationTarget, setNavigationTarget] = useState<string | null>(null)
  useReadingPosition(activeNote.id, mode, workspace.localDocuments.loading)
  useEffect(() => {
    if (!focusMode) return
    function leaveFocus(event: KeyboardEvent) {
      if (
        event.key !== 'Escape' ||
        event.defaultPrevented ||
        document.querySelector(
          '[role="dialog"], [role="alertdialog"], [role="listbox"]',
        )
      )
        return
      setFocusMode(false)
      focusButton.current?.focus()
    }
    document.addEventListener('keydown', leaveFocus)
    return () => document.removeEventListener('keydown', leaveFocus)
  }, [focusMode])
  const themeTimer = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  )
  function toggleTheme() {
    clearTimeout(themeTimer.current)
    document.documentElement.setAttribute('data-theme-transition', '')
    updateAppearance({ ...appearance, theme: dark ? 'light' : 'dark' })
    themeTimer.current = setTimeout(() => {
      document.documentElement.removeAttribute('data-theme-transition')
    }, 200)
  }
  useEffect(
    () => () => {
      clearTimeout(themeTimer.current)
      document.documentElement.removeAttribute('data-theme-transition')
    },
    [],
  )
  const documentSearchRef = useRef<DocumentSearchHandle>(null)
  const [panel, setPanel] = useState<
    | 'ai'
    | 'minimap'
    | 'presentation'
    | 'save-as'
    | 'tasks'
    | 'local-folder'
    | 'appearance'
    | 'backup'
    | null
  >(null)
  const [taskTarget, setTaskTarget] = useState<NoteTask | null>(null)
  const [printNote, setPrintNote] = useState<Note | null>(null)
  const [aiSettings, setAiSettings] = useState(loadAiSettings)

  useEffect(() => {
    if (
      !taskTarget ||
      activeNote.id !== taskTarget.noteId ||
      mode !== 'source' ||
      panel
    )
      return
    const timer = setTimeout(() => {
      const editor = document.getElementById('editor-content')
      if (editor instanceof HTMLTextAreaElement) {
        editor.focus()
        editor.setSelectionRange(taskTarget.offset - 1, taskTarget.end)
        editor.scrollTop = Math.max(
          0,
          (editor.value.slice(0, taskTarget.offset).split('\n').length - 3) *
            20,
        )
      }
    }, 0)
    return () => clearTimeout(timer)
  }, [taskTarget, activeNote.id, mode, panel])

  function showPanel(next: NonNullable<typeof panel>) {
    documentSearchRef.current?.close()
    setPanel(next)
  }

  const commandActions: Record<EditorCommandId, () => void> = {
    'import-backup': () => showPanel('backup'),
    appearance: () => showPanel('appearance'),
    focus: () => setFocusMode((current) => !current),
    tasks: () => showPanel('tasks'),
    'local-folder': () => showPanel('local-folder'),
    theme: toggleTheme,
    pdf: () => {
      documentSearchRef.current?.close()
      setPrintNote({ ...activeNote })
    },
    presentation: () => showPanel('presentation'),
    find: () => documentSearchRef.current?.open(),
    'new-document': workspace.newDocument,
    'new-folder': () => workspace.setDialog('folder'),
    'open-folder': () => {
      void workspace.openFolder()
    },
    'open-file': () => fileInputRef.current?.click(),
    'save-workspace': workspace.saveWorkspace,
    'save-page': () => {
      void workspace.savePage()
    },
    'save-as': () => showPanel('save-as'),
    ai: () => showPanel('ai'),
    minimap: () => showPanel('minimap'),
  }
  const commands = editorCommandDefinitions.map((command) => ({
    ...command,
    disabled: workspace.busy,
    onSelect: () => commandActions[command.id](),
  }))

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (
        (event.ctrlKey || event.metaKey) &&
        event.key.toLowerCase() === 's' &&
        !event.altKey &&
        !event.shiftKey &&
        !event.isComposing
      ) {
        event.preventDefault()
        if (
          !workspace.busy &&
          !event.repeat &&
          !(
            event.target instanceof Element &&
            event.target.closest('[role="dialog"], [role="alertdialog"]')
          )
        )
          void workspace.savePage()
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [workspace])

  useEffect(() => {
    const wasDark = document.documentElement.classList.contains('dark')
    document.documentElement.classList.toggle('dark', dark)
    return () => {
      document.documentElement.classList.toggle('dark', wasDark)
    }
  }, [dark])
  useEffect(() => {
    if (!navigationTarget || mode !== 'read' || panel) return
    let heading: HTMLElement | null = null
    const frame = requestAnimationFrame(() => {
      heading = document.getElementById(navigationTarget)
      heading
        ?.closest('[data-slot="tabs-content"]')
        ?.dispatchEvent(new Event('document-navigation'))
      heading?.scrollIntoView({
        block: 'start',
        behavior: motionEnabled() ? 'smooth' : 'instant',
      })
      heading?.focus({ preventScroll: true })
      heading?.setAttribute('data-navigation-target', '')
    })
    const timer = setTimeout(() => {
      heading?.removeAttribute('data-navigation-target')
      setNavigationTarget(null)
    }, 1800)
    return () => {
      cancelAnimationFrame(frame)
      clearTimeout(timer)
      heading?.removeAttribute('data-navigation-target')
    }
  }, [navigationTarget, mode, panel])

  const pendingFiles = workspace.localFolder.files.filter(
    (file) => file.status !== 'saved',
  ).length
  const wordCount = activeNote.content
    .trim()
    .split(/\s+/)
    .filter(Boolean).length
  const location =
    workspace.folders.find((folder) => folder.id === workspace.selectedFolder)
      ?.name ?? 'Pasta principal'

  return (
    <NoteNavigationContext.Provider
      value={{
        notes: workspace.documents,
        folders: workspace.folders,
        onSelect: workspace.openSearchResult,
      }}
    >
      <div className={dark ? 'dark' : undefined} data-focus-mode={focusMode}>
        {panel === 'backup' && (
          <BackupDialog
            onImport={workspace.importBackup}
            onDownloadCurrent={workspace.downloadCurrentBackup}
            onClose={() => setPanel(null)}
          />
        )}
        <MarkdownDropZone
          busy={workspace.busy}
          onFiles={workspace.openDroppedFiles}
        />
        <TooltipProvider>
          <SidebarProvider className="h-svh overflow-hidden bg-background text-foreground">
            <Button
              asChild
              className="sr-only focus:not-sr-only focus:fixed focus:top-4 focus:left-4 focus:z-50"
            >
              <a href="#main">Ir para o conteúdo</a>
            </Button>
            <ResizableWorkspace
              focused={focusMode}
              sidebar={
                <NotesSidebar
                  onItemAction={requestItemAction}
                  onOpenTrash={() => setShowTrash(true)}
                  notes={workspace.documents}
                  folders={workspace.folders}
                  activeId={activeNote.id}
                  selectedFolder={workspace.selectedFolder}
                  expandedFolders={workspace.expandedFolders}
                  query={query}
                  busy={workspace.busy}
                  canRefresh={!!activeNote.sourcePath}
                  localFile={workspace.localDocuments.has(activeNote.id)}
                  onQueryChange={setQuery}
                  onSelect={workspace.selectNote}
                  onSelectRoot={() => workspace.setSelectedFolder(undefined)}
                  onToggleFolder={workspace.toggleFolder}
                  onOpenFile={() => fileInputRef.current?.click()}
                  actions={{
                    onNewDocument: workspace.newDocument,
                    onNewPage: () => workspace.setDialog('page'),
                    onNewFolder: () => workspace.setDialog('folder'),
                    onRefresh: workspace.requestRefresh,
                    onCollapseAll: workspace.collapseAll,
                    onOpenFolder: () => {
                      void workspace.openFolder()
                    },
                    onSaveWorkspace: workspace.saveWorkspace,
                    onImportBackup: () => showPanel('backup'),
                  }}
                />
              }
            >
              <SidebarInset className="h-full min-w-0">
                <header className="flex min-h-14 shrink-0 flex-wrap items-center gap-2 border-b px-3 py-2 sm:gap-3 sm:px-4">
                  <SidebarTrigger data-focus-secondary />
                  <img
                    src="/devnotes-icon.svg"
                    data-focus-secondary
                    alt="DevNotes"
                    width={28}
                    height={28}
                    className="size-7 shrink-0 md:hidden"
                  />
                  <div className="flex-1" />
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        ref={focusButton}
                        variant="ghost"
                        size="icon"
                        aria-label={
                          focusMode ? 'Sair do modo foco' : 'Ativar modo foco'
                        }
                        aria-pressed={focusMode}
                        onClick={() => setFocusMode((current) => !current)}
                      >
                        <Focus aria-hidden="true" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>
                      {focusMode ? 'Sair do modo foco (Esc)' : 'Modo foco'}
                    </TooltipContent>
                  </Tooltip>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        data-focus-secondary
                        variant="ghost"
                        size="icon"
                        aria-label="Preferências de aparência"
                        onClick={() => showPanel('appearance')}
                      >
                        <Settings2 aria-hidden="true" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>Preferências de aparência</TooltipContent>
                  </Tooltip>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        data-focus-secondary
                        aria-label="Painel de tarefas"
                        disabled={workspace.busy}
                        onClick={() => showPanel('tasks')}
                      >
                        <ListTodo aria-hidden="true" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>Painel de tarefas</TooltipContent>
                  </Tooltip>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        data-focus-secondary
                        aria-label="Pasta local"
                        disabled={workspace.busy}
                        onClick={() => showPanel('local-folder')}
                      >
                        <FolderSync aria-hidden="true" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>Pasta local</TooltipContent>
                  </Tooltip>
                  <span
                    role="status"
                    className="hidden items-center gap-1.5 text-xs text-muted-foreground lg:flex"
                  >
                    {workspace.localDocuments.loading ||
                    workspace.pageSaveState === 'saving' ? (
                      <Spinner
                        className="size-3.5 animate-spin motion-reduce:animate-none"
                        aria-hidden="true"
                      />
                    ) : error ? (
                      <CircleAlert className="size-3.5" aria-hidden="true" />
                    ) : (
                      <Check
                        key={workspace.pageSaveState}
                        className="size-3.5 animate-in duration-150 zoom-in-75 motion-reduce:animate-none"
                        aria-hidden="true"
                      />
                    )}
                    {workspace.localDocuments.loading
                      ? 'Abrindo documento…'
                      : workspace.pageSaveState === 'saving'
                        ? 'Salvando…'
                        : error
                          ? 'Não salvo'
                          : workspace.pageSaveState === 'saved'
                            ? 'Salvo agora'
                            : workspace.localDocuments.has(activeNote.id)
                              ? workspace.localDocuments.isDirty(activeNote.id)
                                ? 'Alterações pendentes'
                                : 'Salvo no arquivo original'
                              : isDraft
                                ? 'Não salvo'
                                : isSaved
                                  ? 'Salvo neste navegador'
                                  : 'Documento de exemplo'}
                  </span>
                  <DocumentSearch
                    key={activeNote.id}
                    content={`${activeNote.title}\n${activeNote.content}`}
                    view={mode}
                    ref={documentSearchRef}
                  />
                  <WorkspaceSearch
                    notes={workspace.documents}
                    folders={workspace.folders}
                    onSelect={workspace.openSearchResult}
                    commands={commands}
                  />
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="outline"
                        size="icon"
                        data-focus-secondary
                        aria-label={
                          dark ? 'Usar tema claro' : 'Usar tema escuro'
                        }
                        onClick={toggleTheme}
                      >
                        {dark ? (
                          <Sun aria-hidden="true" />
                        ) : (
                          <Moon aria-hidden="true" />
                        )}
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>Trocar tema</TooltipContent>
                  </Tooltip>
                  {workspace.localDocuments.has(activeNote.id) && (
                    <Button
                      disabled={workspace.busy}
                      aria-label="Salvar arquivo original"
                      onClick={() => {
                        void workspace.savePage()
                      }}
                    >
                      {workspace.pageSaveState === 'saving' ? (
                        <Spinner
                          aria-hidden="true"
                          className="animate-spin motion-reduce:animate-none"
                        />
                      ) : workspace.pageSaveState === 'saved' ? (
                        <Check
                          aria-hidden="true"
                          className="animate-in duration-150 zoom-in-75 motion-reduce:animate-none"
                        />
                      ) : (
                        <Save aria-hidden="true" />
                      )}
                      <span className="hidden sm:inline">
                        {workspace.pageSaveState === 'saving'
                          ? 'Salvando…'
                          : workspace.pageSaveState === 'saved'
                            ? 'Salvo'
                            : 'Salvar'}
                      </span>
                    </Button>
                  )}
                  <Button
                    onClick={() => downloadNote(activeNote)}
                    aria-label="Baixar Markdown"
                  >
                    <Download aria-hidden="true" />
                    <span className="hidden sm:inline">Baixar</span>
                  </Button>
                </header>
                {workspace.localFolder.rootName && (
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-1 text-xs text-muted-foreground">
                    <span>
                      Pasta: {workspace.localFolder.rootName} · {pendingFiles}{' '}
                      {pendingFiles === 1
                        ? 'arquivo pendente'
                        : 'arquivos pendentes'}
                    </span>
                    <Button
                      variant="link"
                      size="sm"
                      onClick={() => showPanel('local-folder')}
                    >
                      Gerenciar pasta
                    </Button>
                  </div>
                )}
                <div className="contents" data-focus-secondary>
                  <DocumentTabs
                    notes={workspace.openNotes}
                    activeId={activeNote.id}
                    onSelect={workspace.selectNote}
                    onClose={workspace.closeTab}
                  />
                </div>
                {!workspace.localDocuments.loading && (
                  <SaveDestination
                    note={activeNote}
                    original={workspace.localDocuments.has(activeNote.id)}
                    temporary={isDraft || !isSaved}
                    connectedPath={
                      workspace.localFolder.files.find(
                        (file) => file.noteId === activeNote.id,
                      )?.path
                    }
                    onOpenFolder={() => showPanel('local-folder')}
                  />
                )}
                {workspace.localDocuments.recovery && (
                  <DraftRecovery
                    draft={workspace.localDocuments.recovery}
                    disabled={workspace.localDocuments.busy}
                    onRestore={() => workspace.localDocuments.recover(true)}
                    onDiscard={() => workspace.localDocuments.recover(false)}
                  />
                )}
                {managementError && (
                  <Alert variant="destructive">
                    <AlertDescription>{managementError}</AlertDescription>
                  </Alert>
                )}
                {error && (
                  <Alert variant="destructive" className="mx-4 mt-4 w-auto">
                    <CircleAlert aria-hidden="true" />
                    <AlertDescription>{error}</AlertDescription>
                  </Alert>
                )}
                <div
                  id="main"
                  role={workspace.openNotes.length ? 'tabpanel' : undefined}
                  aria-labelledby={
                    workspace.openNotes.length
                      ? `document-tab-${activeNote.id}`
                      : undefined
                  }
                  tabIndex={-1}
                  aria-busy={workspace.localDocuments.loading}
                  className="flex min-h-0 flex-1 flex-col"
                >
                  {workspace.localDocuments.loading ? (
                    <DocumentLoading />
                  ) : (
                    <Tabs
                      value={mode}
                      onValueChange={setMode}
                      className="min-h-0 flex-1 gap-0"
                    >
                      <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b px-4 py-2">
                        <div className="flex min-w-0 items-center gap-2 text-sm text-muted-foreground">
                          <FileText className="size-4" aria-hidden="true" />
                          <span className="max-w-36 truncate sm:max-w-64">
                            {workspace.localDocuments.has(activeNote.id)
                              ? activeNote.sourcePath?.split(/[\\/]/).at(-1)
                              : `${activeNote.title || 'Documento sem título'}.md`}
                          </span>
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            data-focus-secondary
                            aria-label={
                              activeNote.favorite
                                ? 'Remover dos favoritos'
                                : 'Adicionar aos favoritos'
                            }
                            aria-pressed={!!activeNote.favorite}
                            disabled={workspace.busy}
                            onClick={() =>
                              requestItemAction({
                                kind: 'note',
                                id: activeNote.id,
                                action: 'favorite',
                              })
                            }
                          >
                            <Star aria-hidden="true" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            data-focus-secondary
                            aria-label="Histórico de versões"
                            disabled={workspace.busy}
                            onClick={() =>
                              requestItemAction({
                                kind: 'note',
                                id: activeNote.id,
                                action: 'history',
                              })
                            }
                          >
                            <History aria-hidden="true" />
                          </Button>
                          <TabsList
                            aria-label="Visualização do documento"
                            className="max-w-full [&_svg]:hidden sm:[&_svg]:block"
                          >
                            <TabsTrigger value="read">
                              <BookOpen aria-hidden="true" />
                              Ler
                            </TabsTrigger>
                            <TabsTrigger value="edit">
                              <Pencil aria-hidden="true" />
                              Editar
                            </TabsTrigger>
                            <TabsTrigger value="split">
                              <Columns2 aria-hidden="true" />
                              Dividir
                            </TabsTrigger>
                            <TabsTrigger value="source">
                              <Code2 aria-hidden="true" />
                              Markdown
                            </TabsTrigger>
                          </TabsList>
                        </div>
                      </div>
                      {(['read', 'edit', 'split', 'source'] as const).map(
                        (view) => (
                          <TabsContent
                            key={view}
                            value={view}
                            className="min-h-0 overflow-y-auto"
                          >
                            <div
                              key={activeNote.id}
                              className="document-content mx-auto w-full animate-in px-4 py-8 duration-150 fade-in-0 motion-reduce:animate-none sm:px-6 lg:px-8"
                              style={
                                {
                                  maxWidth:
                                    mode === 'split'
                                      ? '100%'
                                      : appearance.width === 'comfortable'
                                        ? '48rem'
                                        : appearance.width === 'wide'
                                          ? '68rem'
                                          : focusMode
                                            ? '52rem'
                                            : '100%',
                                  '--document-font-size': `${appearance.fontSize}px`,
                                } as React.CSSProperties
                              }
                            >
                              <div
                                className={
                                  view === 'split'
                                    ? 'grid min-w-0 gap-10 xl:grid-cols-2'
                                    : undefined
                                }
                              >
                                {view !== 'read' && (
                                  <NoteEditor
                                    note={activeNote}
                                    onChange={workspace.editNote}
                                    temporary={isDraft}
                                    local={workspace.localDocuments.has(
                                      activeNote.id,
                                    )}
                                    disabled={workspace.busy}
                                    visual={view === 'edit'}
                                    onSource={() => setMode('source')}
                                  />
                                )}
                                {(view === 'read' || view === 'split') && (
                                  <article
                                    className="min-w-0"
                                    data-document-preview
                                    aria-label="Prévia do documento"
                                  >
                                    <h1
                                      id="document-title"
                                      tabIndex={-1}
                                      className="text-3xl leading-10 font-bold tracking-tight text-balance lg:text-4xl lg:leading-11"
                                    >
                                      {activeNote.title ||
                                        'Documento sem título'}
                                    </h1>
                                    <div
                                      data-search-ignore
                                      className="mt-3 mb-9 flex flex-wrap items-center gap-3 font-mono text-xs text-muted-foreground"
                                    >
                                      <span>
                                        {wordCount}{' '}
                                        {wordCount === 1
                                          ? 'palavra'
                                          : 'palavras'}
                                      </span>
                                      <span>·</span>
                                      <span>
                                        {activeNote.content.length}{' '}
                                        {activeNote.content.length === 1
                                          ? 'caractere'
                                          : 'caracteres'}
                                      </span>
                                      <span>·</span>
                                      <span>
                                        {Math.max(
                                          1,
                                          Math.ceil(wordCount / 200),
                                        )}{' '}
                                        min de leitura
                                      </span>
                                      {!isSaved &&
                                        !isDraft &&
                                        !workspace.localDocuments.has(
                                          activeNote.id,
                                        ) && (
                                          <Badge variant="secondary">
                                            Exemplo
                                          </Badge>
                                        )}
                                    </div>
                                    <MarkdownPreview
                                      content={activeNote.content}
                                      headingIds
                                    />
                                  </article>
                                )}
                              </div>
                            </div>
                          </TabsContent>
                        ),
                      )}
                    </Tabs>
                  )}
                </div>
                <footer
                  data-focus-secondary
                  className="flex shrink-0 items-center justify-between gap-3 border-t px-4 py-2 font-mono text-xs text-muted-foreground"
                >
                  <span
                    role="status"
                    className="min-w-0 truncate"
                    title={workspace.message}
                  >
                    {workspace.localDocuments.recovery
                      ? 'Recupere ou descarte o rascunho para continuar.'
                      : workspace.busy
                        ? 'Aguarde…'
                        : workspace.message || 'Markdown'}
                  </span>
                  <span className="shrink-0">
                    {wordCount} {wordCount === 1 ? 'palavra' : 'palavras'}
                    <span className="hidden sm:inline">
                      {' '}
                      · {activeNote.content.length}{' '}
                      {activeNote.content.length === 1
                        ? 'caractere'
                        : 'caracteres'}
                    </span>
                  </span>
                </footer>
              </SidebarInset>
            </ResizableWorkspace>
            <div className="contents" data-focus-secondary>
              <AiChat
                key={`${aiSettings.endpoint}:${aiSettings.model}`}
                settings={aiSettings}
                note={activeNote}
                onConfigure={() => showPanel('ai')}
              />
            </div>
            <Input
              ref={fileInputRef}
              className="hidden"
              type="file"
              accept=".md,.markdown"
              aria-label="Selecionar arquivo Markdown"
              onChange={(event) => {
                const file = event.currentTarget.files?.[0]
                event.currentTarget.value = ''
                void workspace.openMarkdownFile(file)
              }}
            />
            <Input
              ref={directoryInputRef}
              className="hidden"
              type="file"
              multiple
              {...{ webkitdirectory: '' }}
              aria-label="Selecionar pasta"
              onChange={(event) => {
                const files = Array.from(event.currentTarget.files ?? [])
                event.currentTarget.value = ''
                void workspace.openFiles(files)
              }}
            />
            <Input
              ref={refreshInputRef}
              className="hidden"
              type="file"
              accept=".md,.markdown"
              aria-label="Selecionar arquivo original"
              onChange={(event) => {
                const file = event.currentTarget.files?.[0]
                event.currentTarget.value = ''
                void workspace.refreshFromSelection(file)
              }}
            />
            <Dialog
              open={workspace.dialog !== null}
              onOpenChange={(open) => {
                if (!open) workspace.setDialog(null)
              }}
            >
              <DialogContent className="max-h-[90svh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle>
                    {workspace.dialog === 'folder'
                      ? 'Nova pasta'
                      : 'Nova página'}
                  </DialogTitle>
                  <DialogDescription>
                    Local: {location}. O conteúdo fica salvo neste navegador.
                  </DialogDescription>
                </DialogHeader>
                {workspace.dialog === 'folder' ? (
                  <FolderForm onCreate={workspace.createFolder} />
                ) : (
                  <NoteForm onAdd={workspace.createPage} />
                )}
              </DialogContent>
            </Dialog>
            <AlertDialog
              open={workspace.refreshConfirmation !== null}
              onOpenChange={(open) => {
                if (!open) workspace.setRefreshConfirmation(null)
              }}
            >
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>
                    Recarregar o arquivo original?
                  </AlertDialogTitle>
                  <AlertDialogDescription>
                    O título e o conteúdo desta cópia serão substituídos pelo
                    arquivo original. Para guardar as duas versões, baixe a
                    versão atual antes de continuar.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>
                    Manter minhas alterações
                  </AlertDialogCancel>
                  <AlertDialogAction
                    onClick={() => {
                      if (workspace.refreshConfirmation)
                        void workspace.refreshFile(
                          workspace.refreshConfirmation,
                        )
                    }}
                  >
                    Recarregar arquivo
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
            {itemRequest &&
              (itemRequest.action === 'rename' ||
                itemRequest.action === 'move') && (
                <ItemDialog
                  key={`${itemRequest.id}-${itemRequest.action}`}
                  request={itemRequest}
                  notes={workspace.documents}
                  folders={workspace.folders}
                  onAction={workspace.performAction}
                  onClose={() => setItemRequest(null)}
                />
              )}
            {historyNote && (
              <HistoryDialog
                note={historyNote}
                onRestore={(revisionId) =>
                  workspace.restoreRevision(historyNote.id, revisionId)
                }
                onClose={() => setItemRequest(null)}
              />
            )}
            {showTrash && (
              <TrashDialog
                notes={workspace.allNotes}
                folders={workspace.allFolders}
                onAction={workspace.performAction}
                onClose={() => setShowTrash(false)}
              />
            )}
            {panel === 'tasks' && (
              <TaskPanel
                notes={workspace.documents}
                folders={workspace.folders}
                busy={workspace.busy}
                onEdit={workspace.editNote}
                onClose={() => setPanel(null)}
                onNavigate={(task) => {
                  workspace.openSearchResult(task.noteId)
                  setMode('source')
                  setTaskTarget(task)
                  setPanel(null)
                }}
              />
            )}
            {panel === 'local-folder' && (
              <LocalFolderDialog
                sync={workspace.localFolder}
                note={activeNote}
                onClose={() => setPanel(null)}
                onOpenNote={(id) => {
                  workspace.openSearchResult(id)
                  setPanel(null)
                }}
              />
            )}
            {panel === 'appearance' && (
              <AppearanceDialog
                value={appearance}
                onChange={updateAppearance}
                error={appearanceError}
                onClose={() => setPanel(null)}
              />
            )}
            {panel === 'ai' && (
              <AiSettingsDialog
                settings={aiSettings}
                onSave={setAiSettings}
                onClose={() => setPanel(null)}
              />
            )}
            {panel === 'save-as' && (
              <SaveAsDialog note={activeNote} onClose={() => setPanel(null)} />
            )}
            {panel === 'presentation' && (
              <DocumentPresentation
                key={activeNote.id}
                note={activeNote}
                onClose={() => setPanel(null)}
              />
            )}
            {panel === 'minimap' && (
              <DocumentMinimap
                note={activeNote}
                onClose={() => setPanel(null)}
                onNavigate={(id) => {
                  setPanel(null)
                  setMode('read')
                  setNavigationTarget(id)
                }}
              />
            )}
            {printNote && (
              <PrintDocument
                note={printNote}
                onClose={() => setPrintNote(null)}
              />
            )}
          </SidebarProvider>
        </TooltipProvider>
      </div>
    </NoteNavigationContext.Provider>
  )
}
