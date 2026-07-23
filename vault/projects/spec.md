# Claude Code Observer — 기획서

> **목적**: 로컬에서 실행 중인 Claude Code 세션이 어떤 컨텍스트를 주입받고, 어떤 툴을 호출하며, 어떤 근거로 행동하는지 실시간으로 파악하기 위한 개인용 모니터링 대시보드.

---

## 구현 현황 (2026-05-28)

| 항목 | 상태 |
|------|------|
| 프로젝트 스캐폴딩 | ✅ 완료 |
| 서버 (Express + WS + chokidar) | ✅ 완료 |
| JSONL 파서 + 이벤트 정규화 | ✅ 완료 |
| 세션 스캐너 + 경로 복원 | ✅ 완료 |
| 파일 watcher (바이트 오프셋 tail) | ✅ 완료 |
| REST API (`/sessions`, `/sessions/:id/events`) | ✅ 완료 |
| 클라이언트 기반 (Vite + React + Tailwind + shadcn) | ✅ 완료 |
| WebSocket 실시간 수신 + 자동 재연결 | ✅ 완료 |
| 세션 선택 + 히스토리 로드 | ✅ 완료 |
| ThinkingViewer (검색, 카테고리 필터, 접기/펼치기) | ✅ 완료 |
| Context Timeline (hook/memory/tool/file-edit 시간순) | ✅ 완료 |
| Token Dashboard (토큰 분포 바, 캐시 히트율) | ✅ 완료 |
| 전체 피드 탭 (AllEventsFeed) | ✅ 완료 |
| 프로젝트 → 세션 2단계 필터링 | ✅ 완료 |
| 프로젝트 전체 세션 집계 모드 (세션 미선택 시) | ✅ 완료 |
| 세션 비교 | ✅ 완료 |
| Tool 호출 빈도 통계 | ✅ 완료 |
| 비용 추정 (모델별 단가 + 서브에이전트 포함) | ✅ 완료 |
| 가상 스크롤 (Virtual scroll) | 🔲 미구현 |
| 이전 세션 요약 (hook stdout 파싱) | ✅ 완료 |
| tool_use diff 뷰 (Edit/Write) | ✅ 완료 |
| metrics/costs.jsonl 연동 | ❌ 제거 (2026-07-20 — 데이터가 전부 무의미해 죽은 경로였음) |
| 클라우드 배포 1차 — env 기반 탈로컬화 (DATA_DIR/PORT/HOST) | ✅ 완료 (2026-07-23) |
| 클라우드 배포 1차 — 단일 토큰 인증 (REST + WS) | ✅ 완료 (2026-07-23) |
| 클라우드 배포 1차 — manifest 기반 경로 라벨 복원 | ✅ 완료 (2026-07-23) |
| 세션 제목·설명 요약 (.summary.json 사이드카) | ✅ 완료 (2026-07-23) |
| 로컬 동기화 잡 (sync/ — manifest·요약·additive 업로드) | ✅ 완료 (2026-07-23) |
| Dockerfile + 배포 문서 | ✅ 완료 (2026-07-23) |
| 클라우드 배포 2차 — DB ingest (SQLite/Kysely) | ✅ Phase 2a 완료 (2026-07-23, §8) |
| 클라우드 배포 2차 — 클라이언트 통계 대시보드 | 🔲 Phase 2b 대기 (§8) |

> 상세 개발 기록:
> - [`vault/notes/dev-log-2026-05-22.md`](../notes/dev-log-2026-05-22.md)
> - [`vault/notes/dev-log-2026-05-28.md`](../notes/dev-log-2026-05-28.md)
> - [`vault/notes/dev-log-2026-06-04.md`](../notes/dev-log-2026-06-04.md)
> - [`vault/notes/dev-log-2026-07-20.md`](../notes/dev-log-2026-07-20.md)
> - [`vault/notes/dev-log-2026-07-23.md`](../notes/dev-log-2026-07-23.md)

---

## 1. 배경 및 목적

Claude Code는 `~/.claude/projects/{project}/{session}.jsonl`에 모든 세션 이벤트를 기록한다. 이 파일에는 사용자 입력, Claude의 내부 추론(thinking), 툴 호출, 컨텍스트 주입(hook, memory, rules) 등이 담겨 있으나, 기본적으로 raw JSONL 형태라 직접 읽기 어렵다.

