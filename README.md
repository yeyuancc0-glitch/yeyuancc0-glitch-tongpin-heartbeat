# 同频跳动

情侣双人应用 V0.1B Web MVP。当前目标是先用 Expo Web 验证注册、情侣绑定、首页、打卡、留言、基础日历、头像、相册、信件、站内通知和基础合规闭环，后续复用 Expo / React Native 代码上架 iOS 和 Android。

## 技术栈

- Expo + React Native + TypeScript
- Expo Router
- Supabase Auth / Postgres / RLS / RPC
- V0.1A 使用 Expo Web 优先验证，不引入 Next.js

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

在 Supabase SQL Editor 或 migration 流程中按文件名顺序执行：

```text
packages/db/migrations/001_v01a_schema.sql
packages/db/migrations/002_v01a_table_grants.sql
packages/db/migrations/003_relationship_start_date_rpc.sql
packages/db/migrations/004_v01b_schema.sql
```

如果本机有 Supabase CLI 并已 link 项目，或本机有 `psql` 且设置了 `SUPABASE_DB_URL`，也可以执行：

```bash
npm run db:apply
```

这些 migration 会创建或补齐：

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

核心事务：

- `accept_pair_invite(invite_code text)`
- `end_active_couple()`
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

手工联调清单：

```text
docs/product/v01a-manual-test.md
```

V0.1B 验收标准：

```text
docs/product/v01b-acceptance.md
```

Supabase 设置说明：

```text
docs/product/v01a-supabase-setup.md
```

## V0.1B 范围

在核心闭环上加入头像、图片相册、即时/未来信件、站内通知、情绪状态增强、基础删除、举报、拉黑和账号注销申请。

不做原生推送、AI、支付、复杂审核后台、视频相册和账号物理删除自动化。
