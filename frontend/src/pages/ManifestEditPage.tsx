import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { Save, Play, CheckCircle, ArrowLeft } from 'lucide-react'
import { manifestApi } from '../api/client'
import YamlEditor from '../components/YamlEditor'
import LoadingSpinner from '../components/LoadingSpinner'
import { FilterSelect } from '../components/FilterBar'

const TEMPLATES: Record<string, string> = {
  deployment: `apiVersion: apps/v1
kind: Deployment
metadata:
  name: my-app
  namespace: default
spec:
  replicas: 1
  selector:
    matchLabels:
      app: my-app
  template:
    metadata:
      labels:
        app: my-app
    spec:
      containers:
        - name: my-app
          image: my-app:latest
          ports:
            - containerPort: 80`,
  service: `apiVersion: v1
kind: Service
metadata:
  name: my-service
  namespace: default
spec:
  type: ClusterIP
  selector:
    app: my-app
  ports:
    - port: 80
      targetPort: 80`,
  configmap: `apiVersion: v1
kind: ConfigMap
metadata:
  name: my-config
  namespace: default
data:
  key: value`,
  secret: `apiVersion: v1
kind: Secret
metadata:
  name: my-secret
  namespace: default
type: Opaque
stringData:
  key: value`,
  ingress: `apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: my-ingress
  namespace: default
spec:
  rules:
    - host: example.com
      http:
        paths:
          - path: /
            pathType: Prefix
            backend:
              service:
                name: my-service
                port:
                  number: 80`,
}

