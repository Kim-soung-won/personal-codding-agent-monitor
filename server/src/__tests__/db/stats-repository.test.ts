import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import type { Kysely } from 'kysely'
import { createDb } from '../../db/client.js'
import type { DB } from '../../db/types.js'
import { KyselyStatsRepository } from '../../repositories/stats-repository.js'

const now = '2026-07-23T00:00:00Z'

async function seed(db: Kysely<DB>): Promise<void> {
  await db.insertInto('users').values([
    { id: 1, identifier: 'git:a@x', created_at: now },
    { id: 2, identifier: 'git:b@x', created_at: now },
  ]).execute()
  await db.insertInto('projects').values([
    { id: 1, encoded: '-p1', path: '/p1', name: 'p1' },
    { id: 2, encoded: '-p2', path: '/p2', name: 'p2' },
  ]).execute()
  await db.insertInto('sessions').values([
    { id: 's1', project_id: 1, user_id: 1, ingested_at: now },
    { id: 's2', project_id: 2, user_id: 2, ingested_at: now },
  ]).execute()
  await db.insertInto('sub_agents').values({ id: 10, session_id: 's1', agent_uuid: 'ag1', subagent_type: 'change-planner' }).execute()
  await db.insertInto('resource_invocations').values([
    { session_id: 's1', project_id: 1, user_id: 1, kind: 'skill', plugin: 'fsp', resource: 'test-writer', timestamp: now },
    { session_id: 's1', project_id: 1, user_id: 1, kind: 'skill', plugin: 'fsp', resource: 'test-writer', timestamp: now },
    { session_id: 's2', project_id: 2, user_id: 2, kind: 'agent', plugin: 'fsp', resource: 'reviewer', timestamp: now },
    { session_id: 's1', project_id: 1, user_id: 1, sub_agent_id: 10, kind: 'mcp', mcp_server: 'ide', resource: 'diag', timestamp: now, is_error: 1 },
  ]).execute()
  await db.insertInto('usage').values([
    { session_id: 's1', project_id: 1, user_id: 1, request_id: 'r1', model: 'm', output_tokens: 100, cost_usd: 0.1, day: '2026-07-23' },
    { session_id: 's2', project_id: 2, user_id: 2, request_id: 'r2', model: 'm', output_tokens: 200, cost_usd: 0.2, day: '2026-07-24' },
  ]).execute()
}

describe('KyselyStatsRepository', () => {
  let db: Kysely<DB>
  let repo: KyselyStatsRepository

  beforeEach(async () => {
    db = createDb(':memory:')
    repo = new KyselyStatsRepository(db)
    await seed(db)
  })
  afterEach(async () => {
    await db.destroy()
  })

  it('resourceCounts: 필터 없음은 전체 집계', async () => {
    const rows = await repo.resourceCounts()
    const skill = rows.find((r) => r.kind === 'skill')!
    expect(skill.calls).toBe(2)
    const mcp = rows.find((r) => r.kind === 'mcp')!
    expect(mcp.errors).toBe(1)
  })

  it('resourceCounts: projectId 필터', async () => {
    const rows = await repo.resourceCounts({ projectId: 2 })
    expect(rows).toHaveLength(1)
    expect(rows[0].kind).toBe('agent')
  })

  it('pluginCounts: skill/agent 구성 집계', async () => {
    const rows = await repo.pluginCounts()
    const fsp = rows.find((r) => r.plugin === 'fsp')!
    expect(fsp.calls).toBe(3) // skill 2 + agent 1 (mcp 는 plugin null 이라 제외)
    expect(fsp.skill_calls).toBe(2)
    expect(fsp.agent_calls).toBe(1)
  })

  it('subagentResourceUsage: sub-agent가 호출한 리소스', async () => {
    const rows = await repo.subagentResourceUsage()
    expect(rows).toHaveLength(1)
    expect(rows[0].subagent_type).toBe('change-planner')
    expect(rows[0].kind).toBe('mcp')
  })

  it('dailyTokens: userId 필터 + 일별', async () => {
    const rows = await repo.dailyTokens({ userId: 2 })
    expect(rows).toHaveLength(1)
    expect(rows[0].day).toBe('2026-07-24')
    expect(rows[0].output_tokens).toBe(200)
  })
})
