# claude-code-observer MCP

커밋 단위 에이전트 사용 집계를 **Claude Code 에서 질의**하기 위한 읽기 전용 MCP 서버.
UI 대신 공통 인터페이스(Claude Code)로 "내 에이전트 사용 수준"을 근거 있게 묻는 것이 목적이다.

## 아키텍처 (A — 얇은 stdio 래퍼)

```
Claude Code ──MCP(stdio)──▶ 이 서버 ──HTTPS+Bearer──▶ observer /api/agent-factory/* ──▶ Postgres
```

- 독립 stdio 프로세스가 MCP 규약을 말하고, 데이터는 **observer 서버의 기존 REST 를 그대로 호출**해 얻는다.
- 집계 로직·인증·설정을 한 곳으로 통합: 접속 설정은 push 훅과 **같은** `~/.agent-factory/config.json`(`{apiBase, token}`)을 재사용한다. 환경변수 `AGENT_FACTORY_API_BASE` / `AGENT_FACTORY_TOKEN` 이 있으면 우선.
- 모든 도구는 **읽기 전용**. 서버 변경·재배포가 필요 없다.

## 도구

| 도구 | 소스 REST | 용도 |
|---|---|---|
| `list_agent_usage` | `/stats/agents` | 에이전트별 commits·spawns·토큰·toolCalls·errors |
| `list_plugin_usage` | `/stats/plugins` | 플러그인 축 집계 |
| `feedback_breakdown` | `/stats/feedback` | 5축×판정 분포 (수준 평가 핵심) |
| `signal_summary` | `/stats/signals` | 정정 루프·오탐율 |
| `token_trend` | `/stats/tokens/daily` | 비용 추세 |
| `search_records` | `/records` | 커밋 기록 검색(필터) |
| `get_record` | `/records/:id` | 커밋 상세 + rawMarkdown(인용 근거) |
| `get_meta` | `/meta` | 필터용 프로젝트·작성자 목록 |

## 등록

`~/.claude/mcp.json`:

```json
{
  "mcpServers": {
    "claude-code-observer": {
      "command": "npx",
      "args": ["tsx", "<repo>/mcp/src/index.ts"]
    }
  }
}
```

등록 후 Claude Code 를 재시작(또는 MCP 재로드)한다.

## 평가 로직

"수준"의 판정 기준(5축 rubric 대조)은 이 서버가 아니라 `.claude/skills/agent-usage-review`
스킬이 쥔다. 서버는 근거 데이터만 내고, 판정·인용은 스킬이 안내한다 — 재배포 없이 기준을 튜닝하기 위함.

## 개발

```bash
npm install
npm run typecheck
npm start        # stdio 로 직접 실행(디버그용)
```
