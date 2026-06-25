# 自建后端优化路线

此文档是当前自建服务器工作的执行路线。它不替代完整迁移方案；完整背景见 `docs/self-host-migration-plan.md`，Supabase 依赖面见 `docs/self-host-supabase-replacement-map.md`。

Stage 2 开始真实 API/BFF 前，必须先满足以下迁移门槛：

- `docs/supabase-usage-inventory.md`：当前 Supabase 直连清单和替代 API 映射。
- `docs/self-host-authorization-map.md`：迁出 RLS / Storage policy / Realtime policy 后的显式权限矩阵。
- `docs/self-host-data-constraints.md`：数据库唯一约束、外键、事务锁和 Storage 一致性规则。
- `docs/self-host-cutover-rollback.md`：灰度、白名单、回滚和数据补偿规则。
- `docs/self-host-security-ops.md`：Auth、备份、监控、日志脱敏和隐私删除规则。
- `npm run check:supabase-usage`：禁止新增业务代码直连 Supabase；迁移完成阶段再跑 `npm run check:supabase-usage:strict`。

## 当前结论

当前最优方案不是把新服务器一次性变成完整生产后端，而是把它作为旁路 staging 后端逐步建设；当前用户入口域名统一使用 `https://tongpin.fancah.tech`，不再使用旧自定义域名 `https://app.fanch.tech`。

1. 生产继续走 Vercel + Supabase。
2. 自建服务器先跑稳定的 staging 基建。
3. 后端通过 API / BFF 逐步接管 Supabase 能力。
4. 前端先增加适配层和 staging 环境，不直接把生产环境变量切到新服务器。
5. 每个业务域验证通过后，再单独确认是否进入生产切换。

## 推荐架构

```mermaid
flowchart LR
  App["Expo Web / iOS / Android"] --> BFF["自建 API / BFF"]
  BFF --> PG[("PostgreSQL")]
  BFF --> Storage[("MinIO / S3")]
  BFF --> Redis[("Redis")]
  Worker["Worker / Cron"] --> PG
  Worker --> Redis
  Worker --> Push["Push / AI / Jobs"]
  Tunnel["Cloudflare Tunnel or Filed Domain"] --> BFF
```

第一阶段不引入 Keycloak。当前项目优先需要邮箱密码登录、session、重置密码、账号状态和业务鉴权；用 API 内置 Auth 更轻。后续如果需要 SSO、第三方登录或后台管理账号，再引入 Keycloak。

## 入口方案

`fancah.tech` 已完成 ICP 备案，当前公网入口直接使用 DNSPod + 腾讯云轻量服务器 + Caddy：

- `tongpin.fancah.tech`、`api-staging.fancah.tech`、`assets-staging.fancah.tech` 均指向 `81.71.9.118`。
- Caddy 已为三个域名获取 Let's Encrypt 证书。
- `tongpin.fancah.tech` 返回前端 HTML，`api-staging.fancah.tech/health` 返回 `status: ok`。

因此推荐顺序是：

1. Staging 先走 DNSPod + Caddy 直连。
2. `fancah.tech` 已完成 ICP 备案，生产/测试域名可长期直连腾讯云公网 IP。
3. 境外入口或 COS / S3 可作为后续扩展，不作为当前第一步。

Cloudflare Tunnel 只需要服务器主动连出，不需要把 PostgreSQL、Redis 或 MinIO 端口暴露公网。推荐 public hostname：

- `api-staging.fancah.tech` -> `http://api:3000`
- `assets-staging.fancah.tech` -> `http://minio:9000`

## 分阶段执行

### Stage 1: 稳定基建

目标：让空服务器成为可重复部署、可恢复、可验证的 staging 环境。

已完成：

- Docker / Compose 安装。
- 腾讯云 Docker registry mirror 配置。
- `/opt/tongpin` staging 栈启动。
- API `/health`、PostgreSQL、Redis 本机健康检查通过。
- Caddy 服务器内部 HTTPS 验证通过。
- PostgreSQL dump 和 MinIO 对象清单备份演练通过。

剩余：

- 绑定 SSH key 后收紧 `22/tcp` 来源。
- 执行服务器重启自恢复验证。
- 建立外部快照或定期备份策略。

### Stage 2: 自建 API 骨架

目标：先建立一个可以替换 Supabase 调用的 API 边界，而不是直接让前端继续直连数据库。

前置条件：

