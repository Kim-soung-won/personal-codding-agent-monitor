import { dirname } from 'node:path'
import { sql, type Insertable, type Kysely, type Transaction } from 'kysely'
import type { DB } from '../db/types.js'
import { JsonlEventParser } from '../parser/index.js'
import type { NormalizedEvent } from '../types.js'
import {
  extractToolCalls,
  toResourceInvocation,
  extractAttribution,
} from '../../../shared/resource-extract.js'
import { readUsage, calcCostUsd, type UsageEntry } from '../../../shared/pricing.js'
import { correlateToolOutcomes } from './tool-correlation.js'
import { extractTitles, extractSessionScalars, projectName } from './session-meta.js'
import { loadSummarySidecar } from './summary-sidecar.js'
import { shouldSkip, markIngested } from './source-file-guard.js'

const parser = new JsonlEventParser()

export interface Identity {
  email: string
  name?: string
}

export interface IngestSessionParams {
  encoded: string
  sessionId: string
  text: string
  mtimeMs: number
  filePath: string
  identity?: Identity
}

export interface IngestSubagentParams {
  encoded: string
  sessionId: string
  agentFile: string
  text: string
  mtimeMs: number
  filePath: string
}

/**
 * 라인들을 파서로 정규화(blank/invalid 는 null → skip). unknown 카테고리도 유지.
 * 같은 uuid 가 여러 라인에 중복 등장하므로 id 로 중복 제거한다(기존 클라이언트와 동일 semantics:
 * events PK 충돌 방지 + 리소스 이중집계 방지).
 */
function parseLines(text: string, sessionId: string, origin: 'main' | 'subagent'): NormalizedEvent[] {
  const events: NormalizedEvent[] = []
  const seen = new Set<string>()
  for (const line of text.split('\n')) {
    const ev = parser.parse(line, sessionId, origin)
    if (!ev) continue
    if (seen.has(ev.id)) continue
    seen.add(ev.id)
    events.push(ev)
  }
  return events
}

const CHUNK = 200
async function insertChunked<T extends keyof DB>(
  trx: Transaction<DB>,
  table: T,
  rows: Array<Insertable<DB[T]>>,
): Promise<void> {
  for (let i = 0; i < rows.length; i += CHUNK) {
    await trx.insertInto(table).values(rows.slice(i, i + CHUNK)).execute()
  }
}

/**
 * events 는 uuid PK 가 파일 경계를 넘어(main↔subagent) 중복될 수 있어 onConflict doNothing.
 * 같은 uuid 의 정본 행이 이미 있으면 유지(표시용 테이블이므로 무해). FK 는 그대로 만족된다.
 */
async function insertEventsChunked(
  trx: Transaction<DB>,
  rows: Array<Insertable<DB['events']>>,
): Promise<void> {
  for (let i = 0; i < rows.length; i += CHUNK) {
    await trx
      .insertInto('events')
      .values(rows.slice(i, i + CHUNK))
      .onConflict((oc) => oc.column('id').doNothing())
      .execute()
  }
}

/** events 테이블 행(실행 이력) — unknown 카테고리는 제외. */
function buildEventRows(
  events: NormalizedEvent[],
  subAgentId: number | null,
): Array<Insertable<DB['events']>> {
  return events
    .filter((e) => e.category !== 'unknown')
    .map((e) => {
      const raw = e.raw as Record<string, unknown>
      return {
        id: e.id,
        session_id: e.sessionId,
        sub_agent_id: subAgentId,
        origin: e.origin,
        category: e.category,
        type: typeof raw.type === 'string' ? raw.type : null,
        parent_uuid: typeof raw.parentUuid === 'string' ? raw.parentUuid : null,
        timestamp: e.timestamp,
        summary: e.summary,
        raw: JSON.stringify(e.raw),
      }
    })
}

/** resource_invocations 행 — tool_use/슬래시커맨드에서 추출 + 결과 상관. */
function buildResourceRows(
  events: NormalizedEvent[],
  ctx: { sessionId: string; projectId: number; userId: number | null; subAgentId: number | null },
): Array<Insertable<DB['resource_invocations']>> {
  const calls = extractToolCalls(events)
  const outcomes = correlateToolOutcomes(events)
  const rows: Array<Insertable<DB['resource_invocations']>> = []

  for (const call of calls) {
    const inv = toResourceInvocation(call)
    if (!inv) continue

    let plugin: string | null = inv.plugin ?? null
    let resource = inv.resource
    // agent 의 subagent_type 이 plugin:agent 형태면 플러그인 분리
    if (!plugin && inv.kind === 'agent') {
      const ci = resource.indexOf(':')
      if (ci > 0) {
        plugin = resource.slice(0, ci)
        resource = resource.slice(ci + 1) || resource
      }
    }
    const mcpServer = inv.kind === 'mcp' ? (call.name.split('__')[1] ?? null) : null
    const source =
      inv.kind === 'skill'
        ? call.input._source === 'slash-command'
          ? 'slash-command'
          : 'auto'
        : null
    const outcome = outcomes.get(call.id)

    rows.push({
      event_id: call.eventId,
      session_id: ctx.sessionId,
      project_id: ctx.projectId,
      user_id: ctx.userId,
      sub_agent_id: ctx.subAgentId,
      kind: inv.kind,
      plugin,
      resource,
      mcp_server: mcpServer,
      source,
      timestamp: call.timestamp,
      duration_ms: outcome?.durationMs ?? null,
      is_error: outcome?.isError ?? null,
      interrupted: outcome?.interrupted ?? null,
    })
  }
  return rows
}

