#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

bash scripts/backup-postgres.sh
bash scripts/backup-minio-archive.sh
bash scripts/backup-minio-list.sh

echo "Completed staging backups"
