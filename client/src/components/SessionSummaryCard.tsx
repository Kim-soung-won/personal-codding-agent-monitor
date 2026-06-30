import { useState } from 'react'
import { useSessionSummary } from '../hooks/useSessionSummary'
import type { NormalizedEvent } from '../types/events'

interface Props {
  events: NormalizedEvent[]
}

export function SessionSummaryCard({ events }: Props) {
  const [open, setOpen] = useState(false)
  const summaries = useSessionSummary(events)

  if (summaries.length === 0) return null

  return (
    <div className="border rounded overflow-hidden mb-3">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-3 py-2 text-left bg-muted/30 hover:bg-muted/50 transition-colors"
      >
        <span className="text-xs font-medium text-muted-foreground">
          이전 세션 요약 ({summaries.length}개)
        </span>
        <span className="text-xs text-muted-foreground">{open ? '▲' : '▼'}</span>
      </button>
      {open && (
        <div className="divide-y">
          {summaries.map((s, i) => (
            <div key={i} className="px-3 py-2">
              <p className="text-xs text-muted-foreground mb-1 font-mono">{s.hookName}</p>
              <pre className="text-xs whitespace-pre-wrap break-words leading-relaxed max-h-48 overflow-y-auto">
                {s.content}
              </pre>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
