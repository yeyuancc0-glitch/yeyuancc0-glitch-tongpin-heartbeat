# Tongpin Self-Hosted Staging Runbook

This runbook is for the first self-hosted staging stack on `/opt/tongpin`.

It must not be used for backend production cutover without the data migration and cutover gates in `docs/self-host-cutover-rollback.md`.

## Current State

- Server: Tencent Cloud Lighthouse `Ubuntu-2fho`
- Public IPv4: `81.71.9.118`
- OS: Ubuntu 22.04.5 LTS
- Docker: `29.1.3`
- Compose: `2.40.3`
- Remote directory: `/opt/tongpin`
- Remote `.env`: generated on the server only, mode `600`
- Docker registry mirror: configured as `https://mirror.ccs.tencentyun.com`
- Staging containers: running under `/opt/tongpin`
- Local health checks: API `/health`, PostgreSQL `pg_isready`, and Redis `PONG` passed
- Public HTTP: `80/tcp` reaches Caddy for direct IP requests and returns Caddy's HTTPS redirect
- Public DNS/firewall: `tongpin.fancah.tech`, `api-staging.fancah.tech`, and `assets-staging.fancah.tech` must point to `81.71.9.118`; Tencent Cloud `443/tcp` is open
- TLS: Caddy obtains Let's Encrypt certificates after DNS points at the server
- Public domain caveat: `fancah.tech` ICP filing is complete, so direct public HTTPS should be used before considering a tunnel
- Backup rehearsal: PostgreSQL dump, MinIO data archive, and MinIO object-list generation passed; the object list is only an inventory aid, while the `backups/minio-archive/minio-data_*.tar.gz` files are the restorable MinIO data snapshots.
- API runtime: remote `/opt/tongpin/runtime/api` is synced from the local `apps/server` skeleton; public `https://api-staging.fancah.tech/api/health` and `/api/health/deep` return `status: ok`.
- Auth staging smoke has passed against `https://api-staging.fancah.tech`: register, email verification, login, authenticated `/api/me`, refresh rotation, refresh-token reuse family revocation, password reset, and password-reset session revocation.
- Storage staging smoke has passed against `https://api-staging.fancah.tech`: pair invite binding, upload size/MIME rejection, signed MinIO upload, server-side upload completion verification, partner read URL, outsider forbidden, and delete synchronization.
- Push worker staging smoke has passed against `https://api-staging.fancah.tech`: notification preferences, Web Push subscription registration without secret echo, push delivery enqueue, worker processing, and token disable.
- Push worker runtime: `worker` container runs `runtime/api/src/pushWorker.mjs`; it claims `push_deliveries`, requeues stale claims, sends Expo/Web Push when configured, disables invalid tokens, and writes delivery status. Web Push delivery requires real `WEB_PUSH_VAPID_PUBLIC_KEY` and `WEB_PUSH_VAPID_PRIVATE_KEY` in server `.env`.
- Notification realtime: self-host staging exposes low-sensitive `/api/notifications/stream` SSE for notification refresh triggers. Caddy handles this route without response compression and with `flush_interval -1`; ordinary API routes still use zstd/gzip.
- Staging Auth secrets are generated only in server `/opt/tongpin/.env`; do not copy their values into docs, git, or chat.
- Still pending: reboot recovery verification

## Before Any Server Change

1. Confirm production remains untouched:
   - Do not change Vercel environment variables.
   - Do not publish a production Vercel deploy unless the user explicitly asks to publish/deploy/go live.
- Do not run the Supabase-to-self-host data migration with `--apply` unless a backup and cutover window are confirmed.
- Do not skip post-migration smoke unless the same API build already has recent passing smoke evidence.
   - Only change the planned `fancah.tech` DNS records for this migration.
2. Confirm the command scope:
   - Docker mirror configuration is host-level and restarts Docker; it is already configured on the current staging server.
   - `docker compose up -d` starts only the staging stack under `/opt/tongpin`.
   - Adding `443/tcp` or DNS records affects public reachability, but not the production Vercel/Supabase path.
