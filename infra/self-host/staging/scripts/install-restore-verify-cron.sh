#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

CRON_PATH="${RESTORE_VERIFY_CRON_PATH:-/etc/cron.d/tongpin-staging-restore-verify}"
CRON_SCHEDULE="${RESTORE_VERIFY_CRON_SCHEDULE:-17 4 * * 0}"
CRON_USER="${RESTORE_VERIFY_CRON_USER:-ubuntu}"
LOG_DIR="${RESTORE_VERIFY_LOG_DIR:-/opt/tongpin/logs}"

if [ ! -f scripts/verify-backups-restore.sh ]; then
  echo "Missing scripts/verify-backups-restore.sh in $ROOT_DIR" >&2
  exit 1
fi

sudo mkdir -p "$LOG_DIR"
sudo chown "$CRON_USER:$CRON_USER" "$LOG_DIR"

tmp="$(mktemp)"
cat > "$tmp" <<EOF
SHELL=/bin/bash
PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin

$CRON_SCHEDULE $CRON_USER cd $ROOT_DIR && bash scripts/verify-backups-restore.sh >> $LOG_DIR/restore-verify-staging.log 2>&1
EOF

sudo install -m 0644 "$tmp" "$CRON_PATH"
rm -f "$tmp"

echo "Installed $CRON_PATH"
