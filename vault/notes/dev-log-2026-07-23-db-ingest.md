# Dev Log — 2026-07-23 (DB ingest, Phase 2a)

## 세션 목표
JSONL 을 요청마다 재파싱해 서빙하던 구조 위에, 파싱 결과를 **SQLite 에 적재**하는 ingest
파이프라인 + Repository + 통계 REST 를 추가(2차 Phase 2a). 목표는 검색·필터·집계
(사용자별·프로젝트별·agent별·skill별·plugin별)와 Resource 평가.

---

## 결정

- **SQLite + better-sqlite3 + Kysely** (사용자 선택: "지금은 나만, 곧 팀 확장" → SQLite로 시작하되
  Kysely로 Postgres 교체 경로 확보). node:sqlite 는 Kysely SqliteDialect 호환 위해 커스텀 드라이버가
  필요해 제외.
- **DDL을 `db/schema.ts` 문자열 상수로** — tsc가 .sql을 dist로 복사하지 않아 Docker 런타임에서
  누락되는 문제. schema.sql 은 제거(단일 소스 = schema.ts).
- **Dockerfile alpine → bookworm-slim** — better-sqlite3 prebuilt 바이너리(musl 아님) 사용, 네이티브 빌드 회피.
- **ingest-on-upload** — 별도 배치 대신 `/api/sync/*` 핸들러에서 파일 저장 후 파싱·upsert.
  파일 저장 성공 시 ingest 는 best-effort(실패해도 500 아님).

---

## 실측으로 확정한 JSONL 필드 (S-999)

- `attributionSkill`(main assistant 최상위) / `attributionAgent`·`attributionPlugin`(subagent 최상위) —
  tool_use 파싱보다 신뢰도 높은 attribution.
- tool_result 는 user 이벤트 `message.content[]` 블록 `{tool_use_id, is_error, content}` — **is_error 직접 존재**,
  휴리스틱 불필요. assistant tool_use `id` ↔ `tool_use_id` 상관.
- ai-title/custom-title 은 `aiTitle`/`customTitle` 최상위. 파서는 이를 'unknown' 분류하나 raw 보존 → ingest에서 직접 취함.
- cwd = 실제 프로젝트 경로(encoded 역디코딩 불필요).
- 서브에이전트 파일명 `agent-{agentId}` ↔ 이벤트 `agentId`.

---

## 구현 중 발견한 버그 (실제 데이터 백필로 표면화)

1. **events.id PK 충돌** — 같은 uuid가 (a) 한 파일 내 여러 라인, (b) main↔subagent 파일 경계에서 중복.
   → (a) `parseLines` 에서 id 중복제거(기존 클라이언트 dedupe와 동일 semantics), (b) events insert `onConflict doNothing`.
   백필: 세션 145 · 서브에이전트 244, 에러 0. 재실행 시 0건(mtime 가드 멱등).

## 알려진 한계

- **spawn_invocation_id 0/244** — sourceToolAssistantUUID 키가 부모 Agent 호출과 안 맞음.
  "어떤 sub-agent가 호출했나"는 `sub_agent_id` 로 동작하므로 best-effort로 남김.
- plugin installed 여부는 매니페스트 필요. false negative(안 뜬 리소스)는 측정 불가.

---

## 검증
- server tsc 클린, 테스트 57개 통과(8 파일: migrate/session-ingest/stats-repository/resource-extract 신규).
- 실제 `~/.claude/projects` 백필로 end-to-end 검증(플러그인 집계·sub-agent 리소스·제목 129개·MCP 에러율).

## 남은 것 (Phase 2b)
- 클라이언트 통계 대시보드(리소스/플러그인 평가, 날짜·유저 필터). `/api/stats/*` 소비.
