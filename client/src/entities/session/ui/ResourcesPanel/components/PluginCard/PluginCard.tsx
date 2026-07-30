import { useState } from 'react'
import { cn } from '@/shared/lib/utils'
import { KIND_STYLES } from '@/shared/lib/resourceKind'
import type { PluginGroup } from '@shared/resource-extract'

export function PluginCard({ group }: { group: PluginGroup }) {
  const [collapsed, setCollapsed] = useState(false)
  const isStandalone = group.plugin === '(standalone)'

  const kindBadges = (
    Object.entries(group.kindCounts) as [keyof typeof KIND_STYLES, number][]
  ).filter(([, count]) => count > 0).sort((a, b) => b[1] - a[1])

  // Re-aggregate invocations by resource for display
  const resourceMap = new Map<string, { count: number; kind: keyof typeof KIND_STYLES }>()
  for (const inv of group.invocations) {
    const existing = resourceMap.get(inv.resource)
    if (existing) {
      existing.count++
    } else {
      resourceMap.set(inv.resource, { count: 1, kind: inv.kind as keyof typeof KIND_STYLES })
    }
  }
  const resources = [...resourceMap.entries()]
    .sort((a, b) => b[1].count - a[1].count)
  const maxCount = resources[0]?.[1].count ?? 1

  return (
    <div className="rounded-lg border border-border bg-card overflow-hidden">
      <button
        onClick={() => setCollapsed(v => !v)}
        className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-muted/30 transition-colors"
      >
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={cn(
              'text-[10px] font-semibold px-1.5 py-0.5 rounded shrink-0 border',
              isStandalone
                ? 'bg-muted/50 text-muted-foreground border-border'
                : 'bg-indigo-500/10 text-indigo-400 border-indigo-500/20',
            )}>
              {isStandalone ? 'standalone' : 'plugin'}
            </span>
            <span className={cn(
              'font-mono font-semibold text-sm truncate',
              isStandalone ? 'text-muted-foreground italic' : 'text-foreground',
            )}>
              {group.plugin}
            </span>
          </div>
          <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
            {kindBadges.map(([kind, count]) => (
              <span key={kind} className={cn('text-[9px] px-1.5 py-0.5 rounded', KIND_STYLES[kind].badge)}>
                {KIND_STYLES[kind].label} {count}
              </span>
            ))}
          </div>
        </div>
        <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-muted text-muted-foreground shrink-0">
          ×{group.totalCalls}
        </span>
        <span className="text-muted-foreground/40 text-[10px] shrink-0 ml-1">
          {collapsed ? '▶' : '▼'}
        </span>
      </button>

      {!collapsed && (
        <div className="border-t border-border">
          {resources.map(([resource, { count, kind }]) => {
            const s = KIND_STYLES[kind]
            const pct = (count / maxCount) * 100
            return (
              <div key={`${kind}:${resource}`} className="flex items-center gap-3 px-4 py-2 border-b border-border/50 last:border-b-0">
                <span className={cn('text-[9px] font-semibold px-1 py-0.5 rounded shrink-0', s.badge)}>
                  {s.label}
                </span>
                <span className="font-mono text-xs text-foreground flex-1 truncate">{resource}</span>
                <div className="w-16 h-1 rounded bg-muted overflow-hidden shrink-0">
                  <div className={cn('h-full', s.bar)} style={{ width: `${pct}%`, opacity: 0.6 }} />
                </div>
                <span className="text-[10px] font-mono text-muted-foreground tabular-nums shrink-0 w-8 text-right">
                  ×{count}
                </span>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
