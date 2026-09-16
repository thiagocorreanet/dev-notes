import { WorkspaceError } from './workspace-error'

export const MAX_PDF_BYTES = 50 * 1024 * 1024
const PDF_EXTENSION = /\.pdf$/i

export interface PdfFileData {
  data: Uint8Array
  title: string
}

export function isPdfFilename(name: string) {
  return PDF_EXTENSION.test(name)
}

export function pdfTitle(name: string) {
  return name.replace(PDF_EXTENSION, '').trim() || 'Documento PDF'
}

export async function readPdfFile(file: File): Promise<PdfFileData> {
  if (!isPdfFilename(file.name))
    throw new WorkspaceError('Selecione um arquivo PDF (.pdf).')
  if (file.size > MAX_PDF_BYTES)
    throw new WorkspaceError(
      `O arquivo "${file.name}" ultrapassa o limite de 50 MB.`,
    )
  const data = new Uint8Array(await file.arrayBuffer())
  const header = new TextDecoder('latin1').decode(data.subarray(0, 1024))
  if (!header.includes('%PDF-'))
    throw new WorkspaceError(`O arquivo "${file.name}" não é um PDF válido.`)
  return { title: pdfTitle(file.name), data }
}

export function pdfFilename(title: string) {
  return `${
    title
      .replace(/[^a-zA-Z0-9_-]/g, '-')
      .replace(/-+/g, '-')
      .slice(0, 100) || 'documento'
  }.pdf`
}
