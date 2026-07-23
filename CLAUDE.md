# CLAUDE.md — Claude Code Observer

## 이 프로젝트가 무엇인가

`~/.claude/projects/**/*.jsonl` 을 실시간으로 파싱해, Claude Code 세션의 thinking / tool_use / context injection 을 시각화하는 **개인용 모니터링 대시보드**.

- 데이터 소스: 로컬 파일시스템 전용 (`localhost` only)
- 실행: 루트에서 `npm run dev` 한 번

---

## 읽기 순서 (Session Start Protocol)

1. `CLAUDE.md` ← 지금 이 파일
2. `vault/projects/spec.md` ← 기획 + 구현 현황 + 스키마 레퍼런스
3. `vault/notes/` ← 날짜별 개발 로그 (결정 근거, 버그 수정 이력)

---

## 디렉토리 구조

```
personal-coding-agent-monitor/
├── CLAUDE.md               ← 이 파일
├── package.json            ← 루트: concurrently dev 스크립트
├── .gitignore
│
├── server/                 ← Node.js ESM + Express + WebSocket
│   └── src/
│       ├── index.ts        ← 서버 진입점 (포트 3001)
│       ├── types.ts        ← NormalizedEvent, SessionInfo
│       ├── parser/         ← IEventParser + JsonlEventParser
│       ├── scanner/        ← ~/.claude/projects 스캔 + 경로 복원
│       ├── watcher/        ← chokidar + 바이트 오프셋 tail
│       ├── middleware/     ← auth (Bearer 토큰 / WS ?token=)
│       ├── routes/         ← sync(업로드+ingest), stats, db-sessions
│       ├── db/             ← schema.ts(DDL), migrate, client(Kysely), types, backfill
│       ├── repositories/   ← Session/Event/Stats Repository (Kysely 구현)
│       └── ingest/         ← JSONL→DB 적재(session-ingest-service 등)
│
├── client/                 ← Vite + React 18 + TypeScript
│   └── src/
│       ├── App.tsx         ← 메인 레이아웃
│       ├── hooks/          ← useWebSocket
│       ├── types/          ← events.ts (서버 타입 미러)
│       ├── lib/            ← shadcn cn() 유틸
│       └── components/     ← UI 컴포넌트 (shadcn + 커스텀)
│
└── vault/                  ← 지식 작업 공간
    ├── projects/
    │   └── spec.md         ← 기획서 + 구현 현황
    └── notes/
        └── dev-log-YYYY-MM-DD.md  ← 날짜별 개발 로그
```

---

## 주요 포트 / 엔드포인트

| 항목 | 값 |
|------|-----|
| 서버 | `http://localhost:3001` |
| 클라이언트 | `http://localhost:5173` |
| 세션 목록 | `GET /api/sessions` |
| 세션 이벤트 | `GET /api/sessions/:sessionId/events` |
| WebSocket | `ws://localhost:3001` |

---

## 핵심 설계 결정 (변경 시 spec.md도 함께 수정)

- **JSONL 파싱**: 방어적 처리 필수. 라인 파싱 실패 시 skip, 프로세스 중단 없음
- **이벤트 버퍼**: 최대 500개 (서버 메모리 + 클라이언트 상태 모두)
- **경로 디코딩**: Claude Code가 `/`와 `_` 모두 `-`로 인코딩 → `shared/project-path.ts`의 `resolveProjectPath()` 로 파일시스템 탐색. **클라우드에선 실제 경로가 없어 실패** → sync 잡이 만든 `manifest.json` 우선 조회
- **히스토리 + 실시간**: 세션 선택 시 REST로 히스토리 선 로드 → WebSocket으로 신규 이벤트 append
- **IEventParser 인터페이스**: Claude Code 버전업 시 구현체만 교체

### 클라우드 배포 결정 (2026-07-23)

- **탈로컬화**: `DATA_DIR`/`PORT`/`HOST`/`ALLOWED_ORIGIN`/`AUTH_TOKEN` 을 env 로. 미설정 시 기존 로컬 dev 동작(단 AUTH_TOKEN 은 필수 — 미설정 시 부팅 거부)
- **인증**: 단일 토큰. REST 는 `Authorization: Bearer`, WS 는 `?token=` 쿼리
- **동기화 additive-only**: 로컬에서 세션이 지워져도 클라우드는 삭제하지 않는다. 삭제 유발 엔드포인트(DELETE) 미구현이 방어선
- **요약 로컬 생성**: `sync/generate-summaries.ts` 가 로컬 `claude` CLI(구독 인증, `claude -p` headless)로 title/description 생성 → `.summary.json` 사이드카. **API 키 불필요**. 생성 세션은 전용 디렉토리에서 돌려 재귀 요약 방지
- **클라이언트 빌드타임 상수**: `VITE_API_BASE`/`VITE_WS_URL` 은 배포 대상 바뀌면 재빌드 필요

### DB ingest 결정 (2026-07-23, Phase 2a)

- **SQLite + better-sqlite3 + Kysely.** Postgres-ready — 팀 확장 시 `db/client.ts` 의 dialect만 교체. DDL은 `db/schema.ts`(TS 문자열 상수, tsc가 .sql을 dist로 안 옮기므로). `DB_PATH` env, 미설정 시 `CLAUDE_DATA_DIR/observer.db`
- **ingest-on-upload**: `/api/sync/*` 가 파일 저장(백업) + 파싱 + DB upsert 를 함께 수행. 파일 저장 성공 후 ingest 는 best-effort(실패해도 500 아님, 원본 보존). `source_files` mtime 가드로 멱등·증분
- **파일 단위 delete+reinsert**: 재적재 시 해당 파일의 events/resource_invocations/usage 를 스코프 삭제 후 재삽입 → 멱등. events 는 uuid PK 가 파일 경계 넘어 중복될 수 있어 `onConflict doNothing`
- **DB 는 원본 jsonl 로부터 항상 재구성 가능**: `db/backfill.ts` (배포 이전 파일 소급 적재 + '전체 재구성' 롤백 도구)
- **데이터 출처**: projects=cwd, title=aiTitle/customTitle(JSONL), description=요약(CLI), users=git 신원(sync 주입 X-User-* 헤더). attribution 은 attributionSkill/attributionAgent/attributionPlugin 필드 활용
- **기존 REST 불변**: `/api/sessions*`(파일 기반)은 그대로, DB 기반은 `/api/db/sessions*`·`/api/stats/*` 로 분리(점진 전환)

---

## 작업 전 체크리스트

```
[ ] spec.md 구현 현황 확인
[ ] vault/notes/ 최신 로그 확인
[ ] tsc --noEmit 통과 여부 확인
[ ] server/와 client/ 양쪽 타입 변경 시 동기화
```

---

## 메모

> 마지막 수정: 2026-07-23 | 담당: 승원
