# V0.1A 手工联调清单

## 前置条件

1. 在 Supabase 创建项目。
2. 在 Supabase SQL Editor 执行 `packages/db/migrations/001_v01a_schema.sql`。
3. 复制 `apps/app/.env.example` 为 `apps/app/.env`，填入：
   - `EXPO_PUBLIC_SUPABASE_URL`
   - `EXPO_PUBLIC_SUPABASE_ANON_KEY`
4. 启动 Web：

```bash
npm run web
```

## 双人核心闭环

### 用户 A

1. 打开 Web。
2. 注册账号 A。
3. 如果 Supabase 开启邮箱确认，完成邮箱确认后登录。
4. 保存 profile。
5. 创建邀请码。
6. 复制邀请码或邀请链接。

### 用户 B

1. 使用隐身窗口或另一个浏览器打开 Web。
2. 注册账号 B。
3. 保存 profile。
4. 输入用户 A 的邀请码。
5. 绑定成功后进入情侣首页。

### 双方日常功能

1. A 和 B 都能看到双方昵称。
2. 首页展示恋爱天数。
3. 首页展示纪念日倒计时。
4. A 创建今日分享。
5. B 创建今日分享。
6. A 创建留言。
7. B 创建留言。
8. A 删除自己的留言。
9. A 不能删除 B 的留言。
10. 任一方创建基础日历事件。
11. 双方都能看到日历事件。

## 解绑验证

1. 任一方点击解除当前关系。
2. couple 状态应变为 `ended`。
3. `couple_members.left_at` 应写入时间。
4. 双方不能继续写入原 couple 的 checkins、messages、calendar_events。

## 预期问题

- 如果 `.env` 未配置，页面会提示需要配置 Supabase。
- 如果 Supabase 开启邮箱确认，注册后需要先确认邮箱。
- 如果 SQL migration 未执行，登录后会出现表或 RPC 不存在的错误。