3. Confirm rollback:
   - Existing `/etc/docker/daemon.json` is backed up before mirror replacement.
   - Staging containers can be stopped with `docker compose down`.

## Configure Docker Mirror

Run on the server from `/opt/tongpin`:

```bash
sudo bash scripts/configure-docker-mirror-tencent.sh
```

If the server already has a non-empty `/etc/docker/daemon.json`, the script refuses to replace it automatically. Review the backup and rerun only if replacement is acceptable:

```bash
sudo ALLOW_DAEMON_JSON_REPLACE=1 bash scripts/configure-docker-mirror-tencent.sh
```

Rollback:

```bash
sudo bash scripts/rollback-docker-mirror.sh
```

## Start Staging

```bash
cd /opt/tongpin
sudo docker compose --env-file .env -f compose.yml up -d
sudo docker compose --env-file .env -f compose.yml ps
```

## Verify Staging Locally On The Server

```bash
cd /opt/tongpin
curl -fsS http://127.0.0.1:3000/health
sudo docker compose --env-file .env -f compose.yml exec -T postgres pg_isready -U "$POSTGRES_USER" -d "$POSTGRES_DB"
sudo docker compose --env-file .env -f compose.yml exec -T redis redis-cli ping
sudo -v
bash scripts/healthcheck.sh
bash scripts/monitor-staging.sh
```

Expected API health response:

```json
{"status":"ok","service":"tongpin-self-host-api"}
```

The exact response also includes environment, uptime, time, and request id fields.

The current staging API code is mounted from `/opt/tongpin/runtime/api`: package files live at `runtime/api/package*.json`, source files at `runtime/api/src`, and smoke scripts at `runtime/api/scripts`. When updating `apps/server/src` or `apps/server/scripts`, sync the same files into `infra/self-host/staging/runtime/api` before uploading the staging template.

The API container installs runtime dependencies into the `api_node_modules` Docker volume using `npm ci --omit=dev` when `argon2` or `pg` is missing. If dependency versions change and the volume becomes stale, recreate only the API volume during a maintenance window:

```bash
cd /opt/tongpin
sudo docker compose --env-file .env -f compose.yml stop api
sudo docker volume rm tongpin-staging_api_node_modules
sudo docker compose --env-file .env -f compose.yml up -d api
```

The worker container installs runtime dependencies into the `worker_node_modules` Docker volume. If worker dependencies change and the volume becomes stale, recreate only the worker volume:

```bash
cd /opt/tongpin
sudo docker compose --env-file .env -f compose.yml stop worker
sudo docker volume rm tongpin-staging_worker_node_modules
sudo docker compose --env-file .env -f compose.yml up -d worker
```

Self-host database migrations live in `/opt/tongpin/runtime/db/migrations`. Apply them on the server after syncing a staging package:

```bash
cd /opt/tongpin
sh scripts/apply-db-migrations.sh
```

The script records applied files in `public.self_host_schema_migrations`, automatically uses `sudo docker compose` when the current user cannot access the Docker socket, and should be run before treating an API release as verified.

Staging Auth smoke:

```bash
API_BASE_URL=https://api-staging.fancah.tech npm run smoke:auth -w @tongpin/server
```

This creates disposable `example.test` accounts and verifies email verification token consumption, refresh-token reuse revocation, password reset, and password-reset session revocation. It does not verify production email delivery.

Staging Storage smoke:

```bash
API_BASE_URL=https://api-staging.fancah.tech npm run smoke:storage -w @tongpin/server
```

This creates disposable users/couple/media, uploads a tiny PNG through a signed URL, confirms active-couple access, and deletes the object/DB record.

Supabase old data migration dry-run and apply:

```bash
cd /opt/tongpin
bash scripts/run-supabase-migration.sh
bash scripts/run-supabase-migration.sh --apply
```

