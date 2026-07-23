import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'
import express from 'express'
import cors from 'cors'
import { WebSocketServer, WebSocket } from 'ws'
import { scanSessions } from './scanner/index.js'
import { startWatcher } from './watcher/index.js'
import { JsonlEventParser } from './parser/index.js'
import { createAuthMiddleware, isWsAuthorized } from './middleware/auth.js'
import { createSyncRouter } from './routes/sync.js'
import { createStatsRouter } from './routes/stats.js'
import { createDbSessionsRouter } from './routes/db-sessions.js'
import { createDbMetaRouter } from './routes/db-meta.js'
import { createDb } from './db/client.js'
import { KyselySessionRepository } from './repositories/session-repository.js'
import { KyselyEventRepository } from './repositories/event-repository.js'
import { KyselyStatsRepository } from './repositories/stats-repository.js'
import { KyselyMetaRepository } from './repositories/meta-repository.js'
import { aggregateUsageByModel, collectUsage } from '../../shared/pricing.js'
import type { EventOrigin, NormalizedEvent } from './types.js'

// 로컬 dev 편의: cwd(server/)의 .env 를 process.env 로 로드한다.
// 프로덕션/Docker 는 .env 파일 없이 플랫폼 환경변수를 쓰므로 이 블록은 건너뛴다.
if (existsSync('.env')) {
  process.loadEnvFile('.env')
}

// ─── 환경 설정 ──────────────────────────────────────────────────────────────
// 모두 미설정 시 기존 로컬 dev 동작과 동일(단, AUTH_TOKEN 은 필수 — 아래 부팅 검사 참조).
const DATA_DIR = process.env.CLAUDE_DATA_DIR ?? join(homedir(), '.claude', 'projects')
const DB_PATH = process.env.DB_PATH ?? join(DATA_DIR, 'observer.db')
const PORT = Number(process.env.PORT) || 3001
const HOST = process.env.HOST ?? '0.0.0.0'
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN ?? '*'
const AUTH_TOKEN = process.env.AUTH_TOKEN

// 인증 없이 외부에 뜨는 사고를 막기 위해 토큰 미설정 시 부팅을 거부한다.
// 로컬 dev 도 .env 에 임의 토큰을 넣어야 한다(.env.example 참조).
if (!AUTH_TOKEN) {
  console.error(
    '[server] AUTH_TOKEN 환경변수가 설정되지 않았습니다. ' +
      '.env 에 AUTH_TOKEN 을 지정한 뒤 다시 실행하세요.',
  )
  process.exit(1)
}

const parser = new JsonlEventParser()

// DB 초기화 — migrate 가 리스닝 전에 완료되도록 부팅 초반에 수행.
// 마이그레이션 실패 시 예외로 부팅이 중단돼 스키마 불일치 상태로 뜨지 않는다.
const db = createDb(DB_PATH)
const sessionRepo = new KyselySessionRepository(db)
const eventRepo = new KyselyEventRepository(db)
const statsRepo = new KyselyStatsRepository(db)
const metaRepo = new KyselyMetaRepository(db)

const app = express()

app.use(cors({ origin: ALLOWED_ORIGIN }))
app.use(express.json())

// /api 전체를 토큰 인증으로 보호(정적 페이지 없음이므로 전역 적용 가능)
app.use('/api', createAuthMiddleware(AUTH_TOKEN))

// 로컬 sync 잡의 업로드 엔드포인트(파일 저장 + DB ingest)
app.use('/api/sync', createSyncRouter(DATA_DIR, { db }))

// DB 기반 신규 엔드포인트 (기존 /api/sessions* 파일 기반과 분리, 점진 전환)
app.use('/api/stats', createStatsRouter(statsRepo))
app.use('/api/db', createDbMetaRouter(metaRepo))
app.use('/api/db/sessions', createDbSessionsRouter(sessionRepo, eventRepo))

const httpServer = createServer(app)
const wss = new WebSocketServer({ server: httpServer })

const clients = new Set<WebSocket>()

function broadcast(data: unknown): void {
  const msg = JSON.stringify(data)
  for (const client of clients) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(msg)
    }
  }
}

wss.on('connection', (ws, req) => {
  // WS 는 헤더를 못 쓰므로 ?token= 쿼리로 인증한다
  if (!isWsAuthorized(req.url, AUTH_TOKEN)) {
    ws.close(4401, 'unauthorized')
    return
  }
  clients.add(ws)
  ws.on('close', () => clients.delete(ws))
})

/**
 * 메인 세션 파일과 서브에이전트 파일을 모두 파싱해 하나의 이벤트 배열로 합친다.
 * 파일 접근 실패는 skip 한다 (프로세스 중단 없음).
 */
async function parseSessionFiles(
  sessionId: string,
  mainFilePath: string,
  subagentFilePaths: string[],
): Promise<NormalizedEvent[]> {
  const sources: Array<{ path: string; origin: EventOrigin }> = [
    { path: mainFilePath, origin: 'main' },
    ...subagentFilePaths.map((path) => ({ path, origin: 'subagent' as const })),
  ]

  const events: NormalizedEvent[] = []
  for (const { path, origin } of sources) {
    let text: string
    try {
      text = await readFile(path, 'utf8')
    } catch {
      continue
    }
    for (const line of text.split('\n')) {
      const event = parser.parse(line, sessionId, origin)
      if (event && event.category !== 'unknown') events.push(event)
    }
  }
  return events
}

app.get('/api/sessions', async (_req, res) => {
  try {
    const sessions = await scanSessions(DATA_DIR)
    res.json({ success: true, data: sessions })
  } catch (err) {
    res.status(500).json({ success: false, error: String(err) })
  }
})

app.get('/api/sessions/:sessionId/events', async (req, res) => {
  try {
    const sessions = await scanSessions(DATA_DIR)
    const session = sessions.find((s) => s.sessionId === req.params.sessionId)
    if (!session) {
      res.status(404).json({ success: false, error: 'Session not found' })
      return
    }

    const events = await parseSessionFiles(
      session.sessionId,
      session.filePath,
      session.subagentFilePaths,
    )

    res.json({ success: true, data: events })
  } catch (err) {
    res.status(500).json({ success: false, error: String(err) })
  }
})

app.get('/api/sessions/:sessionId/cost', async (req, res) => {
  try {
    const sessions = await scanSessions(DATA_DIR)
    const session = sessions.find((s) => s.sessionId === req.params.sessionId)
    if (!session) {
      res.status(404).json({ success: false, error: 'Session not found' })
      return
    }

    // 서브에이전트 이벤트까지 포함해야 실제 사용량과 일치한다
    const events = await parseSessionFiles(
      session.sessionId,
      session.filePath,
      session.subagentFilePaths,
    )

    // requestId 단위로 중복 제거 — 안 하면 캐시 토큰이 라인 수만큼 부풀려진다
    const entries = collectUsage(events)
    const { totalCostUsd, totals, unknownModels } = aggregateUsageByModel(entries)

    res.json({
      success: true,
      data: {
        estimatedCostUsd: totalCostUsd,
        inputTokens: totals.inputTokens,
        outputTokens: totals.outputTokens,
        cacheWrite: totals.cacheWrite,
        cacheRead: totals.cacheRead,
        unknownModels,
      },
    })
  } catch (err) {
    res.status(500).json({ success: false, error: String(err) })
  }
})

startWatcher(broadcast, DATA_DIR)

httpServer.listen(PORT, HOST, () => {
  console.log(`[server] listening on ${HOST}:${PORT} (data: ${DATA_DIR})`)
})
