# Claude Code Observer — 기획서

> **목적**: 로컬에서 실행 중인 Claude Code 세션이 어떤 컨텍스트를 주입받고, 어떤 툴을 호출하며, 어떤 근거로 행동하는지 실시간으로 파악하기 위한 개인용 모니터링 대시보드.

---

## 구현 현황 (2026-05-22)

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
| ThinkingViewer | ✅ 완료 |
| Context Timeline | ✅ 완료 |
| Token Dashboard | ✅ 완료 |
| 프로젝트 → 세션 2단계 필터링 | ✅ 완료 |
| 세션 비교 | 🔲 미구현 |

> 상세 개발 기록: [`vault/notes/dev-log-2026-05-22.md`](../notes/dev-log-2026-05-22.md)

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
| 실행 환경 | `localhost` 전용, 외부 노출 없음 |
| 실행 방법 | `npm run dev` 단일 명령 |
| 데이터 소스 | `~/.claude/projects/**/*.jsonl` (로컬 파일시스템) |
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

### SHOULD (중요)
- **Token Dashboard**: input/output/cache_create/cache_read 실시간 누계, 캐시 히트율 시각화
- **세션 비교**: 두 세션 나란히 비교

### COULD (여유 시)
- 이전 세션 요약 (hook_success.stdout 파싱)
- nested_memory 주입 내용 인라인 표시
- tool_use input/output diff 뷰

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
