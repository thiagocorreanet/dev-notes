import type { DiskSnapshot } from './disk-workspace'
import { WorkspaceError } from './workspace-error'

export class DiskConflictError extends WorkspaceError {}
export class DiskMissingError extends WorkspaceError {}

export function launcherSession() {
  return new URLSearchParams(window.location.search).get('ws') === '1'
}

export function requestedDiskWorkspace() {
  const query = new URLSearchParams(window.location.search)
  return query.get('ws') === '1' ? query.get('workspace') : null
}

export function diskWorkspaceUrl(id?: string) {
  const url = new URL('/', window.location.origin)
  url.searchParams.set('ws', '1')
  if (id) url.searchParams.set('workspace', id)
  return url.href
}

const statusMessages: Record<number, string> = {
  400: 'O DevNotes não aceita esse caminho ou nome no workspace.',
  401: 'Abra o DevNotes pelo computador para usar a pasta do workspace.',
  403: 'Esta página não tem mais acesso ao workspace. Abra a pasta de novo pelo DevNotes.',
  404: 'O arquivo ou a pasta não existe mais no computador.',
  409: 'Já existe um item com esse nome ou o arquivo mudou fora do DevNotes.',
  413: 'O arquivo ou a pasta ultrapassa os limites do DevNotes.',
  415: 'O arquivo precisa estar na codificação UTF-8.',
}

async function failure(
  response: Response,
  fallback: string,
  serverMessage: boolean,
) {
  let message = statusMessages[response.status] ?? fallback
  if (serverMessage) {
    const body: unknown = await response.json().catch(() => null)
    if (
      body &&
      typeof body === 'object' &&
      'error' in body &&
      typeof body.error === 'string'
    )
      message = body.error
  }
  if (response.status === 409) return new DiskConflictError(message)
  if (response.status === 404) return new DiskMissingError(message)
  return new WorkspaceError(message)
}

async function send(
  path: string,
  init: RequestInit,
  fallback = 'Não foi possível acessar a pasta do workspace.',
  serverMessage = false,
) {
  let response: Response
  try {
    response = await fetch(path, {
      credentials: 'same-origin',
      cache: 'no-store',
      ...init,
    })
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError')
      throw error
    throw new WorkspaceError(
      'O serviço local do DevNotes não respondeu. Abra a pasta de novo pelo computador.',
    )
  }
  if (!response.ok) throw await failure(response, fallback, serverMessage)
  return response
}

export function createDiskWorkspaceClient(id: string) {
  const headers = { 'X-DevNotes-Workspace': id }
  const json = async <T>(method: string, path: string, body?: unknown) => {
    const response = await send(path, {
      method,
      headers:
        body === undefined
          ? headers
          : { ...headers, 'Content-Type': 'application/json' },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    })
    return (await response.json()) as T
  }
  return {
    snapshot: () => json<DiskSnapshot>('GET', '/api/workspace'),
    readFile: (path: string) =>
      json<{ raw: string; version: string }>(
        'GET',
        `/api/workspace/file?${new URLSearchParams({ path })}`,
      ),
    writeFile: (path: string, raw: string, version: string | null) =>
      json<{ version: string }>('PUT', '/api/workspace/file', {
        path,
        raw,
        version,
      }),
    createDirectory: (path: string) =>
      json<object>('POST', '/api/workspace/directory', { path }),
    move: (from: string, to: string) =>
      json<object>('POST', '/api/workspace/move', { from, to }),
    copy: (from: string, to: string) =>
      json<object>('POST', '/api/workspace/copy', { from, to }),
    remove: (path: string) =>
      json<object>('POST', '/api/workspace/delete', { path }),
    pdf: async (path: string) => {
      const response = await send(
        `/api/workspace/pdf?${new URLSearchParams({ path })}`,
        { headers },
        'Não foi possível abrir o PDF do workspace.',
      )
      return new Uint8Array(await response.arrayBuffer())
    },
  }
}

export type DiskWorkspaceClient = ReturnType<typeof createDiskWorkspaceClient>

/** Asks the local service to show a native folder dialog; resolves null when canceled. */
export async function chooseDiskWorkspace(
  mode: 'open' | 'create',
  name?: string,
) {
  const response = await send(
    '/api/workspace/choose',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mode, ...(name ? { name } : {}) }),
    },
    'Não foi possível escolher a pasta do workspace.',
    // The chooser explains its own failures in Portuguese, such as a missing dialog tool.
    true,
  )
  if (response.status === 204) return null
  const body = (await response.json()) as { id?: unknown }
  if (typeof body.id !== 'string')
    throw new WorkspaceError('O serviço local retornou uma resposta inválida.')
  return body.id
}
