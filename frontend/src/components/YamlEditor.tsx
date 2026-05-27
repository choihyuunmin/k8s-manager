import { useRef, useCallback, type ChangeEvent, type KeyboardEvent } from 'react'

interface YamlEditorProps {
  value: string
  onChange: (val: string) => void
  readOnly?: boolean
  minHeight?: number
}

export default function YamlEditor({ value, onChange, readOnly = false, minHeight = 500 }: YamlEditorProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const lines = value.split('\n')
  const lineCount = lines.length

  const handleChange = useCallback((e: ChangeEvent<HTMLTextAreaElement>) => {
    onChange(e.target.value)
  }, [onChange])

  const handleKeyDown = useCallback((e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Tab') {
      e.preventDefault()
      const ta = e.currentTarget
      const start = ta.selectionStart
      const end = ta.selectionEnd
      const newVal = value.substring(0, start) + '  ' + value.substring(end)
      onChange(newVal)
      requestAnimationFrame(() => {
        ta.selectionStart = ta.selectionEnd = start + 2
      })
    }
  }, [value, onChange])

  const handleScroll = useCallback(() => {
    const ta = textareaRef.current
    const lineNums = ta?.parentElement?.querySelector('.line-numbers') as HTMLDivElement | null
    if (ta && lineNums) {
      lineNums.scrollTop = ta.scrollTop
    }
  }, [])

  return (
    <div className="relative flex border border-slate-600 rounded-lg overflow-hidden" style={{ minHeight }}>
      <div
        className="line-numbers flex-shrink-0 w-12 bg-slate-950 border-r border-slate-700 text-right select-none overflow-hidden"
        style={{ minHeight }}
      >
        <div className="py-3 px-2">
          {Array.from({ length: lineCount }, (_, i) => (
            <div key={i} className="text-xs leading-[20px] text-slate-600 font-mono">
              {i + 1}
            </div>
          ))}
        </div>
      </div>
      <textarea
        ref={textareaRef}
        value={value}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        onScroll={handleScroll}
        readOnly={readOnly}
        spellCheck={false}
        className="flex-1 bg-slate-950 text-slate-200 font-mono text-sm leading-[20px] p-3 resize-none focus:outline-none"
        style={{ minHeight, tabSize: 2 }}
      />
    </div>
  )
}
