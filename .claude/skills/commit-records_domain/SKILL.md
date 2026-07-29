---
name: commit-records_domain
description: >-
  `client/src/pages/CommitRecordsPage.tsx` 또는
  `client/src/pages/CommitRecordDetailPage.tsx`를 수정하거나, 커밋 기록
  목록/상세 화면이 어떤 데이터를 쓰고 왜 이런 지표를 상단에 노출하는지 알아야
  할 때 읽는다. 세션 위생·캐시 재사용 카드의 의미는 [[session-hygiene_domain]],
  서브에이전트/플러그인 누적 집계 화면은 [[stats_domain]], 로컬 JSONL 기반
  레거시 화면과의 스코프 차이는 [[local-session_domain]]을 읽는다.
metadata:
  type: domain-skill
  confidence:
    unconfirmed: []
    inferred: []
---

## 한 줄 정의

이 제품의 본체 화면. "커밋 델타 1건 = `CommitRecord` 1행"을 목록으로 훑고
(`/`), 그 안에서 무슨 에이전트를 불렀고 무엇이 어긋났는지 상세로 파고드는
(`/records/:id`) 화면.

## 화면

| 라우트 | 컴포넌트 | 역할 |
|---|---|---|
| `/` | `CommitRecordsPage.tsx` | 기간·프로젝트·작성자·에이전트 필터 + 목록 + 상단 요약 카드 |
| `/records/:id` | `CommitRecordDetailPage.tsx` | 신호·요약·비용메모·피드백·서브에이전트·도구 사용 내역·세션위생·원문 |

## 데이터

권위 원천: `client/src/types/agentFactory.ts`(클라이언트 타입 미러),
`server/prisma/schema.prisma`(단일 소스), `server/src/agent-factory/routes.ts`(엔드포인트).

| 타입 | 화면에서 쓰는 필드 | 대응 Prisma 모델 |
|---|---|---|
| `CommitRecordSummary` | `commitSha/commitSubject/revision/capturedAt/eventCount/inputTokens/outputTokens/cacheReadTokens/cacheCreationTokens/status/summary/project/user/agents/signals/_count.invocations` | `CommitRecord`(목록 select — `rawMarkdown` 제외) |
| `CommitRecordDetail` | 위 + `costNote/rawMarkdown/invocations/feedback/sessionHygiene` | `CommitRecord` + relations 전체 include |
| `RecordAgentRow` | `plugin/agent/spawnCount` + (있으면) `inputTokens/outputTokens/cacheReadTokens/cacheCreationTokens/toolCalls/errors` | `RecordAgent` |
| `SignalRow` | `polarity/channel/verdict/turnRef/excerpt/note/flaggedCount/confirmedCount` | `Signal` |
| `InvocationRow` | `seq/rowType/actor/kind/resource/plugin/target/note/isError` | `ToolInvocation` |
| `FeedbackRow` | `axis/ordinal/body/verdict` | `FeedbackItem` |
| `SessionHygiene` | 상세 페이지 하단 두 카드가 소비 — 필드·의미는 [[session-hygiene_domain]] 참고 | `SessionHygiene` |

### API 명세

**`GET /api/agent-factory/records`** — 목록.

- Query: `projectId?`(number) · `userId?`(number) · `agent?`(string) ·
  `status?`(`CAPTURED`\|`SUMMARIZED`) · `from?`/`to?`(YYYY-MM-DD, 서버가 `to`를
  그날 23:59:59.999 까지 확장) · `page?`(기본 1) · `pageSize?`(기본 20, 상한 100)
- Response: `{ total, page, pageSize, items: CommitRecordSummary[] }`
- 에러 응답: 500 `{ success: false, error: string }` (파라미터 파싱·DB 오류 시)

**`GET /api/agent-factory/records/:id`** — 상세. `rawMarkdown` 포함.

- Path: `id`(CommitRecord.id, cuid)
- Response: `CommitRecordDetail`
- 에러 응답: 404 `{ success: false, error: '기록을 찾을 수 없다' }` · 500 동일 포맷

**`GET /api/agent-factory/meta`** — 필터 드롭다운용 차원.

- Response: `{ projects: ProjectRef[], users: UserRef[] }`
- 에러 응답: 500 동일 포맷

목록 화면은 이 세 엔드포인트 외에 `getAgentStats()`·`getSignalStats()`도 함께
호출해 필터 옵션과 상단 요약 카드를 채운다 — 그 집계 의미는 [[stats_domain]] 참고.

## 핵심 제약사항

- 목록 API는 `rawMarkdown`을 select하지 않는다(건당 수 KB — 응답이 급격히
  커진다). 원문은 상세 조회에서만 온다.
- `Signal`은 `CONFIRMED`뿐 아니라 `FALSE_POSITIVE`도 저장한다 — distill(결정론적
  층)이 사전 플래그한 것을 summarizer가 맥락으로 재판정한 결과이며, 오탐도
  남겨야 "감지기 정밀도" 자체를 추적할 수 있다.
- `FeedbackItem`은 `(recordId, axis)` unique — 축(`FeedbackAxis`)당 한 항목만
  존재한다. `feedback-rubric.md`의 5축과 1:1이므로 한쪽만 고치지 않는다.
- `RecordAgent`의 토큰/도구/에러 계량치는 `metrics.json` 사이드카가 붙어야
  채워진다. 사이드카가 없는 구버전 기록은 `spawnCount`만 있고 나머지는
  `undefined`(목록) 또는 `0`(상세 응답 기본값) — 화면은 `hasMetrics` 플래그로
  "계량치 없음(구버전 기록)" 문구를 따로 보여준다.
- 상태 `CAPTURED`는 훅이 커밋 델타는 잡았지만 아직 summarizer가 돌지 않은
  중간 상태다. 목록에서 "요약 대기" 뱃지로 노출한다(2단계 적재 근거는
  `CLAUDE.md`).

## 핵심 의사 결정

- **관측 단위가 세션도 이벤트도 아니고 "커밋 델타"인 이유**: 커밋은 개발자가
  스스로 그은 의미 단위이고 이미 리뷰·회고의 단위라서다(`CLAUDE.md` 기획
  의도 재정의, 2026-07-24).
- **상단 요약 카드가 절대 토큰 수 대신 해석 지표(예상 비용 USD, 컨텍스트
  재사용률 %)를 쓰는 이유**: 사람이 숫자를 보자마자 "좋다/나쁘다"를 판단할 수
  있게 하기 위함. `contextReuseRate()`(`client/src/lib/format.ts`)가 그 변환을
  맡는다.
- **신호를 목록 화면 최상단에 노출하는 이유**: `feedback-rubric.md`의 1단계가
  신호(sentiment marker) 판정이라, 화면도 그 순서를 그대로 따른다.
- **원문(.md) 접기/펼치기 토글**: 파싱이 놓친 뉘앙스를 원문으로 바로 확인할 수
  있게 — `rawMarkdown`을 항상 보관하는 원본 무손실 설계와 짝을 이룬다.
