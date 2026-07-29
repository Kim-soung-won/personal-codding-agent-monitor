---
name: local-session_domain
description: >-
  `client/src/App.tsx` 내부에 인라인 정의된 `SessionPage`/`ProjectPage`/
  `ProjectsListPage`/`ComparePage`/`AnalyticsPage`(라우트 `/s/:sessionId/:tab`,
  `/p/:projectEncoded/:tab`, `/projects`, `/compare`, `/analytics`)를
  수정하거나, 이 로컬 JSONL 기반 화면들이 커밋 기록 제품과 데이터 소스·스코프가
  어떻게 다른지 알아야 할 때 읽는다. 커밋 기록 제품 화면은
  [[commit-records_domain]], 그 누적 집계는 [[stats_domain]]을 참고한다.
metadata:
  type: domain-skill
  confidence:
    unconfirmed: []
    inferred: []
---

## 한 줄 정의

`~/.claude/projects/**/*.jsonl` 원본을 실시간으로 파싱·시각화하던 **1세대
관측 화면**. 커밋 기록 제품(`CommitRecord`) 도입 이전의 원래 기획이며,
로컬 파일 모드에서만 동작한다.

## 화면

| 라우트 | 컴포넌트 | 역할 |
|---|---|---|
| `/s/:sessionId/:tab` (`chat`/`thinking`/`tokens`/`resources`) | `SessionPage`(`App.tsx` 내부) | 세션 하나의 대화·thinking·토큰·리소스 4탭 |
| `/p/:projectEncoded/:tab` (`thinking`/`tokens`/`resources`) | `ProjectPage`(`App.tsx` 내부) | 프로젝트 내 세션 선택 또는 "전체 집계"로 병합 뷰 |
| `/projects` | `ProjectsListPage`(`App.tsx` 내부) | 프로젝트 카드 목록(레거시) |
| `/compare` | `ComparePage`(`App.tsx` 내부) | 세션 두 개 나란히 비교(레거시) |
| `/analytics` | `AnalyticsPage`(`App.tsx` 내부, `GlobalAnalytics` 컴포넌트) | 전체 세션 집계 |
| `/reference/pricing` | `HomePage`(`App.tsx` 내부) | 구 홈, 참고자료로 격하 |

[[commit-records_domain]]의 커밋 기록 화면(`/`, `/records/:id`)에서 "세션 대화
보기" 버튼을 누르면 `SessionPage`의 `chat` 탭(`/s/:sessionId/chat`)으로
이동한다 — 커밋을 만든 실제 대화 턴을 로컬 모드에서 확인하기 위한 유일한
연결점이다.

## 데이터

권위 원천: `client/src/types/events.ts`(`NormalizedEvent`/`SessionInfo`),
`server/src/index.ts`(엔드포인트), `server/src/scanner/`·`server/src/watcher/`.

| 타입 | 필드 |
|---|---|
| `SessionInfo` | `projectPath/projectEncoded/sessionId/filePath/lastModified/subagentFilePaths/title?/description?` |
| `NormalizedEvent` | `id/sessionId/timestamp/category/raw/summary/origin/agentId?` — `category`는 `user-input/thinking/tool-use/assistant-text/context-injection/file-edit/system/unknown` |

### API 명세

**`GET /api/sessions`**

- Query/Path: 없음
- Response: `{ success: true, data: SessionInfo[] }` — `scanSessions(DATA_DIR)` 결과
- 에러 응답: 500 `{ success: false, error: string }`

**`GET /api/sessions/:sessionId/events`**

- Path: `sessionId`
- Response: `{ success: true, data: NormalizedEvent[] }` — 메인 파일 + 서브에이전트 파일 병합
- 에러 응답: 404 `{ success: false, error: 'Session not found' }` · 500 동일 포맷

**`GET /api/sessions/:sessionId/cost`**

- Path: `sessionId`
- Response: `{ success: true, data: { estimatedCostUsd, ... } }` — `collectUsage`+`aggregateUsageByModel`로 requestId 중복 제거 후 집계
- 에러 응답: 404 `{ success: false, error: 'Session not found' }` · 500 동일 포맷

실시간 갱신은 WebSocket(`ws://.../?token=`)으로 별도 전달되며, 히스토리는
REST로 선 로드 후 신규 이벤트만 append한다(`useWebSocket` 훅).

## 핵심 제약사항

- **클라우드에서는 비어 있다.** `CLAUDE_DATA_DIR`가 로컬 `~/.claude/projects`
  경로에 의존하므로, 클라우드 배포에는 실제 파일이 없어 이 화면들은 데이터가
  없다(`CLAUDE.md` 핵심 설계 결정: "이 계열 화면은 로컬 모드 전용").
- 경로 디코딩이 역방향 불가능하다 — Claude Code가 `/`와 `_`를 모두 `-`로
  인코딩하므로 `projectPath`는 표시용(display-only)이고, 실제 탐색은
  `resolveSegments()`(scanner)가 파일시스템을 직접 훑어 찾는다.
- 이벤트 버퍼는 최근 500개로 제한된다(서버 메모리·클라이언트 상태 모두).
- `ProjectPage`가 "전체 집계"로 여러 세션을 병합할 때 `sessionCount` 만큼
  `fetchSessionEvents`를 `Promise.all`로 병렬 호출한다 — 세션 수가 많은
  프로젝트일수록 느려질 수 있다.

## 핵심 의사 결정

- **커밋 기록 제품과 별개로 유지하는 이유**: `CommitRecord`는 훅이 로컬에서
  이미 요약·해석까지 끝낸 결과만 서버로 올리는 구조라 원본 JSONL이 서버에
  없다. 반면 이 화면들은 "지금 이 순간 Claude가 어떤 thinking·tool_use를
  하고 있는가"를 원본 그대로 보여줘야 해서, 원본 동기화(sync 잡)가 여전히
  필요하다 — 관측 단위(이벤트 단위 vs 커밋 델타 단위) 자체가 다르다.
  (`CLAUDE.md` "기획 의도 재정의" 참고.)
- **레거시로 격하된 이유**: `/projects`·`/compare`는 "Phase 2b에서 대시보드로
  대체 예정"이지만 URL로는 여전히 접근 가능하게 남겨뒀다(`App.tsx` 주석) —
  당장 지우면 그 경로로 확인하던 작업 흐름이 끊기기 때문으로 보인다.
- **프로젝트 → 세션 2단계 필터링**: 세션이 많아질수록 단일 드롭다운 선택이
  어려워져, 프로젝트를 먼저 고르면 세션 목록이 좁혀지도록 분리했다
  (`vault/projects/spec.md` UX 결정, 2026-05-22).
