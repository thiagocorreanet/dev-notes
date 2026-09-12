import { useEffect, useRef } from 'react'
import { X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import type { Note } from '../types'

export function DocumentTabs({
  notes,
  activeId,
  onSelect,
  onClose,
}: {
  notes: Note[]
  activeId: string
  onSelect: (id: string) => void
  onClose: (id: string) => void
}) {
  const tabs = useRef<HTMLDivElement>(null)
  useEffect(() => {
    tabs.current
      ?.querySelector<HTMLElement>('[role="tab"][data-state="active"]')
      ?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
  }, [activeId, notes.length])
  return (
    <Tabs
      ref={tabs}
      value={activeId}
      onValueChange={onSelect}
      className="shrink-0 overflow-x-auto border-b px-2 py-1"
    >
      <TabsList
        variant="line"
        aria-label="Documentos abertos"
        className="h-auto min-w-max justify-start"
      >
        {notes.map((note) => (
          <div
            key={note.id}
            className="flex animate-in items-center duration-150 fade-in-0 motion-reduce:animate-none"
          >
            <TabsTrigger
              value={note.id}
              id={`document-tab-${note.id}`}
              aria-controls="main"
              className="max-w-48"
              aria-label={`Abrir aba ${note.title || 'Documento sem título'}`}
            >
              <span className="truncate">
                {note.favorite ? '★ ' : ''}
                {note.title || 'Documento sem título'}
              </span>
            </TabsTrigger>
            {notes.length > 1 && (
              <Button
                size="icon-xs"
                variant="ghost"
                aria-label={`Fechar aba ${note.title || 'Documento sem título'}`}
                onClick={() => onClose(note.id)}
              >
                <X aria-hidden="true" />
              </Button>
            )}
          </div>
        ))}
      </TabsList>
    </Tabs>
  )
}
