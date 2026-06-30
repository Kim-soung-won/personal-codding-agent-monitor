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

  it('SessionInfo 형태 검증', async () => {
    const sessions = await scanSessions(FIXTURES_DIR)
    const s = sessions[0]
    expect(typeof s.sessionId).toBe('string')
    expect(typeof s.filePath).toBe('string')
    expect(typeof s.projectEncoded).toBe('string')
    expect(typeof s.lastModified).toBe('number')
  })
})