Claude Code Observer는 이 파일을 실시간으로 파싱·시각화해 다음 질문에 답한다:

- 지금 Claude는 어떤 생각을 하고 있는가? (thinking block)
- 어떤 파일을 읽고 수정하는가? (tool_use: Read/Edit/Bash)
- 어떤 컨텍스트(rules, memory, hook)가 주입됐는가?
- 이번 세션에서 토큰을 얼마나 썼고, 캐시 히트율은?

**사용 대상**: 개발자 본인 (승원). PT용 아님, 순수 개인 활용.

---

## 2. 핵심 제약

| 항목 | 결정 |
|------|------|
| 실행 환경 | **1차**: 클라우드 상시 배포(HTTPS + 단일 토큰). 로컬 dev 는 env 미설정 시 기존과 동일 |
| 실행 방법 | 로컬: `npm run dev` · 클라우드: Docker(server) + 정적 빌드(client) + sync 잡 |
| 데이터 소스 | 로컬: `~/.claude/projects/**/*.jsonl` · 클라우드: sync 잡이 동기화한 `CLAUDE_DATA_DIR` |
| JSONL 스펙 | **비공식**. Claude Code 업데이트 시 포맷 변경 가능 → 방어적 파싱 필수 |
| 이벤트 버퍼 | 최근 500개 유지 (메모리 보호) |

---

## 3. 데이터 소스 분석

### 3-1. 디렉토리 구조

```
~/.claude/
├── projects/                        ← 핵심. 프로젝트별 세션 JSONL
│   └── {encoded-project-path}/
│       └── {session-uuid}.jsonl
├── file-history/                    ← 파일 편집 버전 히스토리 ({hash}@v1, @v2)
├── history.jsonl                    ← 전체 대화 히스토리 요약
├── metrics/
│   └── costs.jsonl                  ← 세션별 토큰/비용
├── homunculus/
│   └── observations.jsonl           ← 관찰/메모리 시스템
├── rules/                           ← 룰셋 (ecc-common, ecc-typescript 등)
├── plugins/                         ← 설치된 플러그인
├── mcp.json                         ← MCP 서버 설정
└── settings.json
```

`encoded-project-path` 디코딩 규칙:
- Claude Code는 경로의 `/`와 `_`를 모두 `-`로 인코딩 → **역방향 복원 불가**
- 실제 구현: `resolveSegments()` 로 파일시스템 직접 탐색 (scanner/index.ts)
- `filePath` 는 항상 정확. `projectPath` 는 display-only 레이블

### 3-2. JSONL 이벤트 타입 (실제 세션 파일 308라인 전수조사)

| 빈도 | type | 설명 |
|------|------|------|
| 168 | `attachment` | hook/memory/todo 등 컨텍스트 주입 (서브타입 별도) |
| 70 | `assistant` | Claude 응답 (thinking + tool_use + text content 배열) |
| 54 | `user` | 사용자 입력 + IDE 컨텍스트 |
| 5 | `file-history-snapshot` | 파일 편집 diff |
| 5 | `last-prompt` | 마지막 프롬프트 스냅샷 |
| 4 | `queue-operation` | 세션 큐 관리 |
| 2 | `system` | stop hook 요약 |

`attachment` 서브타입 분포:

| 빈도 | attachment.type | 설명 |
|------|-----------------|------|
| 111 | `hook_success` | SessionStart/PostToolUse 훅 결과 (이전 세션 요약 포함) |
| 27 | `async_hook_response` | 비동기 훅 응답 |
| 13 | `nested_memory` | rules 파일 컨텍스트 주입 |
| 5 | `todo_reminder` | Todo 리마인더 |
| 3 | `hook_additional_context` | 훅 추가 컨텍스트 |
| 2 | `deferred_tools_delta` | 지연 툴 델타 |
| 2 | `mcp_instructions_delta` | MCP 지시 델타 |
| 2 | `skill_listing` | 스킬 목록 |
| 2 | `edited_text_file` | 파일 편집 이벤트 |
| 1 | `file` | 파일 읽기 결과 |

