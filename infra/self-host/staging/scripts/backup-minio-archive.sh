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
  DOCKER=(docker)
else
  DOCKER_COMPOSE=(sudo docker compose)
  DOCKER=(sudo docker)
fi

mkdir -p backups/minio-archive

stamp="$(date -u +%Y%m%dT%H%M%SZ)"
out="backups/minio-archive/minio-data_${stamp}.tar.gz"
tmp="${out}.tmp"
work_dir="$(mktemp -d "${TMPDIR:-/tmp}/tongpin-minio-backup.XXXXXX")"

cleanup() {
  rm -rf "$work_dir" "$tmp" 2>/dev/null || sudo rm -rf "$work_dir" "$tmp"
}
trap cleanup EXIT

container_id="$("${DOCKER_COMPOSE[@]}" --env-file .env -f compose.yml ps -q minio)"
if [ -z "$container_id" ]; then
  echo "MinIO container is not running" >&2
  exit 1
fi

mkdir -p "$work_dir/data"
"${DOCKER[@]}" cp "$container_id:/data/." "$work_dir/data"

tar -C "$work_dir" -czf "$tmp" data
mv "$tmp" "$out"

find backups/minio-archive -type f -name "minio-data_*.tar.gz" -mtime +"${BACKUP_RETENTION_DAYS:-7}" -delete

echo "Created $out"
