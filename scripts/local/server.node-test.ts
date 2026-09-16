import assert from 'node:assert/strict'
import { get } from 'node:http'
import {
  mkdtemp,
  mkdir,
  readFile,
  writeFile,
  rm,
  stat,
  symlink,
  truncate,
} from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import type { TestContext } from 'node:test'
import { startLocalServer } from './server.ts'
import type { CodexChatRequest, CodexService } from './codex-service.ts'

interface DocumentResponse {
  path: string
  raw: string
  version: string
}

async function fixture(t: TestContext, codex?: CodexService) {
  const directory = await mkdtemp(join(tmpdir(), 'devnotes-local-test-'))
  const dist = join(directory, 'dist')
  await mkdir(dist)
  await writeFile(join(dist, 'index.html'), '<html>DevNotes</html>')
  await writeFile(join(dist, 'pdf.worker.mjs'), 'export default true')
  const path = join(directory, 'a space & ação #1.md')
  await writeFile(path, '# Guide\r\n\r\nOriginal\r\n', { mode: 0o640 })
  const pdfPath = join(directory, 'architecture ação.pdf')
  const pdfBytes = Buffer.from('%PDF-1.7\n1 0 obj\n<<>>\nendobj\n%%EOF')
  await writeFile(pdfPath, pdfBytes)
  const service = await startLocalServer({
    dist,
    ...(codex ? { codex } : {}),
  })
  t.after(async () => {
    await new Promise<void>((resolve) => {
      service.server.close(() => resolve())
      service.server.closeAllConnections()
    })
    await rm(directory, { recursive: true, force: true })
  })
  const endpoint = (file = path) =>
    `${service.origin}/api/document?${new URLSearchParams({ file }).toString()}`
  const pdfEndpoint = (file = pdfPath) =>
    `${service.origin}/api/pdf?${new URLSearchParams({ file }).toString()}`
  const launch = async (file = path) => {
    const response = await fetch(`${service.origin}/api/launch`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${service.token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ file }),
    })
    assert.equal(response.status, 200)
    const { url } = (await response.json()) as { url: string }
    const entry = await fetch(url, { redirect: 'manual' })
    assert.equal(entry.status, 303)
    const cookie = entry.headers.get('set-cookie')!.split(';')[0]!
    return { cookie, url, location: entry.headers.get('location')! }
  }
  const save = (cookie: string, version: string, raw: string) =>
    fetch(endpoint(), {
      method: 'PUT',
      headers: {
        Cookie: cookie,
        Origin: service.origin,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ version, raw }),
    })
  return {
    ...service,
    directory,
    path,
    pdfPath,
    pdfBytes,
    endpoint,
    pdfEndpoint,
    launch,
    save,
  }
}

