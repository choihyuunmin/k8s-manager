interface StatusBadgeProps {
  status: string
  size?: 'sm' | 'md'
}

function getColor(status: string): string {
  const s = status.toLowerCase()
  if (['running', 'active', 'ready', 'healthy', 'connected'].includes(s))
    return 'bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border-emerald-500/30'
  if (['pending', 'warning', 'waiting', 'creating'].includes(s))
    return 'bg-amber-500/20 text-amber-600 dark:text-amber-400 border-amber-500/30'
  if (['failed', 'error', 'crashloopbackoff', 'disconnected'].includes(s))
    return 'bg-red-500/20 text-red-600 dark:text-red-400 border-red-500/30'
  if (['succeeded', 'completed'].includes(s))
    return 'bg-blue-500/20 text-blue-600 dark:text-blue-400 border-blue-500/30'
  if (['terminating'].includes(s))
    return 'bg-orange-500/20 text-orange-400 border-orange-500/30'
  return 'bg-slate-500/20 text-slate-600 dark:text-slate-400 border-slate-500/30'
}

export default function StatusBadge({ status, size = 'sm' }: StatusBadgeProps) {
  const sizeClass = size === 'sm' ? 'text-xs px-2 py-0.5' : 'text-sm px-3 py-1'
  return (
    <span className={`inline-flex items-center rounded-full border font-medium ${sizeClass} ${getColor(status)}`}>
      {status}
    </span>
  )
}
