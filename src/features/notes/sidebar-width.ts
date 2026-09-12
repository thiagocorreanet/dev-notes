export const SIDEBAR_WIDTH_KEY = 'dev-notes:sidebar-width:v1'
export const DEFAULT_SIDEBAR_WIDTH = 304
export const MIN_SIDEBAR_WIDTH = 260
export const MAX_SIDEBAR_WIDTH = 480

export function readSidebarWidth() {
  try {
    const stored = localStorage.getItem(SIDEBAR_WIDTH_KEY)
    const width = stored === null ? DEFAULT_SIDEBAR_WIDTH : Number(stored)
    return Number.isFinite(width) && width > 0
      ? Math.min(MAX_SIDEBAR_WIDTH, Math.max(MIN_SIDEBAR_WIDTH, width))
      : DEFAULT_SIDEBAR_WIDTH
  } catch {
    return DEFAULT_SIDEBAR_WIDTH
  }
}

export function saveSidebarWidth(width: number) {
  if (!Number.isFinite(width) || width < MIN_SIDEBAR_WIDTH) return
  try {
    localStorage.setItem(
      SIDEBAR_WIDTH_KEY,
      String(Math.min(MAX_SIDEBAR_WIDTH, Math.round(width))),
    )
  } catch {
    // Layout preferences are optional; resizing still works without storage.
  }
}
