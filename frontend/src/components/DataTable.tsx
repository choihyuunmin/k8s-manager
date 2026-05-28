import { useState, useMemo, type ReactNode } from 'react'
import { ChevronUp, ChevronDown } from 'lucide-react'

export interface Column<T> {
  key: string
  header: string
  sortable?: boolean
  render?: (row: T) => ReactNode
  accessor?: (row: T) => string | number
}

interface DataTableProps<T> {
  columns: Column<T>[]
  data: T[]
  keyField: string
  onRowClick?: (row: T) => void
  pageSize?: number
  emptyText?: string
  selectable?: boolean
  selectedKeys?: Array<string | number>
  onSelectionChange?: (keys: Array<string | number>) => void
}

export default function DataTable<T extends Record<string, unknown>>({
  columns,
  data,
  keyField,
  onRowClick,
  pageSize = 20,
  emptyText = '데이터가 없습니다.',
  selectable = false,
  selectedKeys,
  onSelectionChange,
}: DataTableProps<T>) {
  const [sortKey, setSortKey] = useState<string | null>(null)
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')
  const [page, setPage] = useState(0)

  const sorted = useMemo(() => {
    if (!sortKey) return data
    const col = columns.find((c) => c.key === sortKey)
    return [...data].sort((a, b) => {
      const av = col?.accessor ? col.accessor(a) : (a[sortKey] as string | number) ?? ''
      const bv = col?.accessor ? col.accessor(b) : (b[sortKey] as string | number) ?? ''
      if (av < bv) return sortDir === 'asc' ? -1 : 1
      if (av > bv) return sortDir === 'asc' ? 1 : -1
      return 0
    })
  }, [data, sortKey, sortDir, columns])

  const totalPages = Math.max(1, Math.ceil(sorted.length / pageSize))
  const paged = sorted.slice(page * pageSize, (page + 1) * pageSize)

  const handleSort = (key: string) => {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortKey(key)
      setSortDir('asc')
    }
  }

  const selSet = useMemo(() => new Set((selectedKeys ?? []).map(String)), [selectedKeys])
  const pageKeys = useMemo(() => paged.map((r) => r[keyField] as string | number), [paged, keyField])
  const allSelected = pageKeys.length > 0 && pageKeys.every((k) => selSet.has(String(k)))
  const someSelected = !allSelected && pageKeys.some((k) => selSet.has(String(k)))

  const toggleAll = () => {
    if (!onSelectionChange) return
    if (allSelected) {
      const next = (selectedKeys ?? []).filter((k) => !pageKeys.some((pk) => String(pk) === String(k)))
      onSelectionChange(next)
    } else {
      const merged = Array.from(new Set([...(selectedKeys ?? []).map(String), ...pageKeys.map(String)]))
      onSelectionChange(merged)
    }
  }

  const toggleRow = (k: string | number) => {
    if (!onSelectionChange) return
    const key = String(k)
    if (selSet.has(key)) {
      onSelectionChange((selectedKeys ?? []).filter((x) => String(x) !== key))
    } else {
      onSelectionChange([...(selectedKeys ?? []), k])
    }
  }

  const colSpan = columns.length + (selectable ? 1 : 0)

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm text-left">
        <thead>
          <tr className="border-b border-slate-200 dark:border-slate-700">
            {selectable && (
              <th className="px-3 py-3 w-10">
                <input
                  type="checkbox"
                  ref={(el) => { if (el) el.indeterminate = someSelected }}
                  checked={allSelected}
                  onChange={toggleAll}
                  onClick={(e) => e.stopPropagation()}
                  className="w-4 h-4 rounded border-slate-400 dark:border-slate-600 text-blue-500 focus:ring-blue-500 focus:ring-offset-0"
                />
              </th>
            )}
            {columns.map((col) => (
              <th
                key={col.key}
                className={`px-4 py-3 text-slate-600 dark:text-slate-400 font-medium whitespace-nowrap ${
                  col.sortable ? 'cursor-pointer hover:text-slate-800 dark:hover:text-slate-200 select-none' : ''
                }`}
                onClick={col.sortable ? () => handleSort(col.key) : undefined}
              >
                <div className="flex items-center gap-1">
                  {col.header}
                  {col.sortable && sortKey === col.key && (
                    sortDir === 'asc' ? <ChevronUp size={14} /> : <ChevronDown size={14} />
                  )}
                </div>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {paged.length === 0 ? (
            <tr>
              <td colSpan={colSpan} className="px-4 py-8 text-center text-slate-500">
                {emptyText}
              </td>
            </tr>
          ) : (
            paged.map((row) => {
              const rowKey = row[keyField] as string | number
              const isSelected = selSet.has(String(rowKey))
              return (
                <tr
                  key={String(rowKey)}
                  className={`border-b border-slate-200/50 dark:border-slate-700/50 transition-colors ${
                    isSelected
                      ? 'bg-blue-500/10'
                      : 'hover:bg-slate-200/30 dark:hover:bg-slate-700/30'
                  } ${onRowClick ? 'cursor-pointer' : ''}`}
                  onClick={onRowClick ? () => onRowClick(row) : undefined}
                >
                  {selectable && (
                    <td className="px-3 py-3 w-10">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleRow(rowKey)}
                        onClick={(e) => e.stopPropagation()}
                        className="w-4 h-4 rounded border-slate-400 dark:border-slate-600 text-blue-500 focus:ring-blue-500 focus:ring-offset-0"
                      />
                    </td>
                  )}
                  {columns.map((col) => (
                    <td key={col.key} className="px-4 py-3 text-slate-800 dark:text-slate-200 whitespace-nowrap">
                      {col.render ? col.render(row) : String(row[col.key] ?? '')}
                    </td>
                  ))}
                </tr>
              )
            })
          )}
        </tbody>
      </table>
      {totalPages > 1 && (
        <div className="flex items-center justify-between px-4 py-3 border-t border-slate-200 dark:border-slate-700">
          <span className="text-sm text-slate-600 dark:text-slate-400">
            총 {sorted.length}건 중 {page * pageSize + 1}-{Math.min((page + 1) * pageSize, sorted.length)}
          </span>
          <div className="flex items-center gap-2">
            <button
              disabled={page === 0}
              onClick={() => setPage((p) => p - 1)}
              className="px-3 py-1 text-sm bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 dark:hover:bg-slate-600 disabled:opacity-50 disabled:cursor-not-allowed rounded transition-colors text-slate-800 dark:text-slate-200"
            >
              이전
            </button>
            <span className="text-sm text-slate-600 dark:text-slate-400">{page + 1} / {totalPages}</span>
            <button
              disabled={page >= totalPages - 1}
              onClick={() => setPage((p) => p + 1)}
              className="px-3 py-1 text-sm bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 dark:hover:bg-slate-600 disabled:opacity-50 disabled:cursor-not-allowed rounded transition-colors text-slate-800 dark:text-slate-200"
            >
              다음
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
