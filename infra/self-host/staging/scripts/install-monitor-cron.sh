#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

CRON_PATH="${MONITOR_CRON_PATH:-/etc/cron.d/tongpin-staging-monitor}"
CRON_SCHEDULE="${MONITOR_CRON_SCHEDULE:-*/5 * * * *}"
CRON_USER="${MONITOR_CRON_USER:-ubuntu}"
LOG_DIR="${MONITOR_LOG_DIR:-/opt/tongpin/logs}"

if [ ! -f scripts/monitor-staging.sh ]; then
  echo "Missing scripts/monitor-staging.sh in $ROOT_DIR" >&2
  exit 1
fi

sudo mkdir -p "$LOG_DIR"
sudo chown "$CRON_USER:$CRON_USER" "$LOG_DIR"

tmp="$(mktemp)"
cat > "$tmp" <<EOF
SHELL=/bin/bash
PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin

$CRON_SCHEDULE $CRON_USER cd $ROOT_DIR && bash scripts/monitor-staging.sh >> $LOG_DIR/monitor-staging.log 2>&1
EOF

sudo install -m 0644 "$tmp" "$CRON_PATH"
rm -f "$tmp"

echo "Installed $CRON_PATH"
