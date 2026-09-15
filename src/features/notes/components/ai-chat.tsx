import { useEffect, useRef, useState } from 'react'
import {
  ArrowUp,
  FilePenLine,
  FileText,
  LoaderCircle,
  MessageCircle,
  Plus,
  Settings2,
  Sparkles,
  Square,
  X,
} from 'lucide-react'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupTextarea,
} from '@/components/ui/input-group'
import { Label } from '@/components/ui/label'
import {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from '@/components/ui/popover'
import type { Note } from '../types'
import { requestChatReply } from '../ai-chat'
import type {
  ChatMessage,
  CodexAccountStatus,
  DocumentProposal,
} from '../ai-chat'
import { AiProposalDialog } from './ai-proposal-dialog'
import { MarkdownPreview } from './markdown-preview'

const planNames: Record<string, string> = {
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

export function AiChat({
  status,
  accountLoading,
  note,
  canUseDocument,
  canApplyDocument,
  onConfigure,
  onApplyDocument,
  onRefreshStatus,
}: {
  status: CodexAccountStatus | null
  accountLoading: boolean
  note: Note
  canUseDocument: boolean
  canApplyDocument: boolean
  onConfigure: () => void
  onApplyDocument: (noteId: string, markdown: string) => void
  onRefreshStatus: () => void
}) {
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState('')
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [pending, setPending] = useState<ChatMessage | null>(null)
  const [includeDocument, setIncludeDocument] = useState(false)
  const [threadId, setThreadId] = useState<string>()
  const [proposal, setProposal] = useState<DocumentProposal | null>(null)
  const [error, setError] = useState('')
  const request = useRef<AbortController | null>(null)
  const input = useRef<HTMLTextAreaElement>(null)
  const end = useRef<HTMLDivElement>(null)
  const connected = status?.state === 'connected'
  const documentIncluded = includeDocument && canUseDocument

  useEffect(() => () => request.current?.abort(), [])
  useEffect(() => {
    if (open && !pending && connected) input.current?.focus()
  }, [open, pending, connected])
  useEffect(() => {
    if (messages.length || pending)
      end.current?.scrollIntoView({ block: 'nearest' })
  }, [messages, pending, open, error])

  function configure() {
    setOpen(false)
    onConfigure()
  }

  function newConversation() {
    setMessages([])
    setThreadId(undefined)
    setError('')
    setDraft('')
    setIncludeDocument(false)
    setProposal(null)
    input.current?.focus()
  }

  async function send() {
    const content = draft.trim()
    if (!content || !connected || request.current) return
    const document = documentIncluded
      ? {
          title: note.title || 'Documento sem título',
          content: note.content,
        }
      : undefined
    const message: ChatMessage = {
      role: 'user',
      content,
      ...(document ? { document } : {}),
    }
    const controller = new AbortController()
    request.current = controller
    setPending(message)
    setDraft('')
    setError('')
    let timedOut = false
    const timeout = window.setTimeout(() => {
      timedOut = true
      controller.abort()
    }, 180_000)
    try {
      const reply = await requestChatReply(
        {
          message: content,
          ...(threadId ? { threadId } : {}),
          ...(document ? { document } : {}),
        },
        controller.signal,
      )
      if (controller.signal.aborted) return
      setThreadId(reply.threadId)
      const nextProposal =
        document && reply.proposedMarkdown !== null
          ? {
              markdown: reply.proposedMarkdown,
              summary: reply.proposalSummary,
              noteId: note.id,
              documentTitle: document.title,
            }
          : undefined
      setMessages((current) => [
        ...current,
        message,
        {
          role: 'assistant',
          content: reply.message,
          ...(nextProposal ? { proposal: nextProposal } : {}),
        },
      ])
      onRefreshStatus()
    } catch (cause) {
      setDraft(content)
      setError(
        timedOut
          ? 'O Codex demorou para responder. Tente novamente.'
          : controller.signal.aborted
            ? 'Resposta interrompida. Sua mensagem está pronta para reenviar.'
            : cause instanceof TypeError
              ? 'Não foi possível acessar o Codex local. Abra o DevNotes pelo aplicativo instalado.'
              : cause instanceof Error
                ? cause.message
                : 'Não foi possível obter uma resposta. Tente novamente.',
      )
    } finally {
      window.clearTimeout(timeout)
      request.current = null
      setPending(null)
    }
  }

  const accountDescription = connected
    ? `ChatGPT ${status.plan ? (planNames[status.plan] ?? '') : ''}`.trim()
    : 'Assistente para suas documentações'

  return (
    <>
      <Popover
        open={open}
        onOpenChange={(nextOpen) => {
          setOpen(nextOpen)
          if (nextOpen && !status && !accountLoading) onRefreshStatus()
        }}
      >
        <PopoverTrigger asChild>
          <Button
            className="fixed right-4 bottom-12 z-40 shadow-lg sm:right-6 sm:bottom-14"
            size="lg"
            aria-label={
              open ? 'Fechar assistente Codex' : 'Abrir assistente Codex'
            }
          >
            <MessageCircle aria-hidden="true" />
            <span>Conversar com o Codex</span>
          </Button>
        </PopoverTrigger>
        <PopoverContent
          side="top"
          align="end"
          sideOffset={12}
          collisionPadding={12}
          aria-labelledby="ai-chat-title"
          aria-describedby="ai-chat-description"
          className="flex h-[min(38rem,calc(100dvh-7rem))] max-h-[var(--radix-popover-content-available-height)] w-[min(26rem,calc(100vw-1.5rem))] flex-col gap-0 overflow-hidden p-0"
          onOpenAutoFocus={(event) => {
            if (connected) {
              event.preventDefault()
              input.current?.focus()
            }
          }}
        >
          <div className="flex shrink-0 items-center gap-3 border-b p-4">
            <Sparkles
              className="size-5 shrink-0 text-primary"
              aria-hidden="true"
            />
            <PopoverHeader className="min-w-0 flex-1">
              <PopoverTitle id="ai-chat-title">Assistente Codex</PopoverTitle>
              <PopoverDescription
                id="ai-chat-description"
                className="truncate text-xs"
              >
                {accountDescription}
              </PopoverDescription>
            </PopoverHeader>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="Nova conversa"
              title="Nova conversa"
              disabled={!!pending || (!messages.length && !error)}
              onClick={newConversation}
            >
              <Plus aria-hidden="true" />
            </Button>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="Conta do Codex"
              title="Conta do Codex"
              disabled={!!pending}
              onClick={configure}
            >
              <Settings2 aria-hidden="true" />
            </Button>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="Minimizar assistente"
              title="Minimizar assistente"
              onClick={() => setOpen(false)}
            >
              <X aria-hidden="true" />
            </Button>
          </div>
          <div
            className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-4"
            role="log"
            aria-label="Mensagens da conversa"
            aria-live="polite"
            tabIndex={0}
          >
            {!messages.length && !pending && (
              <div className="flex min-h-full flex-col items-start justify-center gap-4 py-4">
                <Badge variant="secondary">
                  <Sparkles aria-hidden="true" />
                  Incluído na sua assinatura
                </Badge>
                <div className="space-y-2">
                  <h3 className="text-lg font-semibold">Como posso ajudar?</h3>
                  <p className="text-sm text-muted-foreground">
                    Revise textos, organize ideias e prepare mudanças em
                    Markdown para você aprovar.
                  </p>
                </div>
                {connected ? (
                  <div className="flex flex-wrap gap-2">
                    {[
                      'Revise a clareza deste documento',
                      'Sugira uma estrutura melhor para este texto',
                    ].map((suggestion) => (
                      <Button
                        key={suggestion}
                        variant="outline"
                        size="sm"
                        className="h-auto whitespace-normal py-2 text-left"
                        onClick={() => {
                          setDraft(suggestion)
                          setIncludeDocument(canUseDocument)
                          input.current?.focus()
                        }}
                      >
                        {suggestion}
                      </Button>
                    ))}
                  </div>
                ) : (
                  <div className="space-y-3">
                    <p className="text-sm text-muted-foreground">
                      {accountLoading
                        ? 'Verificando sua conta do ChatGPT…'
                        : status?.state === 'unavailable'
                          ? 'O assistente precisa do aplicativo local e do Codex CLI.'
                          : 'Entre com o ChatGPT para usar sua assinatura.'}
                    </p>
                    <Button onClick={configure} disabled={accountLoading}>
                      <Settings2 aria-hidden="true" />
                      {accountLoading ? 'Verificando…' : 'Conectar ChatGPT'}
                    </Button>
                  </div>
                )}
              </div>
            )}
            <div className="space-y-5">
              {[...messages, ...(pending ? [pending] : [])].map(
                (message, index) => (
                  <div
                    key={index}
                    className={
                      message.role === 'user'
                        ? 'ml-6 space-y-2 rounded-lg bg-muted p-3'
                        : 'space-y-3'
                    }
                  >
                    <p className="text-xs font-medium text-muted-foreground">
                      {message.role === 'user' ? 'Você' : 'Codex'}
                    </p>
                    {message.document && (
                      <p className="flex items-center gap-1 text-xs text-muted-foreground">
                        <FileText
                          className="size-3 shrink-0"
                          aria-hidden="true"
                        />
                        <span className="truncate">
                          {message.document.title}
                        </span>
                      </p>
                    )}
                    {message.role === 'assistant' ? (
                      <MarkdownPreview content={message.content} />
                    ) : (
                      <p className="text-sm whitespace-pre-wrap wrap-anywhere">
                        {message.content}
                      </p>
                    )}
                    {message.proposal && (
                      <Alert>
                        <FilePenLine aria-hidden="true" />
                        <AlertDescription className="space-y-3">
                          <p>
                            {message.proposal.summary ??
                              'O Codex preparou uma alteração para este documento.'}
                          </p>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() =>
                              setProposal(message.proposal ?? null)
                            }
                          >
                            Revisar alteração
                          </Button>
                        </AlertDescription>
                      </Alert>
                    )}
                  </div>
                ),
              )}
              {pending && (
                <p
                  role="status"
                  className="flex items-center gap-2 text-sm text-muted-foreground"
                >
                  <LoaderCircle
                    className="size-4 animate-spin motion-reduce:animate-none"
                    aria-hidden="true"
                  />
                  Preparando resposta…
                </p>
              )}
            </div>
            <div ref={end} />
          </div>
          <form
            className="shrink-0 space-y-3 border-t p-4"
            onSubmit={(event) => {
              event.preventDefault()
              void send()
            }}
          >
            {error && (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
            <div className="flex min-w-0 items-center gap-2">
              <Checkbox
                id="ai-include-document"
                checked={documentIncluded}
                disabled={!connected || !!pending || !canUseDocument}
                onCheckedChange={(checked) =>
                  setIncludeDocument(checked === true)
                }
              />
              <Label htmlFor="ai-include-document" className="min-w-0 text-xs">
                Incluir documento aberto
              </Label>
            </div>
            {documentIncluded && (
              <div className="space-y-1 text-xs text-muted-foreground">
                <p className="truncate" title={note.title}>
                  {note.title || 'Documento sem título'}
                </p>
                <p>
                  O conteúdo será enviado somente nesta conversa quando você
                  enviar a mensagem.
                </p>
              </div>
            )}
            <InputGroup>
              <InputGroupTextarea
                ref={input}
                aria-label="Mensagem para o Codex"
                aria-describedby="ai-chat-help"
                placeholder={
                  connected
                    ? 'Peça ajuda com sua documentação…'
                    : 'Entre com o ChatGPT para começar'
                }
                value={draft}
                disabled={!connected || !!pending}
                maxLength={16000}
                rows={2}
                className="max-h-32 min-h-16"
                onChange={(event) => setDraft(event.target.value)}
                onKeyDown={(event) => {
                  if (
                    event.key === 'Enter' &&
                    !event.shiftKey &&
                    !event.nativeEvent.isComposing
                  ) {
                    event.preventDefault()
                    void send()
                  }
                }}
              />
              <InputGroupAddon align="block-end" className="justify-between">
                <span className="text-xs text-muted-foreground">
                  Shift + Enter para nova linha
                </span>
                {pending ? (
                  <InputGroupButton
                    size="icon-sm"
                    variant="secondary"
                    aria-label="Interromper resposta"
                    onClick={() => request.current?.abort()}
                  >
                    <Square aria-hidden="true" />
                  </InputGroupButton>
                ) : (
                  <InputGroupButton
                    size="icon-sm"
                    variant="default"
                    type="submit"
                    aria-label="Enviar mensagem"
                    disabled={!connected || !draft.trim()}
                  >
                    <ArrowUp aria-hidden="true" />
                  </InputGroupButton>
                )}
              </InputGroupAddon>
            </InputGroup>
            <p
              id="ai-chat-help"
              className="text-xs leading-relaxed text-muted-foreground"
            >
              Usa os limites do Codex incluídos na sua assinatura. Histórico
              apenas nesta aba.
            </p>
          </form>
        </PopoverContent>
      </Popover>
      {proposal && (
        <AiProposalDialog
          proposal={proposal}
          canApply={canApplyDocument && note.id === proposal.noteId && !pending}
          onApply={() => {
            onApplyDocument(proposal.noteId, proposal.markdown)
            setProposal(null)
          }}
          onClose={() => setProposal(null)}
        />
      )}
    </>
  )
}
