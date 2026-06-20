#!/usr/bin/env bash
set -euo pipefail

DAEMON_JSON="${DAEMON_JSON:-/etc/docker/daemon.json}"
BACKUP_PATH="${1:-}"

if [ "${EUID:-$(id -u)}" -ne 0 ]; then
  echo "Run with sudo: sudo bash scripts/rollback-docker-mirror.sh <backup-path>" >&2
  exit 1
fi

if [ -z "$BACKUP_PATH" ]; then
  BACKUP_PATH="$(ls -1t /etc/docker/daemon.json.codex-backup-* 2>/dev/null | head -n 1 || true)"
fi

if [ -n "$BACKUP_PATH" ] && [ -f "$BACKUP_PATH" ]; then
  cp "$BACKUP_PATH" "$DAEMON_JSON"
  chmod 0644 "$DAEMON_JSON"
  echo "Restored Docker daemon config from $BACKUP_PATH."
else
  rm -f "$DAEMON_JSON"
  echo "No backup found. Removed $DAEMON_JSON."
fi

systemctl restart docker
docker info --format '{{json .RegistryConfig.Mirrors}}'
