import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { downloadFile, markdownFilename } from '../workspace-files'
import type { Note } from '../types'
import { serializeProtectedMarkdown } from '../document-protection'

export function SaveAsDialog({
  note,
  onClose,
}: {
  note: Note
  onClose: () => void
}) {
  const [name, setName] = useState(markdownFilename(note.title))
  const [error, setError] = useState('')
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Salvar como</DialogTitle>
          <DialogDescription>
            {note.protection
              ? 'Baixe uma cópia criptografada com outro nome. A mesma senha será necessária para abri-la.'
              : 'Baixe uma cópia em Markdown com outro nome. O navegador define o destino ou pergunta onde salvar, conforme suas preferências.'}
          </DialogDescription>
        </DialogHeader>
        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault()
            const filename = name.trim()
            if (
              !filename ||
              /[/\\]/.test(filename) ||
              [...filename].some((character) => character.charCodeAt(0) < 32) ||
              filename === '.' ||
              filename === '..'
            ) {
              setError(
                'Digite um nome de arquivo sem barras ou caracteres de controle.',
              )
              return
            }
            downloadFile(
              /\.(md|markdown)$/i.test(filename) ? filename : `${filename}.md`,
              note.protection
                ? serializeProtectedMarkdown(note)
                : `# ${note.title}\n\n${note.content}\n`,
              'text/markdown;charset=utf-8',
            )
            onClose()
          }}
        >
          <div className="space-y-2">
            <Label htmlFor="save-as-name">Nome do arquivo</Label>
            <Input
              id="save-as-name"
              required
              maxLength={150}
              value={name}
              onChange={(event) => setName(event.target.value)}
              aria-invalid={!!error}
              aria-describedby={error ? 'save-as-error' : undefined}
            />
          </div>
          {error && (
            <p
              id="save-as-error"
              role="alert"
              className="text-sm text-destructive"
            >
              {error}
            </p>
          )}
          <Button type="submit">Baixar arquivo</Button>
        </form>
      </DialogContent>
    </Dialog>
  )
}
