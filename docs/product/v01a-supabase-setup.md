# Supabase 设置步骤（历史归档）

> 当前项目运行时已经迁到自建 API / Postgres / MinIO，不能再按本文配置 `EXPO_PUBLIC_SUPABASE_*` 或把 `npm run db:apply` 当作 Supabase 初始化命令。本文只保留早期 V0.1A 的历史背景；当前初始化请看根目录 `README.md` 的自建数据库初始化与旧数据迁移章节。

## 1. 创建项目

早期版本曾要求在 Supabase Dashboard 创建新项目，记录：

- Project URL
- anon public key

当时写入 `apps/app/.env`：

```bash
EXPO_PUBLIC_SUPABASE_URL=https://xxxxx.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=xxxxx
```

## 2. 执行 migration

早期推荐方式：打开 Supabase SQL Editor，执行：

```text
packages/db/migrations/001_v01a_schema.sql
```

这些命令现在不再用于当前运行时。当前 `npm run db:apply` 会连接自建服务器执行 `/opt/tongpin/scripts/apply-db-migrations.sh`。

早期如果本机有 Supabase CLI 并已 link 项目，曾使用：

```bash
npm run db:apply
```

早期如果本机有 `psql`，曾使用：

```bash
SUPABASE_DB_URL="postgresql://..." npm run db:apply
```

不要在当前项目里运行上述旧命令来初始化生产；现在的 Supabase 连接串只用于 `apps/server/scripts/migrate-supabase-data.mjs` 读取旧数据并迁到 self-host。

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
