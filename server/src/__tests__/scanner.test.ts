import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
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

describe('scanSessions — 클라우드 확장 (manifest / summary 사이드카)', () => {
  let tmpDir: string
  const encoded = '-Users-someone-Desktop-my-project'
  const sessionId = 'session-cloud-1'

  beforeAll(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'observer-scan-'))
    const projectDir = join(tmpDir, encoded)
    await mkdir(projectDir, { recursive: true })
    await writeFile(join(projectDir, `${sessionId}.jsonl`), '{"type":"user"}\n', 'utf8')
  })

  afterAll(async () => {
    await rm(tmpDir, { recursive: true, force: true })
  })

  it('manifest.json 이 있으면 FS 탐색 대신 manifest 값을 projectPath 로 쓴다', async () => {
    const manifest = { [encoded]: '/Users/someone/Desktop/my-project' }
    await writeFile(join(tmpDir, 'manifest.json'), JSON.stringify(manifest), 'utf8')

    const sessions = await scanSessions(tmpDir)
    const target = sessions.find((s) => s.sessionId === sessionId)
    expect(target).toBeDefined()
    expect(target!.projectPath).toBe('/Users/someone/Desktop/my-project')

    // manifest 제거 후에는 FS 탐색 폴백으로 다른(매칭 실패) 경로가 나온다
    await rm(join(tmpDir, 'manifest.json'))
    const fallback = await scanSessions(tmpDir)
    const fb = fallback.find((s) => s.sessionId === sessionId)
    expect(fb!.projectPath).not.toBe('/Users/someone/Desktop/my-project')
  })

  it('.summary.json 사이드카가 있으면 title/description 을 채운다', async () => {
    const projectDir = join(tmpDir, encoded)
    await writeFile(
      join(projectDir, `${sessionId}.summary.json`),
      JSON.stringify({
        sessionId,
        title: '클라우드 이전 작업',
        description: '서버를 env 기반으로 바꿨다.',
        generatedAt: '2026-07-23T10:00:00.000Z',
      }),
      'utf8',
    )

    const sessions = await scanSessions(tmpDir)
    const target = sessions.find((s) => s.sessionId === sessionId)
    expect(target!.title).toBe('클라우드 이전 작업')
    expect(target!.description).toBe('서버를 env 기반으로 바꿨다.')
  })

  it('사이드카가 없는 세션은 title/description 이 undefined', async () => {
    const other = 'session-no-summary'
    await writeFile(join(tmpDir, encoded, `${other}.jsonl`), '{"type":"user"}\n', 'utf8')

    const sessions = await scanSessions(tmpDir)
    const target = sessions.find((s) => s.sessionId === other)
    expect(target!.title).toBeUndefined()
    expect(target!.description).toBeUndefined()
  })
})
