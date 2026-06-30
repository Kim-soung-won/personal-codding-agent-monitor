import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import express from 'express'
import cors from 'cors'
import { WebSocketServer, WebSocket } from 'ws'
import { scanSessions } from './scanner/index.js'
import { readCosts } from './costs.js'
import { startWatcher } from './watcher/index.js'
import { JsonlEventParser } from './parser/index.js'

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

    const text = await readFile(session.filePath, 'utf8')
    const events = text
      .split('\n')
      .map((line) => parser.parse(line, session.sessionId))
      .filter((e) => e !== null && e.category !== 'unknown')

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

    const text = await readFile(session.filePath, 'utf8')
    let inputTokens = 0, outputTokens = 0, cacheWrite = 0, cacheRead = 0

    for (const line of text.split('\n')) {
      const event = parser.parse(line, session.sessionId)
      if (!event) continue
      const raw = event.raw as Record<string, unknown>
      if (raw.type !== 'assistant') continue
      const msg = raw.message as { usage?: Record<string, number> } | undefined
      const usage = msg?.usage
      if (!usage) continue
      inputTokens  += usage.input_tokens                  ?? 0
      outputTokens += usage.output_tokens                 ?? 0
      cacheWrite   += usage.cache_creation_input_tokens   ?? 0
      cacheRead    += usage.cache_read_input_tokens        ?? 0
    }

    const estimatedCostUsd =
      (inputTokens  * 3.0 +
       outputTokens * 15.0 +
       cacheWrite   * 3.75 +
       cacheRead    * 0.3) / 1_000_000

    res.json({ success: true, data: { estimatedCostUsd, inputTokens, outputTokens, cacheWrite, cacheRead } })
  } catch (err) {
    res.status(500).json({ success: false, error: String(err) })
  }
})

app.get('/api/costs', async (_req, res) => {
  try {
    const data = await readCosts()
    res.json({ success: true, data })
  } catch (err) {
    res.status(500).json({ success: false, error: String(err) })
  }
})

startWatcher(broadcast)

httpServer.listen(PORT, '127.0.0.1', () => {
  console.log(`[server] http://localhost:${PORT}`)
})
