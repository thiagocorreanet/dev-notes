import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
import type { PDFDocumentProxy } from 'pdfjs-dist'

export interface OpenedPdfDocument {
  document: PDFDocumentProxy
  destroy: () => Promise<void>
}

export async function openPdfDocument(
  data: Uint8Array,
): Promise<OpenedPdfDocument> {
  const pdfjs = await import('pdfjs-dist')
  pdfjs.GlobalWorkerOptions.workerSrc = workerUrl
  const task = pdfjs.getDocument({ data: data.slice() })
  const document = await task.promise
  return { document, destroy: () => task.destroy() }
}
