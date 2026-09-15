import { CircleAlert, ExternalLink, RefreshCw, ShieldCheck } from 'lucide-react'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Progress } from '@/components/ui/progress'
import { Spinner } from '@/components/ui/spinner'
import type { CodexAccountStatus } from '../ai-chat'

const planNames: Record<string, string> = {
  free: 'Free',
  go: 'Go',
  plus: 'Plus',
  pro: 'Pro',
  prolite: 'Pro',
  team: 'Business',
  business: 'Business',
  self_serve_business_prolite: 'Business',
  self_serve_business_usage_based: 'Business',
  enterprise: 'Enterprise',
  enterprise_cbp_automation: 'Enterprise',
  enterprise_cbp_usage_based: 'Enterprise',
  ent26: 'Enterprise',
  edu: 'Edu',
  edu_plus: 'Edu',
  edu_pro: 'Edu',
}

function planName(plan: string | null) {
  return plan ? (planNames[plan] ?? 'ChatGPT') : 'ChatGPT'
}

function resetLabel(timestamp: number | null) {
  if (!timestamp) return null
  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(new Date(timestamp * 1000))
}

export function CodexAccountDialog({
  status,
  loading,
  loginPending,
  loginUrl,
  error,
  onLogin,
  onRefresh,
  onClose,
}: {
  status: CodexAccountStatus | null
  loading: boolean
  loginPending: boolean
  loginUrl: string
  error: string
  onLogin: () => void
  onRefresh: () => void
  onClose: () => void
}) {
  const connected = status?.state === 'connected'
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
    >
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Assistente Codex</DialogTitle>
          <DialogDescription>
            Use o Codex incluído na sua assinatura do ChatGPT para trabalhar em
            suas documentações.
          </DialogDescription>
        </DialogHeader>

        {error && (
          <Alert variant="destructive">
            <CircleAlert aria-hidden="true" />
            <AlertTitle>Não foi possível conectar</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {loading && !status ? (
          <div
            className="flex min-h-36 items-center justify-center gap-2 text-sm text-muted-foreground"
            role="status"
          >
            <Spinner />
            Verificando o Codex…
          </div>
        ) : connected ? (
          <div className="space-y-4">
            <Alert>
              <ShieldCheck aria-hidden="true" />
              <AlertTitle>Conectado com o ChatGPT</AlertTitle>
              <AlertDescription>
                O uso entra nos limites da sua assinatura. O DevNotes não usa
                chave de API e não inicia compras de créditos.
              </AlertDescription>
            </Alert>
            <Card>
              <CardHeader className="flex-row items-center justify-between gap-3">
                <div className="min-w-0">
                  <CardTitle className="text-base">
                    ChatGPT {planName(status.plan)}
                  </CardTitle>
                  {status.email && (
                    <p className="truncate text-sm text-muted-foreground">
                      {status.email}
                    </p>
                  )}
                </div>
                <Badge variant="secondary">Codex</Badge>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-3 text-sm">
                    <span>Uso no período atual</span>
                    <span className="font-medium tabular-nums">
                      {status.primary
                        ? `${status.primary.usedPercent}% usado`
                        : 'Indisponível'}
                    </span>
                  </div>
                  <Progress
                    value={status.primary?.usedPercent ?? 0}
                    aria-label="Uso da assinatura do Codex"
                  />
                  {status.primary && resetLabel(status.primary.resetsAt) && (
                    <p className="text-xs text-muted-foreground">
                      Renova em {resetLabel(status.primary.resetsAt)}.
                    </p>
                  )}
                </div>
                <p className="text-xs text-muted-foreground">
                  Modelo para documentação: {status.model}.
                </p>
              </CardContent>
            </Card>
          </div>
        ) : status?.state === 'unavailable' ? (
          <Alert variant="destructive">
            <CircleAlert aria-hidden="true" />
            <AlertTitle>Codex não encontrado</AlertTitle>
            <AlertDescription>
              Instale o Codex CLI e abra o DevNotes pelo aplicativo local para
              usar o assistente.
            </AlertDescription>
          </Alert>
        ) : (
          <div className="space-y-4">
            {status?.state === 'unsupported' && (
              <Alert variant="destructive">
                <CircleAlert aria-hidden="true" />
                <AlertTitle>Conexão por API detectada</AlertTitle>
                <AlertDescription>
                  Entre com o ChatGPT para que o DevNotes use somente sua
                  assinatura. Nenhuma chave de API será aceita pelo editor.
                </AlertDescription>
              </Alert>
            )}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">
                  Entre com sua conta do ChatGPT
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm text-muted-foreground">
                <p>
                  A autenticação acontece na página oficial da OpenAI. O Codex
                  guarda e renova a sessão localmente.
                </p>
                <Button onClick={onLogin} disabled={loading || loginPending}>
                  {loading || loginPending ? <Spinner /> : <ExternalLink />}
                  {loginPending ? 'Aguardando entrada…' : 'Entrar com ChatGPT'}
                </Button>
                {loginPending && loginUrl && (
                  <p className="text-xs">
                    A página não abriu?{' '}
                    <a
                      className="font-medium text-primary underline underline-offset-4"
                      href={loginUrl}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Continuar no ChatGPT
                    </a>
                  </p>
                )}
              </CardContent>
            </Card>
          </div>
        )}

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            disabled={loading}
            onClick={onRefresh}
          >
            {loading ? <Spinner /> : <RefreshCw />}
            Atualizar
          </Button>
          <Button type="button" onClick={onClose}>
            Concluir
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
