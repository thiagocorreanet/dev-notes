import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AiChat } from './ai-chat'

const settings = {
  endpoint: 'https://ai.example.test/v1/',
  model: 'test-model',
  apiKey: 'session-secret',
}
const note = {
  id: 'note',
  title: 'My note',
  content: 'Private document content',
}

afterEach(() => vi.unstubAllGlobals())

async function setup(configured = true) {
  const onConfigure = vi.fn()
  const view = render(
    <AiChat
      settings={configured ? settings : { endpoint: '', model: '', apiKey: '' }}
      note={note}
      onConfigure={onConfigure}
    />,
  )
  const user = userEvent.setup()
  await user.click(screen.getByRole('button', { name: 'Abrir chat com IA' }))
  return { ...view, user, onConfigure }
}

function response(content = 'Uma **resposta** útil.') {
  return new Response(JSON.stringify({ choices: [{ message: { content } }] }))
}

describe('AI chat', () => {
  it('requires configuration before sending and opens connection settings', async () => {
    const fetch = vi.fn()
    vi.stubGlobal('fetch', fetch)
    const { user, onConfigure } = await setup(false)
    expect(
      screen.getByRole('button', { name: 'Enviar mensagem' }),
    ).toBeDisabled()
    await user.click(screen.getByRole('button', { name: 'Configurar conexão' }))
    expect(onConfigure).toHaveBeenCalledOnce()
    expect(fetch).not.toHaveBeenCalled()
  })

  it('sends messages with history, keeps documents private by default, and preserves a minimized conversation', async () => {
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockImplementation(() => Promise.resolve(response()))
    vi.stubGlobal('fetch', fetch)
    const { user } = await setup()
    const input = screen.getByRole('textbox', { name: 'Mensagem para a IA' })
    await waitFor(() => expect(input).toHaveFocus())
    await user.type(input, 'Explique uma ideia{Enter}')
    expect(
      await screen.findByText('resposta', { selector: 'strong' }),
    ).toBeVisible()
    const [url, options] = fetch.mock.calls[0]!
    expect(url).toBeInstanceOf(URL)
    expect((url as URL).href).toBe(
      'https://ai.example.test/v1/chat/completions',
    )
    expect(options?.headers).toMatchObject({
      Authorization: 'Bearer session-secret',
    })
    expect(options?.body).not.toContain(note.content)
    await user.click(screen.getByRole('button', { name: 'Minimizar chat' }))
    await user.click(screen.getByRole('button', { name: 'Abrir chat com IA' }))
    expect(screen.getByText('Explique uma ideia')).toBeVisible()
    await user.type(
      screen.getByRole('textbox', { name: 'Mensagem para a IA' }),
      'Continue{Enter}',
    )
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(2))
    expect(JSON.parse(fetch.mock.calls[1]![1]?.body as string)).toMatchObject({
      model: 'test-model',
      stream: false,
      messages: [
        expect.objectContaining({ role: 'system' }),
        { role: 'user', content: 'Explique uma ideia' },
        { role: 'assistant', content: 'Uma **resposta** útil.' },
        { role: 'user', content: 'Continue' },
      ],
    })
    expect(localStorage.length).toBe(0)
  })

  it('includes only the explicitly selected document and clears context in a new conversation', async () => {
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockImplementation(() => Promise.resolve(response()))
    vi.stubGlobal('fetch', fetch)
    const { user } = await setup()
    await user.click(
      screen.getByRole('checkbox', { name: 'Incluir documento aberto' }),
    )
    await user.type(
      screen.getByRole('textbox', { name: 'Mensagem para a IA' }),
      'Resuma{Enter}',
    )
    await screen.findByText('resposta', { selector: 'strong' })
    expect(fetch.mock.calls[0]![1]?.body).toContain(note.content)
    await user.click(screen.getByRole('button', { name: 'Nova conversa' }))
    expect(screen.getByRole('checkbox')).not.toBeChecked()
    await user.type(
      screen.getByRole('textbox', { name: 'Mensagem para a IA' }),
      'Outra ideia{Enter}',
    )
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(2))
    expect(fetch.mock.calls[1]![1]?.body).not.toContain(note.content)
    expect(fetch.mock.calls[1]![1]?.body).not.toContain('Resuma')
  })

  it('restores a failed message for retry without duplicating history or exposing server errors', async () => {
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValueOnce(
        new Response('secret server diagnostics', { status: 401 }),
      )
      .mockResolvedValueOnce(response())
    vi.stubGlobal('fetch', fetch)
    const { user } = await setup()
    const input = screen.getByRole('textbox', { name: 'Mensagem para a IA' })
    await user.type(input, 'Minha pergunta{Enter}')
    expect(await screen.findByRole('alert')).toHaveTextContent('Acesso negado')
    expect(
      screen.queryByText('secret server diagnostics'),
    ).not.toBeInTheDocument()
    expect(input).toHaveValue('Minha pergunta')
    await user.click(screen.getByRole('button', { name: 'Enviar mensagem' }))
    await screen.findByText('resposta', { selector: 'strong' })
    const body = JSON.parse(fetch.mock.calls[1]![1]?.body as string) as {
      messages: unknown[]
    }
    expect(body.messages).toHaveLength(2)
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
    const input = screen.getByRole('textbox', { name: 'Mensagem para a IA' })
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