export default function ManifestEditPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const isNew = !id

  const [name, setName] = useState('')
  const [kind, setKind] = useState('Deployment')
  const [namespace, setNamespace] = useState('default')
  const [content, setContent] = useState(TEMPLATES.deployment)
  const [loading, setLoading] = useState(!isNew)
  const [saving, setSaving] = useState(false)
  const [validationResult, setValidationResult] = useState<{ valid: boolean; message: string } | null>(null)
  const [versions, setVersions] = useState<{ version: number; updatedAt: string }[]>([])
  const [template, setTemplate] = useState('deployment')

  useEffect(() => {
    if (id) {
      Promise.all([manifestApi.get(id), manifestApi.versions(id)])
        .then(([res, vRes]) => {
          const m = res.data
          setName(m.name)
          setKind(m.kind)
          setNamespace(m.namespace)
          setContent(m.content_yaml)
          setVersions(vRes.data ?? [])
        })
        .catch(() => alert('매니페스트를 불러오는 데 실패했습니다.'))
        .finally(() => setLoading(false))
    }
  }, [id])

  const handleTemplateChange = (val: string) => {
    setTemplate(val)
    if (TEMPLATES[val]) {
      setContent(TEMPLATES[val])
      setKind(val.charAt(0).toUpperCase() + val.slice(1))
    }
  }

  const handleValidate = async () => {
    try {
      const res = await manifestApi.validate(content)
      setValidationResult(res.data)
    } catch {
      setValidationResult({ valid: false, message: 'YAML 검증 요청에 실패했습니다.' })
    }
  }

  const handleSave = async () => {
    if (!name.trim()) {
      alert('매니페스트 이름을 입력해주세요.')
      return
    }
    setSaving(true)
    try {
      if (isNew) {
        await manifestApi.create({ name, content_yaml: content, kind, namespace })
      } else {
        await manifestApi.update(id!, { name, content_yaml: content, kind, namespace })
      }
      navigate('/manifests')
    } catch {
      alert('매니페스트 저장에 실패했습니다.')
    } finally {
      setSaving(false)
    }
  }

  const handleApply = async () => {
    if (isNew) {
      alert('먼저 매니페스트를 저장해주세요.')
      return
    }
    try {
      await manifestApi.apply(id!)
      alert('클러스터에 적용되었습니다.')
    } catch {
      alert('적용에 실패했습니다.')
    }
  }

  if (loading) return <LoadingSpinner text="매니페스트를 불러오는 중..." />

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <button
          onClick={() => navigate('/manifests')}
          className="p-2 text-slate-400 hover:text-slate-200 hover:bg-slate-700 rounded-lg transition-colors"
        >
          <ArrowLeft size={20} />
        </button>
        <h1 className="text-2xl font-bold text-slate-100">
          {isNew ? '새 매니페스트' : '매니페스트 편집'}
        </h1>
      </div>

      <div className="flex flex-wrap items-end gap-4 bg-slate-800 border border-slate-700 rounded-xl p-4">
        <div className="flex-1 min-w-[200px]">
          <label className="block text-sm text-slate-400 mb-1">이름</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="매니페스트 이름"
            className="w-full px-3 py-2 text-sm bg-slate-900 border border-slate-600 rounded-lg text-slate-200 placeholder-slate-500 focus:outline-none focus:border-blue-500 transition-colors"
          />
        </div>
        <div>
          <label className="block text-sm text-slate-400 mb-1">종류</label>
          <input
            type="text"
            value={kind}
            onChange={(e) => setKind(e.target.value)}
            className="w-36 px-3 py-2 text-sm bg-slate-900 border border-slate-600 rounded-lg text-slate-200 focus:outline-none focus:border-blue-500 transition-colors"
          />
        </div>
        <div>
          <label className="block text-sm text-slate-400 mb-1">네임스페이스</label>
          <input
            type="text"
            value={namespace}
            onChange={(e) => setNamespace(e.target.value)}
            className="w-36 px-3 py-2 text-sm bg-slate-900 border border-slate-600 rounded-lg text-slate-200 focus:outline-none focus:border-blue-500 transition-colors"
          />
        </div>
        {isNew && (
          <FilterSelect
            label="템플릿"
            value={template}
            onChange={handleTemplateChange}
            options={[
              { value: 'deployment', label: 'Deployment' },
              { value: 'service', label: 'Service' },
              { value: 'configmap', label: 'ConfigMap' },
              { value: 'secret', label: 'Secret' },
              { value: 'ingress', label: 'Ingress' },
            ]}
          />
        )}
        {versions.length > 0 && (
          <FilterSelect
            label="버전"
            value=""
            onChange={() => {}}
            options={[
              { value: '', label: `현재 (v${versions.length})` },
              ...versions.map((v) => ({
                value: String(v.version),
                label: `v${v.version} - ${v.updatedAt}`,
              })),
            ]}
          />
        )}
      </div>

      <div className="flex gap-6">
        <div className="flex-[3]">
          <YamlEditor value={content} onChange={setContent} />
        </div>
        <div className="flex-[2] space-y-4">
          <div className="bg-slate-800 border border-slate-700 rounded-xl p-4">
            <h3 className="text-sm font-semibold text-slate-200 mb-3">액션</h3>
            <div className="space-y-2">
              <button
                onClick={handleValidate}
                className="flex items-center gap-2 w-full px-4 py-2 text-sm bg-slate-700 hover:bg-slate-600 text-slate-200 rounded-lg transition-colors"
              >
                <CheckCircle size={16} /> YAML 검증
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="flex items-center gap-2 w-full px-4 py-2 text-sm bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-lg transition-colors"
              >
                <Save size={16} /> {saving ? '저장 중...' : '저장'}
              </button>
              {!isNew && (
                <button
                  onClick={handleApply}
                  className="flex items-center gap-2 w-full px-4 py-2 text-sm bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg transition-colors"
                >
                  <Play size={16} /> 클러스터에 적용
                </button>
              )}
            </div>
          </div>

          {validationResult && (
            <div
              className={`border rounded-xl p-4 ${
                validationResult.valid
                  ? 'bg-emerald-500/10 border-emerald-500/30'
                  : 'bg-red-500/10 border-red-500/30'
              }`}
            >
              <p className={`text-sm font-medium ${validationResult.valid ? 'text-emerald-400' : 'text-red-400'}`}>
                {validationResult.valid ? '유효한 YAML입니다.' : '유효하지 않은 YAML'}
              </p>
              <p className="text-sm text-slate-400 mt-1">{validationResult.message}</p>
            </div>
          )}

          <div className="bg-slate-800 border border-slate-700 rounded-xl p-4">
            <h3 className="text-sm font-semibold text-slate-200 mb-2">YAML 가이드</h3>
            <ul className="text-xs text-slate-400 space-y-1.5 list-disc list-inside">
              <li>들여쓰기에 스페이스 2칸을 사용하세요</li>
              <li>탭 키로 2칸 들여쓰기를 할 수 있습니다</li>
              <li>apiVersion, kind, metadata, spec은 필수 필드입니다</li>
              <li>저장 전 YAML 검증을 실행하세요</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  )
}
