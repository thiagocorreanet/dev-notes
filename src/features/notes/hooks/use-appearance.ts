import { useEffect, useState } from 'react'
import { APPEARANCE_KEY, loadAppearance } from '../appearance'
import type { Appearance } from '../appearance'

export function useAppearance() {
  const [appearance, setAppearance] = useState(loadAppearance)
  const [error, setError] = useState('')
  useEffect(() => {
    const root = document.documentElement
    const previous = root.dataset.motion
    root.dataset.motion = appearance.animations ? 'on' : 'off'
    return () => {
      if (previous === undefined) delete root.dataset.motion
      else root.dataset.motion = previous
    }
  }, [appearance.animations])
  useEffect(() => {
    const changed = (event: StorageEvent) => {
      if (event.key === APPEARANCE_KEY || event.key === null)
        setAppearance(loadAppearance())
    }
    window.addEventListener('storage', changed)
    return () => window.removeEventListener('storage', changed)
  }, [])
  function update(next: Appearance) {
    setAppearance(next)
    try {
      localStorage.setItem(APPEARANCE_KEY, JSON.stringify(next))
      setError('')
    } catch {
      setError(
        'As preferências foram aplicadas, mas não foi possível guardá-las neste navegador.',
      )
    }
  }
  return { appearance, update, error }
}
