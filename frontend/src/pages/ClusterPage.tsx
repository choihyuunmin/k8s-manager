import { useState, useEffect, useCallback, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { Download, RefreshCw, Trash2, AlertCircle, Search } from 'lucide-react'
import { clusterApi, manifestApi } from '../api/client'
import FilterBar from '../components/FilterBar'
import DataTable, { type Column } from '../components/DataTable'
import StatusBadge from '../components/StatusBadge'
import LoadingSpinner from '../components/LoadingSpinner'
import Modal from '../components/Modal'
import ConfirmDialog from '../components/ConfirmDialog'
import BulkActionBar from '../components/BulkActionBar'
import { useNamespaceParam } from '../hooks/useNamespace'

interface PodDescribe {
  name: string
  namespace: string
  phase: string
  reason: string
  message: string
  node: string
  conditions: { type: string; status: string; reason: string; message: string; last_transition_time: string }[]
  containers: { name: string; ready: boolean; restart_count: number; image: string; state: { state: string; reason?: string; message?: string; exit_code?: number } }[]
  init_containers: { name: string; ready: boolean; state: { state: string; reason?: string; message?: string } }[]
  events: { type: string; reason: string; message: string; count: number; last_timestamp: string; source: string }[]
}

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
  const [deletingPod, setDeletingPod] = useState<string | null>(null)
  const [podDeleteTarget, setPodDeleteTarget] = useState<Record<string, unknown> | null>(null)
  const [bulkPodDeleteOpen, setBulkPodDeleteOpen] = useState(false)
  const [describeTarget, setDescribeTarget] = useState<PodDescribe | null>(null)
  const [describing, setDescribing] = useState<string | null>(null)

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

  const handleDeletePod = async () => {
    if (!podDeleteTarget) return
    const name = String(podDeleteTarget.name)
    const ns = String(podDeleteTarget.namespace || 'default')
    setDeletingPod(`${ns}/${name}`)
    try {
      await clusterApi.deletePod(ns, name)
      setPodDeleteTarget(null)
      await fetchData()
    } catch (err: unknown) {
      const detail = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail
      alert(detail || '파드 삭제에 실패했습니다.')
    } finally {
      setDeletingPod(null)
    }
  }

  const handleBulkDeletePods = async () => {
    setBulkPodDeleteOpen(false)
    const items = selected.map((k) => {
      const [namespace, name] = String(k).split('/')
      return { namespace, name }
    })
    try {
      const res = await clusterApi.bulkDeletePods(items)
      const results: { status: string; namespace: string; name: string; message?: string }[] = res.data?.results ?? []
      const failed = results.filter((r) => r.status !== 'success')
      if (failed.length === 0) {
        alert(`✓ ${results.length}개 Pod 삭제됨`)
      } else {
        const lines = failed.map((r) => `✗ ${r.namespace}/${r.name}: ${r.message ?? ''}`)
        alert(`성공 ${results.length - failed.length}, 실패 ${failed.length}\n\n${lines.join('\n')}`)
      }
      setSelected([])
      await fetchData()
    } catch {
      alert('일괄 삭제에 실패했습니다.')
    }
  }

  const handleDescribe = async (row: Record<string, unknown>) => {
    const name = String(row.name)
    const ns = String(row.namespace || 'default')
    const key = `${ns}/${name}`
    setDescribing(key)
    try {
      const res = await clusterApi.describePod(ns, name)
      setDescribeTarget(res.data)
    } catch (err: unknown) {
      const detail = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail
      alert(detail || '파드 정보 조회에 실패했습니다.')
    } finally {
      setDescribing(null)
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

  const podActions = (r: Record<string, unknown>) => {
    const key = `${r.namespace}/${r.name}`
    return (
      <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
        <button
          onClick={() => handleDescribe(r)}
          disabled={describing === key}
          className="flex items-center gap-1 px-2 py-1 text-xs bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded transition-colors"
        >
          <Search size={12} /> {describing === key ? '...' : '원인 보기'}
        </button>
        <button
          onClick={() => setPodDeleteTarget(r)}
          disabled={deletingPod === key}
          className="flex items-center gap-1 px-2 py-1 text-xs bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white rounded transition-colors"
        >
          <Trash2 size={12} /> 삭제
        </button>
      </div>
    )
  }

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
      { key: 'actions', header: '액션', render: podActions },
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
  const isPodTab = tab === 'pods'
  const isSelectableTab = isDeploymentTab || isPodTab

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

      {isPodTab && (
        <BulkActionBar count={selected.length} onClear={() => setSelected([])}>
          <button
            onClick={() => setBulkPodDeleteOpen(true)}
            className="flex items-center gap-1 px-3 py-1.5 text-xs bg-red-600 hover:bg-red-700 text-white rounded transition-colors"
          >
            <Trash2 size={12} /> 일괄 삭제
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
            selectable={isSelectableTab}
            selectedKeys={isSelectableTab ? selected : undefined}
            onSelectionChange={isSelectableTab ? setSelected : undefined}
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

      <ConfirmDialog
        open={!!podDeleteTarget}
        onClose={() => setPodDeleteTarget(null)}
        onConfirm={handleDeletePod}
        title="파드 삭제"
        message={`"${podDeleteTarget?.namespace}/${podDeleteTarget?.name}" 파드를 삭제하시겠습니까? 컨트롤러가 있으면 자동으로 재생성됩니다.`}
        confirmText="삭제"
      />

      <ConfirmDialog
        open={bulkPodDeleteOpen}
        onClose={() => setBulkPodDeleteOpen(false)}
        onConfirm={handleBulkDeletePods}
        title="파드 일괄 삭제"
        message={`선택한 ${selected.length}개 Pod를 삭제하시겠습니까?`}
        confirmText="삭제"
      />

      {/* Pod describe modal: shows phase/reason, container states, conditions, events */}
      <Modal
        open={!!describeTarget}
        onClose={() => setDescribeTarget(null)}
        title={describeTarget ? `파드 진단 — ${describeTarget.namespace}/${describeTarget.name}` : ''}
        width="max-w-3xl"
      >
        {describeTarget && (
          <div className="space-y-4 text-sm">
            <div className="flex flex-wrap gap-3">
              <div className="px-3 py-1.5 bg-slate-100 dark:bg-slate-900 rounded-lg">
                <span className="text-xs text-slate-500">Phase</span>
                <p className="font-medium text-slate-800 dark:text-slate-200">{describeTarget.phase}</p>
              </div>
              {describeTarget.reason && (
                <div className="px-3 py-1.5 bg-amber-500/10 border border-amber-500/30 rounded-lg">
                  <span className="text-xs text-amber-700 dark:text-amber-300">Reason</span>
                  <p className="font-medium text-amber-700 dark:text-amber-300">{describeTarget.reason}</p>
                </div>
              )}
              {describeTarget.node && (
                <div className="px-3 py-1.5 bg-slate-100 dark:bg-slate-900 rounded-lg">
                  <span className="text-xs text-slate-500">노드</span>
                  <p className="font-medium text-slate-800 dark:text-slate-200">{describeTarget.node}</p>
                </div>
              )}
            </div>

            {describeTarget.message && (
              <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-red-700 dark:text-red-300 text-xs font-mono break-words">
                {describeTarget.message}
              </div>
            )}

            {(describeTarget.containers.length > 0 || describeTarget.init_containers.length > 0) && (
              <section>
                <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">컨테이너 상태</h3>
                <div className="space-y-2">
                  {describeTarget.init_containers.map((c) => (
                    <ContainerStatusRow key={'i-' + c.name} container={c} init />
                  ))}
                  {describeTarget.containers.map((c) => (
                    <ContainerStatusRow key={c.name} container={c} />
                  ))}
                </div>
              </section>
            )}

            {describeTarget.conditions.length > 0 && (
              <section>
                <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">Conditions</h3>
                <div className="space-y-1.5">
                  {describeTarget.conditions.map((c, i) => (
                    <div key={i} className="flex items-start gap-2 text-xs">
                      <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold flex-shrink-0 ${
                        c.status === 'True'
                          ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400'
                          : 'bg-amber-500/15 text-amber-700 dark:text-amber-400'
                      }`}>
                        {c.type}
                      </span>
                      <div className="min-w-0">
                        {c.reason && <p className="text-slate-700 dark:text-slate-300">{c.reason}</p>}
                        {c.message && <p className="text-slate-600 dark:text-slate-400">{c.message}</p>}
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            )}

            <section>
              <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2 flex items-center gap-2">
                <AlertCircle size={14} className="text-amber-600 dark:text-amber-400" />
                관련 이벤트 ({describeTarget.events.length})
              </h3>
              {describeTarget.events.length === 0 ? (
                <p className="text-xs text-slate-500">이벤트 없음</p>
              ) : (
                <div className="space-y-1.5 max-h-72 overflow-auto">
                  {describeTarget.events.map((e, i) => (
                    <div key={i} className="flex items-start gap-3 p-2.5 bg-slate-50 dark:bg-slate-900/50 rounded-lg">
                      <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold flex-shrink-0 mt-0.5 ${
                        e.type === 'Warning'
                          ? 'bg-amber-500/15 text-amber-700 dark:text-amber-400'
                          : 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400'
                      }`}>
                        {e.type}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="text-xs text-slate-800 dark:text-slate-200">
                          <span className="font-mono text-blue-600 dark:text-blue-400">{e.reason}</span>
                          {e.count > 1 && <span className="text-slate-500"> ×{e.count}</span>}
                          <span className="text-slate-500"> · {e.last_timestamp}</span>
                        </p>
                        <p className="text-xs text-slate-700 dark:text-slate-300 mt-0.5 break-words">{e.message}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </div>
        )}
      </Modal>
    </div>
  )
}

function ContainerStatusRow({ container, init }: { container: PodDescribe['containers'][number] | PodDescribe['init_containers'][number]; init?: boolean }) {
  const s = container.state
  const stateColor =
    s.state === 'running' ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400'
    : s.state === 'waiting' ? 'bg-amber-500/15 text-amber-700 dark:text-amber-400'
    : s.state === 'terminated' ? 'bg-red-500/15 text-red-700 dark:text-red-400'
    : 'bg-slate-500/15 text-slate-700 dark:text-slate-400'
  return (
    <div className="p-2.5 bg-slate-50 dark:bg-slate-900/50 rounded-lg">
      <div className="flex items-center justify-between gap-2 flex-wrap mb-1">
        <span className="text-xs font-medium text-slate-800 dark:text-slate-200">
          {init && <span className="text-slate-500 mr-1">[init]</span>}
          {container.name}
        </span>
        <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${stateColor}`}>{s.state}</span>
      </div>
      {(s.reason || s.message) && (
        <p className="text-xs text-slate-700 dark:text-slate-300">
          {s.reason && <span className="font-mono">{s.reason}</span>}
          {s.reason && s.message && <span> · </span>}
          {s.message}
        </p>
      )}
      {'restart_count' in container && container.restart_count > 0 && (
        <p className="text-xs text-slate-500 mt-0.5">재시작: {container.restart_count}회</p>
      )}
    </div>
  )
}
