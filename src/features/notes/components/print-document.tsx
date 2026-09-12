import { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import type { Note } from '../types'
import { MarkdownPreview } from './markdown-preview'
import { waitForPrintContent } from '../print-readiness'

export function PrintDocument({
  note,
  onClose,
}: {
  note: Note
  onClose: () => void
}) {
  const articleRef = useRef<HTMLElement>(null)
  useEffect(() => {
    const controller = new AbortController()
    const previousTitle = document.title
    document.title = note.title || 'Documento sem título'
    window.addEventListener('afterprint', onClose, { once: true })
    const frame = requestAnimationFrame(() => {
      const root = articleRef.current
      if (!root) return
      void waitForPrintContent(root, controller.signal)
        .then(() => {
          if (!controller.signal.aborted) window.print()
        })
        .catch(() => {
          if (!controller.signal.aborted) onClose()
        })
    })
    return () => {
      cancelAnimationFrame(frame)
      controller.abort()
      window.removeEventListener('afterprint', onClose)
      document.title = previousTitle
    }
  }, [note, onClose])
  return createPortal(
    <article ref={articleRef} data-print-document className="hidden">
      <h1 className="mb-8 text-3xl font-bold">
        {note.title || 'Documento sem título'}
      </h1>
      <MarkdownPreview content={note.content} />
    </article>,
    document.body,
  )
}
