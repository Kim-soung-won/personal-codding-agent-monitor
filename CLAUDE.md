# CLAUDE.md — Claude Code Observer

## 이 프로젝트가 무엇인가

Claude Code 로 개발할 때 **에이전트가 어떻게 쓰였는지를 커밋 단위로 축적·리뷰**하는
모니터링 제품. "이번 커밋을 만드는 동안 어떤 에이전트를 불렀고, 무엇이 어긋났고,
토큰을 얼마나 썼는가"를 커밋 히스토리처럼 되짚는 것이 목적이다.

### 기획 의도 (2026-07-24 재정의)

원래는 `~/.claude/projects/**/*.jsonl` 원본을 통째로 클라우드에 동기화해 이벤트 단위로
시각화했다. 이 방식의 문제는 **관측 단위가 사람의 작업 단위와 어긋난다**는 것이다.
JSONL 이벤트는 너무 잘고, 세션은 너무 굵고 경계가 임의적이며, 원본 전송은 부피·프라이버시
비용이 크다. 결과적으로 "무슨 일이 있었는지"는 보이지만 "잘한 건지"는 보이지 않았다.

그래서 관측 단위를 **커밋 델타**로 바꾼다. 커밋은 개발자가 스스로 그은 의미 단위이고,
이미 리뷰·회고의 단위다. 여기에 맞춰 적재 방식도 원본 동기화에서
[`agent-factory-plugin`](../personal-plugins/plugins/agent-factory-plugin/) 훅으로 교체한다:

```
git commit
  └─ PostToolUse hook (capture-commit-session.mjs)   ← 직전 커밋 이후 델타 구간 캡처
       └─ distill-session.mjs                        ← 결정론적 전처리(노이즈 제거)
            └─ session-feedback-summarizer 에이전트    ← 요약 + 5축 피드백 + 감정 신호
                 └─ .agent-factory/sessions/<sha>.md
                      └─ Stop hook (push-sessions.mjs)  ← 미전송분만 이 서버로 POST
                           └─ Postgres → REST → 대시보드
```

핵심은 **서버가 원본을 받지 않는다**는 것이다. 로컬에서 요약·해석까지 끝낸
`<sha>.md` 한 장만 올라온다. 서버는 그 마크다운을 구조화해 저장하고, 커밋을 가로질러
"이 에이전트는 실제로 값을 하는가", "정정 루프가 어디서 반복되는가", "부정 신호가
어떤 패턴 뒤에 나오는가" 를 집계한다.

- 관측 단위: **커밋 델타 1건 = `CommitRecord` 1행** (세션도, 이벤트도 아니다)
- 데이터 소스: 원격 Postgres (플러그인 훅이 push)
- 원본 무손실: 파싱 결과와 별개로 `.md` 전문을 `rawMarkdown` 에 보관 → 스키마가 바뀌면 재파싱

### 스키마

`server/prisma/schema.prisma` 가 단일 소스다. 그레인·멱등·2단계 적재(CAPTURED →
SUMMARIZED)의 근거는 파일 상단 주석에 있다. 피드백 축(`FeedbackAxis`)은
`agent-factory-plugin` 의 `resources/session-feedback-summarizer/feedback-rubric.md`
5개 축과 1:1 이므로 **한쪽만 고치지 않는다**.

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
│   ├── prisma/
│   │   ├── schema.prisma   ← **스키마 단일 소스** (그레인·멱등 근거는 상단 주석)
│   │   └── migrations/     ← migrate diff 로 만들고 migrate deploy 로 적용
│   └── src/
│       ├── index.ts        ← 서버 진입점 (포트 3001)
│       ├── types.ts        ← NormalizedEvent, SessionInfo
│       ├── agent-factory/  ← **제품 본체**: record-parser(.md→구조화), record-service(멱등 적재), routes
│       ├── db/prisma.ts    ← PrismaClient 싱글턴
│       ├── parser/         ← IEventParser + JsonlEventParser
│       ├── scanner/        ← ~/.claude/projects 스캔 + 경로 복원
│       ├── watcher/        ← chokidar + 바이트 오프셋 tail
│       └── middleware/     ← auth (Bearer 토큰 / WS ?token=)
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
| **커밋 기록 적재** | `POST /api/agent-factory/records` |
| **커밋 기록 조회** | `GET /api/agent-factory/records` · `/records/:id` |
| **집계** | `GET /api/agent-factory/stats/{agents,signals,feedback,tokens/daily}` |
| 세션 목록(로컬 파일) | `GET /api/sessions` |
| WebSocket(로컬 파일) | `ws://localhost:3001` |

