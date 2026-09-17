import { vi } from 'vitest'

type Entry =
  | { kind: 'directory' }
  | { kind: 'file'; raw: string }
  | { kind: 'pdf'; bytes: Uint8Array }

function version(raw: string) {
  let hash = 2166136261
  for (let index = 0; index < raw.length; index++) {
    hash ^= raw.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return `v${(hash >>> 0).toString(16)}-${raw.length}`
}

const parent = (path: string) =>
  path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : ''

/**
 * An in-memory stand-in for the local workspace API. It follows the server's rules that matter to
 * the client: versions, no-overwrite creation and moves, reserved `.devnotes` paths, and ordering.
 */
export function diskWorkspaceFixture(
  initial: Record<string, string | Uint8Array | null> = {},
  { id = 'workspace-test', name = 'Notas' } = {},
) {
  const disk = new Map<string, Entry>()
  const requests: { method: string; path: string; body?: unknown }[] = []
  const chosen: { mode: string; name?: string }[] = []
  const add = (path: string, value: string | Uint8Array | null) => {
    const parts = path.split('/')
    for (let index = 1; index < parts.length; index++)
      disk.set(parts.slice(0, index).join('/'), { kind: 'directory' })
    disk.set(
      path,
      value === null
        ? { kind: 'directory' }
        : typeof value === 'string'
          ? { kind: 'file', raw: value }
          : { kind: 'pdf', bytes: value },
    )
  }
  for (const [path, value] of Object.entries(initial)) add(path, value)

  const json = (value: unknown, status = 200) =>
    new Response(JSON.stringify(value), {
      status,
      headers: { 'Content-Type': 'application/json' },
    })
  const fail = (status: number) => json({ error: `Status ${status}` }, status)
  const internal = (path: string) =>
    path === '.devnotes' || path.startsWith('.devnotes/')
  const ensureInternal = (path: string) => {
    const parts = parent(path).split('/')
    for (let index = 1; index <= parts.length; index++)
      disk.set(parts.slice(0, index).join('/'), { kind: 'directory' })
  }
  const parentExists = (path: string) =>
    !parent(path) || disk.get(parent(path))?.kind === 'directory'
  const within = (path: string, root: string) =>
    path === root || path.startsWith(`${root}/`)

  function snapshot() {
    const visible = [...disk.keys()].filter(
      (path) => !path.split('/').some((part) => part.startsWith('.')),
    )
    const ordered: string[] = []
    const visit = (directory: string) => {
      const children = visible
        .filter((path) => parent(path) === directory)
        .sort((a, b) => a.localeCompare(b))
      for (const child of children) {
        ordered.push(child)
        if (disk.get(child)?.kind === 'directory') visit(child)
      }
    }
    visit('')
    const metadata = disk.get('.devnotes/workspace.json')
    const history: Record<string, string> = {}
    for (const [path, entry] of disk)
      if (path.startsWith('.devnotes/history/') && entry.kind === 'file')
        history[path.slice(18, -5)] = entry.raw
    return {
      name,
      path: `/home/pessoa/${name}`,
      skipped: [],
      metadata: metadata?.kind === 'file' ? metadata.raw : null,
      history,
      entries: ordered.flatMap((path) => {
        const entry = disk.get(path)!
        if (entry.kind === 'directory') return [{ kind: 'directory', path }]
        if (entry.kind === 'pdf')
          return [{ kind: 'pdf', path, size: entry.bytes.length }]
        return /\.(md|markdown)$/i.test(path)
          ? [
              {
                kind: 'markdown',
                path,
                raw: entry.raw,
                version: version(entry.raw),
              },
            ]
          : []
      }),
    }
  }

  const fetch = vi.fn(
    async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      const url = new URL(
        input instanceof Request ? input.url : input.toString(),
        'http://127.0.0.1',
      )
      const method = init?.method ?? 'GET'
      const body: unknown =
        typeof init?.body === 'string' ? JSON.parse(init.body) : undefined
      requests.push({ method, path: url.pathname, body })
      await Promise.resolve()
      if (method === 'POST' && url.pathname === '/api/workspace/choose') {
        chosen.push(body as { mode: string; name?: string })
        return json({ id })
      }
      const headers = new Headers(init?.headers)
      if (headers.get('X-DevNotes-Workspace') !== id) return fail(403)
      const field = (key: string) =>
        (body as Record<string, unknown> | undefined)?.[key]
      const route = `${method} ${url.pathname}`
      if (route === 'GET /api/workspace') return json(snapshot())
      if (route === 'GET /api/workspace/file') {
        const entry = disk.get(url.searchParams.get('path') ?? '')
        if (entry?.kind !== 'file') return fail(404)
        return json({ raw: entry.raw, version: version(entry.raw) })
      }
      if (route === 'GET /api/workspace/pdf') {
        const entry = disk.get(url.searchParams.get('path') ?? '')
        if (entry?.kind !== 'pdf') return fail(404)
        return new Response(entry.bytes.slice(), {
          headers: { 'Content-Type': 'application/pdf' },
        })
      }
      if (route === 'PUT /api/workspace/file') {
        const path = String(field('path'))
        const raw = String(field('raw'))
        if (internal(path)) {
          ensureInternal(path)
          disk.set(path, { kind: 'file', raw })
          return json({ version: version(raw) })
        }
        const existing = disk.get(path)
        if (field('version') === null) {
          if (existing) return fail(409)
          if (!parentExists(path)) return fail(404)
        } else {
          if (existing?.kind !== 'file') return fail(404)
          if (version(existing.raw) !== field('version')) return fail(409)
        }
        disk.set(path, { kind: 'file', raw })
        return json({ version: version(raw) })
      }
      if (route === 'POST /api/workspace/directory') {
        const path = String(field('path'))
        if (disk.has(path)) return fail(409)
        if (!parentExists(path)) return fail(404)
        disk.set(path, { kind: 'directory' })
        return json({})
      }
      if (
        route === 'POST /api/workspace/move' ||
        route === 'POST /api/workspace/copy'
      ) {
        const from = String(field('from'))
        const to = String(field('to'))
        if (!disk.has(from)) return fail(404)
        if (within(to, from)) return fail(400)
        if (disk.has(to)) return fail(409)
        if (internal(to)) ensureInternal(to)
        else if (!parentExists(to)) return fail(404)
        for (const [path, entry] of [...disk])
          if (within(path, from)) {
            disk.set(`${to}${path.slice(from.length)}`, entry)
            if (route.endsWith('move')) disk.delete(path)
          }
        return json({})
      }
      if (route === 'POST /api/workspace/delete') {
        const path = String(field('path'))
        if (!internal(path)) return fail(403)
        for (const key of [...disk.keys()])
          if (within(key, path)) disk.delete(key)
        return json({})
      }
      return fail(404)
    },
  )

  return {
    id,
    fetch,
    requests,
    chosen,
    disk,
    install() {
      history.replaceState(null, '', `/?ws=1&workspace=${id}`)
      vi.stubGlobal('fetch', fetch)
    },
    read(path: string) {
      const entry = disk.get(path)
      return entry?.kind === 'file' ? entry.raw : undefined
    },
    write: add,
    remove(path: string) {
      for (const key of [...disk.keys()])
        if (within(key, path)) disk.delete(key)
    },
    paths() {
      return [...disk.keys()].filter((path) => !internal(path)).sort()
    },
    metadata() {
      const raw = disk.get('.devnotes/workspace.json')
      return raw?.kind === 'file'
        ? (JSON.parse(raw.raw) as {
            items: { id: string; path: string; favorite?: boolean }[]
            trash: { id: string; path: string; batch: string }[]
          })
        : null
    },
  }
}
