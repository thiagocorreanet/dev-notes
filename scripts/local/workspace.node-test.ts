import assert from 'node:assert/strict'
import {
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  stat,
  symlink,
  writeFile,
} from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import type { TestContext } from 'node:test'
import { startLocalServer } from './server.ts'

interface Snapshot {
  name: string
  path: string
  entries: { kind: string; path: string; raw?: string; version?: string }[]
  skipped: string[]
  metadata: string | null
  history: Record<string, string>
}

async function fixture(t: TestContext) {
  const directory = await mkdtemp(join(tmpdir(), 'devnotes-workspace-test-'))
  const dist = join(directory, 'dist')
  const root = join(directory, 'Notas')
  const outside = join(directory, 'outside')
  await mkdir(dist)
  await writeFile(join(dist, 'index.html'), '<html>DevNotes</html>')
  await mkdir(join(root, 'Clientes', 'Contratos'), { recursive: true })
  await mkdir(join(root, 'Vazia'))
  await mkdir(join(root, '.git'))
  await mkdir(join(root, 'node_modules'))
  await mkdir(outside)
  await writeFile(join(outside, 'secret.md'), '# Secret\n\noutside')
  await writeFile(join(root, 'Inicio.md'), '# Início\n\nBem-vindo')
  await writeFile(join(root, 'Clientes', 'Contratos', 'Acme.md'), 'acordo')
  await writeFile(join(root, 'Clientes', 'imagem.png'), 'png')
  await writeFile(join(root, '.git', 'config.md'), 'hidden')
  await writeFile(join(root, 'node_modules', 'pkg.md'), 'dependency')
  await writeFile(join(root, 'manual.pdf'), '%PDF-1.7\n%%EOF')
  await symlink(outside, join(root, 'atalho'))
  const chosen: (string | null)[] = []
  const service = await startLocalServer({
    dist,
    chooseDirectory: () => Promise.resolve(chosen.shift() ?? null),
  })
  t.after(async () => {
    await new Promise<void>((resolve) => {
      service.server.close(() => resolve())
      service.server.closeAllConnections()
    })
    await rm(directory, { recursive: true, force: true })
  })
  async function launch(workspace = root, cookie?: string) {
    const response = await fetch(`${service.origin}/api/launch`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${service.token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ workspace }),
    })
    assert.equal(response.status, 200)
    const { url } = (await response.json()) as { url: string }
    const entry = await fetch(url, {
      redirect: 'manual',
      ...(cookie ? { headers: { Cookie: cookie } } : {}),
    })
    assert.equal(entry.status, 303)
    const location = new URL(entry.headers.get('location')!)
    return {
      cookie: cookie ?? entry.headers.get('set-cookie')!.split(';')[0]!,
      setCookie: entry.headers.get('set-cookie'),
      id: location.searchParams.get('workspace')!,
      location,
    }
  }
  const { cookie, id, location } = await launch()
  const request = (
    method: string,
    path: string,
    body?: unknown,
    workspace = id,
  ) =>
    fetch(`${service.origin}${path}`, {
      method,
      headers: {
        Cookie: cookie,
        Origin: service.origin,
        'X-DevNotes-Workspace': workspace,
        ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    })
  const snapshot = async () =>
    (await (await request('GET', '/api/workspace')).json()) as Snapshot
  return {
    ...service,
    directory,
    root,
    outside,
    chosen,
    cookie,
    id,
    location,
    launch,
    request,
    snapshot,
  }
}

void test('launches a folder as a workspace and lists only its visible files', async (t) => {
  const f = await fixture(t)
  assert.equal(f.location.searchParams.get('ws'), '1')
  assert.equal(f.location.searchParams.get('file'), null)
  assert.match(f.id, /^[a-f0-9]{32}$/)

  const snapshot = await f.snapshot()
  assert.equal(snapshot.name, 'Notas')
  assert.deepEqual(
    snapshot.entries.map((entry) => `${entry.kind}:${entry.path}`),
    [
      'directory:Clientes',
      'directory:Clientes/Contratos',
      'markdown:Clientes/Contratos/Acme.md',
      'markdown:Inicio.md',
      'pdf:manual.pdf',
      'directory:Vazia',
    ],
  )
  assert.equal(
    snapshot.entries.find((entry) => entry.path === 'Inicio.md')?.raw,
    '# Início\n\nBem-vindo',
  )
  assert.equal(snapshot.metadata, null)
})

