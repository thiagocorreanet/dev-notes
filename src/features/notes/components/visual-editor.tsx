import { EditorInsertTools } from './editor-insert-tools'
import { readImageFile } from '../image-files'
import { WorkspaceError } from '../workspace-error'
import { useEffect, useMemo, useRef, useState } from 'react'
import { EditorContent, useEditor, useEditorState } from '@tiptap/react'
import type { JSONContent } from '@tiptap/core'
import {
  Bold,
  Italic,
  Strikethrough,
  Code,
  Heading1,
  Heading2,
  List,
  ListOrdered,
  ListChecks,
  Quote,
  SquareCode,
  Undo2,
  Redo2,
  Table2,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Alert, AlertDescription } from '@/components/ui/alert'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { prepareVisualMarkdown, visualExtensions } from '../visual-markdown'

interface VisualEditorProps {
  content: string
  onChange: (content: string) => void
  disabled: boolean
  onSource: () => void
}

export function VisualEditor(props: VisualEditorProps) {
  const document = useMemo(
    () => prepareVisualMarkdown(props.content),
    [props.content],
  )
  if (!document) {
    return (
      <Alert>
        <AlertDescription>
          <p>
            Este documento tem uma formatação que o editor visual não consegue
            preservar. Edite em Markdown para manter o conteúdo intacto.
          </p>
          <Button variant="outline" onClick={props.onSource}>
            Editar em Markdown
          </Button>
        </AlertDescription>
      </Alert>
    )
  }
  return <EditableDocument {...props} document={document} />
}

