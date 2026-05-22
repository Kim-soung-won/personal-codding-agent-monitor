import { useMemo } from 'react'
import { cn } from '../lib/utils'
import type { NormalizedEvent } from '../types/events'

interface TokenStats {
  input: number
  output: number
  cacheCreate: number
  cacheRead: number
  total: number
  cacheHitRate: number
  turnCount: number
}

interface Props {
  events: NormalizedEvent[]
}

export function TokenDashboard({ events }: Props) {
  const stats = useMemo(() => calcStats(events), [events])

  if (stats.turnCount === 0) {
    return (
      <p className="text-sm text-muted-foreground py-12 text-center">
        세션을 선택하면 토큰 통계가 표시됩니다
      </p>
    )
  }

  const segments = [
    { label: 'input', value: stats.input, bar: 'bg-blue-400', text: 'text-blue-600' },
    { label: 'output', value: stats.output, bar: 'bg-emerald-400', text: 'text-emerald-600' },
    { label: 'cache creation', value: stats.cacheCreate, bar: 'bg-orange-400', text: 'text-orange-600' },
    { label: 'cache read', value: stats.cacheRead, bar: 'bg-purple-400', text: 'text-purple-600' },
  ]

  return (
    <div className="space-y-6 max-w-2xl">
      {/* 토큰 카드 */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {segments.map((seg) => (
          <div key={seg.label} className="border rounded px-4 py-3">
            <p className="text-xs text-muted-foreground">{seg.label}</p>
            <p className={cn('text-2xl font-mono font-semibold mt-1', seg.text)}>
              {fmtTokens(seg.value)}
            </p>
          </div>
        ))}
      </div>

      {/* 요약 */}
      <div className="flex items-center gap-6 text-sm text-muted-foreground">
        <span>
          총{' '}
          <span className="text-foreground font-mono font-medium">{fmtTokens(stats.total)}</span>{' '}
          토큰
        </span>
        <span>
          응답{' '}
          <span className="text-foreground font-mono font-medium">{stats.turnCount}</span>회
        </span>
      </div>

      {/* 토큰 분포 바 */}
      <div>
        <p className="text-xs text-muted-foreground mb-1.5">토큰 분포</p>
        <div className="flex h-5 rounded overflow-hidden bg-muted">
          {segments.map((seg) => {
            const pct = stats.total > 0 ? (seg.value / stats.total) * 100 : 0
            return pct > 0.3 ? (
              <div
                key={seg.label}
                className={cn('h-full', seg.bar)}
                style={{ width: `${pct}%` }}
                title={`${seg.label}: ${fmtTokens(seg.value)} (${pct.toFixed(1)}%)`}
              />
            ) : null
          })}
        </div>
        <div className="flex flex-wrap gap-4 mt-2">
          {segments.map((seg) => {
            const pct = stats.total > 0 ? (seg.value / stats.total) * 100 : 0
            return (
              <span key={seg.label} className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <span className={cn('inline-block w-2.5 h-2.5 rounded-sm', seg.bar)} />
                {seg.label}
                <span className="text-foreground/70">{pct.toFixed(1)}%</span>
              </span>
            )
          })}
        </div>
      </div>

      {/* 캐시 히트율 */}
      <div>
        <div className="flex items-center justify-between mb-1.5">
          <p className="text-xs text-muted-foreground">캐시 히트율</p>
          <p className="text-sm font-mono font-semibold text-purple-600">
            {stats.cacheHitRate.toFixed(1)}%
          </p>
        </div>
        <div className="h-2.5 rounded-full bg-muted overflow-hidden">
          <div
            className="h-full bg-purple-400 transition-all"
            style={{ width: `${stats.cacheHitRate}%` }}
          />
        </div>
        <p className="text-xs text-muted-foreground mt-1">
          cache_read ÷ (input + cache_creation + cache_read)
        </p>
      </div>
    </div>
  )
}

function calcStats(events: NormalizedEvent[]): TokenStats {
  let input = 0
  let output = 0
  let cacheCreate = 0
  let cacheRead = 0
  let turnCount = 0

  for (const ev of events) {
    const raw = ev.raw as Record<string, unknown>
    if (raw.type !== 'assistant') continue

    const msg = raw.message as { usage?: Record<string, number> } | undefined
    const usage = msg?.usage
    if (!usage) continue

    input += usage.input_tokens ?? 0
    output += usage.output_tokens ?? 0
    cacheCreate += usage.cache_creation_input_tokens ?? 0
    cacheRead += usage.cache_read_input_tokens ?? 0
    turnCount++
  }

  const total = input + output + cacheCreate + cacheRead
  const denom = input + cacheCreate + cacheRead
  const cacheHitRate = denom > 0 ? (cacheRead / denom) * 100 : 0

  return { input, output, cacheCreate, cacheRead, total, cacheHitRate, turnCount }
}

function fmtTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`
  return String(n)
}
