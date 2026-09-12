import { defaultUrlTransform } from 'react-markdown'
import { WorkspaceError } from './workspace-error'

export function isEmbeddedImage(url: string) {
  return /^data:image\/(png|jpeg|gif|webp);base64,[A-Za-z0-9+/]+={0,2}$/.test(
    url,
  )
}

export function markdownUrl(url: string, key: string) {
  return key === 'src' && isEmbeddedImage(url) ? url : defaultUrlTransform(url)
}

export function readImageFile(file: File): Promise<string> {
  if (
    !['image/png', 'image/jpeg', 'image/gif', 'image/webp'].includes(file.type)
  )
    return Promise.reject(
      new WorkspaceError('Use uma imagem PNG, JPEG, GIF ou WebP.'),
    )
  if (!file.size || file.size > 1024 * 1024)
    return Promise.reject(
      new WorkspaceError('Escolha uma imagem com até 1 MB.'),
    )
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () =>
      reject(
        new WorkspaceError(
          'Não foi possível ler a imagem. Tente selecionar o arquivo novamente.',
        ),
      )
    reader.onload = () =>
      typeof reader.result === 'string' && isEmbeddedImage(reader.result)
        ? resolve(reader.result)
        : reject(new WorkspaceError('Não foi possível ler esta imagem.'))
    reader.readAsDataURL(file)
  })
}
