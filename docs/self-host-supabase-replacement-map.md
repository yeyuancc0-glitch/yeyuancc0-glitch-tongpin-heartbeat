# 自建后端替换 Supabase 依赖地图

此文档记录当前代码里真实存在的 Supabase 依赖面，用于后续把自建 staging 从健康检查空壳推进到可替换 Supabase 的后端。它不是生产切换计划。

## 当前状态

- 生产仍走 Vercel + Supabase。
- 自建 staging 已跑通 Caddy、API、Worker、PostgreSQL、Redis、MinIO。
- `api-staging.fanch.tech` 和 `assets-staging.fanch.tech` 已指向 `81.71.9.118`。
- Caddy 已为 `api-staging.fanch.tech` 获取 Let's Encrypt 证书，服务器内部 HTTPS `/health` 返回 HTTP/2 `200` 和 `status: ok`。
- 腾讯云公网入口当前会拦截未备案 staging 域名；HTTP 返回 DNSPod webblock，HTTPS SNI 表现为 TLS EOF。后续需要 ICP 备案或 Cloudflare Tunnel / 境外入口，才能稳定公网访问 staging 域名。

## 必须替换的 Supabase 能力

| Supabase 能力 | 当前代码边界 | 自建替代边界 |
|---|---|---|
| Auth / Session | `apps/app/features/auth/AuthProvider.tsx`, `apps/app/features/auth/AuthScreen.tsx`, `apps/app/lib/supabase/client.ts` | `POST /auth/signup`, `POST /auth/signin`, `POST /auth/refresh`, `POST /auth/signout`, `POST /auth/password/reset`, `PATCH /auth/password` |
| Data API / 表直连 | `apps/app/features/**`, `apps/app/lib/notifications/**` 直接 `.from(...)` | 业务 API 按 feature 暴露端点；前端不再直接连数据库 |
| RPC | 前端和 Edge Functions 调用 `.rpc(...)` | RPC 逐个迁移为服务端事务方法，保留数据库约束和事务语义 |
| Storage | `apps/app/lib/supabase/storage.ts`、头像/相册上传删除 | MinIO + API 签名上传、下载、缩略图生成和删除 |
| Realtime | `usePetRealtime.ts`, `petRealtime.ts`, `useCoupleData.ts` channel | WebSocket / SSE 事件层，按 `couple_id` 和 `user_id` 鉴权 |
| Edge Functions | `supabase/functions/pet-ai-brain`, `supabase/functions/send-push-notifications` | Node API / Worker 进程 |
| Cron / Queue | `pg_cron`, `push_deliveries`, push delivery RPC | Redis 队列 + Worker 定时任务 |

## 直连表清单

代码中直接 `.from(...)` 访问的表包括：

- `profiles`
- `checkins`
- `media_files`
- `couple_footprints`
- `push_tokens`
- `messages`
- `couples`
- `calendar_events`
- `notifications`
- `mood_status`
- `couple_members`
- `reports`
- `pet_memories`
- `pet_ai_generations`
- `pair_invites`
- `notification_preferences`
- `creation_actions`

迁移原则：前端不应继续拼 Supabase 查询；每个 feature 建一个服务端 API 或 BFF 方法，服务端从会话解析 `user_id`，再执行 Postgres 查询和权限判断。

## RPC 清单

前端或 Edge Function 当前调用的 RPC 包括：

- 关系与资料：`create_pair_invite`, `accept_pair_invite`, `update_active_couple_dates`, `end_active_couple`, `block_partner_and_end_couple`, `request_account_deletion`, `submit_feedback`
- 通知与推送：`create_partner_notification`, `mark_notification_read`, `dismiss_notification`, `register_push_token`, `register_web_push_subscription`, `disable_current_push_token`, `current_user_notification_preferences`, `claim_push_deliveries`, `mark_push_delivery_result`, `requeue_stale_push_deliveries`
- 信件：`create_future_letter`, `list_letters`, `dismiss_letter`, `mark_letter_read`, `delete_letter`
- 家园/云宠：`ensure_creation_space`, `choose_creation_pet`, `feed_creation_pet`, `interact_creation_pet`, `settle_creation_pet_sleep`, `start_creation_pet_sleep`, `refresh_creation_pet_sleep`, `settle_creation_pet_night_sleep`, `buy_creation_food`, `claim_creation_game_reward`, `claim_creation_footprint_reward`, `record_creation_action`, `toggle_pet_memory_core`, `archive_pet_memory`
- 云宠世界与 AI：`prepare_pet_ai_context`, `apply_pet_world_decision`, `apply_pet_rule_world_decision`, `mark_pet_surface_seen`, `summon_creation_pet`
- 快捷互动：`send_quick_interaction`

