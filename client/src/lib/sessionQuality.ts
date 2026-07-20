import type { NormalizedEvent } from '../types/events'

/**
 * 세션의 '낭비 신호'를 집계한다.
 *
 * 토큰 총량은 비용(분자)일 뿐 평가가 되지 못한다. 정답 세트 없이 로그만으로
 * 추론할 수 있는 낭비 지표를 모아 "비쌌지만 깔끔했다 / 쌌지만 헤맸다"를 구분한다.
 *
 * 주의: 효율(토큰·턴 최소화)을 목표로 삼으면 thinking을 줄이는 게 이기는 전략이
 * 되어 품질이 떨어진다. 그래서 여기서 재는 것은 효율이 아니라 재작업·실패다.
 */

/** 편집 도구 — 같은 파일이 반복 등장하면 한 번에 못 맞힌 신호 */
const EDIT_TOOLS = new Set(['Edit', 'Write', 'MultiEdit', 'NotebookEdit'])

export interface FileRework {
  path: string
  count: number
}

export interface RepeatedCommand {
  command: string
  count: number
}

export interface SessionQuality {
  assistantTurns: number
  thinkingTurns: number
  thinkingRatio: number
  toolCalls: number
  toolResults: number
  toolErrors: number
  toolFailureRate: number
  /** 2회 이상 편집된 파일 (많은 순) */
  reworkFiles: FileRework[]
  /** 2회 이상 실행된 동일 Bash 명령 (많은 순) */
  repeatedCommands: RepeatedCommand[]
}

function toArray(val: unknown): Array<Record<string, unknown>> {
  return Array.isArray(val) ? (val as Array<Record<string, unknown>>) : []
}

function topEntries<T extends { count: number }>(
  map: Map<string, number>,
  build: (key: string, count: number) => T,
  limit: number,
): T[] {
  return [...map.entries()]
    .filter(([, count]) => count >= 2)
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([key, count]) => build(key, count))
}

export function calcSessionQuality(events: NormalizedEvent[], limit = 5): SessionQuality {
  let assistantTurns = 0
  let thinkingTurns = 0
  let toolCalls = 0
  let toolResults = 0
  let toolErrors = 0

  const editCounts = new Map<string, number>()
  const commandCounts = new Map<string, number>()

  for (const ev of events) {
    const raw = ev.raw as Record<string, unknown> | null
    if (!raw || typeof raw !== 'object') continue
    const message = raw.message as Record<string, unknown> | undefined

    if (raw.type === 'assistant') {
      assistantTurns++
      const content = toArray(message?.content)
      if (content.some((c) => c.type === 'thinking')) thinkingTurns++

      for (const block of content) {
        if (block.type !== 'tool_use') continue
        toolCalls++

        const name = String(block.name ?? '')
        const input = (block.input ?? {}) as Record<string, unknown>

        if (EDIT_TOOLS.has(name)) {
          const path = input.file_path ?? input.path ?? input.notebook_path
          if (typeof path === 'string' && path) {
            editCounts.set(path, (editCounts.get(path) ?? 0) + 1)
          }
        }

        if (name === 'Bash' && typeof input.command === 'string') {
          // 공백 차이만 있는 동일 명령을 같은 것으로 취급
          const command = input.command.trim().replace(/\s+/g, ' ')
          if (command) commandCounts.set(command, (commandCounts.get(command) ?? 0) + 1)
        }
      }
      continue
    }

    if (raw.type === 'user') {
      for (const block of toArray(message?.content)) {
        if (block.type !== 'tool_result') continue
        toolResults++
        if (block.is_error === true) toolErrors++
      }
    }
  }

  return {
    assistantTurns,
    thinkingTurns,
    thinkingRatio: assistantTurns > 0 ? thinkingTurns / assistantTurns : 0,
    toolCalls,
    toolResults,
    toolErrors,
    toolFailureRate: toolResults > 0 ? toolErrors / toolResults : 0,
    reworkFiles: topEntries(editCounts, (path, count) => ({ path, count }), limit),
    repeatedCommands: topEntries(commandCounts, (command, count) => ({ command, count }), limit),
  }
}
