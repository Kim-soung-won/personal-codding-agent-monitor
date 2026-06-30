import { useState, useEffect, useCallback } from 'react'
import type { NormalizedEvent, CostEntry } from '../types/events'

const API_BASE = 'http://localhost:3001'

// Sonnet 4.6 단가 (USD per 1M tokens)
const INPUT_COST_PER_M = 3.0
const OUTPUT_COST_PER_M = 15.0
const CACHE_WRITE_COST_PER_M = 3.75
const CACHE_READ_COST_PER_M = 0.3

interface Props {
  events: NormalizedEvent[]
}

function calcEstimatedCost(events: NormalizedEvent[]): number {
  let input = 0, output = 0, cacheCreate = 0, cacheRead = 0

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
  }

  return (
    (input * INPUT_COST_PER_M +
      output * OUTPUT_COST_PER_M +
      cacheCreate * CACHE_WRITE_COST_PER_M +
      cacheRead * CACHE_READ_COST_PER_M) /
    1_000_000
  )
}

function groupByDate(entries: CostEntry[]): Array<{ date: string; count: number; cost: number }> {
  const map = new Map<string, { count: number; cost: number }>()
  for (const e of entries) {
    const date = e.timestamp.slice(0, 10)
    const cur = map.get(date) ?? { count: 0, cost: 0 }
    map.set(date, { count: cur.count + 1, cost: cur.cost + e.estimated_cost_usd })
  }
  return [...map.entries()]
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([date, v]) => ({ date, ...v }))
}

export function CostPanel({ events }: Props) {
  const [costsData, setCostsData] = useState<CostEntry[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetchCosts = useCallback(() => {
    setLoading(true)
    setError(null)
    fetch(`${API_BASE}/api/costs`)
      .then((r) => r.json())
      .then((res) => {
        if (res.success) setCostsData(res.data ?? [])
        else setError(res.error ?? '오류')
      })
      .catch((e: unknown) => setError(String(e)))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => { fetchCosts() }, [fetchCosts])

  const estimated = calcEstimatedCost(events)
  const byDate = groupByDate(costsData)
  const totalRecorded = costsData.reduce((s, e) => s + e.estimated_cost_usd, 0)

  return (
    <div className="space-y-6 max-w-2xl">
      {/* 클라이언트 추정 비용 (SoT) */}
      <div className="border rounded px-4 py-3">
        <p className="text-xs text-muted-foreground mb-1">현재 세션 추정 비용 (Sonnet 4.6 기준)</p>
        <p className="text-2xl font-mono font-semibold text-rose-600">
          ${estimated.toFixed(6)}
        </p>
        <p className="text-xs text-muted-foreground mt-1">
          input $3/M · output $15/M · cache write $3.75/M · cache read $0.30/M
        </p>
      </div>

      {/* costs.jsonl 참조값 */}
      <div>
        <div className="flex items-center gap-2 mb-2">
          <p className="text-sm font-medium">Claude 내부 기록 참조값</p>
          <span className="text-xs text-muted-foreground">(SoT 아님)</span>
          <button
            onClick={fetchCosts}
            disabled={loading}
            className="ml-auto text-xs border rounded px-2 py-0.5 hover:bg-muted/50 disabled:opacity-40"
          >
            {loading ? '로딩 중…' : '새로고침'}
          </button>
        </div>

        {error && <p className="text-xs text-red-500">{error}</p>}

        {!error && costsData.length === 0 && !loading && (
          <p className="text-xs text-muted-foreground">
            ~/.claude/metrics/costs.jsonl 데이터 없음 (또는 전량 0)
          </p>
        )}

        {byDate.length > 0 && (
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground mb-1">
              합계: ${totalRecorded.toFixed(6)} (현재 전량 0으로 기록됨)
            </p>
            <div className="border rounded overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-muted/50">
                  <tr>
                    <th className="text-left px-3 py-1.5 text-xs font-medium text-muted-foreground">날짜</th>
                    <th className="text-right px-3 py-1.5 text-xs font-medium text-muted-foreground">세션 수</th>
                    <th className="text-right px-3 py-1.5 text-xs font-medium text-muted-foreground">비용 (USD)</th>
                  </tr>
                </thead>
                <tbody>
                  {byDate.map(({ date, count, cost }) => (
                    <tr key={date} className="border-t">
                      <td className="px-3 py-1.5 font-mono text-xs">{date}</td>
                      <td className="px-3 py-1.5 text-right text-xs">{count}</td>
                      <td className="px-3 py-1.5 text-right font-mono text-xs">${cost.toFixed(6)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
