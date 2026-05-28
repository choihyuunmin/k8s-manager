import { useState, useEffect, useCallback } from 'react'
import { Server, Box, Layers, Globe, RefreshCw } from 'lucide-react'
import { clusterApi } from '../api/client'
import FilterBar, { FilterSelect } from '../components/FilterBar'
import DataTable, { type Column } from '../components/DataTable'
import StatusBadge from '../components/StatusBadge'
import LoadingSpinner from '../components/LoadingSpinner'
import { useNamespaceParam } from '../hooks/useNamespace'

interface Summary {
  nodes: number
  pods: number
  deployments: number
  services: number
}

interface Resource {
  name: string
  namespace: string
  kind: string
  status: string
  age: string
  [key: string]: unknown
}

const PRESET_KEY = 'k8s-dashboard-presets'

export default function DashboardPage() {
  const nsParam = useNamespaceParam()
  const [summary, setSummary] = useState<Summary>({ nodes: 0, pods: 0, deployments: 0, services: 0 })
  const [resources, setResources] = useState<Resource[]>([])
  const [kind, setKind] = useState('pods')
  const [statusFilter, setStatusFilter] = useState('all')
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [autoRefresh, setAutoRefresh] = useState(false)
  const [presets, setPresets] = useState<{ name: string; kind: string; status: string }[]>(() => {
    const stored = localStorage.getItem(PRESET_KEY)
    return stored ? JSON.parse(stored) : []
  })

  const fetchData = useCallback(async () => {
    try {
      const sumRes = await clusterApi.getSummary()
      setSummary(sumRes.data)
    } catch {
      // backend not available
    }
  }, [])

  const fetchResources = useCallback(async () => {
    setLoading(true)
    try {
      let res
      switch (kind) {
        case 'nodes': res = await clusterApi.getNodes(); break
        case 'deployments': res = await clusterApi.getDeployments(nsParam); break
        case 'services': res = await clusterApi.getServices(nsParam); break
        default: res = await clusterApi.getPods(nsParam); break
      }
      setResources(res.data ?? [])
    } catch {
      setResources([])
    } finally {
      setLoading(false)
    }
  }, [nsParam, kind])

  useEffect(() => { fetchData() }, [fetchData])
  useEffect(() => { fetchResources() }, [fetchResources])

  useEffect(() => {
    if (!autoRefresh) return
    const id = setInterval(() => { fetchData(); fetchResources() }, 10000)
    return () => clearInterval(id)
  }, [autoRefresh, fetchData, fetchResources])

  const filtered = resources.filter((r) => {
    if (statusFilter !== 'all' && r.status?.toLowerCase() !== statusFilter.toLowerCase()) return false
    if (search && !r.name?.toLowerCase().includes(search.toLowerCase())) return false
    return true
  })

  const columns: Column<Resource>[] = [
    { key: 'name', header: '이름', sortable: true },
    { key: 'namespace', header: '네임스페이스', sortable: true },
    { key: 'kind', header: '종류', sortable: true },
    { key: 'status', header: '상태', sortable: true, render: (r) => <StatusBadge status={r.status ?? 'Unknown'} /> },
    { key: 'age', header: '생성 시간', sortable: true },
  ]

  const savePreset = () => {
    const name = prompt('프리셋 이름을 입력하세요:')
    if (!name) return
    const updated = [...presets, { name, kind, status: statusFilter }]
    setPresets(updated)
    localStorage.setItem(PRESET_KEY, JSON.stringify(updated))
  }

  const loadPreset = (p: { kind: string; status: string }) => {
    setKind(p.kind)
    setStatusFilter(p.status)
  }

  const deletePreset = (idx: number) => {
    const updated = presets.filter((_, i) => i !== idx)
    setPresets(updated)
    localStorage.setItem(PRESET_KEY, JSON.stringify(updated))
  }

  const cards = [
    { label: '노드', value: summary.nodes, icon: Server, color: 'text-blue-400' },
    { label: '파드', value: summary.pods, icon: Box, color: 'text-emerald-400' },
    { label: '디플로이먼트', value: summary.deployments, icon: Layers, color: 'text-amber-400' },
    { label: '서비스', value: summary.services, icon: Globe, color: 'text-purple-400' },
  ]

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-100">대시보드</h1>
        <button
          onClick={() => setAutoRefresh(!autoRefresh)}
          className={`flex items-center gap-2 px-3 py-2 text-sm rounded-lg transition-colors ${
            autoRefresh ? 'bg-blue-600 text-white' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
          }`}
        >
          <RefreshCw size={14} className={autoRefresh ? 'animate-spin' : ''} />
          자동 새로고침
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {cards.map(({ label, value, icon: Icon, color }) => (
          <div key={label} className="bg-slate-800 border border-slate-700 rounded-xl p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-400">{label}</p>
                <p className="text-3xl font-bold text-slate-100 mt-1">{value}</p>
              </div>
              <Icon size={32} className={color} />
            </div>
          </div>
        ))}
      </div>

      <FilterBar searchValue={search} onSearchChange={setSearch} searchPlaceholder="리소스 이름 검색...">
        <FilterSelect
          label="종류"
          value={kind}
          onChange={setKind}
          options={[
            { value: 'pods', label: '파드' },
            { value: 'nodes', label: '노드' },
            { value: 'deployments', label: '디플로이먼트' },
            { value: 'services', label: '서비스' },
          ]}
        />
        <FilterSelect
          label="상태"
          value={statusFilter}
          onChange={setStatusFilter}
          options={[
            { value: 'all', label: '전체' },
            { value: 'running', label: 'Running' },
            { value: 'pending', label: 'Pending' },
            { value: 'failed', label: 'Failed' },
            { value: 'succeeded', label: 'Succeeded' },
          ]}
        />
        <button
          onClick={savePreset}
          className="px-3 py-2 text-sm bg-slate-700 hover:bg-slate-600 text-slate-300 rounded-lg transition-colors"
        >
          프리셋 저장
        </button>
      </FilterBar>

      {presets.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {presets.map((p, i) => (
            <div key={i} className="flex items-center gap-1">
              <button
                onClick={() => loadPreset(p)}
                className="px-3 py-1 text-xs bg-blue-500/15 text-blue-400 border border-blue-500/30 rounded-full hover:bg-blue-500/25 transition-colors"
              >
                {p.name}
              </button>
              <button
                onClick={() => deletePreset(i)}
                className="text-slate-500 hover:text-red-400 text-xs transition-colors"
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="bg-slate-800 border border-slate-700 rounded-xl overflow-hidden">
        {loading ? (
          <LoadingSpinner text="리소스를 불러오는 중..." />
        ) : (
          <DataTable columns={columns} data={filtered} keyField="name" />
        )}
      </div>
    </div>
  )
}
