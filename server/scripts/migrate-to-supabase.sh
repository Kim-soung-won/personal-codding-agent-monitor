#!/usr/bin/env bash
# 사내 Postgres(LEGACY_DATABASE_URL) → Supabase(DIRECT_URL) 데이터 이관.
#
# 전제
#  - 목적지에는 `npm run db:deploy` 로 스키마가 이미 적용돼 있어야 한다.
#  - 원본은 읽기만 한다(그대로 남는다).
#  - 데이터는 FK 의존 순서대로 테이블 단위로 옮긴다. pg_dump 의 data-only 덤프는
#    테이블 순서를 FK 기준으로 보장하지 않아, 한 번에 밀면 참조 위반이 난다.
#  - --disable-triggers 는 superuser 권한이 필요해 Supabase 에서 못 쓴다.
#
# 사용: server/ 에서 `bash scripts/migrate-to-supabase.sh`
set -euo pipefail

cd "$(dirname "$0")/.."
set -a; . ./.env; set +a

: "${LEGACY_DATABASE_URL:?LEGACY_DATABASE_URL 이 .env 에 없습니다}"
: "${DIRECT_URL:?DIRECT_URL 이 .env 에 없습니다}"

if [[ "$DIRECT_URL" == *"[YOUR-PASSWORD]"* ]]; then
  echo "DIRECT_URL 의 [YOUR-PASSWORD] 를 실제 비밀번호로 바꾼 뒤 다시 실행하세요." >&2
  exit 1
fi

# 원본이 PG16 이라 pg_dump 도 16 이상이어야 한다(구버전은 서버가 더 최신이면 거부).
PGBIN="/opt/homebrew/opt/postgresql@16/bin"
PG_DUMP="$PGBIN/pg_dump"
PSQL="$PGBIN/psql"
[[ -x "$PG_DUMP" ]] || { echo "pg_dump 16 을 찾을 수 없습니다: $PG_DUMP" >&2; exit 1; }

SRC="${LEGACY_DATABASE_URL%%\?*}"   # libpq 는 ?schema= 를 모른다
DST="$DIRECT_URL"

# FK 의존 순서. 부모 → 자식.
TABLES=(Project User CommitRecord RecordAgent Signal ToolInvocation FeedbackItem SessionHygiene)

echo "== 목적지 기존 행 수 확인 =="
for t in "${TABLES[@]}"; do
  printf '%-16s %s\n' "$t" "$("$PSQL" "$DST" -Atc "select count(*) from \"$t\"")"
done

echo
echo "== 이관 시작 =="
for t in "${TABLES[@]}"; do
  echo "-- $t"
  "$PG_DUMP" "$SRC" --data-only --no-owner --no-privileges --table="public.\"$t\"" \
    | "$PSQL" "$DST" -v ON_ERROR_STOP=1 --quiet
done

echo
echo "== 검증 (원본 / 목적지) =="
for t in "${TABLES[@]}"; do
  s=$("$PSQL" "$SRC" -Atc "select count(*) from \"$t\"")
  d=$("$PSQL" "$DST" -Atc "select count(*) from \"$t\"")
  status=$([[ "$s" == "$d" ]] && echo OK || echo MISMATCH)
  printf '%-16s %6s / %-6s %s\n' "$t" "$s" "$d" "$status"
done

# autoincrement(Project.id, User.id) 시퀀스를 최대값에 맞춘다.
# data-only 덤프의 setval 은 identity/serial 구성에 따라 누락될 수 있어 명시적으로 맞춘다.
echo
echo "== 시퀀스 정렬 =="
for t in Project User; do
  "$PSQL" "$DST" -Atc \
    "select setval(pg_get_serial_sequence('\"$t\"','id'), coalesce((select max(id) from \"$t\"), 1), (select count(*) > 0 from \"$t\"))" \
    | sed "s/^/$t.id -> /"
done
