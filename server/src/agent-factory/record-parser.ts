/**
 * `.agent-factory/sessions/<sha>.md` → 구조화 데이터 파서.
 *
 * 입력은 LLM(session-feedback-summarizer)이 쓴 마크다운이라 형식이 완벽하지 않을 수
 * 있다. 그래서 이 파서의 규칙은 **절대 던지지 않는다**이다 — 못 읽은 조각은 warnings 에
 * 남기고 읽어낸 만큼만 돌려준다. 원본은 호출부가 rawMarkdown 으로 통째 보관하므로,
 * 파싱이 부실해도 데이터는 유실되지 않고 나중에 재파싱할 수 있다.
 *
 * 형식의 근거: agent-factory-plugin 의
 * `resources/session-feedback-summarizer/output-format.md`
 */

export type SignalPolarity = 'NEGATIVE' | 'POSITIVE'
export type SignalChannel = 'OUTPUT' | 'INPUT'
export type SignalVerdict = 'CONFIRMED' | 'FALSE_POSITIVE'
export type InvocationRowType = 'ITEM' | 'AGGREGATE'
export type ResourceKind = 'AGENT' | 'SKILL' | 'MCP' | 'TOOL'
export type FeedbackAxis =
  | 'DELEGATION_FIT'
  | 'REWORK_LOOP'
  | 'TOOL_SCOPING'
  | 'COST'
  | 'REPO_NORMS'
export type FeedbackVerdict = 'GOOD' | 'CONCERN' | 'INSUFFICIENT_EVIDENCE'

export interface ParsedAgent {
  plugin: string | null
  agent: string
  spawnCount: number
}

export interface ParsedSignal {
  polarity: SignalPolarity
  channel: SignalChannel
  verdict: SignalVerdict
  turnRef: string | null
  excerpt: string | null
  note: string | null
  flaggedCount: number | null
  confirmedCount: number | null
}

export interface ParsedInvocation {
  seq: number | null
  rowType: InvocationRowType
  actor: string
  kind: ResourceKind | null
  resource: string
  plugin: string | null
  target: string | null
  note: string | null
  isError: boolean
}

export interface ParsedFeedback {
  axis: FeedbackAxis
  ordinal: number
  body: string
  verdict: FeedbackVerdict | null
}

export interface ParsedRecord {
  commitSha: string | null
  commitSubject: string | null
  sessionId: string | null
  capturedAt: Date | null
  eventCount: number
  inputTokens: number
  outputTokens: number
  cacheReadTokens: number
  cacheCreationTokens: number
  summary: string | null
  costNote: string | null
  agents: ParsedAgent[]
  signals: ParsedSignal[]
  invocations: ParsedInvocation[]
  feedback: ParsedFeedback[]
  warnings: string[]
}

// ─── frontmatter ────────────────────────────────────────────────────────────

/**
 * frontmatter 는 YAML 처럼 보이지만 `agents: [a:b, c:d]` 처럼 flow 시퀀스 안에
 * 콜론이 들어가 표준 YAML 파서가 오해할 수 있다. 의존성을 늘리는 대신 이 형식만
 * 아는 관용 파서를 쓴다.
 */
function parseFrontmatter(text: string): { fields: Map<string, string>; body: string } {
  const fields = new Map<string, string>()
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(text)
  if (!match) return { fields, body: text }

  for (const line of match[1].split(/\r?\n/)) {
    const sep = line.indexOf(':')
    if (sep === -1) continue
    const key = line.slice(0, sep).trim()
    let value = line.slice(sep + 1).trim()
    // 양끝 따옴표 제거 (commit_subject 가 콜론을 품어 인용되는 경우)
    if (value.length >= 2 && /^(".*"|'.*')$/s.test(value)) {
      value = value.slice(1, -1)
    }
    if (key) fields.set(key, value)
  }
  return { fields, body: text.slice(match[0].length) }
}

/** `{ input: 1884, output: 371591, ... }` → Map */
function parseInlineMap(value: string): Map<string, number> {
  const out = new Map<string, number>()
  const inner = value.replace(/^\{/, '').replace(/\}$/, '')
  for (const pair of inner.split(',')) {
    const sep = pair.indexOf(':')
    if (sep === -1) continue
    const k = pair.slice(0, sep).trim()
    const n = Number(pair.slice(sep + 1).trim().replace(/_/g, ''))
    if (k && Number.isFinite(n)) out.set(k, n)
  }
  return out
}

