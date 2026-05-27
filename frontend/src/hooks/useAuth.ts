import { createContext, useContext, useState, useCallback, useEffect, createElement, type ReactNode } from 'react'
import { authApi } from '../api/client'

interface User {
  username: string
  role: string
}

interface AuthContextValue {
  user: User | null
  token: string | null
  isAuthenticated: boolean
  login: (username: string, password: string) => Promise<void>
  logout: () => void
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(() => {
    const stored = localStorage.getItem('user')
    return stored ? JSON.parse(stored) : null
  })
  const [token, setToken] = useState<string | null>(() => localStorage.getItem('token'))

  useEffect(() => {
    if (token && !user) {
      authApi.me().then((res) => {
        setUser(res.data)
        localStorage.setItem('user', JSON.stringify(res.data))
      }).catch(() => {
        setToken(null)
        localStorage.removeItem('token')
        localStorage.removeItem('user')
      })
    }
  }, [token, user])

  const login = useCallback(async (username: string, password: string) => {
    const res = await authApi.login(username, password)
    const { token: t, user: u } = res.data
    setToken(t)
    setUser(u)
    localStorage.setItem('token', t)
    localStorage.setItem('user', JSON.stringify(u))
  }, [])

  const logout = useCallback(() => {
    setToken(null)
    setUser(null)
    localStorage.removeItem('token')
    localStorage.removeItem('user')
  }, [])

  return createElement(
    AuthContext.Provider,
    { value: { user, token, isAuthenticated: !!token, login, logout } },
    children,
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
