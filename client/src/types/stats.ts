/**
 * 서버 DB 집계 응답 타입 미러 (server/src/repositories/* 와 1:1).
 * 이 프로젝트는 shared 타입 패키지 대신 수동 미러링 관례를 따른다(types/events.ts 와 동일).
 */

export interface ResourceCountRow {
  kind: string
  plugin: string | null
  resource: string
  mcp_server: string | null
  calls: number
  sessions: number
  projects: number
  users: number
  errors: number
}

export interface PluginCountRow {
  plugin: string
  calls: number
  skill_calls: number
  agent_calls: number
  distinct_resources: number
  sessions: number
  projects: number
  users: number
  first_used_at: string
  last_used_at: string
}

export interface SubagentUsageRow {
  subagent_type: string | null
  kind: string
  plugin: string | null
  resource: string
  mcp_server: string | null
  calls: number
  sessions: number
}

export interface DailyTokenRow {
  day: string
  project_id: number
  user_id: number | null
  input_tokens: number
  output_tokens: number
  cache_write: number
  cache_read: number
  cost_usd: number
}

export interface DbSessionRow {
  id: string
  project_id: number
  user_id: number | null
  title: string | null
  ai_title: string | null
  custom_title: string | null
  description: string | null
  git_branch: string | null
  cc_version: string | null
  started_at: string | null
  last_activity_at: string | null
  event_count: number
  total_cost_usd: number
  ingested_at: string
}

export interface DbEventRow {
  id: string
  sessionId: string
  subAgentId: number | null
  origin: string
  category: string
  type: string | null
  timestamp: string
  summary: string | null
  raw: unknown
}

export interface ProjectRow {
  id: number
  encoded: string
  path: string
  name: string
}

export interface UserRow {
  id: number
  identifier: string
  display_name: string | null
}

/** 통계 조회 공통 필터. */
export interface StatsFilter {
  projectId?: number | null
  userId?: number | null
  from?: string
  to?: string
  kind?: string | null
  subagentType?: string | null
}
