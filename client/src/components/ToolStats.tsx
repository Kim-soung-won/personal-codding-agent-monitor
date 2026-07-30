import { useMemo } from 'react'
import type { NormalizedEvent } from '@/types/events'

interface Props {
  events: NormalizedEvent[]
}

export function ToolStats({ events }: Props) {
  const stats = useMemo(() => {
    const counts = new Map<string, number>()

    for (const ev of events) {
      const raw = ev.raw as Record<string, unknown>
      if (raw.type !== 'assistant') continue

      const msg = raw.message as { content?: Array<Record<string, unknown>> } | undefined
      for (const item of msg?.content ?? []) {
        if (item.type === 'tool_use' && typeof item.name === 'string') {
          counts.set(item.name, (counts.get(item.name) ?? 0) + 1)
        }
      }
    }

    return [...counts.entries()].sort((a, b) => b[1] - a[1])
  }, [events])

  const total = stats.reduce((sum, [, n]) => sum + n, 0)

  if (total === 0) {
    return (
      <p className="text-sm text-muted-foreground py-12 text-center">
        tool_use 이벤트 없음
      </p>
    )
  }

  return (
    <div className="space-y-4 max-w-xl">
      <p className="text-xs text-muted-foreground">총 {total}회 호출</p>
      <div className="space-y-2">
        {stats.map(([name, count]) => {
          const pct = total > 0 ? (count / total) * 100 : 0
          return (
            <div key={name} className="space-y-0.5">
              <div className="flex items-center justify-between text-sm">
                <span className="font-mono">{name}</span>
                <span className="text-muted-foreground">
                  {count}회 <span className="text-xs">({pct.toFixed(1)}%)</span>
                </span>
              </div>
              <div className="h-2 rounded bg-muted overflow-hidden">
                <div className="h-full bg-blue-400" style={{ width: `${pct}%` }} />
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
