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

if docker ps >/dev/null 2>&1; then
  DOCKER_COMPOSE=(docker compose)
else
  DOCKER_COMPOSE=(sudo docker compose)
fi

mkdir -p backups/minio

stamp="$(date -u +%Y%m%dT%H%M%SZ)"
out="backups/minio/object-list_${stamp}.txt"
tmp="${out}.tmp"

"${DOCKER_COMPOSE[@]}" --env-file .env -f compose.yml exec -T minio \
  sh -c "cd /data && ls -1R" > "$tmp"

mv "$tmp" "$out"
find backups/minio -type f -name "object-list_*.txt" -mtime +"${BACKUP_RETENTION_DAYS:-7}" -delete

echo "Created $out"
