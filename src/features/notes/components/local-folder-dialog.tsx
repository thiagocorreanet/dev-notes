import { useState } from 'react'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import type { useLocalFolder } from '../hooks/use-local-folder'
import type { Note } from '../types'
import { serializeLocalNote } from '../local-folder'
import { markdownFilename } from '../workspace-files'

const statusLabels = {
  saved: 'Salvo na pasta',
  modified: 'Alterações para salvar',
  external: 'Alterado na pasta',
  conflict: 'Conflito',
  missing: 'Arquivo ausente',
}

export function LocalFolderDialog({
  sync,
  note,
  onClose,
  onOpenNote,
}: {
  sync: ReturnType<typeof useLocalFolder>
  note: Note
  onClose: () => void
  onOpenNote: (id: string) => void
}) {
  const [path, setPath] = useState(markdownFilename(note.title))
  const [reviewId, setReviewId] = useState<string | null>(null)
  const active = sync.files.find((file) => file.noteId === note.id)
  const review = sync.files.find((file) => file.noteId === reviewId)
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !sync.busy) onClose()
      }}
    >
      <DialogContent
        className="max-h-[90svh] overflow-y-auto sm:max-w-4xl"
        onEscapeKeyDown={(event) => {
          if (sync.busy) event.preventDefault()
        }}
        onPointerDownOutside={(event) => {
          if (sync.busy) event.preventDefault()
        }}
      >
        <DialogHeader>
          <DialogTitle>Pasta local</DialogTitle>
          <DialogDescription>
            Conecte uma pasta para ler e salvar arquivos Markdown. As edições
            ficam no navegador até você salvar na pasta.
          </DialogDescription>
        </DialogHeader>
        {sync.error && (
          <Alert variant="destructive">
            <AlertDescription>{sync.error}</AlertDescription>
          </Alert>
        )}
        {sync.message && (
          <p role="status" className="text-sm text-muted-foreground">
            {sync.message}
          </p>
        )}
        {!sync.rootName ? (
          <div className="space-y-4">
            <p className="text-sm">
              Escolha a pasta e permita a leitura e a gravação. Ao reconectar,
              documentos com o mesmo caminho serão comparados com suas cópias
              neste navegador.
            </p>
            {!window.showDirectoryPicker && (
              <p className="text-sm text-muted-foreground">
                A conexão com gravação não está disponível neste navegador. Use
                Abrir pasta para importar cópias e Baixar para exportar.
              </p>
            )}
            <Button
              disabled={sync.busy || !window.showDirectoryPicker}
              onClick={() => {
                void sync.connect()
              }}
            >
              Conectar pasta local
            </Button>
          </div>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="secondary">{sync.rootName}</Badge>
              <Button
                variant="outline"
                disabled={sync.busy}
                onClick={() => {
                  void sync.check()
                }}
              >
                Verificar alterações da pasta
              </Button>
              <Button
                variant="ghost"
                disabled={sync.busy}
                onClick={sync.disconnect}
              >
                Desconectar
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              A conexão dura até recarregar a página. Renomear, mover ou excluir
              uma nota no DevNotes não renomeia, move ou exclui o arquivo na
              pasta. Mudanças externas são verificadas manualmente.
            </p>
            <section
              className="min-w-0 space-y-3 rounded-lg border p-4"
              aria-label="Salvar documento na pasta"
            >
              <h3 className="break-words text-sm font-semibold">
                Documento aberto: {note.title || 'Documento sem título'}
              </h3>
              {active ? (
                <p className="break-words text-sm text-muted-foreground">
                  {active.path} · {statusLabels[active.status]}
                </p>
              ) : (
                <div className="min-w-0 space-y-2">
                  <Label htmlFor="local-file-path">Caminho na pasta</Label>
                  <Input
                    id="local-file-path"
                    value={path}
                    disabled={sync.busy}
                    onChange={(event) => setPath(event.target.value)}
                    placeholder="projeto/minha-nota.md"
                  />
                  <p className="text-xs text-muted-foreground">
                    Subpastas serão criadas ao salvar. Arquivos existentes não
                    serão substituídos por uma nova nota.
                  </p>
                </div>
              )}
              <Button
                className="h-auto min-h-8 max-w-full whitespace-normal"
                disabled={sync.busy || note.id === 'empty-workspace'}
                onClick={() => {
                  void sync.save(note.id, path)
                }}
              >
                Salvar documento na pasta
              </Button>
            </section>
            <ul className="divide-y" aria-label="Arquivos conectados">
              {sync.files.map((file) => (
                <li
                  key={file.noteId}
                  className="flex flex-wrap items-center gap-2 py-3"
                >
                  <div className="min-w-0 flex-1">
                    <Button
                      variant="link"
                      className="h-auto max-w-full justify-start whitespace-normal px-0 text-left"
                      onClick={() => onOpenNote(file.noteId)}
                    >
                      {file.path}
                    </Button>
                    <p className="text-xs text-muted-foreground">
                      {statusLabels[file.status]}
                    </p>
                  </div>
                  {file.status === 'conflict' ||
                  file.status === 'missing' ||
                  file.status === 'external' ? (
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={sync.busy}
                      onClick={() => setReviewId(file.noteId)}
                    >
                      Comparar versões
                      <span className="sr-only"> de {file.path}</span>
                    </Button>
                  ) : (
                    file.status === 'modified' && (
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={sync.busy}
                        onClick={() => {
                          void sync.save(file.noteId)
                        }}
                      >
                        Salvar<span className="sr-only"> {file.path}</span>
                      </Button>
                    )
                  )}
                </li>
              ))}
            </ul>
            {!sync.files.length && (
              <p className="text-sm text-muted-foreground">
                Nenhum arquivo Markdown conectado. Salve o documento aberto para
                criar o primeiro arquivo.
              </p>
            )}
            {review && (
              <section
                aria-label="Comparação de versões"
                className="min-w-0 space-y-3 rounded-lg border p-4"
              >
                <h3 className="break-words font-semibold">{review.path}</h3>
                <p className="text-sm text-muted-foreground">
                  Escolha o conteúdo a manter. O arquivo será verificado
                  novamente antes de aplicar sua escolha.
                </p>
                <div className="grid gap-3 md:grid-cols-2">
                  <div className="min-w-0 space-y-2">
                    <Label htmlFor="local-version">Versão do DevNotes</Label>
                    <Textarea
                      id="local-version"
                      readOnly
                      className="min-h-48 font-mono text-xs"
                      value={serializeLocalNote(review.note, review)}
                    />
                  </div>
                  <div className="min-w-0 space-y-2">
                    <Label htmlFor="disk-version">Versão da pasta</Label>
                    <Textarea
                      id="disk-version"
                      readOnly
                      className="min-h-48 font-mono text-xs"
                      value={
                        review.disk ??
                        'O arquivo não foi encontrado. Sua nota continua no navegador.'
                      }
                    />
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button
                    className="h-auto min-h-8 max-w-full whitespace-normal"
                    disabled={sync.busy}
                    onClick={() => {
                      void sync.save(review.noteId, undefined, 'local')
                    }}
                  >
                    {review.disk === null
                      ? 'Recriar arquivo na pasta'
                      : 'Substituir arquivo pela versão do DevNotes'}
                  </Button>
                  <Button
                    variant="outline"
                    disabled={sync.busy || review.disk === null}
                    onClick={() => {
                      void sync.save(review.noteId, undefined, 'disk')
                    }}
                  >
                    Usar versão da pasta
                  </Button>
                  <Button
                    variant="ghost"
                    disabled={sync.busy}
                    onClick={() => setReviewId(null)}
                  >
                    Fechar comparação
                  </Button>
                </div>
              </section>
            )}
          </>
        )}
        {sync.busy && (
          <p role="status" className="text-sm text-muted-foreground">
            Aguarde…
          </p>
        )}
      </DialogContent>
    </Dialog>
  )
}
