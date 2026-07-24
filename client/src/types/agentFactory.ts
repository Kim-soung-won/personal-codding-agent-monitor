/**
 * 서버 `/api/agent-factory/*` 응답 타입 미러.
 * 원본은 server/prisma/schema.prisma — 필드를 바꾸면 양쪽을 함께 고친다.
 */

export type RecordStatus = 'CAPTURED' | 'SUMMARIZED'
export type SignalPolarity = 'NEGATIVE' | 'POSITIVE'
export type SignalChannel = 'OUTPUT' | 'INPUT'
export type SignalVerdict = 'CONFIRMED' | 'FALSE_POSITIVE'
export type InvocationRowType = 'ITEM' | 'AGGREGATE'
export type InvocationKind = 'AGENT' | 'SKILL' | 'MCP' | 'TOOL'
export type FeedbackAxis =
  | 'DELEGATION_FIT'
  | 'REWORK_LOOP'
  | 'TOOL_SCOPING'
  | 'COST'
  | 'REPO_NORMS'
export type FeedbackVerdict = 'GOOD' | 'CONCERN' | 'INSUFFICIENT_EVIDENCE'

export const AXIS_LABEL: Record<FeedbackAxis, string> = {
  DELEGATION_FIT: '위임 적절성',
  REWORK_LOOP: '재작업·정정 루프',
  TOOL_SCOPING: '도구 스코핑',
  COST: '비용',
  REPO_NORMS: '저장소 규범 준수',
}

export interface ProjectRef {
  id: number
  name: string
}

export interface UserRef {
  id: number
  identifier: string
  displayName: string | null
}

export interface RecordAgentRow {
  plugin: string | null
  agent: string
  spawnCount: number
}

export interface SignalRow {
  id?: string
  polarity: SignalPolarity
  channel?: SignalChannel
  verdict: SignalVerdict
  turnRef?: string | null
  excerpt?: string | null
  note?: string | null
  flaggedCount?: number | null
  confirmedCount: number | null
}

export interface InvocationRow {
  id: string
  seq: number | null
  rowType: InvocationRowType
  actor: string
  kind: InvocationKind | null
  resource: string
  plugin: string | null
  target: string | null
  note: string | null
  isError: boolean
}

export interface FeedbackRow {
  id: string
  axis: FeedbackAxis
  ordinal: number
  body: string
  verdict: FeedbackVerdict | null
}

/** 목록 행 — rawMarkdown 을 뺀 경량 표현. */
export interface CommitRecordSummary {
  id: string
  commitSha: string
  commitSubject: string | null
  revision: number
  sessionId: string
  capturedAt: string
  eventCount: number
  inputTokens: number
  outputTokens: number
  cacheReadTokens: number
  cacheCreationTokens: number
  status: RecordStatus
  summary: string | null
  project: ProjectRef
  user: UserRef | null
  agents: RecordAgentRow[]
  signals: SignalRow[]
  _count: { invocations: number }
}

export interface CommitRecordDetail extends Omit<CommitRecordSummary, '_count' | 'signals'> {
  costNote: string | null
  rawMarkdown: string
  signals: SignalRow[]
  invocations: InvocationRow[]
  feedback: FeedbackRow[]
}

export interface RecordPage {
  total: number
  page: number
  pageSize: number
  items: CommitRecordSummary[]
}

export interface AgentStatRow {
  plugin: string | null
  agent: string
  commits: number
  spawns: number
  inputTokens: number
  outputTokens: number
  cacheReadTokens: number
  cacheCreationTokens: number
  toolCalls: number
  errors: number
}

export interface PluginStatRow {
  plugin: string | null
  agents: number
  commits: number
  spawns: number
  inputTokens: number
  outputTokens: number
  cacheReadTokens: number
  cacheCreationTokens: number
  toolCalls: number
  errors: number
}

export interface SignalStatRow {
  polarity: SignalPolarity
  verdict: SignalVerdict
  count: number
}

export interface FeedbackStatRow {
  axis: FeedbackAxis
  verdict: FeedbackVerdict | null
  count: number
}

export interface DailyTokenRow {
  day: string
  commits: number
  inputTokens: number
  outputTokens: number
  cacheRead: number
  cacheCreation: number
}

export interface RecordFilter {
  projectId?: number | null
  userId?: number | null
  agent?: string | null
  status?: RecordStatus | null
  from?: string
  to?: string
  page?: number
  pageSize?: number
}