/** usage 행 — requestId 로 중복제거(최대 output_tokens 유지), 비용·day 계산. */
function buildUsageRows(
  events: NormalizedEvent[],
  ctx: { sessionId: string; projectId: number; userId: number | null; subAgentId: number | null },
): Array<Insertable<DB['usage']>> {
  const byReq = new Map<string, { u: UsageEntry; ts: string }>()
  const standalone: Array<{ u: UsageEntry; ts: string }> = []

  for (const ev of events) {
    const u = readUsage(ev.raw)
    if (!u) continue
    if (!u.requestId) {
      standalone.push({ u, ts: ev.timestamp })
      continue
    }
    const prev = byReq.get(u.requestId)
    if (!prev || u.usage.outputTokens > prev.u.usage.outputTokens) {
      byReq.set(u.requestId, { u, ts: ev.timestamp })
    }
  }

  const all = [...byReq.values(), ...standalone]

  return all.map(({ u, ts }) => ({
    session_id: ctx.sessionId,
    sub_agent_id: ctx.subAgentId,
    project_id: ctx.projectId,
    user_id: ctx.userId,
    request_id: u.requestId ?? null,
    model: u.model ?? null,
    input_tokens: u.usage.inputTokens,
    output_tokens: u.usage.outputTokens,
    cache_write: u.usage.cacheWrite,
    cache_read: u.usage.cacheRead,
    cost_usd: calcCostUsd(u.usage, u.model),
    timestamp: ts,
    day: ts.slice(0, 10),
  }))
}

async function upsertProject(trx: Transaction<DB>, encoded: string, path: string): Promise<number> {
  const name = projectName(path)
  await trx
    .insertInto('projects')
    .values({ encoded, path, name })
    .onConflict((oc) => oc.column('encoded').doUpdateSet({ path, name }))
    .execute()
  const row = await trx
    .selectFrom('projects')
    .select('id')
    .where('encoded', '=', encoded)
    .executeTakeFirstOrThrow()
  return row.id
}

async function upsertUser(trx: Transaction<DB>, identity?: Identity): Promise<number> {
  const identifier = identity ? `git:${identity.email}` : 'unknown'
  await trx
    .insertInto('users')
    .values({ identifier, display_name: identity?.name ?? null, created_at: new Date().toISOString() })
    .onConflict((oc) => oc.column('identifier').doUpdateSet({ display_name: identity?.name ?? null }))
    .execute()
  const row = await trx
    .selectFrom('users')
    .select('id')
    .where('identifier', '=', identifier)
    .executeTakeFirstOrThrow()
  return row.id
}

async function upsertPlugins(
  trx: Transaction<DB>,
  rows: Array<Insertable<DB['resource_invocations']>>,
): Promise<void> {
  const byPlugin = new Map<string, { first: string; last: string }>()
  for (const r of rows) {
    if (!r.plugin) continue
    const ts = String(r.timestamp)
    const cur = byPlugin.get(r.plugin)
    if (!cur) byPlugin.set(r.plugin, { first: ts, last: ts })
    else {
      if (ts < cur.first) cur.first = ts
      if (ts > cur.last) cur.last = ts
    }
  }
  for (const [name, { first, last }] of byPlugin) {
    await trx
      .insertInto('plugins')
      .values({ name, first_seen_at: first, last_used_at: last })
      .onConflict((oc) =>
        // DO UPDATE 에서 bare 컬럼명은 기존 행 값(SQLite) → 최초/최종 관측을 누적 갱신
        oc.column('name').doUpdateSet({
          first_seen_at: sql<string>`min(first_seen_at, ${first})`,
          last_used_at: sql<string>`max(last_used_at, ${last})`,
        }),
      )
      .execute()
  }
}

/**
 * 메인 세션 jsonl 을 파싱해 DB 에 적재한다(파일 단위 delete+reinsert 로 멱등).
 * 원본 파일 저장은 이미 성공한 상태이므로, 여기서 throw 되면 호출부가 ingested:false 로만 처리.
 */
