import type { NormalizedEvent } from '../types/events'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ToolCall {
  id: string
  sessionId: string
  timestamp: string
  name: string
  input: Record<string, unknown>
}

export interface ResourceInvocation {
  id: string
  sessionId: string
  timestamp: string
  kind: 'skill' | 'agent' | 'workflow' | 'artifact' | 'mcp'
  plugin?: string   // 'we-ai-template' from 'we-ai-template:FormInput_FormInput'
  resource: string  // 'FormInput_FormInput' (after colon), or full name if no plugin
  description: string
  detail: string
}

export interface ResourceGroup {
  key: string
  kind: 'skill' | 'agent' | 'workflow' | 'artifact' | 'mcp'
  plugin?: string
  resource: string
  calls: ResourceInvocation[]
  firstAt: string
  lastAt: string
}

export interface PluginGroup {
  plugin: string           // plugin name, or '(standalone)' for resources without namespace
  invocations: ResourceInvocation[]
  kindCounts: { skill: number; agent: number; workflow: number; artifact: number; mcp: number }
  totalCalls: number
}

// ─── Constants ────────────────────────────────────────────────────────────────

const RE_CMD_NAME = /<command-name>\/([^<]+)<\/command-name>/
const RE_CMD_ARGS = /<command-args>([^<]*)<\/command-args>/

export const BUILTIN_COMMANDS = new Set([
  'clear', 'compact', 'help', 'config', 'status',
  'login', 'logout', 'doctor', 'mcp', 'resume',
  'plugin', 'reload-plugins', 'rate-limit-options',
])

// ─── Extraction ───────────────────────────────────────────────────────────────

export function extractToolCalls(events: NormalizedEvent[]): ToolCall[] {
  const calls: ToolCall[] = []

  for (const ev of events) {
    const raw = ev.raw as Record<string, unknown>

    if (raw.type === 'assistant') {
      const msg = raw.message as { content?: Array<Record<string, unknown>> } | undefined
      for (const block of msg?.content ?? []) {
        if (block.type === 'tool_use' && typeof block.id === 'string') {
          calls.push({
            id: block.id as string,
            sessionId: ev.sessionId,
            timestamp: ev.timestamp,
            name: block.name as string,
            input: (block.input as Record<string, unknown>) ?? {},
          })
        }
      }
      continue
    }

    if (raw.type === 'user') {
      const msg = raw.message as { content?: unknown } | undefined
      const content = msg?.content
      if (typeof content !== 'string') continue
      const nameMatch = content.match(RE_CMD_NAME)
      if (!nameMatch) continue
      const skillName = nameMatch[1].trim()
      if (BUILTIN_COMMANDS.has(skillName)) continue
      const argsMatch = content.match(RE_CMD_ARGS)
      const args = argsMatch ? argsMatch[1].trim() : ''
      calls.push({
        id: String(raw.uuid ?? `user-skill-${ev.timestamp}`),
        sessionId: ev.sessionId,
        timestamp: ev.timestamp,
        name: 'Skill',
        input: { skill: skillName, args, _source: 'slash-command' },
      })
    }
  }

  return calls
}

