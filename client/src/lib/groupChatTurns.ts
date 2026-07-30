import type { NormalizedEvent } from '@/types/events'

// ─── Types ────────────────────────────────────────────────────────────────────

/** 'typed'  = 사용자가 직접 입력한 메시지
 *  'injected' = 스킬/컨텍스트가 프로그래밍 방식으로 주입한 메시지 */
export type UserMessageKind = 'typed' | 'injected'

export interface UserMessage {
  text: string
  kind: UserMessageKind
}

export type AssistantBlockCategory =
  | 'thinking'
  | 'tool-use'
  | 'tool-result-ok'
  | 'tool-result-error'
  | 'assistant-text'

export interface AssistantBlock {
  id: string
  category: AssistantBlockCategory
  /** tool name for tool-use, shortened id for tool-result, first 120 chars for others */
  label: string
  content: string
}

export interface TurnUsage {
  inputTokens: number
  outputTokens: number
  cacheWrite: number
  cacheRead: number
  estimatedCostUsd: number
}

export const ZERO_USAGE: TurnUsage = {
  inputTokens: 0, outputTokens: 0, cacheWrite: 0, cacheRead: 0, estimatedCostUsd: 0,
}

export interface ChatTurn {
  id: string
  timestamp: string
  userMessage: UserMessage | null
  assistantBlocks: AssistantBlock[]
  usage: TurnUsage
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

type ContentArray = Array<Record<string, unknown>>

function getMessageContent(raw: unknown): string | ContentArray | null {
  if (!raw || typeof raw !== 'object') return null
  const event = raw as Record<string, unknown>
  const msg = event.message
  if (!msg || typeof msg !== 'object') return null
  const content = (msg as Record<string, unknown>).content
  if (typeof content === 'string') return content
  if (Array.isArray(content)) return content as ContentArray
  return null
}

function getPromptSource(raw: unknown): string | null {
  if (!raw || typeof raw !== 'object') return null
  const val = (raw as Record<string, unknown>).promptSource
  return typeof val === 'string' ? val : null
}

function hasToolResult(content: ContentArray): boolean {
  return content.some((item) => item.type === 'tool_result')
}

// ─── Predicates ───────────────────────────────────────────────────────────────

/**
 * 실제 사용자 입력인지 판별 (tool_result 이벤트는 제외).
 *
 * Rules:
 *   1. string content → always real (typed or injected)
 *   2. array with tool_result block → NOT real user input
 *   3. array without tool_result → real (typed or injected)
 */
export function isRealUserInput(event: NormalizedEvent): boolean {
  if (event.category !== 'user-input') return false
  const content = getMessageContent(event.raw)
  if (content === null) return false
  if (typeof content === 'string') return content.trim().length > 0
  return !hasToolResult(content)
}

/**
 * 직접 타이핑 vs 스킬/시스템 주입 구분.
 * promptSource === 'typed' 인 경우에만 'typed', 나머지는 'injected'.
 */
function classifyUserKind(raw: unknown): UserMessageKind {
  return getPromptSource(raw) === 'typed' ? 'typed' : 'injected'
}

// ─── Content extractors ───────────────────────────────────────────────────────

function extractUserText(event: NormalizedEvent): string {
  const content = getMessageContent(event.raw)
  if (!content) return ''
  if (typeof content === 'string') return content
  return content
    .filter((item) => item.type === 'text')
    .map((item) => String(item.text ?? '').trim())
    .filter((t) => t.length > 0 && !t.startsWith('<'))
    .join('\n\n')
}

function truncate(s: string, max = 500): string {
  return s.length > max ? s.slice(0, max) + '\n…' : s
}

function extractEventUsage(event: NormalizedEvent): TurnUsage {
  const raw = event.raw
  if (!raw || typeof raw !== 'object') return ZERO_USAGE
  const r = raw as Record<string, unknown>
  if (r.type !== 'assistant') return ZERO_USAGE
  const msg = r.message as Record<string, unknown> | undefined
  const usage = msg?.usage as Record<string, number> | undefined
  if (!usage) return ZERO_USAGE

  const input      = usage.input_tokens                 ?? 0
  const output     = usage.output_tokens                ?? 0
  const cacheWrite = usage.cache_creation_input_tokens  ?? 0
  const cacheRead  = usage.cache_read_input_tokens      ?? 0
  return {
    inputTokens: input,
    outputTokens: output,
    cacheWrite,
    cacheRead,
    estimatedCostUsd: (input * 3.0 + output * 15.0 + cacheWrite * 3.75 + cacheRead * 0.3) / 1_000_000,
  }
}

function addUsage(a: TurnUsage, b: TurnUsage): TurnUsage {
  return {
    inputTokens:      a.inputTokens      + b.inputTokens,
    outputTokens:     a.outputTokens     + b.outputTokens,
    cacheWrite:       a.cacheWrite       + b.cacheWrite,
    cacheRead:        a.cacheRead        + b.cacheRead,
    estimatedCostUsd: a.estimatedCostUsd + b.estimatedCostUsd,
  }
}

function extractAssistantBlocks(event: NormalizedEvent): AssistantBlock[] {
  const raw = event.raw
  if (!raw || typeof raw !== 'object') return []
  const msg = (raw as Record<string, unknown>).message
  if (!msg || typeof msg !== 'object') return []
  const rawContent = (msg as Record<string, unknown>).content
  if (!Array.isArray(rawContent)) return []

  const blocks: AssistantBlock[] = []

  for (const item of rawContent as ContentArray) {
    if (item.type === 'thinking') {
      const thinking = String(item.thinking ?? '').trim()
      if (!thinking) continue
      blocks.push({
        id: `${event.id}-thinking-${blocks.length}`,
        category: 'thinking',
        label: thinking.slice(0, 120),
        content: thinking,
      })
    } else if (item.type === 'tool_use') {
      const name = String(item.name ?? 'tool')
      blocks.push({
        id: `${event.id}-tool-${blocks.length}`,
        category: 'tool-use',
        label: name,
        content: truncate(JSON.stringify(item.input, null, 2) ?? '{}'),
      })
    } else if (item.type === 'text') {
      const text = String(item.text ?? '').trim()
      if (!text) continue
      blocks.push({
        id: `${event.id}-text-${blocks.length}`,
        category: 'assistant-text',
        label: text.slice(0, 120),
        content: text,
      })
    }
  }

  return blocks
}

function extractToolResultBlocks(event: NormalizedEvent): AssistantBlock[] {
  const raw = event.raw
  if (!raw || typeof raw !== 'object') return []
  const msg = (raw as Record<string, unknown>).message
  if (!msg || typeof msg !== 'object') return []
  const rawContent = (msg as Record<string, unknown>).content
  if (!Array.isArray(rawContent)) return []

  const blocks: AssistantBlock[] = []

  for (const item of rawContent as ContentArray) {
    if (item.type !== 'tool_result') continue

    const isError = item.is_error === true
    const toolUseId = String(item.tool_use_id ?? '').slice(-8)

    let content: string
    if (typeof item.content === 'string') {
      content = truncate(item.content)
    } else if (Array.isArray(item.content)) {
      const texts = (item.content as ContentArray)
        .filter((c) => c.type === 'text')
        .map((c) => String(c.text ?? ''))
        .join('\n')
      content = truncate(texts)
    } else {
      content = truncate(JSON.stringify(item.content, null, 2) ?? '')
    }

    blocks.push({
      id: `${event.id}-result-${blocks.length}`,
      category: isError ? 'tool-result-error' : 'tool-result-ok',
      label: `[${toolUseId}]`,
      content,
    })
  }

  return blocks
}

// ─── Main function ────────────────────────────────────────────────────────────

function appendToLastTurn(
  turns: ChatTurn[],
  blocks: AssistantBlock[],
  usage: TurnUsage,
  fallbackTimestamp: string,
  fallbackId: string,
): ChatTurn[] {
  if (turns.length === 0) {
    return [{ id: fallbackId, timestamp: fallbackTimestamp, userMessage: null, assistantBlocks: blocks, usage }]
  }
  const last = turns[turns.length - 1]
  return [
    ...turns.slice(0, -1),
    { ...last, assistantBlocks: [...last.assistantBlocks, ...blocks], usage: addUsage(last.usage, usage) },
  ]
}

/**
 * NormalizedEvent[] → ChatTurn[] に変換する純粋関数.
 *
 * SINGLE-SESSION CONTRACT:
 *   Caller must pass events from a single sessionId.
 *   This function does not filter by sessionId.
 */
export function groupChatTurns(events: NormalizedEvent[]): ChatTurn[] {
  const sorted = [...events].sort(
    (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
  )

  let turns: ChatTurn[] = []

  for (const event of sorted) {
    // ── 1. 실제 사용자 입력 (typed or injected) ──────────────────────────────
    if (isRealUserInput(event)) {
      const text = extractUserText(event)
      if (!text.trim()) continue
      turns = [
        ...turns,
        {
          id: event.id,
          timestamp: event.timestamp,
          userMessage: { text, kind: classifyUserKind(event.raw) },
          assistantBlocks: [],
          usage: ZERO_USAGE,
        },
      ]
      continue
    }

    // ── 2. 툴 실행 결과 (tool_result) ────────────────────────────────────────
    if (event.category === 'user-input') {
      const blocks = extractToolResultBlocks(event)
      if (blocks.length > 0) {
        turns = appendToLastTurn(turns, blocks, ZERO_USAGE, event.timestamp, event.id)
      }
      continue
    }

    // ── 3. Assistant 블록 (thinking / tool-use / assistant-text) ─────────────
    if (
      event.category === 'thinking' ||
      event.category === 'tool-use' ||
      event.category === 'assistant-text'
    ) {
      const blocks = extractAssistantBlocks(event)
      const usage = extractEventUsage(event)
      if (blocks.length > 0 || usage.estimatedCostUsd > 0) {
        turns = appendToLastTurn(turns, blocks, usage, event.timestamp, event.id)
      }
    }
    // context-injection, file-edit, system, unknown → skipped in chat view
  }

  return turns
}
