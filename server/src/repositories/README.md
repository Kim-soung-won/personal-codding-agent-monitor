# `server/src/repositories/` — 데이터 접근 추상화

REST 핸들러가 SQL 을 직접 보지 않도록 인터페이스 뒤에 Kysely 쿼리를 숨긴다.
Postgres 전환 시 인터페이스는 그대로, 구현만 바뀐다(현재는 SQLite 하나).

| 파일 | 인터페이스 | 메서드 |
|------|-----------|--------|
| `session-repository.ts` | `SessionRepository` | `listSessions(filter?)`, `getSession(id)` |
| `event-repository.ts` | `EventRepository` | `listEventsForSession(id, opts?)` |
| `stats-repository.ts` | `StatsRepository` | `resourceCounts`, `pluginCounts`, `subagentResourceUsage`, `dailyTokens` |

```
interface XxxRepository { ...메서드 시그니처... }      # 소비처가 의존하는 계약
class KyselyXxxRepository implements XxxRepository {    # 생성자에 Kysely<DB> 주입
    constructor(db) { this.db = db }
}
```

---

## 쿼리 패턴

```
# session: 옵셔널 필터 → WHERE, 최신순
listSessions({projectId?, userId?}):
    select * from sessions
      [.$if projectId → where project_id=?]
      [.$if userId    → where user_id=?]
      order by last_activity_at desc

# event: raw(TEXT) 를 JSON.parse 해 반환(NormalizedEvent 유사 형태)
listEventsForSession(id, {includeSubagents=true}):
    select * from events where session_id=?
      [.$if !includeSubagents → and sub_agent_id is null]
      order by timestamp asc
    → map: {..., raw: safeParse(row.raw)}

# stats: 뷰(v_*)와 동일 그룹핑을 베이스 테이블에 필터와 함께 재구성
#        (뷰는 파라미터를 못 받으므로. 필터 없으면 전체 = 뷰 결과와 동일)
resourceCounts({projectId?, userId?, kind?, from?, to?}):
    select kind, plugin, resource, mcp_server,
           count(*) calls, count(distinct session_id) sessions,
           ..., sum(coalesce(is_error,0)) errors
    from resource_invocations [.$if 필터들...]
    group by kind, plugin, resource, mcp_server  order by calls desc

pluginCounts:          where plugin is not null, group by plugin (+skill/agent_calls)
subagentResourceUsage: join sub_agents, group by subagent_type,kind,resource
dailyTokens:           from usage, group by day,project_id,user_id (필터: day 범위)
```

> `StatsFilter = {projectId?, userId?, from?, to?}` — 대시보드 날짜·유저 필터가 이 형태로 흐른다.
> denormalize 된 컬럼(project_id/user_id/day) 덕에 대부분 단일 테이블 스캔으로 끝난다.
