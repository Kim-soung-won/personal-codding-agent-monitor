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
  // 아래는 상세 조회에서만 채워진다(목록 API 는 위 3필드만 select). 계량치가 없던
  // 구버전 기록·목록 응답에서는 undefined 일 수 있어 옵셔널로 둔다.
  inputTokens?: number
  outputTokens?: number
  cacheReadTokens?: number
  cacheCreationTokens?: number
  toolCalls?: number
  errors?: number
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

export interface ToolResultSpike {
  len: number
  /** 이 결과가 컨텍스트에 잔류한 assistant 턴 수. 구버전 metrics 엔 없음(optional). */
  turns_resident?: number
  /** 재청구 추정 토큰(글자÷4 × 잔류 턴). 구버전 metrics 엔 없음 → len 기반 폴백. */
  rebilled_tokens?: number
  // 원인 라벨(distill 이 tool_use_id 로 귀속). 컨텍스트 급상승의 정체 — 있을 때만.
  /** 이 결과가 컨텍스트에 반영돼 급상승으로 나타나는 assistant 턴. */
  turn?: number
  /** 원인 도구(예: Read, Bash, Agent). */
  tool?: string
  /** 원인 대상(예: 파일명·명령 요약). */
  target?: string
}

/**
 * 세션 위생 계량치(서버 SessionHygiene 모델 미러).
 * 전 필드 nullable — null 은 "산출 불가"(0 과 구별). ?? 0 으로 뭉개지 않는다.
 */
export interface SessionHygiene {
  cacheRead: number | null
  cacheCreation: number | null
  crGenRatio: number | null
  maxToolResultLen: number | null
  toolResultSpikes: ToolResultSpike[] | null
  maxTurnContext: number | null
  maxTurnContextJump: number | null
  deltaShrank: boolean | null
  contextSizeSample: number | null
  sessionResets: number | null
  contextSlope: number | null
  contextSamples: number | null
  // 턴별 컨텍스트 시계열 `[turnIndex, ctx]`(전량). 구버전 기록엔 없어 null.
  contextSeries: Array<[number, number]> | null
  // 델타 내 총 assistant 턴 수(= API 호출 수).
  assistantTurns: number | null
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
  sessionHygiene: SessionHygiene | null
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

export interface SkillStatRow {
  skill: string
  plugin: string | null
  invocations: number
  commits: number
  errors: number
}

/** 개별 호출 이력 한 건 — GET /invocations. 축별 상세 페이지가 공유한다. */
export interface InvocationHistoryRow {
  id: string
  seq: number | null
  actor: string
  kind: InvocationKind | null
  resource: string
  plugin: string | null
  target: string | null
  note: string | null
  isError: boolean
  commitId: string
  commitSha: string
  commitSubject: string | null
  capturedAt: string
  project: string | null
}

export interface InvocationFilter {
  kind?: InvocationKind
  resource?: string
  plugin?: string
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
