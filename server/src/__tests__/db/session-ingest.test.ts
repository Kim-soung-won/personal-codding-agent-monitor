import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { Kysely } from 'kysely'
import { createDb } from '../../db/client.js'
import type { DB } from '../../db/types.js'
import { ingestSessionFile } from '../../ingest/session-ingest-service.js'

const LINES = [
  { type: 'user', uuid: 'u1', timestamp: '2026-07-23T00:00:00Z', sessionId: 's1', cwd: '/p/proj', gitBranch: 'main', version: '2.1', message: { role: 'user', content: 'hi' } },
  // tool_use Skill (plugin:resource)
  { type: 'assistant', uuid: 'a1', timestamp: '2026-07-23T00:00:01Z', sessionId: 's1', requestId: 'r1', message: { model: 'claude-opus-4-8', content: [{ type: 'tool_use', id: 'tu1', name: 'Skill', input: { skill: 'frontend-support-plugin:test-writer' } }], usage: { input_tokens: 10, output_tokens: 5, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 } } },
  // 같은 requestId 반복 라인 (usage 중복제거 대상, output 더 큼)
  { type: 'assistant', uuid: 'a2', timestamp: '2026-07-23T00:00:02Z', sessionId: 's1', requestId: 'r1', message: { model: 'claude-opus-4-8', content: [{ type: 'text', text: 'done' }], usage: { input_tokens: 10, output_tokens: 50, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 } } },
  // tool_result → tu1 상관 (is_error=false)
  { type: 'user', uuid: 'u2', timestamp: '2026-07-23T00:00:03Z', sessionId: 's1', message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'tu1', is_error: false, content: 'ok' }] } },
  { type: 'ai-title', aiTitle: 'AI 제목', sessionId: 's1' },
  { type: 'custom-title', customTitle: '커스텀 제목', sessionId: 's1' },
]

function text(lines: unknown[]): string {
  return lines.map((l) => JSON.stringify(l)).join('\n') + '\n'
}

describe('ingestSessionFile', () => {
  let db: Kysely<DB>
  let dir: string

  beforeEach(async () => {
    db = createDb(':memory:')
    dir = await mkdtemp(join(tmpdir(), 'ingest-'))
  })
  afterEach(async () => {
    await db.destroy()
    await rm(dir, { recursive: true, force: true })
  })

  it('세션 메타·이벤트·리소스·usage 를 적재한다', async () => {
    const ok = await ingestSessionFile(db, {
      encoded: '-p-proj',
      sessionId: 's1',
      text: text(LINES),
      mtimeMs: 1000,
      filePath: join(dir, 's1.jsonl'),
      identity: { email: 'me@x', name: 'Me' },
    })
    expect(ok).toBe(true)

    const s = await db.selectFrom('sessions').selectAll().where('id', '=', 's1').executeTakeFirstOrThrow()
    expect(s.title).toBe('커스텀 제목') // customTitle 우선
    expect(s.ai_title).toBe('AI 제목')
    expect(s.custom_title).toBe('커스텀 제목')
    expect(s.git_branch).toBe('main')
    expect(s.cc_version).toBe('2.1')

    const proj = await db.selectFrom('projects').selectAll().where('encoded', '=', '-p-proj').executeTakeFirstOrThrow()
    expect(proj.path).toBe('/p/proj')
    expect(proj.name).toBe('proj')

    const user = await db.selectFrom('users').selectAll().executeTakeFirstOrThrow()
    expect(user.identifier).toBe('git:me@x')

    // resource_invocations: skill 1건, plugin 분리, source=auto, is_error=0(상관)
    const ri = await db.selectFrom('resource_invocations').selectAll().execute()
    expect(ri).toHaveLength(1)
    expect(ri[0].kind).toBe('skill')
    expect(ri[0].plugin).toBe('frontend-support-plugin')
    expect(ri[0].resource).toBe('test-writer')
    expect(ri[0].source).toBe('auto')
    expect(ri[0].is_error).toBe(0)

    // usage: r1 중복제거 → 1건, output 최대값 50
    const usage = await db.selectFrom('usage').selectAll().execute()
    expect(usage).toHaveLength(1)
    expect(usage[0].output_tokens).toBe(50)

    // events: ai-title/custom-title(unknown) 제외 → 4건
    const evCount = await db.selectFrom('events').select(db.fn.countAll<number>().as('c')).executeTakeFirstOrThrow()
    expect(Number(evCount.c)).toBe(4)

    // plugins 차원
    const plugins = await db.selectFrom('plugins').selectAll().execute()
    expect(plugins.map((p) => p.name)).toContain('frontend-support-plugin')
  })

  it('같은 mtime 재적재는 스킵(멱등)', async () => {
    const params = { encoded: '-p-proj', sessionId: 's1', text: text(LINES), mtimeMs: 1000, filePath: join(dir, 's1.jsonl') }
    expect(await ingestSessionFile(db, params)).toBe(true)
    expect(await ingestSessionFile(db, params)).toBe(false) // 스킵
    const ri = await db.selectFrom('resource_invocations').select(db.fn.countAll<number>().as('c')).executeTakeFirstOrThrow()
    expect(Number(ri.c)).toBe(1)
  })

  it('mtime 상승 재적재는 delete+reinsert 로 중복 없이 갱신', async () => {
    await ingestSessionFile(db, { encoded: '-p-proj', sessionId: 's1', text: text(LINES), mtimeMs: 1000, filePath: join(dir, 's1.jsonl') })
    await ingestSessionFile(db, { encoded: '-p-proj', sessionId: 's1', text: text(LINES), mtimeMs: 2000, filePath: join(dir, 's1.jsonl') })
    const ri = await db.selectFrom('resource_invocations').select(db.fn.countAll<number>().as('c')).executeTakeFirstOrThrow()
    const usage = await db.selectFrom('usage').select(db.fn.countAll<number>().as('c')).executeTakeFirstOrThrow()
    expect(Number(ri.c)).toBe(1)
    expect(Number(usage.c)).toBe(1)
  })
})
