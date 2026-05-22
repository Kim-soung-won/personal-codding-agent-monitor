import { randomUUID } from 'node:crypto'
import type { EventCategory, NormalizedEvent } from '../types.js'

export interface IEventParser {
  parse(line: string, sessionId: string): NormalizedEvent | null
}

export class JsonlEventParser implements IEventParser {
  parse(line: string, sessionId: string): NormalizedEvent | null {
    const trimmed = line.trim()
    if (!trimmed) return null

    let raw: unknown
    try {
      raw = JSON.parse(trimmed)
    } catch {
      return null
    }

    if (!raw || typeof raw !== 'object') return null
    const event = raw as Record<string, unknown>

    return {
      id: String(event.uuid ?? randomUUID()),
      sessionId,
      timestamp: String(event.timestamp ?? new Date().toISOString()),
      category: categorize(event),
      raw,
      summary: summarize(event),
    }
  }
}

function toArray(val: unknown): Array<Record<string, unknown>> {
  return Array.isArray(val) ? (val as Array<Record<string, unknown>>) : []
}

function categorize(event: Record<string, unknown>): EventCategory {
  const type = event.type

  if (type === 'user') return 'user-input'
  if (type === 'system') return 'system'
  if (type === 'file-history-snapshot') return 'file-edit'

  if (type === 'assistant') {
    const msg = event.message as Record<string, unknown> | undefined
    const items = toArray(msg?.content)
    if (items.some((i) => i.type === 'thinking')) return 'thinking'
    if (items.some((i) => i.type === 'tool_use')) return 'tool-use'
    return 'assistant-text'
  }

  if (type === 'attachment') {
    const att = event.attachment as Record<string, unknown> | undefined
    const attType = String(att?.type ?? '')
    if (attType === 'edited_text_file') return 'file-edit'
    const contextTypes = new Set([
      'hook_success',
      'async_hook_response',
      'nested_memory',
      'todo_reminder',
      'hook_additional_context',
      'deferred_tools_delta',
      'mcp_instructions_delta',
      'skill_listing',
    ])
    if (contextTypes.has(attType)) return 'context-injection'
  }

  return 'unknown'
}

function summarize(event: Record<string, unknown>): string {
  const type = event.type

  if (type === 'user') {
    const msg = event.message as Record<string, unknown> | undefined
    const rawContent = msg?.content
    if (typeof rawContent === 'string') return rawContent.slice(0, 120) || '(메시지)'
    const content = toArray(rawContent)
    // IDE 컨텍스트 태그(<ide_*>, <system-reminder> 등)는 제외하고 실제 사용자 입력만 추출
    const userText = content
      .filter((c) => c.type === 'text')
      .map((c) => String(c.text ?? '').trim())
      .filter((t) => t.length > 0 && !t.startsWith('<'))
      .join(' ')
    return userText.slice(0, 120) || '(IDE 컨텍스트)'
  }

  if (type === 'assistant') {
    const msg = event.message as Record<string, unknown> | undefined
    const items = toArray(msg?.content)
    const tools = items.filter((i) => i.type === 'tool_use')
    if (tools.length) {
      return tools.map((t) => summarizeTool(t)).join('  |  ')
    }
    const thinking = items.find((i) => i.type === 'thinking')?.thinking
    if (thinking) return String(thinking).slice(0, 120)
    const text = items.find((i) => i.type === 'text')?.text
    return String(text ?? '').slice(0, 120)
  }

  if (type === 'attachment') {
    const att = event.attachment as Record<string, unknown> | undefined
    const attType = String(att?.type ?? '')
    if (attType === 'hook_success') {
      return `hook: ${String(att?.hookName ?? '')}`
    }
    if (attType === 'nested_memory') {
      return `memory: ${String(att?.displayPath ?? '')}`
    }
    if (attType === 'todo_reminder') return 'todo reminder'
    if (attType === 'edited_text_file') {
      const displayPath = String(att?.displayPath ?? att?.filename ?? '')
      return `edited: ${displayPath}`
    }
    return attType
  }

  return String(type)
}

function summarizeTool(tool: Record<string, unknown>): string {
  const name = String(tool.name ?? '')
  const input = (tool.input ?? {}) as Record<string, unknown>

  // 파일 경로가 있으면 파일명만 표시
  const filePath = String(input.file_path ?? input.path ?? input.filename ?? '')
  if (filePath) {
    const short = filePath.split('/').pop() ?? filePath
    return `${name} → ${short}`
  }

  // Bash 명령어
  const command = String(input.command ?? '')
  if (command) {
    return `${name} → ${command.slice(0, 80)}`
  }

  // 그 외: 첫 번째 string 값 사용
  const firstVal = Object.values(input).find((v) => typeof v === 'string')
  if (firstVal) return `${name} → ${String(firstVal).slice(0, 80)}`

  return name
}
