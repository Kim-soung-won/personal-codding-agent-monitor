/**
 * 기존 파일(DB 도입 이전에 저장된 jsonl)을 DB 로 소급 적재하는 CLI 스크립트.
 *
 *   CLAUDE_DATA_DIR=/data/projects DB_PATH=/data/observer.db tsx src/db/backfill.ts
 *
 * ingest 는 '업로드 시점'에만 트리거되므로, 배포 이전 파일은 이 스크립트로 채운다.
 * source_files mtime 가드 덕에 반복 실행해도 멱등하며, 'DB 삭제 후 전체 재구성' 롤백의 실행 도구다.
 */

import { readFile, stat } from 'node:fs/promises'
import { basename, join } from 'node:path'
import { homedir } from 'node:os'
import { createDb } from './client.js'
import { scanSessions } from '../scanner/index.js'
import { ingestSessionFile, ingestSubagentFile } from '../ingest/session-ingest-service.js'

const DATA_DIR = process.env.CLAUDE_DATA_DIR ?? join(homedir(), '.claude', 'projects')
const DB_PATH = process.env.DB_PATH ?? join(DATA_DIR, 'observer.db')

async function main(): Promise<void> {
  const db = createDb(DB_PATH)
  const sessions = await scanSessions(DATA_DIR)
  let mainCount = 0
  let subCount = 0

  for (const session of sessions) {
    // 메인 파일 먼저 — 서브에이전트 spawn 연결이 부모 resource_invocations 를 참조하므로
    try {
      const text = await readFile(session.filePath, 'utf8')
      const { mtimeMs } = await stat(session.filePath)
      const done = await ingestSessionFile(db, {
        encoded: session.projectEncoded,
        sessionId: session.sessionId,
        text,
        mtimeMs,
        filePath: session.filePath,
      })
      if (done) mainCount++
    } catch (err) {
      console.error(`[backfill] 메인 실패 ${session.filePath}:`, err)
    }

    for (const sub of session.subagentFilePaths) {
      try {
        const text = await readFile(sub, 'utf8')
        const { mtimeMs } = await stat(sub)
        const done = await ingestSubagentFile(db, {
          encoded: session.projectEncoded,
          sessionId: session.sessionId,
          agentFile: basename(sub),
          text,
          mtimeMs,
          filePath: sub,
        })
        if (done) subCount++
      } catch (err) {
        console.error(`[backfill] 서브에이전트 실패 ${sub}:`, err)
      }
    }
  }

  console.log(`[backfill] 완료 — 세션 ${mainCount}개, 서브에이전트 ${subCount}개 적재`)
  await db.destroy()
}

main().catch((err) => {
  console.error('[backfill] 실패:', err)
  process.exit(1)
})
