import { describe, it, expect } from 'vitest'
import {
  extractInvocations,
  extractAttribution,
  extractToolResults,
  type EventLike,
} from '../../../shared/resource-extract.js'

function ev(raw: Record<string, unknown>): EventLike {
  return { raw, sessionId: 's1', timestamp: '2026-07-23T00:00:00Z' }
}

describe('extractInvocations (이동 회귀 확인)', () => {
  it('assistant tool_use 에서 skill/mcp 를 추출한다', () => {
    const events = [
      ev({ type: 'assistant', uuid: 'a1', message: { content: [{ type: 'tool_use', id: 't1', name: 'Skill', input: { skill: 'we:Foo' } }] } }),
      ev({ type: 'assistant', uuid: 'a2', message: { content: [{ type: 'tool_use', id: 't2', name: 'mcp__ide__getDiagnostics', input: {} }] } }),
    ]
    const inv = extractInvocations(events)
    expect(inv).toHaveLength(2)
    expect(inv[0]).toMatchObject({ kind: 'skill', plugin: 'we', resource: 'Foo' })
    expect(inv[1]).toMatchObject({ kind: 'mcp', resource: 'getDiagnostics' })
  })
})

describe('extractAttribution', () => {
  it('main: attributionSkill 최상위', () => {
    expect(extractAttribution({ type: 'assistant', attributionSkill: 'claude-code-jsonl' }, 'main')).toEqual({ skill: 'claude-code-jsonl' })
  })
  it('subagent: attributionAgent/Plugin', () => {
    expect(extractAttribution({ attributionAgent: 'reviewer', attributionPlugin: 'fsp' }, 'subagent')).toEqual({ agent: 'reviewer', plugin: 'fsp' })
  })
  it('필드 없으면 null', () => {
    expect(extractAttribution({ type: 'user' }, 'main')).toBeNull()
  })
})

describe('extractToolResults', () => {
  it('tool_result 블록의 is_error 를 tool_use_id 로 매핑', () => {
    const events = [
      ev({ type: 'user', message: { content: [{ type: 'tool_result', tool_use_id: 't1', is_error: true, content: 'boom' }] } }),
      ev({ type: 'user', message: { content: [{ type: 'tool_result', tool_use_id: 't2', is_error: false, content: 'ok' }] } }),
    ]
    const res = extractToolResults(events)
    expect(res).toHaveLength(2)
    expect(res.find((r) => r.toolUseId === 't1')!.isError).toBe(true)
    expect(res.find((r) => r.toolUseId === 't2')!.isError).toBe(false)
  })
  it('is_error 없으면 null', () => {
    const res = extractToolResults([ev({ type: 'user', message: { content: [{ type: 'tool_result', tool_use_id: 't3', content: 'x' }] } })])
    expect(res[0].isError).toBeNull()
  })
})
