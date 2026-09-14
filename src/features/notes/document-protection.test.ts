import { describe, expect, it } from 'vitest'
import {
  createFolderProtection,
  parseProtectedMarkdown,
  protectNote,
  serializeProtectedMarkdown,
  unlockNote,
  updateProtectedNote,
  verifyFolderPassword,
} from './document-protection'

const password = 'uma-senha-forte'
const note = {
  id: 'note-1',
  title: 'Plano privado',
  content: 'segredo que não pode aparecer em claro',
  revisions: [
    {
      id: 'revision-1',
      title: 'Plano anterior',
      content: 'outro segredo',
      createdAt: '2026-09-14T12:00:00.000Z',
    },
  ],
}

describe('document protection', () => {
  it('encrypts content and history and restores them only with the password', async () => {
    const protectedNote = await protectNote(note, password)

    expect(protectedNote.locked.content).toBe('')
    expect(protectedNote.locked.revisions).toBeUndefined()
    expect(JSON.stringify(protectedNote.locked)).not.toContain('segredo')
    await expect(
      unlockNote(protectedNote.locked, 'senha-errada'),
    ).rejects.toThrow('Senha incorreta')

    const unlocked = await unlockNote(protectedNote.locked, password)
    expect(unlocked.note.content).toBe(note.content)
    expect(unlocked.note.revisions).toEqual(note.revisions)
  })

  it('updates encrypted content with the in-memory key', async () => {
    const protectedNote = await protectNote(note, password)
    const changed = {
      ...protectedNote.unlocked,
      content: 'conteúdo atualizado',
    }
    const updated = await updateProtectedNote(changed, protectedNote.key)

    expect(JSON.stringify(updated.locked)).not.toContain('conteúdo atualizado')
    await expect(unlockNote(updated.locked, password)).resolves.toMatchObject({
      note: { content: 'conteúdo atualizado' },
    })
  })

  it('round-trips an encrypted Markdown envelope without exposing its content', async () => {
    const protectedNote = await protectNote(note, password)
    const markdown = serializeProtectedMarkdown(protectedNote.locked)
    const parsed = parseProtectedMarkdown('plano.md', markdown)

    expect(markdown).not.toContain(note.content)
    expect(parsed).toMatchObject({
      title: note.title,
      content: '',
      protection: { format: 'devnotes-encrypted' },
    })
    const imported = {
      ...note,
      ...parsed!,
      protection: { ...parsed!.protection!, ownerId: note.id },
    }
    await expect(unlockNote(imported, password)).resolves.toMatchObject({
      note: { content: note.content },
    })
  })

  it('verifies protected folders without storing the password', async () => {
    const protection = await createFolderProtection(password)

    expect(JSON.stringify(protection)).not.toContain(password)
    await expect(
      verifyFolderPassword(protection, password),
    ).resolves.toBeUndefined()
    await expect(
      verifyFolderPassword(protection, 'senha-errada'),
    ).rejects.toThrow('Senha incorreta')
  })
})
