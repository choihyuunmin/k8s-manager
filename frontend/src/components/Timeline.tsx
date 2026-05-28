import { type ReactNode } from 'react'

export interface TimelineItem {
  id: string
  icon: ReactNode
  timestamp: string
  title: string
  description: string
  color?: 'blue' | 'emerald' | 'amber' | 'red' | 'slate'
}

interface TimelineProps {
  items: TimelineItem[]
}

const dotColors = {
  blue: 'bg-blue-500 ring-blue-500/30',
  emerald: 'bg-emerald-500 ring-emerald-500/30',
  amber: 'bg-amber-500 ring-amber-500/30',
  red: 'bg-red-500 ring-red-500/30',
  slate: 'bg-slate-500 ring-slate-500/30',
}

export default function Timeline({ items }: TimelineProps) {
  if (items.length === 0) {
    return <p className="text-slate-500 text-center py-8">기록이 없습니다.</p>
  }

  return (
    <div className="relative">
      <div className="absolute left-5 top-0 bottom-0 w-px bg-slate-200 dark:bg-slate-700" />
      <div className="space-y-6">
        {items.map((item) => (
          <div key={item.id} className="relative flex items-start gap-4 pl-12">
            <div
              className={`absolute left-3.5 top-1 w-3 h-3 rounded-full ring-4 ${
                dotColors[item.color ?? 'blue']
              }`}
            />
            <div className="flex-1 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg p-4">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-slate-600 dark:text-slate-400">{item.icon}</span>
                <span className="text-xs text-slate-500">{item.timestamp}</span>
              </div>
              <h4 className="text-sm font-medium text-slate-800 dark:text-slate-200">{item.title}</h4>
              <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">{item.description}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