### 3-3. 핵심 이벤트 스키마 (실제 확인)

#### `user` 이벤트
```json
{
  "type": "user",
  "uuid": "string",
  "parentUuid": "string | null",
  "timestamp": "ISO8601",
  "sessionId": "string",
  "cwd": "string",
  "entrypoint": "claude-vscode | ...",
  "permissionMode": "acceptEdits | ...",
  "message": {
    "role": "user",
    "content": [
      { "type": "text", "text": "사용자 입력" },
      { "type": "text", "text": "<ide_opened_file>...</ide_opened_file>" }
    ]
  }
}
```

#### `assistant` 이벤트
```json
{
  "type": "assistant",
  "uuid": "string",
  "parentUuid": "string | null",
  "timestamp": "ISO8601",
  "sessionId": "string",
  "message": {
    "model": "claude-sonnet-4-6",
    "role": "assistant",
    "content": [
      { "type": "thinking", "thinking": "내부 추론 텍스트" },
      { "type": "tool_use", "id": "string", "name": "Read|Edit|Bash", "input": {} },
      { "type": "text", "text": "응답 텍스트" }
    ],
    "stop_reason": "tool_use | end_turn",
    "usage": {
      "input_tokens": 3,
      "cache_creation_input_tokens": 33636,
      "cache_read_input_tokens": 0,
      "output_tokens": 119
    }
  }
}
```

#### `attachment/hook_success` 이벤트
```json
{
  "type": "attachment",
  "attachment": {
    "type": "hook_success",
    "hookName": "SessionStart:startup | PostToolUse:Bash | ...",
    "content": "",
    "stdout": "{ \"hookSpecificOutput\": { \"additionalContext\": \"이전 세션 요약...\" } }",
    "stderr": "[SessionStart] Found 3 recent session(s)\n...",
    "exitCode": 0,
    "durationMs": 394
  }
}
```

`stdout`은 JSON 문자열로, `hookSpecificOutput.additionalContext`에 이전 세션 요약이 담긴다.

#### `attachment/nested_memory` 이벤트 (신규 확인)
```json
{
  "type": "attachment",
  "attachment": {
    "type": "nested_memory",
    "path": "/Users/.../.claude/rules/ecc-typescript/coding-style.md",
    "displayPath": "../../../../.claude/rules/ecc-typescript/coding-style.md",
    "content": {
      "path": "string",
      "type": "User",
      "content": "파싱된 마크다운 (frontmatter 제거)",
      "globs": ["**/*.ts", "**/*.tsx"],
      "contentDiffersFromDisk": true,
      "rawContent": "---\npaths:\n  - ...\n---\n# 원문"
    }
  }
}
```

#### `attachment/edited_text_file` 이벤트 (신규 확인)
```json
{
  "type": "attachment",
  "attachment": {
    "type": "edited_text_file",
    "filename": "/absolute/path/to/file.ts",
    "snippet": "4\t코드 내용...\n5\t...",
    "displayPath": "relative/path/to/file.ts"
  }
}
```

#### `file-history-snapshot` 이벤트 (신규 확인)
```json
{
  "type": "file-history-snapshot",
  "messageId": "string",
  "isSnapshotUpdate": false,
  "snapshot": {
    "messageId": "string",
    "timestamp": "ISO8601",
    "trackedFileBackups": {}
  }
}
```

#### `queue-operation` 이벤트
```json
{
  "type": "queue-operation",
  "operation": "enqueue | dequeue",
  "timestamp": "ISO8601",
  "sessionId": "string"
}
```

### 3-4. 토큰 분석 결과 (실제 세션 1개 기준)

| 항목 | 값 |
|------|-----|
| input_tokens | 100 |
| output_tokens | 95,340 |
| cache_creation_input_tokens | 723,649 |
| cache_read_input_tokens | 3,645,861 |
| **총합** | **4,464,950** |

캐시 read가 총 토큰의 81.7%를 차지 — Claude Code가 빠른 이유.

### 3-5. 실제 사용된 tool_use 종류

이 세션에서는 `Read` (23회), `Edit` (23회), `Bash` (3회) 세 종류만 등장.  
일반적으로 `Write`, `Glob`, `Grep` 등도 존재할 수 있음.

---

