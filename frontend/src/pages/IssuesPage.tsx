import { useState, useEffect, useCallback } from 'react'
import { Plus, CheckCircle, AlertCircle, Trash2 } from 'lucide-react'
import { issueApi } from '../api/client'
import DataTable, { type Column } from '../components/DataTable'
import FilterBar, { FilterSelect } from '../components/FilterBar'
import StatusBadge from '../components/StatusBadge'
import LoadingSpinner from '../components/LoadingSpinner'
import Modal from '../components/Modal'
import ConfirmDialog from '../components/ConfirmDialog'
import BulkActionBar from '../components/BulkActionBar'

interface Issue {
  id: string
  title: string
  description: string
  resource: string
  severity: string
  status: string
  createdAt: string
  [key: string]: unknown
}

const SEVERITY_COLORS: Record<string, string> = {
  critical: 'bg-red-500/20 text-red-600 dark:text-red-400 border-red-500/30',
  high: 'bg-orange-500/20 text-orange-400 border-orange-500/30',
  medium: 'bg-amber-500/20 text-amber-600 dark:text-amber-400 border-amber-500/30',
  low: 'bg-blue-500/20 text-blue-600 dark:text-blue-400 border-blue-500/30',
}

export default function IssuesPage() {
  const [issues, setIssues] = useState<Issue[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [severityFilter, setSeverityFilter] = useState('all')
  const [modal, setModal] = useState(false)
  const [editTarget, setEditTarget] = useState<Issue | null>(null)
  const [form, setForm] = useState({ title: '', description: '', resource: '', severity: 'medium' })
  const [saving, setSaving] = useState(false)
  const [selected, setSelected] = useState<Array<string | number>>([])
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false)
  const [bulkResolving, setBulkResolving] = useState(false)

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const params: Record<string, string> = {}
      if (statusFilter !== 'all') params.status = statusFilter
      if (severityFilter !== 'all') params.severity = severityFilter
      const res = await issueApi.list(params)
      setIssues(res.data ?? [])
    } catch {
      setIssues([])
    } finally {
      setLoading(false)
    }
  }, [statusFilter, severityFilter])

  useEffect(() => { fetchData() }, [fetchData])

  const openCreate = () => {
    setEditTarget(null)
    setForm({ title: '', description: '', resource: '', severity: 'medium' })
    setModal(true)
  }

  const openEdit = (issue: Issue) => {
    setEditTarget(issue)
    setForm({
      title: issue.title,
      description: issue.description,
      resource: issue.resource,
      severity: issue.severity,
    })
    setModal(true)
  }

  const handleSave = async () => {
    if (!form.title.trim()) {
      alert('제목을 입력해주세요.')
      return
    }
    setSaving(true)
    try {
      if (editTarget) {
        await issueApi.update(editTarget.id, form)
      } else {
        await issueApi.create(form)
      }
      setModal(false)
      await fetchData()
    } catch {
      alert('이슈 저장에 실패했습니다.')
    } finally {
      setSaving(false)
    }
  }

  const handleResolve = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation()
    try {
      await issueApi.update(id, { status: 'resolved' })
      await fetchData()
    } catch {
      alert('상태 변경에 실패했습니다.')
    }
  }

  const handleBulkResolve = async () => {
    setBulkResolving(true)
    let failed = 0
    for (const id of selected) {
      try { await issueApi.update(String(id), { status: 'resolved' }) } catch { failed++ }
    }
    setBulkResolving(false)
    setSelected([])
    await fetchData()
    if (failed > 0) alert(`${failed}개 해결 처리 실패`)
  }

  const handleBulkDelete = async () => {
    setBulkDeleteOpen(false)
    let failed = 0
    for (const id of selected) {
      try { await issueApi.delete(String(id)) } catch { failed++ }
    }
    setSelected([])
    await fetchData()
    if (failed > 0) alert(`${failed}개 삭제 실패`)
  }

  const filtered = issues.filter((iss) => {
    if (!search) return true
    return iss.title.toLowerCase().includes(search.toLowerCase()) ||
      iss.resource.toLowerCase().includes(search.toLowerCase())
  })

  const columns: Column<Issue>[] = [
    { key: 'title', header: '제목', sortable: true },
    { key: 'resource', header: '관련 리소스' },
    {
      key: 'severity',
      header: '심각도',
      sortable: true,
      render: (r) => (
        <span className={`inline-flex items-center px-2 py-0.5 text-xs rounded-full border font-medium ${SEVERITY_COLORS[r.severity] ?? ''}`}>
          {r.severity}
        </span>
      ),
    },
    {
      key: 'status',
      header: '상태',
      sortable: true,
      render: (r) => <StatusBadge status={r.status === 'resolved' ? 'Completed' : r.status === 'in-progress' ? 'Pending' : 'Active'} />,
    },
    { key: 'createdAt', header: '생성일', sortable: true },
    {
      key: 'actions',
      header: '액션',
      render: (r) => (
        <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
          {r.status !== 'resolved' && (
            <button
              onClick={(e) => handleResolve(r.id, e)}
              className="flex items-center gap-1 px-2 py-1 text-xs bg-emerald-600 hover:bg-emerald-700 text-white rounded transition-colors"
            >
              <CheckCircle size={12} /> 해결
            </button>
          )}
        </div>
      ),
    },
  ]

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
          <AlertCircle size={24} /> 이슈 관리
        </h1>
        <button
          onClick={openCreate}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors"
        >
          <Plus size={16} /> 이슈 등록
        </button>
      </div>

      <FilterBar searchValue={search} onSearchChange={setSearch} searchPlaceholder="이슈 검색...">
        <FilterSelect
          label="상태"
          value={statusFilter}
          onChange={setStatusFilter}
          options={[
            { value: 'all', label: '전체' },
            { value: 'open', label: '열림' },
            { value: 'in-progress', label: '진행 중' },
            { value: 'resolved', label: '해결됨' },
          ]}
        />
        <FilterSelect
          label="심각도"
          value={severityFilter}
          onChange={setSeverityFilter}
          options={[
            { value: 'all', label: '전체' },
            { value: 'critical', label: 'Critical' },
            { value: 'high', label: 'High' },
            { value: 'medium', label: 'Medium' },
            { value: 'low', label: 'Low' },
          ]}
        />
      </FilterBar>

      <BulkActionBar count={selected.length} onClear={() => setSelected([])}>
        <button
          onClick={handleBulkResolve}
          disabled={bulkResolving}
          className="flex items-center gap-1 px-3 py-1.5 text-xs bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded transition-colors"
        >
          <CheckCircle size={12} /> {bulkResolving ? '처리 중...' : '일괄 해결'}
        </button>
        <button
          onClick={() => setBulkDeleteOpen(true)}
          className="flex items-center gap-1 px-3 py-1.5 text-xs bg-red-600 hover:bg-red-700 text-white rounded transition-colors"
        >
          <Trash2 size={12} /> 일괄 삭제
        </button>
      </BulkActionBar>

      <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden">
        {loading ? (
          <LoadingSpinner text="이슈를 불러오는 중..." />
        ) : (
          <DataTable
            columns={columns}
            data={filtered}
            keyField="id"
            onRowClick={openEdit}
            selectable
            selectedKeys={selected}
            onSelectionChange={setSelected}
          />
        )}
      </div>

      <ConfirmDialog
        open={bulkDeleteOpen}
        onClose={() => setBulkDeleteOpen(false)}
        onConfirm={handleBulkDelete}
        title="이슈 일괄 삭제"
        message={`선택한 ${selected.length}개 이슈를 삭제하시겠습니까?`}
        confirmText="삭제"
      />

      <Modal
        open={modal}
        onClose={() => setModal(false)}
        title={editTarget ? '이슈 수정' : '이슈 등록'}
        width="max-w-xl"
        footer={
          <>
            <button
              onClick={() => setModal(false)}
              className="px-4 py-2 text-sm bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-300 rounded-lg transition-colors"
            >
              취소
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className="px-4 py-2 text-sm bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-lg transition-colors"
            >
              {saving ? '저장 중...' : '저장'}
            </button>
          </>
        }
      >
        <div className="space-y-4">
          <div>
            <label className="block text-sm text-slate-600 dark:text-slate-400 mb-1">제목</label>
            <input
              type="text"
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              placeholder="이슈 제목"
              className="w-full px-3 py-2 text-sm bg-slate-100 dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded-lg text-slate-800 dark:text-slate-200 placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:border-blue-500 transition-colors"
            />
          </div>
          <div>
            <label className="block text-sm text-slate-600 dark:text-slate-400 mb-1">설명</label>
            <textarea
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              placeholder="이슈 설명"
              rows={4}
              className="w-full px-3 py-2 text-sm bg-slate-100 dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded-lg text-slate-800 dark:text-slate-200 placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:border-blue-500 transition-colors resize-none"
            />
          </div>
          <div>
            <label className="block text-sm text-slate-600 dark:text-slate-400 mb-1">관련 리소스</label>
            <input
              type="text"
              value={form.resource}
              onChange={(e) => setForm({ ...form, resource: e.target.value })}
              placeholder="예: deployment/my-app"
              className="w-full px-3 py-2 text-sm bg-slate-100 dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded-lg text-slate-800 dark:text-slate-200 placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:border-blue-500 transition-colors"
            />
          </div>
          <div>
            <label className="block text-sm text-slate-600 dark:text-slate-400 mb-1">심각도</label>
            <select
              value={form.severity}
              onChange={(e) => setForm({ ...form, severity: e.target.value })}
              className="w-full px-3 py-2 text-sm bg-slate-100 dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded-lg text-slate-800 dark:text-slate-200 focus:outline-none focus:border-blue-500 transition-colors"
            >
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
              <option value="critical">Critical</option>
            </select>
          </div>
        </div>
      </Modal>
    </div>
  )
}