迁移原则：邀请接受、情侣绑定、信件创建/删除、云宠能量恢复、推送领取和 AI 决策写入必须保持服务端事务，不允许在前端拆成多次表写入。

## Storage 替换

当前 Storage 入口集中在：

- `apps/app/lib/supabase/storage.ts`
- `apps/app/features/profile/ProfileScreen.tsx`
- `apps/app/features/home/useHomePhotoActions.ts`
- `apps/app/features/home/homeAvatarHydration.ts`
- `apps/app/features/home/homeMediaHydration.ts`
- `apps/app/features/media/PhotoAlbum.tsx`
- `apps/app/features/memory/MemoryPage.tsx`

自建 API 需要提供：

- 头像原图上传
- 头像缩略图上传
- 相册原图上传
- 相册缩略图上传
- 单个对象签名读取
- 批量对象签名读取
- 图片 transform 或缩略图回退
- 对象删除

数据库仍只保存 Storage path，不保存 signed URL。

## Realtime 替换

当前 Realtime 入口：

- `apps/app/features/pet/hooks/usePetRealtime.ts`
- `apps/app/features/pet/services/petRealtime.ts`
- `apps/app/features/home/useCoupleData.ts`

自建事件层至少需要：

- `notifications:{userId}:{coupleId}` 等价通知事件
- `pet-room:{coupleId}` 等价云宠 presence / broadcast 事件
- 连接鉴权：JWT session -> user -> active couple member
- 断线重连和后台降级，不影响核心读写

## Edge Function / Worker 替换

现有 Edge Functions：

- `supabase/functions/pet-ai-brain/index.ts`
- `supabase/functions/send-push-notifications/index.ts`

自建 Worker 需要承担：

- 推送队列领取、发送、失败重试、过期重排
- Web Push / Expo Push 分发
- 云宠 AI 上下文准备、低敏摘要、世界决策写入
- service-role 级别动作必须只允许 Worker 内部调用

## 数据库迁移注意

- `packages/db/migrations` 当前包含 schema、RLS、RPC、Storage policy、Realtime publication、pg_cron。
- 自建 Postgres 可以复用大部分 schema 和函数，但不能依赖 `auth.uid()`、`auth.role()`、`storage.objects`、`supabase_realtime`、Supabase Data API。
- 第一阶段建议保留数据库函数用于事务和约束，但把身份参数从 `auth.uid()` 迁移为显式 `current_user_id` 或通过服务端 `SET LOCAL app.current_user_id` 注入。
- RLS 可以继续作为防线，但主要权限边界应在 API 层验证 active couple member。

## 推荐迁移顺序

优化路线见 `docs/self-host-optimized-roadmap.md`。替换 Supabase 依赖时按以下顺序推进：

1. 先做 API / BFF 边界，不让前端继续新增 Supabase 直连查询。
2. 抽象前端 Supabase 访问层：先不改 UI，只把 Auth、Data、Storage、Realtime 调用收口。
3. 实现自建 Auth 和 session，跑通测试账号登录。
4. 迁移资料、情侣绑定、首页 dashboard 只读接口。
5. 迁移留言、通知、信件、今日胶囊等核心写入 RPC。
6. 迁移头像和相册 Storage 到 MinIO。
7. 迁移 Realtime 通知和云宠事件。
8. 迁移 Push worker 和 pet-ai-brain worker。
9. 做数据迁移演练和回滚演练。
10. 另行确认后才切生产。
