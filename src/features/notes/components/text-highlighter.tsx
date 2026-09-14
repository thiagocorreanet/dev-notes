import { useEffect, useState } from 'react'
import { Eraser, Highlighter, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from '@/components/ui/popover'
import {
  createTextHighlight,
  loadTextHighlights,
  mapTextDocument,
  overlappingHighlightIds,
  resolveTextHighlight,
  saveTextHighlights,
} from '../text-highlights'
import type { TextHighlight, TextHighlightColor } from '../text-highlights'

const colors: {
  value: TextHighlightColor
  label: string
  swatchClass: string
}[] = [
  {
    value: 'yellow',
    label: 'Amarelo',
    swatchClass: 'bg-[var(--text-highlight-yellow)]',
  },
  {
    value: 'green',
    label: 'Verde',
    swatchClass: 'bg-[var(--text-highlight-green)]',
  },
  {
    value: 'blue',
    label: 'Azul',
    swatchClass: 'bg-[var(--text-highlight-blue)]',
  },
  {
    value: 'pink',
    label: 'Rosa',
    swatchClass: 'bg-[var(--text-highlight-pink)]',
  },
]

interface SelectedText {
  root: HTMLElement
  range: Range
  start: number
  end: number
  text: string
  content: string
  view: string
}

const registryNames = colors.map(
  ({ value }) => `devnotes-text-highlight-${value}`,
)

function activeHighlightRoot() {
  return document
    .getElementById('main')
    ?.querySelector<HTMLElement>('[data-highlight-root]')
}

function currentSelection(content: string, view: string): SelectedText | null {
  const root = activeHighlightRoot()
  const selection = window.getSelection()
  if (!root || !selection || selection.isCollapsed || !selection.rangeCount)
    return null
  const range = selection.getRangeAt(0).cloneRange()
  const anchor = createTextHighlight(root, range, 'yellow', 'selection')
  return anchor
    ? {
        root,
        range,
        start: anchor.start,
        end: anchor.end,
        text: anchor.text,
        content,
        view,
      }
    : null
}

function clearRegistry() {
  if (typeof CSS === 'undefined' || !('highlights' in CSS)) return
  for (const name of registryNames) CSS.highlights.delete(name)
}

export function TextHighlighter({
  documentId,
  content,
  view,
  disabled,
}: {
  documentId: string
  content: string
  view: string
  disabled: boolean
}) {
  const [highlights, setHighlights] = useState<TextHighlight[]>(() =>
    loadTextHighlights(documentId),
  )
  const [selected, setSelected] = useState<SelectedText | null>(null)
  const [message, setMessage] = useState('')
  const usableSelection =
    selected &&
    selected.content === content &&
    selected.view === view &&
    selected.root.isConnected
      ? selected
      : null

  useEffect(() => {
    function rememberSelection() {
      const next = currentSelection(content, view)
      if (next) setSelected(next)
    }
    document.addEventListener('selectionchange', rememberSelection)
    return () =>
      document.removeEventListener('selectionchange', rememberSelection)
  }, [content, view])

  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      clearRegistry()
      if (
        !highlights.length ||
        typeof CSS === 'undefined' ||
        !('highlights' in CSS) ||
        typeof Highlight === 'undefined'
      )
        return
      const root = activeHighlightRoot()
      if (!root) return
      const map = mapTextDocument(root)
      for (const { value } of colors) {
        const ranges = highlights.flatMap((highlight) => {
          if (highlight.color !== value) return []
          const resolved = resolveTextHighlight(map, highlight)
          return resolved ? [resolved.range] : []
        })
        if (ranges.length)
          CSS.highlights.set(
            `devnotes-text-highlight-${value}`,
            new Highlight(...ranges),
          )
      }
    })
    return () => {
      cancelAnimationFrame(frame)
      clearRegistry()
    }
  }, [content, highlights, view])

  function persist(next: TextHighlight[], successMessage: string) {
    setHighlights(next)
    setSelected(null)
    window.getSelection()?.removeAllRanges()
    setMessage(
      saveTextHighlights(documentId, next)
        ? successMessage
        : 'Não foi possível salvar as marcações neste navegador.',
    )
  }

  function add(color: TextHighlightColor) {
    const selection = usableSelection
    if (!selection) return
    const highlight = createTextHighlight(
      selection.root,
      selection.range,
      color,
    )
    if (!highlight) return
    const storedHighlight: TextHighlight = {
      id: highlight.id,
      text: highlight.text,
      prefix: highlight.prefix,
      suffix: highlight.suffix,
      start: highlight.start,
      color: highlight.color,
    }
    const overlapping = overlappingHighlightIds(
      selection.root,
      highlights,
      selection,
    )
    persist(
      [
        ...highlights.filter((item) => !overlapping.has(item.id)),
        storedHighlight,
      ],
      'Marcação adicionada.',
    )
  }

  function removeSelected() {
    const selection = usableSelection
    if (!selection) return
    const overlapping = overlappingHighlightIds(
      selection.root,
      highlights,
      selection,
    )
    if (!overlapping.size) return
    persist(
      highlights.filter((item) => !overlapping.has(item.id)),
      'Marcação removida.',
    )
  }

  const removable = usableSelection
    ? overlappingHighlightIds(usableSelection.root, highlights, usableSelection)
        .size > 0
    : false

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon-sm"
          data-focus-secondary
          aria-label="Marca-texto"
          title="Marca-texto"
          disabled={disabled}
        >
          <Highlighter aria-hidden="true" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        sideOffset={8}
        className="w-80 max-w-[calc(100vw-2rem)]"
        onOpenAutoFocus={(event) => event.preventDefault()}
      >
        <PopoverHeader>
          <PopoverTitle>Marca-texto</PopoverTitle>
          <PopoverDescription>
            {usableSelection
              ? `Trecho selecionado: “${usableSelection.text.slice(0, 60)}${usableSelection.text.length > 60 ? '…' : ''}”`
              : view === 'source'
                ? 'Abra Ler ou Editar e selecione um trecho para marcar.'
                : 'Selecione um trecho do documento e escolha uma cor.'}
          </PopoverDescription>
        </PopoverHeader>
        <div className="grid grid-cols-2 gap-2" aria-label="Cores da marcação">
          {colors.map(({ value, label, swatchClass }) => (
            <Button
              key={value}
              variant="outline"
              size="sm"
              className="justify-start"
              disabled={!usableSelection}
              onClick={() => add(value)}
            >
              <span
                className={`size-3 rounded-full ring-1 ring-foreground/15 ${swatchClass}`}
                aria-hidden="true"
              />
              {label}
            </Button>
          ))}
        </div>
        <div className="flex flex-wrap gap-2 border-t pt-2">
          <Button
            variant="ghost"
            size="sm"
            disabled={!removable}
            onClick={removeSelected}
          >
            <Eraser aria-hidden="true" />
            Remover da seleção
          </Button>
          <Button
            variant="ghost"
            size="sm"
            disabled={!highlights.length}
            onClick={() => persist([], 'Todas as marcações foram removidas.')}
          >
            <Trash2 aria-hidden="true" />
            Limpar todas
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          {highlights.length}{' '}
          {highlights.length === 1
            ? 'marcação neste documento'
            : 'marcações neste documento'}
        </p>
        <p className="text-xs text-muted-foreground">
          As marcações ficam no DevNotes e não alteram o arquivo Markdown.
        </p>
        {message && (
          <p role="status" className="text-xs text-muted-foreground">
            {message}
          </p>
        )}
      </PopoverContent>
    </Popover>
  )
}
