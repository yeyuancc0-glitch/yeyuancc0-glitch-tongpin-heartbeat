#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

if [ ! -f .env ]; then
  echo "FAIL missing_env path=$ROOT_DIR/.env"
  exit 1
fi

set -a
. ./.env
set +a

if docker ps >/dev/null 2>&1; then
  DOCKER_COMPOSE=(docker compose)
else
  DOCKER_COMPOSE=(sudo docker compose)
fi

MAX_AGE_HOURS="${RESTORE_VERIFY_MAX_AGE_HOURS:-${MONITOR_BACKUP_MAX_AGE_HOURS:-30}}"
MAX_MINUTES=$((MAX_AGE_HOURS * 60))
VERIFY_DB="tongpin_restore_verify_$(date -u +%Y%m%d%H%M%S)_$$"
RESTORE_CREATED=0
LIST_FILE="$(mktemp)"

cleanup() {
  rm -f "$LIST_FILE"
  if [ "$RESTORE_CREATED" -eq 1 ]; then
    "${DOCKER_COMPOSE[@]}" --env-file .env -f compose.yml exec -T postgres \
      dropdb --if-exists -U "$POSTGRES_USER" "$VERIFY_DB" >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT

ok() {
  echo "OK $*"
}

fail() {
  echo "FAIL $*" >&2
  exit 1
}

latest_fresh_file() {
  local dir="$1"
  local pattern="$2"
  find "$dir" -type f -name "$pattern" -size +0c -mmin "-$MAX_MINUTES" -print 2>/dev/null | sort | tail -1 || true
}

PG_FILE="$(latest_fresh_file backups/postgres "*.sql.gz")"
MINIO_FILE="$(latest_fresh_file backups/minio-archive "minio-data_*.tar.gz")"

if [ -z "$PG_FILE" ]; then
  fail "restore_verify_postgres backup_missing max_age_hours=$MAX_AGE_HOURS"
fi
if [ -z "$MINIO_FILE" ]; then
  fail "restore_verify_minio_archive backup_missing max_age_hours=$MAX_AGE_HOURS"
fi

gzip -t "$PG_FILE"
ok "restore_verify_postgres gzip_ok file=$PG_FILE"

"${DOCKER_COMPOSE[@]}" --env-file .env -f compose.yml exec -T postgres \
  createdb -U "$POSTGRES_USER" "$VERIFY_DB"
RESTORE_CREATED=1
ok "restore_verify_postgres temp_db_created name=$VERIFY_DB"

gunzip -c "$PG_FILE" | "${DOCKER_COMPOSE[@]}" --env-file .env -f compose.yml exec -T postgres \
  psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$VERIFY_DB" >/dev/null
ok "restore_verify_postgres restore_completed file=$PG_FILE"

required_tables=(
  app_auth.accounts
  app_auth.refresh_sessions
  app_auth.email_verification_tokens
  app_auth.password_reset_tokens
  app_auth.login_attempts
  app_auth.jwt_key_registry
  public.profiles
  public.couples
  public.couple_members
  public.pair_invites
  public.media_files
  public.profile_avatar_uploads
  public.messages
  public.checkins
  public.mood_status
  public.future_letters
  public.notifications
  public.calendar_events
  public.couple_footprints
  public.notification_preferences
  public.push_tokens
  public.push_deliveries
  public.reports
  public.blocks
  public.account_deletion_requests
  public.app_feedback
  public.creation_spaces
  public.creation_actions
  public.pet_memories
  public.creation_game_reward_claims
)

for table_name in "${required_tables[@]}"; do
  exists="$("${DOCKER_COMPOSE[@]}" --env-file .env -f compose.yml exec -T postgres \
    psql -At -U "$POSTGRES_USER" -d "$VERIFY_DB" \
    -c "select to_regclass('${table_name}') is not null" | tr -d '[:space:]')"
  if [ "$exists" != "t" ]; then
    fail "restore_verify_postgres required_table_missing table=$table_name"
  fi
done
ok "restore_verify_postgres required_tables=${#required_tables[@]}"

"${DOCKER_COMPOSE[@]}" --env-file .env -f compose.yml exec -T postgres \
  dropdb --if-exists -U "$POSTGRES_USER" "$VERIFY_DB" >/dev/null
RESTORE_CREATED=0
ok "restore_verify_postgres temp_db_dropped name=$VERIFY_DB"

tar -tzf "$MINIO_FILE" > "$LIST_FILE"
ok "restore_verify_minio_archive tar_ok file=$MINIO_FILE"

if ! grep -qx "data/" "$LIST_FILE"; then
  fail "restore_verify_minio_archive missing_data_root file=$MINIO_FILE"
fi
if ! grep -Eq '^data/\.minio\.sys/' "$LIST_FILE"; then
  fail "restore_verify_minio_archive missing_minio_metadata file=$MINIO_FILE"
fi
if ! grep -Eq '^data/(couple-media|profile-avatars)(/|$)|^data/\.minio\.sys/buckets/(couple-media|profile-avatars)/' "$LIST_FILE"; then
  fail "restore_verify_minio_archive missing_known_bucket_metadata file=$MINIO_FILE"
fi
ok "restore_verify_minio_archive structure_ok file=$MINIO_FILE"

echo "SUMMARY restore_verify status=ok postgres=$PG_FILE minio=$MINIO_FILE"
