import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import type { DiskConflict } from '../hooks/use-disk-notes'

export function DiskConflictAlert({
  conflict,
  disabled,
  onResolve,
}: {
  conflict: DiskConflict
  disabled: boolean
  onResolve: (choice: 'disk' | 'local') => void
}) {
  const missing = conflict.kind === 'missing'
  return (
    <Alert className="mx-4 mt-4 w-auto">
      <AlertTitle>
        {missing
          ? 'O arquivo saiu da pasta do workspace'
          : 'O arquivo mudou fora do DevNotes'}
      </AlertTitle>
      <AlertDescription className="space-y-3">
        <p className="break-all">
          {missing
            ? `"${conflict.path}" foi apagado ou movido por outro programa enquanto você editava. Suas alterações continuam abertas aqui.`
            : `"${conflict.path}" foi alterado por outro programa enquanto você editava. Escolha qual versão fica no arquivo.`}
        </p>
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            disabled={disabled}
            onClick={() => onResolve('local')}
          >
            {missing ? 'Recriar o arquivo' : 'Manter a minha versão'}
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={disabled}
            onClick={() => onResolve('disk')}
          >
            {missing ? 'Descartar minhas alterações' : 'Usar a versão da pasta'}
          </Button>
        </div>
        {!missing && (
          <p className="text-xs text-muted-foreground">
            Ao usar a versão da pasta, o texto que você escreveu fica no
            histórico do documento.
          </p>
        )}
      </AlertDescription>
    </Alert>
  )
}
