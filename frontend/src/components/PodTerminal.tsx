import { useEffect, useRef, useState } from 'react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import '@xterm/xterm/css/xterm.css'

interface Props {
  namespace: string
  pod: string
  container?: string
}

export default function PodTerminal({ namespace, pod, container }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [connected, setConnected] = useState(false)
  const [reconnectKey, setReconnectKey] = useState(0)

  useEffect(() => {
    const el = containerRef.current
    if (!el) return

    const term = new Terminal({
      cursorBlink: true,
      fontSize: 13,
      fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
      theme: { background: '#1e1e1e', foreground: '#e6e6e6' },
    })
    const fit = new FitAddon()
    term.loadAddon(fit)
    term.open(el)
    try { fit.fit() } catch { /* 레이아웃 미정 시 무시 */ }

    const token = localStorage.getItem('token') ?? ''
    const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    const params = new URLSearchParams()
    if (container) params.set('container', container)
    params.set('token', token)
    const url = `${proto}//${window.location.host}/api/exec/${namespace}/${pod}?${params.toString()}`
    const ws = new WebSocket(url)

    const sendResize = () => {
      try { fit.fit() } catch { return }
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'resize', cols: term.cols, rows: term.rows }))
      }
    }

    ws.onopen = () => {
      setConnected(true)
      sendResize()
      term.focus()
    }
    ws.onmessage = (e) => term.write(e.data)
    ws.onclose = () => {
      setConnected(false)
      term.write('\r\n\x1b[31m[연결이 종료되었습니다]\x1b[0m\r\n')
    }
    ws.onerror = () => setConnected(false)

    const dataSub = term.onData((d) => {
      if (ws.readyState === WebSocket.OPEN) ws.send(d)
    })

    const ro = new ResizeObserver(() => sendResize())
    ro.observe(el)
    window.addEventListener('resize', sendResize)

    return () => {
      ro.disconnect()
      window.removeEventListener('resize', sendResize)
      dataSub.dispose()
      ws.close()
      term.dispose()
    }
  }, [namespace, pod, container, reconnectKey])

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between text-xs">
        <span className={connected ? 'text-emerald-500' : 'text-red-500'}>
          {connected ? '● 연결됨' : '● 연결 끊김'}
        </span>
        {!connected && (
          <button
            onClick={() => setReconnectKey((k) => k + 1)}
            className="px-2 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded transition-colors"
          >
            재연결
          </button>
        )}
      </div>
      <div ref={containerRef} className="h-96 w-full bg-[#1e1e1e] rounded p-2 overflow-hidden" />
    </div>
  )
}
