import { spawn } from 'node:child_process'
import { open, mkdir, readFile, writeFile, rm, stat } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { setTimeout as delay } from 'node:timers/promises'
import { startLocalServer } from './server.ts'

const root = fileURLToPath(new URL('../../', import.meta.url))
const stateDirectory =
  process.env.DEVNOTES_STATE_DIR ??
  join(
    process.env.XDG_STATE_HOME ?? join(homedir(), '.local', 'state'),
    'devnotes',
  )
const stateFile = join(stateDirectory, 'server.json')
const lockFile = join(stateDirectory, 'launcher.lock')
const args = process.argv.slice(2)

interface ServerState {
  origin: string
  token: string
  pid: number
}

async function readState(): Promise<ServerState | null> {
  try {
    const value: unknown = JSON.parse(await readFile(stateFile, 'utf8'))
    if (
      !value ||
      typeof value !== 'object' ||
      !('origin' in value) ||
      !('token' in value) ||
      !('pid' in value)
    )
      return null
    if (
      typeof value.origin !== 'string' ||
      !/^http:\/\/127\.0\.0\.1:\d+$/.test(value.origin) ||
      typeof value.token !== 'string' ||
      typeof value.pid !== 'number'
    )
      return null
    return value as ServerState
  } catch {
    return null
  }
}

async function alive(state: ServerState) {
  try {
    const response = await fetch(`${state.origin}/api/status`, {
      headers: { Authorization: `Bearer ${state.token}` },
      signal: AbortSignal.timeout(1500),
    })
    return response.ok && (await response.text()) === 'devnotes-local-v1'
  } catch {
    return false
  }
}

function running(pid: number) {
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

async function acquireLock() {
  for (let attempt = 0; attempt < 100; attempt++) {
    try {
      const handle = await open(lockFile, 'wx', 0o600)
      await handle.writeFile(String(process.pid))
      await handle.close()
      return
    } catch (error) {
      if (!(
        error instanceof Error &&
        'code' in error &&
        error.code === 'EEXIST'
      ))
        throw error
      try {
        const pid = Number(await readFile(lockFile, 'utf8'))
        if (
          (pid > 0 && !running(pid)) ||
          (!pid && Date.now() - (await stat(lockFile)).mtimeMs > 10_000)
        ) {
          await rm(lockFile, { force: true })
          continue
        }
      } catch {
        /* The other launcher may have just released its lock. */
      }
      await delay(100)
    }
  }
  throw new Error('Another DevNotes launcher is still starting. Try again.')
}

async function serve(port: number) {
  const { server, origin, token } = await startLocalServer({
    dist: join(root, 'dist'),
    port,
  })
  await writeFile(
    stateFile,
    JSON.stringify({ origin, token, pid: process.pid }),
    { mode: 0o600 },
  )
  const shutdown = () => {
    server.close(() => {
      void readState().then(async (state) => {
        if (state?.pid === process.pid) await rm(stateFile, { force: true })
        process.exit(0)
      })
    })
    server.closeIdleConnections()
  }
  process.on('SIGTERM', shutdown)
  process.on('SIGINT', shutdown)
}

async function ensureServer(port: number) {
  const existing = await readState()
  if (existing && (await alive(existing))) return existing
  await stat(join(root, 'dist', 'index.html')).catch(() => {
    throw new Error('Build DevNotes first: npm run build')
  })
  const log = await open(join(stateDirectory, 'server.log'), 'a', 0o600)
  const child = spawn(
    process.execPath,
    [fileURLToPath(import.meta.url), '--serve', `--port=${port}`],
    {
      cwd: root,
      detached: true,
      stdio: ['ignore', log.fd, log.fd],
    },
  )
  let spawnError: Error | undefined
  child.on('error', (error) => {
    spawnError = error
  })
  child.unref()
  await log.close()
  for (let attempt = 0; attempt < 100; attempt++) {
    if (spawnError) throw spawnError
    if (child.exitCode !== null) break
    const state = await readState()
    if (state && state.pid === child.pid && (await alive(state))) return state
    await delay(100)
  }
  throw new Error(
    `Could not start DevNotes on port ${port}. See ${join(stateDirectory, 'server.log')}. Choose another port with --port=<number> if it is occupied.`,
  )
}

async function openBrowser(url: string) {
  const command =
    process.platform === 'darwin'
      ? 'open'
      : process.platform === 'win32'
        ? 'rundll32.exe'
        : 'xdg-open'
  const parameters =
    process.platform === 'win32' ? ['url.dll,FileProtocolHandler', url] : [url]
  await new Promise<void>((resolveOpen, reject) => {
    const child = spawn(command, parameters, { stdio: 'ignore' })
    child.once('error', reject)
    child.once('exit', (code) =>
      code === 0
        ? resolveOpen()
        : reject(new Error('Could not open the default browser.')),
    )
  })
}

async function main() {
  if (args.includes('--help')) {
    console.log(
      'Usage: devnotes [--no-browser] [--port=45164] [--] [file.md ...]\n       devnotes --stop\nOpen Markdown files in the default browser. Use --no-browser to print launch URLs instead.',
    )
    return
  }
  await mkdir(stateDirectory, { recursive: true, mode: 0o700 })
  const separator = args.indexOf('--')
  const flags = separator < 0 ? args : args.slice(0, separator)
  const port = Number(
    flags.find((arg) => arg.startsWith('--port='))?.slice(7) ?? '45164',
  )
  if (!Number.isInteger(port) || port < 1 || port > 65535)
    throw new Error('Port must be between 1 and 65535.')
  if (flags.includes('--serve')) {
    await serve(port)
    return
  }
  await acquireLock()
  try {
    if (flags.includes('--stop')) {
      const state = await readState()
      if (state && (await alive(state))) process.kill(state.pid, 'SIGTERM')
      console.log('DevNotes local server stopped.')
      return
    }
    const unknown = flags.find(
      (arg) =>
        arg.startsWith('-') &&
        arg !== '--no-browser' &&
        !arg.startsWith('--port='),
    )
    if (unknown) throw new Error(`Unknown option: ${unknown}`)
    const files =
      separator < 0
        ? flags.filter((arg) => !arg.startsWith('--'))
        : [
            ...flags.filter((arg) => !arg.startsWith('--')),
            ...args.slice(separator + 1),
          ]
    const state = await ensureServer(port)
    for (const file of files.length ? files : [undefined]) {
      const response = await fetch(`${state.origin}/api/launch`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${state.token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(file ? { file: resolve(file) } : {}),
        signal: AbortSignal.timeout(10_000),
      })
      const result: unknown = await response.json()
      if (
        !response.ok ||
        !result ||
        typeof result !== 'object' ||
        !('url' in result) ||
        typeof result.url !== 'string'
      )
        throw new Error(
          `Could not open ${file ?? 'DevNotes'}: ${response.status}. Check that it is an existing UTF-8 Markdown file of at most 2 MB or a valid PDF of at most 50 MB.`,
        )
      if (flags.includes('--no-browser')) console.log(result.url)
      else await openBrowser(result.url)
    }
  } finally {
    await rm(lockFile, { force: true })
  }
}

// Resolve resources relative to this module, independently of the clicked file's directory.
void main().catch((error: unknown) => {
  console.error(
    error instanceof Error ? error.message : 'Unable to launch DevNotes.',
  )
  process.exitCode = 1
})
