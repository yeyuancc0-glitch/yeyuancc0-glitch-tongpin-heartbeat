#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

if [ ! -f .env ]; then
  echo "Missing .env in $ROOT_DIR" >&2
  exit 1
fi

set -a
. ./.env
set +a

if docker compose version >/dev/null 2>&1 && docker ps >/dev/null 2>&1; then
  DOCKER_COMPOSE=(docker compose)
else
  DOCKER_COMPOSE=(sudo docker compose)
fi

"${DOCKER_COMPOSE[@]}" --env-file .env -f compose.yml ps

curl -fsS "http://127.0.0.1:${API_PORT:-3000}/health" >/tmp/tongpin-health.json
grep -q '"status":"ok"' /tmp/tongpin-health.json

"${DOCKER_COMPOSE[@]}" --env-file .env -f compose.yml exec -T postgres \
  pg_isready -U "$POSTGRES_USER" -d "$POSTGRES_DB"

"${DOCKER_COMPOSE[@]}" --env-file .env -f compose.yml exec -T redis redis-cli ping | grep -q PONG

echo "Staging healthcheck passed."
