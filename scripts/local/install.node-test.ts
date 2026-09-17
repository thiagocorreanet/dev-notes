import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'

void test(
  'registers and restores the Linux default handler without replacing its original backup on reinstall',
  { skip: process.platform !== 'linux' },
  async (t) => {
    try {
      execFileSync('xdg-mime', ['--version'], { stdio: 'ignore' })
    } catch {
      t.skip('xdg-mime is unavailable')
      return
    }
    const directory = await mkdtemp(join(tmpdir(), 'devnotes-registration-'))
    t.after(() => rm(directory, { recursive: true, force: true }))
    const data = join(directory, 'user data')
    const config = join(directory, 'config')
    const apps = join(data, 'applications')
    await mkdir(apps, { recursive: true })
    await mkdir(config)
    const env = {
      ...process.env,
      XDG_DATA_HOME: data,
      XDG_DATA_DIRS: data,
      XDG_CONFIG_HOME: config,
      XDG_CONFIG_DIRS: config,
      XDG_CURRENT_DESKTOP: 'X-Generic',
    }
    const mime = (...args: string[]) =>
      execFileSync('xdg-mime', args, { env, encoding: 'utf8' }).trim()
    const installer = fileURLToPath(new URL('./install.ts', import.meta.url))
    const install = (...args: string[]) =>
      execFileSync(process.execPath, [installer, ...args], {
        env,
        stdio: 'pipe',
      })
    await writeFile(
      join(apps, 'previous.desktop'),
      '[Desktop Entry]\nType=Application\nName=Previous editor\nExec=/bin/true %F\nMimeType=text/markdown;text/x-markdown;application/pdf;\n',
    )
    mime('default', 'previous.desktop', 'text/markdown')
    mime('default', 'previous.desktop', 'text/x-markdown')
    mime('default', 'previous.desktop', 'application/pdf')
    install('--default')
    assert.equal(
      mime('query', 'default', 'text/markdown'),
      'devnotes-local.desktop',
    )
    assert.equal(
      mime('query', 'default', 'application/pdf'),
      'previous.desktop',
    )
    assert.match(
      await readFile(join(apps, 'devnotes-local.desktop'), 'utf8'),
      /MimeType=text\/markdown;text\/x-markdown;application\/pdf;inode\/directory;/,
    )
    install('--default')
    const previous = JSON.parse(
      await readFile(join(data, 'devnotes', 'associations.json'), 'utf8'),
    ) as Record<string, string>
    assert.equal(previous['text/markdown'], 'previous.desktop')
    install('--uninstall')
    assert.equal(mime('query', 'default', 'text/markdown'), 'previous.desktop')
    assert.equal(
      mime('query', 'default', 'text/x-markdown'),
      'previous.desktop',
    )
  },
)
