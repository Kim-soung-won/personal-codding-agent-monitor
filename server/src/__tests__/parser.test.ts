import { describe, it, expect } from 'vitest'
import { JsonlEventParser } from '../parser/index.js'

const parser = new JsonlEventParser()

describe('JsonlEventParser', () => {
  it('빈 라인은 null 반환', () => {
    expect(parser.parse('', 'session-1')).toBeNull()
    expect(parser.parse('   ', 'session-1')).toBeNull()
  })

  it('잘못된 JSON은 null 반환', () => {
    expect(parser.parse('{not json}', 'session-1')).toBeNull()
  })

  it('user 이벤트 → user-input 카테고리', () => {
    const line = JSON.stringify({
      type: 'user',
      uuid: 'u1',
      timestamp: '2024-01-01T00:00:00Z',
      message: { role: 'user', content: [{ type: 'text', text: '안녕' }] },
    })
    const result = parser.parse(line, 'session-1')
    expect(result?.category).toBe('user-input')
    expect(result?.summary).toBe('안녕')
  })

  it('thinking 포함 assistant → thinking 카테고리', () => {
    const line = JSON.stringify({
      type: 'assistant',
      uuid: 'a1',
      timestamp: '2024-01-01T00:00:00Z',
      message: {
        role: 'assistant',
        content: [{ type: 'thinking', thinking: '내부 추론' }],
        usage: { input_tokens: 10, output_tokens: 20 },
      },
    })
    const result = parser.parse(line, 'session-1')
    expect(result?.category).toBe('thinking')
  })

  it('tool_use 포함 assistant → tool-use 카테고리 (assistant type만 집계)', () => {
    const line = JSON.stringify({
      type: 'assistant',
      uuid: 'a2',
      timestamp: '2024-01-01T00:00:00Z',
      message: {
        role: 'assistant',
        content: [{ type: 'tool_use', id: 't1', name: 'Read', input: { file_path: '/foo.ts' } }],
        usage: { input_tokens: 5, output_tokens: 3 },
      },
    })
    const result = parser.parse(line, 'session-1')
    expect(result?.category).toBe('tool-use')
    expect(result?.summary).toContain('Read')
  })

  it('hook_success attachment → context-injection 카테고리', () => {
    const line = JSON.stringify({
      type: 'attachment',
      uuid: 'att1',
      timestamp: '2024-01-01T00:00:00Z',
      attachment: { type: 'hook_success', hookName: 'SessionStart:startup', stdout: '', exitCode: 0 },
    })
    const result = parser.parse(line, 'session-1')
    expect(result?.category).toBe('context-injection')
  })
})
