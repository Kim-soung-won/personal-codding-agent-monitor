/**
 * 서버 `/api/agent-factory/*` 의 타입 안전 클라이언트.
 * apiFetch(Bearer 자동) 위에서만 동작하며, 실패 시 던지지 않고 빈 값을 돌려준다(방어적).
 */

import { apiFetch } from '@/lib/config'
import type {
  AgentStatRow,
  CommitRecordDetail,
  DailyTokenRow,
  FeedbackStatRow,
  PluginStatRow,
  SkillStatRow,
  ProjectRef,
  RecordFilter,
  RecordPage,
  SignalStatRow,
  UserRef,
} from '@/types/agentFactory'

function qs(params: Record<string, string | number | null | undefined>): string {
  const sp = new URLSearchParams()
  for (const [k, v] of Object.entries(params)) {
    if (v == null || v === '') continue
    sp.set(k, String(v))
  }
  const s = sp.toString()
  return s ? `?${s}` : ''
}

async function get<T>(path: string, fallback: T): Promise<T> {
  try {
    const res = await apiFetch(path)
    if (!res.ok) return fallback
    const json = await res.json()
    return json.success ? (json.data as T) : fallback
  } catch {
    return fallback
  }
}

const EMPTY_PAGE: RecordPage = { total: 0, page: 1, pageSize: 20, items: [] }

export function getRecords(f: RecordFilter = {}): Promise<RecordPage> {
  return get<RecordPage>(
    `/api/agent-factory/records${qs({
      projectId: f.projectId ?? undefined,
      userId: f.userId ?? undefined,
      agent: f.agent ?? undefined,
      status: f.status ?? undefined,
      from: f.from,
      to: f.to,
      page: f.page,
      pageSize: f.pageSize,
    })}`,
    EMPTY_PAGE,
  )
}

export function getRecord(id: string): Promise<CommitRecordDetail | null> {
  return get<CommitRecordDetail | null>(
    `/api/agent-factory/records/${encodeURIComponent(id)}`,
    null,
  )
}

export function getAgentStats(): Promise<AgentStatRow[]> {
  return get<AgentStatRow[]>('/api/agent-factory/stats/agents', [])
}

export function getPluginStats(): Promise<PluginStatRow[]> {
  return get<PluginStatRow[]>('/api/agent-factory/stats/plugins', [])
}

export function getSkillStats(): Promise<SkillStatRow[]> {
  return get<SkillStatRow[]>('/api/agent-factory/stats/skills', [])
}

export function getSignalStats(): Promise<SignalStatRow[]> {
  return get<SignalStatRow[]>('/api/agent-factory/stats/signals', [])
}

export function getFeedbackStats(): Promise<FeedbackStatRow[]> {
  return get<FeedbackStatRow[]>('/api/agent-factory/stats/feedback', [])
}

export function getDailyTokens(): Promise<DailyTokenRow[]> {
  return get<DailyTokenRow[]>('/api/agent-factory/stats/tokens/daily', [])
}

export function getMeta(): Promise<{ projects: ProjectRef[]; users: UserRef[] }> {
  return get<{ projects: ProjectRef[]; users: UserRef[] }>('/api/agent-factory/meta', {
    projects: [],
    users: [],
  })
}
