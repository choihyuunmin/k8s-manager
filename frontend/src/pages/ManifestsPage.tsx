import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus, Play, Trash2, FileCode } from 'lucide-react'
import { manifestApi } from '../api/client'
import DataTable, { type Column } from '../components/DataTable'
import FilterBar from '../components/FilterBar'
import LoadingSpinner from '../components/LoadingSpinner'
import ConfirmDialog from '../components/ConfirmDialog'
import BulkActionBar from '../components/BulkActionBar'
import { useNamespaceParam } from '../hooks/useNamespace'

interface Manifest {
  id: string
  name: string
  kind: string
  namespace: string
  version: number
  updatedAt: string
  [key: string]: unknown
}

export default function ManifestsPage() {
  const nsParam = useNamespaceParam()
  const [manifests, setManifests] = useState<Manifest[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [deleteTarget, setDeleteTarget] = useState<Manifest | null>(null)
  const [selected, setSelected] = useState<Array<string | number>>([])
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false)
  const [bulkApplying, setBulkApplying] = useState(false)
  const navigate = useNavigate()

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const res = await manifestApi.list()
      setManifests(res.data ?? [])
    } catch {
      setManifests([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  const handleApply = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation()
    try {
      await manifestApi.apply(id)
      alert('매니페스트가 적용되었습니다.')
    } catch {
      alert('매니페스트 적용에 실패했습니다.')
    }
  }

  const handleDelete = async () => {
    if (!deleteTarget) return
    try {
      await manifestApi.delete(deleteTarget.id)
      await fetchData()
    } catch {
      alert('매니페스트 삭제에 실패했습니다.')
    }
  }

  const handleBulkDelete = async () => {
    setBulkDeleteOpen(false)
    let failed = 0
    for (const id of selected) {
      try { await manifestApi.delete(String(id)) } catch { failed++ }
    }
    setSelected([])
    await fetchData()
    if (failed > 0) alert(`${failed}개 삭제 실패`)
  }

  const handleBulkApply = async () => {
    setBulkApplying(true)
    let failed = 0
    for (const id of selected) {
      try { await manifestApi.apply(String(id)) } catch { failed++ }
    }
    setBulkApplying(false)
    setSelected([])
    if (failed > 0) alert(`${failed}개 적용 실패`)
    else alert(`${selected.length}개 매니페스트가 적용되었습니다.`)
  }

  const filtered = manifests.filter((m) => {
    if (nsParam && m.namespace !== nsParam) return false
    if (!search) return true
    return m.name.toLowerCase().includes(search.toLowerCase()) ||
      m.kind.toLowerCase().includes(search.toLowerCase())
  })

  const columns: Column<Manifest>[] = [
    { key: 'name', header: '이름', sortable: true },
    { key: 'kind', header: '종류', sortable: true },
    { key: 'namespace', header: '네임스페이스', sortable: true },
    { key: 'version', header: '버전', sortable: true, render: (r) => <span>v{r.version}</span> },
    { key: 'updatedAt', header: '마지막 수정', sortable: true },
    {
      key: 'actions',
      header: '액션',
      render: (r) => (
        <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
          <button
            onClick={(e) => handleApply(r.id, e)}
            className="flex items-center gap-1 px-2 py-1 text-xs bg-emerald-600 hover:bg-emerald-700 text-white rounded transition-colors"
          >
            <Play size={12} /> 적용
          </button>
          <button
            onClick={() => setDeleteTarget(r)}
            className="flex items-center gap-1 px-2 py-1 text-xs bg-red-600 hover:bg-red-700 text-white rounded transition-colors"
          >
            <Trash2 size={12} /> 삭제
          </button>
        </div>
      ),
    },
  ]

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">매니페스트</h1>
        <button
          onClick={() => navigate('/manifests/new')}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors"
        >
          <Plus size={16} /> 새 매니페스트
        </button>
      </div>

      <FilterBar searchValue={search} onSearchChange={setSearch} searchPlaceholder="매니페스트 검색..." />

      <BulkActionBar count={selected.length} onClear={() => setSelected([])}>
        <button
          onClick={handleBulkApply}
          disabled={bulkApplying}
          className="flex items-center gap-1 px-3 py-1.5 text-xs bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded transition-colors"
        >
          <Play size={12} /> {bulkApplying ? '적용 중...' : '일괄 적용'}
        </button>
        <button
          onClick={() => setBulkDeleteOpen(true)}
          className="flex items-center gap-1 px-3 py-1.5 text-xs bg-red-600 hover:bg-red-700 text-white rounded transition-colors"
        >
          <Trash2 size={12} /> 일괄 삭제
        </button>
      </BulkActionBar>

      <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-700">
          <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-200 flex items-center gap-2">
            <FileCode size={18} /> 매니페스트 목록
          </h2>
        </div>
        {loading ? (
          <LoadingSpinner text="매니페스트를 불러오는 중..." />
        ) : (
          <DataTable
            columns={columns}
            data={filtered}
            keyField="id"
            onRowClick={(r) => navigate(`/manifests/${r.id}`)}
            selectable
            selectedKeys={selected}
            onSelectionChange={setSelected}
          />
        )}
      </div>

      <ConfirmDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        title="매니페스트 삭제"
        message={`"${deleteTarget?.name}" 매니페스트를 삭제하시겠습니까?`}
        confirmText="삭제"
      />

      <ConfirmDialog
        open={bulkDeleteOpen}
        onClose={() => setBulkDeleteOpen(false)}
        onConfirm={handleBulkDelete}
        title="매니페스트 일괄 삭제"
        message={`선택한 ${selected.length}개 매니페스트를 삭제하시겠습니까?`}
        confirmText="삭제"
      />
    </div>
  )
}
