/**
 * 서버 `/api/agent-factory/*` 의 타입 안전 클라이언트.
 * axios(http) + zod 봉투 검증 위에서 동작하며, 실패 시 던지지 않고 빈 값을 돌려준다(방어적).
 *
 * zod 검증 깊이(의도적): 봉투({success,data,error})와 data 의 **컨테이너 형태**(배열/페이지)만
 * 검증한다. 필드 단위 스키마는 서버 Prisma 타입과 중복·drift 위험이 커 두지 않고 TS 타입으로 캐스팅한다.
 */

import { z } from 'zod'
import { http } from '@/shared/api/http'
import { unwrap } from '@/shared/api/response'
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
} from '@/entities/commit-record/model/agentFactory'

// 컨테이너 형태 스키마 — 필드는 통과시키되(passthrough) 배열/객체 골격만 확인한다.
const rowArray = z.array(z.record(z.string(), z.unknown()))
const pageSchema = z.object({
  total: z.number(),
  page: z.number(),
  pageSize: z.number(),
  items: z.array(z.unknown()),
})
const metaSchema = z.object({ projects: z.array(z.unknown()), users: z.array(z.unknown()) })

const EMPTY_PAGE: RecordPage = { total: 0, page: 1, pageSize: 20, items: [] }
const EMPTY_META = { projects: [] as ProjectRef[], users: [] as UserRef[] }

export async function getRecords(f: RecordFilter = {}): Promise<RecordPage> {
  try {
    const res = await http.get('/api/agent-factory/records', {
      params: {
        projectId: f.projectId ?? undefined,
        userId: f.userId ?? undefined,
        agent: f.agent ?? undefined,
        status: f.status ?? undefined,
        from: f.from,
        to: f.to,
        page: f.page,
        pageSize: f.pageSize,
      },
    })
    return unwrap(res, pageSchema, EMPTY_PAGE) as RecordPage
  } catch {
    return EMPTY_PAGE
  }
}

export async function getRecord(id: string): Promise<CommitRecordDetail | null> {
  try {
    const res = await http.get(`/api/agent-factory/records/${encodeURIComponent(id)}`)
    return unwrap(res, z.record(z.string(), z.unknown()).nullable(), null) as CommitRecordDetail | null
  } catch {
    return null
  }
}

/** stats/* 공용 — 행 배열 응답. */
async function getRows<T>(path: string): Promise<T[]> {
  try {
    const res = await http.get(path)
    return unwrap(res, rowArray, []) as T[]
  } catch {
    return []
  }
}

export const getAgentStats = () => getRows<AgentStatRow>('/api/agent-factory/stats/agents')
export const getPluginStats = () => getRows<PluginStatRow>('/api/agent-factory/stats/plugins')
export const getSkillStats = () => getRows<SkillStatRow>('/api/agent-factory/stats/skills')
export const getSignalStats = () => getRows<SignalStatRow>('/api/agent-factory/stats/signals')
export const getFeedbackStats = () => getRows<FeedbackStatRow>('/api/agent-factory/stats/feedback')
export const getDailyTokens = () => getRows<DailyTokenRow>('/api/agent-factory/stats/tokens/daily')

export async function getMeta(): Promise<{ projects: ProjectRef[]; users: UserRef[] }> {
  try {
    const res = await http.get('/api/agent-factory/meta')
    return unwrap(res, metaSchema, EMPTY_META) as { projects: ProjectRef[]; users: UserRef[] }
  } catch {
    return EMPTY_META
  }
}
