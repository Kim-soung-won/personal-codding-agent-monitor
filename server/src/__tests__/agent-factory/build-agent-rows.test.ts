import { describe, it, expect } from 'vitest'
import { buildAgentRows, type AgentCost } from '../../agent-factory/record-service.js'
import type { ParsedAgent } from '../../agent-factory/record-parser.js'

const fm = (plugin: string | null, agent: string, spawnCount = 1): ParsedAgent => ({
  plugin,
  agent,
  spawnCount,
})

describe('buildAgentRows', () => {
  it('metrics 가 없으면 frontmatter 만으로 행을 만들고 계량치는 0이다', () => {
    const rows = buildAgentRows('rec1', [fm('p', 'a'), fm(null, 'b')], undefined)
    expect(rows).toHaveLength(2)
    expect(rows[0]).toMatchObject({ recordId: 'rec1', plugin: 'p', agent: 'a', spawnCount: 1 })
    // 계량 필드는 undefined(스키마 default 0) — createMany 가 0으로 채운다
    expect(rows[0].inputTokens ?? 0).toBe(0)
  })

  it('agent_costs 가 같은 에이전트의 계량치를 채운다(plugin:agent 매칭)', () => {
    const costs: AgentCost[] = [
      {
        agent: 'p:a',
        input: 100,
        output: 200,
        cache_read: 300,
        cache_creation: 400,
        tool_calls: 5,
        errors: 2,
        spawns: 3,
      },
    ]
    const rows = buildAgentRows('rec1', [fm('p', 'a'), fm(null, 'b')], costs)
    const a = rows.find((r) => r.agent === 'a')!
    expect(a).toMatchObject({
      plugin: 'p',
      inputTokens: 100,
      outputTokens: 200,
      cacheReadTokens: 300,
      cacheCreationTokens: 400,
      toolCalls: 5,
      errors: 2,
      spawnCount: 3, // 실측 spawns 가 frontmatter 근사(1)를 이긴다
    })
    // 계량치 없는 b 는 0 유지
    const b = rows.find((r) => r.agent === 'b')!
    expect(b.outputTokens ?? 0).toBe(0)
  })

  it('frontmatter 에 없고 agent_costs 에만 있는 에이전트도 추가한다(LLM 누락 보완)', () => {
    const costs: AgentCost[] = [{ agent: 'p:only-in-metrics', output: 999, spawns: 1 }]
    const rows = buildAgentRows('rec1', [fm('p', 'a')], costs)
    expect(rows).toHaveLength(2)
    const extra = rows.find((r) => r.agent === 'only-in-metrics')!
    expect(extra).toMatchObject({ plugin: 'p', outputTokens: 999 })
  })

  it('plugin 없는 에이전트도 매칭한다', () => {
    const costs: AgentCost[] = [{ agent: 'bare', output: 50, spawns: 2 }]
    const rows = buildAgentRows('rec1', [fm(null, 'bare')], costs)
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ plugin: null, agent: 'bare', outputTokens: 50, spawnCount: 2 })
  })

  it('spawns 가 0/누락이면 frontmatter spawnCount 를 보존한다', () => {
    const costs: AgentCost[] = [{ agent: 'p:a', output: 10 }] // spawns 없음
    const rows = buildAgentRows('rec1', [fm('p', 'a', 4)], costs)
    expect(rows[0].spawnCount).toBe(4)
  })
})
