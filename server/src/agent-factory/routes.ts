import { Router } from 'express'
import type { PrismaClient, Prisma, ResourceKind } from '@prisma/client'
import { ingestRecord, type IncomingRecord, type IngestResult } from './record-service.js'

/** 목록 페이지 크기 상한 — 훅이 실수로 큰 값을 보내도 DB 를 훑지 않게 막는다. */
const MAX_PAGE_SIZE = 100
const DEFAULT_PAGE_SIZE = 20
/** 한 번에 받을 기록 수 상한. 훅은 보통 1~5건을 민다. */
const MAX_BATCH = 50

function toInt(value: unknown, fallback: number): number {
  const n = Number(value)
  return Number.isFinite(n) ? n : fallback
}

export function createAgentFactoryRouter(prisma: PrismaClient): Router {
  const router = Router()

  /**
   * 훅이 `.agent-factory/sessions/*.md` 를 밀어넣는 입구.
   *
   * 부분 실패를 허용한다: 한 건이 깨져도 나머지는 적재하고 건별 결과를 돌려준다.
   * 훅은 이 결과를 보고 전송 완료를 표시하므로, 전부-아니면-전무로 처리하면
   * 기록 하나가 영원히 재전송되는 루프에 빠진다.
   */
  router.post('/records', async (req, res) => {
    const body = req.body as { records?: IncomingRecord[] } | undefined
    const records = body?.records

    if (!Array.isArray(records) || records.length === 0) {
      res.status(400).json({ success: false, error: 'records 배열이 필요하다' })
      return
    }
    if (records.length > MAX_BATCH) {
      res.status(413).json({ success: false, error: `한 번에 최대 ${MAX_BATCH}건까지 보낸다` })
      return
    }

    const results: IngestResult[] = []
    for (const incoming of records) {
      if (!incoming?.markdown || !incoming?.projectPath) {
        results.push({
          outcome: 'skipped',
          commitSha: null,
          revision: 1,
          recordId: null,
          warnings: [],
          reason: 'markdown 과 projectPath 는 필수다',
        })
        continue
      }
      try {
        results.push(await ingestRecord(prisma, incoming))
      } catch (err) {
        results.push({
          outcome: 'skipped',
          commitSha: null,
          revision: 1,
          recordId: null,
          warnings: [],
          reason: String(err),
        })
      }
    }

    const tally = results.reduce<Record<string, number>>((acc, r) => {
      acc[r.outcome] = (acc[r.outcome] ?? 0) + 1
      return acc
    }, {})

    res.json({ success: true, data: { tally, results } })
  })

  /** 커밋 기록 목록. 대시보드 기본 화면. */
  router.get('/records', async (req, res) => {
    try {
      const take = Math.min(toInt(req.query.pageSize, DEFAULT_PAGE_SIZE), MAX_PAGE_SIZE)
      const skip = Math.max(toInt(req.query.page, 1) - 1, 0) * take

      const where: Prisma.CommitRecordWhereInput = {}
      if (req.query.projectId) where.projectId = toInt(req.query.projectId, 0)
      if (req.query.userId) where.userId = toInt(req.query.userId, 0)
      if (req.query.sessionId) where.sessionId = String(req.query.sessionId)
      if (req.query.status) where.status = String(req.query.status) as Prisma.EnumRecordStatusFilter['equals']
      // 특정 에이전트가 쓰인 커밋만 보기
      if (req.query.agent) where.agents = { some: { agent: String(req.query.agent) } }

      const from = req.query.from ? new Date(String(req.query.from)) : null
      const to = req.query.to ? new Date(String(req.query.to)) : null
      // to 는 날짜(YYYY-MM-DD)로 오므로 자정으로 파싱된다. 당일 기록까지 포함하려면
      // 그날 끝(23:59:59.999)으로 밀어야 한다 — 안 그러면 당일 00:00:00 이후분이 전부 잘린다.
      if (to && !Number.isNaN(to.getTime())) {
        to.setHours(23, 59, 59, 999)
      }
      if ((from && !Number.isNaN(from.getTime())) || (to && !Number.isNaN(to.getTime()))) {
        where.capturedAt = {
          ...(from && !Number.isNaN(from.getTime()) ? { gte: from } : {}),
          ...(to && !Number.isNaN(to.getTime()) ? { lte: to } : {}),
        }
      }

      const [total, items] = await Promise.all([
        prisma.commitRecord.count({ where }),
        prisma.commitRecord.findMany({
          where,
          orderBy: { capturedAt: 'desc' },
          take,
          skip,
          // 목록에는 rawMarkdown 을 싣지 않는다(건당 수 KB — 페이지 응답이 급격히 커진다).
          select: {
            id: true,
            commitSha: true,
            commitSubject: true,
            revision: true,
            sessionId: true,
            capturedAt: true,
            eventCount: true,
            inputTokens: true,
            outputTokens: true,
            cacheReadTokens: true,
            cacheCreationTokens: true,
            status: true,
            summary: true,
            project: { select: { id: true, name: true } },
            user: { select: { id: true, identifier: true, displayName: true } },
            agents: { select: { plugin: true, agent: true, spawnCount: true } },
            signals: { select: { polarity: true, verdict: true, confirmedCount: true } },
            _count: { select: { invocations: true } },
          },
        }),
      ])

      res.json({ success: true, data: { total, page: skip / take + 1, pageSize: take, items } })
    } catch (err) {
      res.status(500).json({ success: false, error: String(err) })
    }
  })

  /** 기록 상세. rawMarkdown 포함 — 파싱이 놓친 뉘앙스는 원문으로 확인한다. */
  router.get('/records/:id', async (req, res) => {
    try {
      const record = await prisma.commitRecord.findUnique({
        where: { id: req.params.id },
        include: {
          project: true,
          user: true,
          agents: true,
          signals: true,
          invocations: { orderBy: [{ seq: 'asc' }] },
          feedback: { orderBy: { ordinal: 'asc' } },
          sessionHygiene: true,
        },
      })
      if (!record) {
        res.status(404).json({ success: false, error: '기록을 찾을 수 없다' })
        return
      }
      res.json({ success: true, data: record })
    } catch (err) {
      res.status(500).json({ success: false, error: String(err) })
    }
  })

  /**
   * 에이전트별 사용량 — "이 에이전트가 실제로 값을 하는가"의 1차 근거.
   * spawn·커밋 수에 더해 토큰·호출·에러 계량치(metrics.json 유래)를 함께 집계한다.
   */
  router.get('/stats/agents', async (_req, res) => {
    try {
      const rows = await prisma.recordAgent.groupBy({
        by: ['plugin', 'agent'],
        _sum: {
          spawnCount: true,
          inputTokens: true,
          outputTokens: true,
          cacheReadTokens: true,
          cacheCreationTokens: true,
          toolCalls: true,
          errors: true,
        },
        _count: { recordId: true },
        orderBy: { _sum: { outputTokens: 'desc' } },
      })
      res.json({
        success: true,
        data: rows.map((r) => ({
          plugin: r.plugin,
          agent: r.agent,
          commits: r._count.recordId,
          spawns: r._sum.spawnCount ?? 0,
          inputTokens: r._sum.inputTokens ?? 0,
          outputTokens: r._sum.outputTokens ?? 0,
          cacheReadTokens: r._sum.cacheReadTokens ?? 0,
          cacheCreationTokens: r._sum.cacheCreationTokens ?? 0,
          toolCalls: r._sum.toolCalls ?? 0,
          errors: r._sum.errors ?? 0,
        })),
      })
    } catch (err) {
      res.status(500).json({ success: false, error: String(err) })
    }
  })

  /**
   * 플러그인별 사용량 — 소속 에이전트들의 계량치를 플러그인 축으로 합친다.
   * plugin 이 null 인 행(플러그인 밖 에이전트)은 제외한다.
   */
  router.get('/stats/plugins', async (_req, res) => {
    try {
      const rows = await prisma.recordAgent.groupBy({
        by: ['plugin'],
        where: { plugin: { not: null } },
        _sum: {
          spawnCount: true,
          inputTokens: true,
          outputTokens: true,
          cacheReadTokens: true,
          cacheCreationTokens: true,
          toolCalls: true,
          errors: true,
        },
        _count: { recordId: true },
        orderBy: { _sum: { outputTokens: 'desc' } },
      })
      // 플러그인별 고유 에이전트 수는 groupBy 로 한 번 더 센다.
      const distinct = await prisma.recordAgent.groupBy({
        by: ['plugin', 'agent'],
        where: { plugin: { not: null } },
      })
      const agentCount = new Map<string, number>()
      for (const d of distinct) {
        if (d.plugin) agentCount.set(d.plugin, (agentCount.get(d.plugin) ?? 0) + 1)
      }
      res.json({
        success: true,
        data: rows.map((r) => ({
          plugin: r.plugin,
          agents: r.plugin ? (agentCount.get(r.plugin) ?? 0) : 0,
          commits: r._count.recordId,
          spawns: r._sum.spawnCount ?? 0,
          inputTokens: r._sum.inputTokens ?? 0,
          outputTokens: r._sum.outputTokens ?? 0,
          cacheReadTokens: r._sum.cacheReadTokens ?? 0,
          cacheCreationTokens: r._sum.cacheCreationTokens ?? 0,
          toolCalls: r._sum.toolCalls ?? 0,
          errors: r._sum.errors ?? 0,
        })),
      })
    } catch (err) {
      res.status(500).json({ success: false, error: String(err) })
    }
  })

  /**
   * 스킬별 사용 빈도 집계 — kind=SKILL 인 ToolInvocation 을 스킬명으로 묶는다.
   * 스킬은 토큰 계량치가 없으므로(RecordAgent 와 달리) 빈도 축으로 본다:
   * invocations(총 호출)·commits(등장 커밋 수)·errors. "어떤 스킬을 얼마나 자주 쓰나".
   */
  router.get('/stats/skills', async (_req, res) => {
    try {
      const [total, errs, commitPairs] = await Promise.all([
        prisma.toolInvocation.groupBy({
          by: ['resource', 'plugin'],
          where: { kind: 'SKILL' },
          _count: { id: true },
          orderBy: { _count: { id: 'desc' } },
        }),
        prisma.toolInvocation.groupBy({
          by: ['resource'],
          where: { kind: 'SKILL', isError: true },
          _count: { id: true },
        }),
        // 스킬별 고유 커밋 수 — (resource, recordId) 유일쌍을 세어 복원한다.
        prisma.toolInvocation.findMany({
          where: { kind: 'SKILL' },
          select: { resource: true, recordId: true },
          distinct: ['resource', 'recordId'],
        }),
      ])
      const errMap = new Map(errs.map((e) => [e.resource, e._count.id]))
      const commitMap = new Map<string, number>()
      for (const c of commitPairs) {
        commitMap.set(c.resource, (commitMap.get(c.resource) ?? 0) + 1)
      }
      res.json({
        success: true,
        data: total.map((r) => ({
          skill: r.resource,
          plugin: r.plugin,
          invocations: r._count.id,
          commits: commitMap.get(r.resource) ?? 0,
          errors: errMap.get(r.resource) ?? 0,
        })),
      })
    } catch (err) {
      res.status(500).json({ success: false, error: String(err) })
    }
  })

  /**
   * 감정 신호 집계. 확정 건수와 함께 **오탐 건수**를 낸다 —
   * distill 감지기의 정밀도 자체가 추적 대상이기 때문이다.
   */
  router.get('/stats/signals', async (_req, res) => {
    try {
      const rows = await prisma.signal.groupBy({
        by: ['polarity', 'verdict'],
        _count: { id: true },
      })
      res.json({
        success: true,
        data: rows.map((r) => ({
          polarity: r.polarity,
          verdict: r.verdict,
          count: r._count.id,
        })),
      })
    } catch (err) {
      res.status(500).json({ success: false, error: String(err) })
    }
  })

  /** 축별 피드백 판정 분포 — 어느 축에서 반복적으로 걸리는지. */
  router.get('/stats/feedback', async (_req, res) => {
    try {
      const rows = await prisma.feedbackItem.groupBy({
        by: ['axis', 'verdict'],
        _count: { id: true },
      })
      res.json({
        success: true,
        data: rows.map((r) => ({ axis: r.axis, verdict: r.verdict, count: r._count.id })),
      })
    } catch (err) {
      res.status(500).json({ success: false, error: String(err) })
    }
  })

  /** 일자별 토큰 소비. capturedAt 을 날짜로 잘라 집계한다. */
  router.get('/stats/tokens/daily', async (_req, res) => {
    try {
      const rows = await prisma.$queryRaw<
        Array<{
          day: Date
          commits: bigint
          input_tokens: bigint
          output_tokens: bigint
          cache_read: bigint
          cache_creation: bigint
        }>
      >`
        SELECT date_trunc('day', "capturedAt")   AS day,
               COUNT(*)                          AS commits,
               SUM("inputTokens")                AS input_tokens,
               SUM("outputTokens")               AS output_tokens,
               SUM("cacheReadTokens")            AS cache_read,
               SUM("cacheCreationTokens")        AS cache_creation
        FROM "CommitRecord"
        GROUP BY 1
        ORDER BY 1 DESC
        LIMIT 90
      `
      res.json({
        success: true,
        // bigint 는 JSON.stringify 가 던지므로 Number 로 내린다(토큰 수는 안전 범위).
        data: rows.map((r) => ({
          day: r.day,
          commits: Number(r.commits),
          inputTokens: Number(r.input_tokens),
          outputTokens: Number(r.output_tokens),
          cacheRead: Number(r.cache_read),
          cacheCreation: Number(r.cache_creation),
        })),
      })
    } catch (err) {
      res.status(500).json({ success: false, error: String(err) })
    }
  })

  /**
   * 개별 호출(ToolInvocation) 이력 — 축별 드릴다운의 원자 데이터.
   * 필터: kind(AGENT|SKILL|MCP|TOOL) · resource(정확 일치) · plugin(정확 일치).
   * 각 호출에 그 호출이 나온 커밋(sha·subject·capturedAt)을 조인한다. seq·커밋시각 순.
   * 예: 서브에이전트 상세 = ?kind=AGENT&resource=change-planner,
   *     스킬 상세 = ?kind=SKILL&resource=verify, 플러그인 상세 = ?plugin=agent-factory-plugin.
   */
  router.get('/invocations', async (req, res) => {
    try {
      const where: Prisma.ToolInvocationWhereInput = { rowType: 'ITEM' }
      if (req.query.kind) where.kind = String(req.query.kind) as ResourceKind
      if (req.query.resource) where.resource = String(req.query.resource)
      if (req.query.plugin) where.plugin = String(req.query.plugin)

      const rows = await prisma.toolInvocation.findMany({
        where,
        select: {
          id: true,
          seq: true,
          actor: true,
          kind: true,
          resource: true,
          plugin: true,
          target: true,
          note: true,
          isError: true,
          record: {
            select: {
              id: true,
              commitSha: true,
              commitSubject: true,
              capturedAt: true,
              project: { select: { name: true } },
            },
          },
        },
        orderBy: [{ record: { capturedAt: 'desc' } }, { seq: 'asc' }],
        take: 500,
      })

      res.json({
        success: true,
        data: rows.map((r) => ({
          id: r.id,
          seq: r.seq,
          actor: r.actor,
          kind: r.kind,
          resource: r.resource,
          plugin: r.plugin,
          target: r.target,
          note: r.note,
          isError: r.isError,
          commitId: r.record.id,
          commitSha: r.record.commitSha,
          commitSubject: r.record.commitSubject,
          capturedAt: r.record.capturedAt,
          project: r.record.project?.name ?? null,
        })),
      })
    } catch (err) {
      res.status(500).json({ success: false, error: String(err) })
    }
  })

  /** 필터 드롭다운 채우기용 차원 목록. */
  router.get('/meta', async (_req, res) => {
    try {
      const [projects, users] = await Promise.all([
        prisma.project.findMany({ orderBy: { name: 'asc' } }),
        prisma.user.findMany({ orderBy: { identifier: 'asc' } }),
      ])
      res.json({ success: true, data: { projects, users } })
    } catch (err) {
      res.status(500).json({ success: false, error: String(err) })
    }
  })

  return router
}
