import { execFileSync } from 'node:child_process'
import { mkdir, readFile, writeFile, rm } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('../../', import.meta.url))
const data = process.env.XDG_DATA_HOME ?? join(homedir(), '.local', 'share')
const directory = join(data, 'devnotes')
const executable = join(directory, 'devnotes')
const desktopId = 'devnotes-local.desktop'
const desktopFile = join(data, 'applications', desktopId)
const metadataFile = join(directory, 'associations.json')
const mimeTypes = ['text/markdown', 'text/x-markdown']
const shellQuote = (value: string) => `'${value.replaceAll("'", "'\\''")}'`
const desktopQuote = (value: string) =>
  `"${value.replace(/[\\"`$]/g, '\\$&').replaceAll('%', '%%')}"`

function mime(...args: string[]) {
  return execFileSync('xdg-mime', args, { encoding: 'utf8' }).trim()
}

async function previousAssociations(): Promise<Record<string, string>> {
  try {
    const value: unknown = JSON.parse(await readFile(metadataFile, 'utf8'))
    if (value && typeof value === 'object')
      return Object.fromEntries(
        Object.entries(value).filter(
          ([key, item]) => mimeTypes.includes(key) && typeof item === 'string',
        ),
      )
  } catch {
    /* First installation. */
  }
  return {}
}

async function main() {
  if (process.platform !== 'linux')
    throw new Error(
      'File association installation currently supports Linux. The local launcher can still be run manually on other platforms.',
    )
  const previous = await previousAssociations()
  if (process.argv.includes('--uninstall')) {
    for (const type of mimeTypes) {
      if (mime('query', 'default', type) === desktopId && previous[type])
        mime('default', previous[type], type)
    }
    await rm(desktopFile, { force: true })
    await rm(executable, { force: true })
    await rm(metadataFile, { force: true })
    console.log(
      'DevNotes file association removed. The repository and documents were kept.',
    )
  } else {
    await mkdir(directory, { recursive: true })
    await mkdir(join(data, 'applications'), { recursive: true })
    await writeFile(
      executable,
      `#!/bin/sh\nexec ${shellQuote(process.execPath)} ${shellQuote(join(root, 'scripts/local/launcher.ts'))} -- "$@"\n`,
      { mode: 0o755 },
    )
    await writeFile(
      desktopFile,
      [
        '[Desktop Entry]',
        'Type=Application',
        'Version=1.0',
        'Name=DevNotes',
        'Comment=Open Markdown documents in your browser',
        `Exec=/bin/sh ${desktopQuote(executable)} %F`,
        'Terminal=false',
        'StartupNotify=false',
        `Icon=${join(root, 'public/devnotes-icon.svg')}`,
        'Categories=Utility;TextEditor;',
        `MimeType=${mimeTypes.join(';')};`,
        '',
      ].join('\n'),
    )
    if (process.argv.includes('--default')) {
      for (const type of mimeTypes) {
        const current = mime('query', 'default', type)
        if (current !== desktopId && !(type in previous))
          previous[type] = current
      }
      await writeFile(metadataFile, JSON.stringify(previous, null, 2))
      for (const type of mimeTypes) mime('default', desktopId, type)
    }
    console.log(
      `Installed ${desktopFile}\nMarkdown files can now open in DevNotes through the default browser.`,
    )
  }
  try {
    execFileSync('update-desktop-database', [join(data, 'applications')], {
      stdio: 'ignore',
    })
  } catch {
    /* Optional desktop cache utility. */
  }
}

void main().catch((error: unknown) => {
  console.error(
    error instanceof Error ? error.message : 'Unable to register DevNotes.',
  )
  process.exitCode = 1
})
