import { createHash, randomBytes } from 'node:crypto'
import { constants } from 'node:fs'
import { chmod, link, open, realpath, rename, rm, stat } from 'node:fs/promises'
import { basename, dirname, join } from 'node:path'

export const MAX_BYTES = 2 * 1024 * 1024
export const MAX_PDF_BYTES = 50 * 1024 * 1024

export const digest = (raw: string) =>
  createHash('sha256').update(raw).digest('hex')
export const secret = () => randomBytes(32).toString('hex')

export class HttpError extends Error {
  readonly status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

export function errorCode(error: unknown) {
  return error instanceof Error && 'code' in error ? error.code : undefined
}

export async function readDocument(path: string, limit = MAX_BYTES) {
  const handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW)
  try {
    const info = await handle.stat()
    if (!info.isFile())
      throw new HttpError(400, 'Expected a regular Markdown file.')
    if (info.size > limit) throw new HttpError(413, 'Document exceeds 2 MB.')
    const bytes = await handle.readFile()
    if (bytes.length > limit) throw new HttpError(413, 'Document exceeds 2 MB.')
    let raw: string
    try {
      raw = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(
        bytes,
      )
    } catch {
      throw new HttpError(415, 'Document must use UTF-8.')
    }
    return { path, name: basename(path), raw, version: digest(raw) }
  } finally {
    await handle.close()
  }
}

export async function readPdf(path: string) {
  const handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW)
  try {
    const info = await handle.stat()
    if (!info.isFile()) throw new HttpError(400, 'Expected a regular PDF file.')
    if (info.size > MAX_PDF_BYTES)
      throw new HttpError(413, 'PDF exceeds 50 MB.')
    const bytes = await handle.readFile()
    if (bytes.length > MAX_PDF_BYTES)
      throw new HttpError(413, 'PDF exceeds 50 MB.')
    if (!bytes.subarray(0, 1024).includes(Buffer.from('%PDF-')))
      throw new HttpError(415, 'File is not a valid PDF.')
    return { path, name: basename(path), bytes }
  } finally {
    await handle.close()
  }
}

function temporaryPath(path: string) {
  return join(dirname(path), `.${basename(path)}.${secret()}.tmp`)
}

async function writeTemporary(path: string, raw: string, mode: number) {
  const temporary = temporaryPath(path)
  const handle = await open(temporary, 'wx', mode)
  try {
    await handle.writeFile(raw, 'utf8')
    await handle.sync()
  } finally {
    await handle.close()
  }
  return temporary
}

/** Replaces an existing document only while its content still matches `version`. */
export async function replaceDocument(
  path: string,
  raw: string,
  version: string,
  limit = MAX_BYTES,
) {
  const previous = await readDocument(path, limit)
  if (previous.version !== version)
    throw new HttpError(
      409,
      'The file changed on disk. Reload it before saving.',
    )
  if (raw === previous.raw) return previous
  const info = await stat(path)
  const temporary = await writeTemporary(path, raw, 0o600)
  try {
    await chmod(temporary, info.mode & 0o777)
    if (
      (await realpath(path)) !== path ||
      (await readDocument(path, limit)).version !== version
    )
      throw new HttpError(
        409,
        'The file changed on disk. Reload it before saving.',
      )
    await rename(temporary, path)
    return { path, name: basename(path), raw, version: digest(raw) }
  } finally {
    await rm(temporary, { force: true })
  }
}

/** Creates a document without replacing anything that already exists at `path`. */
export async function createDocument(path: string, raw: string) {
  const temporary = await writeTemporary(path, raw, 0o666)
  try {
    try {
      await link(temporary, path)
    } catch (error) {
      if (errorCode(error) === 'EEXIST')
        throw new HttpError(409, 'A file already exists at this path.')
      if (
        !['EPERM', 'ENOTSUP', 'EOPNOTSUPP', 'ENOSYS'].includes(
          String(errorCode(error)),
        )
      )
        throw error
      // Some filesystems lack hard links; exclusive creation still refuses to overwrite.
      const handle = await open(path, 'wx', 0o666).catch((failure: unknown) => {
        if (errorCode(failure) === 'EEXIST')
          throw new HttpError(409, 'A file already exists at this path.')
        throw failure
      })
      try {
        await handle.writeFile(raw, 'utf8')
        await handle.sync()
      } finally {
        await handle.close()
      }
    }
    return { path, name: basename(path), raw, version: digest(raw) }
  } finally {
    await rm(temporary, { force: true })
  }
}

/** Replaces application-owned metadata whether or not it already exists. */
export async function writePrivateFile(path: string, raw: string) {
  const temporary = await writeTemporary(path, raw, 0o600)
  try {
    await rename(temporary, path)
    return { path, name: basename(path), raw, version: digest(raw) }
  } finally {
    await rm(temporary, { force: true })
  }
}
