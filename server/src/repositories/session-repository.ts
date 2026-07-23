import type { Kysely, Selectable } from 'kysely'
import type { DB } from '../db/types.js'

export type SessionRow = Selectable<DB['sessions']>

export interface SessionFilter {
  projectId?: number
  userId?: number
}

export interface SessionRepository {
  listSessions(filter?: SessionFilter): Promise<SessionRow[]>
  getSession(id: string): Promise<SessionRow | null>
}

export class KyselySessionRepository implements SessionRepository {
  constructor(private readonly db: Kysely<DB>) {}

  async listSessions(filter: SessionFilter = {}): Promise<SessionRow[]> {
    return this.db
      .selectFrom('sessions')
      .selectAll()
      .$if(filter.projectId != null, (qb) => qb.where('project_id', '=', filter.projectId!))
      .$if(filter.userId != null, (qb) => qb.where('user_id', '=', filter.userId!))
      .orderBy('last_activity_at', 'desc')
      .execute()
  }

  async getSession(id: string): Promise<SessionRow | null> {
    const row = await this.db
      .selectFrom('sessions')
      .selectAll()
      .where('id', '=', id)
      .executeTakeFirst()
    return row ?? null
  }
}
