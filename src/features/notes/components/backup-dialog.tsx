import { useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@/components/ui/select'
import { readWorkspaceBackup } from '../workspace-backup'
import type { BackupMode } from '../workspace-backup'
import type { Workspace } from '../types'
import { WORKSPACE_KEY } from '../workspace-storage'
import { WorkspaceError } from '../workspace-error'

function formatCount(count: number, singular: string, plural = `${singular}s`) {
  return `${count} ${count === 1 ? singular : plural}`
}

export function BackupDialog({
  onImport,
  onDownloadCurrent,
  onClose,
}: {
  onImport: (
    workspace: Workspace,
    mode: BackupMode,
    expectedStored: string | null,
  ) => void
  onDownloadCurrent: () => void
  onClose: () => void
}) {
  const [preview, setPreview] = useState<{
    workspace: Workspace
    stored: string | null
  } | null>(null)
  const [mode, setMode] = useState<BackupMode>('merge')
  const [confirmed, setConfirmed] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  async function choose(file?: File) {
    setPreview(null)
    setConfirmed(false)
    setError('')
    if (!file) return
    setBusy(true)
    try {
      const workspace = await readWorkspaceBackup(file)
      setPreview({ workspace, stored: localStorage.getItem(WORKSPACE_KEY) })
    } catch (failure) {
      setError(
        failure instanceof WorkspaceError
          ? failure.message
          : 'Não foi possível abrir o backup.',
      )
    } finally {
      setBusy(false)
    }
  }
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !busy) onClose()
      }}
    >
      <DialogContent className="max-h-[90svh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Importar backup</DialogTitle>
          <DialogDescription>
            Recupere documentos, pastas, favoritos, lixeira e histórico de um
            backup JSON do DevNotes. Até 20 MB e 2.000 itens.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Label htmlFor="backup-file">Arquivo de backup</Label>
          <Input
            id="backup-file"
            type="file"
            accept=".json,application/json"
            disabled={busy}
            onChange={(event) => {
              void choose(event.currentTarget.files?.[0])
            }}
          />
        </div>
        {preview && (
          <>
            <div className="space-y-1 text-sm" aria-label="Prévia do backup">
              <p className="font-medium">{preview.workspace.name}</p>
              <p>
                {formatCount(
                  preview.workspace.notes.filter((note) => !note.deletedAt)
                    .length,
                  'documento',
                )}{' '}
                ·{' '}
                {formatCount(
                  preview.workspace.folders.filter(
                    (folder) => !folder.deletedAt,
                  ).length,
                  'pasta',
                )}
              </p>
              <p>
                {formatCount(
                  preview.workspace.notes.filter((note) => note.deletedAt)
                    .length,
                  'documento',
                )}{' '}
                na lixeira ·{' '}
                {formatCount(
                  preview.workspace.notes.reduce(
                    (count, note) => count + (note.revisions?.length ?? 0),
                    0,
                  ),
                  'versão',
                  'versões',
                )}{' '}
                no histórico
              </p>
            </div>
            <Label htmlFor="backup-mode">Como importar</Label>
            <Select
              value={mode}
              onValueChange={(value: BackupMode) => {
                setMode(value)
                setConfirmed(false)
              }}
            >
              <SelectTrigger id="backup-mode">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="merge">Mesclar em uma nova pasta</SelectItem>
                <SelectItem value="replace">
                  Restaurar o espaço de trabalho
                </SelectItem>
              </SelectContent>
            </Select>
            <p className="text-sm text-muted-foreground">
              {mode === 'merge'
                ? 'Os documentos atuais serão mantidos. O backup será adicionado em uma pasta separada, sem substituir itens com o mesmo nome.'
                : 'Os documentos deste navegador, incluindo temporários e lixeira, serão substituídos. A pasta local será desconectada. Arquivos originais abertos pelo aplicativo continuarão abertos.'}
            </p>
            <p className="text-sm text-muted-foreground">
              Os documentos importados são cópias neste navegador. O backup não
              concede acesso a arquivos no computador.
            </p>
            {mode === 'replace' && (
              <>
                <Button
                  variant="outline"
                  onClick={() => {
                    try {
                      onDownloadCurrent()
                    } catch {
                      setError('Não foi possível baixar o backup atual.')
                    }
                  }}
                >
                  Baixar backup atual
                </Button>
                <div className="flex items-start gap-2">
                  <Checkbox
                    id="backup-confirm"
                    checked={confirmed}
                    onCheckedChange={(value) => setConfirmed(value === true)}
                  />
                  <Label htmlFor="backup-confirm">
                    Entendo que a restauração substituirá o espaço de trabalho
                    deste navegador.
                  </Label>
                </div>
              </>
            )}
          </>
        )}
        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        <div className="flex justify-end gap-2">
          <Button variant="outline" disabled={busy} onClick={onClose}>
            Cancelar
          </Button>
          <Button
            disabled={busy || !preview || (mode === 'replace' && !confirmed)}
            onClick={() => {
              if (!preview) return
              try {
                onImport(preview.workspace, mode, preview.stored)
                onClose()
              } catch (failure) {
                setError(
                  failure instanceof WorkspaceError
                    ? failure.message
                    : 'Não foi possível importar o backup.',
                )
              }
            }}
          >
            {busy
              ? 'Lendo backup…'
              : mode === 'replace'
                ? 'Restaurar backup'
                : 'Mesclar backup'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
