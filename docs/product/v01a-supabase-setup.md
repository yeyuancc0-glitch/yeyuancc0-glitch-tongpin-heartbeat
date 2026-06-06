# Supabase 设置步骤

## 1. 创建项目

在 Supabase Dashboard 创建新项目，记录：

- Project URL
- anon public key

写入 `apps/app/.env`：

```bash
EXPO_PUBLIC_SUPABASE_URL=https://xxxxx.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=xxxxx
```

## 2. 执行 migration

推荐方式：打开 Supabase SQL Editor，执行：

```text
packages/db/migrations/001_v01a_schema.sql
```

如果本机有 Supabase CLI 并已 link 项目：

```bash
npm run db:apply
```

如果本机有 `psql`：

```bash
SUPABASE_DB_URL="postgresql://..." npm run db:apply
```

## 3. Auth 设置

V0.1A 使用邮箱 + 密码。

开发期可选：

- 关闭邮箱确认，便于快速双账号测试。
- 或保持邮箱确认开启，用真实邮箱完成验证。

上线前应重新确认邮件模板、跳转 URL 和域名配置。

## 4. 必查项

- `profiles` 表存在，并启用 RLS。
- `pair_invites` 表存在，并启用 RLS。
- `accept_pair_invite(invite_code text)` RPC 存在。
- `end_active_couple()` RPC 存在。
- 新注册用户会通过 trigger 自动创建 `profiles`。
