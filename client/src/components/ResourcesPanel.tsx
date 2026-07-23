import { useMemo, useState } from 'react'
import { cn } from '../lib/utils'
import { KIND_STYLES } from '../lib/resourceKind'
import type { NormalizedEvent } from '../types/events'
import {
  extractToolCalls, toResourceInvocation, groupInvocations, groupByPlugin,
} from '@shared/resource-extract'
import type { ResourceInvocation, ResourceGroup, PluginGroup } from '@shared/resource-extract'

interface Props {
  events: NormalizedEvent[]
  multiSession?: boolean
}

// ─── Constants ────────────────────────────────────────────────────────────────

function fmtTime(iso: string): string {
  return new Date(iso).toLocaleString('ko-KR', {
    month: 'numeric', day: 'numeric',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  })
}

function fmtTimeRange(from: string, to: string): string {
  if (from === to) return fmtTime(from)
  const f = new Date(from)
  const t = new Date(to)
  const durMs = t.getTime() - f.getTime()
  if (durMs < 60_000) return `${fmtTime(from)} · ${(durMs / 1000).toFixed(0)}s`
  const min = Math.floor(durMs / 60_000)
  return `${fmtTime(from)} · ${min}분`
}

// ─── Group card (Grouped view) ────────────────────────────────────────────────

