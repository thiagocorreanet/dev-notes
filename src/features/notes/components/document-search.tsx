import { useEffect, useImperativeHandle, useRef, useState } from 'react'
import type { Ref } from 'react'
import { ArrowDown, ArrowUp, Search, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { findOffsets, findTextMatches } from '../document-search'

type Match =
  { range: Range } | { start: number; end: number; field: HTMLTextAreaElement }

export interface DocumentSearchHandle {
  open: () => void
  close: () => void
}

export function DocumentSearch({
  content,
  view,
  ref,
}: {
  content: string
  view: string
  ref?: Ref<DocumentSearchHandle>
}) {
  const [open, setOpen] = useState(false)
  useImperativeHandle(
    ref,
    () => ({ open: () => setOpen(true), close: () => setOpen(false) }),
    [],
  )
  const [query, setQuery] = useState('')
  const [matches, setMatches] = useState<Match[]>([])
  const [index, setIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const activeIndex = matches.length ? Math.min(index, matches.length - 1) : 0

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'f') {
        event.preventDefault()
        setOpen(true)
        inputRef.current?.focus()
        inputRef.current?.select()
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [setOpen])

  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      if (!open || !query) {
        setMatches([])
        return
      }
      const main = document.getElementById('main')
      const root = main?.querySelector<HTMLElement>(
        '[data-document-preview], .visual-document',
      )
      if (root) {
        setMatches(findTextMatches(root, query))
        return
      }
      const field = main?.querySelector<HTMLTextAreaElement>('#editor-content')
      setMatches(
        field
          ? findOffsets(field.value, query).map((match) => ({
              ...match,
              field,
            }))
          : [],
      )
    })
    return () => cancelAnimationFrame(frame)
  }, [open, query, content, view])

  useEffect(() => {
    const active = matches[activeIndex]
    if (!open || !active) return
    const registry =
      typeof CSS !== 'undefined' && 'highlights' in CSS
        ? CSS.highlights
        : undefined
    if ('range' in active) {
      if (registry && typeof Highlight !== 'undefined') {
        registry.set(
          'document-search',
          new Highlight(
            ...matches.flatMap((match) =>
              'range' in match ? [match.range] : [],
            ),
          ),
        )
        registry.set('document-search-active', new Highlight(active.range))
      } else {
        window.getSelection()?.removeAllRanges()
        window.getSelection()?.addRange(active.range)
      }
      const parent = active.range.startContainer.parentElement
      const pane = parent?.closest<HTMLElement>('[role="tabpanel"]')
      const rect = active.range.getBoundingClientRect?.()
      if (pane && rect && typeof pane.scrollBy === 'function') {
        pane.scrollBy({
          top:
            rect.top -
            pane.getBoundingClientRect().top -
            pane.clientHeight / 2 +
            rect.height / 2,
        })
      } else {
        parent?.scrollIntoView?.({ block: 'center', inline: 'nearest' })
      }
    } else {
      active.field.setSelectionRange(active.start, active.end)
      const line =
        active.field.value.slice(0, active.start).split('\n').length - 1
      const lineHeight =
        parseFloat(getComputedStyle(active.field).lineHeight) || 20
      active.field.scrollTo?.({
        top: line * lineHeight - active.field.clientHeight / 2,
      })
      active.field.scrollIntoView?.({ block: 'center', inline: 'nearest' })
    }
    return () => {
      registry?.delete('document-search')
      registry?.delete('document-search-active')
      if (!registry && 'range' in active)
        window.getSelection()?.removeAllRanges()
    }
  }, [open, matches, activeIndex])

  function move(direction: number) {
    if (matches.length)
      setIndex((activeIndex + direction + matches.length) % matches.length)
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="icon-sm"
          aria-label="Buscar no documento"
          title="Buscar no documento (Ctrl/Cmd+F)"
        >
          <Search aria-hidden="true" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        sideOffset={12}
        collisionPadding={8}
        className="flex w-96 max-w-[calc(100vw-2rem)] flex-row items-center gap-1 p-2"
        aria-label="Buscar no documento"
        onInteractOutside={(event) => event.preventDefault()}
        onOpenAutoFocus={(event) => {
          event.preventDefault()
          inputRef.current?.focus()
        }}
      >
        <Input
          ref={inputRef}
          aria-label="Texto da busca"
          placeholder="Buscar no documento…"
          className="min-w-0 flex-1"
          value={query}
          onChange={(event) => {
            setQuery(event.target.value)
            setIndex(0)
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault()
              move(event.shiftKey ? -1 : 1)
            }
          }}
        />
        <span
          role="status"
          aria-label="Resultados da busca"
          className="min-w-10 shrink-0 text-center font-mono text-xs text-muted-foreground"
        >
          {matches.length ? `${activeIndex + 1}/${matches.length}` : '0/0'}
        </span>
        <Button
          variant="ghost"
          size="icon-xs"
          aria-label="Resultado anterior"
          title="Resultado anterior (Shift+Enter)"
          disabled={!matches.length}
          onClick={() => move(-1)}
        >
          <ArrowUp aria-hidden="true" />
        </Button>
        <Button
          variant="ghost"
          size="icon-xs"
          aria-label="Próximo resultado"
          title="Próximo resultado (Enter)"
          disabled={!matches.length}
          onClick={() => move(1)}
        >
          <ArrowDown aria-hidden="true" />
        </Button>
        <Button
          variant="ghost"
          size="icon-xs"
          aria-label="Fechar busca"
          onClick={() => setOpen(false)}
        >
          <X aria-hidden="true" />
        </Button>
      </PopoverContent>
    </Popover>
  )
}
