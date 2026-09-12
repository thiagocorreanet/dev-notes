import type { ReactNode } from 'react'
import {
  Copy,
  Ellipsis,
  FolderInput,
  History,
  Pencil,
  Star,
  Trash2,
} from 'lucide-react'
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from '@/components/ui/context-menu'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { SidebarMenuAction } from '@/components/ui/sidebar'
import type { WorkspaceTarget } from '../workspace-actions'

export type ItemAction =
  'rename' | 'move' | 'duplicate' | 'trash' | 'favorite' | 'history'
export type ItemActionRequest = WorkspaceTarget & { action: ItemAction }
interface Props {
  target: WorkspaceTarget
  name: string
  favorite?: boolean | undefined
  disabled?: boolean | undefined
  onAction: (request: ItemActionRequest) => void
}

function actions({ target, favorite }: Props) {
  return [
    { action: 'rename' as const, label: 'Renomear', icon: Pencil },
    { action: 'move' as const, label: 'Mover para…', icon: FolderInput },
    { action: 'duplicate' as const, label: 'Duplicar', icon: Copy },
    ...(target.kind === 'note'
      ? [
          {
            action: 'favorite' as const,
            label: favorite
              ? 'Remover dos favoritos'
              : 'Adicionar aos favoritos',
            icon: Star,
          },
          {
            action: 'history' as const,
            label: 'Histórico de versões',
            icon: History,
          },
        ]
      : []),
    { action: 'trash' as const, label: 'Mover para a lixeira', icon: Trash2 },
  ]
}

export function ItemContextMenu(props: Props & { children: ReactNode }) {
  return (
    <ContextMenu>
      <ContextMenuTrigger asChild disabled={props.disabled ?? false}>
        {props.children}
      </ContextMenuTrigger>
      <ContextMenuContent>
        {actions(props).map(({ action, label, icon: Icon }) => (
          <ContextMenuItem
            key={action}
            onSelect={() => props.onAction({ ...props.target, action })}
          >
            <Icon aria-hidden="true" />
            {label}
          </ContextMenuItem>
        ))}
      </ContextMenuContent>
    </ContextMenu>
  )
}

export function ItemDropdown(props: Props) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <SidebarMenuAction
          showOnHover
          disabled={props.disabled}
          className={props.target.kind === 'folder' ? 'right-8' : undefined}
          aria-label={`Ações de ${props.name}`}
        >
          <Ellipsis aria-hidden="true" />
        </SidebarMenuAction>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        {actions(props).map(({ action, label, icon: Icon }) => (
          <DropdownMenuItem
            key={action}
            onSelect={() => props.onAction({ ...props.target, action })}
          >
            <Icon aria-hidden="true" />
            {label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
