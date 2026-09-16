import { describe, expect, it, vi } from 'vitest'
import { localFolderFixture } from '@/test/local-folder-fixture'
import {
  FileChangedError,
  scanLocalFolder,
  serializeLocalNote,
  syncStatus,
  validateLocalPath,
  writeLocalPath,
} from './local-folder'

const note = { id: 'n', title: 'Guide', content: 'Original' }
const file = {
  noteId: 'n',
  path: 'guide.md',
  baseline: '# Guide\n\nOriginal',
  disk: '# Guide\n\nOriginal',
}

describe('Local folder synchronization', () => {
  it('distinguishes local changes, external changes, conflicts and missing files', () => {
    expect(syncStatus(note, file)).toBe('saved')
    expect(syncStatus({ ...note, content: 'Local' }, file)).toBe('modified')
    expect(syncStatus(note, { ...file, disk: 'External' })).toBe('external')
    expect(
      syncStatus({ ...note, content: 'Local' }, { ...file, disk: 'External' }),
    ).toBe('conflict')
    expect(
      syncStatus(note, { ...file, baseline: null, disk: 'External' }),
    ).toBe('conflict')
    expect(syncStatus(note, { ...file, disk: null })).toBe('missing')
  })
  it('preserves original heading spacing and CRLF, including files without headings', () => {
    expect(
      serializeLocalNote(
        { ...note, content: 'Updated\r\n' },
        { ...file, baseline: '# Guide\r\n\r\nOriginal\r\n' },
      ),
    ).toBe('# Guide\r\n\r\nUpdated\r\n')
    expect(
      serializeLocalNote(
        { ...note, title: 'guide', content: 'Updated' },
        { ...file, baseline: 'Original' },
      ),
    ).toBe('Updated')
    expect(serializeLocalNote({ ...note, title: 'Renamed' }, file)).toBe(
      '# Renamed\n\nOriginal',
    )
  })
  it('scans nested Markdown and PDFs and ignores repository internals', async () => {
    const { root } = localFolderFixture({
      'guide.md': 'Root',
      'sub/task.MD': 'Nested',
      'sub/reference.pdf': '%PDF-1.7\n%%EOF',
      '.git/a.md': 'Ignored',
      'node_modules/a.md': 'Ignored',
      'photo.png': 'Ignored',
    })
    expect(
      (await scanLocalFolder(root)).map((item) => item.path).sort(),
    ).toEqual(['guide.md', 'sub/reference.pdf', 'sub/task.MD'])
  })
  it.each([
    '../note.md',
    '/note.md',
    'sub//note.md',
    '.git/note.md',
    'sub/../note.md',
    'note.txt',
    'sub\\note.md',
  ])('rejects invalid paths: %s', (path) => {
    expect(() => validateLocalPath(path)).toThrow()
  })
  it('writes only after checking the original and creates new subfolders', async () => {
    const { root, disk } = localFolderFixture({ 'guide.md': 'Original' })
    await writeLocalPath(root, 'guide.md', 'Updated', 'Original')
    await writeLocalPath(root, 'new/notes.md', 'Created', null)
    expect(disk.get('guide.md')).toBe('Updated')
    expect(disk.get('new/notes.md')).toBe('Created')
  })
  it('refuses to overwrite an external edit or a file occupying a new path', async () => {
    const { root, writes, disk } = localFolderFixture({
      'guide.md': 'External',
    })
    await expect(
      writeLocalPath(root, 'guide.md', 'Local', 'Original'),
    ).rejects.toBeInstanceOf(FileChangedError)
    await expect(
      writeLocalPath(root, 'guide.md', 'Local', null),
    ).rejects.toBeInstanceOf(FileChangedError)
    expect(writes).not.toHaveBeenCalled()
    expect(disk.get('guide.md')).toBe('External')
  })
  it('aborts a failed write without committing the temporary stream', async () => {
    const { root, disk } = localFolderFixture({ 'guide.md': 'Original' })
    const handle = await root.getFileHandle!('guide.md')
    const close = vi.fn()
    const abort = vi.fn().mockResolvedValue(undefined)
    handle.createWritable = () =>
      Promise.resolve({
        write: () => Promise.reject(new Error('Disk full')),
        close,
        abort,
      })
    root.getFileHandle = () => Promise.resolve(handle)
    await expect(
      writeLocalPath(root, 'guide.md', 'Updated', 'Original'),
    ).rejects.toThrow('Disk full')
    expect(abort).toHaveBeenCalled()
    expect(close).not.toHaveBeenCalled()
    expect(disk.get('guide.md')).toBe('Original')
  })
})
