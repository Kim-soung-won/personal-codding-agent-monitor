import Database from 'better-sqlite3'
import { SCHEMA_SQL, SCHEMA_VERSION } from './schema.js'

/**
 * 스키마를 적용한다. schema_migrations 테이블이 없으면 전체 DDL 을 트랜잭션으로 적용
 * (실패 시 자동 롤백 → 부분 생성 방지). 이미 있으면 no-op(멱등).
 *
 * 향후 증분 마이그레이션은 SCHEMA_VERSION 을 올리고 여기 버전 분기를 추가한다.
 */
export function migrate(db: Database.Database): void {
  const hasMigrations = db
    .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='schema_migrations'")
    .get()
  if (hasMigrations) return

  const tx = db.transaction(() => {
    db.exec(SCHEMA_SQL)
    db.prepare('INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)').run(
      SCHEMA_VERSION,
      new Date().toISOString(),
    )
  })
  tx()
}
