import { sql, type Kysely } from 'kysely'
import type { DB } from '../db/types.js'

export interface StatsFilter {
  projectId?: number
  userId?: number
  /** ISO8601 하한(포함) */
  from?: string
  /** ISO8601 상한(포함) */
  to?: string
}

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

export interface StatsRepository {
  resourceCounts(filter?: StatsFilter & { kind?: string }): Promise<ResourceCountRow[]>
  pluginCounts(filter?: StatsFilter): Promise<PluginCountRow[]>
  subagentResourceUsage(
    filter?: StatsFilter & { subagentType?: string },
  ): Promise<SubagentUsageRow[]>
  dailyTokens(filter?: StatsFilter): Promise<DailyTokenRow[]>
}

/**
 * 뷰(v_*)와 동일한 그룹핑을 베이스 테이블에 WHERE 필터와 함께 재구성한다
 * (뷰는 파라미터를 받지 못하므로). 필터 없는 호출은 뷰 결과와 동일한 전체 집계를 반환한다.
 */
export class KyselyStatsRepository implements StatsRepository {
  constructor(private readonly db: Kysely<DB>) {}

  async resourceCounts(
    filter: StatsFilter & { kind?: string } = {},
  ): Promise<ResourceCountRow[]> {
    return this.db
      .selectFrom('resource_invocations')
      .select([
        'kind',
        'plugin',
        'resource',
        'mcp_server',
        sql<number>`count(*)`.as('calls'),
        sql<number>`count(distinct session_id)`.as('sessions'),
        sql<number>`count(distinct project_id)`.as('projects'),
        sql<number>`count(distinct user_id)`.as('users'),
        sql<number>`sum(coalesce(is_error, 0))`.as('errors'),
      ])
      .$if(filter.projectId != null, (qb) => qb.where('project_id', '=', filter.projectId!))
      .$if(filter.userId != null, (qb) => qb.where('user_id', '=', filter.userId!))
      .$if(filter.kind != null, (qb) => qb.where('kind', '=', filter.kind!))
      .$if(filter.from != null, (qb) => qb.where('timestamp', '>=', filter.from!))
      .$if(filter.to != null, (qb) => qb.where('timestamp', '<=', filter.to!))
      .groupBy(['kind', 'plugin', 'resource', 'mcp_server'])
      .orderBy('calls', 'desc')
      .execute()
  }

  async pluginCounts(filter: StatsFilter = {}): Promise<PluginCountRow[]> {
    return this.db
      .selectFrom('resource_invocations')
      .select([
        sql<string>`plugin`.as('plugin'),
        sql<number>`count(*)`.as('calls'),
        sql<number>`sum(case when kind = 'skill' then 1 else 0 end)`.as('skill_calls'),
        sql<number>`sum(case when kind = 'agent' then 1 else 0 end)`.as('agent_calls'),
        sql<number>`count(distinct resource)`.as('distinct_resources'),
        sql<number>`count(distinct session_id)`.as('sessions'),
        sql<number>`count(distinct project_id)`.as('projects'),
        sql<number>`count(distinct user_id)`.as('users'),
        sql<string>`min(timestamp)`.as('first_used_at'),
        sql<string>`max(timestamp)`.as('last_used_at'),
      ])
      .where('plugin', 'is not', null)
      .$if(filter.projectId != null, (qb) => qb.where('project_id', '=', filter.projectId!))
      .$if(filter.userId != null, (qb) => qb.where('user_id', '=', filter.userId!))
      .$if(filter.from != null, (qb) => qb.where('timestamp', '>=', filter.from!))
      .$if(filter.to != null, (qb) => qb.where('timestamp', '<=', filter.to!))
      .groupBy('plugin')
      .orderBy('calls', 'desc')
      .execute()
  }

  async subagentResourceUsage(
    filter: StatsFilter & { subagentType?: string } = {},
  ): Promise<SubagentUsageRow[]> {
    return this.db
      .selectFrom('resource_invocations as ri')
      .innerJoin('sub_agents as sa', 'sa.id', 'ri.sub_agent_id')
      .select([
        'sa.subagent_type as subagent_type',
        'ri.kind as kind',
        'ri.plugin as plugin',
        'ri.resource as resource',
        'ri.mcp_server as mcp_server',
        sql<number>`count(*)`.as('calls'),
        sql<number>`count(distinct ri.session_id)`.as('sessions'),
      ])
      .$if(filter.subagentType != null, (qb) =>
        qb.where('sa.subagent_type', '=', filter.subagentType!),
      )
      .$if(filter.projectId != null, (qb) => qb.where('ri.project_id', '=', filter.projectId!))
      .$if(filter.userId != null, (qb) => qb.where('ri.user_id', '=', filter.userId!))
      .groupBy(['sa.subagent_type', 'ri.kind', 'ri.plugin', 'ri.resource', 'ri.mcp_server'])
      .orderBy('calls', 'desc')
      .execute()
  }

  async dailyTokens(filter: StatsFilter = {}): Promise<DailyTokenRow[]> {
    return this.db
      .selectFrom('usage')
      .select([
        'day',
        'project_id',
        'user_id',
        sql<number>`sum(input_tokens)`.as('input_tokens'),
        sql<number>`sum(output_tokens)`.as('output_tokens'),
        sql<number>`sum(cache_write)`.as('cache_write'),
        sql<number>`sum(cache_read)`.as('cache_read'),
        sql<number>`sum(cost_usd)`.as('cost_usd'),
      ])
      .$if(filter.projectId != null, (qb) => qb.where('project_id', '=', filter.projectId!))
      .$if(filter.userId != null, (qb) => qb.where('user_id', '=', filter.userId!))
      .$if(filter.from != null, (qb) => qb.where('day', '>=', filter.from!))
      .$if(filter.to != null, (qb) => qb.where('day', '<=', filter.to!))
      .groupBy(['day', 'project_id', 'user_id'])
      .orderBy('day', 'asc')
      .execute()
  }
}
