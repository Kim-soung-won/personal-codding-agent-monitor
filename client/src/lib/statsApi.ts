/**
 * 서버 DB 집계 엔드포인트(/api/stats/*, /api/db/*)의 타입 안전 클라이언트.
 * apiFetch(Bearer 자동) 위에서만 동작. 실패({success:false}/네트워크) 시 빈 배열/기본값 반환(방어적).
 */

import { apiFetch } from './config'
import type {
  ResourceCountRow,
  PluginCountRow,
  SubagentUsageRow,
  DailyTokenRow,
  DbSessionRow,
  DbEventRow,
  ProjectRow,
  UserRow,
  StatsFilter,
} from '../types/stats'

/** 필터를 쿼리스트링으로. null/undefined/'' 는 생략. */
function qs(params: Record<string, string | number | null | undefined>): string {
  const sp = new URLSearchParams()
  for (const [k, v] of Object.entries(params)) {
    if (v == null || v === '') continue
    sp.set(k, String(v))
  }
  const s = sp.toString()
  return s ? `?${s}` : ''
}

async function getList<T>(path: string): Promise<T[]> {
  try {
    const res = await apiFetch(path)
    if (!res.ok) return []
    const json = await res.json()
    return json.success ? (json.data as T[]) : []
  } catch {
    return []
  }
}

function statsQuery(f: StatsFilter): string {
  return qs({
    projectId: f.projectId ?? undefined,
    userId: f.userId ?? undefined,
    from: f.from,
    to: f.to,
    kind: f.kind ?? undefined,
    subagentType: f.subagentType ?? undefined,
  })
}

export function getResourceCounts(f: StatsFilter = {}): Promise<ResourceCountRow[]> {
  return getList<ResourceCountRow>(`/api/stats/resources${statsQuery(f)}`)
}

export function getPluginCounts(f: StatsFilter = {}): Promise<PluginCountRow[]> {
  return getList<PluginCountRow>(`/api/stats/plugins${statsQuery(f)}`)
}

export function getSubagentUsage(f: StatsFilter = {}): Promise<SubagentUsageRow[]> {
  return getList<SubagentUsageRow>(`/api/stats/subagents${statsQuery(f)}`)
}

export function getDailyTokens(f: StatsFilter = {}): Promise<DailyTokenRow[]> {
  return getList<DailyTokenRow>(`/api/stats/tokens/daily${statsQuery(f)}`)
}

export function getDbSessions(
  f: { projectId?: number | null; userId?: number | null } = {},
): Promise<DbSessionRow[]> {
  return getList<DbSessionRow>(
    `/api/db/sessions${qs({ projectId: f.projectId ?? undefined, userId: f.userId ?? undefined })}`,
  )
}

export function getDbSessionEvents(
  sessionId: string,
  opts: { includeSubagents?: boolean } = {},
): Promise<DbEventRow[]> {
  const q = opts.includeSubagents === false ? '?includeSubagents=false' : ''
  return getList<DbEventRow>(`/api/db/sessions/${encodeURIComponent(sessionId)}/events${q}`)
}

export function getProjects(): Promise<ProjectRow[]> {
  return getList<ProjectRow>('/api/db/projects')
}

export function getUsers(): Promise<UserRow[]> {
  return getList<UserRow>('/api/db/users')
}
