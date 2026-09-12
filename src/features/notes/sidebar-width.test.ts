import { describe, expect, it, vi } from 'vitest'
import {
  DEFAULT_SIDEBAR_WIDTH,
  readSidebarWidth,
  saveSidebarWidth,
  SIDEBAR_WIDTH_KEY,
} from './sidebar-width'

describe('Sidebar width preference', () => {
  it('restores a resized width without changing workspace content', () => {
    localStorage.setItem('dev-notes:workspace:v1', 'existing workspace')
    saveSidebarWidth(382.4)
    expect(readSidebarWidth()).toBe(382)
    expect(localStorage.getItem('dev-notes:workspace:v1')).toBe(
      'existing workspace',
    )
  })

  it('validates saved widths and does not persist a collapsed sidebar', () => {
    expect(readSidebarWidth()).toBe(DEFAULT_SIDEBAR_WIDTH)
    localStorage.setItem(SIDEBAR_WIDTH_KEY, 'invalid')
    expect(readSidebarWidth()).toBe(DEFAULT_SIDEBAR_WIDTH)
    localStorage.setItem(SIDEBAR_WIDTH_KEY, '99999')
    expect(readSidebarWidth()).toBe(480)
    saveSidebarWidth(350)
    saveSidebarWidth(0)
    expect(readSidebarWidth()).toBe(350)
  })

  it('allows resizing when browser storage is unavailable', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('Storage unavailable')
    })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('Storage unavailable')
    })
    expect(readSidebarWidth()).toBe(DEFAULT_SIDEBAR_WIDTH)
    expect(() => saveSidebarWidth(400)).not.toThrow()
  })
})
