import { createElement, useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import type { RootContent } from 'hast'
import { NodeViewContent, NodeViewWrapper } from '@tiptap/react'
import type { NodeViewProps } from '@tiptap/react'
import { Copy, Check } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { codeLanguages, lowlight } from '../code-highlighting'
import { MermaidDiagram } from './mermaid-diagram'

function CopyCode({ code }: { code: string }) {
  const [status, setStatus] = useState('')
  const resetTimer = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  )
  useEffect(() => () => clearTimeout(resetTimer.current), [])
  return (
    <div className="flex items-center gap-2">
      <span role="status" className="text-xs text-muted-foreground">
        {status}
      </span>
      <Button
        variant="ghost"
        size="icon-xs"
        aria-label="Copiar código"
        onClick={() => {
          clearTimeout(resetTimer.current)
          setStatus('')
          void navigator.clipboard
            ?.writeText(code)
            .then(() => {
              setStatus('Copiado')
              resetTimer.current = setTimeout(() => setStatus(''), 2200)
            })
            .catch(() =>
              setStatus(
                'Não foi possível copiar. Selecione o código para copiá-lo.',
              ),
            )
          if (!navigator.clipboard)
            setStatus('Selecione o código para copiá-lo.')
        }}
      >
        {status === 'Copiado' ? (
          <Check
            aria-hidden="true"
            className="animate-in duration-150 zoom-in-75 motion-reduce:animate-none"
          />
        ) : (
          <Copy aria-hidden="true" />
        )}
      </Button>
    </div>
  )
}

function renderSyntax(node: RootContent, index: number): ReactNode {
  if (node.type === 'text') return node.value
  if (node.type === 'element')
    return createElement(
      'span',
      {
        key: index,
        className: Array.isArray(node.properties.className)
          ? node.properties.className.join(' ')
          : undefined,
      },
      node.children.map(renderSyntax),
    )
  return null
}

export function CodeBlock({
  code,
  language,
}: {
  code: string
  language: string
}) {
  let children: ReactNode = code
  if (code.length < 100_000) {
    if (!language || language === 'auto')
      children = lowlight.highlightAuto(code).children.map(renderSyntax)
    else if (lowlight.registered(language))
      children = lowlight.highlight(language, code).children.map(renderSyntax)
  }
  return (
    <div className="overflow-hidden rounded-md border">
      <div
        data-search-ignore
        className="flex items-center justify-between gap-2 border-b bg-muted px-3 py-1"
      >
        <span className="font-mono text-xs text-muted-foreground">
          {codeLanguages.find(([id]) => id === language)?.[1] ??
            (language || 'Detectar linguagem')}
        </span>
        <CopyCode code={code} />
      </div>
      <pre className="m-0! rounded-none! bg-muted p-4">
        <code className={`syntax-highlight language-${language}`}>
          {children}
        </code>
      </pre>
    </div>
  )
}

export function CodeBlockView({
  node,
  updateAttributes,
  editor,
}: NodeViewProps) {
  const language =
    typeof node.attrs.language === 'string' ? node.attrs.language : 'auto'
  return (
    <NodeViewWrapper
      spellCheck={false}
      className="my-4 overflow-hidden rounded-md border"
    >
      <div
        contentEditable={false}
        className="flex flex-wrap items-center justify-between gap-2 border-b bg-muted px-3 py-1"
      >
        <Select
          value={language}
          onValueChange={(value) =>
            updateAttributes({ language: value === 'auto' ? null : value })
          }
          disabled={!editor.isEditable}
        >
          <SelectTrigger className="w-40" aria-label="Linguagem do código">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {!codeLanguages.some(([id]) => id === language) && (
              <SelectItem value={language}>{language}</SelectItem>
            )}
            {codeLanguages.map(([id, label]) => (
              <SelectItem key={id} value={id}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <CopyCode code={node.textContent} />
      </div>
      <pre className="m-0! rounded-none! bg-muted p-4">
        <NodeViewContent<'code'> as="code" className="syntax-highlight" />
      </pre>
      {language.toLowerCase() === 'mermaid' && (
        <div contentEditable={false}>
          <MermaidDiagram code={node.textContent} />
        </div>
      )}
    </NodeViewWrapper>
  )
}
