# `server/src/routes/` — Express 라우터

모든 라우트는 `/api` 하위이며 상위에서 `app.use('/api', requireAuth)` 로 **토큰 인증**된다.

현재 이 디렉토리에는 라우터 파일이 없다. 라우트는 두 곳에 있다:

| 위치 | 마운트 | 역할 |
|------|--------|------|
| `../agent-factory/routes.ts` | `/api/agent-factory` | **커밋 단위 기록** — 이 제품의 본체 |
| `../index.ts` (인라인) | `/api/sessions*` | 로컬 파일 스캔 기반 실시간 세션 뷰 |

> 구 `sync.ts`·`stats.ts`·`db-sessions.ts`·`db-meta.ts` 는 제거됐다. 원본 JSONL 을
> 클라우드로 동기화하던 방식을 agent-factory 훅 업로드로 대체하면서 함께 걷어냈다.
> 배경은 저장소 루트 `CLAUDE.md` 의 "기획 의도" 참조.

---

## `agent-factory/routes.ts` — `createAgentFactoryRouter(prisma)`

```
POST /records                  body={records:[{markdown, fileName, projectPath, ...}]}
     건별 멱등 upsert. 부분 실패 허용 — 한 건이 깨져도 나머지는 적재하고
     건별 outcome(created|updated|unchanged|skipped)을 돌려준다.
     ✱ 전부-아니면-전무로 처리하면 깨진 기록 하나가 영원히 재전송된다.

GET  /records                  ?projectId&userId&agent&status&from&to&page&pageSize
     rawMarkdown 제외(건당 수 KB). pageSize 상한 100.
GET  /records/:id              rawMarkdown 포함 상세

GET  /stats/agents             에이전트별 커밋 수·spawn 수
GET  /stats/signals            극성×판정 분포 (오탐 포함 — 감지기 정밀도 추적)
GET  /stats/feedback           축별 판정 분포
GET  /stats/tokens/daily       일자별 토큰 (최근 90일)
GET  /meta                     프로젝트·유저 목록(필터 드롭다운용)
```

---

## 응답 규약

```
성공: { success: true, data?: ... }
실패: { success: false, error: string }   (HTTP 4xx/5xx)
```