export async function ingestSessionFile(db: Kysely<DB>, params: IngestSessionParams): Promise<boolean> {
  const { encoded, sessionId, text, mtimeMs, filePath, identity } = params
  if (await shouldSkip(db, filePath, mtimeMs)) return false

  const events = parseLines(text, sessionId, 'main')
  if (events.length === 0) return false

  const rawEvents = events.map((e) => e.raw as Record<string, unknown>)
  const scalars = extractSessionScalars(rawEvents)
  const path = scalars.cwd ?? `/unknown/${encoded}`
  const { aiTitle, customTitle } = extractTitles(rawEvents)
  const projectDir = dirname(filePath)
  const sidecar = await loadSummarySidecar(projectDir, sessionId)

  await db.transaction().execute(async (trx) => {
    const projectId = await upsertProject(trx, encoded, path)
    const userId = await upsertUser(trx, identity)

    // 세션 행 확보(FK 부모). 재적재면 UPDATE.
    const now = new Date().toISOString()
    await trx
      .insertInto('sessions')
      .values({ id: sessionId, project_id: projectId, user_id: userId, ingested_at: now })
      .onConflict((oc) =>
        oc.column('id').doUpdateSet({ project_id: projectId, user_id: userId }),
      )
      .execute()

    // 메인 스레드 파생 행 삭제 후 재삽입(멱등)
    await trx.deleteFrom('resource_invocations').where('session_id', '=', sessionId).where('sub_agent_id', 'is', null).execute()
    await trx.deleteFrom('usage').where('session_id', '=', sessionId).where('sub_agent_id', 'is', null).execute()
    await trx.deleteFrom('events').where('session_id', '=', sessionId).where('sub_agent_id', 'is', null).execute()

    const ctx = { sessionId, projectId, userId, subAgentId: null }
    const eventRows = buildEventRows(events, null)
    const resourceRows = buildResourceRows(events, ctx)
    const usageRows = buildUsageRows(events, ctx)

    await insertEventsChunked(trx, eventRows)
    await insertChunked(trx, 'resource_invocations', resourceRows)
    await insertChunked(trx, 'usage', usageRows)
    await upsertPlugins(trx, resourceRows)

    // 세션 집계 재계산
    const timestamps = eventRows.map((r) => String(r.timestamp)).sort()
    const totalCost = usageRows.reduce((s, r) => s + Number(r.cost_usd ?? 0), 0)
    const title = customTitle ?? aiTitle ?? null
    await trx
      .updateTable('sessions')
      .set({
        title,
        ai_title: aiTitle ?? null,
        custom_title: customTitle ?? null,
        description: sidecar.description ?? null,
        git_branch: scalars.gitBranch ?? null,
        cc_version: scalars.version ?? null,
        started_at: timestamps[0] ?? null,
        last_activity_at: timestamps[timestamps.length - 1] ?? null,
        event_count: eventRows.length,
        total_cost_usd: totalCost,
      })
      .where('id', '=', sessionId)
      .execute()

    await markIngested(trx, filePath, sessionId, 'main', mtimeMs)
  })

  return true
}

/**
 * 서브에이전트 jsonl 을 적재한다. 부모 세션 행이 없으면 최소 행을 만들어 FK 를 만족시킨다.
 */
