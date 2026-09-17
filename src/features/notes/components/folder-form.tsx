import { WorkspaceError } from '../workspace-error'
import { useState } from 'react'
import type { SubmitEvent } from 'react'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { FolderOpen, HardDrive } from 'lucide-react'

export function FolderForm({
  busy,
  computerError,
  computerSupported,
  onCreateInBrowser,
  onCreateOnComputer,
  workspaceFolder = false,
}: {
  busy: boolean
  computerError: string
  computerSupported: boolean
  onCreateInBrowser: (name: string) => void
  onCreateOnComputer: (name: string) => Promise<boolean>
  /** In a folder workspace every folder is created on disk, inside the selected folder. */
  workspaceFolder?: boolean
}) {
  const [name, setName] = useState('')
  const [error, setError] = useState('')
  const [computerAttempted, setComputerAttempted] = useState(false)
  const visibleComputerError = computerAttempted ? computerError : ''
  function validName() {
    if (
      !name.trim() ||
      /[/\\]/.test(name) ||
      name.trim() === '.' ||
      name.trim() === '..'
    ) {
      setError('Digite um nome de pasta sem barras e diferente de . ou ..')
      return null
    }
    setError('')
    return name.trim()
  }
  async function submit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault()
    if (workspaceFolder) {
      createInBrowser()
      return
    }
    const value = validName()
    if (!value) return
    setComputerAttempted(true)
    await onCreateOnComputer(value)
  }
  function createInBrowser() {
    const value = validName()
    if (!value) return
    try {
      onCreateInBrowser(value)
    } catch (error) {
      setError(
        error instanceof WorkspaceError
          ? error.message
          : 'Não foi possível criar a pasta.',
      )
    }
  }
  return (
    <form
      className="min-w-0 space-y-5"
      onSubmit={(event) => {
        void submit(event)
      }}
    >
      <div className="space-y-2">
        <Label htmlFor="folder-name">Nome da pasta</Label>
        <Input
          id="folder-name"
          required
          maxLength={100}
          value={name}
          onChange={(event) => setName(event.target.value)}
          aria-invalid={!!(error || visibleComputerError)}
          aria-describedby={
            error || visibleComputerError ? 'folder-error' : undefined
          }
          disabled={busy}
          autoFocus
        />
      </div>
      {(error || visibleComputerError) && (
        <Alert variant="destructive">
          <AlertDescription id="folder-error">
            {error || visibleComputerError}
          </AlertDescription>
        </Alert>
      )}
      {workspaceFolder ? (
        <div className="flex justify-end">
          <Button type="submit" disabled={busy}>
            Criar pasta
          </Button>
        </div>
      ) : (
        <div className="grid min-w-0 gap-3 sm:grid-cols-2">
          <Card className="min-w-0 ring-primary/25">
            <CardHeader>
              <div className="mb-2 flex size-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <HardDrive aria-hidden="true" className="size-4" />
              </div>
              <CardTitle>No computador</CardTitle>
              <CardDescription>
                Cria uma pasta real dentro do local que você escolher.
              </CardDescription>
            </CardHeader>
            <CardContent className="mt-auto">
              <Button
                type="submit"
                className="h-auto min-h-8 w-full min-w-0 whitespace-normal"
                disabled={busy || !computerSupported}
              >
                Escolher local e criar
              </Button>
            </CardContent>
          </Card>
          <Card className="min-w-0">
            <CardHeader>
              <div className="mb-2 flex size-9 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                <FolderOpen aria-hidden="true" className="size-4" />
              </div>
              <CardTitle>Neste navegador</CardTitle>
              <CardDescription>
                Mantém a pasta neste navegador, sem criar arquivos no
                computador.
              </CardDescription>
            </CardHeader>
            <CardContent className="mt-auto">
              <Button
                type="button"
                variant="outline"
                className="h-auto min-h-8 w-full min-w-0 whitespace-normal"
                disabled={busy}
                onClick={createInBrowser}
              >
                Criar somente neste navegador
              </Button>
            </CardContent>
          </Card>
        </div>
      )}
      {!computerSupported && !workspaceFolder && (
        <p className="text-xs leading-relaxed text-muted-foreground">
          Este navegador não permite criar pastas no computador. A pasta ainda
          pode ser criada somente neste navegador.
        </p>
      )}
    </form>
  )
}
