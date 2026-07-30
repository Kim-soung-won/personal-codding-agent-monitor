import { queryOptions } from '@tanstack/react-query'
import { fetchSessions } from '@/entities/session/api/fetchSessions'
import {
  fetchSessionEvents,
  fetchManySessionEvents,
} from '@/entities/session/api/fetchSessionEvents'

/**
 * session(로컬 JSONL 뷰어) 도메인 react-query 옵션. WebSocket 구독(useWebSocket)은 쿼리가
 * 아니라 별도로 둔다 — 이건 히스토리 조회(REST)만 다룬다.
 */
const KEY = ['session'] as const

export const sessionQueries = {
  list: () => queryOptions({ queryKey: [...KEY, 'list'], queryFn: fetchSessions }),
  events: (sessionId: string) =>
    queryOptions({
      queryKey: [...KEY, 'events', sessionId],
      queryFn: () => fetchSessionEvents(sessionId),
    }),
  // 여러 세션 병합 — 프로젝트 집계·Analytics. 키는 정렬된 id 목록으로 안정화.
  manyEvents: (sessionIds: string[]) =>
    queryOptions({
      queryKey: [...KEY, 'many-events', [...sessionIds].sort()],
      queryFn: () => fetchManySessionEvents(sessionIds),
      enabled: sessionIds.length > 0,
    }),
}