void test('requires the session, the workspace id, and the page origin', async (t) => {
  const f = await fixture(t)
  assert.equal(
    (
      await fetch(`${f.origin}/api/workspace`, {
        headers: { 'X-DevNotes-Workspace': f.id },
      })
    ).status,
    401,
  )
  assert.equal(
    (await f.request('GET', '/api/workspace', undefined, '')).status,
    403,
  )
  assert.equal(
    (await f.request('GET', '/api/workspace', undefined, 'unknown')).status,
    403,
  )
  const crossOrigin = await fetch(`${f.origin}/api/workspace/directory`, {
    method: 'POST',
    headers: {
      Cookie: f.cookie,
      Origin: 'https://example.com',
      'X-DevNotes-Workspace': f.id,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ path: 'Nova' }),
  })
  assert.equal(crossOrigin.status, 403)
  await assert.rejects(stat(join(f.root, 'Nova')))
})

void test('creates, updates, and refuses to overwrite files without the current version', async (t) => {
  const f = await fixture(t)
  const write = (path: string, raw: string, version: string | null) =>
    f.request('PUT', '/api/workspace/file', { path, raw, version })

  assert.equal(
    (await write('Clientes/Novo.md', '# Novo\n\nA', null)).status,
    200,
  )
  assert.equal(
    await readFile(join(f.root, 'Clientes', 'Novo.md'), 'utf8'),
    '# Novo\n\nA',
  )
  assert.equal((await write('Clientes/Novo.md', 'outro', null)).status, 409)
  assert.equal((await write('Inexistente/Novo.md', 'x', null)).status, 404)

  const current = await f.request(
    'GET',
    `/api/workspace/file?${new URLSearchParams({ path: 'Clientes/Novo.md' })}`,
  )
  const { version } = (await current.json()) as { version: string }
  const updated = await write('Clientes/Novo.md', '# Novo\n\nB', version)
  assert.equal(updated.status, 200)
  assert.equal(
    (await write('Clientes/Novo.md', '# Novo\n\nC', version)).status,
    409,
  )
  assert.equal(
    await readFile(join(f.root, 'Clientes', 'Novo.md'), 'utf8'),
    '# Novo\n\nB',
  )
  assert.deepEqual(
    (await readdir(join(f.root, 'Clientes'))).filter((name) =>
      name.endsWith('.tmp'),
    ),
    [],
  )
})

void test('keeps folder operations inside the workspace hierarchy', async (t) => {
  const f = await fixture(t)
  const post = (path: string, body: unknown) => f.request('POST', path, body)

  assert.equal(
    (await post('/api/workspace/directory', { path: 'Clientes/Arquivo' }))
      .status,
    200,
  )
  assert.equal(
    (await stat(join(f.root, 'Clientes', 'Arquivo'))).isDirectory(),
    true,
  )
  assert.equal(
    (await post('/api/workspace/directory', { path: 'Clientes/Arquivo' }))
      .status,
    409,
  )

  assert.equal(
    (
      await post('/api/workspace/move', {
        from: 'Inicio.md',
        to: 'Clientes/Arquivo/Inicio.md',
      })
    ).status,
    200,
  )
  assert.equal(
    await readFile(join(f.root, 'Clientes', 'Arquivo', 'Inicio.md'), 'utf8'),
    '# Início\n\nBem-vindo',
  )
  assert.equal(
    (
      await post('/api/workspace/move', {
        from: 'Clientes',
        to: 'Clientes/Arquivo/Clientes',
      })
    ).status,
    400,
  )
  await writeFile(join(f.root, 'Outro.md'), 'outro')
  assert.equal(
    (
      await post('/api/workspace/move', {
        from: 'Outro.md',
        to: 'Clientes/Arquivo/Inicio.md',
      })
    ).status,
    409,
  )
  assert.equal(
    await readFile(join(f.root, 'Clientes', 'Arquivo', 'Inicio.md'), 'utf8'),
    '# Início\n\nBem-vindo',
  )

  assert.equal(
    (
      await post('/api/workspace/copy', {
        from: 'Clientes',
        to: 'Clientes (cópia)',
      })
    ).status,
    200,
  )
  assert.equal(
    await readFile(join(f.root, 'Clientes (cópia)', 'imagem.png'), 'utf8'),
    'png',
  )

  assert.equal(
    (
      await post('/api/workspace/move', {
        from: 'Clientes (cópia)',
        to: '.devnotes/trash/batch-1/Clientes (cópia)',
      })
    ).status,
    200,
  )
  assert.equal(
    (
      await stat(
        join(
          f.root,
          '.devnotes',
          'trash',
          'batch-1',
          'Clientes (cópia)',
          'imagem.png',
        ),
      )
    ).isFile(),
    true,
  )
  assert.equal(
    (await f.snapshot()).entries.some((entry) => entry.path.includes('cópia')),
    false,
  )
  assert.equal(
    (
      await post('/api/workspace/move', {
        from: '.devnotes/trash/batch-1/Clientes (cópia)',
        to: 'Restaurada',
      })
    ).status,
    200,
  )
  assert.equal(
    (await stat(join(f.root, 'Restaurada', 'imagem.png'))).isFile(),
    true,
  )
  assert.equal(
    (
      await post('/api/workspace/move', {
        from: 'Restaurada',
        to: '.devnotes/trash/batch-2/Restaurada',
      })
    ).status,
    200,
  )
  assert.equal(
    (await post('/api/workspace/delete', { path: '.devnotes/trash/batch-2' }))
      .status,
    200,
  )
  await assert.rejects(stat(join(f.root, '.devnotes', 'trash', 'batch-2')))
  assert.equal(
    (await post('/api/workspace/delete', { path: 'Clientes' })).status,
    403,
  )
  assert.equal((await stat(join(f.root, 'Clientes'))).isDirectory(), true)
})

