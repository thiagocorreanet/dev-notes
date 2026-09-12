import { noteTemplates } from '../note-templates'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from '@/components/ui/alert-dialog'
import { useId, useRef, useState } from 'react'
import type { SubmitEvent } from 'react'
import { ArrowUpRight, CircleAlert } from 'lucide-react'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'

interface NoteFormProps {
  onAdd: (title: string, content: string) => void
}

export function NoteForm({ onAdd }: NoteFormProps) {
  const id = useId()
  const titleRef = useRef<HTMLInputElement>(null)
  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [error, setError] = useState('')
  const [templateId, setTemplateId] = useState('blank')
  const [pendingTemplate, setPendingTemplate] = useState<string | null>(null)
  function applyTemplate(id: string) {
    const template = noteTemplates.find((value) => value.id === id)
    if (template) {
      setTitle(template.title)
      setContent(template.content)
      setTemplateId(id)
      setError('')
    }
    setPendingTemplate(null)
  }

  function handleSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!title.trim() || !content.trim()) {
      setError('Preencha o título e o conteúdo da nota.')
      return
    }
    onAdd(title, content)
    setTitle('')
    setContent('')
    setError('')
    titleRef.current?.focus()
  }

  return (
    <form className="space-y-6" onSubmit={handleSubmit}>
      <div className="space-y-2">
        <Label htmlFor={`${id}-template`}>Modelo</Label>
        <Select
          value={templateId}
          onValueChange={(next) => {
            if (title || content) setPendingTemplate(next)
            else applyTemplate(next)
          }}
        >
          <SelectTrigger id={`${id}-template`}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {noteTemplates.map((template) => (
              <SelectItem key={template.id} value={template.id}>
                {template.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <AlertDialog
        open={pendingTemplate !== null}
        onOpenChange={(open) => {
          if (!open) setPendingTemplate(null)
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Aplicar este modelo?</AlertDialogTitle>
            <AlertDialogDescription>
              O título e o conteúdo que você preencheu neste formulário serão
              substituídos pelo modelo.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Manter meu texto</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (pendingTemplate) applyTemplate(pendingTemplate)
              }}
            >
              Aplicar modelo
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <div className="grid gap-2">
        <Label htmlFor={`${id}-title`}>Título</Label>
        <Input
          id={`${id}-title`}
          ref={titleRef}
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          placeholder="O que você aprendeu hoje?"
          maxLength={100}
          aria-invalid={!!error && !title.trim()}
          aria-describedby={error ? `${id}-error` : undefined}
          required
        />
      </div>
      <div className="grid gap-2">
        <Label htmlFor={`${id}-content`}>Conteúdo</Label>
        <Textarea
          id={`${id}-content`}
          value={content}
          onChange={(event) => setContent(event.target.value)}
          placeholder="Escreva sua nota em Markdown…"
          rows={7}
          aria-invalid={!!error && !content.trim()}
          aria-describedby={error ? `${id}-error` : undefined}
          required
        />
      </div>
      {error && (
        <Alert variant="destructive">
          <CircleAlert aria-hidden="true" />
          <AlertDescription id={`${id}-error`}>{error}</AlertDescription>
        </Alert>
      )}
      <div className="space-y-2">
        <Button type="submit" className="w-full">
          Criar nota <ArrowUpRight data-icon="inline-end" aria-hidden="true" />
        </Button>
        <p className="text-center text-xs text-muted-foreground">
          As notas ficam salvas apenas neste navegador.
        </p>
      </div>
    </form>
  )
}
