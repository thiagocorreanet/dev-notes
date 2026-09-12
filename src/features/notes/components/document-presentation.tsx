import { useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import type { Note } from '../types'
import { presentationSlides } from '../document-structure'
import { MarkdownPreview } from './markdown-preview'

export function DocumentPresentation({
  note,
  onClose,
}: {
  note: Note
  onClose: () => void
}) {
  const slides = presentationSlides(note.content)
  const [index, setIndex] = useState(0)
  const total = Math.max(1, slides.length)
  function move(direction: number) {
    setIndex((current) => Math.max(0, Math.min(total - 1, current + direction)))
  }
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
    >
      <DialogContent
        className="flex h-svh w-screen max-w-none flex-col rounded-none sm:max-w-none"
        onKeyDown={(event) => {
          if (event.altKey || event.ctrlKey || event.metaKey) return
          if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') {
            event.preventDefault()
            move(event.key === 'ArrowRight' ? 1 : -1)
          }
        }}
      >
        <DialogHeader className="pr-8">
          <DialogTitle>Modo apresentação</DialogTitle>
          <DialogDescription>
            {note.title || 'Documento sem título'} · Use ← e → para navegar, Esc
            para sair.
          </DialogDescription>
        </DialogHeader>
        <article
          key={index}
          className="mx-auto w-full max-w-5xl flex-1 animate-in overflow-y-auto py-6 duration-200 fade-in-0 motion-reduce:animate-none sm:py-12"
          aria-label={`Slide ${index + 1}`}
        >
          {index === 0 && (
            <h1 className="mb-8 text-3xl font-bold sm:text-5xl">
              {note.title || 'Documento sem título'}
            </h1>
          )}
          <MarkdownPreview content={slides[index] ?? ''} />
        </article>
        <div className="flex items-center justify-center gap-4 border-t pt-4">
          <Button
            variant="outline"
            size="icon"
            aria-label="Slide anterior"
            disabled={index === 0}
            onClick={() => move(-1)}
          >
            <ChevronLeft />
          </Button>
          <span role="status" aria-live="polite" className="font-mono text-sm">
            {index + 1} / {total}
          </span>
          <Button
            variant="outline"
            size="icon"
            aria-label="Próximo slide"
            disabled={index === total - 1}
            onClick={() => move(1)}
          >
            <ChevronRight />
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
