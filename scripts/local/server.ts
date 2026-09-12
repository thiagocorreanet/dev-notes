import { createHash, randomBytes } from 'node:crypto'
import { createServer } from 'node:http'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { constants } from 'node:fs'
import {
  open,
  readFile,
  realpath,
  rename,
  rm,
  stat,
  chmod,
} from 'node:fs/promises'
import { basename, dirname, extname, join, resolve, sep } from 'node:path'

const MAX_BYTES = 2 * 1024 * 1024
const digest = (raw: string) => createHash('sha256').update(raw).digest('hex')
const secret = () => randomBytes(32).toString('hex')

class HttpError extends Error {
  readonly status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

async function jsonBody(
  request: IncomingMessage,
): Promise<Record<string, unknown>> {
  if (!request.headers['content-type']?.startsWith('application/json'))
    throw new HttpError(415, 'Expected JSON.')
  const chunks: Buffer[] = []
  let size = 0
  for await (const chunk of request) {
    const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as string)
    size += bytes.length
    if (size > MAX_BYTES * 6 + 4096)
      throw new HttpError(413, 'Document is too large.')
    chunks.push(bytes)
  }
  try {
    const value: unknown = JSON.parse(Buffer.concat(chunks).toString('utf8'))
    if (!value || typeof value !== 'object' || Array.isArray(value))
      throw new Error()
    return value as Record<string, unknown>
  } catch {
    throw new HttpError(400, 'Invalid JSON.')
  }
}

async function readDocument(path: string) {
  const handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW)
  try {
    const info = await handle.stat()
    if (!info.isFile())
      throw new HttpError(400, 'Expected a regular Markdown file.')
    if (info.size > MAX_BYTES)
      throw new HttpError(413, 'Document exceeds 2 MB.')
    const bytes = await handle.readFile()
    if (bytes.length > MAX_BYTES)
      throw new HttpError(413, 'Document exceeds 2 MB.')
    let raw: string
    try {
      raw = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(
        bytes,
      )
    } catch {
      throw new HttpError(415, 'Document must use UTF-8.')
    }
    return { path, name: basename(path), raw, version: digest(raw) }
  } finally {
    await handle.close()
  }
}