- 五个迁移门槛文档已存在，并覆盖权限、约束、切流、运维和 Supabase 使用清单。
- `npm run check:supabase-usage` 通过；新增代码不得增加直连 Supabase 使用。
- API 设计能在 `self-host-authorization-map.md` 和 `self-host-data-constraints.md` 中找到对应权限和约束。

优先实现：

- `GET /health`
- `GET /api/health`
- `POST /api/auth/signup`
- `POST /api/auth/signin`
- `POST /api/auth/refresh`
- `POST /api/auth/signout`
- `GET /api/me`
- `GET /api/me/dashboard`

验收：

- 测试账号可登录。
- session refresh 可用。
- API 从 session 解析 `user_id`。
- 前端仍可保留 Supabase 生产路径。
- 每个请求都有 `request_id`，日志不输出正文、token、cookie 或 signed URL。

当前状态：已完成并部署到 staging。`apps/server` 已提供 request id、健康检查、Auth、session refresh、`/api/me` 和按 self-host 环境变量启用的前端旁路；生产默认路径仍保留 Supabase。

### Stage 3: 核心业务替换

目标：迁移最影响用户体验的核心链路。

推荐顺序：

1. 资料与情侣绑定：profiles、pair_invites、couples、couple_members。
2. 首页 dashboard 只读聚合。
3. 留言发送和通知创建。
4. 信件 / 胶囊信。
5. 今日胶囊。
6. 相册和头像 Storage。

原则：

- 邀请接受、情侣绑定、信件创建/删除、通知创建必须是服务端事务。
- 前端不再拼 `.from(...)` 和 `.rpc(...)`。
- 数据库可以继续保留函数做事务，但调用入口应在 API 层。

当前状态：staging 已完成资料、情侣绑定、首页 `/api/me/dashboard` 聚合、相册、头像 Storage、留言、快捷互动、今日胶囊、心情状态、信件、站内通知、日历事件、足迹、隐私/反馈/举报、解除关系、拉黑并解除关系和注销请求的初步 API 与前端 self-host 分流。家园/云宠仍需继续迁移。

### Stage 4: 后台能力替换

目标：替换 Supabase Edge Functions、Realtime、Cron 和 Push worker。

内容：

- WebSocket / SSE 事件层。
- Redis 队列。
- 推送分发 worker。
- 云宠 AI worker。
- 低敏上下文和 service-role 级别内部接口。

当前状态：staging 已完成推送偏好、Expo/Web Push token 登记/禁用、`push_deliveries` 队列候选入库，以及自建 Push worker 的 claim、stale requeue、发送尝试、失败重试、无效 token 禁用和结果回写。Web Push 真正发送仍依赖服务器 `.env` 配置 VAPID 私钥；Realtime/SSE/WS 和云宠 AI worker 仍未完成。

### Stage 5: 数据迁移演练

目标：先迁移测试数据，再决定是否迁生产数据。

要求：

- 保持用户 UUID，减少外键重写。
- 密码不直接迁移，旧用户通过重置密码进入新 Auth。
- Storage 只迁 path 和对象，不迁 signed URL。
- 每次演练都有回滚路径。

### Stage 6: 生产切换

生产切换必须单独确认，不和 staging 建设混在一起。

切换前必须满足：

- 自建 API 全量核心路径通过测试。
- 真实数据迁移演练通过。
- 备份、恢复、重启自恢复验证通过。
- 监控和日志可查。
- 前端有可回滚环境变量。
- Supabase 保持只读观察期，不立即关闭。

## 当前下一步

推荐我继续做这几件事：

1. 运行并维护 `npm run check:supabase-usage`，阻止新增 Supabase 直连。
2. 继续迁移家园/云宠 API，并补齐账号注销后的异步物理删除、备份残留处理和管理员审核后台。
3. 配置并演练真实 Web Push VAPID 私钥 / Expo token 投递，确认 worker 的真实发送成功路径和无效 token 回收。
4. 执行服务器重启自恢复验证，并确认快照或外部备份策略。
5. 准备数据导入和切流演练，但生产切换必须单独确认。

已完成的运维收尾：

- OrcaTerm 已进入托管会话。
- `/opt/tongpin` 容器状态已复查，API / PostgreSQL / Redis 为 healthy。
- 服务器上的 MinIO 备份脚本已改为不依赖容器内 `find`。
- 备份演练留下的 0 字节文件已清理。

不建议现在做：

- 不切生产域名。
- 不改 Vercel 生产环境变量。
- 不关闭 Supabase。
- 不把 PostgreSQL、Redis、MinIO Console 暴露公网。
- 不把任何 secret 写进仓库或聊天。
