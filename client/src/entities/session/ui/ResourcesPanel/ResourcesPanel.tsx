import { useMemo, useState } from 'react'
import { cn } from '@/shared/lib/utils'
import type { NormalizedEvent } from '@/entities/session/model/events'
import {
  extractToolCalls, toResourceInvocation, groupInvocations, groupByPlugin,
} from '@shared/resource-extract'
import type { ResourceInvocation } from '@shared/resource-extract'
import { GroupCard } from '@/entities/session/ui/ResourcesPanel/components/GroupCard'
import { TimelineRow } from '@/entities/session/ui/ResourcesPanel/components/TimelineRow'
import { PluginCard } from '@/entities/session/ui/ResourcesPanel/components/PluginCard'
import { FilterChip } from '@/entities/session/ui/ResourcesPanel/components/FilterChip'

interface Props {
  events: NormalizedEvent[]
  multiSession?: boolean
}

const ALL_KINDS = ['skill', 'agent', 'workflow', 'artifact', 'mcp'] as const
type ResourceKind = typeof ALL_KINDS[number]

/** 세션의 리소스 호출(스킬·에이전트·워크플로·MCP)을 그룹·타임라인·플러그인 뷰로 보여준다. */
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
