export const TABS_KEY = 'dev-notes:tabs:v1'

export function loadTabs(): { ids: string[]; activeId: string | null } {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(TABS_KEY) ?? 'null')
    if (
      value &&
      typeof value === 'object' &&
      'ids' in value &&
      Array.isArray(value.ids) &&
      value.ids.every((id) => typeof id === 'string') &&
      'activeId' in value &&
      typeof value.activeId === 'string'
    )
      return {
        ids: [...new Set(value.ids)],
        activeId: value.activeId,
      }
  } catch {
    /* Tab preferences do not affect document recovery. */
  }
  return { ids: [], activeId: null }
}
