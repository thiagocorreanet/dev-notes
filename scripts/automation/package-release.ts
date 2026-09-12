import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import {
  access,
  cp,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

const root = resolve(import.meta.dirname, '../..')
const manifest = JSON.parse(
  await readFile(join(root, 'package.json'), 'utf8'),
) as { version: string }
const version = manifest.version
if (!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(version))
  throw new Error('Invalid package version')
await access(join(root, 'dist/index.html'))
const output = join(root, 'release')
await mkdir(output, { recursive: true })
const directory = await mkdtemp(join(tmpdir(), 'devnotes-package-'))
try {
  const folder = `devnotes-${version}-linux`
  const runtime = join(directory, folder)
  await mkdir(join(runtime, 'scripts/local'), { recursive: true })
  await mkdir(join(runtime, 'public'), { recursive: true })
  await cp(join(root, 'dist'), join(runtime, 'dist'), { recursive: true })
  for (const name of ['launcher.ts', 'server.ts', 'install.ts'])
    await cp(
      join(root, 'scripts/local', name),
      join(runtime, 'scripts/local', name),
    )
  await cp(
    join(root, 'public/devnotes-icon.svg'),
    join(runtime, 'public/devnotes-icon.svg'),
  )
  await writeFile(
    join(runtime, 'package.json'),
    JSON.stringify(
      {
        name: 'devnotes-local',
        version,
        private: true,
        type: 'module',
        engines: { node: '>=24.0.0 <25' },
        scripts: {
          'local:install': 'node scripts/local/install.ts',
          'local:open': 'node scripts/local/launcher.ts',
          'local:stop': 'node scripts/local/launcher.ts --stop',
          'local:uninstall': 'node scripts/local/install.ts --uninstall',
        },
      },
      null,
      2,
    ) + '\n',
  )
  await writeFile(
    join(runtime, 'README.md'),
    `# DevNotes ${version} for Linux

This archive contains the production web app and local file launcher. Install Node.js 24 and npm 11 or later first. No npm dependency installation or frontend build is required.

Extract the archive to a permanent location and run these commands from that folder:

\`\`\`bash
npm run local:install -- --default
npm run local:open -- "/absolute/path/to/note.md"
\`\`\`

The first command registers DevNotes as the default Markdown application for your Linux user. Omit --default to keep your current default. Double-clicking a Markdown file then opens it in your browser.

Keep this directory and Node executable in place. After moving them, reinstall the association. The default service address is http://127.0.0.1:45164. Saving a launched document writes to its original path; downloads and browser imports remain copies.

Before updating, save your open documents and stop the previous service with \`npm run local:stop\`. Extract the new version and register it again.

To remove the integration, run \`npm run local:stop\` followed by \`npm run local:uninstall\`. Your documents are retained.

Source, dependency information, and licensing status: https://github.com/thiagocorreanet/dev-notes/tree/v${version}
`,
  )
  try {
    await cp(join(root, 'LICENSE'), join(runtime, 'LICENSE'))
  } catch (error) {
    if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT'))
      throw error
  }
  const assets = [`devnotes-${version}-web.zip`, `${folder}.tar.gz`]
  // Remove only the exact output names to prevent zip from retaining stale entries.
  for (const asset of assets) await rm(join(output, asset), { force: true })
  execFileSync('zip', ['-q', '-r', join(output, assets[0]!), '.'], {
    cwd: join(root, 'dist'),
  })
  execFileSync('tar', [
    '-czf',
    join(output, assets[1]!),
    '-C',
    directory,
    folder,
  ])
  const sums = await Promise.all(
    assets.map(
      async (name) =>
        `${createHash('sha256')
          .update(await readFile(join(output, name)))
          .digest('hex')}  ${name}`,
    ),
  )
  await writeFile(join(output, 'SHA256SUMS'), sums.join('\n') + '\n')
  console.log(`Packaged DevNotes ${version} in release/`)
} finally {
  await rm(directory, { recursive: true, force: true })
}