void test('stores metadata and history privately and reads them back with the scan', async (t) => {
  const f = await fixture(t)
  const metadata = JSON.stringify({ format: 'devnotes-workspace-folder' })
  assert.equal(
    (
      await f.request('PUT', '/api/workspace/file', {
        path: '.devnotes/workspace.json',
        raw: metadata,
        version: null,
      })
    ).status,
    200,
  )
  assert.equal(
    (
      await f.request('PUT', '/api/workspace/file', {
        path: '.devnotes/history/note-1.json',
        raw: '[]',
        version: null,
      })
    ).status,
    200,
  )
  assert.equal(
    (await stat(join(f.root, '.devnotes', 'history', 'note-1.json'))).mode &
      0o777,
    0o600,
  )
  const snapshot = await f.snapshot()
  assert.equal(snapshot.metadata, metadata)
  assert.deepEqual(snapshot.history, { 'note-1': '[]' })
  assert.equal(
    (
      await f.request('POST', '/api/workspace/delete', {
        path: '.devnotes/history/note-1.json',
      })
    ).status,
    200,
  )
  assert.deepEqual((await f.snapshot()).history, {})
})

void test('rejects traversal, reserved paths, hidden names, and symlinked folders', async (t) => {
  const f = await fixture(t)
  const write = (path: string) =>
    f.request('PUT', '/api/workspace/file', { path, raw: 'x', version: null })
  for (const path of [
    '../fora.md',
    '/etc/fora.md',
    'Clientes/../../fora.md',
    'Clientes//x.md',
    '.oculto.md',
    'node_modules/x.md',
    'Clientes\\x.md',
  ])
    assert.equal((await write(path)).status, 400, path)
  for (const path of [
    '.devnotes/outro.json',
    '.devnotes/history/../x.json',
    '.devnotes/trash/b/x.md',
  ])
    assert.notEqual((await write(path)).status, 200, path)
  assert.equal((await write('atalho/novo.md')).status, 400)
  await assert.rejects(stat(join(f.outside, 'novo.md')))
  assert.equal(
    (
      await f.request(
        'GET',
        `/api/workspace/file?${new URLSearchParams({ path: 'atalho/secret.md' })}`,
      )
    ).status,
    400,
  )
  assert.equal(
    (
      await f.request('POST', '/api/workspace/move', {
        from: 'atalho',
        to: 'Clientes/atalho',
      })
    ).status,
    400,
  )
})

void test('opens and creates workspaces only through the folder chooser', async (t) => {
  const f = await fixture(t)
  const choose = (body: unknown) =>
    f.request('POST', '/api/workspace/choose', body, '')

  f.chosen.push(null)
  assert.equal((await choose({ mode: 'open' })).status, 204)

  f.chosen.push(f.outside)
  const opened = (await (await choose({ mode: 'open' })).json()) as {
    id: string
  }
  const outsideSnapshot = (await (
    await f.request('GET', '/api/workspace', undefined, opened.id)
  ).json()) as Snapshot
  assert.deepEqual(
    outsideSnapshot.entries.map((entry) => entry.path),
    ['secret.md'],
  )

  assert.equal((await choose({ mode: 'create', name: '../fora' })).status, 400)
  f.chosen.push(f.directory)
  const created = await choose({ mode: 'create', name: 'Projetos 2026' })
  assert.equal(created.status, 200)
  assert.equal(
    (await stat(join(f.directory, 'Projetos 2026'))).isDirectory(),
    true,
  )
  f.chosen.push(f.directory)
  assert.equal(
    (await choose({ mode: 'create', name: 'Projetos 2026' })).status,
    409,
  )

  const again = await f.launch(f.outside, f.cookie)
  assert.equal(again.setCookie, null)
  assert.equal((await f.request('GET', '/api/workspace')).status, 200)
  assert.equal(
    (await f.request('GET', '/api/workspace', undefined, again.id)).status,
    200,
  )
})
