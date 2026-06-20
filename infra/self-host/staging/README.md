# Tongpin Self-Hosted Staging

This directory is the auditable blueprint for the first self-hosted staging server. It is designed for `/opt/tongpin` on the Tencent Cloud Lighthouse instance.

It does not contain real secrets. Copy `.env.example` to `.env` on the server and replace every `change-me-*` value there.

## Scope

Milestone A only:

- Caddy reverse proxy
- placeholder API with `/health`
- placeholder worker process
- PostgreSQL
- Redis
- MinIO
- backup and healthcheck scripts
- Docker mirror setup and rollback scripts

Not included:

- production cutover
- Supabase shutdown
- real user data migration
- Keycloak
- public PostgreSQL, Redis, or MinIO Console exposure
- enabled Cloudflare Tunnel; the Compose service exists behind the optional `tunnel` profile only

## Server Facts

Confirmed target instance:

- Provider: Tencent Cloud Lighthouse
- Instance: `Ubuntu-2fho`
- Region: `ap-guangzhou`, Guangzhou zone 3
- Public IPv4: `81.71.9.118`
- OS: Ubuntu 22.04.5 LTS
- Spec: 4 vCPU / 4 GB RAM / 40 GB SSD / 3 Mbps

Current state:

- Docker is installed on the target server: Docker `29.1.3`, Compose `2.40.3`.
- This staging directory has been uploaded to `/opt/tongpin`; server-side `docker compose --env-file .env -f compose.yml config` passes.
- Tencent Cloud Docker registry mirror is configured: `https://mirror.ccs.tencentyun.com`.
- The staging stack is running on `/opt/tongpin`; API `/health`, PostgreSQL, and Redis local checks pass.
- Public `80/tcp` reaches Caddy for direct IP requests and returns Caddy's HTTPS redirect.
- Cloudflare DNS points `api-staging.fanch.tech` and `assets-staging.fanch.tech` to `81.71.9.118`.
- Tencent Cloud firewall allows `22/tcp`, `80/tcp`, `443/tcp`, and ICMP.
- Caddy has obtained a Let's Encrypt certificate for `api-staging.fanch.tech`; server-local HTTPS for `/health` returns HTTP/2 `200` and `status: ok`.
- Tencent Cloud's public ingress currently blocks the unfiled staging domain: HTTP returns DNSPod webblock and HTTPS SNI closes with TLS EOF. Resolve this with ICP filing or a tunnel/overseas ingress before relying on public domain checks.
- Host `ufw` is inactive.
- Backup/snapshot policy still needs confirmation.

## First Deploy

On the server:

```bash
sudo mkdir -p /opt/tongpin
sudo chown -R ubuntu:ubuntu /opt/tongpin
cd /opt/tongpin
```

Copy this directory's files into `/opt/tongpin`, then:

```bash
cp .env.example .env
chmod 600 .env
```

Edit `.env` on the server. Generate values with commands like:

```bash
openssl rand -base64 32
openssl rand -hex 32
```

Docker is already installed on the target server. On a fresh replacement server, install Docker using:

```bash
sudo bash scripts/install-docker-ubuntu.sh
```

Start staging:

```bash
sudo docker compose --env-file .env -f compose.yml up -d
```

If Docker Hub pulls time out on a fresh replacement server, configure a Docker registry mirror first, then retry. This is a host-level daemon change and restarts Docker, so treat it as an explicit operations step:

```bash
sudo bash scripts/configure-docker-mirror-tencent.sh
```

Rollback:

```bash
sudo bash scripts/rollback-docker-mirror.sh
```

For the full sequence, use `RUNBOOK.md`.

Run the local healthcheck:

```bash
bash scripts/healthcheck.sh
```

Public HTTPS uses these DNS records:

- `api-staging.fanch.tech` -> `81.71.9.118`
- `assets-staging.fanch.tech` -> `81.71.9.118`

Tencent Cloud Lighthouse firewall includes `443/tcp`.

If Tencent Cloud blocks the unfiled staging domain, use the optional Cloudflare Tunnel profile after creating a tunnel token in Cloudflare Zero Trust:

```bash
cd /opt/tongpin
# Put the real token in the server-only .env, never in git or chat.
sudo docker compose --env-file .env -f compose.yml --profile tunnel up -d cloudflared
```

Configure public hostnames in Cloudflare Tunnel to point at the internal Docker services, for example `api-staging.fanch.tech -> http://api:3000` and `assets-staging.fanch.tech -> http://minio:9000`.

## Verification

Local server checks:

```bash
sudo docker compose --env-file .env -f compose.yml ps
curl -fsS http://127.0.0.1:3000/health
bash scripts/healthcheck.sh
bash scripts/backup-postgres.sh
bash scripts/backup-minio-list.sh
```

Public checks:

```bash
curl --noproxy '*' -i http://81.71.9.118/health
curl -I https://assets-staging.fanch.tech
```

Expected server-local result for `/health` is a JSON object whose `status` is `ok`. Public staging domain requests can be blocked by Tencent Cloud until ICP filing or a tunnel/overseas ingress is in place.

## Rollback

This staging stack does not touch production Supabase or Vercel. To stop it:

```bash
docker compose --env-file .env -f compose.yml down
```

To remove generated volumes, only after confirming no useful staging data is needed:

```bash
docker compose --env-file .env -f compose.yml down -v
```