export function toResourceInvocation(call: ToolCall): ResourceInvocation | null {
  const { id, sessionId, timestamp, name, input } = call

  if (name === 'Skill') {
    const fullName = (input.skill as string) ?? '(unknown)'
    const colonIdx = fullName.indexOf(':')
    const plugin = colonIdx > 0 ? fullName.slice(0, colonIdx) : undefined
    const resource = colonIdx > 0
      ? (fullName.slice(colonIdx + 1) || fullName)
      : fullName

    const rawArgs = typeof input.args === 'string' ? input.args : ''
    const args = rawArgs !== fullName ? rawArgs : ''
    const isSlash = input._source === 'slash-command'

    return {
      id, sessionId, timestamp, kind: 'skill',
      plugin,
      resource,
      description: isSlash ? '⌨ user' : '⚙ auto',
      detail: args,
    }
  }

  if (name === 'Agent') {
    const subagentType = (input.subagent_type as string) ?? ''
    const description = (input.description as string) ?? ''
    const prompt = typeof input.prompt === 'string'
      ? input.prompt.slice(0, 800) + (input.prompt.length > 800 ? '\n…' : '')
      : ''
    return { id, sessionId, timestamp, kind: 'agent', resource: subagentType || '(general)', description, detail: prompt }
  }

  if (name === 'Workflow') {
    const wfName = (input.name as string) ?? ''
    const wfDesc = (input.description as string) ?? ''
    const script = typeof input.script === 'string'
      ? input.script.slice(0, 800) + (input.script.length > 800 ? '\n…' : '')
      : ''
    return { id, sessionId, timestamp, kind: 'workflow', resource: wfName || '(inline)', description: wfDesc, detail: script }
  }

  if (name === 'Artifact') {
    const filePath = (input.file_path as string) ?? ''
    const description = (input.description as string) ?? ''
    const label = (input.label as string) ?? ''
    const favicon = (input.favicon as string) ?? ''
    const resource = label || filePath.split('/').pop() || '(artifact)'
    return {
      id, sessionId, timestamp, kind: 'artifact',
      resource,
      description: favicon ? `${favicon}` : 'artifact',
      detail: description,
    }
  }

  // MCP tool calls: name pattern = mcp__serverName__toolName
  if (name.startsWith('mcp__')) {
    const parts = name.split('__')
    const server = (parts[1] ?? 'unknown').replace(/_/g, ' ')
    const tool = parts.slice(2).join('__') || name
    const detailStr = Object.keys(input).length > 0
      ? JSON.stringify(input, null, 2).slice(0, 800)
      : ''
    return {
      id, sessionId, timestamp, kind: 'mcp',
      resource: tool,
      description: server,
      detail: detailStr,
    }
  }

  return null
}

export function extractInvocations(events: NormalizedEvent[]): ResourceInvocation[] {
  return extractToolCalls(events)
    .map(toResourceInvocation)
    .filter((x): x is ResourceInvocation => x !== null)
}

// Groups by kind+plugin+resource for panel view (kind dimension needed for filtering)
export function groupInvocations(invocations: ResourceInvocation[]): ResourceGroup[] {
  const map = new Map<string, ResourceGroup>()
  for (const inv of invocations) {
    const key = `${inv.kind}:${inv.plugin ?? ''}:${inv.resource}`
    const existing = map.get(key)
    if (existing) {
      existing.calls.push(inv)
      if (inv.timestamp < existing.firstAt) existing.firstAt = inv.timestamp
      if (inv.timestamp > existing.lastAt) existing.lastAt = inv.timestamp
    } else {
      map.set(key, {
        key, kind: inv.kind, plugin: inv.plugin, resource: inv.resource,
        calls: [inv], firstAt: inv.timestamp, lastAt: inv.timestamp,
      })
    }
  }
  return [...map.values()].sort((a, b) => b.calls.length - a.calls.length || a.firstAt.localeCompare(b.firstAt))
}

// Groups by plugin namespace for analytics view — (standalone) sentinel for un-namespaced resources
export function groupByPlugin(invocations: ResourceInvocation[]): PluginGroup[] {
  const map = new Map<string, PluginGroup>()

  for (const inv of invocations) {
    const key = inv.plugin ?? '(standalone)'
    const existing = map.get(key)
    if (existing) {
      existing.invocations.push(inv)
      existing.kindCounts[inv.kind]++
      existing.totalCalls++
    } else {
      map.set(key, {
        plugin: key,
        invocations: [inv],
        kindCounts: { skill: 0, agent: 0, workflow: 0, artifact: 0, mcp: 0, [inv.kind]: 1 },
        totalCalls: 1,
      })
    }
  }

  const groups = [...map.values()].sort((a, b) => b.totalCalls - a.totalCalls)

  // Always move (standalone) to the end
  const standaloneIdx = groups.findIndex(g => g.plugin === '(standalone)')
  if (standaloneIdx > 0) {
    groups.push(...groups.splice(standaloneIdx, 1))
  }

  return groups
}
