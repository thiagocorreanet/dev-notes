import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import type { LocalDraft } from '../local-drafts'

export function DraftRecovery({
  draft,
  onRestore,
  onDiscard,
  disabled,
}: {
  draft: LocalDraft
  onRestore: () => void
  onDiscard: () => void
  disabled: boolean
}) {
  return (
    <Alert className="mx-4 mt-4 w-auto">
      <AlertTitle>Há um rascunho para recuperar</AlertTitle>
      <AlertDescription className="space-y-3">
        <p>
          Encontramos alterações de{' '}
          {new Date(draft.savedAt).toLocaleString('pt-BR')} que não foram salvas
          no arquivo. Recuperar traz esse texto para o editor; o original só
          muda ao salvar.
        </p>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" disabled={disabled} onClick={onRestore}>
            Recuperar rascunho
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={disabled}
            onClick={onDiscard}
          >
            Descartar este rascunho
          </Button>
        </div>
      </AlertDescription>
    </Alert>
  )
}
