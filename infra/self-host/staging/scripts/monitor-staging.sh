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
  DOCKER=(docker)
else
  DOCKER_COMPOSE=(sudo docker compose)
  DOCKER=(sudo docker)
fi

STATUS=0
WARNINGS=0
CHECKS=0
ALERT_STATUS=0

API_URL="${MONITOR_API_URL:-https://api-staging.fancah.tech}"
WEB_URL="${MONITOR_WEB_URL:-https://tongpin.fancah.tech}"
ASSETS_URL="${MONITOR_ASSETS_URL:-https://assets-staging.fancah.tech}"
DISK_WARN_PERCENT="${MONITOR_DISK_WARN_PERCENT:-85}"
BACKUP_MAX_AGE_HOURS="${MONITOR_BACKUP_MAX_AGE_HOURS:-30}"
MONITOR_NAME="${MONITOR_NAME:-tongpin-staging}"
MONITOR_WEBHOOK_URL="${MONITOR_WEBHOOK_URL:-}"
MONITOR_ALERT_ON_SUCCESS="${MONITOR_ALERT_ON_SUCCESS:-false}"

ok() {
  CHECKS=$((CHECKS + 1))
  echo "OK $*"
}

warn() {
  CHECKS=$((CHECKS + 1))
  WARNINGS=$((WARNINGS + 1))
  echo "WARN $*"
}

fail() {
  CHECKS=$((CHECKS + 1))
  STATUS=1
  echo "FAIL $*"
}

check_command() {
  if command -v "$1" >/dev/null 2>&1; then
    ok "command name=$1"
  else
    fail "command_missing name=$1"
  fi
}

check_required_services() {
  local services=(caddy api worker postgres redis minio)
  local service
  for service in "${services[@]}"; do
    local container_id
    container_id="$("${DOCKER_COMPOSE[@]}" --env-file .env -f compose.yml ps -q "$service" 2>/dev/null || true)"
    if [ -z "$container_id" ]; then
      fail "container_missing service=$service"
      continue
    fi

    local running
    running="$("${DOCKER[@]}" inspect -f '{{.State.Running}}' "$container_id" 2>/dev/null || true)"
    if [ "$running" != "true" ]; then
      fail "container_not_running service=$service"
      continue
    fi

    local health
    health="$("${DOCKER[@]}" inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}' "$container_id" 2>/dev/null || true)"
    case "$health" in
      healthy)
        ok "container service=$service health=healthy"
        ;;
      none)
        ok "container service=$service running=true health=none"
        ;;
      *)
        fail "container_unhealthy service=$service health=${health:-unknown}"
        ;;
    esac
  done
}

check_local_dependencies() {
  if curl -fsS "http://127.0.0.1:${API_PORT:-3000}/health" | grep -q '"status":"ok"'; then
    ok "local_api_health status=ok"
  else
    fail "local_api_health status=failed"
  fi

  if "${DOCKER_COMPOSE[@]}" --env-file .env -f compose.yml exec -T postgres \
    pg_isready -U "$POSTGRES_USER" -d "$POSTGRES_DB" >/dev/null; then
    ok "postgres pg_isready=ok"
  else
    fail "postgres pg_isready=failed"
  fi

  if "${DOCKER_COMPOSE[@]}" --env-file .env -f compose.yml exec -T redis redis-cli ping | grep -q PONG; then
    ok "redis ping=PONG"
  else
    fail "redis ping=failed"
  fi
}

check_public_endpoints() {
  local deep
  deep="$(curl -fsS --max-time 20 "$API_URL/api/health/deep" 2>/dev/null || true)"
  if echo "$deep" | grep -q '"status":"ok"' && echo "$deep" | grep -q '"requestId"'; then
    ok "public_api_deep status=ok request_id=true"
  else
    fail "public_api_deep status=failed url=$API_URL/api/health/deep"
  fi

  if curl -fsSI --max-time 20 "$WEB_URL/auth/verify-email?token=monitor" | grep -q " 200"; then
    ok "public_web_route route=/auth/verify-email status=200"
  else
    fail "public_web_route route=/auth/verify-email status=failed"
  fi

  if curl -fsSI --max-time 20 "$WEB_URL/auth/reset-password?token=monitor" | grep -q " 200"; then
    ok "public_web_route route=/auth/reset-password status=200"
  else
    fail "public_web_route route=/auth/reset-password status=failed"
  fi

  if curl -sSI --max-time 20 "$ASSETS_URL" | grep -q " 200\| 400\| 403"; then
    ok "public_assets_endpoint reachable=true"
  else
    warn "public_assets_endpoint reachable=false url=$ASSETS_URL"
  fi
}

check_disk() {
  local used
  used="$(df -P "$ROOT_DIR" | awk 'NR==2 { gsub("%", "", $5); print $5 }')"
  if [ -z "$used" ]; then
    fail "disk_usage status=unknown path=$ROOT_DIR"
    return
  fi
  if [ "$used" -ge "$DISK_WARN_PERCENT" ]; then
    fail "disk_usage used_percent=$used threshold=$DISK_WARN_PERCENT"
  else
    ok "disk_usage used_percent=$used threshold=$DISK_WARN_PERCENT"
  fi
}

