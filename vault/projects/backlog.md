# Backlog — 다음 작업 리스트

> 갱신: 2026-07-23 | 우선순위: P0(긴급) → P1 → P2 → 기술부채

---

## P0. sync 요약 토큰 최적화 🔴

**문제**: `sync/generate-summaries.ts` 가 세션마다 `claude -p` 를 **개별 프로세스로 호출**한다.
호출마다 Claude Code 시스템 컨텍스트(~22k 토큰)를 cache_creation 으로 새로 지불하고
cache_read 는 0 → N개 세션이면 시스템 컨텍스트만 N×22k 토큰 낭비(270세션 ≈ 600만 토큰).
게다가 "마지막 요약 이후 변경된 모든 세션"을 대상으로 해 범위도 과하다.

### P0-1. 당일 발생 세션만 요약
- 대상 필터를 `state 기준 변경분 전체` → **`lastActivity(또는 started_at) 날짜 == 실행일(오늘)`** 로 변경.
- 멱등 유지: 오늘 세션이라도 이미 요약했고 미변경이면 skip(summary-state 병행).
- `--date YYYY-MM-DD` 옵션으로 특정일 재생성도 가능하게(선택).
- 파일: `sync/generate-summaries.ts`, `sync/core.ts`(날짜 필터 순수 함수 + 테스트).

### P0-2. 단일 Claude 세션 배치 요약 (cache 활용)
- N개 `claude -p` → **1개 호출로 당일 세션 전부 요약**.
  - 프롬프트에 세션별 블록(`### SESSION <id>\n<transcript>`)을 모아 넣고,
    `[{sessionId,title,description}, ...]` JSON 배열만 출력하도록 지시.
  - `--output-format json` 봉투의 `.result` 파싱 → sessionId 매칭 → 사이드카/업로드.
- 효과: CC 시스템 컨텍스트 cache_creation 을 **N회 → 1회**로 축소(핵심 절감).
- 컨텍스트 상한 대비 **청킹**: 총 프롬프트가 임계(예: ~80k토큰/세션 K개)를 넘으면 배치 분할.
  분할해도 세션당 1회가 아니라 배치당 1회.
- **cache_read 극대화(선택 강화)**: 배치가 여러 개면 첫 호출의 `session_id`(json 봉투)를
  받아 `claude -p --resume <id>` 로 이어 붙여, 2번째 배치부터 시스템 컨텍스트를
  cache_read(창작 대비 ~1/10)로 재사용.
- per-session transcript 길이를 배치용으로 축소(현재 12k → 3~4k) 검토.
- 파일: `sync/generate-summaries.ts`, `sync/core.ts`(배치 프롬프트 빌더 + 배열 파서 + 테스트).

### P0-3. 검증
- 실측: 기존 vs 신규 방식 토큰(`claude -p --output-format json` 의 `usage`)을 비교 로그로 남김.
- 요약 품질(제목·설명)이 개별 방식과 동등한지 샘플 확인.

---

## P1. UI Phase 2b-2 — 미개발 대시보드 🟡

AppShell 에 `Soon` 으로 자리만 있는 4개 화면. 백엔드(`/api/stats/*`, `/api/db/*`)는 준비 완료.
프리미티브(StatCard/FilterBar/RankTable/ChartCard/PageShell) 재사용.

- **P1-1. Plugins 대시보드** — `getPluginCounts`. plugin별 호출·skill/agent 구성·distinct resource.
  `last_used_at` 로 "최근 미사용 플러그인" 판별(리소스 레벨엔 없는 최근성 지표).
- **P1-2. Sub-agents 대시보드** — `getSubagentUsage`(v_subagent_resource_usage).
  subagent_type별 호출 리소스 랭킹 + type 필터. ⚠️ 토큰/비용 카드는 서버에 sub_agents 집계
  엔드포인트가 없어 별도 논의(엔드포인트 추가 or 세션 이벤트 집계).
- **P1-3. Projects 대시보드** — `getDailyTokens`(일별 추이 DateLineChart) + `getDbSessions`
  세션 목록(title/description/비용/이벤트수). 행 클릭 → 세션 상세.
- **P1-4. Compare** — 미사용 `SessionCompare` 부활, 데이터소스를 `getDbSessions`/
  `getDbSessionEvents` 로 전환.
- 각 화면 완성 시 AppShell 의 `Soon` 배지 제거.

---

## P2. UI Phase 2b-3 — 상세 뷰어 재디자인 + 데이터소스 전환 🟢

- **P2-1. SessionDetailPage** 라우트(`/sessions/:id/:tab`)를 AppShell 하위로, DB 세션 목록에서 진입.
- **P2-2. ChatView/ThinkingViewer/Timeline** 밀도형 스타일 재스킨(로직 불변, 클래스만).
- **P2-3. 데이터소스 전환** — 상세 이벤트 조회를 레거시 `/api/sessions/:id/events`(파일 파싱)
  → `/api/db/sessions/:id/events`(EventRow). `eventAdapter.ts`(EventRow→NormalizedEvent).
  ⚠️ EventRow 는 `agentId` 대신 `subAgentId(number)` → OriginBadge 표기 조정.
- **P2-4. DiffView 다크모드** — 하드코딩 red/green → destructive/success 토큰.
- **P2-5. 레거시 정리** — `/analytics`+GlobalAnalytics, 구 Sidebar 잔재, App.tsx 레거시 라우트,
  AllEventsFeed(Timeline과 중복) 제거 여부 결정.

---

## 기술부채 / 후속

- **useSessionSummary.test.ts 깨짐** — client 에 `@testing-library/dom`(RTL peer dep) 미설치로
  import 단계 실패(기존부터). 설치 또는 테스트 정리.
- **vite 번들 1.7MB** — 코드 스플릿(라우트별 lazy import)로 초기 로드 축소.
- **spawn_invocation_id 미연결(0건)** — 서브에이전트↔부모 Agent 정밀 연결키 재조사(현재 best-effort NULL).
- **plugin installed 여부** — `~/.claude/plugins` 매니페스트를 sync 가 주입해 "설치했으나 미사용" 판별.
- **DATA_DIR/DB_PATH 분리 권장** — 기본값이 실제 `~/.claude/projects` 와 섞임. 전용 디렉토리 권장.
- **user 표기** — 현재 git 이메일(users.identifier) 노출. 필터 라벨 다듬기.
