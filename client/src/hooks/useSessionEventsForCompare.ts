import { useState, useEffect, useRef } from 'react'
import { useWebSocket } from '@/hooks/useWebSocket'
import { apiFetch } from '@/shared/api/config'
import type { NormalizedEvent } from '@/types/events'

const MAX_BUFFER = 500

export function useSessionEventsForCompare(sessionId: string | null): {
  events: NormalizedEvent[]
  loading: boolean
} {
  const [historicalEvents, setHistoricalEvents] = useState<NormalizedEvent[]>([])
  const [loading, setLoading] = useState(false)
  const { events: liveEvents, clearEvents } = useWebSocket(sessionId ? [sessionId] : [])
  const abortRef = useRef<AbortController | null>(null)

  useEffect(() => {
    clearEvents()
    setHistoricalEvents([])

    if (!sessionId) return

    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller

    setLoading(true)
    apiFetch(`/api/sessions/${sessionId}/events`, { signal: controller.signal })
      .then((r) => r.json())
      .then((res) => {
        if (controller.signal.aborted) return
        if (res.success) setHistoricalEvents((res.data as NormalizedEvent[]).slice(-MAX_BUFFER))
      })
      .catch(() => {})
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false)
      })

    return () => controller.abort()
  }, [sessionId, clearEvents])

  const seenIds = new Set(historicalEvents.map((e) => e.id))
  const events = [...historicalEvents, ...liveEvents.filter((e) => !seenIds.has(e.id))]

  return { events, loading }
}
