import { useId, useState } from 'react'
import { CircleAlert, LockKeyhole } from 'lucide-react'
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
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { PASSWORD_MIN_LENGTH } from '../document-protection'
import type { ItemActionRequest } from './item-actions'

export function ProtectionDialog({
  request,
  name,
  onSubmit,
  onClose,
}: {
  request: ItemActionRequest
  name: string
  onSubmit: (password: string) => Promise<boolean>
  onClose: () => void
}) {
  const id = useId()
  const [password, setPassword] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const protecting = request.action === 'protect'
  const removing = request.action === 'remove-protection'
  const kind = request.kind === 'folder' ? 'pasta' : 'documento'

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !busy) onClose()
      }}
    >
      <DialogContent
        className="sm:max-w-md"
        onEscapeKeyDown={(event) => {
          if (busy) event.preventDefault()
        }}
        onPointerDownOutside={(event) => {
          if (busy) event.preventDefault()
        }}
      >
        <DialogHeader>
          <div className="mb-2 flex size-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <LockKeyhole aria-hidden="true" />
          </div>
          <DialogTitle>
            {protecting
              ? `Proteger ${kind}`
              : removing
                ? 'Remover proteção'
                : `Desbloquear ${kind}`}
          </DialogTitle>
          <DialogDescription>
            {protecting
              ? request.kind === 'folder'
                ? `A senha protegerá todos os documentos dentro de “${name}”, inclusive nas subpastas.`
                : `O conteúdo de “${name}” será criptografado antes de ser salvo.`
              : removing
                ? 'Confirme a senha. O conteúdo voltará a ser salvo como Markdown comum.'
                : `Digite a senha para acessar “${name}” nesta sessão.`}
          </DialogDescription>
        </DialogHeader>
        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault()
            if (protecting && password.length < PASSWORD_MIN_LENGTH) {
              setError(`Use pelo menos ${PASSWORD_MIN_LENGTH} caracteres.`)
              return
            }
            if (protecting && password !== confirmation) {
              setError('As senhas não são iguais.')
              return
            }
            setBusy(true)
            setError('')
            void onSubmit(password).then((success) => {
              if (success) onClose()
              else
                setError(
                  'Não foi possível concluir. Confira a senha e tente novamente.',
                )
              setBusy(false)
            })
          }}
        >
          <div className="space-y-2">
            <Label htmlFor={`${id}-password`}>Senha</Label>
            <Input
              id={`${id}-password`}
              type="password"
              autoComplete={protecting ? 'new-password' : 'current-password'}
              value={password}
              disabled={busy}
              autoFocus
              required
              minLength={protecting ? PASSWORD_MIN_LENGTH : 1}
              onChange={(event) => setPassword(event.target.value)}
            />
          </div>
          {protecting && (
            <div className="space-y-2">
              <Label htmlFor={`${id}-confirmation`}>Confirmar senha</Label>
              <Input
                id={`${id}-confirmation`}
                type="password"
                autoComplete="new-password"
                value={confirmation}
                disabled={busy}
                required
                minLength={PASSWORD_MIN_LENGTH}
                onChange={(event) => setConfirmation(event.target.value)}
              />
            </div>
          )}
          {error && (
            <Alert variant="destructive">
              <CircleAlert aria-hidden="true" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          {protecting && (
            <p className="text-xs text-muted-foreground">
              O DevNotes não guarda sua senha. Se você esquecê-la, não será
              possível recuperar o conteúdo.
            </p>
          )}
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={busy}
              onClick={onClose}
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              disabled={busy}
              variant={removing ? 'destructive' : 'default'}
            >
              {busy
                ? 'Aguarde…'
                : protecting
                  ? 'Proteger'
                  : removing
                    ? 'Remover proteção'
                    : 'Desbloquear'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