check_backup_freshness() {
  local max_minutes=$((BACKUP_MAX_AGE_HOURS * 60))
  local pg_file minio_archive minio_list
  pg_file="$(find backups/postgres -type f -name "*.sql.gz" -mmin "-$max_minutes" -print 2>/dev/null | sort | tail -1 || true)"
  minio_archive="$(find backups/minio-archive -type f -name "minio-data_*.tar.gz" -size +0c -mmin "-$max_minutes" -print 2>/dev/null | sort | tail -1 || true)"
  minio_list="$(find backups/minio -type f -name "object-list_*.txt" -mmin "-$max_minutes" -print 2>/dev/null | sort | tail -1 || true)"

  if [ -n "$pg_file" ]; then
    ok "backup_postgres fresh=true max_age_hours=$BACKUP_MAX_AGE_HOURS file=$pg_file"
  else
    fail "backup_postgres fresh=false max_age_hours=$BACKUP_MAX_AGE_HOURS"
  fi

  if [ -n "$minio_archive" ]; then
    ok "backup_minio_archive fresh=true max_age_hours=$BACKUP_MAX_AGE_HOURS file=$minio_archive"
  else
    fail "backup_minio_archive fresh=false max_age_hours=$BACKUP_MAX_AGE_HOURS"
  fi

  if [ -n "$minio_list" ]; then
    ok "backup_minio_object_list fresh=true max_age_hours=$BACKUP_MAX_AGE_HOURS file=$minio_list"
  else
    warn "backup_minio_object_list fresh=false max_age_hours=$BACKUP_MAX_AGE_HOURS"
  fi
}

check_self_host_integrity() {
  local audit_output
  if audit_output="$("${DOCKER_COMPOSE[@]}" --env-file .env -f compose.yml exec -T api \
    npm run audit:self-host-integrity --silent 2>&1)"; then
    if echo "$audit_output" | grep -q '"status": "ok"'; then
      ok "self_host_integrity status=ok"
    elif echo "$audit_output" | grep -q '"status": "warning"'; then
      warn "self_host_integrity status=warning"
    else
      warn "self_host_integrity status=unknown"
    fi
  else
    fail "self_host_integrity status=failed"
  fi
}

json_escape() {
  printf "%s" "$1" | python3 -c 'import json, sys; print(json.dumps(sys.stdin.read())[1:-1], end="")'
}

send_alert_if_needed() {
  local final_status="$1"
  local summary_line="$2"
  local failure_lines="$3"

  if [ -z "$MONITOR_WEBHOOK_URL" ]; then
    if [ "$final_status" != "ok" ]; then
      warn "alert skipped=webhook_not_configured"
    fi
    return
  fi

  if [ "$final_status" = "ok" ] && [ "$MONITOR_ALERT_ON_SUCCESS" != "true" ]; then
    ok "alert skipped=status_ok"
    return
  fi

  if ! command -v python3 >/dev/null 2>&1; then
    ALERT_STATUS=1
    warn "alert sent=false reason=python3_missing"
    return
  fi

  local escaped_summary escaped_failures payload
  escaped_summary="$(json_escape "$summary_line")"
  escaped_failures="$(json_escape "$failure_lines")"
  payload="{\"service\":\"$MONITOR_NAME\",\"status\":\"$final_status\",\"summary\":\"$escaped_summary\",\"failures\":\"$escaped_failures\",\"checkedAt\":\"$(date -u +%Y-%m-%dT%H:%M:%SZ)\"}"

  if curl -fsS --max-time 10 \
    -H "Content-Type: application/json" \
    -d "$payload" \
    "$MONITOR_WEBHOOK_URL" >/dev/null; then
    ok "alert sent=true"
  else
    ALERT_STATUS=1
    warn "alert sent=false"
  fi
}

LOG_FILE="$(mktemp)"
exec > >(tee "$LOG_FILE") 2>&1

check_command curl
check_command awk
check_required_services
check_local_dependencies
check_public_endpoints
check_disk
check_backup_freshness
check_self_host_integrity

FINAL_STATUS="$([ "$STATUS" -eq 0 ] && echo ok || echo failed)"
SUMMARY_LINE="SUMMARY checks=$CHECKS warnings=$WARNINGS status=$FINAL_STATUS"
FAILURE_LINES="$(grep -E '^(FAIL|WARN) ' "$LOG_FILE" || true)"
send_alert_if_needed "$FINAL_STATUS" "$SUMMARY_LINE" "$FAILURE_LINES"
echo "SUMMARY checks=$CHECKS warnings=$WARNINGS status=$FINAL_STATUS"
rm -f "$LOG_FILE"
if [ "$STATUS" -ne 0 ]; then
  exit "$STATUS"
fi
exit "$ALERT_STATUS"
