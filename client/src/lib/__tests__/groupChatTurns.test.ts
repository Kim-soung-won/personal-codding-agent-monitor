import { describe, it, expect } from 'vitest'
import { groupChatTurns, isRealUserInput } from '../groupChatTurns'
import type { NormalizedEvent } from '../../types/events'

let seq = 0
function makeEvent(
  category: NormalizedEvent['category'],
  raw: unknown,
  overrides: Partial<NormalizedEvent> = {},
): NormalizedEvent {
  seq++
  return {
    id: `ev-${seq}`,
    sessionId: 'session-1',
    timestamp: new Date(1_700_000_000_000 + seq * 1000).toISOString(),
    category,
    summary: '',
    raw,
    origin: 'main',
    ...overrides,
  }
}

function userEvent(content: unknown): NormalizedEvent {
  return makeEvent('user-input', { type: 'user', message: { content } })
}

function assistantEvent(
  category: 'thinking' | 'tool-use' | 'assistant-text',
  blocks: Array<Record<string, unknown>>,
): NormalizedEvent {
  return makeEvent(category, { type: 'assistant', message: { content: blocks } })
}

describe('isRealUserInput', () => {
  it('string content → true', () => {
    expect(isRealUserInput(userEvent('hello'))).toBe(true)
  })

  it('array with tool_result → false', () => {
    expect(
      isRealUserInput(userEvent([{ type: 'tool_result', tool_use_id: 'x', content: 'ok' }])),
    ).toBe(false)
  })

  it('array without tool_result → true', () => {
    expect(isRealUserInput(userEvent([{ type: 'text', text: 'hi' }]))).toBe(true)
  })

  it('non-user-input category → false', () => {
    const ev = makeEvent('thinking', { type: 'assistant', message: { content: [] } })
    expect(isRealUserInput(ev)).toBe(false)
  })
})

