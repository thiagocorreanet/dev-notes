import { useEffect, useRef, useState } from 'react'
import { FileUp } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'

export function MarkdownDropZone({
  busy,
  onFiles,
}: {
  busy: boolean
  onFiles: (files: File[]) => Promise<void>
}) {
  const [dragging, setDragging] = useState(false)
  const depth = useRef(0)
  useEffect(() => {
    const isFileDrag = (event: DragEvent) =>
      event.dataTransfer?.types.includes('Files')
    const enter = (event: DragEvent) => {
      if (!isFileDrag(event)) return
      event.preventDefault()
      depth.current++
      setDragging(true)
    }
    const over = (event: DragEvent) => {
      if (!isFileDrag(event)) return
      event.preventDefault()
      if (event.dataTransfer)
        event.dataTransfer.dropEffect = busy ? 'none' : 'copy'
    }
    const leave = (event: DragEvent) => {
      if (!isFileDrag(event)) return
      depth.current = Math.max(0, depth.current - 1)
      if (!depth.current) setDragging(false)
    }
    const reset = () => {
      depth.current = 0
      setDragging(false)
    }
    const drop = (event: DragEvent) => {
      if (!isFileDrag(event)) return
      event.preventDefault()
      event.stopPropagation()
      reset()
      if (!busy) void onFiles(Array.from(event.dataTransfer?.files ?? []))
    }
    window.addEventListener('dragenter', enter, true)
    window.addEventListener('dragover', over, true)
    window.addEventListener('dragleave', leave, true)
    window.addEventListener('drop', drop, true)
    window.addEventListener('dragend', reset)
    window.addEventListener('blur', reset)
    return () => {
      window.removeEventListener('dragenter', enter, true)
      window.removeEventListener('dragover', over, true)
      window.removeEventListener('dragleave', leave, true)
      window.removeEventListener('drop', drop, true)
      window.removeEventListener('dragend', reset)
      window.removeEventListener('blur', reset)
    }
  }, [busy, onFiles])
  if (!dragging) return null
  return (
    <div
      className="pointer-events-none fixed inset-0 z-50 grid place-items-center bg-background/80 p-6"
      role="status"
    >
      <Card className="w-full max-w-md border-dashed">
        <CardContent className="flex flex-col items-center gap-3 py-8 text-center">
          <FileUp aria-hidden="true" className="size-8 text-primary" />
          <p className="font-medium">
            {busy ? 'Aguarde a operação terminar' : 'Solte os documentos aqui'}
          </p>
          <p className="text-sm text-muted-foreground">
            Markdown abre como cópia; PDF abre somente para leitura. Os
            originais não serão alterados.
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