/** `[a:b, c:d]` → ['a:b', 'c:d'] */
function parseInlineList(value: string): string[] {
  return value
    .replace(/^\[/, '')
    .replace(/\]$/, '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
}

/** `plugin:agent` 또는 `agent` → { plugin, agent } */
export function splitQualifiedAgent(token: string): { plugin: string | null; agent: string } {
  const idx = token.lastIndexOf(':')
  if (idx === -1) return { plugin: null, agent: token }
  return { plugin: token.slice(0, idx) || null, agent: token.slice(idx + 1) }
}

// ─── 섹션 분해 ──────────────────────────────────────────────────────────────

/** `## 제목` 단위로 본문을 쪼갠다. 제목은 공백을 제거해 비교한다(표기 흔들림 흡수). */
function splitSections(body: string): Map<string, string> {
  const sections = new Map<string, string>()
  const lines = body.split(/\r?\n/)
  let current: string | null = null
  let buffer: string[] = []

  const flush = (): void => {
    if (current !== null) sections.set(current, buffer.join('\n').trim())
    buffer = []
  }

  for (const line of lines) {
    const heading = /^##\s*(.+?)\s*$/.exec(line)
    if (heading && !line.startsWith('###')) {
      flush()
      current = heading[1].replace(/\s+/g, '')
      continue
    }
    if (current !== null) buffer.push(line)
  }
  flush()
  return sections
}

/** 인용부호(`>`)와 마크다운 강조를 걷어낸 순수 텍스트. */
function plain(text: string): string {
  return text
    .replace(/^\s*>\s?/gm, '')
    .replace(/\*\*/g, '')
    .replace(/`/g, '')
    .trim()
}

// ─── 신호 ───────────────────────────────────────────────────────────────────

/**
 * `- **🔴 부정(출력):** 실질 **0건**. ...` 형태의 불릿을 신호 1행으로 읽는다.
 *
 * .md 의 불릿은 개별 발화가 아니라 "그 극성의 신호 묶음"에 대한 판정이다. 따라서
 * 불릿당 1행으로 저장하고, 실질 건수(confirmedCount)가 0이면 FALSE_POSITIVE 로 본다.
 */
function parseSignals(section: string | undefined, warnings: string[]): ParsedSignal[] {
  if (!section) return []
  if (/감정신호없음|감정 신호 없음/.test(section.replace(/\s+/g, ' '))) return []

  const signals: ParsedSignal[] = []
  // 불릿 시작(`- `)부터 다음 불릿 전까지를 한 덩어리로 (여러 줄에 걸쳐 접힘)
  const blocks = section.split(/\n(?=\s*-\s+\*\*)/)

  for (const block of blocks) {
    if (!/^\s*-\s+\*\*/.test(block)) continue

    const polarity: SignalPolarity | null = /🔴|부정/.test(block)
      ? 'NEGATIVE'
      : /🟢|긍정/.test(block)
        ? 'POSITIVE'
        : null
    if (!polarity) continue

    // 채널은 마커에 명시된다. 없으면 rubric 기본값(부정=출력, 긍정=입력)을 따른다.
    const channel: SignalChannel = /\(출력\)/.test(block)
      ? 'OUTPUT'
      : /\(입력\)/.test(block)
        ? 'INPUT'
        : polarity === 'NEGATIVE'
          ? 'OUTPUT'
          : 'INPUT'

    const confirmed = /실질\s*\**\s*(\d+)\s*건/.exec(block)
    const flagged = /사전\s*플래그\s*(\d+)\s*건|플래그\s*(\d+)\s*건/.exec(block)
    const confirmedCount = confirmed ? Number(confirmed[1]) : null

    const turn = /\(\s*(u\d+)\s*\)/i.exec(block)
    const quote = /`([^`]+)`/.exec(block)

    signals.push({
      polarity,
      channel,
      verdict: confirmedCount === 0 ? 'FALSE_POSITIVE' : 'CONFIRMED',
      turnRef: turn ? turn[1] : null,
      excerpt: quote ? quote[1] : null,
      note: plain(block.replace(/^\s*-\s+/, '')) || null,
      flaggedCount: flagged ? Number(flagged[1] ?? flagged[2]) : null,
      confirmedCount,
    })
  }

  if (signals.length === 0) warnings.push('신호 섹션에서 극성을 가진 불릿을 찾지 못했다')
  return signals
}

// ─── 에이전트·도구 사용 내역 표 ─────────────────────────────────────────────

/** `Agent → subagent-evaluator`, `Skill`, `Edit×29 · Bash×32` 등 도구 셀을 해석한다. */
function classifyResource(cell: string): { kind: ResourceKind | null; resource: string } {
  const text = cell.trim()

  // "Agent → subagent-evaluator" / "Agent(subagent_type)"
  const arrow = /^Agent\s*(?:→|->)\s*(.+)$/i.exec(text)
  if (arrow) return { kind: 'AGENT', resource: arrow[1].trim() }
  const paren = /^Agent\s*\((.+)\)$/i.exec(text)
  if (paren) return { kind: 'AGENT', resource: paren[1].trim() }

  const skill = /^Skill\s*(?:→|->|\()\s*([^)]+)\)?$/i.exec(text)
  if (skill) return { kind: 'SKILL', resource: skill[1].trim() }

  if (/^mcp__/.test(text)) return { kind: 'MCP', resource: text }

  // 단일 내장 도구 이름만 있는 경우(집계 셀은 구분자가 있어 걸리지 않는다)
  if (/^[A-Z][A-Za-z]+$/.test(text)) return { kind: 'TOOL', resource: text }

  return { kind: null, resource: text }
}

function parseInvocations(section: string | undefined, warnings: string[]): ParsedInvocation[] {
  if (!section) return []

  const rows: ParsedInvocation[] = []
  for (const line of section.split(/\r?\n/)) {
    if (!line.trim().startsWith('|')) continue
    // 구분선(|---|---|) 건너뛰기
    if (/^\s*\|[\s:|-]+\|\s*$/.test(line)) continue

    const cells = line
      .trim()
      .replace(/^\|/, '')
      .replace(/\|$/, '')
      .split('|')
      .map((c) => c.trim())
    if (cells.length < 3) continue
    // 헤더 행 건너뛰기
    if (/^순서$/.test(cells[0])) continue

    const [seqCell, actorCell, resourceCell, targetCell, noteCell] = cells
    const seqNum = Number(seqCell)
    const isAggregate = !Number.isFinite(seqNum) || seqCell === '' || /^[—–-]$/.test(seqCell)

    const { kind, resource } = isAggregate
      ? { kind: null, resource: resourceCell }
      : classifyResource(resourceCell)

    const note = noteCell ?? null
    rows.push({
      seq: isAggregate ? null : seqNum,
      rowType: isAggregate ? 'AGGREGATE' : 'ITEM',
      actor: actorCell || 'main',
      kind,
      resource,
      plugin: null,
      target: targetCell || null,
      note: note || null,
      // 비고에 오류·거부·재시도 흔적이 있으면 실패로 본다(정상 표기와 구분).
      isError: !!note && /에러|오류|실패|거부|중단|재시도/.test(note),
    })
  }

  if (rows.length === 0) warnings.push('사용 내역 표에서 행을 읽지 못했다')
  return rows
}

// ─── 피드백 ─────────────────────────────────────────────────────────────────

/** 축 제목 → enum. output-format 이 번호+이름을 함께 쓰므로 이름으로 매칭한다. */
const AXIS_BY_NAME: Array<[RegExp, FeedbackAxis]> = [
  [/위임\s*적절성|delegation/i, 'DELEGATION_FIT'],
  [/재작업|정정\s*루프|rework/i, 'REWORK_LOOP'],
  [/도구\s*스코핑|tool\s*scoping/i, 'TOOL_SCOPING'],
  [/비용|cost/i, 'COST'],
  [/저장소\s*규범|repo\s*norms/i, 'REPO_NORMS'],
]

function classifyAxis(title: string): FeedbackAxis | null {
  for (const [re, axis] of AXIS_BY_NAME) {
    if (re.test(title)) return axis
  }
  return null
}

/** 부정 종결. "낭비는 없음", "과한 동원 않음" 처럼 마커를 뒤집는 표현들. */
const NEGATION = /없|않|아니|무관|드러나지/

/**
 * 마커가 **부정되지 않은 문장에** 나타났는지 본다.
 *
 * 단어 존재만 보면 "낭비 지점은 두드러지지 않음"이 낭비 있음(CONCERN)으로 뒤집힌다.
 * 문장 단위로 쪼개 같은 문장 안의 부정 종결을 확인하는 이유다.
 */
function hasUnnegated(body: string, marker: RegExp): boolean {
  const sentences = body.split(/(?<=[.!?])\s+|\n+/)
  return sentences.some((s) => marker.test(s) && !NEGATION.test(s))
}

/**
 * 판정은 명확한 표현이 있을 때만 매긴다. 애매하면 null 로 두는 편이,
 * 근거 없이 CONCERN 을 붙여 통계를 왜곡하는 것보다 낫다.
 */
function classifyVerdict(body: string): FeedbackVerdict | null {
  if (/판단\s*불가|근거가?\s*약/.test(body)) return 'INSUFFICIENT_EVIDENCE'
  if (hasUnnegated(body, /양호|강함|적절|준수|부합/)) return 'GOOD'
  if (hasUnnegated(body, /과함|과한|과도|누락|낭비|위반|미흡|부족/)) return 'CONCERN'
  return null
}

function parseFeedback(section: string | undefined, warnings: string[]): ParsedFeedback[] {
  if (!section) return []

  const items: ParsedFeedback[] = []
  const seen = new Set<FeedbackAxis>()
  // `**1. 위임 적절성** — 본문...` 단위로 쪼갠다.
  const blocks = section.split(/\n(?=\*\*\d+\.)/)

  for (const block of blocks) {
    const head = /^\*\*(\d+)\.\s*([^*]+?)\*\*\s*(?:[—–-]\s*)?([\s\S]*)$/.exec(block.trim())
    if (!head) continue

    const ordinal = Number(head[1])
    const axis = classifyAxis(head[2])
    if (!axis) {
      warnings.push(`알 수 없는 피드백 축: ${head[2].trim()}`)
      continue
    }
    // 축당 1행이 스키마 제약이므로 중복은 첫 번째만 취한다.
    if (seen.has(axis)) {
      warnings.push(`피드백 축 중복: ${axis}`)
      continue
    }
    seen.add(axis)

    const body = plain(head[3])
    items.push({ axis, ordinal, body, verdict: classifyVerdict(body) })
  }

  return items
}

// ─── 진입점 ─────────────────────────────────────────────────────────────────

export function parseRecord(markdown: string): ParsedRecord {
  const warnings: string[] = []
  const { fields, body } = parseFrontmatter(markdown)
  if (fields.size === 0) warnings.push('frontmatter 를 찾지 못했다')

  const tokens = parseInlineMap(fields.get('cost_tokens') ?? '')
  const sections = splitSections(body)

  const capturedRaw = fields.get('captured_at')
  const capturedAt = capturedRaw ? new Date(capturedRaw) : null
  if (capturedRaw && Number.isNaN(capturedAt?.getTime())) {
    warnings.push(`captured_at 을 해석할 수 없다: ${capturedRaw}`)
  }

  const agents: ParsedAgent[] = []
  const agentCounts = new Map<string, ParsedAgent>()
  for (const token of parseInlineList(fields.get('agents') ?? '')) {
    const { plugin, agent } = splitQualifiedAgent(token)
    const key = `${plugin ?? ''}:${agent}`
    const existing = agentCounts.get(key)
    // frontmatter 에 같은 에이전트가 반복 등장하면 반복 spawn 으로 센다.
    if (existing) {
      existing.spawnCount += 1
    } else {
      const entry: ParsedAgent = { plugin, agent, spawnCount: 1 }
      agentCounts.set(key, entry)
      agents.push(entry)
    }
  }

  const summary = sections.get('요약') ?? null
  const costNote = sections.get('비용메모') ?? null

  return {
    commitSha: fields.get('commit') ?? null,
    commitSubject: fields.get('commit_subject') ?? null,
    sessionId: fields.get('session_id') ?? null,
    capturedAt: capturedAt && !Number.isNaN(capturedAt.getTime()) ? capturedAt : null,
    eventCount: Number(fields.get('event_count') ?? 0) || 0,
    inputTokens: tokens.get('input') ?? 0,
    outputTokens: tokens.get('output') ?? 0,
    cacheReadTokens: tokens.get('cache_read') ?? 0,
    cacheCreationTokens: tokens.get('cache_creation') ?? 0,
    summary: summary ? plain(summary) : null,
    costNote: costNote ? plain(costNote) : null,
    agents,
    signals: parseSignals(sections.get('신호'), warnings),
    invocations: parseInvocations(sections.get('에이전트·도구사용내역'), warnings),
    feedback: parseFeedback(sections.get('피드백'), warnings),
    warnings,
  }
}
