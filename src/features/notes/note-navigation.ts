import { createContext } from 'react'
import type { Note, WorkspaceFolder } from './types'

export const NoteNavigationContext = createContext<{
  notes: Note[]
  folders: WorkspaceFolder[]
  onSelect: (id: string) => void
} | null>(null)
