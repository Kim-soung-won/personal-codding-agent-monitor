import { useMemo } from 'react'
import type { NormalizedEvent } from '@/types/events'

interface SessionSummaryItem {
  hookName: string
  content: string
  timestamp: string
}

export function useSessionSummary(events: NormalizedEvent[]): SessionSummaryItem[] {
  return useMemo(() => {
    const results: SessionSummaryItem[] = []

    for (const ev of events) {
      if (ev.category !== 'context-injection') continue

      const raw = ev.raw as Record<string, unknown>
      if (raw.type !== 'attachment') continue

      const att = raw.attachment as Record<string, unknown> | undefined
      if (att?.type !== 'hook_success') continue

      const hookName = String(att.hookName ?? '')
      if (!hookName.includes('SessionStart')) continue

      const stdout = att.stdout
      if (typeof stdout !== 'string' || !stdout.trim()) continue

      try {
        const parsed = JSON.parse(stdout) as Record<string, unknown>
        const specific = parsed.hookSpecificOutput as Record<string, unknown> | undefined
        const context = specific?.additionalContext
        if (typeof context === 'string' && context.trim()) {
          results.push({ hookName, content: context, timestamp: ev.timestamp })
        }
      } catch {
        // stdout 파싱 실패 — skip
      }
    }

    return results
  }, [events])
}
