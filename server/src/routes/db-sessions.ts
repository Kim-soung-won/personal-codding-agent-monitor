import { Router } from 'express'
import type { Request, Response } from 'express'
import type { SessionRepository } from '../repositories/session-repository.js'
import type { EventRepository } from '../repositories/event-repository.js'

function num(v: unknown): number | undefined {
  if (typeof v !== 'string' || v === '') return undefined
  const n = Number(v)
  return Number.isFinite(n) ? n : undefined
}

/**
 * DB 기반 세션 조회 (기존 파일 기반 /api/sessions 와 분리된 /api/db/sessions 네임스페이스).
 * 점진 전환용 — 기존 엔드포인트는 그대로 둔다.
 */
export function createDbSessionsRouter(
  sessionRepo: SessionRepository,
  eventRepo: EventRepository,
): Router {
  const router = Router()

  router.get('/', async (req: Request, res: Response) => {
    try {
      const data = await sessionRepo.listSessions({
        projectId: num(req.query.projectId),
        userId: num(req.query.userId),
      })
      res.json({ success: true, data })
    } catch (err) {
      res.status(500).json({ success: false, error: String(err) })
    }
  })

  router.get('/:sessionId/events', async (req: Request, res: Response) => {
    try {
      const includeSubagents = req.query.includeSubagents !== 'false'
      const data = await eventRepo.listEventsForSession(req.params.sessionId, { includeSubagents })
      res.json({ success: true, data })
    } catch (err) {
      res.status(500).json({ success: false, error: String(err) })
    }
  })

  return router
}
