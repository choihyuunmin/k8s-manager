import { useState, useEffect, useCallback, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { Download, RefreshCw } from 'lucide-react'
import { clusterApi, manifestApi } from '../api/client'
import FilterBar from '../components/FilterBar'
import DataTable, { type Column } from '../components/DataTable'
import StatusBadge from '../components/StatusBadge'
import LoadingSpinner from '../components/LoadingSpinner'
import Modal from '../components/Modal'
import ConfirmDialog from '../components/ConfirmDialog'
import BulkActionBar from '../components/BulkActionBar'
import { useNamespaceParam } from '../hooks/useNamespace'

type Tab = 'nodes' | 'pods' | 'deployments' | 'services' | 'events'

const tabs: { key: Tab; label: string }[] = [
  { key: 'nodes', label: '노드' },
  { key: 'pods', label: '파드' },
  { key: 'deployments', label: '디플로이먼트' },
  { key: 'services', label: '서비스' },
  { key: 'events', label: '이벤트' },
]

export default function ClusterPage() {
  const nsParam = useNamespaceParam()
  const navigate = useNavigate()
  const [tab, setTab] = useState<Tab>('nodes')
  const [data, setData] = useState<Record<string, unknown>[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [detail, setDetail] = useState<Record<string, unknown> | null>(null)
  const [importing, setImporting] = useState<string | null>(null)
  const [restartingKey, setRestartingKey] = useState<string | null>(null)
  const [selected, setSelected] = useState<Array<string | number>>([])
  const [bulkRestartOpen, setBulkRestartOpen] = useState(false)
  const [bulkRestarting, setBulkRestarting] = useState(false)

  const fetchData = useCallback(async () => {
    setLoading(true)
    setSelected([])
    try {
      let res
      switch (tab) {
        case 'nodes': res = await clusterApi.getNodes(); break
        case 'pods': res = await clusterApi.getPods(nsParam); break
        case 'deployments': res = await clusterApi.getDeployments(nsParam); break
        case 'services': res = await clusterApi.getServices(nsParam); break
        case 'events': res = await clusterApi.getEvents(nsParam); break
      }
      setData(res.data ?? [])
    } catch {
      setData([])
    } finally {
      setLoading(false)
    }
  }, [tab, nsParam])

  useEffect(() => { fetchData() }, [fetchData])

  // Synthetic unique key for each row (namespace/name where applicable, else name)
  const withKeys = useMemo(() => data.map((r) => ({
    ...r,
    _key: r.namespace ? `${r.namespace}/${r.name}` : String(r.name),
  })), [data])

  const filtered = withKeys.filter((r) => {
    if (!search) return true
    return JSON.stringify(r).toLowerCase().includes(search.toLowerCase())
  })

  const handleImport = async (row: Record<string, unknown>) => {
    const kind = tab === 'pods' ? 'Pod' : tab === 'deployments' ? 'Deployment' : 'Service'
    const name = String(row.name)
    const ns = String(row.namespace || 'default')
    setImporting(name)
    try {
      const yamlRes = await clusterApi.getResourceYaml(kind, name, ns)
      const res = await manifestApi.create({
        name: `${kind.toLowerCase()}-${name}`,
        content_yaml: yamlRes.data.yaml,
        kind,
        namespace: ns,
      })
      navigate(`/manifests/${res.data.id}`)
    } catch {
      alert('매니페스트 가져오기에 실패했습니다.')
    } finally {
      setImporting(null)
    }
  }

  const handleRestart = async (row: Record<string, unknown>) => {
    const name = String(row.name)
    const ns = String(row.namespace || 'default')
    const key = `${ns}/${name}`
    setRestartingKey(key)
    try {
      await clusterApi.rolloutRestart('Deployment', ns, name)
      alert(`✓ ${ns}/${name} 재배포 시작됨`)
    } catch (err: unknown) {
      const detail = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail
      alert(detail || '재배포에 실패했습니다.')
    } finally {
      setRestartingKey(null)
    }
  }

  const handleBulkRestart = async () => {
    setBulkRestartOpen(false)
    setBulkRestarting(true)
    const items = selected.map((k) => {
      const [namespace, name] = String(k).split('/')
      return { kind: 'Deployment', namespace, name }
    })
    try {
      const res = await clusterApi.bulkRolloutRestart(items)
      const results: { status: string; namespace: string; name: string; message?: string }[] = res.data?.results ?? []
      const failed = results.filter((r) => r.status !== 'success')
      if (failed.length === 0) {
        alert(`✓ ${results.length}개 Deployment 재배포 시작됨`)
      } else {
        const lines = failed.map((r) => `✗ ${r.namespace}/${r.name}: ${r.message ?? ''}`)
        alert(`성공 ${results.length - failed.length}, 실패 ${failed.length}\n\n${lines.join('\n')}`)
      }
      setSelected([])
    } catch {
      alert('일괄 재배포에 실패했습니다.')
    } finally {
      setBulkRestarting(false)
    }
  }

  const importButton = (r: Record<string, unknown>) => (
    <button
      onClick={(e) => { e.stopPropagation(); handleImport(r) }}
      disabled={importing === String(r.name)}
      className="flex items-center gap-1 px-2 py-1 text-xs bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded transition-colors"
    >
      <Download size={12} /> {importing === String(r.name) ? '가져오는 중...' : '가져오기'}
    </button>
  )

  const deploymentActions = (r: Record<string, unknown>) => {
    const key = `${r.namespace}/${r.name}`
    return (
      <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
        <button
          onClick={() => handleRestart(r)}
          disabled={restartingKey === key}
          className="flex items-center gap-1 px-2 py-1 text-xs bg-amber-600 hover:bg-amber-700 disabled:opacity-50 text-white rounded transition-colors"
        >
          <RefreshCw size={12} className={restartingKey === key ? 'animate-spin' : ''} />
          {restartingKey === key ? '재배포 중...' : '재배포'}
        </button>
        {importButton(r)}
      </div>
    )
  }

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
      { key: 'actions', header: '액션', render: importButton },
    ],
    deployments: [
      { key: 'name', header: '이름', sortable: true },
      { key: 'namespace', header: '네임스페이스', sortable: true },
      { key: 'ready_replicas', header: '준비됨' },
      { key: 'replicas', header: '레플리카' },
      { key: 'available_replicas', header: '상태', render: (r) => <StatusBadge status={Number(r.available_replicas) > 0 ? 'Running' : 'Pending'} /> },
      { key: 'actions', header: '액션', render: deploymentActions },
    ],
    services: [
      { key: 'name', header: '이름', sortable: true },
      { key: 'namespace', header: '네임스페이스', sortable: true },
      { key: 'type', header: '타입', sortable: true },
      { key: 'cluster_ip', header: 'Cluster IP' },
      { key: 'ports', header: '포트' },
      { key: 'actions', header: '액션', render: importButton },
    ],
    events: [
      { key: 'type', header: '유형', sortable: true, render: (r) => <StatusBadge status={String(r.type ?? 'Normal')} /> },
      { key: 'reason', header: '원인', sortable: true },
      { key: 'involved_object', header: '대상', render: (r) => { const obj = r.involved_object as Record<string, string> | undefined; return <span>{obj ? `${obj.kind}/${obj.name}` : '-'}</span> } },
      { key: 'message', header: '메시지' },
      { key: 'last_timestamp', header: '시간', sortable: true },
    ],
  }

  const isDeploymentTab = tab === 'deployments'

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">클러스터 상태</h1>

      <div className="flex items-center gap-1 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg p-1">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${
              tab === t.key
                ? 'bg-blue-600 text-white'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <FilterBar searchValue={search} onSearchChange={setSearch} searchPlaceholder="리소스 검색..." />

      {isDeploymentTab && (
        <BulkActionBar count={selected.length} onClear={() => setSelected([])}>
          <button
            onClick={() => setBulkRestartOpen(true)}
            disabled={bulkRestarting}
            className="flex items-center gap-1 px-3 py-1.5 text-xs bg-amber-600 hover:bg-amber-700 disabled:opacity-50 text-white rounded transition-colors"
          >
            <RefreshCw size={12} className={bulkRestarting ? 'animate-spin' : ''} /> 일괄 재배포
          </button>
        </BulkActionBar>
      )}

      <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden">
        {loading ? (
          <LoadingSpinner text="데이터를 불러오는 중..." />
        ) : (
          <DataTable
            columns={columnsByTab[tab]}
            data={filtered}
            keyField="_key"
            onRowClick={(row) => setDetail(row)}
            selectable={isDeploymentTab}
            selectedKeys={isDeploymentTab ? selected : undefined}
            onSelectionChange={isDeploymentTab ? setSelected : undefined}
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
          <pre className="text-sm text-slate-700 dark:text-slate-300 bg-slate-50 dark:bg-slate-950 p-4 rounded-lg overflow-auto max-h-96 font-mono">
            {JSON.stringify(detail, null, 2)}
          </pre>
        )}
      </Modal>

      <ConfirmDialog
        open={bulkRestartOpen}
        onClose={() => setBulkRestartOpen(false)}
        onConfirm={handleBulkRestart}
        title="Deployment 일괄 재배포"
        message={`선택한 ${selected.length}개 Deployment를 재배포(rollout restart)하시겠습니까?`}
        confirmText="재배포"
      />
    </div>
  )
}