void test('keeps Codex access local, session-bound, and explicit about document context', async (t) => {
  const chats: CodexChatRequest[] = []
  let closed = false
  const codex: CodexService = {
    status() {
      return Promise.resolve({
        available: true,
        state: 'connected',
        email: 'writer@example.com',
        plan: 'pro',
        model: 'Padrão do Codex',
        primary: { usedPercent: 14, resetsAt: null },
        secondary: null,
      })
    },
    loginWithChatGPT() {
      return Promise.resolve({ authUrl: 'https://chatgpt.com/auth/codex' })
    },
    chat(request) {
      chats.push(request)
      return Promise.resolve({
        threadId: request.threadId ?? 'thread-1',
        message: 'Ready.',
        proposedMarkdown: null,
        proposalSummary: null,
      })
    },
    close() {
      closed = true
      return Promise.resolve()
    },
  }
  const f = await fixture(t, codex)
  const first = await f.launch()
  const headers = { Cookie: first.cookie }
  const status = await fetch(`${f.origin}/api/codex/status`, { headers })
  assert.equal(status.status, 200)
  assert.equal(((await status.json()) as { plan: string }).plan, 'pro')

  assert.equal(
    (
      await fetch(`${f.origin}/api/codex/login`, {
        method: 'POST',
        headers: {
          ...headers,
          Origin: f.origin,
          'Content-Type': 'application/json',
        },
        body: '{}',
      })
    ).status,
    200,
  )
  const chat = await fetch(`${f.origin}/api/codex/chat`, {
    method: 'POST',
    headers: {
      ...headers,
      Origin: f.origin,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      message: 'Review this.',
      document: { title: 'Guide', content: '# Private' },
    }),
  })
  assert.equal(chat.status, 200)
  assert.deepEqual(
    chats.map(({ message, threadId, document }) => ({
      message,
      threadId,
      document,
    })),
    [
      {
        message: 'Review this.',
        threadId: undefined,
        document: { title: 'Guide', content: '# Private' },
      },
    ],
  )

  const second = await f.launch()
  assert.equal(
    (
      await fetch(`${f.origin}/api/codex/chat`, {
        method: 'POST',
        headers: {
          Cookie: second.cookie,
          Origin: f.origin,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          threadId: 'thread-1',
          message: 'Continue.',
        }),
      })
    ).status,
    403,
  )
  assert.equal(
    (
      await fetch(`${f.origin}/api/codex/chat`, {
        method: 'POST',
        headers: {
          ...headers,
          Origin: 'https://example.com',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ message: 'Blocked.' }),
      })
    ).status,
    403,
  )

  await new Promise<void>((resolve) => f.server.close(() => resolve()))
  await new Promise((resolve) => setImmediate(resolve))
  assert.equal(closed, true)
})

void test('launches with the requested URL, reads and saves the original, and preserves no-op bytes and permissions', async (t) => {
  const f = await fixture(t)
  const { cookie, location } = await f.launch()
  const url = new URL(location)
  assert.equal(url.pathname, '/')
  assert.equal(url.searchParams.get('ws'), '1')
  assert.equal(url.searchParams.get('file'), f.path)
  assert.equal([...url.searchParams].length, 2)
  assert.match(await (await fetch(location)).text(), /DevNotes/)
  assert.match(
    (await fetch(`${f.origin}/pdf.worker.mjs`)).headers.get('content-type') ??
      '',
    /^text\/javascript/,
  )
  const document = (await (
    await fetch(f.endpoint(), { headers: { Cookie: cookie } })
  ).json()) as DocumentResponse
  assert.equal(document.raw, '# Guide\r\n\r\nOriginal\r\n')
  assert.equal(
    (await f.save(cookie, document.version, document.raw)).status,
    200,
  )
  assert.equal(await readFile(f.path, 'utf8'), document.raw)
  const changed = '# Guide\r\n\r\nSaved on disk\r\n'
  assert.equal((await f.save(cookie, document.version, changed)).status, 200)
  assert.equal(await readFile(f.path, 'utf8'), changed)
  assert.equal((await stat(f.path)).mode & 0o777, 0o640)
})

void test('authorizes and serves PDFs as read-only binary documents', async (t) => {
  const f = await fixture(t)
  const { cookie, location } = await f.launch(f.pdfPath)
  assert.equal(new URL(location).searchParams.get('file'), f.pdfPath)
  const response = await fetch(f.pdfEndpoint(), {
    headers: { Cookie: cookie },
  })
  assert.equal(response.status, 200)
  assert.equal(response.headers.get('content-type'), 'application/pdf')
  assert.equal(
    decodeURIComponent(response.headers.get('x-devnotes-file-name')!),
    'architecture ação.pdf',
  )
  assert.deepEqual(Buffer.from(await response.arrayBuffer()), f.pdfBytes)
  assert.equal(
    (
      await fetch(f.pdfEndpoint(), {
        method: 'PUT',
        headers: { Cookie: cookie, Origin: f.origin },
      })
    ).status,
    404,
  )
})

