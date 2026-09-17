import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useDiskNotes } from './use-disk-notes'
import { diskWorkspaceFixture } from '@/test/disk-workspace-fixture'

afterEach(() => {
  history.replaceState(null, '', '/')
  vi.unstubAllGlobals()
})

async function open(files: Record<string, string | Uint8Array | null>) {
  const fixture = diskWorkspaceFixture(files)
  fixture.install()
  const hook = renderHook(() => useDiskNotes(fixture.id))
  await waitFor(() => expect(hook.result.current.disk.loading).toBe(false))
  await act(() => hook.result.current.disk.flush())
  return { fixture, ...hook }
}

const settle = async (result: { current: ReturnType<typeof useDiskNotes> }) => {
  await act(() => result.current.disk.flush())
  await waitFor(() => expect(result.current.disk.saving).toBe(false))
}

describe('Disk workspace store', () => {
  it('shows the folder tree and keeps document ids after reopening', async () => {
    const { fixture, result, unmount } = await open({
      'Clientes/Contratos/Acme.md': '# Contrato Acme\n\nAssinado',
      'Leia.md': 'Primeiros passos',
      Vazia: null,
      'Clientes/manual.pdf': new TextEncoder().encode('%PDF-1.7'),
    })
    expect(result.current.disk.name).toBe('Notas')
    expect(result.current.folders.map((folder) => folder.name).sort()).toEqual([
      'Clientes',
      'Contratos',
      'Vazia',
    ])
    const acme = result.current.notes.find(
      (note) => note.title === 'Contrato Acme',
    )!
    expect(result.current.disk.pathOf(acme.id)).toBe(
      'Clientes/Contratos/Acme.md',
    )
    expect(result.current.disk.pdfs).toHaveLength(1)
    expect(fixture.metadata()?.items).toHaveLength(6)

    unmount()
    const reopened = renderHook(() => useDiskNotes(fixture.id))
    await waitFor(() =>
      expect(reopened.result.current.disk.loading).toBe(false),
    )
    expect(
      reopened.result.current.notes.find((note) => note.id === acme.id)?.title,
    ).toBe('Contrato Acme')
  })

  it('creates folders and pages inside the selected folder on disk', async () => {
    const { fixture, result } = await open({ 'Clientes/Leia.md': 'Olá' })
    const clientes = result.current.folders[0]!

    let arquivo = clientes
    act(() => {
      arquivo = result.current.addFolder('Arquivo 2026', clientes.id)
    })
    let page = result.current.notes[0]!
    act(() => {
      page = result.current.addNote('Reunião: equipe', 'Pauta', arquivo.id)
    })
    await settle(result)

    expect(fixture.paths()).toEqual([
      'Clientes',
      'Clientes/Arquivo 2026',
      'Clientes/Arquivo 2026/Reunião- equipe.md',
      'Clientes/Leia.md',
    ])
    expect(fixture.read('Clientes/Arquivo 2026/Reunião- equipe.md')).toBe(
      '# Reunião: equipe\n\nPauta',
    )
    expect(
      result.current.notes.find((note) => note.id === page.id),
    ).toMatchObject({ folderId: arquivo.id, title: 'Reunião: equipe' })
    expect(() => result.current.addFolder('arquivo 2026', clientes.id)).toThrow(
      'Já existe uma pasta',
    )
    expect(() => result.current.addFolder('.oculta')).toThrow('nome de pasta')
  })

  it('writes edits to the same file and keeps text before the content', async () => {
    const { fixture, result } = await open({
      'Guia.md': '# Guia\r\n\r\nOriginal',
    })
    const guia = result.current.notes[0]!
    act(() => {
      result.current.saveNote({ ...guia, content: 'Atualizado' })
    })
    await settle(result)
    expect(fixture.read('Guia.md')).toBe('# Guia\r\n\r\nAtualizado')
  })

  it('renames and moves files and folders on disk without changing ids', async () => {
    const { fixture, result } = await open({
      'Clientes/Acme.md': '# Acme\n\nTexto',
      'Arquivo/Antigo.md': '# Antigo\n\nTexto',
    })
    const acme = result.current.notes.find((note) => note.title === 'Acme')!
    const clientes = result.current.folders.find(
      (folder) => folder.name === 'Clientes',
    )!
    const arquivo = result.current.folders.find(
      (folder) => folder.name === 'Arquivo',
    )!

    act(() => {
      result.current.runAction({
        kind: 'note',
        id: acme.id,
        type: 'rename',
        name: 'Acme Ltda',
      })
    })
    await settle(result)
    expect(fixture.read('Clientes/Acme Ltda.md')).toBe('# Acme Ltda\n\nTexto')
    expect(fixture.read('Clientes/Acme.md')).toBeUndefined()

    act(() => {
      result.current.runAction({
        kind: 'folder',
        id: clientes.id,
        type: 'move',
        parentId: arquivo.id,
      })
    })
    await settle(result)
    act(() => {
      result.current.runAction({
        kind: 'folder',
        id: arquivo.id,
        type: 'rename',
        name: 'Histórico',
      })
    })
    await settle(result)

    expect(fixture.paths()).toEqual([
      'Histórico',
      'Histórico/Antigo.md',
      'Histórico/Clientes',
      'Histórico/Clientes/Acme Ltda.md',
    ])
    expect(result.current.disk.pathOf(acme.id)).toBe(
      'Histórico/Clientes/Acme Ltda.md',
    )
    expect(
      result.current.folders.find((folder) => folder.id === clientes.id)
        ?.parentId,
    ).toBe(arquivo.id)
  })

  it('reports a name collision and returns to what is on disk', async () => {
    const { fixture, result } = await open({
      'A/Plano.md': '# Plano\n\nA',
      'B/Plano.md': '# Plano\n\nB',
    })
    const plano = result.current.notes.find((note) => note.content === 'A')!
    const b = result.current.folders.find((folder) => folder.name === 'B')!
    act(() => {
      result.current.runAction({
        kind: 'note',
        id: plano.id,
        type: 'move',
        parentId: b.id,
      })
    })
    await settle(result)
    expect(result.current.error).toBe(
      'Já existe um item chamado "Plano.md" nesse local.',
    )
    expect(fixture.read('A/Plano.md')).toBe('# Plano\n\nA')
    expect(
      result.current.notes.find((note) => note.id === plano.id)?.folderId,
    ).not.toBe(b.id)
  })

  it('sends items to the workspace trash and restores them with their ids', async () => {
    const { fixture, result } = await open({
      'Clientes/Acme.md': '# Acme\n\nTexto',
      'Clientes/imagem.png': 'png',
    })
    const clientes = result.current.folders[0]!
    const acme = result.current.notes[0]!

    act(() => {
      result.current.runAction({
        kind: 'folder',
        id: clientes.id,
        type: 'trash',
      })
    })
    await settle(result)
    expect(fixture.paths()).toEqual([])
    expect(fixture.metadata()?.trash).toMatchObject([
      { id: clientes.id, path: 'Clientes' },
    ])
    expect(
      result.current.folders.find((folder) => folder.id === clientes.id),
    ).toMatchObject({
      name: 'Clientes',
      deletedAt: expect.any(String) as string,
    })

    act(() => {
      result.current.runAction({
        kind: 'folder',
        id: clientes.id,
        type: 'restore',
      })
    })
    await settle(result)
    expect(fixture.paths()).toEqual([
      'Clientes',
      'Clientes/Acme.md',
      'Clientes/imagem.png',
    ])
    expect(
      result.current.notes.find((note) => note.id === acme.id)?.content,
    ).toBe('Texto')

    act(() => {
      result.current.runAction({ kind: 'note', id: acme.id, type: 'trash' })
    })
    await settle(result)
    act(() => {
      result.current.runAction({ kind: 'note', id: acme.id, type: 'purge' })
    })
    await settle(result)
    expect(fixture.paths()).toEqual(['Clientes', 'Clientes/imagem.png'])
    expect(fixture.metadata()?.trash).toEqual([])
    expect(
      [...fixture.disk.keys()].some((path) => path.includes('trash/')),
    ).toBe(false)
  })

  it('duplicates folders with every file and points internal links to the copies', async () => {
    const { fixture, result } = await open({
      'Projeto/A.md': '# A\n\nTexto',
      'Projeto/imagem.png': 'png',
    })
    const a = result.current.notes[0]!
    act(() => {
      result.current.saveNote({ ...a, content: `Veja [B](#note/${a.id})` })
    })
    await settle(result)
    const projeto = result.current.folders[0]!
    act(() => {
      result.current.runAction({
        kind: 'folder',
        id: projeto.id,
        type: 'duplicate',
        newId: 'copia',
      })
    })
    await settle(result)

    expect(fixture.paths()).toEqual([
      'Projeto',
      'Projeto (cópia)',
      'Projeto (cópia)/A.md',
      'Projeto (cópia)/imagem.png',
      'Projeto/A.md',
      'Projeto/imagem.png',
    ])
    const copy = result.current.notes.find((note) => note.folderId === 'copia')!
    expect(copy.content).toBe(`Veja [B](#note/${copy.id})`)
    expect(fixture.read('Projeto/A.md')).toBe(`# A\n\nVeja [B](#note/${a.id})`)
  })

  it('loads outside edits and asks before replacing a file changed elsewhere', async () => {
    const { fixture, result } = await open({ 'Guia.md': '# Guia\n\nOriginal' })
    const guia = result.current.notes[0]!

    fixture.write('Guia.md', '# Guia\n\nEditado no terminal')
    await act(() => result.current.disk.refresh())
    expect(result.current.notes[0]?.content).toBe('Editado no terminal')

    fixture.write('Guia.md', '# Guia\n\nOutra mudança externa')
    act(() => {
      result.current.saveNote({ ...guia, content: 'Minha versão' })
    })
    await settle(result)
    expect(result.current.disk.conflict).toMatchObject({
      id: guia.id,
      kind: 'changed',
    })
    expect(fixture.read('Guia.md')).toBe('# Guia\n\nOutra mudança externa')

    act(() => result.current.disk.resolveConflict(guia.id, 'disk'))
    await settle(result)
    expect(result.current.disk.conflict).toBeNull()
    const loaded = result.current.notes.find((note) => note.id === guia.id)!
    expect(loaded.content).toBe('Outra mudança externa')
    expect(loaded.revisions?.[0]?.content).toBe('Minha versão')

    fixture.write('Guia.md', '# Guia\n\nTerceira mudança')
    act(() => {
      result.current.saveNote({ ...loaded, content: 'Fica esta' })
    })
    await settle(result)
    act(() => result.current.disk.resolveConflict(guia.id, 'local'))
    await settle(result)
    expect(fixture.read('Guia.md')).toBe('# Guia\n\nFica esta')
  })

  it('stores encrypted envelopes and removes readable history from disk', async () => {
    const { fixture, result } = await open({ 'Plano.md': '# Plano\n\nSegredo' })
    const plano = result.current.notes[0]!
    act(() => {
      result.current.runAction({
        kind: 'note',
        id: plano.id,
        type: 'rename',
        name: 'Plano privado',
      })
    })
    await settle(result)
    expect(
      [...fixture.disk.keys()].some((path) =>
        path.includes('.devnotes/history/'),
      ),
    ).toBe(true)

    const envelope = {
      format: 'devnotes-encrypted' as const,
      version: 1 as const,
      ownerId: plano.id,
      payload: {
        algorithm: 'AES-GCM' as const,
        kdf: 'PBKDF2-SHA-256' as const,
        iterations: 310000,
        salt: 'c2FsdA==',
        iv: 'aXY=',
        ciphertext: 'Y2lwaGVy',
      },
    }
    const current = result.current.notes[0]!
    act(() => {
      result.current.replaceItems(
        [
          {
            id: current.id,
            title: current.title,
            content: '',
            protection: envelope,
          },
        ],
        result.current.folders,
      )
    })
    await settle(result)
    const raw = fixture.read('Plano privado.md')!
    expect(raw).toContain('devnotes:encrypted:v1')
    expect(raw).not.toContain('Segredo')
    expect(
      [...fixture.disk.keys()].some((path) =>
        path.includes('.devnotes/history/'),
      ),
    ).toBe(false)

    act(() => {
      result.current.replaceItems(
        [{ id: current.id, title: current.title, content: 'Segredo' }],
        result.current.folders,
      )
    })
    await settle(result)
    expect(fixture.read('Plano privado.md')).toBe('# Plano privado\n\nSegredo')
  })
})
