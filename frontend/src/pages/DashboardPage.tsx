import { useState, useEffect, useCallback, useRef } from 'react'
import {
  Server, Box, Layers, Activity, RefreshCw, Pause, Play,
  AlertTriangle, CheckCircle, XCircle, Clock, Network, Image as ImageIcon,
  AlertCircle, Timer, Zap,
} from 'lucide-react'
import {
  PieChart, Pie, Cell, ResponsiveContainer, Tooltip,
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Legend,
} from 'recharts'
import { dashboardApi } from '../api/client'
import { useNamespaceParam } from '../hooks/useNamespace'
import { useTheme } from '../hooks/useTheme'

interface Metrics {
  totals: { nodes: number; pods: number; deployments: number; running_pods: number; services: number }
  pod_status: { name: string; value: number }[]
  pods_by_namespace: { name: string; value: number }[]
  top_restarts: { name: string; value: number }[]
  deploy_health: { name: string; ready: number; desired: number }[]
  deploy_summary: { name: string; value: number }[]
  node_status: { name: string; status: string; roles: string }[]
  recent_events: { type: string; reason: string; message: string; namespace: string; involved: string; last: string }[]
  service_types: { name: string; value: number }[]
  top_images: { name: string; value: number }[]
  pod_age: { name: string; value: number }[]
  issues_by_severity: { name: string; value: number }[]
  issues_by_status: { name: string; value: number }[]
  recent_activity: { kind: string; title: string; detail: string; actor: string; created_at: string }[]
}

const STATUS_COLORS: Record<string, string> = {
  Running: '#10b981',
  Pending: '#f59e0b',
  Failed: '#ef4444',
  Succeeded: '#3b82f6',
  Unknown: '#94a3b8',
  Healthy: '#10b981',
  Unhealthy: '#ef4444',
  ClusterIP: '#6366f1',
  NodePort: '#10b981',
  LoadBalancer: '#f59e0b',
  ExternalName: '#8b5cf6',
  critical: '#dc2626',
  high: '#f97316',
  medium: '#f59e0b',
  low: '#3b82f6',
  open: '#f59e0b',
  resolved: '#10b981',
  'in-progress': '#6366f1',
  '<1h': '#10b981',
  '1-24h': '#3b82f6',
  '1-7d': '#f59e0b',
  '>7d': '#94a3b8',
}

function colorFor(name: string): string {
  return STATUS_COLORS[name] || '#6366f1'
}

const REFRESH_INTERVAL = 5000

