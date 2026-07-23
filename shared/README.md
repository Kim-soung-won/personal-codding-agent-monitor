# `shared/` — client·server·sync 공유 로직

한 곳에서 정의해 여러 런타임이 재사용하는 순수 로직. **부수효과 없음**(파일/DB/네트워크 X,
단 `project-path` 만 fs 읽기). client 는 `@shared/*` alias, server/sync 는 상대경로로 import.

| 파일 | 역할 | 쓰는 곳 |
|------|------|--------|
| `pricing.ts` | 모델별 토큰 단가 + usage 집계(requestId 중복제거) | server, client |
| `resource-extract.ts` | tool_use/슬래시커맨드 → 리소스 호출 추출, 귀속·도구결과 신호 | client, server(ingest) |
| `project-path.ts` | 인코딩된 디렉토리명 → 실제 경로 복원(FS 탐색) | server(scanner), sync(manifest) |

---

## `pricing.ts`

```
readUsage(raw):        # assistant.message.usage → {usage, model, requestId}
dedupeByRequest(es):   # 같은 requestId 는 output_tokens 최대인 1건만 (라인 반복 방지)
calcCostUsd(usage,m):  # 모델 단가표 × 토큰. 미지 모델은 fallback 단가
aggregateUsageByModel: # 여러 호출 합산 → 총비용 + unknownModels
```
> 핵심: Claude Code 는 한 응답을 여러 라인에 나눠 쓰며 usage 를 반복 → **requestId 중복제거 필수**.

## `resource-extract.ts`

```
extractToolCalls(events):        # assistant tool_use 블록 + user 슬래시커맨드 → ToolCall[]
                                 #   (내장 CLI 커맨드는 제외, eventId=포함 이벤트 uuid)
toResourceInvocation(call):      # ToolCall → {kind, plugin, resource, ...}
                                 #   Skill: plugin:resource 분리 / mcp__a__b: 서버·툴 분리
groupByPlugin / groupInvocations # 대시보드 집계용 그룹핑

# ── ingest 전용(순수 추가) ──
extractAttribution(raw, origin): # main→attributionSkill / subagent→attributionAgent,Plugin
extractToolResults(events):      # user tool_result 블록 → [{toolUseId, isError, ts}]
                                 #   (is_error 가 직접 있어 휴리스틱 불필요)
```
> `EventLike = {raw, sessionId, timestamp}` 최소 타입만 요구 → client/server 이벤트 둘 다 호환.

## `project-path.ts`

```
resolveProjectPath(encoded):
    parts = encoded.strip('-').split('-')
    walk from '/' matching real dir names   # '/'와 '_' 모두 '-'로 인코딩돼 문자열 복원 불가
    return matched path
```
> 로컬에서만 정확(실제 디렉토리 필요). 클라우드는 sync 가 만든 `manifest.json` 을 우선 조회.
