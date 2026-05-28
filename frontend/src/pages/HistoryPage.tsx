import { useState, useEffect, useCallback } from 'react'
import { History, Rocket, Box, FileCode, Server } from 'lucide-react'
import { historyApi } from '../api/client'
import FilterBar, { FilterSelect } from '../components/FilterBar'
import Timeline, { type TimelineItem } from '../components/Timeline'
import LoadingSpinner from '../components/LoadingSpinner'

interface HistoryRecord {
  id: string
  type: string
  resource_kind: string
  resource_name: string
  namespace: string
  performed_by: string
  created_at: string
  source: string
  [key: string]: unknown
}

function getIcon(type: string) {
  switch (type) {
    case 'apply': return <Rocket size={16} />
    case 'uploaded':
    case 'loaded': return <Box size={16} />
    case 'delete': return <FileCode size={16} />
    default: return <Server size={16} />
  }
}

function getColor(type: string): 'blue' | 'emerald' | 'amber' | 'red' | 'slate' {
  switch (type) {
    case 'apply': return 'emerald'
    case 'uploaded':
    case 'loaded': return 'blue'
    case 'delete': return 'red'
    case 'update': return 'amber'
    default: return 'slate'
  }
}

export default function HistoryPage() {
  const [records, setRecords] = useState<HistoryRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [actionType, setActionType] = useState('all')
  const [resourceKind, setResourceKind] = useState('all')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const params: Record<string, string> = {}
      if (actionType !== 'all') params.action_type = actionType
      if (resourceKind !== 'all') params.resource_kind = resourceKind
      if (dateFrom) params.date_from = dateFrom
      if (dateTo) params.date_to = dateTo
      const res = await historyApi.list(params)
      setRecords(res.data ?? [])
    } catch {
      setRecords([])
    } finally {
      setLoading(false)
    }
  }, [actionType, resourceKind, dateFrom, dateTo])

  useEffect(() => { fetchData() }, [fetchData])

  const items: TimelineItem[] = records.map((r) => ({
    id: r.id,
    icon: getIcon(r.type),
    timestamp: r.created_at,
    title: `${r.type} - ${r.resource_kind ?? ''}/${r.resource_name ?? ''}`,
    description: `${r.performed_by ?? ''} (네임스페이스: ${r.namespace || '-'})`,
    color: getColor(r.type),
  }))

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
        <History size={24} /> 히스토리
      </h1>

      <FilterBar>
        <FilterSelect
          label="액션"
          value={actionType}
          onChange={setActionType}
          options={[
            { value: 'all', label: '전체' },
            { value: 'deploy', label: '배포' },
            { value: 'image', label: '이미지' },
            { value: 'update', label: '수정' },
            { value: 'delete', label: '삭제' },
          ]}
        />
        <FilterSelect
          label="리소스"
          value={resourceKind}
          onChange={setResourceKind}
          options={[
            { value: 'all', label: '전체' },
            { value: 'deployment', label: 'Deployment' },
            { value: 'service', label: 'Service' },
            { value: 'configmap', label: 'ConfigMap' },
            { value: 'image', label: 'Image' },
          ]}
        />
        <div className="flex items-center gap-2">
          <span className="text-sm text-slate-600 dark:text-slate-400">기간</span>
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            className="px-3 py-2 text-sm bg-slate-100 dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded-lg text-slate-800 dark:text-slate-200 focus:outline-none focus:border-blue-500 transition-colors"
          />
          <span className="text-slate-500">~</span>
          <input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            className="px-3 py-2 text-sm bg-slate-100 dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded-lg text-slate-800 dark:text-slate-200 focus:outline-none focus:border-blue-500 transition-colors"
          />
        </div>
      </FilterBar>

      <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-6">
        {loading ? (
          <LoadingSpinner text="히스토리를 불러오는 중..." />
        ) : (
          <Timeline items={items} />
        )}
      </div>
    </div>
  )
}
