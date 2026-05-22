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

function categorize(event: Record<string, unknown>): EventCategory {
  const type = event.type

  if (type === 'user') return 'user-input'
  if (type === 'system') return 'system'
  if (type === 'file-history-snapshot') return 'file-edit'

  if (type === 'assistant') {
    const msg = event.message as Record<string, unknown> | undefined
    const items = (msg?.content ?? []) as Array<Record<string, unknown>>
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
    const content = (msg?.content ?? []) as Array<Record<string, unknown>>
    const text = content.find((c) => c.type === 'text')?.text
    return String(text ?? '').slice(0, 120)
  }

  if (type === 'assistant') {
    const msg = event.message as Record<string, unknown> | undefined
    const items = (msg?.content ?? []) as Array<Record<string, unknown>>
    const tools = items.filter((i) => i.type === 'tool_use')
    if (tools.length) {
      return tools.map((t) => `${String(t.name)}(${JSON.stringify(t.input).slice(0, 60)})`).join(', ')
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
    return attType
  }

  return String(type)
}
