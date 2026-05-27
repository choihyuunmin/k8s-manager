import { useState, useEffect, useRef, useCallback } from 'react'
import { Play, Square, Trash2, Download, Search } from 'lucide-react'
import { logsApi } from '../api/client'
import { useWebSocket } from '../hooks/useWebSocket'
import { FilterSelect } from '../components/FilterBar'
import { clusterApi } from '../api/client'

export default function LogsPage() {
  const [namespaces, setNamespaces] = useState<string[]>([])
  const [pods, setPods] = useState<string[]>([])
  const [containers, setContainers] = useState<string[]>([])
  const [namespace, setNamespace] = useState('')
  const [pod, setPod] = useState('')
  const [container, setContainer] = useState('')
  const [tail, setTail] = useState(100)
  const [logFilter, setLogFilter] = useState('')
  const logEndRef = useRef<HTMLDivElement>(null)
  const { messages, isConnected, connect, disconnect, clear } = useWebSocket()

  useEffect(() => {
    clusterApi.getNamespaces().then((r) => {
      const names = (r.data ?? []).map((ns: { name: string }) => ns.name)
      setNamespaces(names)
    }).catch(() => {})
  }, [])

  useEffect(() => {
    if (namespace) {
      logsApi.getPods(namespace).then((r) => {
        setPods(r.data ?? [])
        setPod('')
        setContainer('')
        setContainers([])
      }).catch(() => setPods([]))
    }
  }, [namespace])

  useEffect(() => {
    if (namespace && pod) {
      logsApi.getContainers(namespace, pod).then((r) => {
        const list = (r.data ?? []).map((c: { name: string }) => c.name)
        setContainers(list)
        setContainer('')
      }).catch(() => setContainers([]))
    }
  }, [namespace, pod])

  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const handleToggle = useCallback(() => {
    if (isConnected) {
      disconnect()
    } else {
      if (!namespace || !pod) {
        alert('네임스페이스와 파드를 선택해주세요.')
        return
      }
      connect({ namespace, pod, container: container || undefined, tail })
    }
  }, [isConnected, namespace, pod, container, tail, connect, disconnect])

  const handleDownload = () => {
    const blob = new Blob([messages.join('\n')], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${pod}-logs-${new Date().toISOString().slice(0, 19)}.txt`
    a.click()
    URL.revokeObjectURL(url)
  }

  const filteredMessages = logFilter
    ? messages.filter((m) => m.toLowerCase().includes(logFilter.toLowerCase()))
    : messages

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-slate-100">로그 뷰어</h1>

      <div className="flex flex-wrap items-end gap-4 bg-slate-800 border border-slate-700 rounded-xl p-4">
        <FilterSelect
          label="네임스페이스"
          value={namespace}
          onChange={setNamespace}
          options={[
            { value: '', label: '선택...' },
            ...namespaces.map((n) => ({ value: n, label: n })),
          ]}
        />
        <FilterSelect
          label="파드"
          value={pod}
          onChange={setPod}
          options={[
            { value: '', label: '선택...' },
            ...pods.map((p) => ({ value: p, label: p })),
          ]}
        />
        <FilterSelect
          label="컨테이너"
          value={container}
          onChange={setContainer}
          options={[
            { value: '', label: '전체' },
            ...containers.map((c) => ({ value: c, label: c })),
          ]}
        />
        <div className="flex items-center gap-2">
          <span className="text-sm text-slate-400">Tail</span>
          <input
            type="number"
            value={tail}
            onChange={(e) => setTail(Number(e.target.value) || 100)}
            className="w-20 px-3 py-2 text-sm bg-slate-900 border border-slate-600 rounded-lg text-slate-200 focus:outline-none focus:border-blue-500 transition-colors"
          />
        </div>
        <button
          onClick={handleToggle}
          className={`flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
            isConnected
              ? 'bg-red-600 hover:bg-red-700 text-white'
              : 'bg-emerald-600 hover:bg-emerald-700 text-white'
          }`}
        >
          {isConnected ? <><Square size={14} /> 중지</> : <><Play size={14} /> 스트리밍</>}
        </button>
      </div>

      <div className="flex items-center gap-3">
        <div className="relative flex-1">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={logFilter}
            onChange={(e) => setLogFilter(e.target.value)}
            placeholder="로그 필터링..."
            className="w-full pl-9 pr-3 py-2 text-sm bg-slate-800 border border-slate-700 rounded-lg text-slate-200 placeholder-slate-500 focus:outline-none focus:border-blue-500 transition-colors"
          />
        </div>
        <button
          onClick={clear}
          className="flex items-center gap-2 px-3 py-2 text-sm bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 rounded-lg transition-colors"
        >
          <Trash2 size={14} /> 지우기
        </button>
        <button
          onClick={handleDownload}
          disabled={messages.length === 0}
          className="flex items-center gap-2 px-3 py-2 text-sm bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-slate-300 border border-slate-700 rounded-lg transition-colors"
        >
          <Download size={14} /> 다운로드
        </button>
        {isConnected && (
          <span className="flex items-center gap-1.5 text-sm text-emerald-400">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            연결됨
          </span>
        )}
      </div>

      <div className="bg-slate-950 border border-slate-700 rounded-xl overflow-hidden">
        <div className="h-[500px] overflow-auto p-4 font-mono text-xs leading-5 text-slate-300">
          {filteredMessages.length === 0 ? (
            <p className="text-slate-600 text-center mt-20">
              {messages.length === 0
                ? '파드를 선택하고 스트리밍을 시작하세요.'
                : '필터와 일치하는 로그가 없습니다.'}
            </p>
          ) : (
            filteredMessages.map((msg, i) => (
              <div key={i} className="hover:bg-slate-900/50 px-1 rounded">
                {msg}
              </div>
            ))
          )}
          <div ref={logEndRef} />
        </div>
      </div>
    </div>
  )
}
