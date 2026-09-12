import { Button } from '@/components/ui/button'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { documentHeadings } from '../document-structure'
import type { Note } from '../types'

export function DocumentMinimap({
  note,
  onClose,
  onNavigate,
}: {
  note: Note
  onClose: () => void
  onNavigate: (id: string) => void
}) {
  const headings = documentHeadings(note.content)
  return (
    <Sheet
      open
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
    >
      <SheetContent>
        <SheetHeader>
          <SheetTitle>Minimapa do documento</SheetTitle>
          <SheetDescription>
            Escolha uma seção para ir até ela no modo de leitura.
          </SheetDescription>
        </SheetHeader>
        <nav
          aria-label="Seções do documento"
          className="flex flex-col gap-1 overflow-y-auto px-4 pb-4"
        >
          <Button
            variant="ghost"
            className="h-auto justify-start whitespace-normal text-left"
            onClick={() => onNavigate('document-title')}
          >
            {note.title || 'Documento sem título'}
          </Button>
          {headings.map((heading) => (
            <Button
              key={heading.id}
              aria-label={`Ir para ${heading.title || 'seção sem título'}`}
              variant="ghost"
              className="h-auto justify-start gap-2 whitespace-normal text-left"
              onClick={() => onNavigate(heading.id)}
            >
              <span className="font-mono text-xs text-muted-foreground">
                H{heading.depth}
              </span>
              <span>{heading.title || 'Seção sem título'}</span>
            </Button>
          ))}
          {!headings.length && (
            <p className="px-3 py-4 text-sm text-muted-foreground">
              Adicione títulos ao documento para navegar pelas seções.
            </p>
          )}
        </nav>
      </SheetContent>
    </Sheet>
  )
}
