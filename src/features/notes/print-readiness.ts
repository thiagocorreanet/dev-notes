export async function waitForPrintContent(
  root: HTMLElement,
  signal: AbortSignal,
) {
  if (signal.aborted) return
  await new Promise<void>((resolve) => {
    const finish = () => {
      observer.disconnect()
      signal.removeEventListener('abort', finish)
      resolve()
    }
    const check = () => {
      if (!root.querySelector('[data-mermaid-status="pending"]')) finish()
    }
    const observer = new MutationObserver(check)
    observer.observe(root, { subtree: true, attributes: true, childList: true })
    signal.addEventListener('abort', finish, { once: true })
    check()
  })
  if (signal.aborted) return
  await document.fonts?.ready
  await Promise.allSettled(
    Array.from(root.querySelectorAll('img'), (image) => image.decode?.()),
  )
}
