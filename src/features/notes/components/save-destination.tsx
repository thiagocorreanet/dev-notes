import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import type { Note } from '../types'

export function SaveDestination({
  note,
  original,
  connectedPath,
  temporary,
  onOpenFolder,
}: {
  note: Note
  original: boolean
  connectedPath?: string | undefined
  temporary: boolean
  onOpenFolder: () => void
}) {
  return (
    <div
      aria-label="Local de salvamento"
      role="region"
      className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b px-4 py-2 text-xs"
    >
      <Badge variant="secondary">
        {original
          ? 'Arquivo original'
          : connectedPath
            ? 'Pasta conectada'
            : note.sourcePath
              ? 'Cópia importada'
              : temporary
                ? 'Documento temporário'
                : 'Neste navegador'}
      </Badge>
      <p className="min-w-0 break-all text-muted-foreground">
        {original
          ? `Salvar grava no computador: ${note.sourcePath ?? note.title}`
          : connectedPath
            ? `Salvar e Ctrl/Cmd+S guardam neste navegador. Arquivo na pasta: ${connectedPath}`
            : temporary
              ? 'Salvar guarda este documento neste navegador. Baixar cria uma cópia Markdown.'
              : 'Salvar guarda neste navegador. Para gravar uma cópia no computador, use Baixar ou Salvar como.'}
      </p>
      {connectedPath && (
        <Button variant="outline" size="sm" onClick={onOpenFolder}>
          Salvar na pasta…
        </Button>
      )}
    </div>
  )
}
