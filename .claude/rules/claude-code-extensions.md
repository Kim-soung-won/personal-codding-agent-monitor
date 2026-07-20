# Claude Code 확장 레이어 참조

Claude Code의 확장 종류별 역할, 사용 기준, JSONL 집계 대응을 정리한 참조 문서.

---

## 확장 종류 요약

| 종류                     | 역할                                                     | 사용 시점                               | 컨텍스트 비용               |
| ------------------------ | -------------------------------------------------------- | --------------------------------------- | --------------------------- |
| **CLAUDE.md**            | 모든 세션 자동 로드 영속 컨텍스트                        | 프로젝트 규칙, "항상 X" 지침, 빌드 명령 | 모든 요청                   |
| **Skill**                | `/name` 호출 또는 Claude 자동 로드 워크플로우·지식       | 배포 절차, API 문서, 반복 작업          | 설명만 항상; 본문은 사용 시 |
| **Subagent (Agent)**     | 격리 컨텍스트 실행 후 요약 반환                          | 병렬 작업, 대량 파일 읽기, 특화 워커    | 별도 컨텍스트 윈도우        |
| **Agent team**           | 독립 세션 간 피어 메시징으로 조정                        | 경쟁 가설 검증, 섹션별 병렬 구현        | 높음 (팀원 = 별도 인스턴스) |
| **MCP**                  | 외부 서비스 연결                                         |
| (DB, Slack, 브라우저 등) | Claude 외부 시스템 상호작용                              | 도구 이름만 세션 시작, 스키마는 사용 시 |
| **Hook**                 | 라이프사이클 이벤트 자동 실행 (스크립트/HTTP/subagent)   | 매번 동일 실행 자동화 (린팅, 로깅)      | 0 (출력 반환 시만)          |
| **Workflow**             | 다중 에이전트 결정론적 오케스트레이션 (루프/조건/팬아웃) | 복잡한 멀티스텝 파이프라인              | 에이전트별 별도 컨텍스트    |
| **Artifact**             | 세션 출력을 claude.ai 비공개 웹 페이지로 게시            | 시각적 공유가 필요한 HTML/MD 결과물     | 도구 호출 비용만            |
| **Plugin**               | Skill+Hook+MCP를 단일 설치 단위로 번들                   | 다수 저장소 재사용, 마켓플레이스 배포   | 포함 기능에 따라 다름       |

---

## 의사결정 흐름

```
Claude가 항상 알아야 한다              → CLAUDE.md
가끔 필요한 지식 · 절차                → Skill
외부 시스템 접근 필요                  → MCP (+ MCP 사용법은 Skill로)
컨텍스트 격리 · 병렬 처리               → Subagent (Agent)
  └─ 팀원끼리 소통 필요                → Agent team
복잡한 멀티에이전트 파이프라인           → Workflow
이벤트 기반 자동 실행                  → Hook  (← 가드레일은 반드시 Hook)
시각적 HTML 결과물 공유               → Artifact
위 조합을 다수 저장소에 재배포           → Plugin
```

---

## 계층 우선순위 (같은 이름 충돌 시)

| 기능             | 우선순위                                              |
| ---------------- | ----------------------------------------------------- |
| CLAUDE.md        | **추가적** — 모든 수준 동시 적용, 더 구체적인 것 우선 |
| Skill / Subagent | 관리 > 사용자 > 프로젝트 > 플러그인                   |
| MCP 서버         | 로컬 > 프로젝트 > 사용자                              |
| Hook             | **병합** — 모든 등록된 Hook 실행                      |

---

## Observer JSONL 집계 대응

Claude Code JSONL의 `tool_use` 블록 또는 user 이벤트 태그와 집계 종류(kind) 매핑.

| JSONL 패턴                                       | kind       | 설명                      |
| ------------------------------------------------ | ---------- | ------------------------- |
| `tool_use name="Skill"`                          | `skill`    | Claude가 자동 호출        |
| user 이벤트 `<command-name>/name</command-name>` | `skill`    | 사용자 `/slash` 직접 호출 |
| `tool_use name="Agent"`                          | `agent`    | Subagent 생성             |
| `tool_use name="Workflow"`                       | `workflow` | Workflow 오케스트레이션   |
| `tool_use name="Artifact"`                       | `artifact` | 웹 아티팩트 게시          |
| `tool_use name="mcp__*__*"`                      | `mcp`      | MCP 서버 도구 호출        |
| 나머지 (Bash, Read, Edit, Write 등)              | other      | 내장 파일·셸 도구         |

---

## 내장 CLI 명령 (집계 제외)

사용자 slash로 호출하더라도 Resources 집계에서 제외하는 Claude Code 내장 명령:

`clear` · `compact` · `help` · `config` · `status` · `login` · `logout` · `doctor` · `mcp` · `resume` · `plugin` · `reload-plugins` · `rate-limit-options`

---

## 조합 패턴

| 패턴              | 동작 방식                                         |
| ----------------- | ------------------------------------------------- |
| Skill + MCP       | MCP는 연결 제공, Skill은 사용 방법 문서화         |
| Skill + Subagent  | Skill이 병렬 Subagent를 생성해 격리 실행          |
| CLAUDE.md + Skill | CLAUDE.md는 항상 켜진 규칙, Skill은 온디맨드 참조 |
| Hook + MCP        | Hook이 이벤트 감지 후 MCP를 통해 외부 액션        |
