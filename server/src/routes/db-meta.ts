import { Router } from 'express'
import type { Request, Response } from 'express'
import type { MetaRepository } from '../repositories/meta-repository.js'

/** 필터 차원(프로젝트·유저) 조회. /api/db 하위에 마운트. */
export function createDbMetaRouter(repo: MetaRepository): Router {
  const router = Router()

  router.get('/projects', async (_req: Request, res: Response) => {
    try {
      res.json({ success: true, data: await repo.listProjects() })
    } catch (err) {
      res.status(500).json({ success: false, error: String(err) })
    }
  })

  router.get('/users', async (_req: Request, res: Response) => {
    try {
      res.json({ success: true, data: await repo.listUsers() })
    } catch (err) {
      res.status(500).json({ success: false, error: String(err) })
    }
  })

  return router
}
