import { useState } from 'react'
import { cn } from '@/shared/lib/utils'
import { KIND_STYLES } from '@/shared/lib/resourceKind'
import type { ResourceInvocation } from '@shared/resource-extract'
import { fmtTime } from '@/entities/session/ui/ResourcesPanel/timeFormat'

export function TimelineRow({ inv, index }: { inv: ResourceInvocation; index: number }) {
  const [open, setOpen] = useState(false)
  const s = KIND_STYLES[inv.kind]

  return (
    <div className="flex gap-2 items-start">
      <span className="text-[10px] text-muted-foreground/40 font-mono w-5 shrink-0 text-right pt-3">
        {index + 1}
      </span>
      <div className="flex-1 min-w-0 rounded-lg border border-border bg-card overflow-hidden">
        <button
          onClick={() => setOpen(v => !v)}
          className="w-full flex items-center gap-3 px-3 py-2.5 text-left hover:bg-muted/30 transition-colors text-sm"
        >
          <div className={cn('w-1.5 h-1.5 rounded-full shrink-0', s.dot)} />
          <span className={cn('text-[10px] font-semibold px-1.5 py-0.5 rounded shrink-0', s.badge)}>
            {s.label}
          </span>
          <span className="font-mono font-semibold text-foreground truncate">{inv.resource}</span>
          {inv.description && (
            <span className="text-[9px] text-muted-foreground/50 font-mono shrink-0">{inv.description}</span>
          )}
          <span className="text-muted-foreground/50 text-[10px] shrink-0 tabular-nums ml-auto font-mono">
            {fmtTime(inv.timestamp)}
          </span>
          {inv.detail && (
            <span className="text-muted-foreground/40 text-[10px] shrink-0 ml-1">
              {open ? '▲' : '▼'}
            </span>
          )}
        </button>

        {open && inv.detail && (
          <div className="px-3 pb-3 border-t border-border/50">
            <pre className="text-[11px] bg-muted/40 rounded p-2.5 overflow-x-auto whitespace-pre-wrap break-words font-mono leading-relaxed text-muted-foreground mt-2 max-h-64">
              {inv.detail}
            </pre>
          </div>
        )}
      </div>
    </div>
  )
}
