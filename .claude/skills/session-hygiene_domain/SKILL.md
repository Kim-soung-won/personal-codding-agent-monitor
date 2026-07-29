---
name: session-hygiene_domain
description: >-
  `client/src/components/ui/CacheReuseCard.tsx` 또는
  `client/src/pages/CommitRecordDetailPage.tsx`의 `SessionHygieneSection`을
  수정하거나, 컨텍스트 누적·캐시 재사용·재청구 비용 지표의 의미·임계치가
  필요하면 읽는다. 이 카드들이 배치되는 화면 전체 맥락은
  [[commit-records_domain]]을 참고한다.
metadata:
  type: domain-skill
  confidence:
    unconfirmed: []
    inferred: []
---

## 한 줄 정의

커밋 델타의 컨텍스트 위생(피드백 축 중 `COST`) 신호 — "컨텍스트가 언제
부풀었는가 = 초과 비용이 발생한 시점 = 다음 세션을 어떻게 끊을지의
harness 힌트"를 두 카드(캐시 재사용, 세션 위생)로 시각화한다.

## 화면

`/records/:id`(`CommitRecordDetailPage.tsx`) 하단, 도구 사용 내역 표와 원문
사이에 순서대로 렌더된다:

1. `CacheReuseCard`(`client/src/components/ui/CacheReuseCard.tsx`) — "캐시
   재사용 — 왜 M 단위인가"
2. `SessionHygieneSection`(`CommitRecordDetailPage.tsx` 내부 컴포넌트) — 위생
   경고 카드 + 재청구 비용 큰 도구 결과 목록

`sessionHygiene`이 없거나(구버전 기록) `CacheReuseCard`가 자체 조건으로
`null`을 반환하면(아래 핵심 제약사항) 해당 카드는 렌더되지 않는다.

## 데이터

권위 원천: `client/src/types/agentFactory.ts`의 `SessionHygiene`/`ToolResultSpike`,
`server/prisma/schema.prisma`의 `SessionHygiene` 모델(`CommitRecord`와 1:1).

| 필드 | 의미 |
|---|---|
| `cacheRead` / `cacheCreation` | 이 델타에서 재사용/신규생성된 캐시 컨텍스트 토큰 |
| `crGenRatio` | `cacheCreation / cacheRead`(%) — "재청구 컨텍스트 세(稅)" |
| `maxToolResultLen` | 델타 내 최대 tool_result 길이 |
| `toolResultSpikes` | 잔류·재청구된 대용량 tool_result 목록(최대 10건). `{ len, turns_resident?, rebilled_tokens? }` — 뒤 두 필드는 구버전엔 없음(additive) |
| `maxTurnContext` / `maxTurnContextJump` | 단일 턴 최대 컨텍스트 / 인접 턴 최대 증가폭 |
| `deltaShrank` | 이 델타에서 compact/clear 발생 여부 |
| `contextSeries` | 턴별 컨텍스트 시계열 `[[turnIndex, ctx], ...]`(전량, 다운샘플 없음) — 스파크라인의 입력 |
| `assistantTurns` | 델타 내 총 assistant 턴 수(= API 호출 수) |
| `contextSizeSample` / `sessionResets` / `contextSlope` / `contextSamples` | 세션 누적 스코프(커밋 간 증분 복원) — 리셋 횟수·기울기 |

### API

별도 엔드포인트가 없다. [[commit-records_domain]]의
`GET /api/agent-factory/records/:id` 응답에 `sessionHygiene` 필드로 포함되어
함께 온다.

## 핵심 제약사항

- **전 필드 nullable — null은 "산출 불가"이지 0이 아니다.** 샘플 부족(<2),
  `cacheCreation=0`, 세션 누적 저장 실패 등에서 null이 나오며, 어떤 층에서도
  `?? 0`으로 뭉개지 않는다(`fmtHyg()`가 null을 "산출 불가" 문자열로 명시 표기).
- `CacheReuseCard`는 `contextSeries`가 비어있거나(`series.length === 0`)
  `cacheRead === 0`이면 `null`을 반환해 렌더하지 않는다 — 구버전 기록의 폴백은
  상세 페이지가 처리한다.
- 경고 임계치는 `CommitRecordDetailPage.tsx` 상단에 하드코딩된 상수다:
  `SLOPE_WARN = 40000`, `JUMP_WARN = 100000`, `CR_RATIO_WARN = 50`. 커밋 델타
  규모에 맞춘 경험값이며 근거 문서는 없다.
- 재청구 추정치(`rebilled_tokens`)는 근사치다: 글자 ÷ 4 토큰 환산 × 잔류 턴.
  델타 내부의 compact/clear는 반영하지 않는다.
- `toolResultSpikes`의 정렬·막대 기준은 절대 크기(`len`)가 아니라 재청구
  추정 비용이다 — `rebilled_tokens`가 있으면 그 값을, 구버전(없음)엔
  `approxTokens(len)`으로 폴백한다.

## 핵심 의사 결정

- **"왜 M 단위인가" 카드의 존재 이유**: `cache_read`는 매 API 호출마다
  이전 컨텍스트를 다시 읽은 값의 누적합이라, 실제 세션이 담고 있는 컨텍스트
  크기보다 훨씬 커 보인다. 이 오해를 풀기 위해 `avg ctx × calls` 로 분해해
  "같은 토큰이 N번 반복 카운팅된다"는 걸 명시적으로 보여준다.
- **"리셋 없이 컨텍스트 단조 누적"이 가장 강한 경고인 이유**: `sessionResets
  === 0`이면서 `contextSlope`가 크면, 한 번도 정리 안 된 채 계속 커지는
  세션이라는 뜻 — 다른 경고(단일 턴 급증, 재청구 세)보다 구조적으로 더
  나쁜 신호로 취급한다.
- **재청구 비용이 큰 도구 결과 목록의 정렬 기준을 절대 크기가 아니라
  "크기 × 잔류 턴"으로 잡은 이유**: "세션 초반에 생겨 오래 얹힌 결과가,
  크지만 세션 끝에 생긴 결과보다 (누적 재청구 관점에서) 더 비싸다"는 것이
  이 카드가 전달하려는 핵심 통찰이다.
- **`contextSeries`를 다운샘플 없이 전량 저장하는 이유**: 스파크라인이
  컨텍스트가 부푼 정확한 지점(턴)을 그대로 보여줘야 "이 지점에서
  compact/clear를 검토하라"는 harness 힌트가 성립하기 때문이다.
