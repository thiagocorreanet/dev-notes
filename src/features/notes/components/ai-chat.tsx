import { useEffect, useRef, useState } from 'react'
import {
  ArrowUp,
  FileText,
  LoaderCircle,
  MessageCircle,
  Plus,
  Settings2,
  Sparkles,
  Square,
  X,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Alert, AlertDescription } from '@/components/ui/alert'
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupTextarea,
} from '@/components/ui/input-group'
import {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from '@/components/ui/popover'
import type { AiSettings } from '../ai-settings'
import type { Note } from '../types'
import { requestChatReply } from '../ai-chat'
import type { ChatMessage } from '../ai-chat'
import { MarkdownPreview } from './markdown-preview'

export function AiChat({
  settings,
  note,
  onConfigure,
}: {
  settings: AiSettings
  note: Note
  onConfigure: () => void
}) {
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState('')
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [pending, setPending] = useState<ChatMessage | null>(null)
  const [includeDocument, setIncludeDocument] = useState(false)
  const [error, setError] = useState('')
  const request = useRef<AbortController | null>(null)
  const input = useRef<HTMLTextAreaElement>(null)
  const end = useRef<HTMLDivElement>(null)
  const configured = Boolean(settings.endpoint && settings.model)

  useEffect(() => () => request.current?.abort(), [])
  useEffect(() => {
    if (open && !pending && configured) input.current?.focus()
  }, [open, pending, configured])
  useEffect(() => {
    if (messages.length || pending)
      end.current?.scrollIntoView({ block: 'nearest' })
  }, [messages, pending, open, error])

  function configure() {
    setOpen(false)
    onConfigure()
  }

  async function send() {
    const content = draft.trim()
    if (!content || !configured || request.current) return
    const message: ChatMessage = {
      role: 'user',
      content,
      ...(includeDocument
        ? {
            document: {
              title: note.title || 'Documento sem título',
              content: note.content,
            },
          }
        : {}),
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
    }, 120_000)
    try {
      const reply = await requestChatReply(
        settings,
        [...messages, message],
        controller.signal,
      )
      if (controller.signal.aborted) return
      setMessages((current) => [
        ...current,
        message,
        { role: 'assistant', content: reply },
      ])
    } catch (cause) {
      setDraft(content)
      setError(
        timedOut
          ? 'O servidor demorou para responder. Tente novamente.'
          : controller.signal.aborted
            ? 'Resposta interrompida. Sua mensagem está pronta para reenviar.'
            : cause instanceof TypeError
              ? 'Não foi possível conectar ao servidor. Confira o endereço, sua conexão e se o servidor permite acesso pelo navegador (CORS).'
              : cause instanceof SyntaxError
                ? 'O servidor retornou uma resposta incompatível. Confira o endereço nas configurações de IA.'
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

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          className="fixed right-4 bottom-12 z-40 shadow-lg sm:right-6 sm:bottom-14"
          size="lg"
          aria-label={open ? 'Fechar chat com IA' : 'Abrir chat com IA'}
        >
          <MessageCircle aria-hidden="true" />
          <span>Conversar com IA</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent
        side="top"
        align="end"
        sideOffset={12}
        collisionPadding={12}
        aria-labelledby="ai-chat-title"
        aria-describedby="ai-chat-description"
        className="flex h-[min(36rem,calc(100dvh-7rem))] max-h-[var(--radix-popover-content-available-height)] w-[min(25rem,calc(100vw-1.5rem))] flex-col gap-0 overflow-hidden p-0"
        onOpenAutoFocus={(event) => {
          if (configured) {
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
            <PopoverTitle id="ai-chat-title">Assistente DevNotes</PopoverTitle>
            <PopoverDescription
              id="ai-chat-description"
              className="truncate text-xs"
            >
              {configured
                ? settings.model
                : 'Converse sobre suas ideias e documentos'}
            </PopoverDescription>
          </PopoverHeader>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Nova conversa"
            title="Nova conversa"
            disabled={!!pending || (!messages.length && !error)}
            onClick={() => {
              setMessages([])
              setError('')
              setDraft('')
              setIncludeDocument(false)
              input.current?.focus()
            }}
          >
            <Plus aria-hidden="true" />
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Configurar IA"
            title="Configurar IA"
            disabled={!!pending}
            onClick={configure}
          >
            <Settings2 aria-hidden="true" />
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Minimizar chat"
            title="Minimizar chat"
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
                Seu assistente de escrita
              </Badge>
              <div className="space-y-2">
                <h3 className="text-lg font-semibold">Como posso ajudar?</h3>
                <p className="text-sm text-muted-foreground">
                  Peça ajuda para organizar uma ideia, explicar um conceito ou
                  revisar um texto.
                </p>
              </div>
              {configured ? (
                <div className="flex flex-wrap gap-2">
                  {[
                    'Me ajude a organizar uma ideia',
                    'Como escrever uma boa nota técnica?',
                  ].map((suggestion) => (
                    <Button
                      key={suggestion}
                      variant="outline"
                      size="sm"
                      className="h-auto whitespace-normal py-2 text-left"
                      onClick={() => {
                        setDraft(suggestion)
                        input.current?.focus()
                      }}
                    >
                      {suggestion}
                    </Button>
                  ))}
                </div>
              ) : (
                <>
                  <p className="text-sm text-muted-foreground">
                    Configure o servidor e o modelo para começar.
                  </p>
                  <Button onClick={configure}>
                    <Settings2 aria-hidden="true" />
                    Configurar conexão
                  </Button>
                </>
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
                      : 'space-y-2'
                  }
                >
                  <p className="text-xs font-medium text-muted-foreground">
                    {message.role === 'user' ? 'Você' : 'Assistente'}
                  </p>
                  {message.document && (
                    <p className="flex items-center gap-1 text-xs text-muted-foreground">
                      <FileText
                        className="size-3 shrink-0"
                        aria-hidden="true"
                      />
                      <span className="truncate">{message.document.title}</span>
                    </p>
                  )}
                  {message.role === 'assistant' ? (
                    <MarkdownPreview content={message.content} />
                  ) : (
                    <p className="text-sm whitespace-pre-wrap wrap-anywhere">
                      {message.content}
                    </p>
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
              checked={includeDocument}
              disabled={!configured || !!pending}
              onCheckedChange={(checked) =>
                setIncludeDocument(checked === true)
              }
            />
            <Label htmlFor="ai-include-document" className="min-w-0 text-xs">
              Incluir documento aberto
            </Label>
          </div>
          {includeDocument && (
            <div className="space-y-1 text-xs text-muted-foreground">
              <p className="truncate" title={note.title}>
                {note.title || 'Documento sem título'}
              </p>
              <p>
                O documento será enviado e mantido no histórico até iniciar uma
                nova conversa.
              </p>
            </div>
          )}
          <InputGroup>
            <InputGroupTextarea
              ref={input}
              aria-label="Mensagem para a IA"
              aria-describedby="ai-chat-help"
              placeholder={
                configured
                  ? 'Escreva sua mensagem…'
                  : 'Configure a IA para conversar'
              }
              value={draft}
              disabled={!configured || !!pending}
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
                  disabled={!configured || !draft.trim()}
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
            Mensagens enviadas ao servidor configurado. Histórico apenas nesta
            aba, até recarregar.
          </p>
        </form>
      </PopoverContent>
    </Popover>
  )
}
