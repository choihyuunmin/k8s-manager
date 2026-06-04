import { useState, useEffect, useCallback } from 'react'
import { Plus, Monitor, Wifi, Pencil, Trash2 } from 'lucide-react'
import { nodeApi } from '../api/client'
import DataTable, { type Column } from '../components/DataTable'
import StatusBadge from '../components/StatusBadge'
import LoadingSpinner from '../components/LoadingSpinner'
import Modal from '../components/Modal'
import ConfirmDialog from '../components/ConfirmDialog'
import BulkActionBar from '../components/BulkActionBar'

interface NodeRecord {
  id: string
  name: string
  host: string
  port: number
  username: string
  status: string
  [key: string]: unknown
}

export default function NodesPage() {
  const [nodes, setNodes] = useState<NodeRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState(false)
  const [editTarget, setEditTarget] = useState<NodeRecord | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<NodeRecord | null>(null)
  const [form, setForm] = useState({ name: '', host: '', port: 22, username: '', password: '', sudo_password: '' })
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState<string | null>(null)
  const [selected, setSelected] = useState<Array<string | number>>([])
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false)
  const [bulkTesting, setBulkTesting] = useState(false)

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const res = await nodeApi.list()
      setNodes(res.data ?? [])
    } catch {
      setNodes([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  const openCreate = () => {
    setEditTarget(null)
    setForm({ name: '', host: '', port: 22, username: '', password: '', sudo_password: '' })
    setModal(true)
  }

  const openEdit = (node: NodeRecord) => {
    setEditTarget(node)
    setForm({ name: node.name, host: node.host, port: node.port, username: node.username, password: '', sudo_password: '' })
    setModal(true)
  }

  const handleSave = async () => {
    if (!form.name.trim() || !form.host.trim() || !form.username.trim()) {
      alert('필수 필드를 모두 입력해주세요.')
      return
    }
    setSaving(true)
    try {
      const data = { ...form, password: form.password || undefined, sudo_password: form.sudo_password || undefined }
      if (editTarget) {
        await nodeApi.update(editTarget.id, data)
      } else {
        await nodeApi.create(data)
      }
      setModal(false)
      await fetchData()
    } catch {
      alert('노드 저장에 실패했습니다.')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!deleteTarget) return
    try {
      await nodeApi.delete(deleteTarget.id)
      await fetchData()
    } catch {
      alert('노드 삭제에 실패했습니다.')
    }
  }

  const handleBulkDelete = async () => {
    setBulkDeleteOpen(false)
    const ids = [...selected]
    let failed = 0
    for (const id of ids) {
      try { await nodeApi.delete(String(id)) } catch { failed++ }
    }
    setSelected([])
    await fetchData()
    if (failed > 0) alert(`${failed}개 삭제 실패`)
  }

  const handleBulkTest = async () => {
    setBulkTesting(true)
    const results: { name: string; ok: boolean; msg?: string }[] = []
    for (const id of selected) {
      try {
        const res = await nodeApi.testConnection(String(id))
        const node = nodes.find((n) => String(n.id) === String(id))
        results.push({
          name: node?.name ?? String(id),
          ok: res.data?.status === 'success',
          msg: res.data?.message,
        })
      } catch {
        const node = nodes.find((n) => String(n.id) === String(id))
        results.push({ name: node?.name ?? String(id), ok: false, msg: 'error' })
      }
    }
    setBulkTesting(false)
    alert(results.map((r) => `${r.ok ? '✓' : '✗'} ${r.name}${r.msg ? ' — ' + r.msg : ''}`).join('\n'))
  }

  const handleTest = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation()
    setTesting(id)
    try {
      const res = await nodeApi.testConnection(id)
      alert(res.data?.status === 'success' ? '연결 성공!' : '연결 실패: ' + (res.data?.message ?? ''))
    } catch {
      alert('연결 테스트에 실패했습니다.')
    } finally {
      setTesting(null)
    }
  }

  const columns: Column<NodeRecord>[] = [
    { key: 'name', header: '이름', sortable: true },
    { key: 'host', header: '호스트', sortable: true },
    { key: 'port', header: '포트' },
    { key: 'username', header: '사용자' },
    {
      key: 'status',
      header: '연결 상태',
      render: (r) => <StatusBadge status={r.status ?? 'Unknown'} />,
    },
    {
      key: 'actions',
      header: '액션',
      render: (r) => (
        <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
          <button
            onClick={(e) => handleTest(r.id, e)}
            disabled={testing === r.id}
            className="flex items-center gap-1 px-2 py-1 text-xs bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded transition-colors"
          >
            {testing === r.id ? (
              <><Wifi size={12} className="animate-pulse" /> 테스트 중...</>
            ) : (
              <><Wifi size={12} /> 연결 테스트</>
            )}
          </button>
          <button
            onClick={() => openEdit(r)}
            className="p-1.5 text-slate-600 dark:text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-slate-200 dark:hover:bg-slate-700 rounded transition-colors"
          >
            <Pencil size={14} />
          </button>
          <button
            onClick={() => setDeleteTarget(r)}
            className="p-1.5 text-slate-600 dark:text-slate-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-slate-200 dark:hover:bg-slate-700 rounded transition-colors"
          >
            <Trash2 size={14} />
          </button>
        </div>
      ),
    },
  ]

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
          <Monitor size={24} /> SSH 노드 관리
        </h1>
        <button
          onClick={openCreate}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors"
        >
          <Plus size={16} /> 노드 추가
        </button>
      </div>

      <BulkActionBar count={selected.length} onClear={() => setSelected([])}>
        <button
          onClick={handleBulkTest}
          disabled={bulkTesting}
          className="flex items-center gap-1 px-3 py-1.5 text-xs bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded transition-colors"
        >
          <Wifi size={12} /> {bulkTesting ? '테스트 중...' : '연결 테스트'}
        </button>
        <button
          onClick={() => setBulkDeleteOpen(true)}
          className="flex items-center gap-1 px-3 py-1.5 text-xs bg-red-600 hover:bg-red-700 text-white rounded transition-colors"
        >
          <Trash2 size={12} /> 삭제
        </button>
      </BulkActionBar>

      <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden">
        {loading ? (
          <LoadingSpinner text="노드를 불러오는 중..." />
        ) : (
          <DataTable
            columns={columns}
            data={nodes}
            keyField="id"
            selectable
            selectedKeys={selected}
            onSelectionChange={setSelected}
          />
        )}
      </div>

      <Modal
        open={modal}
        onClose={() => setModal(false)}
        title={editTarget ? '노드 수정' : '노드 추가'}
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
            <label className="block text-sm text-slate-600 dark:text-slate-400 mb-1">이름 *</label>
            <input
              type="text"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="node-1"
              className="w-full px-3 py-2 text-sm bg-slate-100 dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded-lg text-slate-800 dark:text-slate-200 placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:border-blue-500 transition-colors"
            />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-2">
              <label className="block text-sm text-slate-600 dark:text-slate-400 mb-1">호스트 *</label>
              <input
                type="text"
                value={form.host}
                onChange={(e) => setForm({ ...form, host: e.target.value })}
                placeholder="192.168.1.100"
                className="w-full px-3 py-2 text-sm bg-slate-100 dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded-lg text-slate-800 dark:text-slate-200 placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:border-blue-500 transition-colors"
              />
            </div>
            <div>
              <label className="block text-sm text-slate-600 dark:text-slate-400 mb-1">포트</label>
              <input
                type="number"
                value={form.port}
                onChange={(e) => setForm({ ...form, port: Number(e.target.value) || 22 })}
                className="w-full px-3 py-2 text-sm bg-slate-100 dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded-lg text-slate-800 dark:text-slate-200 focus:outline-none focus:border-blue-500 transition-colors"
              />
            </div>
          </div>
          <div>
            <label className="block text-sm text-slate-600 dark:text-slate-400 mb-1">사용자명 *</label>
            <input
              type="text"
              value={form.username}
              onChange={(e) => setForm({ ...form, username: e.target.value })}
              placeholder="root"
              className="w-full px-3 py-2 text-sm bg-slate-100 dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded-lg text-slate-800 dark:text-slate-200 placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:border-blue-500 transition-colors"
            />
          </div>
          <div>
            <label className="block text-sm text-slate-600 dark:text-slate-400 mb-1">비밀번호 (SSH 접속용)</label>
            <input
              type="password"
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
              placeholder={editTarget ? '변경하지 않으려면 비워두세요' : 'SSH 로그인 비밀번호'}
              className="w-full px-3 py-2 text-sm bg-slate-100 dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded-lg text-slate-800 dark:text-slate-200 placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:border-blue-500 transition-colors"
            />
          </div>
          <div>
            <label className="block text-sm text-slate-600 dark:text-slate-400 mb-1">sudo 비밀번호 (선택)</label>
            <input
              type="password"
              value={form.sudo_password}
              onChange={(e) => setForm({ ...form, sudo_password: e.target.value })}
              placeholder={editTarget ? '변경하지 않으려면 비워두세요' : 'root가 아닐 때 podman/ctr 실행용'}
              className="w-full px-3 py-2 text-sm bg-slate-100 dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded-lg text-slate-800 dark:text-slate-200 placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:border-blue-500 transition-colors"
            />
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              비root 사용자로 접속해 이미지를 로드할 때 sudo 암호로 사용됩니다. root 접속이거나 NOPASSWD sudo면 비워두세요.
            </p>
          </div>
        </div>
      </Modal>

      <ConfirmDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        title="노드 삭제"
        message={`"${deleteTarget?.name}" 노드를 삭제하시겠습니까?`}
        confirmText="삭제"
      />

      <ConfirmDialog
        open={bulkDeleteOpen}
        onClose={() => setBulkDeleteOpen(false)}
        onConfirm={handleBulkDelete}
        title="노드 일괄 삭제"
        message={`선택한 ${selected.length}개 노드를 삭제하시겠습니까?`}
        confirmText="삭제"
      />
    </div>
  )
}
