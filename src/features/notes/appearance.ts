export const APPEARANCE_KEY = 'devnotes:appearance:v1'
export interface Appearance {
  fontSize: 14 | 16 | 18 | 20
  width: 'comfortable' | 'wide' | 'full'
  animations: boolean
  theme: 'light' | 'dark'
}
export const defaultAppearance: Appearance = {
  fontSize: 16,
  width: 'full',
  animations: true,
  theme: 'light',
}

export function loadAppearance(): Appearance {
  try {
    const value: unknown = JSON.parse(
      localStorage.getItem(APPEARANCE_KEY) ?? 'null',
    )
    if (!value || typeof value !== 'object') return defaultAppearance
    const fields = value as Partial<Appearance>
    return {
      fontSize: [14, 16, 18, 20].includes(fields.fontSize ?? 0)
        ? fields.fontSize!
        : 16,
      width: ['comfortable', 'wide', 'full'].includes(fields.width ?? '')
        ? fields.width!
        : 'full',
      animations:
        typeof fields.animations === 'boolean' ? fields.animations : true,
      theme: fields.theme === 'dark' ? 'dark' : 'light',
    }
  } catch {
    return defaultAppearance
  }
}

export function motionEnabled() {
  return (
    document.documentElement.dataset.motion !== 'off' &&
    !window.matchMedia('(prefers-reduced-motion: reduce)').matches
  )
}
