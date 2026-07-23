import Database from 'better-sqlite3'
import { Kysely, SqliteDialect } from 'kysely'
import type { DB } from './types.js'
import { migrate } from './migrate.js'

/**
 * SQLite 파일을 열고 스키마를 적용한 뒤 Kysely 인스턴스를 반환한다.
 *
 * foreign_keys 는 연결마다 켜야 하고(스키마 PRAGMA 는 exec 1회성), WAL 로 읽기 중 쓰기
 * 경합을 줄인다. Postgres 전환 시 이 함수만 PostgresDialect 로 교체하면 된다.
 */
export function createDb(dbPath: string): Kysely<DB> {
  const sqlite = new Database(dbPath)
  sqlite.pragma('journal_mode = WAL')
  sqlite.pragma('foreign_keys = ON')
  migrate(sqlite)
  return new Kysely<DB>({ dialect: new SqliteDialect({ database: sqlite }) })
}
