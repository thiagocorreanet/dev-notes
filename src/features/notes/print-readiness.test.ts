import { describe, expect, it, vi } from 'vitest'
import { waitForPrintContent } from './print-readiness'

describe('Print readiness', () => {
  it('waits for every diagram and its decoded image before printing', async () => {
    const root = document.createElement('article')
    root.innerHTML =
      '<figure data-mermaid-status="pending"></figure><figure data-mermaid-status="pending"></figure><img />'
    const image = root.querySelector('img')!
    const decode = vi.fn().mockResolvedValue(undefined)
    image.decode = decode
    const ready = vi.fn()
    const pending = waitForPrintContent(
      root,
      new AbortController().signal,
    ).then(ready)
    root.children[0]!.setAttribute('data-mermaid-status', 'ready')
    await Promise.resolve()
    expect(ready).not.toHaveBeenCalled()
    root.children[1]!.setAttribute('data-mermaid-status', 'error')
    await pending
    expect(decode).toHaveBeenCalledOnce()
    expect(ready).toHaveBeenCalledOnce()
  })

  it('stops waiting when the print view is closed', async () => {
    const root = document.createElement('article')
    root.innerHTML = '<figure data-mermaid-status="pending"></figure>'
    const controller = new AbortController()
    const pending = waitForPrintContent(root, controller.signal)
    controller.abort()
    await expect(pending).resolves.toBeUndefined()
  })
})
