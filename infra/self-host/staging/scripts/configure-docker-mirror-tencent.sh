#!/usr/bin/env bash
set -euo pipefail

MIRROR_URL="${MIRROR_URL:-https://mirror.ccs.tencentyun.com}"
DAEMON_JSON="${DAEMON_JSON:-/etc/docker/daemon.json}"
BACKUP_DIR="${BACKUP_DIR:-/etc/docker}"
BACKUP_PATH="$BACKUP_DIR/daemon.json.codex-backup-$(date +%Y%m%d%H%M%S)"

if [ "${EUID:-$(id -u)}" -ne 0 ]; then
  echo "Run with sudo: sudo bash scripts/configure-docker-mirror-tencent.sh" >&2
  exit 1
fi

if ! command -v docker >/dev/null 2>&1; then
  echo "Docker is not installed." >&2
  exit 1
fi

mkdir -p "$(dirname "$DAEMON_JSON")"

if [ -s "$DAEMON_JSON" ]; then
  cp "$DAEMON_JSON" "$BACKUP_PATH"

  if grep -q "$MIRROR_URL" "$DAEMON_JSON"; then
    echo "Docker mirror already configured: $MIRROR_URL"
    systemctl restart docker
    docker info --format '{{json .RegistryConfig.Mirrors}}'
    exit 0
  fi

  if [ "${ALLOW_DAEMON_JSON_REPLACE:-}" != "1" ]; then
    echo "Existing $DAEMON_JSON was backed up to $BACKUP_PATH." >&2
    echo "Refusing to replace a non-empty Docker daemon config automatically." >&2
    echo "Review the backup, then rerun with ALLOW_DAEMON_JSON_REPLACE=1 if replacement is acceptable." >&2
    exit 1
  fi
fi

cat >"$DAEMON_JSON" <<JSON
{
  "registry-mirrors": [
    "$MIRROR_URL"
  ]
}
JSON

chmod 0644 "$DAEMON_JSON"
systemctl restart docker
docker info --format '{{json .RegistryConfig.Mirrors}}'

echo "Docker registry mirror configured: $MIRROR_URL"
echo "Backup path: $BACKUP_PATH"
