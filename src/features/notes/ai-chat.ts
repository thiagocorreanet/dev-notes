export interface CodexUsageWindow {
  usedPercent: number
  resetsAt: number | null
}

export interface CodexAccountStatus {
  available: boolean
  state: 'connected' | 'signedOut' | 'unsupported' | 'unavailable'
  email: string | null
  plan: string | null
  model: string
  primary: CodexUsageWindow | null
  secondary: CodexUsageWindow | null
}

export interface DocumentProposal {
  markdown: string
  summary: string | null
  noteId: string
  documentTitle: string
}

export interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
  document?: { title: string; content: string }
  proposal?: DocumentProposal
}

export interface ChatReply {
  threadId: string
  message: string
  proposedMarkdown: string | null
  proposalSummary: string | null
}

async function jsonResponse<T>(response: Response): Promise<T> {
  let data: unknown
  try {
    data = await response.json()
  } catch {
    throw new Error(
      'O DevNotes recebeu uma resposta inválida do serviço local.',
    )
  }
  if (!response.ok) {
    if (
      data &&
      typeof data === 'object' &&
      'error' in data &&
      typeof data.error === 'string'
    )
      throw new Error(data.error)
    throw new Error('Não foi possível acessar o assistente local.')
  }
  return data as T
}

export async function getCodexStatus(
  signal?: AbortSignal,
): Promise<CodexAccountStatus> {
  const response = await fetch('/api/codex/status', {
    credentials: 'same-origin',
    ...(signal ? { signal } : {}),
  })
  return jsonResponse<CodexAccountStatus>(response)
}

export async function startCodexLogin(): Promise<{ authUrl: string }> {
  const response = await fetch('/api/codex/login', {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: '{}',
  })
  return jsonResponse<{ authUrl: string }>(response)
}

export async function requestChatReply(
  request: {
    threadId?: string
    message: string
    document?: { title: string; content: string }
  },
  signal: AbortSignal,
): Promise<ChatReply> {
  const response = await fetch('/api/codex/chat', {
    method: 'POST',
    signal,
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request),
  })
  return jsonResponse<ChatReply>(response)
}
