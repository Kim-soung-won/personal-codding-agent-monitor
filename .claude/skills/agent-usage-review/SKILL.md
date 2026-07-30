---
name: agent-usage-review
description: >-
  "내 에이전트 사용 수준 평가해줘", "내가 에이전트/Claude Code 잘 쓰고 있나",
  "agent usage review", "위임·비용·정정 루프 어떤지 봐줘"처럼 커밋에 축적된 에이전트
  사용 이력을 근거로 사용 수준을 진단·평가할 때 읽는다. claude-code-observer MCP 서버의
  집계 도구를 호출해 5축 rubric 에 대조하고, 특정 커밋 기록을 인용해 근거 있게 답한다.
  데이터 자체의 화면·스키마 맥락은 [[commit-records_domain]]·[[stats_domain]]·
  [[session-hygiene_domain]] 을 참고한다.
metadata:
  type: workflow-skill
---

## 목적

UI 에 직접 들어가지 않고 Claude Code 에서 **"내 에이전트 사용 수준"**을 질의·평가한다.
데이터는 `claude-code-observer` MCP 서버(observer REST 를 래핑한 stdio 서버)가 제공하고,
**판정(수준)은 여기서** 한다 — 서버는 근거 데이터만 내고, 수준의 기준은 이 스킬이 쥔다.

## 대전제 — 근거 없는 판정 금지

- 모든 결론은 **집계 수치 + 특정 커밋 기록**으로 뒷받침한다. "위임을 과하게 한다" 같은
  단정은 반드시 `get_record` 로 그 커밋의 근거(feedback 본문·signals·hygiene)를 인용해 붙인다.
- `INSUFFICIENT_EVIDENCE` 판정이나 표본이 적은 축은 **"근거 부족"으로 남긴다** — 없는
  결론을 지어내지 않는다.
- `signal_summary` 의 부정 신호는 **FALSE_POSITIVE 비율과 함께** 읽는다. 오탐이 섞이므로
  단독으로 "나쁨"으로 판정하지 않는다.

## 절차

1. **넓게 집계 수집** — 아래 MCP 도구를 호출한다(대부분 인자 없음):
   - `feedback_breakdown` — 5축×판정 분포. **수준의 뼈대.**
   - `list_agent_usage` — 에이전트별 commits·spawns·토큰·toolCalls·**errors**.
   - `signal_summary` — 정정 루프·오탐율.
   - `token_trend` — 비용(COST) 추세.
   - `list_plugin_usage` — 사용이 몰리는 플러그인.
2. **약점 축 특정** — `feedback_breakdown` 에서 CONCERN 이 반복되는 축을 고른다.
3. **근거로 내려가기** — 그 축·에이전트로 `search_records`(예: `agent`, `from`/`to`)
   → 후보 커밋에 `get_record` 로 feedback 본문·signals·sessionHygiene·rawMarkdown 을 읽어
   **구체 사례**를 인용한다.
4. **5축 rubric 으로 판정** (아래) — 축별로 GOOD/주의/근거부족 + 한 줄 근거.
5. **종합 수준 + 다음 행동** — 강점/약점을 요약하고, 개선은 실행 가능한 1~2개로.

## 5축 rubric (판정 기준)

`agent-factory-plugin` 의 `feedback-rubric.md` 와 1:1 이다. 한쪽만 해석을 바꾸지 않는다.

| 축 (FeedbackAxis) | 무엇을 보나 | "수준 낮음" 신호 |
|---|---|---|
| **DELEGATION_FIT** 위임 적절성 | 서브에이전트를 격리·병렬이 정말 필요할 때 썼나 | 메인이 해도 될 일을 과잉 위임 / 대량 탐색을 위임 없이 직접 |
| **REWORK_LOOP** 재작업·정정 루프 | 같은 문제를 여러 라운드로 고쳤나 | 반복 CONCERN, 부정 신호(사과·정정)가 특정 패턴 뒤 |
| **TOOL_SCOPING** 도구 스코핑 | 도구를 필요 범위로 좁혀 썼나 | errors 높음 / 광범위·무목적 호출 |
| **COST** 비용 | 컨텍스트·토큰을 아꼈나 | token_trend 상승 + 세션 위생 안티패턴(리셋 없는 누적) |
| **REPO_NORMS** 저장소 규범 | 프로젝트 관례를 지켰나 | 규범 위반 CONCERN |

> COST 축은 [[session-hygiene_domain]] 의 컨텍스트 누적·재청구 신호와 함께 본다.
> 비율·수치 하나로 단정하지 말고 세션 길이·추세와 교차한다.

## 출력 형식(권장)

- **한 줄 총평** — 강점 1, 약점 1.
- **축별 표** — 축 / 판정 / 근거(수치 + 커밋 sha 인용).
- **다음 행동** — 약점 축을 겨냥한 실행 가능한 1~2개.

## MCP 서버가 안 뜰 때

`claude-code-observer` 도구가 없으면 `~/.claude/mcp.json` 등록과 observer 서버 기동
(`~/.agent-factory/config.json` 의 apiBase 접속 가능 여부)을 먼저 확인한다. 로컬 모드
전용이 아니라 REST 가 닿는 곳이면 어디든 동작한다.
