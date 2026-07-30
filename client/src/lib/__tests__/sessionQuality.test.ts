import { describe, it, expect } from 'vitest'
import { calcSessionQuality } from '@/lib/sessionQuality'
import type { NormalizedEvent } from '@/types/events'

let seq = 0
function ev(raw: unknown): NormalizedEvent {
  seq++
  return {
    id: `ev-${seq}`,
    sessionId: 's1',
    timestamp: new Date(1_700_000_000_000 + seq * 1000).toISOString(),
    category: 'tool-use',
    summary: '',
    raw,
    origin: 'main',
  }
}

function assistantTool(name: string, input: unknown, withThinking = false) {
  const content: unknown[] = [{ type: 'tool_use', id: `t${seq}`, name, input }]
  if (withThinking) content.unshift({ type: 'thinking', thinking: '...' })
  return ev({ type: 'assistant', message: { content } })
}

function toolResult(isError: boolean) {
  return ev({
    type: 'user',
    message: { content: [{ type: 'tool_result', tool_use_id: 'x', is_error: isError }] },
  })
}

describe('calcSessionQuality', () => {
  it('빈 입력에도 안전하게 0을 반환', () => {
    const q = calcSessionQuality([])
    expect(q.toolFailureRate).toBe(0)
    expect(q.thinkingRatio).toBe(0)
    expect(q.reworkFiles).toEqual([])
  })

  it('같은 파일 반복 편집을 rework로 잡는다', () => {
    const q = calcSessionQuality([
      assistantTool('Edit', { file_path: '/a/monitor.lib.ts' }),
      assistantTool('Edit', { file_path: '/a/monitor.lib.ts' }),
      assistantTool('Write', { file_path: '/a/monitor.lib.ts' }),
      assistantTool('Edit', { file_path: '/a/once.ts' }),
    ])

    expect(q.reworkFiles).toEqual([{ path: '/a/monitor.lib.ts', count: 3 }])
  })

  it('1회만 편집된 파일은 rework가 아니다', () => {
    const q = calcSessionQuality([assistantTool('Edit', { file_path: '/a/once.ts' })])
    expect(q.reworkFiles).toEqual([])
  })

  it('편집 도구가 아닌 Read는 rework에 집계하지 않는다', () => {
    const q = calcSessionQuality([
      assistantTool('Read', { file_path: '/a/x.ts' }),
      assistantTool('Read', { file_path: '/a/x.ts' }),
    ])
    expect(q.reworkFiles).toEqual([])
  })

  it('동일 Bash 명령 반복을 잡고 공백 차이를 무시한다', () => {
    const q = calcSessionQuality([
      assistantTool('Bash', { command: 'cd /rag-mfe/' }),
      assistantTool('Bash', { command: '  cd   /rag-mfe/  ' }),
      assistantTool('Bash', { command: 'ls' }),
    ])

    expect(q.repeatedCommands).toEqual([{ command: 'cd /rag-mfe/', count: 2 }])
  })

  it('tool_result의 is_error로 실패율을 계산', () => {
    const q = calcSessionQuality([
      toolResult(false),
      toolResult(false),
      toolResult(true),
      toolResult(false),
    ])

    expect(q.toolResults).toBe(4)
    expect(q.toolErrors).toBe(1)
    expect(q.toolFailureRate).toBeCloseTo(0.25, 10)
  })

  it('thinking 비중은 assistant 턴 기준', () => {
    const q = calcSessionQuality([
      assistantTool('Read', {}, true),
      assistantTool('Read', {}, false),
      assistantTool('Read', {}, false),
      assistantTool('Read', {}, false),
    ])

    expect(q.assistantTurns).toBe(4)
    expect(q.thinkingTurns).toBe(1)
    expect(q.thinkingRatio).toBeCloseTo(0.25, 10)
  })

  it('망가진 raw는 건너뛰고 중단하지 않는다', () => {
    const q = calcSessionQuality([
      ev(null),
      ev('문자열'),
      ev({ type: 'assistant', message: { content: 'not-an-array' } }),
      assistantTool('Edit', { file_path: '/a/x.ts' }),
    ])

    expect(q.assistantTurns).toBe(2)
    expect(q.toolCalls).toBe(1)
  })

  it('limit으로 상위 N개만 반환', () => {
    const events = ['a', 'b', 'c'].flatMap((f) => [
      assistantTool('Edit', { file_path: `/${f}.ts` }),
      assistantTool('Edit', { file_path: `/${f}.ts` }),
    ])

    expect(calcSessionQuality(events, 2).reworkFiles).toHaveLength(2)
  })
})