export async function ingestSubagentFile(db: Kysely<DB>, params: IngestSubagentParams): Promise<boolean> {
  const { encoded, sessionId, agentFile, text, mtimeMs, filePath } = params
  if (await shouldSkip(db, filePath, mtimeMs)) return false

  const events = parseLines(text, sessionId, 'subagent')
  if (events.length === 0) return false

  const rawEvents = events.map((e) => e.raw as Record<string, unknown>)
  const scalars = extractSessionScalars(rawEvents)
  const path = scalars.cwd ?? `/unknown/${encoded}`

  // agent 식별: 파일명 agent-{id} 또는 이벤트 agentId
  const agentUuidFromFile = agentFile.replace(/^agent-/, '').replace(/\.jsonl$/, '')
  const agentUuid =
    (typeof rawEvents.find((r) => typeof r.agentId === 'string')?.agentId === 'string'
      ? (rawEvents.find((r) => typeof r.agentId === 'string')!.agentId as string)
      : agentUuidFromFile)

  // attribution 으로 subagent_type/plugin 판별
  let subagentType: string | null = null
  let plugin: string | null = null
  for (const r of rawEvents) {
    const attr = extractAttribution(r, 'subagent')
    if (attr?.agent) {
      subagentType = attr.agent
      if (attr.plugin) plugin = attr.plugin
      // subagent_type 이 plugin:agent 형태면 분리
      if (!plugin) {
        const ci = subagentType.indexOf(':')
        if (ci > 0) {
          plugin = subagentType.slice(0, ci)
          subagentType = subagentType.slice(ci + 1) || subagentType
        }
      }
      break
    }
  }

  const sourceToolAssistantUuid = rawEvents.find(
    (r) => typeof r.sourceToolAssistantUUID === 'string',
  )?.sourceToolAssistantUUID as string | undefined

  await db.transaction().execute(async (trx) => {
    const projectId = await upsertProject(trx, encoded, path)

    // 부모 세션 최소 행 보장(아직 메인 파일이 적재 안 됐을 수 있음)
    const now = new Date().toISOString()
    await trx
      .insertInto('sessions')
      .values({ id: sessionId, project_id: projectId, ingested_at: now })
      .onConflict((oc) => oc.column('id').doNothing())
      .execute()

    // sub_agents 행 확보
    await trx
      .insertInto('sub_agents')
      .values({ session_id: sessionId, agent_uuid: agentUuid, subagent_type: subagentType, plugin })
      .onConflict((oc) =>
        oc.columns(['session_id', 'agent_uuid']).doUpdateSet({ subagent_type: subagentType, plugin }),
      )
      .execute()
    const subAgent = await trx
      .selectFrom('sub_agents')
      .select('id')
      .where('session_id', '=', sessionId)
      .where('agent_uuid', '=', agentUuid)
      .executeTakeFirstOrThrow()
    const subAgentId = subAgent.id

    // 이 서브에이전트 파생 행 삭제 후 재삽입
    await trx.deleteFrom('resource_invocations').where('sub_agent_id', '=', subAgentId).execute()
    await trx.deleteFrom('usage').where('sub_agent_id', '=', subAgentId).execute()
    await trx.deleteFrom('events').where('sub_agent_id', '=', subAgentId).execute()

    const ctx = { sessionId, projectId, userId: null, subAgentId }
    const eventRows = buildEventRows(events, subAgentId)
    const resourceRows = buildResourceRows(events, ctx)
    const usageRows = buildUsageRows(events, ctx)

    await insertEventsChunked(trx, eventRows)
    await insertChunked(trx, 'resource_invocations', resourceRows)
    await insertChunked(trx, 'usage', usageRows)
    await upsertPlugins(trx, resourceRows)

    // sub_agents 집계
    const timestamps = eventRows.map((r) => String(r.timestamp)).sort()
    const tokens = usageRows.reduce(
      (a, r) => ({
        input: a.input + Number(r.input_tokens ?? 0),
        output: a.output + Number(r.output_tokens ?? 0),
        cw: a.cw + Number(r.cache_write ?? 0),
        cr: a.cr + Number(r.cache_read ?? 0),
        cost: a.cost + Number(r.cost_usd ?? 0),
      }),
      { input: 0, output: 0, cw: 0, cr: 0, cost: 0 },
    )
    const hasError = resourceRows.some((r) => r.is_error === 1)
    // spawn 연결: sourceToolAssistantUUID = 부모 Agent tool_use 이벤트 uuid
    let spawnInvocationId: number | null = null
    if (sourceToolAssistantUuid) {
      const parent = await trx
        .selectFrom('resource_invocations')
        .select('id')
        .where('session_id', '=', sessionId)
        .where('kind', '=', 'agent')
        .where('event_id', '=', sourceToolAssistantUuid)
        .executeTakeFirst()
      spawnInvocationId = parent?.id ?? null
    }

    await trx
      .updateTable('sub_agents')
      .set({
        description: null,
        spawn_invocation_id: spawnInvocationId,
        started_at: timestamps[0] ?? null,
        ended_at: timestamps[timestamps.length - 1] ?? null,
        status: hasError ? 'error' : 'unknown',
        input_tokens: tokens.input,
        output_tokens: tokens.output,
        cache_write: tokens.cw,
        cache_read: tokens.cr,
        cost_usd: tokens.cost,
      })
      .where('id', '=', subAgentId)
      .execute()

    // 부모 세션 총 비용/최종활동 재계산(서브에이전트 usage 포함)
    const agg = await trx
      .selectFrom('usage')
      .select([sql<number>`coalesce(sum(cost_usd),0)`.as('cost'), sql<string | null>`max(timestamp)`.as('last')])
      .where('session_id', '=', sessionId)
      .executeTakeFirst()
    if (agg) {
      await trx
        .updateTable('sessions')
        .set({ total_cost_usd: Number(agg.cost ?? 0) })
        .where('id', '=', sessionId)
        .execute()
    }

    await markIngested(trx, filePath, sessionId, 'subagent', mtimeMs)
  })

  return true
}