function GroupCard({
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

// ─── Timeline row (Timeline view) ─────────────────────────────────────────────

function TimelineRow({ inv, index }: { inv: ResourceInvocation; index: number }) {
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

// ─── Plugin card ──────────────────────────────────────────────────────────────

function PluginCard({ group }: { group: PluginGroup }) {
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

// ─── Filter chip ──────────────────────────────────────────────────────────────

function FilterChip({
  kind, count, active, onClick,
}: {
  kind: 'skill' | 'agent' | 'workflow' | 'artifact' | 'mcp' | 'all'
  count: number
  active: boolean
  onClick: () => void
}) {
  const style = kind === 'all'
    ? { dot: 'bg-blue-500', badge: 'bg-blue-500/10 text-blue-400 border border-blue-500/20', label: 'All' }
    : KIND_STYLES[kind]

  return (
    <button
      onClick={onClick}
      className={cn(
        'flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs font-medium transition-colors',
        active
          ? cn(style.badge, 'ring-1 ring-offset-1 ring-offset-background ring-current/30')
          : 'border-border text-muted-foreground hover:text-foreground hover:bg-muted/40',
      )}
    >
      <div className={cn('w-1.5 h-1.5 rounded-full', style.dot)} />
      {style.label}
      <span className={cn('font-mono tabular-nums', active ? '' : 'text-muted-foreground')}>{count}</span>
    </button>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

const ALL_KINDS = ['skill', 'agent', 'workflow', 'artifact', 'mcp'] as const
type ResourceKind = typeof ALL_KINDS[number]

export function ResourcesPanel({ events, multiSession = false }: Props) {
  const [filter, setFilter] = useState<'all' | ResourceKind>('all')
  const [view, setView] = useState<'grouped' | 'timeline' | 'plugin'>('grouped')

  const VIEW_LABELS: Record<'grouped' | 'timeline' | 'plugin', string> = {
    grouped: '그룹',
    timeline: '타임라인',
    plugin: '플러그인',
  }

  const { invocations, otherStats } = useMemo(() => {
    const calls = extractToolCalls(events)
    const invs: ResourceInvocation[] = []
    const otherCounts = new Map<string, number>()

    for (const call of calls) {
      const inv = toResourceInvocation(call)
      if (inv) {
        invs.push(inv)
      } else {
        otherCounts.set(call.name, (otherCounts.get(call.name) ?? 0) + 1)
      }
    }

    return {
      invocations: invs,
      otherStats: [...otherCounts.entries()].sort((a, b) => b[1] - a[1]),
    }
  }, [events])

  const counts = useMemo(() => ({
    skill:    invocations.filter(i => i.kind === 'skill').length,
    agent:    invocations.filter(i => i.kind === 'agent').length,
    workflow: invocations.filter(i => i.kind === 'workflow').length,
    artifact: invocations.filter(i => i.kind === 'artifact').length,
    mcp:      invocations.filter(i => i.kind === 'mcp').length,
  }), [invocations])

  const total = ALL_KINDS.reduce((s, k) => s + counts[k], 0)
  const otherTotal = otherStats.reduce((s, [, n]) => s + n, 0)

  const filtered = filter === 'all' ? invocations : invocations.filter(i => i.kind === filter)
  const groups = useMemo(() => groupInvocations(filtered), [filtered])
  const globalMax = groups.length > 0 ? groups[0].calls.length : 1
  const pluginGroups = useMemo(() => groupByPlugin(invocations), [invocations])

  const isEmpty = filtered.length === 0

  return (
    <div className="flex gap-6 h-full items-start">

      {/* ── Left: main resource list ── */}
      <div className="flex-1 min-w-0 space-y-4">

        {/* Top bar: filters + view toggle */}
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-1.5 flex-wrap flex-1">
            <FilterChip kind="all" count={total} active={filter === 'all'} onClick={() => setFilter('all')} />
            {ALL_KINDS.filter(k => counts[k] > 0).map(k => (
              <FilterChip key={k} kind={k} count={counts[k]} active={filter === k} onClick={() => setFilter(k)} />
            ))}
          </div>

          <div className="flex items-center rounded-md border border-border overflow-hidden shrink-0">
            {(['grouped', 'timeline', 'plugin'] as const).map(v => (
              <button
                key={v}
                onClick={() => setView(v)}
                className={cn(
                  'px-2.5 py-1 text-[10px] font-medium transition-colors',
                  view === v
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:text-foreground hover:bg-muted/40',
                )}
              >
                {VIEW_LABELS[v]}
              </button>
            ))}
          </div>
        </div>

        {/* Content */}
        {view === 'plugin' ? (
          pluginGroups.length === 0 ? (
            <p className="text-sm text-muted-foreground py-8 text-center">플러그인 호출 없음</p>
          ) : (
            <div className="space-y-2">
              {pluginGroups.map(pg => (
                <PluginCard key={pg.plugin} group={pg} />
              ))}
            </div>
          )
        ) : isEmpty ? (
          <p className="text-sm text-muted-foreground py-8 text-center">
            {total === 0 ? 'Skill / Agent / Workflow 호출 없음' : '선택한 타입의 호출 없음'}
          </p>
        ) : view === 'grouped' ? (
          <div className="space-y-2">
            {groups.map(g => (
              <GroupCard key={g.key} group={g} globalMax={globalMax} multiSession={multiSession} />
            ))}
          </div>
        ) : (
          <div className="space-y-1.5">
            {filtered.map((inv, i) => (
              <TimelineRow key={inv.id} inv={inv} index={i} />
            ))}
          </div>
        )}
      </div>

      {/* ── Right: other tools panel ── */}
      {otherTotal > 0 && (
        <div className="w-52 shrink-0 space-y-3 sticky top-0">
          <p className="text-xs font-medium text-muted-foreground">기타 도구</p>
          <div className="rounded-lg border border-border bg-card p-3 space-y-2.5">
            {otherStats.map(([name, count]) => {
              const pct = (count / otherTotal) * 100
              return (
                <div key={name} className="space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-mono">{name}</span>
                    <span className="text-muted-foreground tabular-nums font-mono">{count}</span>
                  </div>
                  <div className="h-1.5 rounded bg-muted overflow-hidden">
                    <div className="h-full bg-blue-400/50" style={{ width: `${pct}%` }} />
                  </div>
                </div>
              )
            })}
            <p className="text-[10px] text-muted-foreground/50 pt-1 text-right tabular-nums">
              총 {otherTotal}회
            </p>
          </div>
        </div>
      )}
    </div>
  )
}
