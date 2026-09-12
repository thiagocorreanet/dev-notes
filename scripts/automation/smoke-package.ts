import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { createServer } from 'node:net'
import { join, resolve } from 'node:path'

const root = resolve(import.meta.dirname, '../..')
const { version } = JSON.parse(
  await readFile(join(root, 'package.json'), 'utf8'),
) as { version: string }
const directory = await mkdtemp(join(tmpdir(), 'devnotes-release-smoke-'))
const runtime = join(directory, `devnotes-${version}-linux`)
const launcher = join(runtime, 'scripts/local/launcher.ts')
const env = {
  ...process.env,
  DEVNOTES_STATE_DIR: join(directory, 'state'),
  XDG_DATA_HOME: join(directory, 'data'),
  XDG_CONFIG_HOME: join(directory, 'config'),
}
try {
  execFileSync('sha256sum', ['--check', 'SHA256SUMS'], {
    cwd: join(root, 'release'),
    stdio: 'pipe',
  })
  execFileSync('tar', [
    '-xzf',
    join(root, 'release', `devnotes-${version}-linux.tar.gz`),
    '-C',
    directory,
  ])
  const file = join(directory, 'release test & accents ação.md')
  await writeFile(file, '# Release check\n\nOriginal')
  execFileSync(process.execPath, [join(runtime, 'scripts/local/install.ts')], {
    env,
    stdio: 'pipe',
  })
  assert.match(
    await readFile(
      join(env.XDG_DATA_HOME, 'applications/devnotes-local.desktop'),
      'utf8',
    ),
    /Name=DevNotes/,
  )
  const probe = createServer()
  await new Promise<void>((done) => probe.listen(0, '127.0.0.1', done))
  const address = probe.address()
  assert.ok(address && typeof address !== 'string')
  const port = address.port
  await new Promise<void>((done) => probe.close(() => done()))
  const url = execFileSync(
    process.execPath,
    [launcher, '--no-browser', `--port=${port}`, file],
    { env, encoding: 'utf8' },
  ).trim()
  const launch = await fetch(url, { redirect: 'manual' })
  assert.equal(launch.status, 303)
  const location = launch.headers.get('location')!
  const origin = new URL(location).origin
  const cookie = launch.headers.get('set-cookie')!.split(';')[0]!
  assert.match(await (await fetch(location)).text(), /assets\//)
  const endpoint = `${origin}/api/document?${new URLSearchParams({ file })}`
  const disk = (await (
    await fetch(endpoint, { headers: { Cookie: cookie } })
  ).json()) as { version: string }
  const saved = await fetch(endpoint, {
    method: 'PUT',
    headers: {
      Cookie: cookie,
      Origin: origin,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      version: disk.version,
      raw: '# Release check\n\nSaved from the package',
    }),
  })
  assert.equal(saved.status, 200)
  assert.equal(
    await readFile(file, 'utf8'),
    '# Release check\n\nSaved from the package',
  )
  console.log(
    'Package checksums, installation, launch, and original-file save passed.',
  )
} finally {
  try {
    execFileSync(process.execPath, [launcher, '--stop'], { env, stdio: 'pipe' })
  } catch {
    /* Cleanup after incomplete extraction or startup. */
  }
  await rm(directory, { recursive: true, force: true })
}
