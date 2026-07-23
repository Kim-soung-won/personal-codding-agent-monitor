import { describe, it, expect } from 'vitest'
import Database from 'better-sqlite3'
import { migrate } from '../../db/migrate.js'

const TABLES = [
  'schema_migrations', 'users', 'projects', 'plugins', 'sessions',
  'sub_agents', 'events', 'resource_invocations', 'usage', 'source_files',
]
const VIEWS = ['v_resource_counts', 'v_subagent_resource_usage', 'v_daily_tokens', 'v_plugin_counts']

describe('migrate', () => {
  it('10개 테이블 + 4개 뷰를 생성한다', () => {
    const db = new Database(':memory:')
    migrate(db)
    const names = (type: string) =>
      db.prepare(`SELECT name FROM sqlite_master WHERE type='${type}'`).all().map((r: any) => r.name)
    for (const t of TABLES) expect(names('table')).toContain(t)
    for (const v of VIEWS) expect(names('view')).toContain(v)
    const version = db.prepare('SELECT version FROM schema_migrations').get() as { version: number }
    expect(version.version).toBe(1)
    db.close()
  })

  it('재호출은 예외 없이 no-op(멱등)', () => {
    const db = new Database(':memory:')
    migrate(db)
    expect(() => migrate(db)).not.toThrow()
    const count = db.prepare('SELECT count(*) c FROM schema_migrations').get() as { c: number }
    expect(count.c).toBe(1)
    db.close()
  })
})
