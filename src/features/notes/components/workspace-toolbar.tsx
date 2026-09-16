import {
  FilePlus2,
  FolderOpen,
  FolderPlus,
  ListCollapse,
  RefreshCw,
  StickyNote,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'

interface WorkspaceToolbarProps {
  busy: boolean
  canRefresh: boolean
  hasFolders: boolean
  onNewDocument: () => void
  onNewPage: () => void
  onNewFolder: () => void
  onRefresh: () => void
  onCollapseAll: () => void
  onOpenFolder: () => void
}

export function WorkspaceToolbar(props: WorkspaceToolbarProps) {
  const actions = [
    {
      label: 'Novo documento',
      description: 'Criar documento temporário (ainda não salvo)',
      icon: StickyNote,
      onClick: props.onNewDocument,
    },
    {
      label: 'Nova página',
      description: 'Criar página na pasta selecionada',
      icon: FilePlus2,
      onClick: props.onNewPage,
    },
    {
      label: 'Nova pasta',
      description: 'Criar uma pasta e escolher onde salvá-la',
      icon: FolderPlus,
      onClick: props.onNewFolder,
    },
    {
      label: 'Recarregar arquivo',
      description: props.canRefresh
        ? 'Recarregar o arquivo original'
        : 'Abra uma pasta e selecione um arquivo importado para recarregá-lo',
      icon: RefreshCw,
      onClick: props.onRefresh,
      disabled: !props.canRefresh,
    },
    {
      label: 'Recolher tudo',
      description: 'Recolher todas as pastas',
      icon: ListCollapse,
      onClick: props.onCollapseAll,
      disabled: !props.hasFolders,
    },
    {
      label: 'Abrir pasta',
      description: 'Importar documentos Markdown e PDF de uma pasta',
      icon: FolderOpen,
      onClick: props.onOpenFolder,
    },
  ]
  return (
    <div
      role="group"
      aria-label="Ações do espaço de trabalho"
      className="flex shrink-0 items-center"
    >
      {actions.map(({ label, description, icon: Icon, onClick, disabled }) => (
        <Tooltip key={label}>
          <TooltipTrigger asChild>
            <span
              className="inline-flex"
              tabIndex={disabled ? 0 : undefined}
              aria-label={disabled ? description : undefined}
            >
              <Button
                size="icon-xs"
                variant="ghost"
                aria-label={label}
                disabled={props.busy || disabled}
                onClick={onClick}
              >
                <Icon aria-hidden="true" />
              </Button>
            </span>
          </TooltipTrigger>
          <TooltipContent>{description}</TooltipContent>
        </Tooltip>
      ))}
    </div>
  )
}
