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

mkdir -p backups/postgres

stamp="$(date -u +%Y%m%dT%H%M%SZ)"
out="backups/postgres/${POSTGRES_DB}_${stamp}.sql"
tmp="${out}.tmp"

"${DOCKER_COMPOSE[@]}" --env-file .env -f compose.yml exec -T postgres \
  pg_dump -U "$POSTGRES_USER" "$POSTGRES_DB" > "$tmp"

mv "$tmp" "$out"
gzip -f "$out"

find backups/postgres -type f -name "*.sql.gz" -mtime +"${BACKUP_RETENTION_DAYS:-7}" -delete

echo "Created $out.gz"