void test('rejects invalid and oversized PDFs before creating a launch ticket', async (t) => {
  const f = await fixture(t)
  const invalid = join(f.directory, 'invalid.pdf')
  await writeFile(invalid, 'not a pdf')
  const oversized = join(f.directory, 'oversized.pdf')
  await writeFile(oversized, '%PDF-1.7')
  await truncate(oversized, 50 * 1024 * 1024 + 1)
  const launchStatus = async (file: string) =>
    (
      await fetch(`${f.origin}/api/launch`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${f.token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ file }),
      })
    ).status
  assert.equal(await launchStatus(invalid), 415)
  assert.equal(await launchStatus(oversized), 413)
})

void test('blocks unauthenticated, cross-origin, unknown-path, and reused-ticket access', async (t) => {
  const f = await fixture(t)
  assert.equal((await fetch(f.endpoint())).status, 401)
  assert.equal(
    (
      await fetch(`${f.origin}/api/launch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ file: f.path }),
      })
    ).status,
    401,
  )
  const { cookie, url } = await f.launch()
  assert.equal((await fetch(url, { redirect: 'manual' })).status, 401)
  const headers = { Cookie: cookie, Origin: 'https://example.com' }
  assert.equal((await fetch(f.endpoint(), { headers })).status, 403)
  const invalidHostStatus = await new Promise<number | undefined>(
    (resolve, reject) => {
      get(
        f.endpoint(),
        { headers: { Cookie: cookie, Host: 'evil.example' } },
        (response) => {
          response.resume()
          resolve(response.statusCode)
        },
      ).on('error', reject)
    },
  )
  assert.equal(invalidHostStatus, 403)
  const other = join(f.directory, 'private.md')
  await writeFile(other, 'Private')
  assert.equal(
    (await fetch(f.endpoint(other), { headers: { Cookie: cookie } })).status,
    403,
  )
  assert.equal(
    (
      await fetch(f.endpoint(), {
        method: 'PUT',
        headers: { Cookie: cookie, 'Content-Type': 'application/json' },
        body: '{}',
      })
    ).status,
    403,
  )
  assert.equal((await fetch(`${f.origin}/%2e%2e%2fprivate.md`)).status, 403)
})

void test('rejects external changes and serializes competing saves without overwriting the winner', async (t) => {
  const f = await fixture(t)
  const { cookie } = await f.launch()
  const read = async () =>
    (await (
      await fetch(f.endpoint(), { headers: { Cookie: cookie } })
    ).json()) as DocumentResponse
  const original = await read()
  await writeFile(f.path, 'External')
  assert.equal(
    (await f.save(cookie, original.version, 'Unsaved draft')).status,
    409,
  )
  assert.equal(await readFile(f.path, 'utf8'), 'External')
  const disk = await read()
  const responses = await Promise.all([
    f.save(cookie, disk.version, 'First'),
    f.save(cookie, disk.version, 'Second'),
  ])
  assert.deepEqual(
    responses.map((response) => response.status).sort(),
    [200, 409],
  )
  assert.ok(['First', 'Second'].includes(await readFile(f.path, 'utf8')))
})

void test('refuses oversized and invalid UTF-8 files and changed symlink targets', async (t) => {
  const f = await fixture(t)
  const { cookie } = await f.launch()
  const original = (await (
    await fetch(f.endpoint(), { headers: { Cookie: cookie } })
  ).json()) as DocumentResponse
  assert.equal(
    (await f.save(cookie, original.version, 'x'.repeat(2 * 1024 * 1024 + 1)))
      .status,
    413,
  )
  await writeFile(f.path, Buffer.from([0xff, 0xfe]))
  assert.equal(
    (await fetch(f.endpoint(), { headers: { Cookie: cookie } })).status,
    415,
  )
  const other = join(f.directory, 'other.md')
  await writeFile(other, 'Private')
  await rm(f.path)
  await symlink(other, f.path)
  assert.equal(
    (await fetch(f.endpoint(), { headers: { Cookie: cookie } })).status,
    403,
  )
  assert.equal(await readFile(other, 'utf8'), 'Private')
})
