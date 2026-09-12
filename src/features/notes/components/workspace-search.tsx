import { useEffect, useMemo, useRef, useState } from 'react'
import { ArrowRight, ListFilter } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
} from '@/components/ui/command'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Kbd, KbdGroup } from '@/components/ui/kbd'
import type { Note, WorkspaceFolder } from '../types'

export interface WorkspaceCommand {
  id: string
  label: string
  description: string
  keywords: string
  icon: LucideIcon
  shortcut?: string
  disabled?: boolean
  onSelect: () => void
}

function normalize(text: string) {
  return text
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
}

function locationFor(note: Note, folders: WorkspaceFolder[]) {
  if (note.sourcePath) return note.sourcePath
  const names: string[] = []
  const visited = new Set<string>()
  let folderId = note.folderId
  while (folderId && !visited.has(folderId)) {
    visited.add(folderId)
    const folder = folders.find((candidate) => candidate.id === folderId)
    if (!folder) break
    names.unshift(folder.name)
    folderId = folder.parentId
  }
  return names.join(' / ') || 'Pasta principal'
}

export function WorkspaceSearch({
  notes,
  folders,
  onSelect,
  commands = [],
}: {
  notes: Note[]
  folders: WorkspaceFolder[]
  onSelect: (id: string) => void
  commands?: WorkspaceCommand[]
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const actionSelected = useRef(false)
  const triggerRef = useRef<HTMLButtonElement>(null)

  function changeOpen(value: boolean) {
    if (value) actionSelected.current = false
    setQuery('')
    setOpen(value)
  }

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (
        event.key.toLowerCase() !== 'k' ||
        !(event.ctrlKey || event.metaKey) ||
        event.altKey ||
        event.isComposing ||
        event.repeat
      )
        return
      event.preventDefault()
      const dialog =
        event.target instanceof Element
          ? event.target.closest('[role="dialog"], [role="alertdialog"]')
          : null
      if (dialog && !dialog.querySelector('[data-slot="command"]')) return
      event.stopPropagation()
      actionSelected.current = false
      setQuery('')
      setOpen((current) => !current)
    }
    document.addEventListener('keydown', onKeyDown, true)
    return () => document.removeEventListener('keydown', onKeyDown, true)
  }, [])

  const terms = normalize(query).trim().split(/\s+/).filter(Boolean)
  const matchingCommands = commands
    .filter((command) => {
      const text = normalize(
        `${command.label} ${command.description} ${command.keywords}`,
      )
      return terms.every((term) => text.includes(term))
    })
    .sort((a, b) => {
      const rank = (command: WorkspaceCommand) => {
        const label = normalize(command.label)
        if (label === normalize(query).trim()) return 0
        return terms.every((term) => label.includes(term)) ? 1 : 2
      }
      return rank(a) - rank(b)
    })

  const results = useMemo(() => {
    const term = query.trim().toLowerCase()
    return notes
      .flatMap((note) => {
        const title = note.title || 'Documento sem título'
        const location = locationFor(note, folders)
        const text = note.content.replace(/\s+/g, ' ')
        const position = text.toLowerCase().indexOf(term)
        const titleMatch = title.toLowerCase().includes(term)
        const locationMatch = location.toLowerCase().includes(term)
        if (term && !titleMatch && !locationMatch && position < 0) return []
        const start = Math.max(0, position - 35)
        const excerpt =
          term && position >= 0
            ? `${start ? '…' : ''}${text.slice(start, start + 140)}${text.length > start + 140 ? '…' : ''}`
            : ''
        return [
          {
            note,
            title,
            location,
            excerpt,
            rank: titleMatch ? 0 : locationMatch ? 1 : 2,
          },
        ]
      })
      .sort((a, b) => a.rank - b.rank)
  }, [notes, folders, query])

  return (
    <>
      <Button
        ref={triggerRef}
        variant="outline"
        size="sm"
        aria-label="Buscar no espaço de trabalho"
        aria-keyshortcuts="Control+k Meta+k"
        title="Buscar no espaço de trabalho (Ctrl/Cmd+K)"
        onClick={() => changeOpen(true)}
      >
        <ListFilter aria-hidden="true" />
        <KbdGroup className="hidden sm:flex" aria-hidden="true">
          <Kbd>Ctrl</Kbd>
          <Kbd>K</Kbd>
        </KbdGroup>
      </Button>
      <Dialog open={open} onOpenChange={changeOpen}>
        <DialogContent
          showCloseButton={false}
          className="overflow-hidden p-0 sm:max-w-xl"
          onCloseAutoFocus={(event) => {
            event.preventDefault()
            if (
              !actionSelected.current ||
              document.activeElement === document.body
            )
              triggerRef.current?.focus()
          }}
        >
          <DialogHeader className="sr-only">
            <DialogTitle>Buscar no espaço de trabalho</DialogTitle>
            <DialogDescription>
              Busque documentos ou ações do editor. Use as setas para escolher e
              Enter para executar.
            </DialogDescription>
          </DialogHeader>
          <Command
            label="Buscar documentos e comandos"
            shouldFilter={false}
            loop
          >
            <CommandInput
              aria-label="Buscar documentos e comandos"
              placeholder="Buscar documentos ou digitar um comando…"
              value={query}
              onValueChange={setQuery}
            />
            <CommandList
              aria-label="Documentos e comandos encontrados"
              className="max-h-[min(24rem,50svh)]"
            >
              <CommandEmpty>
                Nenhum documento ou comando encontrado.
              </CommandEmpty>
              {matchingCommands.length > 0 && (
                <CommandGroup heading="Ações do editor">
                  {matchingCommands.map(
                    ({
                      id,
                      label,
                      description,
                      icon: Icon,
                      shortcut,
                      disabled,
                      onSelect: run,
                    }) => (
                      <CommandItem
                        key={id}
                        value={`command:${id}`}
                        aria-label={label}
                        aria-description={description}
                        disabled={disabled ?? false}
                        onSelect={() => {
                          actionSelected.current = true
                          changeOpen(false)
                          run()
                        }}
                      >
                        <Icon aria-hidden="true" />
                        <div className="min-w-0 flex-1">
                          <div className="font-medium">{label}</div>
                          <div className="text-xs text-muted-foreground">
                            {description}
                          </div>
                        </div>
                        {shortcut && (
                          <CommandShortcut>{shortcut}</CommandShortcut>
                        )}
                      </CommandItem>
                    ),
                  )}
                </CommandGroup>
              )}
              {!!matchingCommands.length && !!results.length && (
                <CommandSeparator />
              )}
              {results.length > 0 && (
                <CommandGroup heading="Documentos">
                  {results.map(({ note, title, location, excerpt }) => (
                    <CommandItem
                      key={note.id}
                      value={`document:${note.id}`}
                      onSelect={() => {
                        changeOpen(false)
                        onSelect(note.id)
                      }}
                    >
                      <ArrowRight aria-hidden="true" />
                      <div className="min-w-0 flex-1">
                        <div className="truncate font-medium">{title}</div>
                        <div className="truncate text-xs text-muted-foreground">
                          {location}
                        </div>
                        {excerpt && (
                          <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                            {excerpt}
                          </p>
                        )}
                      </div>
                    </CommandItem>
                  ))}
                </CommandGroup>
              )}
            </CommandList>
            <div className="flex flex-wrap items-center gap-4 border-t px-3 py-2 text-xs text-muted-foreground">
              <span className="flex items-center gap-1">
                <Kbd>↵</Kbd> Executar ou abrir
              </span>
              <span className="flex items-center gap-1">
                <Kbd>↑</Kbd>
                <Kbd>↓</Kbd> Navegar
              </span>
              <span className="ml-auto flex items-center gap-1">
                <Kbd>Esc</Kbd> Fechar
              </span>
            </div>
          </Command>
        </DialogContent>
      </Dialog>
    </>
  )
}
