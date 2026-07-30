import { describe, it, expect } from 'vitest'
import { renderHook } from '@testing-library/react'
import { useSessionSummary } from '@/hooks/useSessionSummary'
import type { NormalizedEvent } from '@/types/events'

function makeHookSuccessEvent(hookName: string, stdout: unknown): NormalizedEvent {
  return {
    id: `ev-${hookName}`,
    sessionId: 'session-1',
    timestamp: '2024-01-01T00:00:00Z',
    category: 'context-injection',
    origin: 'main',
    summary: `hook: ${hookName}`,
    raw: {
      type: 'attachment',
      attachment: {
        type: 'hook_success',
        hookName,
        stdout: typeof stdout === 'string' ? stdout : JSON.stringify(stdout),
        exitCode: 0,
      },
    },
  }
}

describe('useSessionSummary', () => {
  it('SessionStart hook_success에서 additionalContext 추출', () => {
    const events: NormalizedEvent[] = [
      makeHookSuccessEvent('SessionStart:startup', {
        hookSpecificOutput: { additionalContext: '이전 세션 요약 내용' },
      }),
    ]
    const { result } = renderHook(() => useSessionSummary(events))
    expect(result.current).toHaveLength(1)
    expect(result.current[0].content).toBe('이전 세션 요약 내용')
    expect(result.current[0].hookName).toBe('SessionStart:startup')
  })

  it('PostToolUse hook은 필터링됨', () => {
    const events: NormalizedEvent[] = [
      makeHookSuccessEvent('PostToolUse:Bash', {
        hookSpecificOutput: { additionalContext: '무시되어야 함' },
      }),
    ]
    const { result } = renderHook(() => useSessionSummary(events))
    expect(result.current).toHaveLength(0)
  })

  it('stdout JSON 파싱 실패 시 skip', () => {
    const events: NormalizedEvent[] = [
      makeHookSuccessEvent('SessionStart:startup', 'not valid json'),
    ]
    const { result } = renderHook(() => useSessionSummary(events))
    expect(result.current).toHaveLength(0)
  })

  it('빈 이벤트 배열 → 빈 결과', () => {
    const { result } = renderHook(() => useSessionSummary([]))
    expect(result.current).toHaveLength(0)
  })

  it('additionalContext 없는 경우 skip', () => {
    const events: NormalizedEvent[] = [
      makeHookSuccessEvent('SessionStart:startup', { hookSpecificOutput: {} }),
    ]
    const { result } = renderHook(() => useSessionSummary(events))
    expect(result.current).toHaveLength(0)
  })
})
