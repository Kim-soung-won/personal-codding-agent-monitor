import { useState, useMemo } from 'react'
import { cn } from '@/shared/lib/utils'
import { compactTokens } from '@/shared/lib/format'
import { BADGE_COLORS } from '@/entities/session/lib/categories'
import { CategoryBadge } from '@/entities/session/ui/CategoryBadge'
import { OriginBadge } from '@/entities/session/ui/OriginBadge'
import { SessionSummaryCard } from '@/entities/session/ui/SessionSummaryCard'
import { DiffView } from '@/entities/session/ui/DiffView'
import type { NormalizedEvent, EventCategory } from '@/entities/session/model/events'

/** 한 assistant 응답의 토큰 usage. thinking·tool·text 여러 row가 같은 message.id로 공유한다. */
interface RowUsage {
  input: number
  cacheCreation: number
  cacheRead: number
  output: number
  total: number
  messageId: string
}

/** assistant 이벤트의 raw.message.usage 를 추출한다. usage 없으면 null. */
function extractUsage(event: NormalizedEvent): RowUsage | null {
  const raw = event.raw as Record<string, unknown>
  if (raw.type !== 'assistant') return null
  const msg = raw.message as { id?: string; usage?: Record<string, number> } | undefined
  const u = msg?.usage
  if (!u) return null
  const input = Number(u.input_tokens ?? 0)
  const cacheCreation = Number(u.cache_creation_input_tokens ?? 0)
  const cacheRead = Number(u.cache_read_input_tokens ?? 0)
  const output = Number(u.output_tokens ?? 0)
  return {
    input,
    cacheCreation,
    cacheRead,
    output,
    total: input + cacheCreation + cacheRead + output,
    messageId: String(msg?.id ?? event.id),
  }
}

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

  // 응답 단위(message.id)로 집계를 표시할 대표 row 를 정한다. events 는 시간 오름차순이고
  // JSONL 은 thinking➜text➜tool-use 순서라, 매 등장마다 덮어써 '마지막 행'(주로 도구 호출)을
  // 대표로 삼는다. 같은 응답의 row 들이 usage 를 중복 표시하지 않도록 대표에만 붙인다.
  const chipRowByMsg = useMemo(() => {
    const m = new Map<string, string>()
    for (const ev of events) {
      const u = extractUsage(ev)
      if (!u) continue
      m.set(u.messageId, ev.id)
    }
    return m
  }, [events])

  const hasUsage = chipRowByMsg.size > 0

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

      {hasUsage && (
        <p className="text-2xs text-muted-foreground -mt-1">
          토큰은 응답 단위로 집계됩니다 — 한 응답의 thinking·text·도구 호출 중 마지막 행(↑입력 ↓출력)에 표시됩니다.
        </p>
      )}

      <div className="space-y-1.5">
        {filtered.length === 0 && (
          <p className="text-sm text-muted-foreground py-12 text-center">표시할 이벤트 없음</p>
        )}
        {filtered.slice().reverse().map((ev) => {
          const diffData = getDiffData(ev)
          const usage = extractUsage(ev)
          const showUsage = usage != null && chipRowByMsg.get(usage.messageId) === ev.id
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
                {showUsage && usage && (
                  <span
                    className="text-2xs font-mono tabular-nums text-muted-foreground shrink-0 mt-0.5"
                    title={`이 응답 토큰 · 입력측 ${(usage.input + usage.cacheCreation + usage.cacheRead).toLocaleString()} / 출력 ${usage.output.toLocaleString()}`}
                  >
                    ↑{compactTokens(usage.input + usage.cacheCreation + usage.cacheRead)}
                    {' '}
                    <span className="text-foreground/70">↓{compactTokens(usage.output)}</span>
                  </span>
                )}
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
                  {showUsage && usage && (
                    <div className="mb-2.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-2xs font-mono tabular-nums border-b border-border/60 pb-2">
                      <span className="text-muted-foreground uppercase tracking-wide">이 응답 토큰</span>
                      <span><span className="text-muted-foreground">신규입력</span> {compactTokens(usage.input)}</span>
                      <span><span className="text-muted-foreground">캐시생성</span> {compactTokens(usage.cacheCreation)}</span>
                      <span><span className="text-muted-foreground">캐시읽기</span> {compactTokens(usage.cacheRead)}</span>
                      <span><span className="text-muted-foreground">출력</span> <span className="text-foreground/80">{compactTokens(usage.output)}</span></span>
                      <span className="ml-auto"><span className="text-muted-foreground">합계</span> {compactTokens(usage.total)}</span>
                    </div>
                  )}
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

/**
 * Claude Code 메시지의 content 는 블록 배열 또는 단순 문자열 둘 다로 올 수 있다.
 * (특히 user 메시지 텍스트는 문자열인 경우가 흔하다.) 항상 블록 배열로 정규화한다 —
 * 문자열이면 text 블록 하나로 감싼다. `?? []` 만으로는 문자열을 못 걸러 .filter 등에서 터진다.
 */
function contentBlocks<T>(content: T[] | string | undefined | null): T[] {
  if (Array.isArray(content)) return content
  if (typeof content === 'string') return [{ type: 'text', text: content } as T]
  return []
}

function getDiffData(event: NormalizedEvent): { old: string; new: string } | null {
  const raw = event.raw as Record<string, unknown>
  if (raw.type !== 'assistant') return null

  const msg = raw.message as { content?: Array<Record<string, unknown>> | string } | undefined
  for (const item of contentBlocks(msg?.content)) {
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
    const msg = raw.message as { content?: Array<{ type: string; text?: string }> | string } | undefined
    return contentBlocks(msg?.content)
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
      }> | string
    } | undefined
    const parts: string[] = []
    for (const item of contentBlocks(msg?.content)) {
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