Before running this, put the real legacy source values only in the server-local `/opt/tongpin/.env`: `SUPABASE_DB_URL`, `SUPABASE_STORAGE_S3_ENDPOINT`, `SUPABASE_STORAGE_S3_REGION`, `SUPABASE_STORAGE_S3_ACCESS_KEY_ID`, and `SUPABASE_STORAGE_S3_SECRET_ACCESS_KEY`. Do not pass these secrets on the command line or write them into chat, docs, git, or frontend env files.

The default command is read-only and only runs preflight plus dry-run. `--apply` runs preflight, dry-run, backup, DB import, Storage copy, final verify, then API smoke tests for auth/profile/storage/messages/dashboard/notifications/privacy. Do not use `--skip-smoke` unless that same API build was just smoke-tested and the passing log is retained for cutover evidence.

Staging notification SSE smoke:

```bash
API_BASE_URL=https://api-staging.fancah.tech npm run smoke:notifications -w @tongpin/server
```

This creates disposable users/couple/message data, keeps an authenticated SSE connection open, writes a partner notification through a separate socket, verifies a `notification` SSE event, and confirms the notification body remains low-sensitive.

Staging monitor:

```bash
cd /opt/tongpin
bash scripts/monitor-staging.sh
```

The monitor is read-only. It checks Docker service state and health, local API/Postgres/Redis, public API deep health with `requestId`, public Web auth routes, disk usage, and freshness of Postgres dump plus restorable MinIO archive backups. Defaults can be overridden with `MONITOR_DISK_WARN_PERCENT` and `MONITOR_BACKUP_MAX_AGE_HOURS`. A non-zero exit means the staging stack needs attention before a release is treated as verified.

Staging backups:

```bash
cd /opt/tongpin
bash scripts/backup-all.sh
sudo bash scripts/install-backup-cron.sh
```

`backup-all.sh` creates a PostgreSQL dump, a restorable MinIO `/data` archive, and a MinIO object inventory. The cron installer writes `/etc/cron.d/tongpin-staging-backup`, logs to `/opt/tongpin/logs/backup-staging.log`, and defaults to `17 3 * * *`; override with `BACKUP_CRON_SCHEDULE` in the server-only `.env`.

Staging restore verification:

```bash
cd /opt/tongpin
bash scripts/verify-backups-restore.sh
sudo bash scripts/install-restore-verify-cron.sh
```

The restore verifier checks the latest fresh PostgreSQL dump with `gzip -t`, restores it into a temporary database, verifies required schemas/tables, drops the temporary database, then validates the latest MinIO archive with `tar -tzf` and bucket metadata checks. The cron installer writes `/etc/cron.d/tongpin-staging-restore-verify`, logs to `/opt/tongpin/logs/restore-verify-staging.log`, and defaults to `17 4 * * 0`; override with `RESTORE_VERIFY_CRON_SCHEDULE` in the server-only `.env`.

Optional alerting and cron:

```bash
cd /opt/tongpin
# Optional, server-only .env value. Do not commit or paste real webhook URLs.
# MONITOR_WEBHOOK_URL=https://example.invalid/webhook
sudo bash scripts/install-monitor-cron.sh
```

The cron installer writes `/etc/cron.d/tongpin-staging-monitor` and logs to `/opt/tongpin/logs/monitor-staging.log`. The default schedule is every 5 minutes and can be overridden with `MONITOR_CRON_SCHEDULE`. When `MONITOR_WEBHOOK_URL` is set, failed checks post a compact JSON payload with status, summary, and failed/warn lines. Set `MONITOR_ALERT_ON_SUCCESS=true` only for testing noisy success notifications.

Before replacing the remote API runtime, create a timestamped backup:

```bash
cd /opt/tongpin
backup_dir="/opt/tongpin/backups/api-staging-$(date +%Y%m%d%H%M%S)"
mkdir -p "$backup_dir"
cp -a compose.yml README.md RUNBOOK.md "$backup_dir"/
if [ -d runtime/api ]; then mkdir -p "$backup_dir/runtime"; cp -a runtime/api "$backup_dir/runtime/"; fi
```

