import { useLayoutEffect } from 'react'

interface Position {
  top: number
  heading?: string
  offset?: number
}

export function useReadingPosition(
  noteId: string,
  mode: string,
  loading: boolean,
) {
  useLayoutEffect(() => {
    if (loading || (mode !== 'read' && mode !== 'split')) return
    const pane = document.querySelector<HTMLElement>(
      '#main [data-slot="tabs-content"][data-state="active"]',
    )
    if (!pane) return
    const key = `devnotes:reading:v1:${encodeURIComponent(noteId)}:${mode}`
    let saved: Position | undefined
    try {
      const value: unknown = JSON.parse(localStorage.getItem(key) ?? 'null')
      if (
        value &&
        typeof value === 'object' &&
        'top' in value &&
        typeof value.top === 'number' &&
        Number.isFinite(value.top) &&
        value.top >= 0
      ) {
        saved = { top: value.top }
        if (
          'heading' in value &&
          typeof value.heading === 'string' &&
          'offset' in value &&
          typeof value.offset === 'number' &&
          Number.isFinite(value.offset)
        ) {
          saved.heading = value.heading
          saved.offset = value.offset
        }
      }
    } catch {
      /* Reading position is optional when browser storage is unavailable. */
    }
    let restoring = !!saved
    let latest: Position | undefined
    let timer: ReturnType<typeof setTimeout> | undefined
    function restore() {
      if (!restoring || !saved || !pane) return
      const heading = saved.heading
        ? document.getElementById(saved.heading)
        : null
      pane.scrollTop =
        heading && pane.contains(heading)
          ? pane.scrollTop +
            heading.getBoundingClientRect().top -
            pane.getBoundingClientRect().top +
            (saved.offset ?? 0)
          : saved.top
    }
    function snapshot() {
      if (!pane || restoring) return
      const top = pane.scrollTop
      const heading = [
        ...pane.querySelectorAll<HTMLElement>('[data-document-preview] [id]'),
      ]
        .reverse()
        .find(
          (item) =>
            item.getBoundingClientRect().top <=
            pane.getBoundingClientRect().top + 1,
        )
      const value: Position = { top }
      if (heading) {
        value.heading = heading.id
        value.offset =
          pane.getBoundingClientRect().top - heading.getBoundingClientRect().top
      }
      latest = value
    }
    function persist() {
      if (!latest) return
      try {
        localStorage.setItem(key, JSON.stringify(latest))
      } catch {
        /* Keep reading available. */
      }
    }
    function interacted() {
      restoring = false
      observer?.disconnect()
    }
    function scrolled() {
      if (restoring) return
      snapshot()
      clearTimeout(timer)
      timer = setTimeout(persist, 150)
    }
    function hide() {
      if (document.visibilityState === 'hidden') persist()
    }
    const observer =
      typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(restore)
    restore()
    const frame = requestAnimationFrame(restore)
    if (pane.firstElementChild) observer?.observe(pane.firstElementChild)
    const finish = setTimeout(() => {
      restoring = false
      observer?.disconnect()
    }, 1500)
    for (const event of ['wheel', 'touchstart', 'pointerdown', 'keydown'])
      pane.addEventListener(event, interacted, { passive: true })
    // Explicit section navigation takes precedence over a pending restoration.
    pane.addEventListener('document-navigation', interacted)
    pane.addEventListener('scroll', scrolled, { passive: true })
    window.addEventListener('pagehide', persist)
    document.addEventListener('visibilitychange', hide)
    return () => {
      clearTimeout(timer)
      clearTimeout(finish)
      cancelAnimationFrame(frame)
      observer?.disconnect()
      persist()
      for (const event of ['wheel', 'touchstart', 'pointerdown', 'keydown'])
        pane.removeEventListener(event, interacted)
      pane.removeEventListener('document-navigation', interacted)
      pane.removeEventListener('scroll', scrolled)
      window.removeEventListener('pagehide', persist)
      document.removeEventListener('visibilitychange', hide)
    }
  }, [noteId, mode, loading])
}
