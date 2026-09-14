export interface NoteRevision {
  id: string
  title: string
  content: string
  createdAt: string
}

export interface EncryptedPayload {
  algorithm: 'AES-GCM'
  ciphertext: string
  iterations: number
  iv: string
  kdf: 'PBKDF2-SHA-256'
  salt: string
}

export interface NoteProtection {
  format: 'devnotes-encrypted'
  version: 1
  ownerId: string
  payload: EncryptedPayload
}

export interface FolderProtection {
  format: 'devnotes-folder-protection'
  version: 1
  verifier: EncryptedPayload
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
  protection?: NoteProtection
}

export interface WorkspaceFolder {
  id: string
  name: string
  parentId?: string
  deletedAt?: string
  trashBatchId?: string
  protection?: FolderProtection
}

export interface Workspace {
  format: 'dev-notes-workspace'
  version: 1
  name: string
  notes: Note[]
  folders: WorkspaceFolder[]
  suppressedExampleIds?: string[]
}
