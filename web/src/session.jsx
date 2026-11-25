// Who is signed in, what state their account is in, and how the platform is
// configured. One fetch on load, refreshed after anything that changes it.

import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import { api } from './api.js'

const SessionContext = createContext(null)

export function SessionProvider({ children }) {
  const [user, setUser] = useState(null)
  const [account, setAccount] = useState(null)
  const [health, setHealth] = useState(null)
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(async () => {
    try {
      const me = await api.auth.me()
      setUser(me.data)
      try {
        const status = await api.account.status()
        setAccount(status.data)
      } catch {
        setAccount(null)
      }
    } catch {
      setUser(null)
      setAccount(null)
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const [h] = await Promise.all([api.health().catch(() => null), refresh()])
      if (!cancelled) {
        setHealth(h?.data || null)
        setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [refresh])

  const signOut = useCallback(async () => {
    await api.auth.signOut().catch(() => {})
    setUser(null)
    setAccount(null)
  }, [])

  const value = {
    user,
    account,
    health,
    loading,
    refresh,
    signOut,
    setUser,
    // Where the customer is in opening an account.
    stage: account?.stage || (user?.has_investor ? user.investor_status : 'not_started'),
    canTrade: account?.stage === 'active',
    isSampleData: health?.bluum_mode === 'mock',
  }

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>
}

export const useSession = () => {
  const ctx = useContext(SessionContext)
  if (!ctx) throw new Error('useSession must be used inside SessionProvider')
  return ctx
}

// Loads something once and reports the three states a screen has to show.
export function useLoad(fn, deps = []) {
  const [data, setData] = useState(null)
  const [meta, setMeta] = useState(null)
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(true)
  const [tick, setTick] = useState(0)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    fn()
      .then((res) => {
        if (cancelled) return
        setData(res?.data ?? res)
        setMeta(res?.meta ?? null)
      })
      .catch((e) => !cancelled && setError(e))
      .finally(() => !cancelled && setLoading(false))
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, tick])

  return { data, meta, error, loading, reload: () => setTick((t) => t + 1) }
}
