import { Router } from 'express'
import type { Request, Response } from 'express'
import type { StatsRepository } from '../repositories/stats-repository.js'

function num(v: unknown): number | undefined {
  if (typeof v !== 'string' || v === '') return undefined
  const n = Number(v)
  return Number.isFinite(n) ? n : undefined
}
function str(v: unknown): string | undefined {
  return typeof v === 'string' && v ? v : undefined
}

/** 통계 조회 엔드포인트. 인증은 상위 app.use('/api', requireAuth) 로 이미 적용됨. */
export function createStatsRouter(repo: StatsRepository): Router {
  const router = Router()

  router.get('/resources', async (req: Request, res: Response) => {
    try {
      const data = await repo.resourceCounts({
        projectId: num(req.query.projectId),
        userId: num(req.query.userId),
        kind: str(req.query.kind),
        from: str(req.query.from),
        to: str(req.query.to),
      })
      res.json({ success: true, data })
    } catch (err) {
      res.status(500).json({ success: false, error: String(err) })
    }
  })

  router.get('/plugins', async (req: Request, res: Response) => {
    try {
      const data = await repo.pluginCounts({
        projectId: num(req.query.projectId),
        userId: num(req.query.userId),
        from: str(req.query.from),
        to: str(req.query.to),
      })
      res.json({ success: true, data })
    } catch (err) {
      res.status(500).json({ success: false, error: String(err) })
    }
  })

  router.get('/subagents', async (req: Request, res: Response) => {
    try {
      const data = await repo.subagentResourceUsage({
        subagentType: str(req.query.subagentType),
        projectId: num(req.query.projectId),
        userId: num(req.query.userId),
      })
      res.json({ success: true, data })
    } catch (err) {
      res.status(500).json({ success: false, error: String(err) })
    }
  })

  router.get('/tokens/daily', async (req: Request, res: Response) => {
    try {
      const data = await repo.dailyTokens({
        projectId: num(req.query.projectId),
        userId: num(req.query.userId),
        from: str(req.query.from),
        to: str(req.query.to),
      })
      res.json({ success: true, data })
    } catch (err) {
      res.status(500).json({ success: false, error: String(err) })
    }
  })

  return router
}
