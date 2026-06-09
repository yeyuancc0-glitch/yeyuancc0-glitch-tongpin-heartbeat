# 同频跳动

情侣双人正式版应用。当前以 Expo Web 线上版本为主，同时保留 Expo / React Native 代码复用到 iOS 和 Android 的路径；功能包括注册登录、情侣绑定、首页、今日胶囊、留言、记忆、信件、相册、站内通知、系统推送、家园、足迹、今日娱乐和 Live2D 云宠。

## 技术栈

- Expo + React Native + TypeScript
- Expo Router
- Supabase Auth / Postgres / RLS / RPC
- Expo Web 静态导出，不引入 Next.js

## 本地启动

```bash
npm install
cp apps/app/.env.example apps/app/.env
npm run web
```

`.env` 需要填入：

```bash
EXPO_PUBLIC_SUPABASE_URL=
EXPO_PUBLIC_SUPABASE_ANON_KEY=
```

检查环境变量：

```bash
npm run check:env
```

## 数据库初始化

在 Supabase SQL Editor 或 migration 流程中按文件名顺序执行 `packages/db/migrations/*.sql`。如果本机有 Supabase CLI 且已 link 项目，可以执行：

```bash
npm run db:apply
```

该脚本会按文件名顺序用 `supabase db query --linked --file <migration.sql>` 执行；没有 Supabase CLI 时会回退到 `psql` + `SUPABASE_DB_URL`。

这些 migration 会创建或补齐核心业务表、权限、RPC、Storage policy、推送队列和云宠状态：

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
- private Storage bucket：`profile-avatars`、`couple-media`
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

## 验证

```bash
npm run typecheck
npm run build:web
```

完整本地验证：

```bash
npm run verify
```

注意：`npm run verify` 会先执行 `check:env`。如果还没有 Supabase 项目和 `.env`，该步骤会失败，这是预期的联调阻断。

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
