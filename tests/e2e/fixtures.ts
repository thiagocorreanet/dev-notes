import { test as base, expect } from '@playwright/test'
import { mkdir, mkdtemp, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { startLocalServer } from '../../scripts/local/server.ts'

interface LocalFile {
  path: string
  original: string
  url: string
}

interface LocalPdf {
  path: string
  url: string
}

interface LocalWorkspace {
  root: string
  url: string
}

function createPdf() {
  const stream =
    'BT\n/F1 24 Tf\n72 720 Td\n(DevNotes PDF browser test) Tj\nET\n'
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>',
    `<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}endstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ]
  let body = '%PDF-1.4\n'
  const offsets = objects.map((object, index) => {
    const offset = Buffer.byteLength(body)
    body += `${index + 1} 0 obj\n${object}\nendobj\n`
    return offset
  })
  const xrefOffset = Buffer.byteLength(body)
  body += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`
  body += offsets
    .map((offset) => `${String(offset).padStart(10, '0')} 00000 n \n`)
    .join('')
  body += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`
  return Buffer.from(body)
}

export const test = base.extend<{
  localFile: LocalFile
  localPdf: LocalPdf
  localWorkspace: LocalWorkspace
}>({
  localWorkspace: async ({ browserName }, provide) => {
    const directory = await mkdtemp(
      join(tmpdir(), `devnotes-workspace-${browserName}-`),
    )
    const root = join(directory, 'Notas')
    await mkdir(join(root, 'Clientes', 'Acme'), { recursive: true })
    await writeFile(
      join(root, 'Clientes', 'Acme', 'Contrato.md'),
      '# Contrato Acme\n\nAssinado em setembro.\n',
    )
    await writeFile(join(root, 'Clientes', 'logo.png'), 'png')
    await writeFile(
      join(root, 'Leia-me.md'),
      '# Leia-me\n\nPrimeiros passos.\n',
    )
    const service = await startLocalServer({ dist: resolve('dist') })
    try {
      const response = await fetch(`${service.origin}/api/launch`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${service.token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ workspace: root }),
      })
      expect(response.ok).toBe(true)
      const launch = (await response.json()) as { url: string }
      await provide({ root, url: launch.url })
    } finally {
      await new Promise<void>((done) => {
        service.server.close(() => done())
        service.server.closeAllConnections()
      })
      await rm(directory, { recursive: true, force: true })
    }
  },
  localFile: async ({ browserName }, provide) => {
    const directory = await mkdtemp(join(tmpdir(), `devnotes-${browserName}-`))
    const path = join(directory, 'a space & ação #1.md')
    const original =
      '# Browser guide\n\n' +
      Array.from(
        { length: 25 },
        (_, i) =>
          `## Section ${i + 1}\n\n${'A reproducible note for browser navigation. '.repeat(20)}\n\n`,
      ).join('')
    const service = await startLocalServer({ dist: resolve('dist') })
    try {
      await writeFile(path, original)
      const response = await fetch(`${service.origin}/api/launch`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${service.token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ file: path }),
      })
      expect(response.ok).toBe(true)
      const launch = (await response.json()) as { url: string }
      await provide({ path, original, url: launch.url })
    } finally {
      await new Promise<void>((done) => {
        service.server.close(() => done())
        service.server.closeAllConnections()
      })
      await rm(directory, { recursive: true, force: true })
    }
  },
  localPdf: async ({ browserName }, provide) => {
    const directory = await mkdtemp(
      join(tmpdir(), `devnotes-pdf-${browserName}-`),
    )
    const path = join(directory, 'PDF de referência.pdf')
    const service = await startLocalServer({ dist: resolve('dist') })
    try {
      await writeFile(path, createPdf())
      const response = await fetch(`${service.origin}/api/launch`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${service.token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ file: path }),
      })
      expect(response.ok).toBe(true)
      const launch = (await response.json()) as { url: string }
      await provide({ path, url: launch.url })
    } finally {
      await new Promise<void>((done) => {
        service.server.close(() => done())
        service.server.closeAllConnections()
      })
      await rm(directory, { recursive: true, force: true })
    }
  },
})
export { expect }
