import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

import { SETTINGS_KEY } from '../ai-settings'
import type { AiSettings } from '../ai-settings'

export function AiSettingsDialog({
  settings,
  onSave,
  onClose,
}: {
  settings: AiSettings
  onSave: (settings: AiSettings) => void
  onClose: () => void
}) {
  const [draft, setDraft] = useState(settings)
  const [error, setError] = useState('')
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Configurar IA</DialogTitle>
          <DialogDescription>
            Conecte o chat a um servidor compatível com Chat Completions. Salvar
            esta configuração não envia mensagens ao servidor.
          </DialogDescription>
        </DialogHeader>
        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault()
            let endpoint: URL
            try {
              endpoint = new URL(draft.endpoint.trim())
              if (
                !['http:', 'https:'].includes(endpoint.protocol) ||
                endpoint.username ||
                endpoint.password ||
                endpoint.search ||
                endpoint.hash
              )
                throw new Error('Invalid endpoint')
            } catch {
              setError(
                'Use um endereço HTTP ou HTTPS, sem senha, parâmetros ou fragmentos na URL.',
              )
              return
            }
            const model = draft.model.trim()
            if (!model) {
              setError('Informe o nome do modelo.')
              return
            }
            const next = {
              endpoint: endpoint.toString().replace(/\/$/, ''),
              model,
              apiKey: draft.apiKey.trim(),
            }
            try {
              localStorage.setItem(
                SETTINGS_KEY,
                JSON.stringify({ endpoint: next.endpoint, model: next.model }),
              )
            } catch {
              setError(
                'Não foi possível salvar a configuração neste navegador.',
              )
              return
            }
            onSave(next)
            onClose()
          }}
        >
          <div className="space-y-2">
            <Label htmlFor="ai-endpoint">Endereço do servidor</Label>
            <Input
              id="ai-endpoint"
              type="url"
              required
              placeholder="https://seu-servidor/v1"
              aria-describedby="ai-endpoint-help"
              value={draft.endpoint}
              onChange={(event) =>
                setDraft({ ...draft, endpoint: event.target.value })
              }
            />
            <p id="ai-endpoint-help" className="text-xs text-muted-foreground">
              Informe a URL base, incluindo /v1 quando necessário. O servidor
              precisa permitir conexões deste navegador (CORS).
            </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="ai-model">Modelo</Label>
            <Input
              id="ai-model"
              required
              maxLength={200}
              value={draft.model}
              onChange={(event) =>
                setDraft({ ...draft, model: event.target.value })
              }
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="ai-key">Chave de API (opcional)</Label>
            <Input
              id="ai-key"
              type="password"
              autoComplete="off"
              value={draft.apiKey}
              onChange={(event) =>
                setDraft({ ...draft, apiKey: event.target.value })
              }
              aria-describedby="ai-key-help"
            />
            <p id="ai-key-help" className="text-xs text-muted-foreground">
              A chave fica apenas na memória desta aba e é apagada ao
              recarregar. Os documentos e backups não incluem essa configuração.
            </p>
          </div>
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          <Button type="submit">Salvar configuração</Button>
        </form>
      </DialogContent>
    </Dialog>
  )
}
