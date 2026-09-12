export const SETTINGS_KEY = 'dev-notes:ai-settings:v1'
export interface AiSettings {
  endpoint: string
  model: string
  apiKey: string
}

export function loadAiSettings(): AiSettings {
  try {
    const stored: unknown = JSON.parse(
      localStorage.getItem(SETTINGS_KEY) ?? 'null',
    )
    if (
      stored &&
      typeof stored === 'object' &&
      'endpoint' in stored &&
      typeof stored.endpoint === 'string' &&
      'model' in stored &&
      typeof stored.model === 'string'
    ) {
      return { endpoint: stored.endpoint, model: stored.model, apiKey: '' }
    }
  } catch {
    /* Unavailable or invalid settings fall back to an empty form. */
  }
  return { endpoint: '', model: '', apiKey: '' }
}