function EditableDocument({
  content,
  document,
  onChange,
  disabled,
}: VisualEditorProps & { document: JSONContent }) {
  const lastContent = useRef(content)
  const [pasteError, setPasteError] = useState('')
  const editor = useEditor({
    extensions: visualExtensions,
    content: document,
    editable: !disabled,
    editorProps: {
      handlePaste: (view, event) => {
        const file = Array.from(event.clipboardData?.files ?? []).find((file) =>
          file.type.startsWith('image/'),
        )
        if (!file) return false
        event.preventDefault()
        if (
          view.state.selection.$from.parent.type.name === 'codeBlock' ||
          view.state.selection.$from.depth > 1
        ) {
          setPasteError(
            'Cole a imagem em um parágrafo fora de tabelas, listas e blocos de código.',
          )
          return true
        }
        setPasteError('')
        void readImageFile(file)
          .then((src) => {
            if (!view.isDestroyed)
              view.dispatch(
                view.state.tr
                  .replaceSelectionWith(
                    view.state.schema.nodes.image!.create({
                      src,
                      alt: file.name || 'Imagem colada',
                    }),
                  )
                  .scrollIntoView(),
              )
          })
          .catch((error: unknown) =>
            setPasteError(
              error instanceof WorkspaceError
                ? error.message
                : 'Não foi possível colar a imagem.',
            ),
          )
        return true
      },
      handleDOMEvents: {
        keydown: (_view, event) => {
          // Keep the editor's bold shortcut from toggling the global sidebar.
          if (
            (event.ctrlKey || event.metaKey) &&
            event.key.toLowerCase() === 'b'
          )
            event.stopPropagation()
          return false
        },
      },
      attributes: {
        role: 'textbox',
        'aria-label': 'Conteúdo do documento',
        'aria-multiline': 'true',
        class:
          'visual-document min-h-96 w-full rounded-md border border-input px-4 py-4 text-base leading-6 outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]',
      },
    },
    onUpdate: ({ editor: current }) => {
      const markdown = current.getMarkdown()
      lastContent.current = markdown
      onChange(markdown)
    },
  })
  useEffect(() => {
    editor?.setEditable(!disabled, false)
  }, [editor, disabled])
  useEffect(() => {
    if (editor && lastContent.current !== content) {
      editor.commands.setContent(document, { emitUpdate: false })
      lastContent.current = content
    }
  }, [editor, content, document])
  const state = useEditorState({
    editor,
    selector: ({ editor: current }) =>
      current
        ? {
            bold: current.isActive('bold'),
            italic: current.isActive('italic'),
            strike: current.isActive('strike'),
            code: current.isActive('code'),
            heading1: current.isActive('heading', { level: 1 }),
            heading2: current.isActive('heading', { level: 2 }),
            bulletList: current.isActive('bulletList'),
            orderedList: current.isActive('orderedList'),
            taskList: current.isActive('taskList'),
            blockquote: current.isActive('blockquote'),
            codeBlock: current.isActive('codeBlock'),
            table: current.isActive('table'),
            undo: current.can().undo(),
            redo: current.can().redo(),
          }
        : null,
  })
  if (!editor || !state) return null
  const commands: {
    label: string
    icon: LucideIcon
    active?: boolean
    disabled?: boolean
    run: () => boolean
  }[] = [
    {
      label: 'Desfazer',
      icon: Undo2,
      disabled: !state.undo,
      run: () => editor.chain().focus().undo().run(),
    },
    {
      label: 'Refazer',
      icon: Redo2,
      disabled: !state.redo,
      run: () => editor.chain().focus().redo().run(),
    },
    {
      label: 'Negrito',
      icon: Bold,
      active: state.bold,
      run: () => editor.chain().focus().toggleBold().run(),
    },
    {
      label: 'Itálico',
      icon: Italic,
      active: state.italic,
      run: () => editor.chain().focus().toggleItalic().run(),
    },
    {
      label: 'Tachado',
      icon: Strikethrough,
      active: state.strike,
      run: () => editor.chain().focus().toggleStrike().run(),
    },
    {
      label: 'Código em linha',
      icon: Code,
      active: state.code,
      run: () => editor.chain().focus().toggleCode().run(),
    },
    {
      label: 'Título de nível 1',
      icon: Heading1,
      active: state.heading1,
      disabled: state.table,
      run: () => editor.chain().focus().toggleHeading({ level: 1 }).run(),
    },
    {
      label: 'Título de nível 2',
      icon: Heading2,
      active: state.heading2,
      disabled: state.table,
      run: () => editor.chain().focus().toggleHeading({ level: 2 }).run(),
    },
    {
      label: 'Lista com marcadores',
      icon: List,
      active: state.bulletList,
      disabled: state.table,
      run: () => editor.chain().focus().toggleBulletList().run(),
    },
    {
      label: 'Lista numerada',
      icon: ListOrdered,
      active: state.orderedList,
      disabled: state.table,
      run: () => editor.chain().focus().toggleOrderedList().run(),
    },
    {
      label: 'Lista de tarefas',
      icon: ListChecks,
      active: state.taskList,
      disabled: state.table,
      run: () => editor.chain().focus().toggleTaskList().run(),
    },
    {
      label: 'Citação',
      icon: Quote,
      active: state.blockquote,
      disabled: state.table,
      run: () => editor.chain().focus().toggleBlockquote().run(),
    },
    {
      label: 'Bloco de código',
      icon: SquareCode,
      active: state.codeBlock,
      disabled: state.table,
      run: () => editor.chain().focus().toggleCodeBlock().run(),
    },
    {
      label: 'Inserir tabela',
      icon: Table2,
      disabled: state.table,
      run: () =>
        editor
          .chain()
          .focus()
          .insertTable({ rows: 3, cols: 3, withHeaderRow: true })
          .run(),
    },
  ]
  return (
    <div className="min-w-0 space-y-3">
      <div
        role="group"
        aria-label="Formatação do texto"
        className="flex flex-wrap gap-1"
      >
        {commands.map(
          ({ label, icon: Icon, active, disabled: unavailable, run }) => (
            <Tooltip key={label}>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  variant={active ? 'secondary' : 'ghost'}
                  size="icon-sm"
                  aria-label={label}
                  aria-pressed={active}
                  disabled={disabled || unavailable}
                  onClick={run}
                >
                  <Icon aria-hidden="true" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>{label}</TooltipContent>
            </Tooltip>
          ),
        )}
      </div>
      {state.table && (
        <div
          role="group"
          aria-label="Edição da tabela"
          className="flex flex-wrap gap-2"
        >
          <Button
            variant="outline"
            size="sm"
            disabled={disabled}
            onClick={() => editor.chain().focus().addRowAfter().run()}
          >
            Adicionar linha
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={disabled}
            onClick={() => editor.chain().focus().addColumnAfter().run()}
          >
            Adicionar coluna
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={disabled || editor.isActive('tableHeader')}
            onClick={() => editor.chain().focus().deleteRow().run()}
          >
            Excluir linha
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={disabled}
            onClick={() => editor.chain().focus().deleteColumn().run()}
          >
            Excluir coluna
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={disabled}
            onClick={() => editor.chain().focus().deleteTable().run()}
          >
            Excluir tabela
          </Button>
        </div>
      )}
      <EditorInsertTools editor={editor} disabled={disabled} />
      {pasteError && (
        <Alert variant="destructive">
          <AlertDescription>{pasteError}</AlertDescription>
        </Alert>
      )}
      <EditorContent editor={editor} />
      <p className="text-xs text-muted-foreground">
        Selecione o texto para formatar. Use Tab para passar de uma célula a
        outra na tabela.
      </p>
    </div>
  )
}
