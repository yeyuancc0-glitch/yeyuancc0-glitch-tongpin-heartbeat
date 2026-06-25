# Supabase 使用清单

此文档是自建后端迁移的存量边界清单。当前运行时目标不是继续让前端直连 Supabase，而是把 Auth、Data API、RPC、Storage、Realtime、Edge Functions 和 Cron/Worker 能力收口到自建 API/BFF。旧 Supabase 用户数据必须通过迁移脚本导入 selfhost 并完成对账，不能因为清理依赖导致数据丢失。

## 使用规则

- 业务代码不得新增 `supabase.from()`、`supabase.rpc()`、`supabase.auth`、`supabase.storage`、`supabase.channel()`、`supabase.functions.invoke()` 或 `supabase.removeChannel()`。
- 当前存量由 `npm run check:supabase-usage` 以基线方式拦截新增；迁移掉一个文件后必须同步降低基线。
- 完全迁移验收使用 `npm run check:supabase-usage:strict`；严格模式通过后，App 业务代码不得再出现 Supabase 直连。
- 当前 App 运行时代码已经不依赖 `@supabase/supabase-js`；任何新增 feature 都必须走 self-host API，不允许恢复 Supabase 直连。
- 数据迁移验收使用 `npm run migrate:supabase:data`、`npm run migrate:supabase:data:apply`、`npm run migrate:supabase:data:verify`（均在 `@tongpin/server` workspace 下执行），并保留 `latest-report.json` 作为切流证据。

## 当前存量文件

| 文件 | 存量次数 | 迁移域 | 目标替代 |
|---|---:|---|---|
| App 业务代码 | 0 | Auth / Data / RPC / Storage / Realtime | 自建 API/BFF、SSE、MinIO 签名 URL |
| `supabase/functions/pet-ai-brain/index.ts` | 3 | Edge Function | Self-host worker |
| `supabase/functions/send-push-notifications/index.ts` | 7 | Push worker | Self-host worker |

`supabase/functions/*` 作为历史 Supabase Edge Function 源码保留，不参与当前 App 运行时。App 侧严格检查 `npm run check:supabase-usage:strict` 必须保持通过。

## Supabase 能力映射

| Supabase 能力 | 当前边界 | 自建替代 |
|---|---|---|
| Auth / Session | `AuthProvider`、`AuthScreen`、`supabase.auth` | API 内置 Auth、session 表、JWT + refresh token rotation |
| Data API | 前端 `.from(...)` | Feature API；服务端校验 user/couple/resource 权限 |
| RPC | 前端和 Edge Functions `.rpc(...)` | 服务端事务方法；必要时保留 Postgres function 但由 API 调用 |
| Storage | `supabase.storage` | MinIO/S3 + API 签名 URL + 元数据事务 |
| Realtime | channel / broadcast / postgres_changes | 第一版轮询/SSE；云宠后续 WebSocket |
| Edge Functions | `pet-ai-brain`、`send-push-notifications` | Node worker / internal API |
| Cron / Queue | `pg_cron`、push delivery RPC | Redis queue + worker repeatable jobs |

## 迁移顺序

1. Auth 和 `GET /api/me/dashboard` 先收口，保证登录恢复和首页空态可用。
2. Pairing、messages、checkins、letters、notifications 迁移为服务端事务接口。
3. Storage 迁移为 media/profile avatar API。
4. Push worker 和 pet-ai-brain 迁移到 self-host worker。
5. Realtime 先降级为轮询/SSE，云宠 WebSocket 单独验收。

## 验收

- 默认检查：`npm run check:supabase-usage` 通过，表示没有新增直连。
- 严格检查：`npm run check:supabase-usage:strict` 通过，表示 App 业务代码已清除 Supabase 直连。
- 数据检查：`npm run migrate:supabase:data:verify -w @tongpin/server` 通过，表示旧 Supabase 数据与 selfhost 目标库 count/hash 对账一致；Storage 对象必须按报告清单迁入 MinIO。
- 每迁移一个文件，必须更新本清单、降低脚本基线，并补对应 API 权限测试。
