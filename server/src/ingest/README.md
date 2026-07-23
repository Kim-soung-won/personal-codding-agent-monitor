# `server/src/ingest/` — JSONL → DB 적재

업로드된(또는 백필된) jsonl 을 파싱해 DB 테이블에 채운다. **ingest-on-upload**:
`/api/sync/*` 핸들러가 파일 저장 직후 호출. 파일 단위 **delete+reinsert** 로 멱등.

| 파일 | 역할 |
|------|------|
| `session-ingest-service.ts` | `ingestSessionFile` / `ingestSubagentFile` — 오케스트레이션 |
| `session-meta.ts` | title(ai/custom)·cwd·gitBranch·version 추출 |
| `tool-correlation.ts` | tool_use ↔ tool_result 상관(is_error, duration) |
| `source-file-guard.ts` | mtime 가드(shouldSkip) + 적재 기록(markIngested) |
| `summary-sidecar.ts` | `.summary.json` → description |

> 파서는 기존 `parser/JsonlEventParser` 재사용(`IEventParser` 불변). usage 는 `shared/pricing`,
> 리소스는 `shared/resource-extract` 재사용.

---

## `ingestSessionFile(db, {encoded, sessionId, text, mtimeMs, filePath, identity?})`

```
if shouldSkip(filePath, mtimeMs): return false          # 이미 최신 → 스킵(멱등/증분)

events = parseLines(text, 'main')                        # 파싱 + id 중복제거(라인 반복 대응)
scalars = extractSessionScalars(events)                  # cwd, gitBranch, version
{aiTitle, customTitle} = extractTitles(events)           # ai-title/custom-title (unknown이라 raw로)
sidecar = loadSummarySidecar(dir, sessionId)             # description

transaction:
    projectId = upsertProject(encoded, cwd)              # encoded UNIQUE
    userId    = upsertUser(identity)                     # git:email / 'unknown'
    upsert sessions(id, projectId, userId)               # FK 부모 먼저 확보

    delete events/resource_invocations/usage             # WHERE session_id=? AND sub_agent_id IS NULL
                                                         #   (재적재 멱등, 최초엔 0행)
    insertEvents(buildEventRows(events))                 # unknown 카테고리 제외, onConflict(id) doNothing
    insert resource_invocations(buildResourceRows)       # tool_use→kind/plugin/resource + 상관(is_error)
    insert usage(buildUsageRows)                         # requestId 중복제거, day=ts[:10]
    upsertPlugins(resourceRows)                          # first/last_used_at 누적

    update sessions SET title=custom??ai, description,   # 집계 재계산
                        started/last_activity, event_count, total_cost_usd
    markIngested(filePath, mtimeMs)

return true
```

## `ingestSubagentFile(db, {encoded, sessionId, agentFile, text, mtimeMs, filePath})`

```
if shouldSkip: return false
events = parseLines(text, 'subagent')
agentUuid    = event.agentId ?? filename('agent-{id}')
{subagent_type, plugin} = extractAttribution(events, 'subagent')   # attributionAgent/Plugin

transaction:
    projectId = upsertProject(encoded, cwd)
    upsert sessions(id, projectId) onConflict doNothing            # 부모 세션 없을 수 있음(최소행)
    subAgentId = upsertSubAgent(sessionId, agentUuid, type, plugin)

    delete events/resource_invocations/usage WHERE sub_agent_id = subAgentId
    insert ... (same builders, ctx.subAgentId = subAgentId)

    update sub_agents SET tokens=sum(usage), status=(any is_error? 'error':'unknown'),
                         spawn_invocation_id = lookup(sourceToolAssistantUUID)   # best-effort
    update sessions.total_cost_usd = sum(all usage)               # 서브에이전트 포함
    markIngested
```

---

## 핵심 규칙 / 함정

- **id 중복제거**: 같은 event uuid 가 한 파일에 여러 번(라인 반복) 또는 파일 경계(main↔subagent)에
  나온다 → `parseLines` 에서 dedupe + events insert `onConflict doNothing`(PK 충돌·이중집계 방지).
- **best-effort ingest**: 파일 저장은 이미 성공했으므로, ingest 실패는 throw 되어 호출부가
  `{ingested:false}` 로만 응답(500 아님). 원본 보존 우선.
- **plugin 분리**: skill 은 `plugin:resource`, agent 의 `subagent_type` 도 `plugin:agent` 면 분리.
- **알려진 한계**: `spawn_invocation_id` 연결키(sourceToolAssistantUUID)가 실측에서 안 맞아 대부분 NULL.
  "어떤 sub-agent가 호출했나"는 `sub_agent_id` 로 동작하므로 부가 정보로만 남김.
