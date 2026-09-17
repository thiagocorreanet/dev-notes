import { useState } from 'react'
import type { SubmitEvent } from 'react'
import { Copy, FolderInput, FolderPlus, Globe, Library } from 'lucide-react'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { WorkspaceError } from '../workspace-error'
import { validateDiskFolderName } from '../disk-workspace'

type NameRequest = 'create' | 'copy'

export function WorkspaceSwitcher({
  active,
  name,
  path,
  busy,
  onOpen,
  onCreate,
  onCopyBrowserWorkspace,
  onUseBrowserWorkspace,
}: {
  active: boolean
  name: string
  path: string
  busy: boolean
  onOpen: () => void
  onCreate: (name: string) => Promise<boolean>
  onCopyBrowserWorkspace: (name: string) => Promise<boolean>
  onUseBrowserWorkspace: () => void
}) {
  const [request, setRequest] = useState<NameRequest | null>(null)
  const [folderName, setFolderName] = useState('')
  const [error, setError] = useState('')

  async function submit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault()
    let value: string
    try {
      value = validateDiskFolderName(folderName)
    } catch (failure) {
      setError(
        failure instanceof WorkspaceError
          ? failure.message
          : 'Digite um nome de pasta válido.',
      )
      return
    }
    setError('')
    const done =
      request === 'copy'
        ? await onCopyBrowserWorkspace(value)
        : await onCreate(value)
    if (done) setRequest(null)
  }

  return (
    <>
      <DropdownMenu>
        <Tooltip>
          <TooltipTrigger asChild>
            <DropdownMenuTrigger asChild>
              <Button
                size="icon-xs"
                variant="ghost"
                aria-label="Trocar workspace"
                disabled={busy}
              >
                <Library aria-hidden="true" />
              </Button>
            </DropdownMenuTrigger>
          </TooltipTrigger>
          <TooltipContent>Trocar workspace</TooltipContent>
        </Tooltip>
        <DropdownMenuContent align="start" className="w-72">
          <DropdownMenuLabel className="space-y-0.5">
            <span className="block">
              {active ? `Workspace: ${name}` : 'Workspace neste navegador'}
            </span>
            <span className="block text-xs font-normal break-all text-muted-foreground">
              {active
                ? path
                : 'Os documentos ficam guardados só neste navegador.'}
            </span>
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={onOpen}>
            <FolderInput aria-hidden="true" />
            Abrir uma pasta como workspace…
          </DropdownMenuItem>
          <DropdownMenuItem
            onSelect={() => {
              setFolderName('')
              setError('')
              setRequest('create')
            }}
          >
            <FolderPlus aria-hidden="true" />
            Criar uma pasta de workspace…
          </DropdownMenuItem>
          {active ? (
            <DropdownMenuItem onSelect={onUseBrowserWorkspace}>
              <Globe aria-hidden="true" />
              Usar o workspace do navegador
            </DropdownMenuItem>
          ) : (
            <DropdownMenuItem
              onSelect={() => {
                setFolderName('Notas')
                setError('')
                setRequest('copy')
              }}
            >
              <Copy aria-hidden="true" />
              Copiar documentos deste navegador para uma pasta…
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
      <Dialog
        open={request !== null}
        onOpenChange={(open) => {
          if (!open && !busy) setRequest(null)
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {request === 'copy'
                ? 'Copiar documentos para uma pasta'
                : 'Criar pasta de workspace'}
            </DialogTitle>
            <DialogDescription>
              {request === 'copy'
                ? 'Os documentos e pastas deste navegador serão gravados numa pasta nova no computador. Depois de escolher o local, o DevNotes abre essa pasta. A cópia do navegador continua disponível.'
                : 'Depois de escolher o local, o DevNotes cria a pasta e passa a salvar os documentos direto nela.'}
            </DialogDescription>
          </DialogHeader>
          <form
            className="space-y-4"
            onSubmit={(event) => {
              void submit(event)
            }}
          >
            <div className="space-y-2">
              <Label htmlFor="workspace-folder-name">Nome da pasta</Label>
              <Input
                id="workspace-folder-name"
                value={folderName}
                maxLength={100}
                disabled={busy}
                autoFocus
                required
                onChange={(event) => setFolderName(event.target.value)}
              />
            </div>
            {error && (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                disabled={busy}
                onClick={() => setRequest(null)}
              >
                Cancelar
              </Button>
              <Button type="submit" disabled={busy}>
                {busy ? 'Aguarde…' : 'Escolher local'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  )
}