## 4. 이벤트 카테고리 정규화

파서가 raw event를 다음 6개 카테고리로 정규화:

| category | 포함 타입 | 뷰 |
|----------|-----------|-----|
| `user-input` | user | 사용자 입력 목록 |
| `thinking` | assistant (thinking block 포함) | ThinkingViewer |
| `tool-use` | assistant (tool_use block 포함) | ThinkingViewer / Timeline |
| `assistant-text` | assistant (text only) | ThinkingViewer |
| `context-injection` | attachment/hook_success, nested_memory, todo_reminder 등 | Timeline |
| `file-edit` | attachment/edited_text_file, file-history-snapshot | Timeline |
| `system` | system | Timeline |
| `unknown` | 파싱 실패 또는 미지원 타입 | (무시) |

---

## 5. 기능 정의 (MoSCoW)

### MUST (핵심)
- **ThinkingViewer**: thinking block 원문 표시, tool_use 호출 내역 (이름 + input 요약), 실시간 타이핑 애니메이션, 접기/펼치기, 검색, 카테고리 필터
- **Context Timeline**: 이벤트 타임라인 (hook 주입, memory 로딩, tool 호출을 시간순으로)
- **실시간 스트리밍**: WebSocket으로 새 이벤트 즉시 반영
- **세션 선택**: 프로젝트 → 세션 2단계 드롭다운, 과거 세션 히스토리 조회

#### UX 결정: 프로젝트 → 세션 2단계 필터링 (2026-05-22)

단일 세션 드롭다운에 모든 세션을 나열하면 프로젝트가 많아질수록 선택이 어렵다.  
→ 프로젝트 드롭다운을 먼저 선택하면 해당 프로젝트의 세션만 표시되도록 2단계로 분리.

- **Project 드롭다운**: 전체 세션에서 `projectEncoded` 기준으로 dedup → 알파벳 정렬. 레이블은 `projectPath` 마지막 3 세그먼트 (`rag/rag-mfe/aimodel`)
- **Session 드롭다운**: 선택된 프로젝트의 세션만 표시 (최신순). 레이블 형식: `{sessionId[:8]} · 5월 22일 17:41`
- Session 드롭다운은 Project 선택 전 비활성 (`disabled`)
- Project 변경 시 Session 선택 및 이벤트 버퍼 초기화

#### UX 결정: 프로젝트 전체 세션 집계 모드 (2026-05-28)

세션을 특정하지 않고 프로젝트만 선택하면, 해당 프로젝트의 모든 세션 이벤트를 타임스탬프 기준으로 병합해 표시.
- `activeSessionIds` = 프로젝트 내 전체 세션 ID 배열
- REST API를 병렬 호출(Promise.all) → 병합 후 최신 500개 유지
- 헤더에 이벤트 수 + 세션 수 표시 (`N개 / M개 세션`)

### SHOULD (중요)
- **세션 비교**: 두 세션을 나란히 배치. 각 패널이 독립적인 이벤트 스트림을 보여줌. 같은 프로젝트 내 세션 선택 UI 필요.
- **Tool 호출 빈도 통계**: `tool-use` 이벤트에서 tool name별 호출 횟수 집계. 막대 차트 또는 테이블로 표시. Token Dashboard에 탭으로 통합하거나 별도 뷰 추가.
- **비용 추정**: Sonnet 4.6 기준 단가 적용 (input $3/M, output $15/M, cache write $3.75/M, cache read $0.30/M). Token Dashboard에 예상 비용 카드 추가.

### COULD (여유 시)
- **가상 스크롤 (Virtual scroll)**: 이벤트가 500개에 근접하면 렌더링 성능 저하 우려. `@tanstack/react-virtual` 도입 검토. ThinkingViewer, AllEventsFeed 우선 적용.
- **이전 세션 요약**: `hook_success` 이벤트의 `stdout` → `hookSpecificOutput.additionalContext` 파싱. ThinkingViewer 또는 Timeline에 별도 카드로 표시.
- **nested_memory 인라인 표시**: Timeline에서 `nested_memory` 이벤트 클릭 시 해당 rule 파일 내용 전문 표시.
- **tool_use diff 뷰**: Edit 툴 호출 시 `old_string` / `new_string` 을 diff 형식으로 렌더링.

