# `server/src/db/` — SQLite 데이터 레이어 (Postgres-ready)

파싱된 JSONL 을 담는 관계형 저장소. **SQLite + better-sqlite3 + Kysely**. 팀 확장 시
`client.ts` 의 dialect 만 교체하면 Postgres 로 전환(쿼리 코드 불변).

| 파일 | 역할 |
|------|------|
| `schema.ts` | DDL 단일 소스(TS 문자열 상수) — 10 테이블 + 4 뷰 |
| `migrate.ts` | 스키마 적용(트랜잭션·멱등) |
| `client.ts` | `createDb(path)` — 연결·PRAGMA·migrate → `Kysely<DB>` |
| `types.ts` | Kysely `DB` 인터페이스(schema 와 1:1) |
| `backfill.ts` | 기존 파일 소급 적재 CLI(= 전체 재구성 롤백 도구) |

> `schema.ts` 가 `.sql` 이 아닌 이유: `tsc` 는 `.sql` 을 `dist/` 로 복사하지 않아 Docker 런타임에서
> 누락된다. TS 문자열이면 컴파일되어 함께 배포된다.

---

## 스키마 개요

```
users(id, identifier, ...)              # git 신원(sync 주입) — JSONL 엔 없음
projects(id, encoded✦, path, name)       # cwd = 실제 경로
plugins(id, name✦, installed?, ...)      # skill/agent 상위 단위 차원
sessions(id✦, project_id→, user_id→,     # title=JSONL, description=요약(CLI)
         title, ai_title, custom_title, description, total_cost_usd, ...)
sub_agents(id, session_id→, agent_uuid,  # 서브에이전트 1 실행 = 1행
           subagent_type, plugin, spawn_invocation_id→, tokens...)
events(id✦, session_id→, sub_agent_id?→, category, timestamp, raw)   # 상세 실행 이력
resource_invocations(id, session_id→, project_id→, user_id?→,        # ★ 리소스 통계 중심
           sub_agent_id?→, kind, plugin?, resource, mcp_server?, is_error?, ...)
usage(id, session_id→, sub_agent_id?→, request_id, model, tokens..., day)   # 토큰/비용
source_files(path✦, mtime_ms, ...)       # ingest 멱등 가드

뷰: v_resource_counts / v_plugin_counts / v_subagent_resource_usage / v_daily_tokens
    (✦ = UNIQUE/PK,  → = FK,  ? = nullable)
```
- **denormalization**: `resource_invocations`/`usage` 에 `project_id·user_id·day` 복제 →
  대시보드 필터가 조인 없이 인덱스로 해결(분석 DB).
- **sub_agent_id(nullable)** 가 중첩의 열쇠: `NULL`=메인 스레드, 값=그 sub-agent 내부 호출.

---

## `migrate.ts` (멱등)

```
migrate(db):
    if table 'schema_migrations' 존재: return          # 이미 적용됨(no-op)
    transaction:                                        # 실패 시 자동 롤백
        db.exec(SCHEMA_SQL)
        insert schema_migrations(version=1, now)
    # 향후 증분: SCHEMA_VERSION 올리고 버전 분기 추가
```

## `client.ts`

```
createDb(dbPath):
    sqlite = new Database(dbPath)
    sqlite.pragma('journal_mode = WAL')      # 읽기 중 쓰기 경합 완화
    sqlite.pragma('foreign_keys = ON')       # 연결마다 필요(스키마 PRAGMA 는 1회성)
    migrate(sqlite)
    return new Kysely({ dialect: SqliteDialect(sqlite) })   # ← Postgres 전환은 여기만
```

## 롤백 / 재구성

```
# DB 는 원본 jsonl 로부터 항상 재구성 가능(원본은 DATA_DIR 에 보존)
rm observer.db*
CLAUDE_DATA_DIR=... DB_PATH=... tsx src/db/backfill.ts
```
