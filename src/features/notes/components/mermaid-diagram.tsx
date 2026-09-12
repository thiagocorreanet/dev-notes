import { useEffect, useState, useSyncExternalStore } from 'react'
import { ChevronDown, ChevronUp } from 'lucide-react'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import { renderMermaid } from '../mermaid-renderer'

function subscribeTheme(notify: () => void) {
  const observer = new MutationObserver(notify)
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['class'],
  })
  return () => observer.disconnect()
}

function isDark() {
  return document.documentElement.classList.contains('dark')
}

export function MermaidDiagram({ code }: { code: string }) {
  const dark = useSyncExternalStore(subscribeTheme, isDark, () => false)
  // A new rendering session clears obsolete results when code or theme changes.
  return <DiagramSession key={`${dark}:${code}`} code={code} dark={dark} />
}

function DiagramSession({ code, dark }: { code: string; dark: boolean }) {
  const [result, setResult] = useState<
    { image: string } | { error: true } | null
  >(null)
  const [showCode, setShowCode] = useState(false)
  useEffect(() => {
    const controller = new AbortController()
    const styles = getComputedStyle(document.documentElement)
    const color = (name: string) => styles.getPropertyValue(name).trim()
    const timer = setTimeout(() => {
      void renderMermaid(
        code,
        {
          dark,
          background: color('--background'),
          foreground: color('--foreground'),
          surface: color('--muted'),
          border: color('--border'),
          primary: color('--primary'),
          fontFamily: styles.fontFamily,
        },
        controller.signal,
      )
        .then((image) => {
          if (!controller.signal.aborted) setResult({ image })
        })
        .catch(() => {
          if (!controller.signal.aborted) setResult({ error: true })
        })
    }, 150)
    return () => {
      controller.abort()
      clearTimeout(timer)
    }
  }, [code, dark])
  const failed = result !== null && 'error' in result
  return (
    <Collapsible open={failed || showCode} onOpenChange={setShowCode}>
      <figure
        className="min-w-0 rounded-md border"
        data-mermaid-status={
          result === null ? 'pending' : failed ? 'error' : 'ready'
        }
      >
        <figcaption
          data-search-ignore
          className="flex items-center justify-between gap-2 border-b bg-muted px-3 py-2"
        >
          <span className="text-xs font-medium text-muted-foreground">
            Diagrama Mermaid
          </span>
          <CollapsibleTrigger asChild>
            <Button variant="ghost" size="sm" disabled={failed}>
              {showCode || failed ? (
                <ChevronUp aria-hidden="true" />
              ) : (
                <ChevronDown aria-hidden="true" />
              )}
              {failed
                ? 'Código do diagrama'
                : showCode
                  ? 'Ocultar código'
                  : 'Ver código'}
            </Button>
          </CollapsibleTrigger>
        </figcaption>
        {result === null && (
          <p role="status" className="p-4 text-sm text-muted-foreground">
            Renderizando diagrama…
          </p>
        )}
        {result && 'image' in result && (
          <div className="overflow-x-auto p-4">
            <img
              src={result.image}
              alt="Diagrama Mermaid"
              className="mx-auto h-auto max-w-full"
            />
          </div>
        )}
        {failed && (
          <Alert className="m-3 w-auto">
            <AlertDescription>
              Não foi possível renderizar o diagrama. Confira a sintaxe Mermaid
              no código abaixo.
            </AlertDescription>
          </Alert>
        )}
        <CollapsibleContent>
          <pre className="m-0! overflow-x-auto rounded-none! bg-muted p-4">
            <code>{code}</code>
          </pre>
        </CollapsibleContent>
      </figure>
    </Collapsible>
  )
}
