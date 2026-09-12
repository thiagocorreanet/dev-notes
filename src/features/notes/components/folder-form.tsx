import { WorkspaceError } from '../workspace-error'
import { useState } from 'react'
import type { SubmitEvent } from 'react'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

export function FolderForm({ onCreate }: { onCreate: (name: string) => void }) {
  const [name, setName] = useState('')
  const [error, setError] = useState('')
  function submit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault()
    if (
      !name.trim() ||
      /[/\\]/.test(name) ||
      name.trim() === '.' ||
      name.trim() === '..'
    ) {
      setError('Digite um nome de pasta sem barras e diferente de . ou ..')
      return
    }
    try {
      onCreate(name.trim())
    } catch (error) {
      setError(
        error instanceof WorkspaceError
          ? error.message
          : 'Não foi possível criar a pasta.',
      )
    }
  }
  return (
    <form className="space-y-4" onSubmit={submit}>
      <div className="space-y-2">
        <Label htmlFor="folder-name">Nome da pasta</Label>
        <Input
          id="folder-name"
          required
          maxLength={100}
          value={name}
          onChange={(event) => setName(event.target.value)}
          aria-invalid={!!error}
          aria-describedby={error ? 'folder-error' : undefined}
        />
      </div>
      {error && (
        <Alert variant="destructive">
          <AlertDescription id="folder-error">{error}</AlertDescription>
        </Alert>
      )}
      <Button type="submit">Criar pasta</Button>
    </form>
  )
}
