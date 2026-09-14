import { describe, expect, it, vi } from 'vitest'
import {
  importDirectory,
  importFileList,
  parseMarkdownFile,
  readMarkdownFile,
} from './workspace-files'
import type { LocalDirectoryHandle, LocalFileHandle } from './workspace-files'

function file(name: string, path: string, content: string) {
  const result = new File([content], name)
  Object.defineProperties(result, {
    webkitRelativePath: { value: path },
    text: { value: () => Promise.resolve(content) },
  })
  return result
}

describe('Folder imports', () => {
  it('preserves nested paths and keeps same-named documents distinct', async () => {
    const result = await importFileList([
      file('readme.md', 'Project/api/readme.md', '# API\n\nAPI notes'),
      file('readme.md', 'Project/web/readme.md', '# Web\n\nWeb notes'),
      file('image.png', 'Project/assets/image.png', 'ignored'),
      file('package.md', 'Project/node_modules/pkg/package.md', 'ignored'),
    ])
    expect(result.notes.map((note) => note.title)).toEqual(['API', 'Web'])
    expect(result.notes[0]?.folderId).not.toBe(result.notes[1]?.folderId)
    expect(result.notes.map((note) => note.sourcePath)).toEqual([
      'Project/api/readme.md',
      'Project/web/readme.md',
    ])
    expect(result.sources.size).toBe(2)
    expect(result.folders.map((folder) => folder.name)).toEqual([
      'Project',
      'api',
      'web',
      'assets',
    ])
  })

  it('imports folders and Markdown files through the native directory picker', async () => {
    const ignoredFile: LocalFileHandle = {
      kind: 'file',
      name: 'config.json',
      getFile: vi.fn(),
    }
    function directory(
      name: string,
      entries: (LocalDirectoryHandle | LocalFileHandle)[],
    ): LocalDirectoryHandle {
      return {
        kind: 'directory',
        name,
        values: async function* () {
          yield* await Promise.resolve(entries)
        },
      }
    }
    const result = await importDirectory(
      directory('Project', [
        directory('assets', [ignoredFile]),
        directory('empty', []),
        directory('docs', [
          directory('guides', [
            {
              kind: 'file',
              name: 'guide.MARKDOWN',
              getFile: () =>
                Promise.resolve(
                  file('guide.MARKDOWN', '', '# Guide\n\nContent'),
                ),
            },
          ]),
        ]),
      ]),
    )
    expect(ignoredFile.getFile).not.toHaveBeenCalled()
    expect(result.notes.map((note) => note.title)).toEqual(['Guide'])
    expect(result.folders.map((folder) => folder.name)).toEqual([
      'Project',
      'assets',
      'empty',
      'docs',
      'guides',
    ])
    expect(result.folders[4]?.parentId).toBe(result.folders[3]?.id)
    expect(result.notes[0]?.folderId).toBe(result.folders[4]?.id)
  })

  it('accepts folders without Markdown documents', async () => {
    await expect(
      importDirectory({
        kind: 'directory',
        name: 'Empty',
        values: async function* () {
          yield* await Promise.resolve([])
        },
      }),
    ).resolves.toMatchObject({ notes: [], folders: [{ name: 'Empty' }] })
    await expect(
      importFileList([file('data.json', 'Folder/data.json', '{}')]),
    ).resolves.toMatchObject({ notes: [], folders: [{ name: 'Folder' }] })
  })

  it.each([
    'note.txt',
    'notes.json',
    'document.pdf',
    'image.png',
    'note.md.exe',
  ])('rejects %s before reading content', async (name) => {
    const text = vi.fn()
    await expect(
      readMarkdownFile({ name, text } as unknown as File),
    ).rejects.toThrow('Selecione um arquivo Markdown')
    expect(text).not.toHaveBeenCalled()
  })

  it.each(['note.md', 'note.markdown', 'note.MD', 'note.MARKDOWN'])(
    'accepts %s',
    async (name) => {
      await expect(
        readMarkdownFile(file(name, '', 'Content')),
      ).resolves.toEqual({ title: 'note', content: 'Content' })
    },
  )

  it('uses the filename when there is no top-level heading and reads CRLF headings', () => {
    expect(parseMarkdownFile('meeting.md', 'Plain text')).toEqual({
      title: 'meeting',
      content: 'Plain text',
    })
    expect(parseMarkdownFile('note.md', '# Heading\r\n\r\nBody')).toEqual({
      title: 'Heading',
      content: 'Body',
    })
  })

  it('rejects oversized files before reading their content', async () => {
    const large = file('large.md', 'Folder/large.md', '')
    Object.defineProperty(large, 'size', { value: 3 * 1024 * 1024 })
    await expect(readMarkdownFile(large)).rejects.toThrow('2 MB')
  })
})
