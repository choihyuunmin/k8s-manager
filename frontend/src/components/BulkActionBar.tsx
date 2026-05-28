import type { ReactNode } from 'react'
import { X } from 'lucide-react'

interface BulkActionBarProps {
  count: number
  onClear: () => void
  children: ReactNode
}

export default function BulkActionBar({ count, onClear, children }: BulkActionBarProps) {
  if (count === 0) return null
  return (
    <div className="flex items-center justify-between bg-blue-500/10 border border-blue-500/30 rounded-xl px-4 py-2.5">
      <div className="flex items-center gap-3">
        <span className="text-sm font-medium text-blue-700 dark:text-blue-300">
          {count}개 선택됨
        </span>
        <button
          onClick={onClear}
          className="flex items-center gap-1 text-xs text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 transition-colors"
        >
          <X size={12} /> 선택 해제
        </button>
      </div>
      <div className="flex items-center gap-2 flex-wrap">{children}</div>
    </div>
  )
}
