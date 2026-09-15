import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { CodexAccountStatus } from '../ai-chat'
import { AiChat } from './ai-chat'

const connected: CodexAccountStatus = {
  available: true,
  state: 'connected',
  email: 'writer@example.com',
  plan: 'pro',
  model: 'Padrão do Codex',
  primary: { usedPercent: 12, resetsAt: null },
  secondary: null,
}
const note = {
  id: 'note',
  title: 'My note',
  content: 'Private document content',
}

afterEach(() => vi.unstubAllGlobals())

async function setup(status: CodexAccountStatus | null = connected) {
  const onConfigure = vi.fn()
  const onApplyDocument = vi.fn()
  const onRefreshStatus = vi.fn()
  const view = render(
    <AiChat
      status={status}
      accountLoading={false}
      note={note}
      canUseDocument
      canApplyDocument
      onConfigure={onConfigure}
      onApplyDocument={onApplyDocument}
      onRefreshStatus={onRefreshStatus}
    />,
  )
  const user = userEvent.setup()
  await user.click(
    screen.getByRole('button', { name: 'Abrir assistente Codex' }),
  )
  return {
    ...view,
    user,
    onConfigure,
    onApplyDocument,
    onRefreshStatus,
  }
}

function response(
  overrides: Partial<{
    threadId: string
    message: string
    proposedMarkdown: string | null
    proposalSummary: string | null
  }> = {},
) {
  return new Response(
    JSON.stringify({
      threadId: 'thread-1',
      message: 'Uma **resposta** útil.',
      proposedMarkdown: null,
      proposalSummary: null,
      ...overrides,
    }),
  )
}

describe('Codex chat', () => {
  it('requires a ChatGPT connection before sending and opens the account dialog', async () => {
    const { user, onConfigure, onRefreshStatus } = await setup(null)
    expect(onRefreshStatus).toHaveBeenCalledOnce()
    expect(
      screen.getByRole('button', { name: 'Enviar mensagem' }),
    ).toBeDisabled()
    await user.click(screen.getByRole('button', { name: 'Conectar ChatGPT' }))
    expect(onConfigure).toHaveBeenCalledOnce()
  })

  it('uses the same-origin service, keeps documents private by default, and preserves a minimized conversation', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(response())
    vi.stubGlobal('fetch', fetch)
    const { user } = await setup()
    const input = screen.getByRole('textbox', { name: 'Mensagem para o Codex' })
    await waitFor(() => expect(input).toHaveFocus())
    await user.type(input, 'Explique uma ideia{Enter}')
    expect(
      await screen.findByText('resposta', { selector: 'strong' }),
    ).toBeVisible()
    expect(fetch).toHaveBeenCalledWith(
      '/api/codex/chat',
      expect.objectContaining({
        method: 'POST',
        credentials: 'same-origin',
      }),
    )
    expect(fetch.mock.calls[0]![1]?.body).not.toContain(note.content)
    await user.click(
      screen.getByRole('button', { name: 'Minimizar assistente' }),
    )
    await user.click(
      screen.getByRole('button', { name: 'Abrir assistente Codex' }),
    )
    expect(screen.getByText('Explique uma ideia')).toBeVisible()
    await user.type(
      screen.getByRole('textbox', { name: 'Mensagem para o Codex' }),
      'Continue{Enter}',
    )
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(2))
    expect(JSON.parse(fetch.mock.calls[1]![1]?.body as string)).toEqual({
      threadId: 'thread-1',
      message: 'Continue',
    })
    expect(localStorage.length).toBe(0)
  })

  it('includes only an explicitly selected document and applies a reviewed proposal', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(
      response({
        message: 'Preparei uma revisão.',
        proposedMarkdown: '## Revised\n\nClearer content.',
        proposalSummary: 'Melhora a clareza.',
      }),
    )
    vi.stubGlobal('fetch', fetch)
    const { user, onApplyDocument } = await setup()
    await user.click(
      screen.getByRole('checkbox', { name: 'Incluir documento aberto' }),
    )
    await user.type(
      screen.getByRole('textbox', { name: 'Mensagem para o Codex' }),
      'Revise{Enter}',
    )
    await user.click(
      await screen.findByRole('button', { name: 'Revisar alteração' }),
    )
    expect(
      screen.getByRole('heading', {
        name: 'Revisar alteração em “My note”',
      }),
    ).toBeVisible()
    expect(onApplyDocument).not.toHaveBeenCalled()
    await user.click(screen.getByRole('button', { name: 'Aplicar alteração' }))
    expect(onApplyDocument).toHaveBeenCalledWith(
      note.id,
      '## Revised\n\nClearer content.',
    )
    expect(JSON.parse(fetch.mock.calls[0]![1]?.body as string)).toEqual({
      message: 'Revise',
      document: { title: note.title, content: note.content },
    })
  })

  it('clears document context and the thread when starting a new conversation', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(response())
    vi.stubGlobal('fetch', fetch)
    const { user } = await setup()
    await user.click(screen.getByRole('checkbox'))
    await user.type(
      screen.getByRole('textbox', { name: 'Mensagem para o Codex' }),
      'Resuma{Enter}',
    )
    await screen.findByText('resposta', { selector: 'strong' })
    await user.click(screen.getByRole('button', { name: 'Nova conversa' }))
    expect(screen.getByRole('checkbox')).not.toBeChecked()
    await user.type(
      screen.getByRole('textbox', { name: 'Mensagem para o Codex' }),
      'Outra ideia{Enter}',
    )
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(2))
    expect(JSON.parse(fetch.mock.calls[1]![1]?.body as string)).toEqual({
      message: 'Outra ideia',
    })
  })

  it('restores a failed message without exposing server diagnostics', async () => {
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValueOnce(
        new Response('secret server diagnostics', { status: 502 }),
      )
      .mockResolvedValueOnce(response())
    vi.stubGlobal('fetch', fetch)
    const { user } = await setup()
    const input = screen.getByRole('textbox', { name: 'Mensagem para o Codex' })
    await user.type(input, 'Minha pergunta{Enter}')
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'resposta inválida',
    )
    expect(
      screen.queryByText('secret server diagnostics'),
    ).not.toBeInTheDocument()
    expect(input).toHaveValue('Minha pergunta')
    await user.click(screen.getByRole('button', { name: 'Enviar mensagem' }))
    await screen.findByText('resposta', { selector: 'strong' })
    expect(fetch).toHaveBeenCalledTimes(2)
  })

  it('supports multiline input and cancellation while preventing duplicate sends', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>().mockImplementation(
      (_url, options) =>
        new Promise((_resolve, reject) => {
          options?.signal?.addEventListener('abort', () =>
            reject(new DOMException('Aborted', 'AbortError')),
          )
        }),
    )
    vi.stubGlobal('fetch', fetch)
    const { user } = await setup()
    const input = screen.getByRole('textbox', { name: 'Mensagem para o Codex' })
    await user.type(input, 'Linha um{Shift>}{Enter}{/Shift}Linha dois')
    expect(fetch).not.toHaveBeenCalled()
    await user.keyboard('{Enter}')
    expect(input).toBeDisabled()
    await user.click(
      screen.getByRole('button', { name: 'Interromper resposta' }),
    )
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Resposta interrompida',
    )
    expect(input).toHaveValue('Linha um\nLinha dois')
    expect(fetch).toHaveBeenCalledOnce()
  })
})
