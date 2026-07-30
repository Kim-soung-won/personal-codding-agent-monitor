import { apiFetch } from '@/shared/api/config'
import type { NormalizedEvent } from '@/entities/session/model/events'

/** 한 세션의 이벤트를 시간 오름차순으로 조회한다. 실패 시 빈 배열(방어적). */
export async function fetchSessionEvents(sessionId: string): Promise<NormalizedEvent[]> {
  const res = await apiFetch(`/api/sessions/${sessionId}/events`)
  const json = await res.json()
  if (!json.success) return []
  return (json.data as NormalizedEvent[])
    .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())
}
