import { open } from 'node:fs/promises'
import { join } from 'node:path'
import { homedir } from 'node:os'
import chokidar from 'chokidar'
import { JsonlEventParser } from '../parser/index.js'
import type { EventOrigin, NormalizedEvent } from '../types.js'

const CLAUDE_PROJECTS = join(homedir(), '.claude', 'projects')
const MAX_BUFFER = 500

const parser = new JsonlEventParser()
const eventBuffer: NormalizedEvent[] = []
const fileSizeCache = new Map<string, number>()

/**
 * 파일 경로에서 소속 세션과 origin을 판정한다.
 *
 * 서브에이전트 파일은 {session-uuid}/subagents/agent-{id}.jsonl 이므로
 * 파일명(agent-{id})이 아니라 상위 디렉토리의 세션 UUID를 sessionId로 써야
 * 클라이언트가 부모 세션에 매칭할 수 있다.
 */
function resolveOriginAndSessionId(filePath: string): {
  sessionId: string
  origin: EventOrigin
} {
  const parts = filePath.split('/')
  const fileName = parts.pop() ?? filePath
  const parentDir = parts.pop()

  if (parentDir === 'subagents') {
    const sessionDir = parts.pop()
    if (sessionDir) return { sessionId: sessionDir, origin: 'subagent' }
  }

  return { sessionId: fileName.replace('.jsonl', ''), origin: 'main' }
}

async function tailFile(filePath: string, broadcast: (data: unknown) => void): Promise<void> {
  const prevSize = fileSizeCache.get(filePath) ?? 0

  let fh: Awaited<ReturnType<typeof open>> | undefined
  try {
    fh = await open(filePath, 'r')
    const { size: currentSize } = await fh.stat()

    if (currentSize <= prevSize) return

    const byteCount = currentSize - prevSize
    const buffer = Buffer.allocUnsafe(byteCount)
    await fh.read(buffer, 0, byteCount, prevSize)
    fileSizeCache.set(filePath, currentSize)

    const { sessionId, origin } = resolveOriginAndSessionId(filePath)
    for (const line of buffer.toString('utf8').split('\n')) {
      const event = parser.parse(line, sessionId, origin)
      if (!event || event.category === 'unknown') continue

      eventBuffer.push(event)
      if (eventBuffer.length > MAX_BUFFER) eventBuffer.shift()

      broadcast({ type: 'event', payload: event })
    }
  } catch {
    // 파일 접근 실패 시 skip (프로세스 중단 없음)
  } finally {
    await fh?.close()
  }
}

export function startWatcher(broadcast: (data: unknown) => void): void {
  const pattern = `${CLAUDE_PROJECTS}/**/*.jsonl`

  const watcher = chokidar.watch(pattern, {
    persistent: true,
    ignoreInitial: true,
    awaitWriteFinish: { stabilityThreshold: 100, pollInterval: 50 },
  })

  watcher.on('change', (path) => void tailFile(path, broadcast))
  watcher.on('add', (path) => void tailFile(path, broadcast))

  console.log(`[watcher] watching ${pattern}`)
}

export function getEventBuffer(): NormalizedEvent[] {
  return [...eventBuffer]
}
