import { describe, it, expect } from 'vitest'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { scanSessions } from '../scanner/index.js'

const __dirname = fileURLToPath(new URL('.', import.meta.url))
const FIXTURES_DIR = join(__dirname, 'fixtures')

describe('scanSessions', () => {
  it('fixture 디렉토리에서 세션 반환', async () => {
    const sessions = await scanSessions(FIXTURES_DIR)
    expect(sessions.length).toBeGreaterThan(0)
    const ids = sessions.map((s) => s.sessionId)
    expect(ids).toContain('session-abc123')
  })

  it('존재하지 않는 디렉토리 → 빈 배열 반환', async () => {
    const sessions = await scanSessions('/nonexistent/path/xyz')
    expect(sessions).toEqual([])
  })

  it('서브에이전트 jsonl을 부모 세션의 subagentFilePaths에 담는다', async () => {
    const sessions = await scanSessions(FIXTURES_DIR)
    const target = sessions.find((s) => s.sessionId === 'session-with-subagent')

    expect(target).toBeDefined()
    expect(target!.subagentFilePaths).toHaveLength(1)
    expect(target!.subagentFilePaths[0]).toContain('subagents/agent-test1.jsonl')
  })

  it('서브에이전트 파일이 독립 세션으로 노출되지 않는다', async () => {
    const sessions = await scanSessions(FIXTURES_DIR)
    const ids = sessions.map((s) => s.sessionId)

    expect(ids).not.toContain('agent-test1')
  })

  it('서브에이전트가 없는 세션은 빈 배열', async () => {
    const sessions = await scanSessions(FIXTURES_DIR)
    const plain = sessions.find((s) => s.sessionId === 'session-abc123')

    expect(plain!.subagentFilePaths).toEqual([])
  })

  it('SessionInfo 형태 검증', async () => {
    const sessions = await scanSessions(FIXTURES_DIR)
    const s = sessions[0]
    expect(typeof s.sessionId).toBe('string')
    expect(typeof s.filePath).toBe('string')
    expect(typeof s.projectEncoded).toBe('string')
    expect(typeof s.lastModified).toBe('number')
  })
})
