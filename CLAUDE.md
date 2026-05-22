# CLAUDE.md — Claude Code Observer

> 새 세션을 시작할 때마다 이 문서를 먼저 읽어라.

---

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
│       └── watcher/        ← chokidar + 바이트 오프셋 tail
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
- **경로 디코딩**: Claude Code가 `/`와 `_` 모두 `-`로 인코딩 → `resolveSegments()` 로 파일시스템 탐색
- **히스토리 + 실시간**: 세션 선택 시 REST로 히스토리 선 로드 → WebSocket으로 신규 이벤트 append
- **IEventParser 인터페이스**: Claude Code 버전업 시 구현체만 교체

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

> 마지막 수정: 2026-05-22 | 담당: 승원
