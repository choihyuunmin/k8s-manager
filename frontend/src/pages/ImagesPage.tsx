import { useState, useEffect, useRef, useCallback, type DragEvent } from 'react'
import { Upload, HardDrive, Play, RefreshCw, Server, Trash2, Info } from 'lucide-react'
import { imageApi, nodeApi } from '../api/client'
import DataTable, { type Column } from '../components/DataTable'
import StatusBadge from '../components/StatusBadge'
import LoadingSpinner from '../components/LoadingSpinner'
import Modal from '../components/Modal'
import ConfirmDialog from '../components/ConfirmDialog'
import BulkActionBar from '../components/BulkActionBar'
import { FilterSelect } from '../components/FilterBar'

interface ImageRecord {
  id: number
  filename: string
  application: string | null
  image_name: string
  target_nodes: string
  status: string
  created_at: string
  [key: string]: unknown
}

interface NodeRecord {
  id: number
  name: string
  [key: string]: unknown
}

interface NodeImage {
  repository: string
  tag: string
  id: string
  size: string
  [key: string]: unknown
}

interface UploadTask {
  id: string
  filename: string
  size: number
  progress: number
  status: 'uploading' | 'success' | 'error'
  error?: string
}

export default function ImagesPage() {
  const [images, setImages] = useState<ImageRecord[]>([])
  const [nodes, setNodes] = useState<NodeRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [uploads, setUploads] = useState<UploadTask[]>([])
  const [dragActive, setDragActive] = useState(false)
  const [loadModal, setLoadModal] = useState<ImageRecord | null>(null)
  const [selectedNodes, setSelectedNodes] = useState<number[]>([])
  const [loadingAction, setLoadingAction] = useState(false)
  const [application, setApplication] = useState('')
  const [applications, setApplications] = useState<string[]>([])
  const [appFilter, setAppFilter] = useState('all')
  const [deleteTarget, setDeleteTarget] = useState<ImageRecord | null>(null)
  const [deleteNodeImageTarget, setDeleteNodeImageTarget] = useState<NodeImage | null>(null)
  const [selectedImages, setSelectedImages] = useState<Array<string | number>>([])
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false)
  const [bulkLoadOpen, setBulkLoadOpen] = useState(false)
  const [bulkLoadNodes, setBulkLoadNodes] = useState<number[]>([])
  const [bulkLoading, setBulkLoading] = useState(false)
  const [nodeImagesError, setNodeImagesError] = useState<string>('')
  const fileRef = useRef<HTMLInputElement>(null)

  // Node images state
  const [selectedNodeId, setSelectedNodeId] = useState<number | null>(null)
  const [nodeImages, setNodeImages] = useState<NodeImage[]>([])
  const [nodeImagesLoading, setNodeImagesLoading] = useState(false)
  const [replaceModal, setReplaceModal] = useState<NodeImage | null>(null)
  const [replaceNodes, setReplaceNodes] = useState<number[]>([])
  const [replaceFile, setReplaceFile] = useState<File | null>(null)
  const [replacing, setReplacing] = useState(false)
  const [replaceProgress, setReplaceProgress] = useState(0)
  const replaceFileRef = useRef<HTMLInputElement>(null)

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const [imgRes, nodeRes, appRes] = await Promise.all([
        imageApi.list(),
        nodeApi.list(),
        imageApi.getApplications(),
      ])
      setImages(imgRes.data ?? [])
      setNodes(nodeRes.data ?? [])
      setApplications(appRes.data ?? [])
    } catch {
      setImages([])
      setNodes([])
      setApplications([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  const uploadOne = async (task: UploadTask, file: File) => {
    try {
      await imageApi.upload(
        file,
        (pct) => setUploads((prev) => prev.map((u) => u.id === task.id ? { ...u, progress: pct } : u)),
        application.trim() || undefined,
      )
      setUploads((prev) => prev.map((u) => u.id === task.id ? { ...u, status: 'success', progress: 100 } : u))
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { detail?: string } }; message?: string })?.response?.data?.detail
        || (err as { message?: string })?.message
        || '업로드 실패'
      setUploads((prev) => prev.map((u) => u.id === task.id ? { ...u, status: 'error', error: msg } : u))
    }
  }

  const handleUploadFiles = async (files: File[]) => {
    if (files.length === 0) return
    const newTasks: UploadTask[] = files.map((f) => ({
      id: `${Date.now()}-${f.name}-${Math.random().toString(36).slice(2, 8)}`,
      filename: f.name,
      size: f.size,
      progress: 0,
      status: 'uploading',
    }))
    setUploads((prev) => [...prev, ...newTasks])

    await Promise.all(newTasks.map((task, i) => uploadOne(task, files[i])))
    await fetchData()
  }

  const handleDrop = (e: DragEvent) => {
    e.preventDefault()
    setDragActive(false)
    const files = Array.from(e.dataTransfer.files)
    if (files.length > 0) handleUploadFiles(files)
  }

  const clearCompletedUploads = () => {
    setUploads((prev) => prev.filter((u) => u.status === 'uploading'))
  }

  const handleLoad = async () => {
    if (!loadModal || selectedNodes.length === 0) return
    setLoadingAction(true)
    try {
      const res = await imageApi.load(loadModal.id, selectedNodes)
      const results: { status: string; node: string; message?: string; runtime?: string; output?: string }[] = res.data?.results ?? []
      const failed = results.filter((r) => r.status !== 'success')
      const succeeded = results.filter((r) => r.status === 'success')
      if (failed.length === 0) {
        alert(`✓ ${succeeded.length}개 노드 로드 성공 (${succeeded.map((r) => `${r.node}/${r.runtime}`).join(', ')})`)
      } else {
        const lines = [
          succeeded.length > 0 ? `✓ 성공: ${succeeded.map((r) => `${r.node} (${r.runtime})`).join(', ')}` : null,
          ...failed.map((r) => `✗ ${r.node}\n  ${r.message ?? '실패'}`),
        ].filter(Boolean)
        alert(lines.join('\n\n'))
      }
      setLoadModal(null)
      setSelectedNodes([])
      await fetchData()
    } catch (err: unknown) {
      const detail = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail
      alert(detail || '이미지 로드에 실패했습니다.')
    } finally {
      setLoadingAction(false)
    }
  }

  const toggleNode = (id: number) => {
    setSelectedNodes((prev) =>
      prev.includes(id) ? prev.filter((n) => n !== id) : [...prev, id],
    )
  }

  const toggleReplaceNode = (id: number) => {
    setReplaceNodes((prev) =>
      prev.includes(id) ? prev.filter((n) => n !== id) : [...prev, id],
    )
  }

  const fetchNodeImages = async (nodeId: number) => {
    setNodeImagesLoading(true)
    setNodeImages([])
    setNodeImagesError('')
    try {
      const res = await imageApi.getNodeImages(nodeId)
      setNodeImages(res.data ?? [])
    } catch (err: unknown) {
      const detail = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail
      setNodeImagesError(detail || '노드 이미지 조회에 실패했습니다.')
      setNodeImages([])
    } finally {
      setNodeImagesLoading(false)
    }
  }

  const handleDelete = async () => {
    if (!deleteTarget) return
    try {
      await imageApi.delete(deleteTarget.id)
      setDeleteTarget(null)
      await fetchData()
    } catch {
      alert('이미지 삭제에 실패했습니다.')
    }
  }

  const handleBulkDelete = async () => {
    setBulkDeleteOpen(false)
    let failed = 0
    for (const id of selectedImages) {
      try { await imageApi.delete(Number(id)) } catch { failed++ }
    }
    setSelectedImages([])
    await fetchData()
    if (failed > 0) alert(`${failed}개 삭제 실패`)
  }

  const handleBulkLoad = async () => {
    if (bulkLoadNodes.length === 0) return
    setBulkLoading(true)
    let failed = 0
    for (const id of selectedImages) {
      try { await imageApi.load(Number(id), bulkLoadNodes) } catch { failed++ }
    }
    setBulkLoading(false)
    setBulkLoadOpen(false)
    setBulkLoadNodes([])
    setSelectedImages([])
    await fetchData()
    if (failed > 0) alert(`${failed}개 로드 실패`)
  }

  const toggleBulkLoadNode = (id: number) => {
    setBulkLoadNodes((prev) => prev.includes(id) ? prev.filter((n) => n !== id) : [...prev, id])
  }

  const handleDeleteNodeImage = async () => {
    if (!deleteNodeImageTarget || !selectedNodeId) return
    const imageRef = deleteNodeImageTarget.tag && deleteNodeImageTarget.tag !== '<none>'
      ? `${deleteNodeImageTarget.repository}:${deleteNodeImageTarget.tag}`
      : (deleteNodeImageTarget.id || deleteNodeImageTarget.repository)
    try {
      await imageApi.deleteNodeImage(selectedNodeId, imageRef)
      setDeleteNodeImageTarget(null)
      fetchNodeImages(selectedNodeId)
    } catch (err: unknown) {
      const detail = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail
      alert(detail || '노드 이미지 삭제에 실패했습니다.')
    }
  }

  const handleNodeSelect = (val: string) => {
    const id = Number(val)
    if (id) {
      setSelectedNodeId(id)
      fetchNodeImages(id)
    } else {
      setSelectedNodeId(null)
      setNodeImages([])
    }
  }

  const openReplaceModal = (img: NodeImage) => {
    setReplaceModal(img)
    setReplaceNodes(selectedNodeId ? [selectedNodeId] : [])
    setReplaceFile(null)
    setReplaceProgress(0)
  }

  const handleReplace = async () => {
    if (!replaceModal || !replaceFile || replaceNodes.length === 0) return
    setReplacing(true)
    setReplaceProgress(0)
    try {
      const uploadRes = await imageApi.upload(replaceFile, setReplaceProgress)
      const imageId = uploadRes.data.id
      const targetImage = replaceModal.repository + (replaceModal.tag && replaceModal.tag !== '<none>' ? ':' + replaceModal.tag : '')
      const replaceRes = await imageApi.replace({
        image_id: imageId,
        node_ids: replaceNodes,
        target_image: targetImage,
        restart_deployments: true,
      })

      const loadResults = replaceRes.data.load_results ?? []
      const restartResults = replaceRes.data.restart_results ?? []
      const loadOk = loadResults.filter((r: { status: string }) => r.status === 'success')
      const loadFail = loadResults.filter((r: { status: string }) => r.status === 'failed')
      const restartOk = restartResults.filter((r: { status: string }) => r.status === 'restarted')
      const restartFail = restartResults.filter((r: { status: string }) => r.status === 'failed')

      const lines: string[] = []
      if (loadFail.length === 0) {
        lines.push(`✓ 이미지 로드: ${loadOk.length}개 노드 성공`)
      } else {
        const failHosts = loadFail.map((r: { node?: string }) => r.node ?? '?').join(', ')
        lines.push(`✗ 이미지 로드: ${loadOk.length}개 성공 / ${loadFail.length}개 실패 (${failHosts})`)
      }

      if (restartResults.length === 0) {
        lines.push(`⚠ 재기동된 Deployment 없음 — 이 이미지(${targetImage})를 사용하는 Deployment를 찾지 못했습니다. 파드가 재기동되지 않아 변경이 적용되지 않았을 수 있습니다.`)
      } else if (restartFail.length === 0) {
        lines.push(`✓ 재기동: ${restartOk.length}개 Deployment`)
      } else {
        lines.push(`✗ 재기동: ${restartOk.length}개 성공 / ${restartFail.length}개 실패`)
      }

      alert(lines.join('\n'))
      setReplaceModal(null)
      if (selectedNodeId) fetchNodeImages(selectedNodeId)
      await fetchData()
    } catch {
      alert('이미지 교체에 실패했습니다.')
    } finally {
      setReplacing(false)
      setReplaceProgress(0)
    }
  }

  const filteredImages = appFilter === 'all'
    ? images
    : appFilter === '__none__'
      ? images.filter((i) => !i.application)
      : images.filter((i) => i.application === appFilter)

  const uploadColumns: Column<ImageRecord>[] = [
    {
      key: 'application',
      header: '어플리케이션',
      sortable: true,
      render: (r) => r.application
        ? <span className="px-2 py-0.5 text-xs bg-indigo-500/15 text-indigo-700 dark:text-indigo-300 border border-indigo-500/30 rounded-full">{r.application}</span>
        : <span className="text-slate-500">-</span>,
    },
    { key: 'filename', header: '파일명', sortable: true },
    { key: 'image_name', header: '이미지명', sortable: true },
    {
      key: 'target_nodes',
      header: '배포 노드',
      render: (r) => {
        const raw = (r.target_nodes || '').trim()
        if (!raw) return <span className="text-slate-500">-</span>
        const parts = raw.split(',').map((s) => s.trim()).filter(Boolean)
        // Legacy data may store numeric IDs; resolve to names if matched.
        const labels = parts.map((p) => {
          if (/^\d+$/.test(p)) {
            const found = nodes.find((n) => String(n.id) === p)
            return found?.name ?? p
          }
          return p
        })
        return (
          <span className="text-xs text-slate-700 dark:text-slate-300" title={labels.join(', ')}>
            {labels.length}개 · {labels.slice(0, 2).join(', ')}{labels.length > 2 ? ' …' : ''}
          </span>
        )
      },
    },
    { key: 'status', header: '상태', render: (r) => <StatusBadge status={r.status} /> },
    { key: 'created_at', header: '업로드 일시', sortable: true },
    {
      key: 'actions',
      header: '액션',
      render: (r) => (
        <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
          <button
            onClick={() => { setLoadModal(r); setSelectedNodes([]) }}
            className="flex items-center gap-1 px-2 py-1 text-xs bg-blue-600 hover:bg-blue-700 text-white rounded transition-colors"
          >
            <Play size={12} /> 로드
          </button>
          <button
            onClick={() => setDeleteTarget(r)}
            title="삭제"
            className="p-1.5 text-slate-600 dark:text-slate-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-slate-200 dark:hover:bg-slate-700 rounded transition-colors"
          >
            <Trash2 size={14} />
          </button>
        </div>
      ),
    },
  ]

  const nodeImageColumns: Column<NodeImage>[] = [
    { key: 'repository', header: '이미지', sortable: true },
    { key: 'tag', header: '태그', sortable: true },
    { key: 'id', header: 'ID', render: (r) => <span className="font-mono text-xs">{String(r.id).slice(0, 12)}</span> },
    { key: 'size', header: '크기', sortable: true },
    {
      key: 'actions',
      header: '액션',
      render: (r) => (
        <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
          <button
            onClick={() => openReplaceModal(r)}
            className="flex items-center gap-1 px-2 py-1 text-xs bg-amber-600 hover:bg-amber-700 text-white rounded transition-colors"
          >
            <RefreshCw size={12} /> 교체
          </button>
          <button
            onClick={() => setDeleteNodeImageTarget(r)}
            title="노드에서 삭제"
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
      <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">이미지 관리</h1>

      <>
          <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-4">
            <label className="block text-sm text-slate-600 dark:text-slate-400 mb-2">
              어플리케이션 <span className="text-slate-600">(tar 파일을 어플리케이션 단위로 묶기 위한 식별자)</span>
            </label>
            <input
              type="text"
              list="image-application-list"
              value={application}
              onChange={(e) => setApplication(e.target.value)}
              placeholder="예: payment-api, user-service"
              className="w-full px-3 py-2 text-sm bg-slate-100 dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded-lg text-slate-800 dark:text-slate-200 placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:border-blue-500 transition-colors"
            />
            <datalist id="image-application-list">
              {applications.map((a) => <option key={a} value={a} />)}
            </datalist>
          </div>

          <div
            className={`border-2 border-dashed rounded-xl p-8 text-center transition-colors cursor-pointer ${
              dragActive ? 'border-blue-500 bg-blue-500/10' : 'border-slate-300 dark:border-slate-600 hover:border-slate-400 dark:hover:border-slate-500 bg-white dark:bg-slate-800'
            }`}
            onDragOver={(e) => { e.preventDefault(); setDragActive(true) }}
            onDragLeave={() => setDragActive(false)}
            onDrop={handleDrop}
            onClick={() => fileRef.current?.click()}
          >
            <input
              ref={fileRef}
              type="file"
              accept=".tar,.tar.gz,.tgz"
              multiple
              className="hidden"
              onChange={(e) => {
                const files = e.target.files ? Array.from(e.target.files) : []
                if (files.length > 0) handleUploadFiles(files)
                if (e.target) e.target.value = ''
              }}
            />
            <Upload size={40} className="mx-auto mb-3 text-slate-600 dark:text-slate-400" />
            <p className="text-slate-700 dark:text-slate-300 font-medium">이미지 파일을 드래그하거나 클릭하여 선택하세요</p>
            <p className="text-sm text-slate-500 mt-1">.tar, .tar.gz, .tgz 형식 지원 · 여러 파일 동시 업로드 가능</p>
          </div>

          {uploads.length > 0 && (
            <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300">
                  업로드 ({uploads.filter((u) => u.status === 'uploading').length}/{uploads.length})
                </h3>
                {uploads.some((u) => u.status !== 'uploading') && (
                  <button
                    onClick={clearCompletedUploads}
                    className="text-xs text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 transition-colors"
                  >
                    완료 항목 지우기
                  </button>
                )}
              </div>
              <div className="space-y-2.5 max-h-72 overflow-auto pr-1">
                {uploads.map((u) => (
                  <div key={u.id} className="space-y-1">
                    <div className="flex items-center justify-between gap-3 text-xs">
                      <span className="truncate text-slate-700 dark:text-slate-300 font-mono">{u.filename}</span>
                      <span className={`flex-shrink-0 ${
                        u.status === 'success' ? 'text-emerald-600 dark:text-emerald-400'
                        : u.status === 'error' ? 'text-red-600 dark:text-red-400'
                        : 'text-blue-600 dark:text-blue-400'
                      }`}>
                        {u.status === 'success' ? '완료' : u.status === 'error' ? '실패' : `${u.progress}%`}
                      </span>
                    </div>
                    <div className="w-full bg-slate-200 dark:bg-slate-700 rounded-full h-1.5 overflow-hidden">
                      <div
                        className={`h-1.5 rounded-full transition-all ${
                          u.status === 'success' ? 'bg-emerald-500'
                          : u.status === 'error' ? 'bg-red-500'
                          : 'bg-blue-500'
                        }`}
                        style={{ width: `${u.status === 'error' ? 100 : u.progress}%` }}
                      />
                    </div>
                    {u.status === 'error' && u.error && (
                      <p className="text-xs text-red-600 dark:text-red-400 font-mono">{u.error}</p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          <BulkActionBar count={selectedImages.length} onClear={() => setSelectedImages([])}>
            <button
              onClick={() => { setBulkLoadNodes([]); setBulkLoadOpen(true) }}
              className="flex items-center gap-1 px-3 py-1.5 text-xs bg-blue-600 hover:bg-blue-700 text-white rounded transition-colors"
            >
              <Play size={12} /> 일괄 로드
            </button>
            <button
              onClick={() => setBulkDeleteOpen(true)}
              className="flex items-center gap-1 px-3 py-1.5 text-xs bg-red-600 hover:bg-red-700 text-white rounded transition-colors"
            >
              <Trash2 size={12} /> 일괄 삭제
            </button>
          </BulkActionBar>

          <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between gap-3 flex-wrap">
              <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-200 flex items-center gap-2">
                <HardDrive size={18} /> 이미지 목록
              </h2>
              <FilterSelect
                label="어플리케이션"
                value={appFilter}
                onChange={setAppFilter}
                options={[
                  { value: 'all', label: '전체' },
                  { value: '__none__', label: '미지정' },
                  ...applications.map((a) => ({ value: a, label: a })),
                ]}
              />
            </div>
            {loading ? (
              <LoadingSpinner text="이미지를 불러오는 중..." />
            ) : (
              <DataTable
                columns={uploadColumns}
                data={filteredImages}
                keyField="id"
                selectable
                selectedKeys={selectedImages}
                onSelectionChange={setSelectedImages}
              />
            )}
          </div>

          <div className="border-t border-slate-200 dark:border-slate-700 pt-6">
            <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-200 mb-3">노드 이미지 조회</h2>
          <div className="flex items-start gap-3 bg-blue-500/10 border border-blue-500/30 rounded-xl p-3">
            <Info size={16} className="text-blue-600 dark:text-blue-400 mt-0.5 flex-shrink-0" />
            <p className="text-xs text-blue-800 dark:text-blue-200">
              마스터 노드를 포함한 모든 노드는 <strong>SSH 노드 관리</strong>에서 먼저 등록되어 있어야 조회 가능합니다.
              컨테이너 런타임 명령(crictl, ctr)은 root 권한이 필요할 수 있습니다.
            </p>
          </div>

          <div className="flex items-center gap-4 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-4">
            <FilterSelect
              label="노드 선택"
              value={selectedNodeId ? String(selectedNodeId) : ''}
              onChange={handleNodeSelect}
              options={[
                { value: '', label: '선택...' },
                ...nodes.map((n) => ({ value: String(n.id), label: n.name })),
              ]}
            />
            {selectedNodeId && (
              <button
                onClick={() => fetchNodeImages(selectedNodeId)}
                className="flex items-center gap-2 px-3 py-2 text-sm bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-300 rounded-lg transition-colors"
              >
                <RefreshCw size={14} /> 새로고침
              </button>
            )}
          </div>

          {nodeImagesError && (
            <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-3 text-xs text-red-700 dark:text-red-300 font-mono break-all">
              {nodeImagesError}
            </div>
          )}

          <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-700">
              <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-200 flex items-center gap-2">
                <Server size={18} /> 노드 이미지 목록
              </h2>
            </div>
            {!selectedNodeId ? (
              <p className="text-sm text-slate-500 text-center py-8">노드를 선택하세요.</p>
            ) : nodeImagesLoading ? (
              <LoadingSpinner text="노드 이미지를 조회하는 중..." />
            ) : (
              <DataTable columns={nodeImageColumns} data={nodeImages} keyField="id" />
            )}
          </div>
          </div>
      </>

      {/* Load Modal */}
      <Modal
        open={!!loadModal}
        onClose={() => setLoadModal(null)}
        title="이미지 로드 - 대상 노드 선택"
        footer={
          <>
            <button
              onClick={() => setLoadModal(null)}
              className="px-4 py-2 text-sm bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-300 rounded-lg transition-colors"
            >
              취소
            </button>
            <button
              onClick={handleLoad}
              disabled={selectedNodes.length === 0 || loadingAction}
              className="px-4 py-2 text-sm bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-lg transition-colors"
            >
              {loadingAction ? '로드 중...' : '로드 실행'}
            </button>
          </>
        }
      >
        <p className="text-sm text-slate-600 dark:text-slate-400 mb-4">이미지를 로드할 노드를 선택하세요.</p>
        <div className="space-y-2 max-h-60 overflow-auto">
          {nodes.map((n) => (
            <label key={n.id} className="flex items-center gap-3 p-3 bg-slate-100 dark:bg-slate-900 rounded-lg cursor-pointer hover:bg-slate-200/50 dark:hover:bg-slate-700/50 transition-colors">
              <input
                type="checkbox"
                checked={selectedNodes.includes(n.id)}
                onChange={() => toggleNode(n.id)}
                className="w-4 h-4 rounded border-slate-300 dark:border-slate-600 text-blue-500 focus:ring-blue-500 focus:ring-offset-0 bg-white dark:bg-slate-800"
              />
              <span className="text-sm text-slate-800 dark:text-slate-200">{n.name}</span>
            </label>
          ))}
          {nodes.length === 0 && (
            <p className="text-sm text-slate-500 text-center py-4">등록된 노드가 없습니다.</p>
          )}
        </div>
      </Modal>

      {/* Replace Modal */}
      <Modal
        open={!!replaceModal}
        onClose={() => setReplaceModal(null)}
        title="이미지 교체"
        width="max-w-xl"
        footer={
          <>
            <button
              onClick={() => setReplaceModal(null)}
              className="px-4 py-2 text-sm bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-300 rounded-lg transition-colors"
            >
              취소
            </button>
            <button
              onClick={handleReplace}
              disabled={!replaceFile || replaceNodes.length === 0 || replacing}
              className="px-4 py-2 text-sm bg-amber-600 hover:bg-amber-700 disabled:opacity-50 text-white rounded-lg transition-colors"
            >
              {replacing ? '교체 중...' : '교체 및 재기동'}
            </button>
          </>
        }
      >
        {replaceModal && (
          <div className="space-y-4">
            <div className="bg-slate-100 dark:bg-slate-900 rounded-lg p-3">
              <p className="text-xs text-slate-500 mb-1">교체 대상 이미지</p>
              <p className="text-sm text-slate-800 dark:text-slate-200 font-mono">
                {replaceModal.repository}{replaceModal.tag && replaceModal.tag !== '<none>' ? ':' + replaceModal.tag : ''}
              </p>
            </div>

            <div>
              <label className="block text-sm text-slate-600 dark:text-slate-400 mb-2">새 이미지 파일 (tar)</label>
              <input
                ref={replaceFileRef}
                type="file"
                accept=".tar,.tar.gz,.tgz"
                className="hidden"
                onChange={(e) => { if (e.target.files?.[0]) setReplaceFile(e.target.files[0]) }}
              />
              <button
                onClick={() => replaceFileRef.current?.click()}
                className="flex items-center gap-2 px-4 py-2 text-sm bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-300 rounded-lg transition-colors w-full justify-center"
              >
                <Upload size={14} />
                {replaceFile ? replaceFile.name : '파일 선택...'}
              </button>
            </div>

            {replacing && replaceProgress > 0 && (
              <div>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs text-slate-600 dark:text-slate-400">업로드 중...</span>
                  <span className="text-xs text-blue-600 dark:text-blue-400">{replaceProgress}%</span>
                </div>
                <div className="w-full bg-slate-200 dark:bg-slate-700 rounded-full h-1.5">
                  <div className="bg-blue-500 h-1.5 rounded-full transition-all" style={{ width: `${replaceProgress}%` }} />
                </div>
              </div>
            )}

            <div>
              <label className="block text-sm text-slate-600 dark:text-slate-400 mb-2">대상 노드</label>
              <div className="space-y-2 max-h-40 overflow-auto">
                {nodes.map((n) => (
                  <label key={n.id} className="flex items-center gap-3 p-2.5 bg-slate-100 dark:bg-slate-900 rounded-lg cursor-pointer hover:bg-slate-200/50 dark:hover:bg-slate-700/50 transition-colors">
                    <input
                      type="checkbox"
                      checked={replaceNodes.includes(n.id)}
                      onChange={() => toggleReplaceNode(n.id)}
                      className="w-4 h-4 rounded border-slate-300 dark:border-slate-600 text-amber-500 focus:ring-amber-500 focus:ring-offset-0 bg-white dark:bg-slate-800"
                    />
                    <span className="text-sm text-slate-800 dark:text-slate-200">{n.name}</span>
                  </label>
                ))}
              </div>
            </div>

            <p className="text-xs text-slate-500">
              이미지 로드 후 해당 이미지를 사용하는 Deployment가 자동으로 재기동됩니다.
            </p>
          </div>
        )}
      </Modal>

      <ConfirmDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        title="이미지 삭제"
        message={`"${deleteTarget?.filename}" 이미지를 삭제하시겠습니까? 파일과 이력이 모두 제거됩니다.`}
        confirmText="삭제"
      />

      <ConfirmDialog
        open={!!deleteNodeImageTarget}
        onClose={() => setDeleteNodeImageTarget(null)}
        onConfirm={handleDeleteNodeImage}
        title="노드 이미지 삭제"
        message={`"${deleteNodeImageTarget?.repository}${deleteNodeImageTarget?.tag && deleteNodeImageTarget.tag !== '<none>' ? ':' + deleteNodeImageTarget.tag : ''}" 이미지를 이 노드에서 제거하시겠습니까?`}
        confirmText="삭제"
      />

      <ConfirmDialog
        open={bulkDeleteOpen}
        onClose={() => setBulkDeleteOpen(false)}
        onConfirm={handleBulkDelete}
        title="이미지 일괄 삭제"
        message={`선택한 ${selectedImages.length}개 이미지를 삭제하시겠습니까? 파일과 이력이 모두 제거됩니다.`}
        confirmText="삭제"
      />

      <Modal
        open={bulkLoadOpen}
        onClose={() => { setBulkLoadOpen(false); setBulkLoadNodes([]) }}
        title={`이미지 일괄 로드 (${selectedImages.length}개)`}
        footer={
          <>
            <button
              onClick={() => { setBulkLoadOpen(false); setBulkLoadNodes([]) }}
              className="px-4 py-2 text-sm bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-300 rounded-lg transition-colors"
            >
              취소
            </button>
            <button
              onClick={handleBulkLoad}
              disabled={bulkLoadNodes.length === 0 || bulkLoading}
              className="px-4 py-2 text-sm bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-lg transition-colors"
            >
              {bulkLoading ? '로드 중...' : '로드 실행'}
            </button>
          </>
        }
      >
        <p className="text-sm text-slate-600 dark:text-slate-400 mb-3">선택한 이미지를 로드할 노드를 선택하세요.</p>
        <div className="space-y-2 max-h-60 overflow-auto">
          {nodes.map((n) => (
            <label key={n.id} className="flex items-center gap-3 p-3 bg-slate-100 dark:bg-slate-900 rounded-lg cursor-pointer hover:bg-slate-200/50 dark:hover:bg-slate-700/50 transition-colors">
              <input
                type="checkbox"
                checked={bulkLoadNodes.includes(n.id)}
                onChange={() => toggleBulkLoadNode(n.id)}
                className="w-4 h-4 rounded border-slate-400 dark:border-slate-600 text-blue-500"
              />
              <span className="text-sm text-slate-800 dark:text-slate-200">{n.name}</span>
            </label>
          ))}
        </div>
      </Modal>
    </div>
  )
}
