# `server/src/parser/` — JSONL 이벤트 정규화

raw JSONL 라인 1개 → `NormalizedEvent` 1개. **방어적**(파싱 실패 시 null, 프로세스 중단 없음).
`IEventParser` 인터페이스로 두어 Claude Code 포맷 변경 시 구현체만 교체 가능.

```
interface IEventParser { parse(line, sessionId, origin?) : NormalizedEvent | null }

parse(line, sessionId, origin='main'):
    trimmed = line.trim();  if empty → null
    raw = JSON.parse(trimmed);  if 실패 → null            # 방어적: skip
    return {
        id:        raw.uuid ?? randomUUID(),
        sessionId, origin,
        timestamp: raw.timestamp ?? now,
        category:  categorize(raw),                        # 6+1 분류
        summary:   summarize(raw),                         # 사람이 읽는 한 줄
        raw,
        agentId:   (origin==='subagent') ? raw.agentId : undefined,
    }
```

## 분류 (`categorize`)

```
user                                   → 'user-input'
system                                 → 'system'
file-history-snapshot                  → 'file-edit'
assistant + content has thinking       → 'thinking'
assistant + content has tool_use       → 'tool-use'
assistant (text only)                  → 'assistant-text'
attachment:
    edited_text_file                   → 'file-edit'
    hook_success/nested_memory/todo/...  → 'context-injection'
그 외(ai-title, custom-title, queue-operation, ...) → 'unknown'
```

> ingest 는 'unknown' 도 raw 를 활용(ai-title/custom-title). 화면 소비처는 `category!=='unknown'` 필터.

## 요약 (`summarize`)

```
user:       실제 입력 텍스트(IDE 컨텍스트 <...> 태그 제외) 120자
assistant:  tool_use 있으면 "name → 파일명/명령어" / 없으면 thinking·text 120자
attachment: "hook: name" / "memory: path" / "edited: path" ...
```
