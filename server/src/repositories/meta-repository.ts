import type { Kysely, Selectable } from 'kysely'
import type { DB } from '../db/types.js'

export type ProjectRow = Selectable<DB['projects']>
export type UserRow = Selectable<DB['users']>

/** 필터 드롭다운용 차원 조회(프로젝트·유저 라벨). */
export interface MetaRepository {
  listProjects(): Promise<ProjectRow[]>
  listUsers(): Promise<UserRow[]>
}

export class KyselyMetaRepository implements MetaRepository {
  constructor(private readonly db: Kysely<DB>) {}

  async listProjects(): Promise<ProjectRow[]> {
    return this.db.selectFrom('projects').selectAll().orderBy('name', 'asc').execute()
  }

  async listUsers(): Promise<UserRow[]> {
    return this.db.selectFrom('users').selectAll().orderBy('identifier', 'asc').execute()
  }
}
