export interface NoteRevision {
  id: string
  title: string
  content: string
  createdAt: string
}

export interface Note {
  id: string
  title: string
  content: string
  folderId?: string
  sourcePath?: string
  revisions?: NoteRevision[]
  favorite?: boolean
  deletedAt?: string
  trashBatchId?: string
}

export interface WorkspaceFolder {
  id: string
  name: string
  parentId?: string
  deletedAt?: string
  trashBatchId?: string
}

export interface Workspace {
  format: 'dev-notes-workspace'
  version: 1
  name: string
  notes: Note[]
  folders: WorkspaceFolder[]
  suppressedExampleIds?: string[]
}
