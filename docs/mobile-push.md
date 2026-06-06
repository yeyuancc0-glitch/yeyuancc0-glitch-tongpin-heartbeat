# 手机系统推送接入说明

手机锁屏、通知中心、App 后台推送必须使用 iOS / Android 原生安装包。Expo Web / 浏览器页面没有打开时不能依靠 `expo-notifications` 收到 Expo Push。

## 推送范围

会推送：

- 对方新留言
- 对方快捷互动
- 对方今日胶囊
- 对方胶囊信

默认不推送：

- 自己触发的通知
- 已读、删除、设置变更
- 普通日历事件
- 宠物喂养、清洁、陪玩、小屋装饰
- 相册上传
- 历史 `投递了「...」` 留言

## 上线前检查

1. 在 Expo / EAS 项目中取得 projectId。
2. 将 `apps/app/app.json` 里的 `extra.eas.projectId` 从 `REPLACE_WITH_EAS_PROJECT_ID` 改成真实 projectId，或在环境中配置 `EXPO_PUBLIC_EAS_PROJECT_ID`。
3. iOS 使用 EAS credentials 配置 APNs，Android 使用 EAS credentials 配置 FCM。
4. 应用 `packages/db/migrations/011_push_notifications.sql`。
5. 部署 Supabase Edge Function：`send-push-notifications`。
6. 应用 `packages/db/migrations/022_push_delivery_scheduler.sql`，让 `pg_cron` 每 30 秒触发一次推送发送器。
7. 在 Supabase Vault 中写入用于调用 Edge Function 的密钥：
   - `project_url`：当前 Supabase 项目 URL，例如 `https://<project-ref>.supabase.co`
   - `service_role_key`：当前项目 service role key
8. 配置 Edge Function secrets：
   - `WEB_PUSH_VAPID_PUBLIC_KEY`
   - `WEB_PUSH_VAPID_PRIVATE_KEY`
   - 可选：`WEB_PUSH_VAPID_SUBJECT`
9. 用 EAS 构建并安装 iOS / Android 真机包。

## 真机验收

1. 手机 A 和手机 B 分别安装原生包并登录不同账号。
2. 手机 B 首次打开 App，允许系统通知权限。
3. 确认 Supabase `push_tokens` 中有手机 B 用户的 enabled token。
4. 手机 B 退到后台或锁屏。
5. 手机 A 发送留言、快捷互动、今日胶囊或胶囊信。
6. 手机 B 应在锁屏或通知中心收到系统推送。
7. 检查 `push_deliveries`：成功应为 `sent`，无 token 应为 `skipped`，发送失败会记录 `last_error`。
8. 如果 `push_deliveries` 长时间停留在 `pending`，优先检查 Vault 中是否存在 `project_url` / `service_role_key`，以及 `cron.job` 中是否存在 `push-delivery-worker`。
