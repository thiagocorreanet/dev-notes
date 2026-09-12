import { vi } from 'vitest'
import type {
  LocalDirectoryHandle,
  LocalFileHandle,
} from '../features/notes/workspace-files'

export function localFolderFixture(initial: Record<string, string> = {}) {
  const disk = new Map(Object.entries(initial))
  const writes = vi.fn<(path: string, raw: string) => void>()
  const directories = new Set([''])
  for (const path of disk.keys()) {
    const parts = path.split('/')
    for (let i = 1; i < parts.length; i++)
      directories.add(parts.slice(0, i).join('/'))
  }
  const missing = () => new DOMException('Missing entry', 'NotFoundError')
  function file(path: string): LocalFileHandle {
    return {
      kind: 'file',
      name: path.split('/').at(-1)!,
      getFile: () => {
        const raw = disk.get(path)
        if (raw === undefined) return Promise.reject(missing())
        const result = new File([raw], path.split('/').at(-1)!)
        Object.defineProperty(result, 'text', {
          value: () => Promise.resolve(raw),
        })
        return Promise.resolve(result)
      },
      createWritable: () => {
        let pending = ''
        return Promise.resolve({
          write: (raw: string) => {
            pending = raw
            return Promise.resolve()
          },
          close: () => {
            writes(path, pending)
            disk.set(path, pending)
            return Promise.resolve()
          },
          abort: () => Promise.resolve(),
        })
      },
    }
  }
  function directory(path: string): LocalDirectoryHandle {
    const prefix = path ? `${path}/` : ''
    return {
      kind: 'directory',
      name: path.split('/').at(-1) || 'Project',
      values: async function* () {
        const children: (LocalDirectoryHandle | LocalFileHandle)[] = []
        for (const child of directories)
          if (
            child.startsWith(prefix) &&
            child !== path &&
            !child.slice(prefix.length).includes('/')
          )
            children.push(directory(child))
        for (const child of disk.keys())
          if (
            child.startsWith(prefix) &&
            !child.slice(prefix.length).includes('/')
          )
            children.push(file(child))
        yield* await Promise.resolve(children)
      },
      getFileHandle: (name, options) => {
        const target = `${prefix}${name}`
        if (!disk.has(target)) {
          if (!options?.create) return Promise.reject(missing())
          disk.set(target, '')
        }
        return Promise.resolve(file(target))
      },
      getDirectoryHandle: (name, options) => {
        const target = `${prefix}${name}`
        if (!directories.has(target)) {
          if (!options?.create) return Promise.reject(missing())
          directories.add(target)
        }
        return Promise.resolve(directory(target))
      },
    }
  }
  return { root: directory(''), disk, writes }
}
