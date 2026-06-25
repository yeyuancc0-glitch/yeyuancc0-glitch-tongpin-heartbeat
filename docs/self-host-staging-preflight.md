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
- DNSPod 已添加 A 记录：`tongpin.fancah.tech`、`api-staging.fancah.tech` 和 `assets-staging.fancah.tech` 均指向 `81.71.9.118`
- `fancah.tech` 已完成 ICP 备案；Caddy 已为 `tongpin.fancah.tech`、`api-staging.fancah.tech` 和 `assets-staging.fancah.tech` 获取 Let's Encrypt 证书
- 公网 HTTPS 已验证：`https://tongpin.fancah.tech` 返回前端 HTML，`https://api-staging.fancah.tech/health` 返回 HTTP/2 `200` 和 `status: ok`
- 备份演练已通过：PostgreSQL 可生成 gzip dump，MinIO 可生成对象清单；staging 数据为空时 MinIO 清单很小属于正常现象
- 临时 `codex-tongpin-staging` SSH 公钥标记已清理，上传临时包已清理
- 本地准备了 Docker mirror 配置脚本和回滚脚本
- 本地准备了运行手册：`infra/self-host/staging/RUNBOOK.md`

## 当前不执行 / 门禁

- 不关闭 Supabase；旧用户数据完成迁移、对账和观察期前，Supabase 必须保留为旧数据来源和回滚参照。
- 不在缺少 Supabase 源库 URL 与 Storage S3 凭据时执行 `bash scripts/run-supabase-migration.sh --apply`。
- 不跳过旧数据迁移 final verify 和迁移后 smoke；除非同一 API 构建刚跑过等价 smoke 并保留日志。
- 不做会造成 self-host 与 Supabase 双写冲突的切流；同一个 couple 必须只有一个权威写入源。

## 下次执行前需要确认

- Supabase 源库连接串已经安全写入服务器 `.env` 或容器环境。
- Supabase Storage S3 endpoint、region、access key 和 secret 已安全写入服务器 `.env` 或容器环境。
- 切流窗口、备份窗口和回滚窗口已确认。

## 下次执行的最小安全顺序

1. 确认 `/opt/tongpin` staging 容器和公网 health 仍正常。
2. 执行 `bash scripts/monitor-staging.sh`，确认 API、DB、Redis、MinIO、备份和公开路由全绿。
3. 执行 `bash scripts/run-supabase-migration.sh`，只跑 preflight + dry-run。
4. 审核迁移报告，无 error 后再执行 `bash scripts/run-supabase-migration.sh --apply`。
5. 确认 final verify、Storage 校验和迁移后 smoke 通过，再进入白名单/couple 级切流。

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
