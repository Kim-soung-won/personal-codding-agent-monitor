import type { Kysely } from 'kysely'
import type { DB } from '../db/types.js'

/** 클라이언트 NormalizedEvent 형태에 맞춘 반환 행(raw 는 파싱된 객체). */
export interface EventRow {
  id: string
  sessionId: string
  subAgentId: number | null
  origin: string
  category: string
  type: string | null
  timestamp: string
  summary: string | null
  raw: unknown
}

export interface EventQueryOpts {
  /** 서브에이전트 이벤트 포함 여부 (기본 true). false 면 메인 스레드만. */
  includeSubagents?: boolean
}

export interface EventRepository {
  listEventsForSession(sessionId: string, opts?: EventQueryOpts): Promise<EventRow[]>
}

export class KyselyEventRepository implements EventRepository {
  constructor(private readonly db: Kysely<DB>) {}

  async listEventsForSession(
    sessionId: string,
    opts: EventQueryOpts = {},
  ): Promise<EventRow[]> {
    const includeSubagents = opts.includeSubagents ?? true
    const rows = await this.db
      .selectFrom('events')
      .selectAll()
      .where('session_id', '=', sessionId)
      .$if(!includeSubagents, (qb) => qb.where('sub_agent_id', 'is', null))
      .orderBy('timestamp', 'asc')
      .execute()

    return rows.map((r) => ({
      id: r.id,
      sessionId: r.session_id,
      subAgentId: r.sub_agent_id,
      origin: r.origin,
      category: r.category,
      type: r.type,
      timestamp: r.timestamp,
      summary: r.summary,
      raw: safeParse(r.raw),
    }))
  }
}

function safeParse(text: string): unknown {
  try {
    return JSON.parse(text)
  } catch {
    return null
  }
}
