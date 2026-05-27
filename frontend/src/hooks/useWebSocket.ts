import { useState, useRef, useCallback } from 'react'

interface UseWebSocketOptions {
  namespace: string
  pod: string
  container?: string
  tail?: number
}

export function useWebSocket() {
  const [messages, setMessages] = useState<string[]>([])
  const [isConnected, setIsConnected] = useState(false)
  const wsRef = useRef<WebSocket | null>(null)

  const connect = useCallback((opts: UseWebSocketOptions) => {
    if (wsRef.current) {
      wsRef.current.close()
    }

    const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    const host = window.location.host
    let url = `${proto}//${host}/api/logs/stream/${opts.namespace}/${opts.pod}`
    const params = new URLSearchParams()
    if (opts.container) params.set('container', opts.container)
    if (opts.tail) params.set('tail', String(opts.tail))
    const qs = params.toString()
    if (qs) url += `?${qs}`

    const ws = new WebSocket(url)
    wsRef.current = ws

    ws.onopen = () => setIsConnected(true)
    ws.onclose = () => setIsConnected(false)
    ws.onerror = () => setIsConnected(false)
    ws.onmessage = (e) => {
      setMessages((prev) => [...prev, e.data])
    }
  }, [])

  const disconnect = useCallback(() => {
    if (wsRef.current) {
      wsRef.current.close()
      wsRef.current = null
    }
    setIsConnected(false)
  }, [])

  const clear = useCallback(() => {
    setMessages([])
  }, [])

  return { messages, isConnected, connect, disconnect, clear }
}
