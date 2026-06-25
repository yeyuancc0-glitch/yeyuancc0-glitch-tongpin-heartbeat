#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="${ROOT_DIR:-/opt/tongpin}"
API_SERVICE="${API_SERVICE:-api}"
APPLY_MODE="false"
SKIP_BACKUP="false"
SKIP_SMOKE="false"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
LOG_DIR="${ROOT_DIR}/logs"
ARTIFACT_DIR="${ROOT_DIR}/runtime/api/migration-artifacts/supabase-to-self-host"

usage() {
  cat <<'USAGE'
Usage:
  bash scripts/run-supabase-migration.sh [--apply] [--skip-backup] [--skip-smoke]

Default mode runs preflight + dry-run only. It never writes self-host data.

Options:
  --apply        Run the full migration: preflight, dry-run, backup, DB apply, Storage copy, final verify.
  --skip-backup  Skip backup-all.sh in apply mode. Use only when a fresh verified backup already exists.
  --skip-smoke   Skip post-migration API smoke tests. Use only when the same API build was just smoke-tested.
  -h, --help     Show this help.

Required secrets are read from /opt/tongpin/.env or the API container environment.
Do not pass secrets as command-line arguments.
USAGE
}

while [ "$#" -gt 0 ]; do
  case "$1" in
    --apply)
      APPLY_MODE="true"
      ;;
    --skip-backup)
      SKIP_BACKUP="true"
      ;;
    --skip-smoke)
      SKIP_SMOKE="true"
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "ERROR unknown argument: $1" >&2
      usage >&2
      exit 2
      ;;
  esac
  shift
done

cd "$ROOT_DIR"
mkdir -p "$LOG_DIR" "$ARTIFACT_DIR"
LOG_FILE="${LOG_DIR}/supabase-migration-${STAMP}.log"

compose() {
  if docker compose version >/dev/null 2>&1 && docker ps >/dev/null 2>&1; then
    docker compose "$@"
  elif sudo docker compose version >/dev/null 2>&1; then
    sudo docker compose "$@"
  else
    echo "ERROR docker compose is unavailable" >&2
    exit 1
  fi
}

run_api() {
  compose exec -T "$API_SERVICE" sh -lc "cd /app && $*"
}

run_smoke_suite() {
  run_api "npm run smoke:auth"
  run_api "npm run smoke:profile"
  run_api "npm run smoke:storage"
  run_api "npm run smoke:messages"
  run_api "npm run smoke:dashboard"
  run_api "npm run smoke:notifications"
  run_api "npm run smoke:privacy"
}

log_step() {
  printf '\n== %s ==\n' "$1"
}

run_flow() {
  echo "started_at=${STAMP}"
  echo "mode=$([ "$APPLY_MODE" = "true" ] && echo apply || echo dry-run)"

  log_step "preflight"
  run_api "npm run migrate:supabase:preflight"

  log_step "dry-run"
  run_api "npm run migrate:supabase:data"

  if [ "$APPLY_MODE" != "true" ]; then
    log_step "complete"
    echo "Dry-run completed. Re-run with --apply to write self-host DB and copy Storage."
    exit 0
  fi

  if [ "$SKIP_BACKUP" != "true" ]; then
    log_step "backup"
    bash scripts/backup-all.sh
  else
    log_step "backup"
    echo "Skipped by --skip-backup. Ensure a fresh verified backup exists before cutover."
  fi

  log_step "apply-db"
  run_api "npm run migrate:supabase:data:apply"

  log_step "copy-storage"
  run_api "npm run migrate:supabase:data:copy-storage"

  log_step "verify"
  run_api "npm run migrate:supabase:data:verify"

  if [ "$SKIP_SMOKE" != "true" ]; then
    log_step "post-migration-smoke"
    run_smoke_suite
  else
    log_step "post-migration-smoke"
    echo "Skipped by --skip-smoke. Cutover still requires recent passing API smoke evidence."
  fi

  log_step "complete"
  echo "Supabase data migration finished. Review ${ARTIFACT_DIR}/latest-report.json and this smoke log before cutover."
}

set +e
( set -e; run_flow ) 2>&1 | tee "$LOG_FILE"
status="${PIPESTATUS[0]}"
set -e
echo "log_file=${LOG_FILE}"
exit "$status"