---

## 6. 비기능 요구사항

- **보안**: localhost:3001 바인딩, CORS는 localhost:5173만 허용
- **안정성**: JSONL 파싱 실패 시 해당 라인 skip (프로세스 중단 없음)
- **성능**: 이벤트 버퍼 최대 500개 (오래된 것 drop), 렌더링은 가상화 검토
- **확장성**: `IEventParser` 인터페이스 — Claude Code 버전업 시 구현체만 교체

---

## 7. 기술 스택 (확정)

| 레이어 | 선택 |
|--------|------|
| 실행 | `concurrently` — 단일 `npm run dev` |
| 서버 | Node.js ESM + Express + `ws` + `chokidar@4` + `tsx watch` |
| 클라이언트 | Vite 5 + React 18 + TypeScript 5 |
| UI | Tailwind CSS v3 + shadcn/ui |
| 포트 | 서버 3001 / 클라이언트 5173 |
| 배포 | server: Docker(멀티스테이지) · client: 정적 빌드 · sync: tsx + launchd/cron |

---

## 8. 클라우드 배포 2차 — DB ingest

1차는 동기화된 JSONL 파일을 요청마다 재스캔·재파싱해 서빙한다. 누적 시 느려지고
검색·필터·집계에 한계가 있어, 2차에서 파싱 결과를 SQLite 에 적재한다.

### Phase 2a — 백엔드 데이터 레이어 (✅ 완료, 2026-07-23)

- **스택**: SQLite + better-sqlite3 + Kysely(Postgres-ready). DDL은 `db/schema.ts` 문자열 상수
  (10 테이블 + 4 뷰). 스키마·집계 실측 검증 + 실제 데이터 백필(세션 145·서브에이전트 244, 에러 0) 완료.
- **Repository 추상화**: `SessionRepository`/`EventRepository`/`StatsRepository` 뒤에 Kysely 구현.
  Postgres 전환 시 `db/client.ts` dialect만 교체.
- **ingest-on-upload**: `/api/sync/*` 가 파일 저장(백업) + `JsonlEventParser` 파싱 + DB upsert.
  **`IEventParser` 는 1차와 동일 재사용**. `source_files` mtime 가드로 증분·멱등, 파일 단위 delete+reinsert.
- **신규 엔드포인트**: `/api/db/sessions*`, `/api/stats/{resources,plugins,subagents,tokens/daily}`.
  기존 `/api/sessions*`(파일 기반)은 불변 — 점진 전환.
- **차원**: users(git 신원, sync 주입) · projects(cwd) · plugins · sub_agents(중첩 `sub_agent_id`) ·
  resource(skill/agent/mcp) · usage(requestId 중복제거). title=JSONL(aiTitle/customTitle), description=요약(CLI).
- **백필**: `db/backfill.ts` — 배포 이전 파일 소급 적재 + 'DB 삭제 후 전체 재구성' 롤백 도구.

### Phase 2b — 클라이언트 통계 대시보드 (🔲 대기)

- `client/src/lib/statsApi.ts` + 훅으로 `/api/stats/*` 소비.
- GlobalAnalytics 를 서버 집계 사용으로 전환, 리소스/플러그인 평가(고빈도·저빈도·에러율) 뷰,
  sub-agent 통계 뷰, 날짜·유저 필터 UI. 기존 flat 구조(components/hooks/lib) 유지.
- `/api/sessions*` → `/api/db/sessions*` 완전 전환 여부는 2b 완료 후 별도 논의.

### 알려진 한계

- **spawn_invocation_id 미연결(0건)**: 서브에이전트↔부모 Agent 호출의 정밀 연결키(sourceToolAssistantUUID)가
  실측에서 안 맞음. "어떤 sub-agent가 호출했나"는 `sub_agent_id` 로 동작하므로 부가 정보로 남김(best-effort).
- **plugin installed 여부**: JSONL엔 "호출된" 플러그인만 드러남. 진짜 죽은 플러그인은 `~/.claude/plugins` 매니페스트(sync 주입) 필요.
- **false negative**: "떴어야 했는데 안 뜬" 리소스는 데이터에 흔적이 없어 직접 측정 불가.