export default function DashboardPage() {
  const nsParam = useNamespaceParam()
  const { theme } = useTheme()
  const [metrics, setMetrics] = useState<Metrics | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string>('')
  const [autoRefresh, setAutoRefresh] = useState(true)
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null)
  const updateRef = useRef<HTMLSpanElement>(null)

  const isDark = theme === 'dark'
  const axisColor = isDark ? '#94a3b8' : '#475569'
  const gridColor = isDark ? '#334155' : '#e2e8f0'
  const tooltipStyle = {
    background: isDark ? '#1e293b' : '#ffffff',
    border: `1px solid ${gridColor}`,
    borderRadius: 8,
    color: isDark ? '#f1f5f9' : '#0f172a',
  }

  const fetchMetrics = useCallback(async () => {
    try {
      const res = await dashboardApi.getMetrics(nsParam)
      setMetrics(res.data)
      setLastUpdate(new Date())
      setError('')
    } catch (err: unknown) {
      const detail = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail
      setError(detail || '메트릭을 불러올 수 없습니다.')
    } finally {
      setLoading(false)
    }
  }, [nsParam])

  useEffect(() => { fetchMetrics() }, [fetchMetrics])

  useEffect(() => {
    if (!autoRefresh) return
    const id = setInterval(fetchMetrics, REFRESH_INTERVAL)
    return () => clearInterval(id)
  }, [autoRefresh, fetchMetrics])

  if (loading && !metrics) {
    return (
      <div className="flex items-center justify-center h-64 text-slate-500">
        <RefreshCw size={20} className="animate-spin mr-2" />
        대시보드 로딩 중...
      </div>
    )
  }

  if (error && !metrics) {
    return (
      <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-6 text-red-600 dark:text-red-400">
        <p className="font-semibold mb-1">대시보드를 불러올 수 없습니다</p>
        <p className="text-sm">{error}</p>
      </div>
    )
  }

  if (!metrics) return null

  const {
    totals, pod_status, pods_by_namespace, top_restarts, deploy_health, deploy_summary,
    node_status, recent_events, service_types, top_images, pod_age,
    issues_by_severity, issues_by_status, recent_activity,
  } = metrics
  const openIssues = issues_by_status.find((s) => s.name === 'open')?.value ?? 0

  const readyNodes = node_status.filter((n) => n.status === 'Ready').length
  const notReadyNodes = node_status.length - readyNodes
  const healthyDeploys = deploy_summary[0]?.value ?? 0
  const unhealthyDeploys = deploy_summary[1]?.value ?? 0

  const summaryCards = [
    { label: '노드', value: totals.nodes, sub: `${readyNodes} Ready`, icon: Server, color: 'text-blue-600 dark:text-blue-400', bg: 'bg-blue-500/10' },
    { label: '파드', value: totals.pods, sub: `${totals.running_pods} Running`, icon: Box, color: 'text-emerald-600 dark:text-emerald-400', bg: 'bg-emerald-500/10' },
    { label: '디플로이먼트', value: totals.deployments, sub: `${healthyDeploys} Healthy`, icon: Layers, color: 'text-amber-600 dark:text-amber-400', bg: 'bg-amber-500/10' },
    { label: '서비스', value: totals.services ?? 0, sub: `${service_types.length} 종류`, icon: Network, color: 'text-purple-600 dark:text-purple-400', bg: 'bg-purple-500/10' },
    { label: '이상 상태', value: unhealthyDeploys + notReadyNodes, sub: `${unhealthyDeploys} deploy + ${notReadyNodes} node`, icon: AlertTriangle, color: 'text-red-600 dark:text-red-400', bg: 'bg-red-500/10' },
    { label: '열린 이슈', value: openIssues, sub: `${issues_by_severity.find((s) => s.name === 'critical')?.value ?? 0} critical`, icon: AlertCircle, color: 'text-orange-600 dark:text-orange-400', bg: 'bg-orange-500/10' },
  ]

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">실시간 모니터링</h1>
          <p className="text-xs text-slate-500 mt-1 flex items-center gap-3 flex-wrap">
            {autoRefresh && (
              <span className="flex items-center gap-1.5">
                <span className="relative inline-flex w-2 h-2">
                  <span className="absolute inset-0 rounded-full bg-emerald-500 animate-ping opacity-75" />
                  <span className="relative inline-flex w-2 h-2 rounded-full bg-emerald-500" />
                </span>
                LIVE · {REFRESH_INTERVAL / 1000}초마다 갱신
              </span>
            )}
            {lastUpdate && (
              <span ref={updateRef} className="text-slate-500">
                마지막 업데이트: {lastUpdate.toLocaleTimeString()}
              </span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={fetchMetrics}
            className="flex items-center gap-2 px-3 py-2 text-sm bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-lg transition-colors"
          >
            <RefreshCw size={14} /> 새로고침
          </button>
          <button
            onClick={() => setAutoRefresh((v) => !v)}
            className={`flex items-center gap-2 px-3 py-2 text-sm rounded-lg transition-colors ${
              autoRefresh
                ? 'bg-emerald-600 hover:bg-emerald-700 text-white'
                : 'bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-300'
            }`}
          >
            {autoRefresh ? <Pause size={14} /> : <Play size={14} />}
            {autoRefresh ? '실시간 ON' : '실시간 OFF'}
          </button>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
        {summaryCards.map(({ label, value, sub, icon: Icon, color, bg }) => (
          <div key={label} className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-5">
            <div className="flex items-center justify-between mb-3">
              <p className="text-sm text-slate-600 dark:text-slate-400">{label}</p>
              <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${bg}`}>
                <Icon size={16} className={color} />
              </div>
            </div>
            <p className="text-3xl font-bold text-slate-900 dark:text-slate-100">{value}</p>
            <p className="text-xs text-slate-500 mt-1">{sub}</p>
          </div>
        ))}
      </div>

      {/* Row: Pod status + Deployment summary */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <ChartCard title="Pod 상태 분포" icon={<Activity size={16} className="text-emerald-600 dark:text-emerald-400" />}>
          {pod_status.length === 0 ? <EmptyState /> : (
            <ResponsiveContainer width="100%" height={260}>
              <PieChart>
                <Pie data={pod_status} dataKey="value" nameKey="name" outerRadius={90} innerRadius={50} paddingAngle={2}>
                  {pod_status.map((entry) => (
                    <Cell key={entry.name} fill={colorFor(entry.name)} />
                  ))}
                </Pie>
                <Tooltip contentStyle={tooltipStyle} />
                <Legend wrapperStyle={{ color: axisColor, fontSize: 12 }} />
              </PieChart>
            </ResponsiveContainer>
          )}
        </ChartCard>

        <ChartCard title="Deployment 헬스" icon={<Layers size={16} className="text-amber-600 dark:text-amber-400" />}>
          {healthyDeploys === 0 && unhealthyDeploys === 0 ? <EmptyState /> : (
            <ResponsiveContainer width="100%" height={260}>
              <PieChart>
                <Pie data={deploy_summary} dataKey="value" nameKey="name" outerRadius={90} innerRadius={50} paddingAngle={2}>
                  {deploy_summary.map((entry) => (
                    <Cell key={entry.name} fill={colorFor(entry.name)} />
                  ))}
                </Pie>
                <Tooltip contentStyle={tooltipStyle} />
                <Legend wrapperStyle={{ color: axisColor, fontSize: 12 }} />
              </PieChart>
            </ResponsiveContainer>
          )}
        </ChartCard>
      </div>

      {/* Row: Pods by namespace + Top restarts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <ChartCard title="네임스페이스별 Pod 수" icon={<Box size={16} className="text-blue-600 dark:text-blue-400" />}>
          {pods_by_namespace.length === 0 ? <EmptyState /> : (
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={pods_by_namespace} layout="vertical" margin={{ left: 8, right: 16 }}>
                <CartesianGrid stroke={gridColor} strokeDasharray="3 3" />
                <XAxis type="number" tick={{ fill: axisColor, fontSize: 11 }} stroke={axisColor} />
                <YAxis dataKey="name" type="category" tick={{ fill: axisColor, fontSize: 11 }} width={110} stroke={axisColor} />
                <Tooltip contentStyle={tooltipStyle} />
                <Bar dataKey="value" fill="#3b82f6" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </ChartCard>

        <ChartCard title="재시작 상위 Pod" icon={<AlertTriangle size={16} className="text-red-600 dark:text-red-400" />}>
          {top_restarts.length === 0 ? (
            <div className="flex items-center justify-center h-[260px] text-sm text-emerald-600 dark:text-emerald-400">
              <CheckCircle size={16} className="mr-1.5" /> 재시작 중인 Pod 없음
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={top_restarts} layout="vertical" margin={{ left: 8, right: 16 }}>
                <CartesianGrid stroke={gridColor} strokeDasharray="3 3" />
                <XAxis type="number" tick={{ fill: axisColor, fontSize: 11 }} stroke={axisColor} />
                <YAxis dataKey="name" type="category" tick={{ fill: axisColor, fontSize: 10 }} width={170} stroke={axisColor} />
                <Tooltip contentStyle={tooltipStyle} />
                <Bar dataKey="value" fill="#ef4444" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </ChartCard>
      </div>

      {/* Row: Node list + Unhealthy deployments */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <ChartCard title="노드 상태" icon={<Server size={16} className="text-blue-600 dark:text-blue-400" />}>
          <div className="space-y-2 max-h-[280px] overflow-auto pr-1">
            {node_status.length === 0 ? <EmptyState /> : node_status.map((n) => (
              <div key={n.name} className="flex items-center justify-between p-2.5 bg-slate-50 dark:bg-slate-900/50 rounded-lg">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-slate-800 dark:text-slate-200 truncate">{n.name}</p>
                  <p className="text-xs text-slate-500">{n.roles}</p>
                </div>
                {n.status === 'Ready' ? (
                  <span className="flex items-center gap-1.5 text-xs text-emerald-600 dark:text-emerald-400 flex-shrink-0">
                    <CheckCircle size={14} /> Ready
                  </span>
                ) : (
                  <span className="flex items-center gap-1.5 text-xs text-red-600 dark:text-red-400 flex-shrink-0">
                    <XCircle size={14} /> {n.status}
                  </span>
                )}
              </div>
            ))}
          </div>
        </ChartCard>

        <ChartCard title="이상 Deployment" icon={<AlertTriangle size={16} className="text-amber-600 dark:text-amber-400" />}>
          <div className="space-y-2 max-h-[280px] overflow-auto pr-1">
            {deploy_health.length === 0 ? (
              <div className="flex items-center justify-center h-[260px] text-sm text-emerald-600 dark:text-emerald-400">
                <CheckCircle size={16} className="mr-1.5" /> 모든 Deployment 정상
              </div>
            ) : deploy_health.map((d) => (
              <div key={d.name} className="p-2.5 bg-slate-50 dark:bg-slate-900/50 rounded-lg">
                <div className="flex items-center justify-between mb-1.5">
                  <p className="text-sm font-medium text-slate-800 dark:text-slate-200 truncate">{d.name}</p>
                  <span className="text-xs text-amber-600 dark:text-amber-400 font-mono">{d.ready}/{d.desired}</span>
                </div>
                <div className="w-full h-1.5 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-amber-500 transition-all"
                    style={{ width: d.desired > 0 ? `${(d.ready / d.desired) * 100}%` : '0%' }}
                  />
                </div>
              </div>
            ))}
          </div>
        </ChartCard>
      </div>

      {/* Row: Service types + Pod age + Issues by severity */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <ChartCard title="서비스 타입" icon={<Network size={16} className="text-purple-600 dark:text-purple-400" />}>
          {service_types.length === 0 ? <EmptyState /> : (
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie data={service_types} dataKey="value" nameKey="name" outerRadius={75} innerRadius={40} paddingAngle={2}>
                  {service_types.map((entry) => (
                    <Cell key={entry.name} fill={colorFor(entry.name)} />
                  ))}
                </Pie>
                <Tooltip contentStyle={tooltipStyle} />
                <Legend wrapperStyle={{ color: axisColor, fontSize: 11 }} />
              </PieChart>
            </ResponsiveContainer>
          )}
        </ChartCard>

        <ChartCard title="Pod 생성 시점 분포" icon={<Timer size={16} className="text-blue-600 dark:text-blue-400" />}>
          {pod_age.every((b) => b.value === 0) ? <EmptyState /> : (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={pod_age}>
                <CartesianGrid stroke={gridColor} strokeDasharray="3 3" />
                <XAxis dataKey="name" tick={{ fill: axisColor, fontSize: 11 }} stroke={axisColor} />
                <YAxis tick={{ fill: axisColor, fontSize: 11 }} stroke={axisColor} />
                <Tooltip contentStyle={tooltipStyle} />
                <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                  {pod_age.map((entry) => (
                    <Cell key={entry.name} fill={colorFor(entry.name)} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </ChartCard>

        <ChartCard title="열린 이슈 (심각도별)" icon={<AlertCircle size={16} className="text-orange-600 dark:text-orange-400" />}>
          {issues_by_severity.length === 0 ? (
            <div className="flex items-center justify-center h-[220px] text-sm text-emerald-600 dark:text-emerald-400">
              <CheckCircle size={16} className="mr-1.5" /> 열린 이슈 없음
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={issues_by_severity}>
                <CartesianGrid stroke={gridColor} strokeDasharray="3 3" />
                <XAxis dataKey="name" tick={{ fill: axisColor, fontSize: 11 }} stroke={axisColor} />
                <YAxis tick={{ fill: axisColor, fontSize: 11 }} stroke={axisColor} />
                <Tooltip contentStyle={tooltipStyle} />
                <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                  {issues_by_severity.map((entry) => (
                    <Cell key={entry.name} fill={colorFor(entry.name)} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </ChartCard>
      </div>

      {/* Row: Top images + Recent activity */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <ChartCard title="이미지 사용 순위 (Deployment 기준)" icon={<ImageIcon size={16} className="text-indigo-600 dark:text-indigo-400" />}>
          {top_images.length === 0 ? <EmptyState /> : (
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={top_images} layout="vertical" margin={{ left: 8, right: 16 }}>
                <CartesianGrid stroke={gridColor} strokeDasharray="3 3" />
                <XAxis type="number" tick={{ fill: axisColor, fontSize: 11 }} stroke={axisColor} />
                <YAxis dataKey="name" type="category" tick={{ fill: axisColor, fontSize: 10 }} width={200} stroke={axisColor} />
                <Tooltip contentStyle={tooltipStyle} />
                <Bar dataKey="value" fill="#6366f1" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </ChartCard>

        <ChartCard title="최근 활동" icon={<Zap size={16} className="text-emerald-600 dark:text-emerald-400" />}>
          <div className="space-y-1.5 max-h-[260px] overflow-auto pr-1">
            {recent_activity.length === 0 ? <EmptyState /> : recent_activity.map((a, i) => (
              <div key={i} className="flex items-start gap-3 p-2.5 bg-slate-50 dark:bg-slate-900/50 rounded-lg">
                <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold flex-shrink-0 mt-0.5 ${
                  a.kind === 'image'
                    ? 'bg-blue-500/15 text-blue-700 dark:text-blue-400'
                    : 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400'
                }`}>
                  {a.kind}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-xs text-slate-800 dark:text-slate-200 truncate">
                    {a.title} <span className="text-slate-500">· {a.detail}</span>
                  </p>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    {a.actor || '-'} · {a.created_at}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </ChartCard>
      </div>

      {/* Recent events */}
      <ChartCard title="최근 이벤트" icon={<Clock size={16} className="text-purple-600 dark:text-purple-400" />}>
        <div className="space-y-1.5 max-h-[320px] overflow-auto pr-1">
          {recent_events.length === 0 ? <EmptyState /> : recent_events.map((e, i) => (
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
                  <span className="font-mono text-blue-600 dark:text-blue-400">{e.namespace}/{e.involved}</span>
                  <span className="text-slate-500"> · {e.reason}</span>
                </p>
                <p className="text-xs text-slate-600 dark:text-slate-400 truncate mt-0.5">{e.message}</p>
              </div>
            </div>
          ))}
        </div>
      </ChartCard>
    </div>
  )
}

function ChartCard({ title, icon, children }: { title: string; icon?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl">
      <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-700 flex items-center gap-2">
        {icon}
        <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-300">{title}</h2>
      </div>
      <div className="p-3">{children}</div>
    </div>
  )
}

function EmptyState() {
  return (
    <div className="flex items-center justify-center h-[220px] text-sm text-slate-500">
      데이터 없음
    </div>
  )
}
