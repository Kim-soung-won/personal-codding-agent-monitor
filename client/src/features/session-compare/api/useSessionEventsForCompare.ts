import { useQuery } from '@tanstack/react-query'
import { useWebSocket, sessionQueries } from '@/entities/session'
import type { NormalizedEvent } from '@/entities/session'

const MAX_BUFFER = 500

/**
 * 세션 비교용 훅 — 히스토리(react-query)와 라이브(WebSocket)를 합친다.
 * 히스토리 조회의 abort·중복요청은 react-query 가 sessionId 키로 처리한다.
 */
export function useSessionEventsForCompare(sessionId: string | null): {
  events: NormalizedEvent[]
  loading: boolean
} {
  const { events: liveEvents } = useWebSocket(sessionId ? [sessionId] : [])
  const { data = [], isPending } = useQuery({
    ...sessionQueries.events(sessionId ?? ''),
    enabled: !!sessionId,
  })
  const loading = !!sessionId && isPending

  const historicalEvents = data.slice(-MAX_BUFFER)
  const seenIds = new Set(historicalEvents.map((e) => e.id))
  const events = [...historicalEvents, ...liveEvents.filter((e) => !seenIds.has(e.id))]

  return { events, loading }
}
