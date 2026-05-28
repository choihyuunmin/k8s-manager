import { createContext, useContext, useState, useEffect, useCallback, createElement, type ReactNode } from 'react'
import { clusterApi } from '../api/client'

interface NamespaceContextValue {
  namespace: string
  namespaces: string[]
  setNamespace: (ns: string) => void
  loading: boolean
  refresh: () => Promise<void>
}

const NamespaceContext = createContext<NamespaceContextValue | null>(null)

const NS_KEY = 'k8s-selected-namespace'

export function NamespaceProvider({ children }: { children: ReactNode }) {
  const [namespace, setNamespaceState] = useState<string>(() => localStorage.getItem(NS_KEY) || 'all')
  const [namespaces, setNamespaces] = useState<string[]>([])
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(async () => {
    try {
      const res = await clusterApi.getNamespaces()
      const names = (res.data ?? []).map((ns: { name: string }) => ns.name)
      setNamespaces(names)
    } catch {
      setNamespaces([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { refresh() }, [refresh])

  const setNamespace = useCallback((ns: string) => {
    setNamespaceState(ns)
    localStorage.setItem(NS_KEY, ns)
  }, [])

  return createElement(
    NamespaceContext.Provider,
    { value: { namespace, namespaces, setNamespace, loading, refresh } },
    children,
  )
}

export function useNamespace() {
  const ctx = useContext(NamespaceContext)
  if (!ctx) throw new Error('useNamespace must be used within NamespaceProvider')
  return ctx
}

// Helper: returns undefined when 'all' is selected (for API calls)
export function useNamespaceParam() {
  const { namespace } = useNamespace()
  return namespace === 'all' ? undefined : namespace
}
