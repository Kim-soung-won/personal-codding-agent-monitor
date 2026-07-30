import { useState } from 'react'
import { cn } from '@/shared/lib/utils'
import { KIND_STYLES } from '@/shared/lib/resourceKind'
import type { ResourceGroup } from '@shared/resource-extract'
import { fmtTime, fmtTimeRange } from '@/entities/session/ui/ResourcesPanel/timeFormat'

export function GroupCard({
  group,
  globalMax,
  multiSession,
}: {
  group: ResourceGroup
  globalMax: number
  multiSession?: boolean
}) {
  const [collapsed, setCollapsed] = useState(false)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const s = KIND_STYLES[group.kind]
  const pct = globalMax > 0 ? (group.calls.length / globalMax) * 100 : 100

  return (
    <div className="rounded-lg border border-border bg-card overflow-hidden">
      {/* Group header */}
      <button
        onClick={() => setCollapsed(v => !v)}
        className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-muted/30 transition-colors"
      >
        {/* frequency bar (left accent) */}
        <div
          className={cn('w-1 self-stretch rounded-full shrink-0 opacity-70', s.bar)}
          style={{ minHeight: 20, height: '100%' }}
        />

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={cn('text-[10px] font-semibold px-1.5 py-0.5 rounded shrink-0', s.badge)}>
              {s.label}
            </span>
            <span className="font-mono font-semibold text-sm text-foreground truncate">
              {group.plugin && (
                <span className="text-muted-foreground/50 font-normal">{group.plugin}:</span>
              )}
              {group.resource}
            </span>
          </div>
          <div className="flex items-center gap-3 mt-1">
            {/* freq bar */}
            <div className="flex items-center gap-1.5 flex-1 max-w-[120px]">
              <div className="h-1 flex-1 rounded bg-muted overflow-hidden">
                <div className={cn('h-full', s.bar)} style={{ width: `${pct}%`, opacity: 0.6 }} />
              </div>
            </div>
            <span className="text-[10px] text-muted-foreground">
              {fmtTimeRange(group.firstAt, group.lastAt)}
            </span>
          </div>
        </div>

        {/* count badge */}
        <span className={cn('text-xs font-bold px-2 py-0.5 rounded-full shrink-0', s.badge)}>
          ×{group.calls.length}
        </span>

        <span className="text-muted-foreground/40 text-[10px] shrink-0 ml-1">
          {collapsed ? '▶' : '▼'}
        </span>
      </button>

      {/* Calls list */}
      {!collapsed && (
        <div className="border-t border-border">
          {group.calls.map((inv, i) => (
            <div key={inv.id} className="border-b border-border/50 last:border-b-0">
              <button
                onClick={() => setExpandedId(expandedId === inv.id ? null : inv.id)}
                className={cn(
                  'w-full flex items-start gap-3 px-4 py-2 text-left transition-colors text-xs',
                  inv.detail
                    ? 'hover:bg-muted/20 cursor-pointer'
                    : 'cursor-default',
                )}
              >
                <span className="text-muted-foreground/40 font-mono w-5 shrink-0 text-right pt-0.5">
                  {i + 1}
                </span>
                <span className="flex-1 min-w-0 flex items-center gap-1.5">
                  {multiSession && (
                    <span className="text-[9px] font-mono px-1 py-0.5 rounded bg-muted text-muted-foreground shrink-0">
                      {inv.sessionId.slice(0, 6)}
                    </span>
                  )}
                  {inv.description && (
                    <span className="text-[9px] text-muted-foreground/50 shrink-0 font-mono">
                      {inv.description}
                    </span>
                  )}
                  {inv.detail ? (
                    <span className="text-foreground/80 truncate">
                      {inv.detail.split('\n')[0]}
                    </span>
                  ) : (
                    <span className="text-muted-foreground/30 italic text-[10px]">
                      {inv.description === '⚙ auto' ? '자동 로드' : '인자 없음'}
                    </span>
                  )}
                </span>
                <span className="text-muted-foreground/50 shrink-0 tabular-nums font-mono text-[10px] pt-0.5">
                  {fmtTime(inv.timestamp)}
                </span>
                {inv.detail && (
                  <span className="text-muted-foreground/30 text-[10px] shrink-0 ml-1 pt-0.5">
                    {expandedId === inv.id ? '▲' : '▶'}
                  </span>
                )}
              </button>

              {expandedId === inv.id && inv.detail && (
                <div className="px-4 pb-3 pl-12">
                  <pre className="text-[11px] bg-muted/40 rounded p-2.5 overflow-x-auto whitespace-pre-wrap break-words font-mono leading-relaxed text-muted-foreground max-h-64">
                    {inv.detail}
                  </pre>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
