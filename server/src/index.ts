import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import express from 'express'
import cors from 'cors'
import { WebSocketServer, WebSocket } from 'ws'
import { scanSessions } from './scanner/index.js'
import { startWatcher } from './watcher/index.js'
import { JsonlEventParser } from './parser/index.js'
import { aggregateUsageByModel, collectUsage } from '../../shared/pricing.js'
import type { EventOrigin, NormalizedEvent } from './types.js'

const PORT = 3001
const parser = new JsonlEventParser()
const app = express()

app.use(cors({ origin: 'http://localhost:5173' }))
app.use(express.json())

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

wss.on('connection', (ws) => {
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
    const sessions = await scanSessions()
    res.json({ success: true, data: sessions })
  } catch (err) {
    res.status(500).json({ success: false, error: String(err) })
  }
})

app.get('/api/sessions/:sessionId/events', async (req, res) => {
  try {
    const sessions = await scanSessions()
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
    const sessions = await scanSessions()
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

startWatcher(broadcast)

httpServer.listen(PORT, '127.0.0.1', () => {
  console.log(`[server] http://localhost:${PORT}`)
})
