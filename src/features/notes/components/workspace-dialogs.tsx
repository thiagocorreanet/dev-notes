import { useState } from 'react'
import { diffLines } from 'diff'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Alert, AlertDescription } from '@/components/ui/alert'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from '@/components/ui/alert-dialog'
import type { Note, WorkspaceFolder } from '../types'
import type { WorkspaceAction, WorkspaceTarget } from '../workspace-actions'
import { descendantFolderIds } from '../workspace-actions'
import { notePath } from '../note-links'
import { WorkspaceError } from '../workspace-error'
import type { ItemActionRequest } from './item-actions'

export function ItemDialog({
  request,
  notes,
  folders,
  onAction,
  onClose,
}: {
  request: ItemActionRequest
  notes: Note[]
  folders: WorkspaceFolder[]
  onAction: (action: WorkspaceAction) => void
  onClose: () => void
}) {
  const item =
    request.kind === 'note'
      ? notes.find((note) => note.id === request.id)
      : folders.find((folder) => folder.id === request.id)
  const [name, setName] = useState(
    item && 'title' in item ? item.title : (item?.name ?? ''),
  )
  const [parentId, setParentId] = useState(
    item && 'title' in item
      ? (item.folderId ?? 'root')
      : (item?.parentId ?? 'root'),
  )
  const [error, setError] = useState('')
  const excluded =
    request.kind === 'folder'
      ? descendantFolderIds(folders, request.id)
      : new Set<string>()
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {request.action === 'rename'
              ? 'Renomear'
              : 'Mover para outra pasta'}
          </DialogTitle>
          <DialogDescription>
            As alterações afetam a cópia no espaço de trabalho.
          </DialogDescription>
        </DialogHeader>
        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault()
            try {
              onAction(
                request.action === 'rename'
                  ? { ...request, type: 'rename', name }
                  : {
                      ...request,
                      type: 'move',
                      parentId: parentId === 'root' ? undefined : parentId,
                    },
              )
              onClose()
            } catch (error) {
              setError(
                error instanceof WorkspaceError
                  ? error.message
                  : 'Não foi possível alterar este item.',
              )
            }
          }}
        >
          {request.action === 'rename' ? (
            <div className="space-y-2">
              <Label htmlFor="item-name">Nome</Label>
              <Input
                id="item-name"
                value={name}
                maxLength={100}
                required
                onChange={(event) => setName(event.target.value)}
              />
            </div>
          ) : (
            <div className="space-y-2">
              <Label htmlFor="item-destination">Pasta de destino</Label>
              <Select value={parentId} onValueChange={setParentId}>
                <SelectTrigger id="item-destination">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="root">Pasta principal</SelectItem>
                  {folders
                    .filter(
                      (folder) => !folder.deletedAt && !excluded.has(folder.id),
                    )
                    .map((folder) => (
                      <SelectItem key={folder.id} value={folder.id}>
                        {notePath(
                          {
                            id: '',
                            title: folder.name,
                            content: '',
                            ...(folder.parentId
                              ? { folderId: folder.parentId }
                              : {}),
                          },
                          folders,
                        )}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
          )}
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancelar
            </Button>
            <Button type="submit">
              {request.action === 'rename' ? 'Salvar nome' : 'Mover'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

export function TrashDialog({
  notes,
  folders,
  onAction,
  onClose,
}: {
  notes: Note[]
  folders: WorkspaceFolder[]
  onAction: (action: WorkspaceAction) => void
  onClose: () => void
}) {
  const [purge, setPurge] = useState<WorkspaceTarget | null>(null)
  const [error, setError] = useState('')
  const entries = [
    ...folders
      .filter(
        (folder) =>
          folder.deletedAt &&
          !folders.some(
            (parent) =>
              parent.id === folder.parentId &&
              parent.deletedAt &&
              parent.trashBatchId === folder.trashBatchId,
          ),
      )
      .map((folder) => ({
        kind: 'folder' as const,
        id: folder.id,
        title: folder.name,
      })),
    ...notes
      .filter(
        (note) =>
          note.deletedAt &&
          !folders.some(
            (folder) =>
              folder.id === note.folderId &&
              folder.deletedAt &&
              folder.trashBatchId === note.trashBatchId,
          ),
      )
      .map((note) => ({
        kind: 'note' as const,
        id: note.id,
        title: note.title || 'Documento sem título',
      })),
  ]
  function run(action: WorkspaceAction) {
    try {
      onAction(action)
      setError('')
    } catch (error) {
      setError(
        error instanceof WorkspaceError
          ? error.message
          : 'Não foi possível alterar a lixeira.',
      )
    }
  }
  return (
    <>
      <Dialog
        open
        onOpenChange={(open) => {
          if (!open) onClose()
        }}
      >
        <DialogContent className="max-h-[85svh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Lixeira</DialogTitle>
            <DialogDescription>
              Restaure documentos e pastas com seu conteúdo e histórico.
            </DialogDescription>
          </DialogHeader>
          {!entries.length && (
            <p className="text-sm text-muted-foreground">
              A lixeira está vazia.
            </p>
          )}
          <ul className="space-y-3">
            {entries.map((entry) => (
              <li
                key={entry.id}
                className="flex flex-wrap items-center gap-2 rounded-md border p-3"
              >
                <span className="min-w-0 flex-1 break-words text-sm">
                  {entry.title}{' '}
                  <span className="text-muted-foreground">
                    ({entry.kind === 'folder' ? 'pasta' : 'documento'})
                  </span>
                </span>
                <Button
                  size="sm"
                  variant="outline"
                  aria-label={`Restaurar ${entry.title}`}
                  onClick={() => run({ ...entry, type: 'restore' })}
                >
                  Restaurar
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  aria-label={`Excluir definitivamente ${entry.title}`}
                  onClick={() => setPurge(entry)}
                >
                  Excluir
                </Button>
              </li>
            ))}
          </ul>
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
        </DialogContent>
      </Dialog>
      <AlertDialog
        open={purge !== null}
        onOpenChange={(open) => {
          if (!open) setPurge(null)
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir definitivamente?</AlertDialogTitle>
            <AlertDialogDescription>
              O conteúdo e o histórico serão apagados. No caso de uma pasta, os
              documentos e subpastas dentro dela também serão apagados.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (purge) run({ ...purge, type: 'purge' })
                setPurge(null)
              }}
            >
              Excluir definitivamente
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}

export function HistoryDialog({
  note,
  onRestore,
  onClose,
}: {
  note: Note
  onRestore: (revisionId: string) => void
  onClose: () => void
}) {
  const [selectedId, setSelectedId] = useState(note.revisions?.[0]?.id ?? '')
  const selected = note.revisions?.find(
    (revision) => revision.id === selectedId,
  )
  const changes = selected
    ? diffLines(
        `# ${selected.title}\n\n${selected.content}`,
        `# ${note.title}\n\n${note.content}`,
        { timeout: 100, maxEditLength: 1000 },
      )
    : undefined
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
    >
      <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle>Histórico de versões</DialogTitle>
          <DialogDescription>
            Até 30 versões por documento. A digitação contínua é agrupada em
            intervalos de um minuto. Restaurar também guarda o texto atual.
          </DialogDescription>
        </DialogHeader>
        {!note.revisions?.length ? (
          <p className="text-sm text-muted-foreground">
            As versões anteriores aparecem aqui depois que você altera o
            documento.
          </p>
        ) : (
          <>
            <Label htmlFor="revision">Versão anterior</Label>
            <Select value={selectedId} onValueChange={setSelectedId}>
              <SelectTrigger id="revision">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {note.revisions.map((revision, index, revisions) => (
                  <SelectItem key={revision.id} value={revision.id}>
                    {new Date(revision.createdAt).toLocaleString('pt-BR')} ·{' '}
                    {revisions.length - index}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-sm text-muted-foreground">
              Comparação com o texto atual: − removido, + adicionado.
            </p>
            {changes ? (
              <pre
                className="max-h-80 overflow-auto rounded-md border bg-muted p-3 font-mono text-xs whitespace-pre-wrap break-words"
                aria-label="Alterações entre as versões"
              >
                {changes.map((change, index) => (
                  <span
                    key={index}
                    className={
                      change.added
                        ? 'bg-accent text-accent-foreground'
                        : change.removed
                          ? 'text-destructive line-through'
                          : 'text-muted-foreground'
                    }
                  >
                    {change.value
                      .split('\n')
                      .map(
                        (line, lineIndex, lines) =>
                          `${change.added ? '+ ' : change.removed ? '− ' : '  '}${line}${lineIndex < lines.length - 1 ? '\n' : ''}`,
                      )
                      .join('')}
                  </span>
                ))}
              </pre>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <p>Versão anterior</p>
                  <pre className="max-h-80 overflow-auto whitespace-pre-wrap">
                    {selected?.content}
                  </pre>
                </div>
                <div>
                  <p>Versão atual</p>
                  <pre className="max-h-80 overflow-auto whitespace-pre-wrap">
                    {note.content}
                  </pre>
                </div>
              </div>
            )}
            <DialogFooter>
              <Button variant="outline" onClick={onClose}>
                Fechar
              </Button>
              <Button
                disabled={!selected}
                onClick={() => {
                  if (selected) onRestore(selected.id)
                  onClose()
                }}
              >
                Restaurar esta versão
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
