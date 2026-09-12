import { useContext, useRef, useState } from 'react'
import type { Editor } from '@tiptap/core'
import { ImagePlus, Link } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Alert, AlertDescription } from '@/components/ui/alert'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { NoteNavigationContext } from '../note-navigation'
import { notePath } from '../note-links'
import { readImageFile } from '../image-files'
import { WorkspaceError } from '../workspace-error'
import { SlashMenu } from './slash-menu'

export function EditorInsertTools({
  editor,
  disabled,
}: {
  editor: Editor
  disabled: boolean
}) {
  const navigation = useContext(NoteNavigationContext)
  const imageInput = useRef<HTMLInputElement>(null)
  const [linkOpen, setLinkOpen] = useState(false)
  const [target, setTarget] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  async function insertImage(file?: File) {
    if (!file) return
    setError('')
    setLoading(true)
    try {
      const src = await readImageFile(file)
      if (!editor.isDestroyed)
        editor
          .chain()
          .focus()
          .setImage({ src, alt: file.name || 'Imagem colada' })
          .run()
    } catch (error) {
      setError(
        error instanceof WorkspaceError
          ? error.message
          : 'Não foi possível inserir a imagem.',
      )
    } finally {
      setLoading(false)
    }
  }
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              size="icon-sm"
              variant="ghost"
              aria-label="Inserir imagem"
              disabled={disabled || loading || editor.isActive('table')}
              onClick={() => imageInput.current?.click()}
            >
              <ImagePlus aria-hidden="true" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            Inserir imagem (PNG, JPEG, GIF ou WebP, até 1 MB)
          </TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              size="icon-sm"
              variant="ghost"
              aria-label="Inserir link para uma nota"
              disabled={disabled || !navigation?.notes.length}
              onClick={() => setLinkOpen(true)}
            >
              <Link aria-hidden="true" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Inserir link para uma nota</TooltipContent>
        </Tooltip>
        <span className="text-xs text-muted-foreground">
          {loading
            ? 'Inserindo imagem…'
            : 'Digite / para inserir conteúdo. Você também pode colar imagens.'}
        </span>
      </div>
      <Input
        ref={imageInput}
        type="file"
        className="hidden"
        aria-label="Selecionar imagem"
        accept="image/png,image/jpeg,image/gif,image/webp"
        onChange={(event) => {
          const file = event.target.files?.[0]
          event.target.value = ''
          void insertImage(file)
        }}
      />
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      {!disabled && (
        <SlashMenu
          editor={editor}
          onImage={() => imageInput.current?.click()}
          onLink={() => setLinkOpen(true)}
        />
      )}
      <Dialog open={linkOpen} onOpenChange={setLinkOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Link para uma nota</DialogTitle>
            <DialogDescription>
              Escolha o documento que este link vai abrir. Você também pode
              escrever [[Nome da nota]] no texto.
            </DialogDescription>
          </DialogHeader>
          <Label htmlFor="note-link-target">Documento</Label>
          <Select value={target} onValueChange={setTarget}>
            <SelectTrigger id="note-link-target">
              <SelectValue placeholder="Escolha uma nota" />
            </SelectTrigger>
            <SelectContent>
              {navigation?.notes.map((note) => (
                <SelectItem key={note.id} value={note.id}>
                  {notePath(note, navigation.folders)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <DialogFooter>
            <Button variant="outline" onClick={() => setLinkOpen(false)}>
              Cancelar
            </Button>
            <Button
              disabled={!navigation?.notes.some((note) => note.id === target)}
              onClick={() => {
                const note = navigation?.notes.find(
                  (note) => note.id === target,
                )
                if (note) {
                  editor
                    .chain()
                    .focus()
                    .insertContent({
                      type: 'text',
                      text: note.title || 'Documento sem título',
                      marks: [
                        { type: 'link', attrs: { href: `#note/${note.id}` } },
                      ],
                    })
                    .run()
                  setLinkOpen(false)
                }
              }}
            >
              Inserir link
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
