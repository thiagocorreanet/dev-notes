import { describe, expect, it } from 'vitest'
import {
  availablePath,
  buildDiskModel,
  diskFilename,
  parseDiskMetadata,
  repath,
  serializeDiskHistory,
  serializeDiskMetadata,
  validateDiskFolderName,
} from './disk-workspace'
import type { DiskEntry, DiskSnapshot } from './disk-workspace'
import type { EncryptedPayload, FolderProtection } from './types'

const payload: EncryptedPayload = {
  algorithm: 'AES-GCM',
  kdf: 'PBKDF2-SHA-256',
  iterations: 310000,
  salt: 'c2FsdA==',
  iv: 'aXY=',
  ciphertext: 'Y2lwaGVy',
}
const folderProtection: FolderProtection = {
  format: 'devnotes-folder-protection',
  version: 1,
  verifier: payload,
}

function snapshot(changes: Partial<DiskSnapshot> = {}): DiskSnapshot {
  return {
    name: 'Notas',
    path: '/home/pessoa/Notas',
    skipped: [],
    metadata: null,
    history: {},
    entries: [
      { kind: 'directory', path: 'Clientes' },
      { kind: 'directory', path: 'Clientes/Contratos' },
      {
        kind: 'markdown',
        path: 'Clientes/Contratos/Acme.md',
        raw: '# Contrato Acme\n\nAssinado',
        version: 'v1',
      },
      { kind: 'markdown', path: 'Leia.md', raw: 'Sem título', version: 'v2' },
      { kind: 'pdf', path: 'Clientes/manual.pdf', size: 10 },
    ],
    ...changes,
  }
}

describe('disk workspace model', () => {
  it('mirrors the folder tree and keeps identifiers from metadata', () => {
    const first = buildDiskModel(snapshot())
    const acme = first.notes.find((note) => note.title === 'Contrato Acme')!
    const contratos = first.folders.find(
      (folder) => folder.name === 'Contratos',
    )!
    const clientes = first.folders.find((folder) => folder.name === 'Clientes')!

    expect(contratos.parentId).toBe(clientes.id)
    expect(acme).toMatchObject({ folderId: contratos.id, content: 'Assinado' })
    expect(
      first.notes.find((note) => note.title === 'Leia')?.folderId,
    ).toBeUndefined()
    expect(first.pdfs[0]).toMatchObject({
      title: 'manual',
      mediaType: 'pdf',
      folderId: clientes.id,
    })
    expect(first.metadataChanged).toBe(true)

    const second = buildDiskModel(
      snapshot({ metadata: serializeDiskMetadata(first.metadata) }),
    )
    expect(second.metadataChanged).toBe(false)
    expect(second.notes.map((note) => note.id)).toEqual(
      first.notes.map((note) => note.id),
    )
    expect(second.paths.get(acme.id)).toBe('Clientes/Contratos/Acme.md')
  })

  it('restores favorites, history, folder protection, and trash from metadata', () => {
    const envelope = `<!-- devnotes:encrypted:v1 -->\n${JSON.stringify({
      format: 'devnotes-encrypted',
      version: 1,
      title: 'Plano',
      payload,
    })}\n`
    const entries: DiskEntry[] = [
      { kind: 'directory', path: 'Privado' },
      {
        kind: 'markdown',
        path: 'Privado/Plano.md',
        raw: envelope,
        version: 'v1',
      },
      {
        kind: 'markdown',
        path: 'Leia.md',
        raw: '# Leia\n\nTexto',
        version: 'v2',
      },
    ]
    const first = buildDiskModel(snapshot({ entries }))
    const folder = first.folders[0]!
    const leia = first.notes.find((note) => note.title === 'Leia')!
    const revision = {
      id: 'revision-1',
      title: 'Leia',
      content: 'Texto antigo',
      createdAt: '2026-09-17T09:00:00.000Z',
    }
    const second = buildDiskModel(
      snapshot({
        entries,
        metadata: serializeDiskMetadata({
          ...first.metadata,
          items: first.metadata.items.map((item) =>
            item.id === folder.id
              ? { ...item, protection: folderProtection }
              : item.id === leia.id
                ? { ...item, favorite: true as const }
                : item,
          ),
          trash: [
            {
              id: 'trashed',
              kind: 'folder',
              name: 'Antiga',
              path: 'Privado/Antiga',
              batch: 'batch-1',
              deletedAt: '2026-09-17T10:00:00.000Z',
              items: [],
            },
          ],
        }),
        history: { [leia.id]: serializeDiskHistory([revision]) },
      }),
    )

    expect(
      second.folders.find((item) => item.id === folder.id)?.protection,
    ).toEqual(folderProtection)
    expect(
      second.notes.find((note) => note.title === 'Plano')?.protection?.ownerId,
    ).toBe(folder.id)
    expect(second.notes.find((note) => note.id === leia.id)).toMatchObject({
      favorite: true,
      revisions: [revision],
    })
    expect(second.folders.find((item) => item.id === 'trashed')).toMatchObject({
      name: 'Antiga',
      parentId: folder.id,
      trashBatchId: 'batch-1',
    })
  })

  it('ignores malformed metadata instead of hiding the folder', () => {
    expect(parseDiskMetadata('{broken').items).toEqual([])
    expect(
      parseDiskMetadata(
        JSON.stringify({
          format: 'devnotes-workspace-folder',
          items: [{ id: 'ok', path: 'a.md' }, { path: 'sem-id.md' }],
          trash: [{ id: 'x', kind: 'note', batch: '../fora' }],
        }),
      ),
    ).toMatchObject({ items: [{ id: 'ok', path: 'a.md' }], trash: [] })
  })
})

describe('disk workspace names', () => {
  it('keeps readable filenames and avoids collisions', () => {
    expect(diskFilename('Reunião de equipe: 12/05')).toBe(
      'Reunião de equipe- 12-05.md',
    )
    expect(diskFilename('  ..oculto  ')).toBe('oculto.md')
    expect(diskFilename('')).toBe('Documento sem título.md')
    expect(
      availablePath(
        ['Clientes/Plano.md', 'clientes/plano (2).md'],
        'Clientes',
        'Plano.md',
      ),
    ).toBe('Clientes/Plano (3).md')
    expect(availablePath(['Arquivo'], '', 'Arquivo')).toBe('Arquivo (2)')
  })

  it('validates folder names that must also work on disk', () => {
    expect(validateDiskFolderName(' Clientes ')).toBe('Clientes')
    for (const name of ['', '.oculta', 'a/b', 'a\\b', 'node_modules'])
      expect(() => validateDiskFolderName(name)).toThrow('nome de pasta')
  })

  it('moves nested paths without touching similar names', () => {
    expect(repath('Clientes/Acme/a.md', 'Clientes', 'Arquivo/Clientes')).toBe(
      'Arquivo/Clientes/Acme/a.md',
    )
    expect(repath('Clientes2/a.md', 'Clientes', 'Arquivo')).toBe(
      'Clientes2/a.md',
    )
  })
})
