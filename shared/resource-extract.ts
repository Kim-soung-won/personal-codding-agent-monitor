/**
 * JSONL 이벤트에서 리소스 호출(skill/agent/workflow/artifact/mcp)과 귀속·도구 결과 신호를
 * 추출하는 로직의 단일 소스.
 *
 * client(대시보드)와 server(DB ingest) 양쪽에서 import 한다 (pricing.ts 와 동일 패턴).
 * 이벤트는 raw/sessionId/timestamp 만 있으면 되므로 EventLike 로 최소 타입만 요구한다
 * (client 의 NormalizedEvent, server 의 NormalizedEvent 둘 다 구조적으로 호환).
 */

/** raw + 세션/타임스탬프만 있으면 되는 최소 이벤트 형태. */
export interface EventLike {
  raw: unknown
  sessionId: string
  timestamp: string
}

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ToolCall {
  id: string
  /** 이 호출을 담은 이벤트의 uuid (DB ingest 의 event_id FK 용). client 는 사용 안 함 */
  eventId: string
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

export function extractToolCalls(events: EventLike[]): ToolCall[] {
  const calls: ToolCall[] = []

  for (const ev of events) {
    const raw = ev.raw as Record<string, unknown>

    if (raw.type === 'assistant') {
      const msg = raw.message as { content?: Array<Record<string, unknown>> } | undefined
      for (const block of msg?.content ?? []) {
        if (block.type === 'tool_use' && typeof block.id === 'string') {
          calls.push({
            id: block.id as string,
            eventId: String(raw.uuid ?? block.id),
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
      const uuid = String(raw.uuid ?? `user-skill-${ev.timestamp}`)
      calls.push({
        id: uuid,
        eventId: uuid,
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

export function extractInvocations(events: EventLike[]): ResourceInvocation[] {
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

// ─── Ingest 전용 추출기 (server DB ingest 에서만 사용) ─────────────────────────
// 아래는 순수 추가이며 위 함수들의 시그니처·동작을 바꾸지 않는다(client 영향 없음).

export interface Attribution {
  skill?: string
  agent?: string
  plugin?: string
}

/**
 * 이벤트의 명시적 귀속 필드를 추출한다 (tool_use 파싱보다 신뢰도 높은 attribution 소스).
 *
 * 실측(2026-07-23): 최상위 필드로 존재.
 *   - main assistant 이벤트: `attributionSkill` (문자열, 예: "claude-code-jsonl")
 *   - subagent assistant 이벤트: `attributionAgent` (예: "domain-skill-reviewer"),
 *     `attributionPlugin` (플러그인 소속 시)
 * 필드 부재 시 null.
 */
export function extractAttribution(
  raw: Record<string, unknown>,
  origin: 'main' | 'subagent',
): Attribution | null {
  const out: Attribution = {}
  if (origin === 'main') {
    if (typeof raw.attributionSkill === 'string') out.skill = raw.attributionSkill
  } else {
    if (typeof raw.attributionAgent === 'string') out.agent = raw.attributionAgent
    if (typeof raw.attributionPlugin === 'string') out.plugin = raw.attributionPlugin
  }
  return out.skill || out.agent || out.plugin ? out : null
}

export interface ToolResultSignal {
  toolUseId: string
  isError: boolean | null
  timestamp: string
}

/**
 * user 이벤트의 message.content 내 tool_result 블록에서 도구 실행 결과 신호를 추출한다.
 *
 * 실측(2026-07-23): tool_result 블록은 `{ tool_use_id, type:'tool_result', content, is_error }`.
 * is_error 가 직접 있어(true/false/null) 휴리스틱 없이 에러 판별 가능.
 * assistant tool_use 의 id 와 tool_use_id 로 상관된다(서버 tool-correlation 에서 매칭).
 */
export function extractToolResults(events: EventLike[]): ToolResultSignal[] {
  const results: ToolResultSignal[] = []
  for (const ev of events) {
    const raw = ev.raw as Record<string, unknown>
    if (raw.type !== 'user') continue
    const msg = raw.message as { content?: unknown } | undefined
    const content = msg?.content
    if (!Array.isArray(content)) continue
    for (const block of content) {
      if (
        block &&
        typeof block === 'object' &&
        (block as Record<string, unknown>).type === 'tool_result'
      ) {
        const b = block as Record<string, unknown>
        if (typeof b.tool_use_id === 'string') {
          results.push({
            toolUseId: b.tool_use_id,
            isError: typeof b.is_error === 'boolean' ? b.is_error : null,
            timestamp: ev.timestamp,
          })
        }
      }
    }
  }
  return results
}
