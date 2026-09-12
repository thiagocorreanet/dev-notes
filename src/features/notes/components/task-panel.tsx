import { useMemo, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import type { Note, WorkspaceFolder } from '../types'
import {
  folderPath,
  isWithinFolder,
  noteTasks,
  toggleNoteTask,
} from '../note-tasks'
import type { NoteTask } from '../note-tasks'

export function TaskPanel({
  notes,
  folders,
  busy,
  onEdit,
  onNavigate,
  onClose,
}: {
  notes: Note[]
  folders: WorkspaceFolder[]
  busy: boolean
  onEdit: (note: Note) => void
  onNavigate: (task: NoteTask) => void
  onClose: () => void
}) {
  const [status, setStatus] = useState('pending')
  const [folder, setFolder] = useState('all')
  const [documentId, setDocumentId] = useState('all')
  const [query, setQuery] = useState('')
  const navigating = useRef(false)
  const tasks = useMemo(() => notes.flatMap(noteTasks), [notes])
  const pending = tasks.filter((task) => !task.checked).length
  const visible = tasks.filter((task) => {
    const note = notes.find((item) => item.id === task.noteId)!
    return (
      (status === 'all' || task.checked === (status === 'done')) &&
      (documentId === 'all' || task.noteId === documentId) &&
      (folder === 'all' || isWithinFolder(note, folder, folders)) &&
      `${task.label} ${note.title}`
        .toLocaleLowerCase('pt-BR')
        .includes(query.toLocaleLowerCase('pt-BR'))
    )
  })
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
    >
      <DialogContent
        className="max-h-[90svh] overflow-y-auto sm:max-w-3xl"
        onCloseAutoFocus={(event) => {
          if (navigating.current) event.preventDefault()
        }}
      >
        <DialogHeader>
          <DialogTitle>Painel de tarefas</DialogTitle>
          <DialogDescription>
            As tarefas vêm das checklists das suas notas. Marcar uma tarefa
            atualiza o documento; arquivos conectados precisam ser salvos na
            pasta.
          </DialogDescription>
        </DialogHeader>
        <p role="status" className="text-sm text-muted-foreground">
          {pending} {pending === 1 ? 'pendente' : 'pendentes'} ·{' '}
          {tasks.length - pending}{' '}
          {tasks.length - pending === 1 ? 'concluída' : 'concluídas'}
        </p>
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="min-w-0 space-y-2">
            <Label htmlFor="task-status">Status</Label>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger className="w-full min-w-0" id="task-status">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="pending">Pendentes</SelectItem>
                <SelectItem value="done">Concluídas</SelectItem>
                <SelectItem value="all">Todas</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="min-w-0 space-y-2">
            <Label htmlFor="task-folder">Pasta</Label>
            <Select value={folder} onValueChange={setFolder}>
              <SelectTrigger className="w-full min-w-0" id="task-folder">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas as pastas</SelectItem>
                {folders.map((item) => (
                  <SelectItem key={item.id} value={item.id}>
                    {folderPath(item.id, folders)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="min-w-0 space-y-2">
            <Label htmlFor="task-document">Documento</Label>
            <Select value={documentId} onValueChange={setDocumentId}>
              <SelectTrigger className="w-full min-w-0" id="task-document">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os documentos</SelectItem>
                {notes.map((note) => (
                  <SelectItem key={note.id} value={note.id}>
                    {note.title || 'Documento sem título'}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="min-w-0 space-y-2">
          <Label htmlFor="task-query">Buscar tarefas</Label>
          <Input
            id="task-query"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Texto da tarefa ou título da nota"
          />
        </div>
        {!visible.length ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            Nenhuma tarefa encontrada com estes filtros.
          </p>
        ) : (
          <ul className="divide-y">
            {visible.map((task) => {
              const note = notes.find((item) => item.id === task.noteId)!
              return (
                <li
                  key={`${task.noteId}-${task.offset}`}
                  className="flex items-start gap-3 py-3"
                >
                  <Checkbox
                    className="mt-1"
                    checked={task.checked}
                    disabled={busy}
                    aria-label={`Concluir tarefa: ${task.label}`}
                    onCheckedChange={(checked) =>
                      onEdit(toggleNoteTask(note, task, checked === true))
                    }
                  />
                  <div className="min-w-0 flex-1">
                    <p
                      className={`break-words text-sm ${task.checked ? 'text-muted-foreground line-through' : ''}`}
                    >
                      {task.label}
                    </p>
                    <Button
                      variant="link"
                      className="h-auto max-w-full justify-start whitespace-normal px-0 text-left"
                      onClick={() => {
                        navigating.current = true
                        onNavigate(task)
                      }}
                    >
                      {note.title || 'Documento sem título'}
                    </Button>
                    <p className="break-words text-xs text-muted-foreground">
                      {folderPath(note.folderId, folders) || 'Pasta principal'}
                    </p>
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </DialogContent>
    </Dialog>
  )
}
