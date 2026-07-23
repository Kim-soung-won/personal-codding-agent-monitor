import type { Kysely } from 'kysely'
import type { DB } from '../db/types.js'

/**
 * 이미 같은(또는 더 최신) mtime 으로 적재된 파일이면 true → ingest 스킵(증분·멱등).
 */
export async function shouldSkip(
  db: Kysely<DB>,
  filePath: string,
  mtimeMs: number,
): Promise<boolean> {
  const row = await db
    .selectFrom('source_files')
    .select('mtime_ms')
    .where('path', '=', filePath)
    .executeTakeFirst()
  return row != null && row.mtime_ms >= mtimeMs
}

/** 적재 완료를 기록(UPSERT). 트랜잭션 executor(trx) 를 넘겨 호출한다. */
export async function markIngested(
  db: Kysely<DB>,
  filePath: string,
  sessionId: string,
  origin: 'main' | 'subagent',
  mtimeMs: number,
): Promise<void> {
  const ingestedAt = new Date().toISOString()
  await db
    .insertInto('source_files')
    .values({ path: filePath, session_id: sessionId, origin, mtime_ms: mtimeMs, ingested_at: ingestedAt })
    .onConflict((oc) =>
      oc.column('path').doUpdateSet({ mtime_ms: mtimeMs, ingested_at: ingestedAt, session_id: sessionId, origin }),
    )
    .execute()
}
