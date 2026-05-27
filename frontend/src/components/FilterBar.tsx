import { Search } from 'lucide-react'
import { type ReactNode } from 'react'

interface FilterBarProps {
  searchValue?: string
  onSearchChange?: (val: string) => void
  searchPlaceholder?: string
  children?: ReactNode
}

export default function FilterBar({ searchValue, onSearchChange, searchPlaceholder = '검색...', children }: FilterBarProps) {
  return (
    <div className="flex flex-wrap items-center gap-3 p-4 bg-slate-800 border border-slate-700 rounded-lg">
      {onSearchChange && (
        <div className="relative flex-1 min-w-[200px]">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={searchValue}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder={searchPlaceholder}
            className="w-full pl-9 pr-3 py-2 text-sm bg-slate-900 border border-slate-600 rounded-lg text-slate-200 placeholder-slate-500 focus:outline-none focus:border-blue-500 transition-colors"
          />
        </div>
      )}
      {children}
    </div>
  )
}

interface FilterSelectProps {
  value: string
  onChange: (val: string) => void
  options: { value: string; label: string }[]
  label?: string
}

export function FilterSelect({ value, onChange, options, label }: FilterSelectProps) {
  return (
    <div className="flex items-center gap-2">
      {label && <span className="text-sm text-slate-400 whitespace-nowrap">{label}</span>}
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="px-3 py-2 text-sm bg-slate-900 border border-slate-600 rounded-lg text-slate-200 focus:outline-none focus:border-blue-500 transition-colors"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    </div>
  )
}
