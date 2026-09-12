import { useEffect, useId, useState } from 'react'
import { useEditorState } from '@tiptap/react'
import type { Editor } from '@tiptap/core'
import {
  Code,
  Heading1,
  Image,
  Link,
  ListChecks,
  Table2,
  Text,
} from 'lucide-react'
import {
  Command,
  CommandEmpty,
  CommandItem,
  CommandList,
} from '@/components/ui/command'
import { normalizeSearch } from '../slash-commands'

function currentMatch(editor: Editor) {
  const { $from, empty, from } = editor.state.selection
  if (
    !empty ||
    $from.parent.type.name !== 'paragraph' ||
    editor.isActive('table')
  )
    return null
  const before = $from.parent.textBetween(0, $from.parentOffset, '\0', '\0')
  const match = /^\/([\p{L}\w-]*)$/u.exec(before)
  return match
    ? { query: match[1]!, from: from - before.length, to: from }
    : null
}

export function SlashMenu({
  editor,
  onImage,
  onLink,
}: {
  editor: Editor
  onImage: () => void
  onLink: () => void
}) {
  const id = useId()
  const match = useEditorState({
    editor,
    selector: ({ editor: current }) => currentMatch(current),
  })
  const [dismissed, setDismissed] = useState('')
  const [choice, setChoice] = useState({ query: '', index: 0 })
  const commands = [
    {
      id: 'titulo',
      label: 'Título',
      description: 'Título de seção',
      icon: Heading1,
      run: () => editor.chain().focus().toggleHeading({ level: 2 }).run(),
    },
    {
      id: 'texto',
      label: 'Texto',
      description: 'Parágrafo simples',
      icon: Text,
      run: () => editor.chain().focus().setParagraph().run(),
    },
    {
      id: 'tabela',
      label: 'Tabela',
      description: 'Três linhas e três colunas',
      icon: Table2,
      run: () =>
        editor
          .chain()
          .focus()
          .insertTable({ rows: 3, cols: 3, withHeaderRow: true })
          .run(),
    },
    {
      id: 'codigo',
      label: 'Código',
      description: 'Bloco de código',
      icon: Code,
      run: () => editor.chain().focus().setCodeBlock().run(),
    },
    {
      id: 'tarefa',
      label: 'Tarefas',
      description: 'Lista de tarefas',
      icon: ListChecks,
      run: () => editor.chain().focus().toggleTaskList().run(),
    },
    {
      id: 'imagem',
      label: 'Imagem',
      description: 'Selecionar uma imagem',
      icon: Image,
      run: onImage,
    },
    {
      id: 'link',
      label: 'Link para uma nota',
      description: 'Conectar documentos',
      icon: Link,
      run: onLink,
    },
  ].filter((command) =>
    normalizeSearch(`${command.id} ${command.label}`).includes(
      normalizeSearch(match?.query ?? ''),
    ),
  )
  const queryKey = match ? `${match.from}/${match.query}` : ''
  const index = Math.min(
    choice.query === queryKey ? choice.index : 0,
    Math.max(0, commands.length - 1),
  )
  const open = !!match && dismissed !== queryKey
  function run(command: (typeof commands)[number]) {
    if (!match) return
    editor.chain().focus().deleteRange({ from: match.from, to: match.to }).run()
    command.run()
  }
  useEffect(() => {
    function resetDismissed() {
      if (!currentMatch(editor)) setDismissed('')
    }
    editor.on('transaction', resetDismissed)
    return () => {
      editor.off('transaction', resetDismissed)
    }
  }, [editor])
  useEffect(() => {
    if (!open) return
    const element = editor.view.dom
    function onKeyDown(event: KeyboardEvent) {
      if (
        event.isComposing ||
        !['ArrowDown', 'ArrowUp', 'Enter', 'Escape'].includes(event.key)
      )
        return
      event.preventDefault()
      event.stopImmediatePropagation()
      if (event.key === 'Escape') setDismissed(queryKey)
      else if (event.key === 'Enter') {
        if (commands[index]) run(commands[index])
      } else if (commands.length)
        setChoice({
          query: queryKey,
          index:
            (index + (event.key === 'ArrowDown' ? 1 : -1) + commands.length) %
            commands.length,
        })
    }
    element.addEventListener('keydown', onKeyDown, true)
    return () => element.removeEventListener('keydown', onKeyDown, true)
  })
  if (!open) return null
  return (
    <div className="rounded-md border bg-popover text-popover-foreground shadow-md">
      <p
        id={id}
        className="px-3 py-2 text-xs text-muted-foreground"
        role="status"
      >
        Inserir conteúdo: use as setas e Enter. Esc fecha o menu.
      </p>
      <Command
        shouldFilter={false}
        value={commands[index]?.id ?? ''}
        label="Inserir conteúdo"
      >
        <CommandList aria-labelledby={id}>
          <CommandEmpty>Nenhum comando encontrado.</CommandEmpty>
          {commands.map((command) => (
            <CommandItem
              key={command.id}
              value={command.id}
              onMouseDown={(event) => event.preventDefault()}
              onSelect={() => run(command)}
            >
              <command.icon aria-hidden="true" />
              <span>{command.label}</span>
              <span className="ml-auto text-xs text-muted-foreground">
                {command.description}
              </span>
            </CommandItem>
          ))}
        </CommandList>
      </Command>
    </div>
  )
}
