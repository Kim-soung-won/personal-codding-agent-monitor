import type { Generated } from 'kysely'

/**
 * Kysely 스키마 타입. schema.ts 의 DDL 과 1:1 대응.
 * Generated<T> = INSERT 시 생략 가능(PK 자동 증가 또는 DEFAULT 존재).
 * 뷰는 읽기 전용이므로 평문 타입(selectFrom 으로 조회).
 */
export interface DB {
  schema_migrations: {
    version: number
    applied_at: string
  }
  users: {
    id: Generated<number>
    identifier: string
    display_name: string | null
    created_at: string
  }
  projects: {
    id: Generated<number>
    encoded: string
    path: string
    name: string
  }
  plugins: {
    id: Generated<number>
    name: string
    source: string | null
    version: string | null
    installed: number | null
    first_seen_at: string | null
    last_used_at: string | null
  }
  sessions: {
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
    event_count: Generated<number>
    total_cost_usd: Generated<number>
    ingested_at: string
  }
  sub_agents: {
    id: Generated<number>
    session_id: string
    agent_uuid: string
    subagent_type: string | null
    plugin: string | null
    description: string | null
    spawn_invocation_id: number | null
    started_at: string | null
    ended_at: string | null
    status: string | null
    input_tokens: Generated<number>
    output_tokens: Generated<number>
    cache_write: Generated<number>
    cache_read: Generated<number>
    cost_usd: Generated<number>
  }
  events: {
    id: string
    session_id: string
    sub_agent_id: number | null
    origin: string
    category: string
    type: string | null
    parent_uuid: string | null
    timestamp: string
    summary: string | null
    raw: string
  }
  resource_invocations: {
    id: Generated<number>
    event_id: string | null
    session_id: string
    project_id: number
    user_id: number | null
    sub_agent_id: number | null
    kind: string
    plugin: string | null
    resource: string
    mcp_server: string | null
    source: string | null
    timestamp: string
    duration_ms: number | null
    is_error: number | null
    interrupted: number | null
  }
  usage: {
    id: Generated<number>
    session_id: string
    sub_agent_id: number | null
    project_id: number
    user_id: number | null
    request_id: string | null
    model: string | null
    input_tokens: Generated<number>
    output_tokens: Generated<number>
    cache_write: Generated<number>
    cache_read: Generated<number>
    cost_usd: Generated<number>
    timestamp: string | null
    day: string
  }
  source_files: {
    path: string
    session_id: string | null
    origin: string | null
    mtime_ms: number
    ingested_at: string
  }
  // ─── 읽기 전용 뷰 ───
  v_resource_counts: {
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
  v_subagent_resource_usage: {
    subagent_type: string | null
    kind: string
    plugin: string | null
    resource: string
    mcp_server: string | null
    calls: number
    sessions: number
  }
  v_daily_tokens: {
    day: string
    project_id: number
    user_id: number | null
    input_tokens: number
    output_tokens: number
    cache_write: number
    cache_read: number
    cost_usd: number
  }
  v_plugin_counts: {
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
}
