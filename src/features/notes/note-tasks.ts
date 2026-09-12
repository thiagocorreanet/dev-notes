import { unified } from 'unified'
import remarkParse from 'remark-parse'
import remarkGfm from 'remark-gfm'
import type { RootContent } from 'mdast'
import type { Note, WorkspaceFolder } from './types'

const parser = unified().use(remarkParse).use(remarkGfm)

export interface NoteTask {
  noteId: string
  offset: number
  end: number
  label: string
  checked: boolean
}

function text(node: RootContent): string {
  if ('value' in node) return node.value
  if ('alt' in node) return node.alt ?? ''
  return 'children' in node ? node.children.map(text).join('') : ''
}

export function noteTasks(note: Note): NoteTask[] {
  if (note.deletedAt) return []
  const tasks: NoteTask[] = []
  function visit(node: RootContent) {
    if (node.type === 'listItem' && typeof node.checked === 'boolean') {
      const start = node.position?.start.offset
      if (start !== undefined) {
        const marker = /^(?:[-+*]|\d+[.)])[\t ]+\[([ xX])\]/.exec(
          note.content.slice(start),
        )
        if (marker) {
          tasks.push({
            noteId: note.id,
            offset: start + marker[0].length - 2,
            end:
              node.children[0]?.position?.end.offset ??
              start + marker[0].length,
            checked: node.checked,
            label: node.children[0]
              ? text(node.children[0])
              : 'Tarefa sem texto',
          })
        }
      }
    }
    if ('children' in node) node.children.forEach(visit)
  }
  parser.parse(note.content).children.forEach(visit)
  return tasks
}

export function toggleNoteTask(
  note: Note,
  task: NoteTask,
  checked: boolean,
): Note {
  const current = noteTasks(note).find(
    (item) => item.offset === task.offset && item.label === task.label,
  )
  if (!current || task.noteId !== note.id) return note
  return {
    ...note,
    content:
      note.content.slice(0, current.offset) +
      (checked ? 'x' : ' ') +
      note.content.slice(current.offset + 1),
  }
}

export function folderPath(
  id: string | undefined,
  folders: WorkspaceFolder[],
): string {
  const names: string[] = []
  const visited = new Set<string>()
  while (id && !visited.has(id)) {
    visited.add(id)
    const folder = folders.find((item) => item.id === id)
    if (!folder) break
    names.unshift(folder.name)
    id = folder.parentId
  }
  return names.join('/')
}

export function isWithinFolder(
  note: Note,
  folderId: string,
  folders: WorkspaceFolder[],
): boolean {
  let id = note.folderId
  const visited = new Set<string>()
  while (id && !visited.has(id)) {
    if (id === folderId) return true
    visited.add(id)
    id = folders.find((folder) => folder.id === id)?.parentId
  }
  return false
}
