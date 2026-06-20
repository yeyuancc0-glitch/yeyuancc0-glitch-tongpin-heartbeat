# 自建 Staging 准备清单

此清单用于自建服务器迁移的准备阶段。它不代表生产切换。

## 已准备

- 服务器目录规划：`/opt/tongpin`
- 本地 staging 模板：`infra/self-host/staging/`
- 远端基础环境：Ubuntu 22.04.5、Docker `29.1.3`、Compose `2.40.3`
- 远端 staging 模板已上传并同步到 `/opt/tongpin`
- 远端 `.env` 已在服务器本地生成，权限 `600`
- 远端 `docker compose --env-file .env -f compose.yml config` 已通过
- 腾讯云 Docker registry mirror 已配置，Docker 已重启并生效
- `/opt/tongpin` staging 容器已启动：Caddy、API、Worker、PostgreSQL、Redis、MinIO
- 本机健康检查已通过：
  - `http://127.0.0.1:3000/health` 返回 `status: ok`
  - PostgreSQL `pg_isready` 返回 accepting connections
  - Redis 返回 `PONG`
- 公网 `80/tcp` 已到 Caddy；直接访问 IP 时会返回 Caddy 的 HTTPS `308` 重定向
- 腾讯云轻量防火墙已添加 `HTTPS (443)` 规则：来源全部 IPv4、TCP、端口 `443`、允许
- Cloudflare DNS 已添加 staging A 记录：`api-staging.fanch.tech` 和 `assets-staging.fanch.tech` 均指向 `81.71.9.118`
- Caddy 已为 `api-staging.fanch.tech` 获取 Let's Encrypt 证书；服务器内部强制解析到 `127.0.0.1` 时，`https://api-staging.fanch.tech/health` 返回 HTTP/2 `200` 和 `status: ok`
- 腾讯云公网入口当前会拦截未备案 staging 域名：HTTP 返回 `dnspod.qcloud.com/static/webblock.html?d=api-staging.fanch.tech`，HTTPS SNI 表现为 TLS EOF；这需要 ICP 备案或改用 Cloudflare Tunnel / 境外入口解决
- 备份演练已通过：PostgreSQL 可生成 gzip dump，MinIO 可生成对象清单；staging 数据为空时 MinIO 清单很小属于正常现象
- 临时 `codex-tongpin-staging` SSH 公钥标记已清理，上传临时包已清理
- 本地准备了 Docker mirror 配置脚本和回滚脚本
- 本地准备了运行手册：`infra/self-host/staging/RUNBOOK.md`

## 当前不执行

- 不改 Vercel 生产环境变量
- 不改 `EXPO_PUBLIC_SUPABASE_URL`
- 不切换生产域名
- 不迁移真实用户数据
- 不关闭 Supabase
- 不启动生产后端

## 下次执行前需要确认

- 是否允许执行服务器重启自恢复验证
- 是否走 ICP 备案后继续公网直连，或改用 Cloudflare Tunnel 作为 staging 入口
- 是否允许开始实现真实自建 API，用 staging 后端逐步替换 Supabase Auth、RPC、Storage、Realtime、Edge Functions 和 Push worker

## 下次执行的最小安全顺序

1. 确认生产仍走 Supabase 和 Vercel。
2. 确认 `/opt/tongpin` staging 容器仍运行。
3. 如需验证自恢复，再重启服务器并复查容器状态。
4. 确认 staging 域名公网入口方案：ICP 备案直连或 Cloudflare Tunnel。
5. 开始实现真实自建 API 和迁移适配层。

## 回滚

停止 staging：

```bash
cd /opt/tongpin
sudo docker compose --env-file .env -f compose.yml down
```

回滚 Docker mirror：

```bash
cd /opt/tongpin
sudo bash scripts/rollback-docker-mirror.sh
```
