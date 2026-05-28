import { useState, useEffect, useRef, useCallback, type DragEvent } from 'react'
import { Upload, HardDrive, Play, RefreshCw, Server } from 'lucide-react'
import { imageApi, nodeApi } from '../api/client'
import DataTable, { type Column } from '../components/DataTable'
import StatusBadge from '../components/StatusBadge'
import LoadingSpinner from '../components/LoadingSpinner'
import Modal from '../components/Modal'
import { FilterSelect } from '../components/FilterBar'

interface ImageRecord {
  id: number
  filename: string
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

type TabKey = 'upload' | 'node-images'

export default function ImagesPage() {
  const [tab, setTab] = useState<TabKey>('upload')
  const [images, setImages] = useState<ImageRecord[]>([])
  const [nodes, setNodes] = useState<NodeRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [progress, setProgress] = useState(0)
  const [dragActive, setDragActive] = useState(false)
  const [loadModal, setLoadModal] = useState<ImageRecord | null>(null)
  const [selectedNodes, setSelectedNodes] = useState<number[]>([])
  const [loadingAction, setLoadingAction] = useState(false)
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
      const [imgRes, nodeRes] = await Promise.all([imageApi.list(), nodeApi.list()])
      setImages(imgRes.data ?? [])
      setNodes(nodeRes.data ?? [])
    } catch {
      setImages([])
      setNodes([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  const handleUpload = async (file: File) => {
    setUploading(true)
    setProgress(0)
    try {
      await imageApi.upload(file, setProgress)
      await fetchData()
    } catch {
      alert('업로드에 실패했습니다.')
    } finally {
      setUploading(false)
      setProgress(0)
    }
  }

  const handleDrop = (e: DragEvent) => {
    e.preventDefault()
    setDragActive(false)
    const file = e.dataTransfer.files[0]
    if (file) handleUpload(file)
  }

  const handleLoad = async () => {
    if (!loadModal || selectedNodes.length === 0) return
    setLoadingAction(true)
    try {
      await imageApi.load(loadModal.id, selectedNodes)
      setLoadModal(null)
      setSelectedNodes([])
      await fetchData()
    } catch {
      alert('이미지 로드에 실패했습니다.')
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
    try {
      const res = await imageApi.getNodeImages(nodeId)
      setNodeImages(res.data ?? [])
    } catch {
      alert('노드 이미지 조회에 실패했습니다.')
      setNodeImages([])
    } finally {
      setNodeImagesLoading(false)
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
      await imageApi.replace({
        image_id: imageId,
        node_ids: replaceNodes,
        target_image: targetImage,
        restart_deployments: true,
      })
      alert('이미지 교체 및 재기동이 완료되었습니다.')
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

  const uploadColumns: Column<ImageRecord>[] = [
    { key: 'filename', header: '파일명', sortable: true },
    { key: 'image_name', header: '이미지명', sortable: true },
    { key: 'target_nodes', header: '대상 노드', render: (r) => <span>{r.target_nodes || '-'}</span> },
    { key: 'status', header: '상태', render: (r) => <StatusBadge status={r.status} /> },
    { key: 'created_at', header: '업로드 일시', sortable: true },
    {
      key: 'actions',
      header: '액션',
      render: (r) => (
        <button
          onClick={(e) => { e.stopPropagation(); setLoadModal(r); setSelectedNodes([]) }}
          className="flex items-center gap-1 px-2 py-1 text-xs bg-blue-600 hover:bg-blue-700 text-white rounded transition-colors"
        >
          <Play size={12} /> 로드
        </button>
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
        <button
          onClick={(e) => { e.stopPropagation(); openReplaceModal(r) }}
          className="flex items-center gap-1 px-2 py-1 text-xs bg-amber-600 hover:bg-amber-700 text-white rounded transition-colors"
        >
          <RefreshCw size={12} /> 교체
        </button>
      ),
    },
  ]

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-slate-100">이미지 관리</h1>

      <div className="flex items-center gap-1 bg-slate-800 border border-slate-700 rounded-lg p-1">
        <button
          onClick={() => setTab('upload')}
          className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${
            tab === 'upload' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-slate-200 hover:bg-slate-700'
          }`}
        >
          이미지 업로드
        </button>
        <button
          onClick={() => setTab('node-images')}
          className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${
            tab === 'node-images' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-slate-200 hover:bg-slate-700'
          }`}
        >
          노드 이미지 조회
        </button>
      </div>

      {tab === 'upload' && (
        <>
          <div
            className={`border-2 border-dashed rounded-xl p-8 text-center transition-colors cursor-pointer ${
              dragActive ? 'border-blue-500 bg-blue-500/10' : 'border-slate-600 hover:border-slate-500 bg-slate-800'
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
              className="hidden"
              onChange={(e) => { if (e.target.files?.[0]) handleUpload(e.target.files[0]) }}
            />
            <Upload size={40} className="mx-auto mb-3 text-slate-400" />
            <p className="text-slate-300 font-medium">이미지 파일을 드래그하거나 클릭하여 선택하세요</p>
            <p className="text-sm text-slate-500 mt-1">.tar, .tar.gz, .tgz 형식 지원</p>
          </div>

          {uploading && (
            <div className="bg-slate-800 border border-slate-700 rounded-xl p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm text-slate-300">업로드 중...</span>
                <span className="text-sm text-blue-400">{progress}%</span>
              </div>
              <div className="w-full bg-slate-700 rounded-full h-2">
                <div className="bg-blue-500 h-2 rounded-full transition-all" style={{ width: `${progress}%` }} />
              </div>
            </div>
          )}

          <div className="bg-slate-800 border border-slate-700 rounded-xl overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-700">
              <h2 className="text-lg font-semibold text-slate-200 flex items-center gap-2">
                <HardDrive size={18} /> 이미지 목록
              </h2>
            </div>
            {loading ? (
              <LoadingSpinner text="이미지를 불러오는 중..." />
            ) : (
              <DataTable columns={uploadColumns} data={images} keyField="id" />
            )}
          </div>
        </>
      )}

      {tab === 'node-images' && (
        <>
          <div className="flex items-center gap-4 bg-slate-800 border border-slate-700 rounded-xl p-4">
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
                className="flex items-center gap-2 px-3 py-2 text-sm bg-slate-700 hover:bg-slate-600 text-slate-300 rounded-lg transition-colors"
              >
                <RefreshCw size={14} /> 새로고침
              </button>
            )}
          </div>

          <div className="bg-slate-800 border border-slate-700 rounded-xl overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-700">
              <h2 className="text-lg font-semibold text-slate-200 flex items-center gap-2">
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
        </>
      )}

      {/* Load Modal */}
      <Modal
        open={!!loadModal}
        onClose={() => setLoadModal(null)}
        title="이미지 로드 - 대상 노드 선택"
        footer={
          <>
            <button
              onClick={() => setLoadModal(null)}
              className="px-4 py-2 text-sm bg-slate-700 hover:bg-slate-600 text-slate-300 rounded-lg transition-colors"
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
        <p className="text-sm text-slate-400 mb-4">이미지를 로드할 노드를 선택하세요.</p>
        <div className="space-y-2 max-h-60 overflow-auto">
          {nodes.map((n) => (
            <label key={n.id} className="flex items-center gap-3 p-3 bg-slate-900 rounded-lg cursor-pointer hover:bg-slate-700/50 transition-colors">
              <input
                type="checkbox"
                checked={selectedNodes.includes(n.id)}
                onChange={() => toggleNode(n.id)}
                className="w-4 h-4 rounded border-slate-600 text-blue-500 focus:ring-blue-500 focus:ring-offset-0 bg-slate-800"
              />
              <span className="text-sm text-slate-200">{n.name}</span>
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
              className="px-4 py-2 text-sm bg-slate-700 hover:bg-slate-600 text-slate-300 rounded-lg transition-colors"
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
            <div className="bg-slate-900 rounded-lg p-3">
              <p className="text-xs text-slate-500 mb-1">교체 대상 이미지</p>
              <p className="text-sm text-slate-200 font-mono">
                {replaceModal.repository}{replaceModal.tag && replaceModal.tag !== '<none>' ? ':' + replaceModal.tag : ''}
              </p>
            </div>

            <div>
              <label className="block text-sm text-slate-400 mb-2">새 이미지 파일 (tar)</label>
              <input
                ref={replaceFileRef}
                type="file"
                accept=".tar,.tar.gz,.tgz"
                className="hidden"
                onChange={(e) => { if (e.target.files?.[0]) setReplaceFile(e.target.files[0]) }}
              />
              <button
                onClick={() => replaceFileRef.current?.click()}
                className="flex items-center gap-2 px-4 py-2 text-sm bg-slate-700 hover:bg-slate-600 text-slate-300 rounded-lg transition-colors w-full justify-center"
              >
                <Upload size={14} />
                {replaceFile ? replaceFile.name : '파일 선택...'}
              </button>
            </div>

            {replacing && replaceProgress > 0 && (
              <div>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs text-slate-400">업로드 중...</span>
                  <span className="text-xs text-blue-400">{replaceProgress}%</span>
                </div>
                <div className="w-full bg-slate-700 rounded-full h-1.5">
                  <div className="bg-blue-500 h-1.5 rounded-full transition-all" style={{ width: `${replaceProgress}%` }} />
                </div>
              </div>
            )}

            <div>
              <label className="block text-sm text-slate-400 mb-2">대상 노드</label>
              <div className="space-y-2 max-h-40 overflow-auto">
                {nodes.map((n) => (
                  <label key={n.id} className="flex items-center gap-3 p-2.5 bg-slate-900 rounded-lg cursor-pointer hover:bg-slate-700/50 transition-colors">
                    <input
                      type="checkbox"
                      checked={replaceNodes.includes(n.id)}
                      onChange={() => toggleReplaceNode(n.id)}
                      className="w-4 h-4 rounded border-slate-600 text-amber-500 focus:ring-amber-500 focus:ring-offset-0 bg-slate-800"
                    />
                    <span className="text-sm text-slate-200">{n.name}</span>
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
    </div>
  )
}
