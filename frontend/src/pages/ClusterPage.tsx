import { useState, useEffect, useCallback } from 'react'
import { clusterApi } from '../api/client'
import FilterBar, { FilterSelect } from '../components/FilterBar'
import DataTable, { type Column } from '../components/DataTable'
import StatusBadge from '../components/StatusBadge'
import LoadingSpinner from '../components/LoadingSpinner'
import Modal from '../components/Modal'

type Tab = 'nodes' | 'pods' | 'deployments' | 'services' | 'events'

const tabs: { key: Tab; label: string }[] = [
  { key: 'nodes', label: '노드' },
  { key: 'pods', label: '파드' },
  { key: 'deployments', label: '디플로이먼트' },
  { key: 'services', label: '서비스' },
  { key: 'events', label: '이벤트' },
]

export default function ClusterPage() {
  const [tab, setTab] = useState<Tab>('nodes')
  const [namespace, setNamespace] = useState('all')
  const [namespaces, setNamespaces] = useState<string[]>([])
  const [data, setData] = useState<Record<string, unknown>[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [detail, setDetail] = useState<Record<string, unknown> | null>(null)

  useEffect(() => {
    clusterApi.getNamespaces().then((r) => {
      const names = (r.data ?? []).map((ns: { name: string }) => ns.name)
      setNamespaces(names)
    }).catch(() => {})
  }, [])

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const ns = namespace === 'all' ? undefined : namespace
      let res
      switch (tab) {
        case 'nodes': res = await clusterApi.getNodes(); break
        case 'pods': res = await clusterApi.getPods(ns); break
        case 'deployments': res = await clusterApi.getDeployments(ns); break
        case 'services': res = await clusterApi.getServices(ns); break
        case 'events': res = await clusterApi.getEvents(ns); break
      }
      setData(res.data ?? [])
    } catch {
      setData([])
    } finally {
      setLoading(false)
    }
  }, [tab, namespace])

  useEffect(() => { fetchData() }, [fetchData])

  const filtered = data.filter((r) => {
    if (!search) return true
    return JSON.stringify(r).toLowerCase().includes(search.toLowerCase())
  })

  const columnsByTab: Record<Tab, Column<Record<string, unknown>>[]> = {
    nodes: [
      { key: 'name', header: '이름', sortable: true },
      { key: 'status', header: '상태', sortable: true, render: (r) => <StatusBadge status={String(r.status ?? 'Unknown')} /> },
      { key: 'roles', header: '역할' },
      { key: 'kubelet_version', header: '버전' },
      { key: 'cpu_capacity', header: 'CPU' },
      { key: 'memory_capacity', header: '메모리' },
    ],
    pods: [
      { key: 'name', header: '이름', sortable: true },
      { key: 'namespace', header: '네임스페이스', sortable: true },
      { key: 'status', header: '상태', sortable: true, render: (r) => <StatusBadge status={String(r.status ?? 'Unknown')} /> },
      { key: 'restarts', header: '재시작', sortable: true },
      { key: 'node', header: '노드' },
      { key: 'created_at', header: '생성 시간', sortable: true },
    ],
    deployments: [
      { key: 'name', header: '이름', sortable: true },
      { key: 'namespace', header: '네임스페이스', sortable: true },
      { key: 'ready_replicas', header: '준비됨' },
      { key: 'replicas', header: '레플리카' },
      { key: 'available_replicas', header: '상태', render: (r) => <StatusBadge status={Number(r.available_replicas) > 0 ? 'Running' : 'Pending'} /> },
      { key: 'created_at', header: '생성 시간', sortable: true },
    ],
    services: [
      { key: 'name', header: '이름', sortable: true },
      { key: 'namespace', header: '네임스페이스', sortable: true },
      { key: 'type', header: '타입', sortable: true },
      { key: 'cluster_ip', header: 'Cluster IP' },
      { key: 'ports', header: '포트' },
      { key: 'created_at', header: '생성 시간', sortable: true },
    ],
    events: [
      { key: 'type', header: '유형', sortable: true, render: (r) => <StatusBadge status={String(r.type ?? 'Normal')} /> },
      { key: 'reason', header: '원인', sortable: true },
      { key: 'involved_object', header: '대상', render: (r) => { const obj = r.involved_object as Record<string, string> | undefined; return <span>{obj ? `${obj.kind}/${obj.name}` : '-'}</span> } },
      { key: 'message', header: '메시지' },
      { key: 'last_timestamp', header: '시간', sortable: true },
    ],
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-slate-100">클러스터 상태</h1>

      <div className="flex items-center gap-1 bg-slate-800 border border-slate-700 rounded-lg p-1">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${
              tab === t.key
                ? 'bg-blue-600 text-white'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-700'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <FilterBar searchValue={search} onSearchChange={setSearch} searchPlaceholder="리소스 검색...">
        {tab !== 'nodes' && (
          <FilterSelect
            label="네임스페이스"
            value={namespace}
            onChange={setNamespace}
            options={[{ value: 'all', label: '전체' }, ...namespaces.map((n) => ({ value: n, label: n }))]}
          />
        )}
      </FilterBar>

      <div className="bg-slate-800 border border-slate-700 rounded-xl overflow-hidden">
        {loading ? (
          <LoadingSpinner text="데이터를 불러오는 중..." />
        ) : (
          <DataTable
            columns={columnsByTab[tab]}
            data={filtered}
            keyField="name"
            onRowClick={(row) => setDetail(row)}
          />
        )}
      </div>

      <Modal
        open={!!detail}
        onClose={() => setDetail(null)}
        title="리소스 상세"
        width="max-w-2xl"
      >
        {detail && (
          <pre className="text-sm text-slate-300 bg-slate-950 p-4 rounded-lg overflow-auto max-h-96 font-mono">
            {JSON.stringify(detail, null, 2)}
          </pre>
        )}
      </Modal>
    </div>
  )
}
