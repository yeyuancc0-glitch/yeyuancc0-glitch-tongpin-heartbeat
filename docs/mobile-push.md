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
4. 按顺序应用推送相关 migration：`011_push_notifications.sql`、`012_web_push_subscriptions.sql`、`022_push_delivery_scheduler.sql`、`023_push_service_role_grants.sql`、`025_push_immediate_delivery.sql`、`034_audit_security_hardening.sql`。
5. 部署 Supabase Edge Function：`send-push-notifications --no-verify-jwt`。
6. 在 `push_delivery_settings` 写入：
   - `project_url`：当前 Supabase 项目 URL，例如 `https://<project-ref>.supabase.co`
   - `worker_secret`：只用于数据库触发器/cron 调用 Edge Function 的私密随机值
7. 配置 Edge Function secrets：
   - `PUSH_DELIVERY_WORKER_SECRET`：必须与 `push_delivery_settings.worker_secret` 一致
   - `WEB_PUSH_VAPID_PUBLIC_KEY`
   - `WEB_PUSH_VAPID_PRIVATE_KEY`
   - 可选：`WEB_PUSH_VAPID_SUBJECT`
8. 用 EAS 构建并安装 iOS / Android 真机包。

`send-push-notifications` 只接受 `PUSH_DELIVERY_WORKER_SECRET` 或 service role key；普通用户 JWT 不能直接触发推送 worker。新队列写入后由 `push_deliveries_immediate_flush` 通过 `pg_net` 立即调用，`push-delivery-worker` cron 只作为兜底。

## Web Push 兼容项

- Android Edge / Chromium PWA 的 manifest 需要保留 `gcm_sender_id: "103953800507"`，否则 `PushManager.subscribe()` 可能抛出 `Registration failed - push service error`。
- Android Edge 验收时，从桌面图标打开 `https://app.fanch.tech`，确认 Edge 站点通知权限已允许，再进入通知设置点击“开启当前网页推送”。

## 真机验收

1. 手机 A 和手机 B 分别安装原生包并登录不同账号。
2. 手机 B 首次打开 App，允许系统通知权限。
3. 确认 Supabase `push_tokens` 中有手机 B 用户的 enabled token。
4. 手机 B 退到后台或锁屏。
5. 手机 A 发送留言、快捷互动、今日胶囊或胶囊信。
6. 手机 B 应在锁屏或通知中心收到系统推送。
7. 检查 `push_deliveries`：成功应为 `sent`，无 token 应为 `skipped`，发送失败会记录 `last_error`。
8. 如果 `push_deliveries` 长时间停留在 `pending` 或 `processing`，优先检查 `push_delivery_settings.project_url` / `worker_secret`、Edge Function secrets、`pg_net` 调用日志，以及 `cron.job` 中是否存在 `push-delivery-worker`。
