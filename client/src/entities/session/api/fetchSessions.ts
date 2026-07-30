import { z } from 'zod'
import { http } from '@/shared/api/http'
import { unwrap } from '@/shared/api/response'
import type { SessionInfo } from '@/entities/session/model/events'

/** 로컬 파일 모드의 세션 목록을 조회한다. 실패 시 빈 배열(방어적). */
export async function fetchSessions(): Promise<SessionInfo[]> {
  try {
    const res = await http.get('/api/sessions')
    return unwrap(res, z.array(z.record(z.string(), z.unknown())), []) as unknown as SessionInfo[]
  } catch {
    return []
  }
}