export async function startLocalServer(options: {
  dist: string
  port?: number
  token?: string
}) {
  const token = options.token ?? secret()
  const allowed = new Set<string>()
  const tickets = new Map<string, { path?: string; expires: number }>()
  const sessions = new Set<string>()
  const writes = new Map<string, Promise<unknown>>()
  const dist = await realpath(options.dist)
  const cookieName = `devnotes_${secret().slice(0, 12)}`
  let origin = ''

  async function authorizePath(path: string) {
    if (!/\.(md|markdown)$/i.test(path))
      throw new HttpError(400, 'Expected a .md or .markdown file.')
    const canonical = await realpath(resolve(path))
    await readDocument(canonical)
    allowed.add(canonical)
    return canonical
  }

  async function route(request: IncomingMessage, response: ServerResponse) {
    response.setHeader('Cache-Control', 'no-store')
    response.setHeader('X-Content-Type-Options', 'nosniff')
    response.setHeader('Referrer-Policy', 'no-referrer')
    response.setHeader('X-Frame-Options', 'DENY')
    if (request.headers.host !== new URL(origin).host)
      throw new HttpError(403, 'Invalid host.')
    const url = new URL(request.url ?? '/', origin)
    const method = request.method ?? 'GET'
    const json = (value: unknown) => {
      response.setHeader('Content-Type', 'application/json; charset=utf-8')
      response.end(JSON.stringify(value))
    }

    if (request.headers.origin && request.headers.origin !== origin)
      throw new HttpError(403, 'Invalid origin.')
    if (request.headers['sec-fetch-site'] === 'cross-site')
      throw new HttpError(403, 'Cross-site requests are not allowed.')

    if (url.pathname === '/api/status' && method === 'GET') {
      if (request.headers.authorization !== `Bearer ${token}`)
        throw new HttpError(401, 'Launcher authentication required.')
      response.end('devnotes-local-v1')
      return
    }

    if (url.pathname === '/api/launch' && method === 'POST') {
      if (request.headers.authorization !== `Bearer ${token}`)
        throw new HttpError(401, 'Launcher authentication required.')
      const body = await jsonBody(request)
      if (body.file !== undefined && typeof body.file !== 'string')
        throw new HttpError(400, 'Invalid file path.')
      const path =
        typeof body.file === 'string'
          ? await authorizePath(body.file)
          : undefined
      for (const [key, value] of tickets)
        if (value.expires < Date.now()) tickets.delete(key)
      const ticket = secret()
      tickets.set(ticket, { path, expires: Date.now() + 60_000 })
      json({ url: `${origin}/launch?ticket=${ticket}` })
      return
    }

    if (url.pathname === '/launch' && method === 'GET') {
      const key = url.searchParams.get('ticket') ?? ''
      const ticket = tickets.get(key)
      tickets.delete(key)
      if (!ticket || ticket.expires < Date.now())
        throw new HttpError(
          401,
          'Launch link expired. Open the file again from your computer.',
        )
      const session = secret()
      sessions.add(session)
      response.setHeader(
        'Set-Cookie',
        `${cookieName}=${session}; HttpOnly; SameSite=Strict; Path=/`,
      )
      const target = new URL('/', origin)
      target.searchParams.set('ws', '1')
      if (ticket.path) target.searchParams.set('file', ticket.path)
      response.writeHead(303, { Location: target.href })
      response.end()
      return
    }

    if (url.pathname.startsWith('/api/')) {
      const cookie = request.headers.cookie
        ?.split('; ')
        .find((value) => value.startsWith(`${cookieName}=`))
        ?.slice(cookieName.length + 1)
      if (!cookie || !sessions.has(cookie))
        throw new HttpError(401, 'Open DevNotes using the local launcher.')
      if (url.pathname !== '/api/document' || !['GET', 'PUT'].includes(method))
        throw new HttpError(404, 'Unknown endpoint.')
      if (method === 'PUT' && request.headers.origin !== origin)
        throw new HttpError(403, 'Invalid origin.')
      const path = url.searchParams.get('file') ?? ''
      if (!allowed.has(path) || (await realpath(path)) !== path)
        throw new HttpError(
          403,
          'Open this file using the DevNotes launcher first.',
        )
      if (method === 'GET') {
        json(await readDocument(path))
        return
      }
      const body = await jsonBody(request)
      if (typeof body.raw !== 'string' || typeof body.version !== 'string')
        throw new HttpError(400, 'Expected document content and version.')
      const { raw, version } = body
      if (Buffer.byteLength(raw) > MAX_BYTES)
        throw new HttpError(413, 'Document exceeds 2 MB.')
      const write = (writes.get(path) ?? Promise.resolve())
        .catch(() => {})
        .then(async () => {
          const previous = await readDocument(path)
          if (previous.version !== version)
            throw new HttpError(
              409,
              'The file changed on disk. Reload it before saving.',
            )
          if (raw === previous.raw) return previous
          const info = await stat(path)
          const temporary = join(
            dirname(path),
            `.${basename(path)}.${secret()}.tmp`,
          )
          try {
            const handle = await open(temporary, 'wx', 0o600)
            try {
              await handle.writeFile(raw, 'utf8')
              await handle.sync()
            } finally {
              await handle.close()
            }
            await chmod(temporary, info.mode & 0o777)
            if (
              (await realpath(path)) !== path ||
              (await readDocument(path)).version !== version
            )
              throw new HttpError(
                409,
                'The file changed on disk. Reload it before saving.',
              )
            await rename(temporary, path)
            return { path, name: basename(path), raw, version: digest(raw) }
          } finally {
            await rm(temporary, { force: true })
          }
        })
      writes.set(path, write)
      try {
        json(await write)
      } finally {
        if (writes.get(path) === write) writes.delete(path)
      }
      return
    }

    if (method !== 'GET' && method !== 'HEAD')
      throw new HttpError(405, 'Method not allowed.')
    const requested =
      url.pathname === '/'
        ? 'index.html'
        : decodeURIComponent(url.pathname).slice(1)
    const file = await realpath(resolve(dist, requested))
    if (!file.startsWith(`${dist}${sep}`))
      throw new HttpError(403, 'Invalid asset path.')
    const types: Record<string, string> = {
      '.html': 'text/html; charset=utf-8',
      '.js': 'text/javascript; charset=utf-8',
      '.css': 'text/css; charset=utf-8',
      '.svg': 'image/svg+xml',
      '.png': 'image/png',
      '.ico': 'image/x-icon',
      '.woff2': 'font/woff2',
      '.json': 'application/json',
    }
    response.setHeader(
      'Content-Type',
      types[extname(file)] ?? 'application/octet-stream',
    )
    const content = await readFile(file)
    response.end(method === 'HEAD' ? undefined : content)
  }

  const server = createServer((request, response) => {
    void route(request, response).catch((error: unknown) => {
      const status =
        error instanceof HttpError
          ? error.status
          : error instanceof Error && 'code' in error && error.code === 'ENOENT'
            ? 404
            : 500
      response.writeHead(status, {
        'Content-Type': 'application/json; charset=utf-8',
      })
      response.end(
        JSON.stringify({
          error:
            error instanceof HttpError
              ? error.message
              : 'Unable to access the local file.',
        }),
      )
    })
  })
  await new Promise<void>((resolveListen, reject) => {
    server.once('error', reject)
    server.listen(options.port ?? 0, '127.0.0.1', () => {
      server.removeListener('error', reject)
      resolveListen()
    })
  })
  const address = server.address()
  if (!address || typeof address === 'string')
    throw new Error('Missing server address.')
  origin = `http://127.0.0.1:${address.port}`
  return { server, origin, token }
}
