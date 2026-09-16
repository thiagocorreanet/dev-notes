import { useEffect, useRef, useState } from 'react'
import type { PDFDocumentProxy, RenderTask } from 'pdfjs-dist'
import {
  ChevronLeft,
  ChevronRight,
  Minus,
  Plus,
  TriangleAlert,
} from 'lucide-react'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Spinner } from '@/components/ui/spinner'
import { openPdfDocument } from '../pdf-renderer'
import type { OpenedPdfDocument } from '../pdf-renderer'

const MIN_ZOOM = 50
const MAX_ZOOM = 200
const ZOOM_STEP = 25
const BASE_SCALE = 1.25

function pdfError(error: unknown) {
  if (
    error instanceof Error &&
    /password|senha/i.test(`${error.name} ${error.message}`)
  )
    return 'Este PDF exige uma senha e ainda não pode ser aberto no DevNotes.'
  return 'Não foi possível renderizar este PDF. Verifique se o arquivo está íntegro.'
}

export function PdfViewer({
  data,
  title,
}: {
  data: Uint8Array | undefined
  title: string
}) {
  const canvas = useRef<HTMLCanvasElement>(null)
  const [loaded, setLoaded] = useState<{
    source: Uint8Array
    document: PDFDocumentProxy
  } | null>(null)
  const [loadFailure, setLoadFailure] = useState<{
    source: Uint8Array
    message: string
  } | null>(null)
  const [rendered, setRendered] = useState<{
    document: PDFDocumentProxy
    page: number
    zoom: number
    text: string
    error?: string
  } | null>(null)
  const [pageNumber, setPageNumber] = useState(1)
  const [zoom, setZoom] = useState(100)

  useEffect(() => {
    let active = true
    let opened: OpenedPdfDocument | null = null
    if (!data) return
    void openPdfDocument(data)
      .then((pdf) => {
        if (!active) {
          void pdf.destroy()
          return
        }
        opened = pdf
        setLoaded({ source: data, document: pdf.document })
        setLoadFailure(null)
        setPageNumber(1)
      })
      .catch((cause: unknown) => {
        if (active) setLoadFailure({ source: data, message: pdfError(cause) })
      })
    return () => {
      active = false
      if (opened) void opened.destroy()
    }
  }, [data])

  const document = loaded && loaded.source === data ? loaded.document : null

  useEffect(() => {
    if (!document || !canvas.current) return
    let active = true
    let renderTask: RenderTask | undefined
    void document
      .getPage(pageNumber)
      .then(async (page) => {
        if (!active || !canvas.current) return
        const outputScale = Math.min(window.devicePixelRatio || 1, 2)
        const viewport = page.getViewport({
          scale: BASE_SCALE * (zoom / 100),
        })
        const renderViewport = page.getViewport({
          scale: BASE_SCALE * (zoom / 100) * outputScale,
        })
        canvas.current.width = Math.floor(renderViewport.width)
        canvas.current.height = Math.floor(renderViewport.height)
        canvas.current.style.width = `${Math.floor(viewport.width)}px`
        canvas.current.style.height = `${Math.floor(viewport.height)}px`
        renderTask = page.render({
          canvas: canvas.current,
          viewport: renderViewport,
        })
        const text = await page.getTextContent()
        await renderTask.promise
        if (active)
          setRendered({
            document,
            page: pageNumber,
            zoom,
            text: text.items
              .flatMap((item) => ('str' in item ? [item.str] : []))
              .join(' '),
          })
      })
      .catch((cause: unknown) => {
        if (
          !active ||
          (cause instanceof Error &&
            cause.name === 'RenderingCancelledException')
        )
          return
        setRendered({
          document,
          page: pageNumber,
          zoom,
          text: '',
          error: pdfError(cause),
        })
      })
    return () => {
      active = false
      renderTask?.cancel()
    }
  }, [document, pageNumber, zoom])

  const pageCount = document?.numPages ?? 0
  const currentRender =
    rendered?.document === document &&
    rendered.page === pageNumber &&
    rendered.zoom === zoom
      ? rendered
      : null
  const error = data
    ? loadFailure?.source === data
      ? loadFailure.message
      : currentRender?.error
    : 'O conteúdo deste PDF não está mais disponível. Abra o arquivo novamente.'
  const loading = Boolean(data && !error && (!document || !currentRender))
  const pageText = currentRender?.text ?? ''
  const previous = () => setPageNumber((current) => Math.max(1, current - 1))
  const next = () =>
    setPageNumber((current) => Math.min(pageCount, current + 1))
  const zoomOut = () =>
    setZoom((current) => Math.max(MIN_ZOOM, current - ZOOM_STEP))
  const zoomIn = () =>
    setZoom((current) => Math.min(MAX_ZOOM, current + ZOOM_STEP))

  return (
    <section
      aria-label={`Leitor de PDF: ${title}`}
      className="flex min-h-0 flex-1 flex-col bg-muted/30"
    >
      <div className="flex shrink-0 flex-wrap items-center justify-center gap-2 border-b bg-background px-3 py-2">
        <Button
          variant="outline"
          size="icon-sm"
          aria-label="Página anterior"
          disabled={loading || pageNumber <= 1}
          onClick={previous}
        >
          <ChevronLeft aria-hidden="true" />
        </Button>
        <span
          role="status"
          aria-live="polite"
          className="min-w-24 text-center font-mono text-xs text-muted-foreground"
        >
          {pageCount ? `Página ${pageNumber} de ${pageCount}` : 'Carregando…'}
        </span>
        <Button
          variant="outline"
          size="icon-sm"
          aria-label="Próxima página"
          disabled={loading || pageNumber >= pageCount}
          onClick={next}
        >
          <ChevronRight aria-hidden="true" />
        </Button>
        <div className="mx-1 h-5 w-px bg-border" aria-hidden="true" />
        <Button
          variant="outline"
          size="icon-sm"
          aria-label="Diminuir zoom"
          disabled={loading || zoom <= MIN_ZOOM}
          onClick={zoomOut}
        >
          <Minus aria-hidden="true" />
        </Button>
        <span className="min-w-12 text-center font-mono text-xs text-muted-foreground">
          {zoom}%
        </span>
        <Button
          variant="outline"
          size="icon-sm"
          aria-label="Aumentar zoom"
          disabled={loading || zoom >= MAX_ZOOM}
          onClick={zoomIn}
        >
          <Plus aria-hidden="true" />
        </Button>
      </div>
      {error ? (
        <div className="mx-auto w-full max-w-2xl p-6">
          <Alert variant="destructive">
            <TriangleAlert aria-hidden="true" />
            <AlertTitle>PDF indisponível</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        </div>
      ) : (
        <div className="relative min-h-0 flex-1 overflow-auto p-4 sm:p-6">
          {loading && (
            <div
              className="absolute inset-x-0 top-6 z-10 flex items-center justify-center gap-2 text-sm text-muted-foreground"
              role="status"
            >
              <Spinner aria-hidden="true" />
              Renderizando PDF…
            </div>
          )}
          <canvas
            ref={canvas}
            aria-hidden="true"
            className="mx-auto max-w-none bg-white shadow-sm ring-1 ring-border"
          />
          <div className="sr-only" aria-label={`Texto da página ${pageNumber}`}>
            {pageText}
          </div>
        </div>
      )}
    </section>
  )
}
