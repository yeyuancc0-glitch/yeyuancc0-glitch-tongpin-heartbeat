# Tongpin Self-Hosted Staging Runbook

This runbook is for the first self-hosted staging stack on `/opt/tongpin`.

It must not be used for production cutover. Supabase and Vercel remain the production path until a separate cutover plan is approved.

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
- Public DNS/firewall: `api-staging.fanch.tech` and `assets-staging.fanch.tech` point to `81.71.9.118`; Tencent Cloud `443/tcp` is open
- TLS: Caddy has obtained a Let's Encrypt certificate for `api-staging.fanch.tech`; server-local HTTPS `/health` passes with HTTP/2 `200` and `status: ok`
- Public domain caveat: Tencent Cloud public ingress currently blocks the unfiled staging domain; HTTP returns DNSPod webblock and HTTPS SNI closes with TLS EOF
- Backup rehearsal: PostgreSQL dump and MinIO object-list generation passed; an empty staging MinIO directory can produce a very small object-list file
- Still pending: reboot recovery verification

## Before Any Server Change

1. Confirm production remains untouched:
   - Do not change Vercel environment variables.
   - Do not change `EXPO_PUBLIC_SUPABASE_URL`.
   - Do not change production DNS records.
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
```

Expected API health response:

```json
{"status":"ok"}
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

Public HTTPS is configured on the server, but public domain access is blocked by Tencent Cloud for the unfiled staging domain.

1. DNS records:
   - `api-staging.fanch.tech` -> `81.71.9.118`
   - `assets-staging.fanch.tech` -> `81.71.9.118`
2. Tencent Cloud firewall rule:
   - `443/tcp`
3. Keep database, Redis, and MinIO console internal.

Public checks:

```bash
curl -i -H 'Host: api-staging.fanch.tech' http://81.71.9.118/health
curl -fsS https://api-staging.fanch.tech/health
curl -I https://assets-staging.fanch.tech
```

If public requests return DNSPod webblock or TLS EOF while server-local HTTPS succeeds, the next step is ICP filing or a Cloudflare Tunnel / overseas ingress, not Caddy reconfiguration.

## Optional Cloudflare Tunnel

Use this only after creating a tunnel in Cloudflare Zero Trust and putting the token in the server-only `/opt/tongpin/.env` as `CLOUDFLARE_TUNNEL_TOKEN`.

Start the tunnel connector:

```bash
cd /opt/tongpin
sudo docker compose --env-file .env -f compose.yml --profile tunnel up -d cloudflared
sudo docker compose --env-file .env -f compose.yml --profile tunnel logs --tail=80 cloudflared
```

Recommended Cloudflare Tunnel public hostname services:

- `api-staging.fanch.tech` -> `http://api:3000`
- `assets-staging.fanch.tech` -> `http://minio:9000`

Stop the tunnel connector without stopping the rest of staging:

```bash
cd /opt/tongpin
sudo docker compose --env-file .env -f compose.yml --profile tunnel stop cloudflared
```