## Stop Staging

```bash
cd /opt/tongpin
sudo docker compose --env-file .env -f compose.yml down
```

Do not remove volumes unless staging data is explicitly disposable:

```bash
sudo docker compose --env-file .env -f compose.yml down -v
```

## Public HTTPS

Public HTTPS is configured on the server through Caddy automatic HTTPS.

1. DNS records:
   - `tongpin.fancah.tech` -> `81.71.9.118`
   - `api-staging.fancah.tech` -> `81.71.9.118`
   - `assets-staging.fancah.tech` -> `81.71.9.118`
2. Tencent Cloud firewall rule:
   - `443/tcp`
3. Keep database, Redis, and MinIO console internal.

Public checks:

```bash
curl -I https://tongpin.fancah.tech
curl -i -H 'Host: api-staging.fancah.tech' http://81.71.9.118/health
curl -fsS https://api-staging.fancah.tech/health
curl -I https://assets-staging.fancah.tech
```

If public requests return DNSPod webblock or TLS EOF while server-local HTTPS succeeds, re-check DNSPod records, ICP binding, Tencent Cloud firewall, and Caddy certificate logs before considering a Cloudflare Tunnel / overseas ingress.

## Domain Cutover Finish

The current user-facing self-hosted Web domain is `https://tongpin.fancah.tech`.

Required checks before treating the new domain as a seamless cutover:

1. Confirm the self-hosted app opens:

   ```bash
   curl -I https://tongpin.fancah.tech
   curl -fsS https://tongpin.fancah.tech | rg -o '<title>[^<]*</title>'
   ```

   Expected: HTTP `200` and `<title>同频跳动</title>`.

2. Publish the Vercel redirect config only as a fallback for Vercel-generated entry points, preserving paths and permanently redirecting to `tongpin.fancah.tech`:

   ```bash
   npx vercel --prod -y
   ```

   Then verify:

   ```bash
   curl -I https://tongpin-heartbeat.vercel.app
   ```

   Expected: HTTP `308` or equivalent permanent redirect with `Location: https://tongpin.fancah.tech/...`. Do not use or re-bind the old custom domain `https://app.fanch.tech`.

3. Confirm the self-hosted frontend was built with:

   ```bash
   EXPO_PUBLIC_SELF_HOST_API_URL=https://api-staging.fancah.tech npm run build:web
   ```

4. Password reset and email verification links should be sent from self-host Auth using `AUTH_EMAIL_VERIFY_URL_BASE` and `AUTH_PASSWORD_RESET_URL_BASE`, both pointing at `https://tongpin.fancah.tech/auth/...`.

5. Before any production cutover, run the Supabase-to-self-host migration dry-run, apply, and verify steps from `docs/self-host-cutover-rollback.md`; do not cut traffic unless the report is `status=ok` and Storage objects have been copied into MinIO.

6. Existing Web Push subscriptions are origin-scoped. Users who installed the old PWA should open `https://tongpin.fancah.tech`, re-enable notifications if prompted, and re-add the PWA from the new domain if they rely on home-screen launch.

## Optional Cloudflare Tunnel

Use this only after creating a tunnel in Cloudflare Zero Trust and putting the token in the server-only `/opt/tongpin/.env` as `CLOUDFLARE_TUNNEL_TOKEN`.

Start the tunnel connector:

```bash
cd /opt/tongpin
sudo docker compose --env-file .env -f compose.yml --profile tunnel up -d cloudflared
sudo docker compose --env-file .env -f compose.yml --profile tunnel logs --tail=80 cloudflared
```

Recommended Cloudflare Tunnel public hostname services:

- `api-staging.fancah.tech` -> `http://api:3000`
- `assets-staging.fancah.tech` -> `http://minio:9000`

Stop the tunnel connector without stopping the rest of staging:

```bash
cd /opt/tongpin
sudo docker compose --env-file .env -f compose.yml --profile tunnel stop cloudflared
```
