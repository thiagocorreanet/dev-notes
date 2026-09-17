import { createServer } from 'node:http'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { readFile, realpath } from 'node:fs/promises'
import { basename, extname, resolve, sep } from 'node:path'
import { CodexAppServerService, CodexServiceError } from './codex-service.ts'
import type { CodexDocumentContext, CodexService } from './codex-service.ts'
import {
  errorCode,
  HttpError,
  MAX_BYTES,
  readDocument,
  readPdf,
  replaceDocument,
  secret,
} from './files.ts'
import {
  authorizeWorkspaceRoot,
  chooseDirectoryWithDialog,
  copyWorkspaceEntry,
  createWorkspaceDirectory,
  deleteWorkspaceEntry,
  MAX_HISTORY_BYTES,
  moveWorkspaceEntry,
  readWorkspaceFile,
  scanWorkspace,
  validFolderName,
  workspacePdfPath,
  writeWorkspaceFile,
} from './workspace.ts'
import type { DirectoryChooser } from './workspace.ts'

async function jsonBody(
  request: IncomingMessage,
  limit = MAX_BYTES * 6 + 4096,
): Promise<Record<string, unknown>> {
  if (!request.headers['content-type']?.startsWith('application/json'))
    throw new HttpError(415, 'Expected JSON.')
  const chunks: Buffer[] = []
  let size = 0
  for await (const chunk of request) {
    const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as string)
    size += bytes.length
    if (size > limit) throw new HttpError(413, 'Document is too large.')
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

export async function startLocalServer(options: {
  dist: string
  port?: number
  token?: string
  codex?: CodexService
  chooseDirectory?: DirectoryChooser
}) {
  const token = options.token ?? secret()
  const allowed = new Set<string>()
  const tickets = new Map<
    string,
    { path?: string; workspace?: string; expires: number }
  >()
  const sessions = new Map<
    string,
    { codexThreads: Set<string>; workspaces: Map<string, string> }
  >()
  const writes = new Map<string, Promise<unknown>>()
  const workspaceOperations = new Map<string, Promise<unknown>>()
  const chooseDirectory = options.chooseDirectory ?? chooseDirectoryWithDialog
  const dist = await realpath(options.dist)
  const cookieName = `devnotes_${secret().slice(0, 12)}`
  let codex = options.codex
  let origin = ''

  const codexService = () => (codex ??= new CodexAppServerService())

  async function authorizePath(path: string) {
    const markdown = /\.(md|markdown)$/i.test(path)
    const pdf = /\.pdf$/i.test(path)
    if (!markdown && !pdf)
      throw new HttpError(400, 'Expected a Markdown or PDF file.')
    const canonical = await realpath(resolve(path))
    if (pdf) await readPdf(canonical)
    else await readDocument(canonical)
    allowed.add(canonical)
    return canonical
  }

  /** Serializes changes per workspace so moves never interleave with writes to the same tree. */
  function inWorkspace<T>(root: string, operation: () => Promise<T>) {
    const next = (workspaceOperations.get(root) ?? Promise.resolve())
      .catch(() => {})
      .then(operation)
    workspaceOperations.set(root, next)
    return next.finally(() => {
      if (workspaceOperations.get(root) === next)
        workspaceOperations.delete(root)
    })
  }

  function sessionFrom(request: IncomingMessage) {
    const cookie = request.headers.cookie
      ?.split('; ')
      .find((value) => value.startsWith(`${cookieName}=`))
      ?.slice(cookieName.length + 1)
    return cookie ? sessions.get(cookie) : undefined
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
      if (body.workspace !== undefined && typeof body.workspace !== 'string')
        throw new HttpError(400, 'Invalid workspace path.')
      const path =
        typeof body.file === 'string'
          ? await authorizePath(body.file)
          : undefined
      let workspace: string | undefined
      if (typeof body.workspace === 'string') {
        workspace = await realpath(resolve(body.workspace))
        await authorizeWorkspaceRoot(workspace)
      }
      for (const [key, value] of tickets)
        if (value.expires < Date.now()) tickets.delete(key)
      const ticket = secret()
      tickets.set(ticket, {
        ...(path ? { path } : {}),
        ...(workspace ? { workspace } : {}),
        expires: Date.now() + 60_000,
      })
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
      // Reuse the browser's session so pages opened earlier keep their workspace access.
      let session = sessionFrom(request)
      if (!session) {
        const key = secret()
        session = { codexThreads: new Set(), workspaces: new Map() }
        sessions.set(key, session)
        response.setHeader(
          'Set-Cookie',
          `${cookieName}=${key}; HttpOnly; SameSite=Strict; Path=/`,
        )
      }
      const target = new URL('/', origin)
      target.searchParams.set('ws', '1')
      if (ticket.path) target.searchParams.set('file', ticket.path)
      if (ticket.workspace) {
        const id = secret().slice(0, 32)
        session.workspaces.set(id, ticket.workspace)
        target.searchParams.set('workspace', id)
      }
      response.writeHead(303, { Location: target.href })
      response.end()
      return
    }

    if (url.pathname.startsWith('/api/')) {
      const session = sessionFrom(request)
      if (!session)
        throw new HttpError(401, 'Open DevNotes using the local launcher.')
      if (
        ['POST', 'PUT', 'DELETE'].includes(method) &&
        request.headers.origin !== origin
      )
        throw new HttpError(403, 'Invalid origin.')

      if (url.pathname === '/api/codex/status' && method === 'GET') {
        json(await codexService().status())
        return
      }

      if (url.pathname === '/api/codex/login' && method === 'POST') {
        json(await codexService().loginWithChatGPT())
        return
      }

      if (url.pathname === '/api/codex/chat' && method === 'POST') {
        const body = await jsonBody(request)
        if (
          typeof body.message !== 'string' ||
          !body.message.trim() ||
          body.message.length > 16_000
        )
          throw new HttpError(
            400,
            'Escreva uma mensagem de até 16.000 caracteres.',
          )
        if (
          body.threadId !== undefined &&
          (typeof body.threadId !== 'string' || body.threadId.length > 200)
        )
          throw new HttpError(400, 'Conversa inválida.')
        if (
          typeof body.threadId === 'string' &&
          !session.codexThreads.has(body.threadId)
        )
          throw new HttpError(403, 'Esta conversa não pertence a esta sessão.')

        let document: CodexDocumentContext | undefined
        if (body.document !== undefined) {
          const value = body.document
          if (
            !value ||
            typeof value !== 'object' ||
            Array.isArray(value) ||
            !('title' in value) ||
            typeof value.title !== 'string' ||
            value.title.length > 200 ||
            !('content' in value) ||
            typeof value.content !== 'string' ||
            Buffer.byteLength(value.content, 'utf8') > MAX_BYTES
          )
            throw new HttpError(400, 'Documento anexado inválido.')
          document = { title: value.title, content: value.content }
        }

        const controller = new AbortController()
        const abort = () => controller.abort()
        request.once('aborted', abort)
        response.once('close', () => {
          if (!response.writableEnded) abort()
        })
        const result = await codexService().chat({
          threadId:
            typeof body.threadId === 'string' ? body.threadId : undefined,
          message: body.message.trim(),
          document,
          signal: controller.signal,
        })
        if (!result.threadId || result.threadId.length > 200)
          throw new HttpError(502, 'O Codex retornou uma conversa inválida.')
        session.codexThreads.add(result.threadId)
        json(result)
        return
      }

      if (url.pathname === '/api/workspace/choose' && method === 'POST') {
        const body = await jsonBody(request)
        if (body.mode !== 'open' && body.mode !== 'create')
          throw new HttpError(400, 'Invalid workspace request.')
        const name =
          body.mode === 'create' ? validFolderName(body.name) : undefined
        const chosen = await chooseDirectory(
          name
            ? `Escolha onde criar a pasta "${name}"`
            : 'Escolha a pasta do workspace',
        )
        if (!chosen) {
          response.statusCode = 204
          response.end()
          return
        }
        let root = await realpath(resolve(chosen))
        await authorizeWorkspaceRoot(root)
        if (name) {
          await createWorkspaceDirectory(root, name).catch((error: unknown) => {
            if (error instanceof HttpError && error.status === 409)
              throw new HttpError(
                409,
                `Já existe uma pasta chamada "${name}" nesse local.`,
              )
            throw error
          })
          root = await realpath(resolve(root, name))
        }
        const id = secret().slice(0, 32)
        session.workspaces.set(id, root)
        json({ id })
        return
      }

      if (url.pathname.startsWith('/api/workspace')) {
        const id = request.headers['x-devnotes-workspace']
        const root =
          typeof id === 'string' ? session.workspaces.get(id) : undefined
        if (!root)
          throw new HttpError(
            403,
            'Open this workspace using the DevNotes launcher first.',
          )
        if (url.pathname === '/api/workspace' && method === 'GET') {
          const snapshot = await inWorkspace(root, () => scanWorkspace(root))
          json({ name: basename(root), path: root, ...snapshot })
          return
        }
        if (url.pathname === '/api/workspace/file' && method === 'GET') {
          json(await readWorkspaceFile(root, url.searchParams.get('path')))
          return
        }
        if (url.pathname === '/api/workspace/pdf' && method === 'GET') {
          const pdf = await readPdf(
            await workspacePdfPath(root, url.searchParams.get('path')),
          )
          response.setHeader('Content-Type', 'application/pdf')
          response.setHeader('Content-Length', String(pdf.bytes.length))
          response.end(pdf.bytes)
          return
        }
        if (method !== 'POST' && method !== 'PUT')
          throw new HttpError(404, 'Unknown endpoint.')
        const body = await jsonBody(request, MAX_HISTORY_BYTES * 2 + 4096)
        const operations: Record<string, () => Promise<unknown>> = {
          'PUT /api/workspace/file': async () => {
            const result = await writeWorkspaceFile(
              root,
              body.path,
              body.raw,
              body.version,
            )
            return { version: result.version }
          },
          'POST /api/workspace/directory': async () => {
            await createWorkspaceDirectory(root, body.path)
            return {}
          },
          'POST /api/workspace/move': async () => {
            await moveWorkspaceEntry(root, body.from, body.to)
            return {}
          },
          'POST /api/workspace/copy': async () => {
            await copyWorkspaceEntry(root, body.from, body.to)
            return {}
          },
          'POST /api/workspace/delete': async () => {
            await deleteWorkspaceEntry(root, body.path)
            return {}
          },
        }
        const operation = operations[`${method} ${url.pathname}`]
        if (!operation) throw new HttpError(404, 'Unknown endpoint.')
        json(await inWorkspace(root, operation))
        return
      }

      if (url.pathname === '/api/pdf' && method === 'GET') {
        const path = url.searchParams.get('file') ?? ''
        if (
          !/\.pdf$/i.test(path) ||
          !allowed.has(path) ||
          (await realpath(path)) !== path
        )
          throw new HttpError(
            403,
            'Open this PDF using the DevNotes launcher first.',
          )
        const pdf = await readPdf(path)
        response.setHeader('Content-Type', 'application/pdf')
        response.setHeader('X-DevNotes-File-Name', encodeURIComponent(pdf.name))
        response.setHeader('Content-Length', String(pdf.bytes.length))
        response.end(pdf.bytes)
        return
      }

      if (url.pathname !== '/api/document' || !['GET', 'PUT'].includes(method))
        throw new HttpError(404, 'Unknown endpoint.')
      const path = url.searchParams.get('file') ?? ''
      if (
        !/\.(md|markdown)$/i.test(path) ||
        !allowed.has(path) ||
        (await realpath(path)) !== path
      )
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
        .then(() => replaceDocument(path, raw, version))
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
      '.mjs': 'text/javascript; charset=utf-8',
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
          : error instanceof CodexServiceError
            ? error.code === 'auth'
              ? 401
              : error.code === 'limit'
                ? 429
                : error.code === 'unavailable'
                  ? 503
                  : error.code === 'cancelled'
                    ? 499
                    : 502
            : errorCode(error) === 'ENOENT'
              ? 404
              : errorCode(error) === 'ELOOP'
                ? 400
                : 500
      response.writeHead(status, {
        'Content-Type': 'application/json; charset=utf-8',
      })
      response.end(
        JSON.stringify({
          error:
            error instanceof HttpError
              ? error.message
              : error instanceof CodexServiceError
                ? error.code === 'auth'
                  ? 'Entre com sua conta do ChatGPT para usar o assistente.'
                  : error.code === 'limit'
                    ? 'Você atingiu o limite incluído na sua assinatura. Aguarde a renovação para continuar.'
                    : error.code === 'unavailable'
                      ? 'O Codex não está disponível neste computador.'
                      : error.code === 'cancelled'
                        ? 'Resposta interrompida.'
                        : 'O Codex não conseguiu concluir a resposta. Tente novamente.'
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
  server.once('close', () => {
    void codex?.close()
  })
  return { server, origin, token }
}