describe('groupChatTurns', () => {
  it('빈 배열 → 빈 결과', () => {
    expect(groupChatTurns([])).toEqual([])
  })

  it('string content 사용자 입력 단독', () => {
    const turns = groupChatTurns([userEvent('안녕')])
    expect(turns).toHaveLength(1)
    expect(turns[0].userMessage?.text).toBe('안녕')
    expect(turns[0].userMessage?.kind).toBe('injected') // promptSource 없으므로 injected
    expect(turns[0].assistantBlocks).toHaveLength(0)
  })

  it('tool_result 단독 이벤트 → userMessage: null인 턴에 assistantBlocks로 포함', () => {
    const ev = userEvent([{ type: 'tool_result', tool_use_id: 'x', content: 'done' }])
    const turns = groupChatTurns([ev])
    expect(turns).toHaveLength(1)
    expect(turns[0].userMessage).toBeNull()
    expect(turns[0].assistantBlocks[0].category).toBe('tool-result-ok')
  })

  it('user → thinking → tool-use → assistant-text 순서 → 단일 ChatTurn, 블록 3개', () => {
    const turns = groupChatTurns([
      userEvent('질문'),
      assistantEvent('thinking', [{ type: 'thinking', thinking: '생각 중' }]),
      assistantEvent('tool-use', [
        { type: 'tool_use', name: 'Read', id: 't1', input: { file_path: '/a.ts' } },
      ]),
      assistantEvent('assistant-text', [{ type: 'text', text: '답변입니다' }]),
    ])
    expect(turns).toHaveLength(1)
    expect(turns[0].userMessage?.text).toBe('질문')
    expect(turns[0].assistantBlocks).toHaveLength(3)
    expect(turns[0].assistantBlocks[0].category).toBe('thinking')
    expect(turns[0].assistantBlocks[1].category).toBe('tool-use')
    expect(turns[0].assistantBlocks[2].category).toBe('assistant-text')
  })

  it('promptSource typed → kind: typed', () => {
    const ev = makeEvent('user-input', {
      type: 'user',
      message: { content: '타이핑' },
      promptSource: 'typed',
    })
    const turns = groupChatTurns([ev])
    expect(turns[0].userMessage?.kind).toBe('typed')
  })

  it('tool_result 이벤트는 assistantBlocks에 tool-result-ok로 추가됨', () => {
    const turns = groupChatTurns([
      userEvent('요청'),
      assistantEvent('tool-use', [{ type: 'tool_use', name: 'Read', id: 'x', input: {} }]),
      makeEvent('user-input', {
        type: 'user',
        message: {
          content: [{ type: 'tool_result', tool_use_id: 'x', content: '파일 내용', is_error: false }],
        },
      }),
    ])
    expect(turns).toHaveLength(1)
    const resultBlocks = turns[0].assistantBlocks.filter(b => b.category === 'tool-result-ok')
    expect(resultBlocks).toHaveLength(1)
    expect(resultBlocks[0].content).toBe('파일 내용')
  })

  it('is_error: true → tool-result-error 카테고리', () => {
    const turns = groupChatTurns([
      userEvent('요청'),
      makeEvent('user-input', {
        type: 'user',
        message: {
          content: [{ type: 'tool_result', tool_use_id: 'y', content: '에러', is_error: true }],
        },
      }),
    ])
    const errBlocks = turns[0].assistantBlocks.filter(b => b.category === 'tool-result-error')
    expect(errBlocks).toHaveLength(1)
  })

  it('사용자 턴 2개 → ChatTurn 2개', () => {
    const turns = groupChatTurns([
      userEvent('첫 번째'),
      assistantEvent('assistant-text', [{ type: 'text', text: '응답1' }]),
      userEvent('두 번째'),
      assistantEvent('assistant-text', [{ type: 'text', text: '응답2' }]),
    ])
    expect(turns).toHaveLength(2)
    expect(turns[0].userMessage?.text).toBe('첫 번째')
    expect(turns[1].userMessage?.text).toBe('두 번째')
  })

  it('첫 UserTurn 이전 assistant 이벤트 → userMessage: null인 ChatTurn 생성', () => {
    const turns = groupChatTurns([
      assistantEvent('assistant-text', [{ type: 'text', text: '선행 응답' }]),
      userEvent('사용자'),
    ])
    expect(turns).toHaveLength(2)
    expect(turns[0].userMessage).toBeNull()
    expect(turns[0].assistantBlocks[0].category).toBe('assistant-text')
    expect(turns[1].userMessage?.text).toBe('사용자')
  })

  it('연속 UserTurn (assistant 응답 없음) → 각각 빈 assistantBlocks', () => {
    const turns = groupChatTurns([userEvent('A'), userEvent('B')])
    expect(turns).toHaveLength(2)
    expect(turns[0].assistantBlocks).toHaveLength(0)
    expect(turns[1].assistantBlocks).toHaveLength(0)
  })

  it('tool-use JSON이 500자 초과 시 truncate + … 접미', () => {
    const largeInput = { key: 'x'.repeat(600) }
    const turns = groupChatTurns([
      userEvent('요청'),
      assistantEvent('tool-use', [
        { type: 'tool_use', name: 'Write', id: 't2', input: largeInput },
      ]),
    ])
    const block = turns[0].assistantBlocks[0]
    expect(block.content.length).toBeLessThanOrEqual(502)
    expect(block.content.endsWith('…')).toBe(true)
  })

  it('짧은 tool-use JSON은 … 없음', () => {
    const turns = groupChatTurns([
      userEvent('요청'),
      assistantEvent('tool-use', [
        { type: 'tool_use', name: 'Bash', id: 't3', input: { command: 'ls' } },
      ]),
    ])
    const block = turns[0].assistantBlocks[0]
    expect(block.content.endsWith('…')).toBe(false)
  })

  it('다중 sessionId 혼합 시 groupChatTurns는 필터링하지 않음 (호출부 책임)', () => {
    const ev1 = { ...userEvent('세션A'), sessionId: 'session-A' }
    const ev2 = { ...userEvent('세션B'), sessionId: 'session-B' }
    const turns = groupChatTurns([ev1, ev2])
    expect(turns).toHaveLength(2)
  })
})
