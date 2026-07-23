/**
 * DB 스키마의 단일 소스 (SQLite, migration version 1).
 *
 * .sql 파일은 tsc 가 dist 로 복사하지 않아 Docker 런타임에서 누락되므로,
 * DDL 을 TS 문자열 상수로 둔다(컴파일되어 dist 에 포함). SQLite 에 로드해 뷰·상호참조 FK·
 * 핵심 쿼리까지 실측 검증 완료.
 *
 * 이식성: 표준 타입만 사용. Postgres 교체 시 델타 — INTEGER PK → IDENTITY,
 * TEXT(ts) → TIMESTAMPTZ, TEXT(json) → JSONB, REAL → DOUBLE PRECISION, strftime → date_trunc.
 */

export const SCHEMA_VERSION = 1

export const SCHEMA_SQL = `
CREATE TABLE schema_migrations (
  version     INTEGER PRIMARY KEY,
  applied_at  TEXT NOT NULL
);

-- users: JSONL 에 신원 없음(userType='external' 뿐) → [SYNC] git user 주입
CREATE TABLE users (
  id           INTEGER PRIMARY KEY,
  identifier   TEXT NOT NULL UNIQUE,
  display_name TEXT,
  created_at   TEXT NOT NULL
);

-- projects: [JSONL] cwd 가 실제 경로. user 는 sessions 축에 둔다(크로스유저 프로젝트).
CREATE TABLE projects (
  id       INTEGER PRIMARY KEY,
  encoded  TEXT NOT NULL UNIQUE,
  path     TEXT NOT NULL,
  name     TEXT NOT NULL
);
CREATE INDEX idx_projects_name ON projects (name);

-- plugins: skill/agent/mcp 상위 단위 차원. installed 는 [SYNC] 매니페스트가 있어야 채움.
CREATE TABLE plugins (
  id            INTEGER PRIMARY KEY,
  name          TEXT NOT NULL UNIQUE,
  source        TEXT,
  version       TEXT,
  installed     INTEGER,
  first_seen_at TEXT,
  last_used_at  TEXT
);

CREATE TABLE sessions (
  id               TEXT PRIMARY KEY,
  project_id       INTEGER NOT NULL REFERENCES projects (id),
  user_id          INTEGER REFERENCES users (id),
  title            TEXT,
  ai_title         TEXT,
  custom_title     TEXT,
  description      TEXT,
  git_branch       TEXT,
  cc_version       TEXT,
  started_at       TEXT,
  last_activity_at TEXT,
  event_count      INTEGER NOT NULL DEFAULT 0,
  total_cost_usd   REAL    NOT NULL DEFAULT 0,
  ingested_at      TEXT NOT NULL
);
CREATE INDEX idx_sessions_project       ON sessions (project_id);
CREATE INDEX idx_sessions_user          ON sessions (user_id);
CREATE INDEX idx_sessions_last_activity ON sessions (last_activity_at);

-- sub_agents: {session}/subagents/agent-{id}.jsonl 1개당 1행.
CREATE TABLE sub_agents (
  id                  INTEGER PRIMARY KEY,
  session_id          TEXT NOT NULL REFERENCES sessions (id),
  agent_uuid          TEXT NOT NULL,
  subagent_type       TEXT,
  plugin              TEXT,
  description         TEXT,
  spawn_invocation_id INTEGER REFERENCES resource_invocations (id),
  started_at          TEXT,
  ended_at            TEXT,
  status              TEXT,
  input_tokens        INTEGER NOT NULL DEFAULT 0,
  output_tokens       INTEGER NOT NULL DEFAULT 0,
  cache_write         INTEGER NOT NULL DEFAULT 0,
  cache_read          INTEGER NOT NULL DEFAULT 0,
  cost_usd            REAL    NOT NULL DEFAULT 0,
  UNIQUE (session_id, agent_uuid)
);
CREATE INDEX idx_sub_agents_session ON sub_agents (session_id);
CREATE INDEX idx_sub_agents_type    ON sub_agents (subagent_type);
CREATE INDEX idx_sub_agents_plugin  ON sub_agents (plugin);

-- events: 정규화된 JSONL 라인. 세션 상세 실행 이력의 원천.
CREATE TABLE events (
  id           TEXT PRIMARY KEY,
  session_id   TEXT NOT NULL REFERENCES sessions (id),
  sub_agent_id INTEGER REFERENCES sub_agents (id),
  origin       TEXT NOT NULL,
  category     TEXT NOT NULL,
  type         TEXT,
  parent_uuid  TEXT,
  timestamp    TEXT NOT NULL,
  summary      TEXT,
  raw          TEXT NOT NULL
);
CREATE INDEX idx_events_session   ON events (session_id, timestamp);
CREATE INDEX idx_events_category  ON events (category);
CREATE INDEX idx_events_sub_agent ON events (sub_agent_id);

-- resource_invocations: 리소스 통계의 중심. 필터 축(user/project/sub_agent) denormalized.
CREATE TABLE resource_invocations (
  id           INTEGER PRIMARY KEY,
  event_id     TEXT REFERENCES events (id),
  session_id   TEXT NOT NULL REFERENCES sessions (id),
  project_id   INTEGER NOT NULL REFERENCES projects (id),
  user_id      INTEGER REFERENCES users (id),
  sub_agent_id INTEGER REFERENCES sub_agents (id),
  kind         TEXT NOT NULL,
  plugin       TEXT,
  resource     TEXT NOT NULL,
  mcp_server   TEXT,
  source       TEXT,
  timestamp    TEXT NOT NULL,
  duration_ms  INTEGER,
  is_error     INTEGER,
  interrupted  INTEGER
);
CREATE INDEX idx_ri_kind_resource ON resource_invocations (kind, resource);
CREATE INDEX idx_ri_plugin        ON resource_invocations (plugin);
CREATE INDEX idx_ri_session       ON resource_invocations (session_id);
CREATE INDEX idx_ri_project       ON resource_invocations (project_id);
CREATE INDEX idx_ri_user          ON resource_invocations (user_id);
CREATE INDEX idx_ri_sub_agent     ON resource_invocations (sub_agent_id);
CREATE INDEX idx_ri_mcp_server    ON resource_invocations (mcp_server);
CREATE INDEX idx_ri_timestamp     ON resource_invocations (timestamp);

-- usage: 토큰/비용. requestId 중복제거. project/user/day denormalized.
CREATE TABLE usage (
  id            INTEGER PRIMARY KEY,
  session_id    TEXT NOT NULL REFERENCES sessions (id),
  sub_agent_id  INTEGER REFERENCES sub_agents (id),
  project_id    INTEGER NOT NULL REFERENCES projects (id),
  user_id       INTEGER REFERENCES users (id),
  request_id    TEXT,
  model         TEXT,
  input_tokens  INTEGER NOT NULL DEFAULT 0,
  output_tokens INTEGER NOT NULL DEFAULT 0,
  cache_write   INTEGER NOT NULL DEFAULT 0,
  cache_read    INTEGER NOT NULL DEFAULT 0,
  cost_usd      REAL    NOT NULL DEFAULT 0,
  timestamp     TEXT,
  day           TEXT NOT NULL,
  UNIQUE (session_id, request_id)
);
CREATE INDEX idx_usage_session ON usage (session_id);
CREATE INDEX idx_usage_day     ON usage (day);
CREATE INDEX idx_usage_project ON usage (project_id, day);
CREATE INDEX idx_usage_user    ON usage (user_id, day);
CREATE INDEX idx_usage_model   ON usage (model);

-- source_files: ingest 멱등성/증분 처리(파일별 mtime).
CREATE TABLE source_files (
  path        TEXT PRIMARY KEY,
  session_id  TEXT,
  origin      TEXT,
  mtime_ms    REAL NOT NULL,
  ingested_at TEXT NOT NULL
);

-- ═══ 대시보드 편의 뷰 ═══
CREATE VIEW v_resource_counts AS
SELECT kind, plugin, resource, mcp_server,
       COUNT(*)                   AS calls,
       COUNT(DISTINCT session_id) AS sessions,
       COUNT(DISTINCT project_id) AS projects,
       COUNT(DISTINCT user_id)    AS users,
       SUM(COALESCE(is_error, 0)) AS errors
FROM resource_invocations
GROUP BY kind, plugin, resource, mcp_server;

CREATE VIEW v_subagent_resource_usage AS
SELECT sa.subagent_type,
       ri.kind, ri.plugin, ri.resource, ri.mcp_server,
       COUNT(*)                      AS calls,
       COUNT(DISTINCT ri.session_id) AS sessions
FROM resource_invocations ri
JOIN sub_agents sa ON sa.id = ri.sub_agent_id
GROUP BY sa.subagent_type, ri.kind, ri.plugin, ri.resource, ri.mcp_server;

CREATE VIEW v_daily_tokens AS
SELECT day, project_id, user_id,
       SUM(input_tokens)  AS input_tokens,
       SUM(output_tokens) AS output_tokens,
       SUM(cache_write)   AS cache_write,
       SUM(cache_read)    AS cache_read,
       SUM(cost_usd)      AS cost_usd
FROM usage
GROUP BY day, project_id, user_id;

CREATE VIEW v_plugin_counts AS
SELECT plugin,
       COUNT(*)                                        AS calls,
       SUM(CASE WHEN kind = 'skill' THEN 1 ELSE 0 END) AS skill_calls,
       SUM(CASE WHEN kind = 'agent' THEN 1 ELSE 0 END) AS agent_calls,
       COUNT(DISTINCT resource)                        AS distinct_resources,
       COUNT(DISTINCT session_id)                      AS sessions,
       COUNT(DISTINCT project_id)                      AS projects,
       COUNT(DISTINCT user_id)                         AS users,
       MIN(timestamp)                                  AS first_used_at,
       MAX(timestamp)                                  AS last_used_at
FROM resource_invocations
WHERE plugin IS NOT NULL
GROUP BY plugin;
`
