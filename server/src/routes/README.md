# `server/src/routes/` — Express 라우터

모든 라우트는 `/api` 하위이며 상위에서 `app.use('/api', requireAuth)` 로 **토큰 인증**된다.
DB 기반 신규 엔드포인트는 기존 파일 기반(`/api/sessions*`)과 **분리된 네임스페이스**에 둬서
점진 전환한다.

| 파일 | 마운트 | 역할 |
|------|--------|------|
| `sync.ts` | `/api/sync` | 로컬 잡 업로드(파일 저장 + DB ingest) |
| `stats.ts` | `/api/stats` | 통계 조회(리소스·플러그인·sub-agent·일별토큰) |
| `db-sessions.ts` | `/api/db/sessions` | DB 기반 세션·이벤트 조회 |

> 기존 `index.ts` 의 `/api/sessions`, `/api/sessions/:id/events`, `/api/sessions/:id/cost`
> (파일 스캔 기반)는 **그대로 유지**. 클라이언트 전환 시점은 Phase 2b 에서 결정.

---

## `sync.ts` — `createSyncRouter(dataDir, {db})`

```
PUT /session/:encoded/:sessionId   (body=raw jsonl)
    validate 경로 세그먼트(../, \0 거부) + non-empty
    atomicWrite(dataDir/encoded/sessionId.jsonl)        # ① 원본 저장(백업). 실패 시 500
    try: ingestSessionFile(db, {..., identity: X-User-* 헤더})   # ② best-effort
    → 200 {success:true, ingested:bool, ingestError?}   # ingest 실패해도 500 아님(원본 보존)

PUT /subagent/:encoded/:sessionId/:agentFile  → 동일 패턴, ingestSubagentFile
PUT /manifest                (body=JSON)      → dataDir/manifest.json (DB 무관)
PUT /summary/:sessionId?encoded=  (body=JSON) → .summary.json + UPDATE sessions.description(best-effort)

# ✱ DELETE 라우트는 의도적으로 없음 (additive-only 방어선)
```

## `stats.ts` — `createStatsRouter(statsRepo)`

```
GET /resources    ?projectId&userId&kind&from&to   → StatsRepo.resourceCounts
GET /plugins       ?projectId&userId&from&to        → pluginCounts
GET /subagents     ?subagentType&projectId&userId   → subagentResourceUsage
GET /tokens/daily  ?projectId&userId&from&to        → dailyTokens
# 모두 {success:true, data:[...]}  (query 파싱: num()/str() 로 방어적 변환)
```

## `db-sessions.ts` — `createDbSessionsRouter(sessionRepo, eventRepo)`

```
GET /                        ?projectId&userId   → listSessions
GET /:sessionId/events       ?includeSubagents   → listEventsForSession
```

---

## 응답 규약

```
성공: { success: true, data?: ... }
실패: { success: false, error: string }   (HTTP 4xx/5xx)
업로드: { success: true, ingested: boolean, ingestError?: string }
```
