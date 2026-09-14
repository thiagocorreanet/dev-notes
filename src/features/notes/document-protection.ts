import { WorkspaceError } from './workspace-error'
import type {
  EncryptedPayload,
  FolderProtection,
  Note,
  NoteProtection,
} from './types'

export const PROTECTED_MARKDOWN_PREFIX = '<!-- devnotes:encrypted:v1 -->\n'
export const PASSWORD_MIN_LENGTH = 8
const ITERATIONS = 310_000
const encoder = new TextEncoder()
const decoder = new TextDecoder()

interface ProtectedDocumentData {
  content: string
  revisions?: Note['revisions']
}

function bytesToBase64(bytes: Uint8Array) {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary)
}

function base64ToBytes(value: string) {
  try {
    const binary = atob(value)
    return Uint8Array.from(binary, (character) => character.charCodeAt(0))
  } catch {
    throw new WorkspaceError('O documento protegido está corrompido.')
  }
}

async function deriveKey(
  password: string,
  payload: Pick<EncryptedPayload, 'salt' | 'iterations'>,
) {
  const material = await crypto.subtle.importKey(
    'raw',
    encoder.encode(password),
    'PBKDF2',
    false,
    ['deriveKey'],
  )
  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      hash: 'SHA-256',
      salt: base64ToBytes(payload.salt),
      iterations: payload.iterations,
    },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  )
}

async function encryptValue(value: unknown, key: CryptoKey, salt: string) {
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    encoder.encode(JSON.stringify(value)),
  )
  return {
    key,
    payload: {
      algorithm: 'AES-GCM',
      kdf: 'PBKDF2-SHA-256',
      iterations: ITERATIONS,
      salt,
      iv: bytesToBase64(iv),
      ciphertext: bytesToBase64(new Uint8Array(encrypted)),
    } satisfies EncryptedPayload,
  }
}

async function encryptWithPassword(value: unknown, password: string) {
  const salt = bytesToBase64(crypto.getRandomValues(new Uint8Array(16)))
  const key = await deriveKey(password, { salt, iterations: ITERATIONS })
  return encryptValue(value, key, salt)
}

async function decryptValue<T>(payload: EncryptedPayload, key: CryptoKey) {
  try {
    const decrypted = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: base64ToBytes(payload.iv) },
      key,
      base64ToBytes(payload.ciphertext),
    )
    return JSON.parse(decoder.decode(decrypted)) as T
  } catch {
    throw new WorkspaceError(
      'Senha incorreta ou documento protegido corrompido.',
    )
  }
}

function protectedData(note: Note): ProtectedDocumentData {
  return {
    content: note.content,
    ...(note.revisions?.length ? { revisions: note.revisions } : {}),
  }
}

export async function protectNote(
  note: Note,
  password: string,
  ownerId = note.id,
) {
  if (password.length < PASSWORD_MIN_LENGTH)
    throw new WorkspaceError(
      `Use uma senha com pelo menos ${PASSWORD_MIN_LENGTH} caracteres.`,
    )
  const { key, payload } = await encryptWithPassword(
    protectedData(note),
    password,
  )
  const protection: NoteProtection = {
    format: 'devnotes-encrypted',
    version: 1,
    ownerId,
    payload,
  }
  const withoutRevisions: Note = { ...note }
  delete withoutRevisions.revisions
  const locked: Note = {
    ...withoutRevisions,
    content: '',
    protection,
  }
  return {
    key,
    locked,
    unlocked: { ...note, protection },
  }
}

export async function unlockNote(note: Note, password: string) {
  if (!note.protection)
    throw new WorkspaceError('Este documento não está protegido.')
  const key = await deriveKey(password, note.protection.payload)
  const data = await decryptValue<ProtectedDocumentData>(
    note.protection.payload,
    key,
  )
  if (
    typeof data !== 'object' ||
    data === null ||
    typeof data.content !== 'string' ||
    (data.revisions !== undefined && !Array.isArray(data.revisions))
  )
    throw new WorkspaceError('O documento protegido está corrompido.')
  return {
    key,
    note: {
      ...note,
      content: data.content,
      ...(data.revisions ? { revisions: data.revisions } : {}),
    },
  }
}

export async function updateProtectedNote(note: Note, key: CryptoKey) {
  if (!note.protection)
    throw new WorkspaceError('Este documento não está protegido.')
  const { payload } = await encryptValue(
    protectedData(note),
    key,
    note.protection.payload.salt,
  )
  const protection = { ...note.protection, payload }
  const withoutRevisions: Note = { ...note }
  delete withoutRevisions.revisions
  const locked: Note = {
    ...withoutRevisions,
    content: '',
    protection,
  }
  return {
    locked,
    unlocked: { ...note, protection },
  }
}

export async function createFolderProtection(password: string) {
  if (password.length < PASSWORD_MIN_LENGTH)
    throw new WorkspaceError(
      `Use uma senha com pelo menos ${PASSWORD_MIN_LENGTH} caracteres.`,
    )
  const { payload } = await encryptWithPassword('devnotes-folder', password)
  return {
    format: 'devnotes-folder-protection',
    version: 1,
    verifier: payload,
  } satisfies FolderProtection
}

export async function verifyFolderPassword(
  protection: FolderProtection,
  password: string,
) {
  const key = await deriveKey(password, protection.verifier)
  const value = await decryptValue<string>(protection.verifier, key)
  if (value !== 'devnotes-folder')
    throw new WorkspaceError('A proteção desta pasta está corrompida.')
}

export function serializeProtectedMarkdown(note: Note) {
  if (!note.protection)
    throw new WorkspaceError('Este documento não está protegido.')
  return `${PROTECTED_MARKDOWN_PREFIX}${JSON.stringify(
    {
      format: note.protection.format,
      version: note.protection.version,
      title: note.title,
      payload: note.protection.payload,
    },
    null,
    2,
  )}\n`
}

export function isEncryptedPayload(value: unknown): value is EncryptedPayload {
  return (
    typeof value === 'object' &&
    value !== null &&
    'algorithm' in value &&
    value.algorithm === 'AES-GCM' &&
    'kdf' in value &&
    value.kdf === 'PBKDF2-SHA-256' &&
    'iterations' in value &&
    value.iterations === ITERATIONS &&
    'salt' in value &&
    typeof value.salt === 'string' &&
    'iv' in value &&
    typeof value.iv === 'string' &&
    'ciphertext' in value &&
    typeof value.ciphertext === 'string'
  )
}

export function parseProtectedMarkdown(
  name: string,
  text: string,
): Pick<Note, 'title' | 'content' | 'protection'> | null {
  if (!text.startsWith(PROTECTED_MARKDOWN_PREFIX)) return null
  try {
    const value: unknown = JSON.parse(
      text.slice(PROTECTED_MARKDOWN_PREFIX.length),
    )
    if (
      typeof value !== 'object' ||
      value === null ||
      !('format' in value) ||
      value.format !== 'devnotes-encrypted' ||
      !('version' in value) ||
      value.version !== 1 ||
      !('title' in value) ||
      typeof value.title !== 'string' ||
      !('payload' in value) ||
      !isEncryptedPayload(value.payload)
    )
      throw new Error('Invalid protected document')
    return {
      title: value.title.trim() || name.replace(/\.(md|markdown)$/i, ''),
      content: '',
      protection: {
        format: 'devnotes-encrypted',
        version: 1,
        ownerId: '',
        payload: value.payload,
      },
    }
  } catch {
    throw new WorkspaceError('O documento protegido está corrompido.')
  }
}
