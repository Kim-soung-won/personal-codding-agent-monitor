---
name: stats_domain
description: >-
  `client/src/pages/SubAgentsPage.tsx` 또는 `client/src/pages/PluginsPage.tsx`를
  수정하거나, 에이전트·플러그인·신호·피드백·토큰의 커밋 누적 집계 화면이 어떤
  데이터를 쓰고 왜 이렇게 집계하는지 알아야 할 때 읽는다. 커밋 단위 원자
  데이터·상세 화면은 [[commit-records_domain]]을 참고한다.
metadata:
  type: domain-skill
  confidence:
    unconfirmed: []
    inferred: []
---

## 한 줄 정의

특정 커밋이 아니라 **커밋을 가로질러** "이 에이전트/플러그인이 실제로 값을
하는가"를 누적 집계로 보여주는 화면군.

## 화면

| 라우트 | 컴포넌트 | 역할 |
|---|---|---|
| `/subagents` | `SubAgentsPage.tsx` | 서브에이전트별 spawn·토큰·도구호출·에러 (커밋 누적) |
| `/plugins` | `PluginsPage.tsx` | 플러그인별 소속 에이전트·spawn·토큰·에러 (커밋 누적) |

두 화면 모두 `RankTable`(막대 랭킹 테이블) + 상단 `StatCard` 4개 조합이다.

`SignalStatRow`(`getSignalStats()`)는 전용 라우트 없이
[[commit-records_domain]]의 `CommitRecordsPage.tsx` 목록 화면 상단 요약 카드
("확정 부정/긍정 신호", "신호 감지 정밀도")에서 인라인으로 소비된다 —
목록 화면의 필터 결과가 아니라 **전역** 집계라는 점에 주의.

## 데이터

권위 원천: `client/src/types/agentFactory.ts`, `server/src/agent-factory/routes.ts`.

### API 명세

**`GET /api/agent-factory/stats/agents`**

- Query: 없음
- Response: `AgentStatRow[]` — `{ plugin, agent, commits, spawns, inputTokens, outputTokens, cacheReadTokens, cacheCreationTokens, toolCalls, errors }`
- 에러 응답: 500 `{ success: false, error: string }`

**`GET /api/agent-factory/stats/plugins`**

- Query: 없음
- Response: `PluginStatRow[]` — `{ plugin, agents, commits, spawns, inputTokens, outputTokens, cacheReadTokens, cacheCreationTokens, toolCalls, errors }`
- 에러 응답: 500 동일 포맷

**`GET /api/agent-factory/stats/signals`**

- Query: 없음
- Response: `SignalStatRow[]` — `{ polarity, verdict, count }`
- 에러 응답: 500 동일 포맷

**`GET /api/agent-factory/stats/feedback`** — 소비 화면 미구현(의도된 대기 상태, 아래 참고)

- Query: 없음
- Response: `FeedbackStatRow[]` — `{ axis, verdict, count }`
- 에러 응답: 500 동일 포맷

**`GET /api/agent-factory/stats/tokens/daily`** — 소비 화면 미구현(의도된 대기 상태, 아래 참고)

- Query: 없음(내부적으로 최근 90일 `LIMIT`)
- Response: `DailyTokenRow[]` — `{ day, commits, inputTokens, outputTokens, cacheRead, cacheCreation }`
- 에러 응답: 500 동일 포맷

> **확정**: `FeedbackStatRow`·`DailyTokenRow`(및 위 두 엔드포인트, 클라이언트
> `getFeedbackStats()`/`getDailyTokens()`)는 이미 구현되어 있지만 이를 렌더하는
> 화면은 아직 없다. 이는 조사 중 발견한 공백이 아니라 **의도된 미구현 대기
> 상태**다 — `vault/projects/spec.md` §8 "Phase 2b — 클라이언트 통계
> 대시보드"에서 소비할 예정으로 확정되었다.

## 핵심 제약사항

- 모든 groupBy 집계는 **커밋 누적 전체 기준**이다 — `/subagents`, `/plugins`
  화면엔 기간·프로젝트 필터 UI가 없다(기간 필터는 [[commit-records_domain]]의
  목록 화면에만 있다).
- `stats/plugins`는 `plugin`이 `null`인 `RecordAgent`(플러그인 밖에서 직접
  호출된 에이전트)를 집계에서 제외한다.
- 계량치(토큰·도구호출·에러)는 `metrics.json` 사이드카가 붙은 기록부터
  채워진다. 두 화면 모두 `hasMetrics` 파생값으로 "계량치는 metrics
  사이드카가 붙은 기록부터 채워진다"는 안내 문구를 조건부로 보여준다.

## 핵심 의사 결정

- **spawn·토큰·에러를 한 화면에 묶은 이유**: 라우트 주석("이 에이전트가
  실제로 값을 하는가의 1차 근거")대로, 호출 빈도만으로는 위임이 유효했는지
  알 수 없고 산출물(토큰)과 실패(에러)를 함께 봐야 판단할 수 있어서다.
- **신호 정밀도(precision) 지표**: `negConfirmed / (negConfirmed + negFalse)`로
  계산한다(`CommitRecordsPage.tsx`). distill(결정론적 사전 플래그)이 얼마나
  정확한지, 즉 **감지기 자체의 오탐률**을 추적 대상으로 삼기 위해 확정 건수뿐
  아니라 오탐 건수도 함께 집계한다.
