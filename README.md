# 同频跳动

情侣双人正式版应用。当前以 Expo Web 线上版本为主，同时保留 Expo / React Native 代码复用到 iOS 和 Android 的路径；功能包括注册登录、情侣绑定、首页、今日胶囊、留言、记忆、信件、相册、站内通知、系统推送、家园、足迹、今日娱乐和 Live2D 云宠。

## 技术栈

- Expo + React Native + TypeScript
- Expo Router
- 自建 API / Postgres / MinIO / Redis / Push worker
- Expo Web 静态导出，不引入 Next.js

## 本地启动

```bash
npm install
cp apps/app/.env.example apps/app/.env
npm run web
```

`.env` 需要填入：

```bash
EXPO_PUBLIC_SELF_HOST_API_URL=https://api-staging.fancah.tech
EXPO_PUBLIC_WEB_PUSH_VAPID_PUBLIC_KEY=
```

检查环境变量：

```bash
npm run check:env
```

## 自建数据库初始化

```bash
ssh -i ~/Desktop/codex.pem -o IdentitiesOnly=yes ubuntu@81.71.9.118
cd /opt/tongpin && sh scripts/apply-db-migrations.sh
```

这些 self-host migration 会创建或补齐核心业务表、权限、约束、MinIO 元数据、推送队列和云宠状态：

- `profiles`
- `pair_invites`
- `couples`
- `couple_members`
- `checkins`
- `messages`
- `calendar_events`
- `future_letters`、`media_files`
- `mood_status`
- `notifications`
- `reports`
- `blocks`
- `account_deletion_requests`
- MinIO bucket：`profile-avatars`、`couple-media`
- 推送表：`push_tokens`、`notification_preferences`、`push_deliveries`
- 共创/云宠表：`creation_spaces`、`creation_actions`、`pet_memories`、`pet_world_events`

核心事务：

- `create_pair_invite(invite_expires_at timestamptz)`
- `accept_pair_invite(invite_code text, relationship_started_at date)`
- `end_active_couple()`
- `create_future_letter(...)`
- `create_partner_notification(...)`
- `list_letters()`
- `mark_notification_read(notification_id uuid)`
- `dismiss_notification(notification_id uuid)`
- `block_partner_and_end_couple(reason text)`
- `request_account_deletion(reason text)`

## 旧数据迁移

旧 Supabase 用户数据不能丢。生产切流前必须执行 self-host 数据迁移 preflight、dry-run、导入、Storage 复制和 verify；Storage 对象会按原 bucket/path 从 Supabase Storage 复制到 MinIO：

```bash
cd /opt/tongpin && bash scripts/run-supabase-migration.sh
cd /opt/tongpin && bash scripts/run-supabase-migration.sh --apply
```

`--apply` 会按 preflight、dry-run、self-host 备份、DB 导入、Storage 复制、final verify、API 冒烟的顺序执行；任一步失败都不能切流。只有在同一 API 构建刚跑过等价冒烟时，才允许加 `--skip-smoke`，但仍必须保留最近通过的冒烟日志作为切流证据。

本地拆开执行时：

```bash
SUPABASE_DB_URL="postgresql://..." SELF_HOST_DB_URL="postgresql://..." npm run migrate:supabase:preflight -w @tongpin/server
SUPABASE_DB_URL="postgresql://..." SELF_HOST_DB_URL="postgresql://..." npm run migrate:supabase:data -w @tongpin/server
SUPABASE_DB_URL="postgresql://..." SELF_HOST_DB_URL="postgresql://..." npm run migrate:supabase:data:apply -w @tongpin/server
SUPABASE_DB_URL="postgresql://..." SELF_HOST_DB_URL="postgresql://..." npm run migrate:supabase:data:copy-storage -w @tongpin/server
SUPABASE_DB_URL="postgresql://..." SELF_HOST_DB_URL="postgresql://..." npm run migrate:supabase:data:verify -w @tongpin/server
```

Storage 复制还需要 Supabase Storage S3 access key、secret、region 和 endpoint，例如
`SUPABASE_STORAGE_S3_ENDPOINT=https://<project-ref>.storage.supabase.co/storage/v1/s3`。这些值只放本机 shell 或服务器 `.env`，不要提交。

## 验证

```bash
npm run typecheck
npm run build:web
```

完整本地验证：

```bash
npm run verify
```

注意：`npm run verify` 会先执行 `check:env`。当前 Web 运行时只要求 `EXPO_PUBLIC_SELF_HOST_API_URL`，可用 shell 环境变量覆盖本地 `.env`。
`apps/app/.env` 和部署环境中不能再保留 `EXPO_PUBLIC_SUPABASE_URL` 或 `EXPO_PUBLIC_SUPABASE_ANON_KEY`；`npm run check:env` 会把这些 public Supabase 变量当作错误。

RLS 验收清单：

```text
packages/db/tests/rls_acceptance.sql
```

正式版浏览器验收：

- 启动 Web 或静态预览后打开本地地址。
- 检查首页内容、底部导航、相册预览、信件入口、记忆页、家园入口和控制台 error/warn。
- 权限、RPC、Storage policy 或删除语义变更后，再执行 RLS 验收 SQL。

## 正式版范围

当前仓库包含核心双人空间、头像、图片相册、即时/未来信件、站内通知、系统推送、反馈、举报、拉黑、账号注销申请、家园、足迹、今日娱乐和 Live2D 云宠体验。

不做支付、复杂审核后台、视频相册和账号物理删除自动化。系统推送和云宠 AI 已作为例外接入，需要 Supabase Edge Function secrets 才能完整联调。
