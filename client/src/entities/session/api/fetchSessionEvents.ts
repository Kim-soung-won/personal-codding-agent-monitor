import { z } from 'zod'
import { http } from '@/shared/api/http'
import { unwrap } from '@/shared/api/response'
import type { NormalizedEvent } from '@/entities/session/model/events'

/** 한 세션의 이벤트를 시간 오름차순으로 조회한다. 실패 시 빈 배열(방어적). */
export async function fetchSessionEvents(sessionId: string): Promise<NormalizedEvent[]> {
  try {
    const res = await http.get(`/api/sessions/${sessionId}/events`)
    const events = unwrap(res, z.array(z.record(z.string(), z.unknown())), []) as unknown as NormalizedEvent[]
    return events.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())
  } catch {
    return []
  }
}

/** 여러 세션의 이벤트를 병합·중복 제거해 시간순으로 반환한다(프로젝트 집계·Analytics 용). */
export async function fetchManySessionEvents(sessionIds: string[]): Promise<NormalizedEvent[]> {
  const results = await Promise.all(sessionIds.map((id) => fetchSessionEvents(id).catch(() => [])))
  const merged = results
    .flat()
    .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())
  const seen = new Set<string>()
  return merged.filter((e) => {
    if (seen.has(e.id)) return false
    seen.add(e.id)
    return true
  })
}
