import { WorkspaceError } from './workspace-error'

export interface LocalDocument {
  path: string
  name: string
  raw: string
  version: string
}

export function requestedLocalFile() {
  const query = new URLSearchParams(window.location.search)
  return query.get('ws') === '1' ? query.get('file') : null
}

export async function requestLocalDocument(
  path: string,
  options?: { raw: string; version: string } | AbortSignal,
): Promise<LocalDocument> {
  const saving =
    options && !(options instanceof AbortSignal) ? options : undefined
  let response: Response
  try {
    response = await fetch(
      `/api/document?${new URLSearchParams({ file: path })}`,
      {
        method: saving ? 'PUT' : 'GET',
        credentials: 'same-origin',
        cache: 'no-store',
        ...(saving
          ? {
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(saving),
            }
          : {}),
        signal:
          options instanceof AbortSignal
            ? options
            : AbortSignal.timeout(15_000),
      },
    )
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError')
      throw error
    throw new WorkspaceError(
      'O serviço local não respondeu. Abra o arquivo novamente pelo computador e tente de novo.',
    )
  }
  if (!response.ok) {
    const messages: Record<number, string> = {
      401: 'Abra o arquivo pelo DevNotes no computador para conectar esta página ao serviço local.',
      403: 'Este arquivo não está autorizado. Abra-o pelo DevNotes no computador.',
      404: 'O arquivo não foi encontrado. Verifique se ele foi movido ou excluído.',
      409: 'O arquivo mudou no computador. Baixe uma cópia das suas alterações ou recarregue o original antes de salvar.',
      413: 'O arquivo ultrapassa o limite de 2 MB.',
      415: 'O arquivo precisa estar na codificação UTF-8.',
    }
    throw new WorkspaceError(
      messages[response.status] ??
        'Não foi possível acessar o arquivo no computador. Verifique a permissão de acesso.',
    )
  }
  const value: unknown = await response.json()
  if (
    !value ||
    typeof value !== 'object' ||
    !('path' in value) ||
    typeof value.path !== 'string' ||
    !('name' in value) ||
    typeof value.name !== 'string' ||
    !('raw' in value) ||
    typeof value.raw !== 'string' ||
    !('version' in value) ||
    typeof value.version !== 'string'
  )
    throw new WorkspaceError(
      'O serviço local retornou uma resposta inválida. Abra o arquivo novamente pelo computador.',
    )
  return value as LocalDocument
}
