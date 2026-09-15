import { useCallback, useEffect, useRef, useState } from 'react'
import { getCodexStatus, startCodexLogin } from '@/features/notes/ai-chat'
import type { CodexAccountStatus } from '@/features/notes/ai-chat'

export function useCodexAccount() {
  const [status, setStatus] = useState<CodexAccountStatus | null>(null)
  const [loading, setLoading] = useState(false)
  const [loginPending, setLoginPending] = useState(false)
  const [loginUrl, setLoginUrl] = useState('')
  const [error, setError] = useState('')
  const mounted = useRef(true)

  const refresh = useCallback(async (signal?: AbortSignal) => {
    setLoading(true)
    try {
      const next = await getCodexStatus(signal)
      if (!signal?.aborted && mounted.current) {
        setStatus(next)
        setError('')
      }
      return next
    } catch (cause) {
      if (!signal?.aborted && mounted.current) {
        setStatus({
          available: false,
          state: 'unavailable',
          email: null,
          plan: null,
          model: 'Padrão do Codex',
          primary: null,
          secondary: null,
        })
        setError(
          cause instanceof Error
            ? cause.message
            : 'Não foi possível verificar a conexão com o Codex.',
        )
      }
      return null
    } finally {
      if (!signal?.aborted && mounted.current) setLoading(false)
    }
  }, [])

  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])

  useEffect(() => {
    if (!loginPending) return
    let cancelled = false
    let timer: ReturnType<typeof setTimeout> | undefined
    function poll() {
      timer = setTimeout(async () => {
        const next = await refresh()
        if (cancelled) return
        if (next?.state === 'connected') {
          setLoginPending(false)
          setLoginUrl('')
          return
        }
        void poll()
      }, 1_500)
    }
    void poll()
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [loginPending, refresh])

  async function login() {
    setLoading(true)
    setError('')
    const popup = window.open('', 'devnotes-codex-login')
    try {
      const result = await startCodexLogin()
      if (!mounted.current) return
      setLoginUrl(result.authUrl)
      setLoginPending(true)
      if (popup) {
        popup.opener = null
        popup.location.href = result.authUrl
      }
    } catch (cause) {
      popup?.close()
      if (mounted.current)
        setError(
          cause instanceof Error
            ? cause.message
            : 'Não foi possível iniciar a entrada com o ChatGPT.',
        )
    } finally {
      if (mounted.current) setLoading(false)
    }
  }

  return {
    status,
    loading,
    loginPending,
    loginUrl,
    error,
    login,
    refresh,
  }
}