---

## 핵심 설계 결정 (변경 시 spec.md도 함께 수정)

- **JSONL 파싱**: 방어적 처리 필수. 라인 파싱 실패 시 skip, 프로세스 중단 없음
- **이벤트 버퍼**: 최대 500개 (서버 메모리 + 클라이언트 상태 모두)
- **경로 디코딩**: Claude Code가 `/`와 `_` 모두 `-`로 인코딩 → `shared/project-path.ts`의 `resolveProjectPath()` 로 파일시스템 탐색. **로컬 모드 전용** — 클라우드에는 실제 경로가 없어 이 계열 화면(`/api/sessions*`)은 비어 있다. 커밋 기록은 훅이 git root 절대경로를 함께 보내므로 이 문제가 없다
- **히스토리 + 실시간**: 세션 선택 시 REST로 히스토리 선 로드 → WebSocket으로 신규 이벤트 append
- **IEventParser 인터페이스**: Claude Code 버전업 시 구현체만 교체

### 클라우드 배포 결정

- **탈로컬화**: `CLAUDE_DATA_DIR`/`PORT`/`HOST`/`ALLOWED_ORIGIN`/`AUTH_TOKEN`/`DATABASE_URL` 을 env 로. `AUTH_TOKEN`·`DATABASE_URL` 은 필수 — 미설정 시 부팅 거부
- **인증**: 단일 토큰. REST 는 `Authorization: Bearer`, WS 는 `?token=` 쿼리
- **클라이언트 빌드타임 상수**: `VITE_API_BASE`/`VITE_WS_URL` 은 배포 대상 바뀌면 재빌드 필요
- **런타임 이미지의 Prisma**: `prisma` CLI 가 devDependency 라 `--omit=dev` 런타임에서는 generate 를 못 돌린다 → 생성된 클라이언트를 build 스테이지에서 `COPY` 한다(Dockerfile 참조)

### 적재 결정 (2026-07-24)

- **Postgres + Prisma.** 스키마 단일 소스는 `server/prisma/schema.prisma`
- **`migrate dev` 를 쓰지 않는다**: DB 사용자에게 shadow DB 생성 권한이 없다. 대신 `npm run db:diff` 로 '현재 DB → 목표 스키마' 델타 SQL 을 뽑아 `prisma/migrations/<timestamp>_<name>/migration.sql` 로 저장하고 `npm run db:deploy` 로 적용한다
- **서버는 마이그레이션을 실행하지 않는다**: 인스턴스가 여럿이면 부팅 시 DDL 이 경합한다. 배포 파이프라인 책임
- **멱등의 키는 contentHash**: 같은 `.md` 를 몇 번 밀어도 내용이 같으면 `unchanged` 로 빠진다. 내용이 바뀌면 자식 행(신호·호출·피드백·에이전트)을 **전량 삭제 후 재삽입** — 부분 갱신으로 잔여 행이 섞이는 것보다 안전하고, 자식은 어차피 파생 데이터다
- **부분 실패 허용**: `POST /records` 는 건별 결과를 돌려준다. 전부-아니면-전무로 처리하면 깨진 기록 하나가 영원히 재전송된다
- **파서는 절대 던지지 않는다**: LLM 이 쓴 마크다운이 입력이라 형식이 흔들릴 수 있다. 못 읽은 조각은 `warnings` 로 남기고 읽은 만큼만 반환한다. 원본이 `rawMarkdown` 에 있으므로 데이터는 유실되지 않는다
- **판정 휴리스틱은 부정문을 읽는다**: "낭비 지점은 두드러지지 않음"을 CONCERN 으로 뒤집지 않도록 문장 단위로 부정 종결을 확인한다(`hasUnnegated`)
- **`FeedbackAxis` 는 rubric 과 1:1**: `agent-factory-plugin/resources/session-feedback-summarizer/feedback-rubric.md` 의 5축과 짝이다. **한쪽만 고치지 않는다**

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
