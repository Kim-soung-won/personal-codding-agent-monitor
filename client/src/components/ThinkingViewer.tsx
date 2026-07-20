import { useState, useMemo } from 'react'
import { cn } from '../lib/utils'
import { BADGE_COLORS } from '../lib/categories'
import { CategoryBadge } from './CategoryBadge'
import { OriginBadge } from './OriginBadge'
import { SessionSummaryCard } from './SessionSummaryCard'
import { DiffView } from './DiffView'
import type { NormalizedEvent, EventCategory } from '../types/events'

type ViewerCategory = Extract<
  EventCategory,
  'user-input' | 'thinking' | 'tool-use' | 'assistant-text'
>

const VIEWER_CATS: ViewerCategory[] = ['user-input', 'thinking', 'tool-use', 'assistant-text']
const VIEWER_SET = new Set<EventCategory>(VIEWER_CATS)

interface Props {
  events: NormalizedEvent[]
}

export function ThinkingViewer({ events }: Props) {
  const [search, setSearch] = useState('')
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [active, setActive] = useState<Set<ViewerCategory>>(new Set(VIEWER_CATS))
  const [showDiff, setShowDiff] = useState<Set<string>>(new Set())
  const [originFilter, setOriginFilter] = useState<'all' | 'main' | 'subagent'>('all')

  const subagentCount = useMemo(
    () => events.filter((e) => e.origin === 'subagent').length,
    [events],
  )

  const filtered = useMemo(() => {
    const q = search.toLowerCase()
    return events.filter((e) => {
      if (!VIEWER_SET.has(e.category)) return false
      if (!active.has(e.category as ViewerCategory)) return false
      if (originFilter !== 'all' && (e.origin ?? 'main') !== originFilter) return false
      if (q && !e.summary.toLowerCase().includes(q)) return false
      return true
    })
  }, [events, active, search, originFilter])

  const toggleExpand = (id: string) =>
    setExpanded((prev) => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })

  const toggleDiff = (id: string) =>
    setShowDiff((prev) => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })

  const toggleCat = (cat: ViewerCategory) =>
    setActive((prev) => {
      const next = new Set(prev)
      next.has(cat) ? next.delete(cat) : next.add(cat)
      return next
    })

  return (
    <div className="flex flex-col gap-3">
      <SessionSummaryCard events={events} />

      <div className="flex items-center gap-2 flex-wrap">
        <input
          type="text"
          placeholder="내용 검색..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="text-sm border rounded px-3 py-1.5 bg-background w-44 focus:outline-none focus:ring-1 focus:ring-ring"
        />
        {VIEWER_CATS.map((cat) => (
          <button
            key={cat}
            onClick={() => toggleCat(cat)}
            className={cn(
              'text-xs px-2 py-1 rounded border transition-opacity',
              active.has(cat)
                ? BADGE_COLORS[cat]
                : 'bg-muted/30 text-muted-foreground border-transparent opacity-40',
            )}
          >
            {cat}
          </button>
        ))}
        {/* 서브에이전트가 있는 세션에서만 origin 필터 노출 */}
        {subagentCount > 0 && (
          <div className="flex items-center gap-1 ml-1 pl-2 border-l">
            {(['all', 'main', 'subagent'] as const).map((mode) => (
              <button
                key={mode}
                onClick={() => setOriginFilter(mode)}
                className={cn(
                  'text-xs px-2 py-1 rounded border transition-opacity',
                  originFilter === mode
                    ? mode === 'subagent'
                      ? 'bg-violet-500/15 text-violet-500 border-violet-500/30'
                      : 'bg-muted text-foreground border-transparent'
                    : 'bg-muted/30 text-muted-foreground border-transparent opacity-40',
                )}
              >
                {mode === 'all' ? '전체' : mode === 'main' ? '메인' : `⑂ 서브 ${subagentCount}`}
              </button>
            ))}
          </div>
        )}
        <span className="ml-auto text-xs text-muted-foreground">{filtered.length}개</span>
      </div>

      <div className="space-y-1.5">
        {filtered.length === 0 && (
          <p className="text-sm text-muted-foreground py-12 text-center">표시할 이벤트 없음</p>
        )}
        {filtered.slice().reverse().map((ev) => {
          const diffData = getDiffData(ev)
          return (
            <div key={ev.id} className="border rounded overflow-hidden">
              <button
                onClick={() => toggleExpand(ev.id)}
                className="w-full flex items-start gap-2 px-3 py-2 text-left hover:bg-muted/30 transition-colors"
              >
                <span className="text-xs text-muted-foreground shrink-0 mt-0.5 font-mono">
                  {new Date(ev.timestamp).toLocaleTimeString()}
                </span>
                <CategoryBadge category={ev.category} />
                <OriginBadge origin={ev.origin} agentId={ev.agentId} />
                <span className="flex-1 text-sm truncate text-foreground/80">{ev.summary}</span>
                {diffData && (
                  <button
                    onClick={(e) => { e.stopPropagation(); toggleDiff(ev.id) }}
                    className="text-xs px-1.5 py-0.5 rounded border bg-background hover:bg-muted/50 shrink-0"
                  >
                    diff
                  </button>
                )}
                <span className="text-xs text-muted-foreground shrink-0 mt-0.5">
                  {expanded.has(ev.id) ? '▲' : '▼'}
                </span>
              </button>
              {showDiff.has(ev.id) && diffData && (
                <div className="border-t px-3 py-2">
                  <DiffView oldString={diffData.old} newString={diffData.new} />
                </div>
              )}
              {expanded.has(ev.id) && (
                <div className="border-t bg-muted/20 px-3 py-3 max-h-96 overflow-y-auto">
                  <pre className="text-xs font-mono whitespace-pre-wrap break-words leading-relaxed">
                    {extractContent(ev)}
                  </pre>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

function getDiffData(event: NormalizedEvent): { old: string; new: string } | null {
  const raw = event.raw as Record<string, unknown>
  if (raw.type !== 'assistant') return null

  const msg = raw.message as { content?: Array<Record<string, unknown>> } | undefined
  for (const item of msg?.content ?? []) {
    if (item.type !== 'tool_use') continue
    if (item.name !== 'Edit' && item.name !== 'Write') continue
    const input = item.input as Record<string, unknown> | undefined
    const oldStr = input?.old_string
    const newStr = input?.new_string
    if (typeof oldStr === 'string' && typeof newStr === 'string') {
      return { old: oldStr, new: newStr }
    }
  }
  return null
}

function extractContent(event: NormalizedEvent): string {
  const raw = event.raw as Record<string, unknown>

  if (raw.type === 'user') {
    const msg = raw.message as { content?: Array<{ type: string; text?: string }> } | undefined
    return (msg?.content ?? [])
      .filter((c) => c.type === 'text')
      .map((c) => c.text ?? '')
      .join('\n\n')
  }

  if (raw.type === 'assistant') {
    const msg = raw.message as {
      content?: Array<{
        type: string
        thinking?: string
        name?: string
        input?: unknown
        text?: string
      }>
    } | undefined
    const parts: string[] = []
    for (const item of msg?.content ?? []) {
      if (item.type === 'thinking' && item.thinking) {
        parts.push(`[thinking]\n${item.thinking}`)
      } else if (item.type === 'tool_use' && item.name) {
        parts.push(`[${item.name}]\n${JSON.stringify(item.input, null, 2)}`)
      } else if (item.type === 'text' && item.text) {
        parts.push(item.text)
      }
    }
    return parts.join('\n\n---\n\n')
  }

  return JSON.stringify(raw, null, 2)
}
