import { test as base, expect } from '@playwright/test'
import { mkdtemp, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { startLocalServer } from '../../scripts/local/server.ts'

interface LocalFile {
  path: string
  original: string
  url: string
}

export const test = base.extend<{ localFile: LocalFile }>({
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
})
export { expect }
