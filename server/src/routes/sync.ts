import { mkdir, rename, writeFile, stat } from 'node:fs/promises'
import { join } from 'node:path'
import express, { Router } from 'express'
import type { Request, Response } from 'express'
import type { Kysely } from 'kysely'
import type { DB } from '../db/types.js'
import {
  ingestSessionFile,
  ingestSubagentFile,
  type Identity,
} from '../ingest/session-ingest-service.js'

export interface SyncDeps {
  db: Kysely<DB>
}

/**
 * 경로 세그먼트 안전성 검사. `/`, `\`, `..`, 널바이트를 포함하거나 비면 거부한다.
 */
function isSafeSegment(seg: string): boolean {
  if (!seg || seg === '.' || seg === '..') return false
  return !/[\\/\0]/.test(seg) && !seg.includes('..')
}

/** 임시 파일에 쓴 뒤 rename 으로 원자적 교체한다. */
async function atomicWrite(targetPath: string, data: string): Promise<void> {
  const tmpPath = `${targetPath}.${process.pid}.tmp`
  await writeFile(tmpPath, data, 'utf8')
  await rename(tmpPath, targetPath)
}

/** X-User-* 헤더에서 업로드 신원을 읽는다. */
function readIdentity(req: Request): Identity | undefined {
  const email = req.headers['x-user-email']
  if (typeof email !== 'string' || !email) return undefined
  const name = req.headers['x-user-name']
  return { email, name: typeof name === 'string' && name ? name : undefined }
}

/**
 * 로컬 sync 잡이 데이터를 밀어 넣는 업로드 라우터.
 *
 * additive-only: 삭제 엔드포인트는 의도적으로 없다. 파일 저장(백업) 성공 후 DB ingest 는
 * best-effort — ingest 실패는 500 이 아니라 { ingested: false } 로만 응답한다(원본은 보존됨).
 */
export function createSyncRouter(dataDir: string, deps: SyncDeps): Router {
  const router = Router()

  router.put(
    '/session/:encoded/:sessionId',
    express.text({ limit: '20mb', type: '*/*' }),
    async (req: Request, res: Response): Promise<void> => {
      const { encoded, sessionId } = req.params
      if (!isSafeSegment(encoded) || !isSafeSegment(sessionId)) {
        res.status(400).json({ success: false, error: 'invalid path segment' })
        return
      }
      if (typeof req.body !== 'string' || req.body.length === 0) {
        res.status(400).json({ success: false, error: 'empty body' })
        return
      }
      const target = join(dataDir, encoded, `${sessionId}.jsonl`)
      try {
        await mkdir(join(dataDir, encoded), { recursive: true })
        await atomicWrite(target, req.body)
      } catch (err) {
        res.status(500).json({ success: false, error: String(err) })
        return
      }
      // 파일 저장 성공 → ingest 는 best-effort
      let ingested = false
      let ingestError: string | undefined
      try {
        const { mtimeMs } = await stat(target)
        ingested = await ingestSessionFile(deps.db, {
          encoded,
          sessionId,
          text: req.body,
          mtimeMs,
          filePath: target,
          identity: readIdentity(req),
        })
      } catch (err) {
        ingestError = String(err)
      }
      res.json({ success: true, ingested, ...(ingestError ? { ingestError } : {}) })
    },
  )

  router.put(
    '/subagent/:encoded/:sessionId/:agentFile',
    express.text({ limit: '20mb', type: '*/*' }),
    async (req: Request, res: Response): Promise<void> => {
      const { encoded, sessionId, agentFile } = req.params
      if (
        !isSafeSegment(encoded) ||
        !isSafeSegment(sessionId) ||
        !isSafeSegment(agentFile) ||
        !agentFile.endsWith('.jsonl')
      ) {
        res.status(400).json({ success: false, error: 'invalid path segment' })
        return
      }
      if (typeof req.body !== 'string' || req.body.length === 0) {
        res.status(400).json({ success: false, error: 'empty body' })
        return
      }
      const target = join(dataDir, encoded, sessionId, 'subagents', agentFile)
      try {
        await mkdir(join(dataDir, encoded, sessionId, 'subagents'), { recursive: true })
        await atomicWrite(target, req.body)
      } catch (err) {
        res.status(500).json({ success: false, error: String(err) })
        return
      }
      let ingested = false
      let ingestError: string | undefined
      try {
        const { mtimeMs } = await stat(target)
        ingested = await ingestSubagentFile(deps.db, {
          encoded,
          sessionId,
          agentFile,
          text: req.body,
          mtimeMs,
          filePath: target,
        })
      } catch (err) {
        ingestError = String(err)
      }
      res.json({ success: true, ingested, ...(ingestError ? { ingestError } : {}) })
    },
  )

  // manifest 업로드 — encoded → projectPath 맵 전체 교체 (DB 무관, 파일만)
  router.put('/manifest', async (req: Request, res: Response): Promise<void> => {
    if (!req.body || typeof req.body !== 'object') {
      res.status(400).json({ success: false, error: 'expected JSON object' })
      return
    }
    try {
      await mkdir(dataDir, { recursive: true })
      await atomicWrite(join(dataDir, 'manifest.json'), JSON.stringify(req.body, null, 2))
      res.json({ success: true })
    } catch (err) {
      res.status(500).json({ success: false, error: String(err) })
    }
  })

  // 세션 요약 사이드카 업로드 — 파일 저장 + sessions.description 베스트에포트 갱신
  router.put('/summary/:sessionId', async (req: Request, res: Response): Promise<void> => {
    const { sessionId } = req.params
    const encoded = typeof req.query.encoded === 'string' ? req.query.encoded : ''
    if (!isSafeSegment(encoded) || !isSafeSegment(sessionId)) {
      res.status(400).json({ success: false, error: 'invalid path segment' })
      return
    }
    if (!req.body || typeof req.body !== 'object') {
      res.status(400).json({ success: false, error: 'expected JSON object' })
      return
    }
    try {
      const projectDir = join(dataDir, encoded)
      await mkdir(projectDir, { recursive: true })
      await atomicWrite(
        join(projectDir, `${sessionId}.summary.json`),
        JSON.stringify(req.body, null, 2),
      )
    } catch (err) {
      res.status(500).json({ success: false, error: String(err) })
      return
    }
    // 세션 행이 이미 있으면 description 갱신(없으면 다음 메인 파일 ingest 때 사이드카로 반영)
    const description = (req.body as Record<string, unknown>).description
    if (typeof description === 'string') {
      try {
        await deps.db
          .updateTable('sessions')
          .set({ description })
          .where('id', '=', sessionId)
          .execute()
      } catch {
        // 베스트에포트 — 무시
      }
    }
    res.json({ success: true })
  })

  return router
}
