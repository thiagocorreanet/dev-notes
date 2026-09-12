import { useContext } from 'react'
import type { ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import { NoteNavigationContext } from '../note-navigation'
import { resolveNoteLink } from '../note-links'

export function NoteLink({
  href,
  children,
}: {
  href: string | undefined
  children: ReactNode
}) {
  const navigation = useContext(NoteNavigationContext)
  if (!href?.startsWith('#note/') && !href?.startsWith('#wiki/'))
    return (
      <a
        href={href}
        className="font-medium text-primary underline underline-offset-4"
      >
        {children}
      </a>
    )
  let target = ''
  try {
    target = decodeURIComponent(href.slice(href.indexOf('/') + 1))
  } catch {
    /* Invalid links remain visible without navigation. */
  }
  const note = navigation
    ? resolveNoteLink(target, navigation.notes, navigation.folders)
    : undefined
  return (
    <Button
      variant="link"
      className="inline h-auto p-0 text-base whitespace-normal"
      disabled={!note}
      title={
        note
          ? `Abrir ${note.title}`
          : 'Documento não encontrado ou nome repetido. Use o caminho completo da nota.'
      }
      onClick={() => {
        if (note) navigation?.onSelect(note.id)
      }}
    >
      {children}
    </Button>
  )
}
