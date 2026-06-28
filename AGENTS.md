# AGENTS.md

## 项目概览

同频跳动是情侣双人正式版应用，当前以 Expo Web 线上版本为主，同时保留 Expo / React Native 代码复用到 iOS 和 Android 的路径。核心功能包括注册登录、情侣绑定、首页、今日胶囊、留言、记忆、信件、相册、通知/推送、家园、足迹、今日娱乐和 Live2D 云宠。

## 常用命令

- 安装依赖：`npm install`
- 启动 Web：`npm run web`
- 启动自建 API 骨架：`npm run server:start`
- 应用自建 staging DB migration：服务器 `/opt/tongpin` 下执行 `sh scripts/apply-db-migrations.sh`
- 前端自建 Auth 冒烟：`API_BASE_URL=https://api-staging.fancah.tech npm run smoke:self-host-auth -w apps/app`
- 前端自建个人资料冒烟：`API_BASE_URL=https://api-staging.fancah.tech npm run smoke:self-host-profile -w apps/app`
- 前端自建相册冒烟：`API_BASE_URL=https://api-staging.fancah.tech npm run smoke:self-host-media -w apps/app`
- 前端自建留言冒烟：`API_BASE_URL=https://api-staging.fancah.tech npm run smoke:self-host-messages -w apps/app`
- 前端自建快捷互动冒烟：`API_BASE_URL=https://api-staging.fancah.tech npm run smoke:self-host-interactions -w apps/app`
- 前端自建首页 dashboard 冒烟：`API_BASE_URL=https://api-staging.fancah.tech npm run smoke:self-host-dashboard -w apps/app`
- 前端自建今日胶囊冒烟：`API_BASE_URL=https://api-staging.fancah.tech npm run smoke:self-host-checkins -w apps/app`
- 前端自建日历事件冒烟：`API_BASE_URL=https://api-staging.fancah.tech npm run smoke:self-host-calendar-events -w apps/app`
- 前端自建足迹冒烟：`API_BASE_URL=https://api-staging.fancah.tech npm run smoke:self-host-footprints -w apps/app`
- 前端自建家园/云宠安全子集冒烟：`API_BASE_URL=https://api-staging.fancah.tech npm run smoke:self-host-creation -w apps/app`
- 前端自建信件冒烟：`API_BASE_URL=https://api-staging.fancah.tech npm run smoke:self-host-letters -w apps/app`
- 前端自建站内通知冒烟：`API_BASE_URL=https://api-staging.fancah.tech npm run smoke:self-host-notifications -w apps/app`
- 前端自建推送偏好/订阅冒烟：`API_BASE_URL=https://api-staging.fancah.tech npm run smoke:self-host-push-notifications -w apps/app`
- 前端自建原生 Expo Push token 冒烟：`API_BASE_URL=https://api-staging.fancah.tech npm run smoke:self-host-expo-push -w apps/app`
- 前端自建隐私/反馈冒烟：`API_BASE_URL=https://api-staging.fancah.tech npm run smoke:self-host-privacy -w apps/app`
- 后端自建留言冒烟：`API_BASE_URL=https://api-staging.fancah.tech npm run smoke:messages -w @tongpin/server`
- 后端自建快捷互动冒烟：`API_BASE_URL=https://api-staging.fancah.tech npm run smoke:interactions -w @tongpin/server`
- 后端自建首页 dashboard 冒烟：`API_BASE_URL=https://api-staging.fancah.tech npm run smoke:dashboard -w @tongpin/server`
- 后端自建个人资料冒烟：`API_BASE_URL=https://api-staging.fancah.tech npm run smoke:profile -w @tongpin/server`
- 后端自建今日胶囊冒烟：`API_BASE_URL=https://api-staging.fancah.tech npm run smoke:checkins -w @tongpin/server`
- 后端自建日历事件冒烟：`API_BASE_URL=https://api-staging.fancah.tech npm run smoke:calendar-events -w @tongpin/server`
- 后端自建足迹冒烟：`API_BASE_URL=https://api-staging.fancah.tech npm run smoke:footprints -w @tongpin/server`
- 后端自建家园/云宠最小数据层冒烟：`API_BASE_URL=https://api-staging.fancah.tech npm run smoke:creation -w @tongpin/server`
- 后端自建信件冒烟：`API_BASE_URL=https://api-staging.fancah.tech npm run smoke:letters -w @tongpin/server`
- 后端自建站内通知冒烟：`API_BASE_URL=https://api-staging.fancah.tech npm run smoke:notifications -w @tongpin/server`
- 后端自建推送偏好/队列冒烟：`API_BASE_URL=https://api-staging.fancah.tech npm run smoke:push-notifications -w @tongpin/server`
- 后端自建隐私/反馈冒烟：`API_BASE_URL=https://api-staging.fancah.tech npm run smoke:privacy -w @tongpin/server`
- 启动自建 Push worker：`npm run worker:push -w @tongpin/server`
- 类型检查：`npm run typecheck`
- Web 构建：`npm run build:web`
- 环境变量检查：`npm run check:env`
- 自建 API 语法检查：`npm run check:server`
- 自建 Auth 邮件投递自检：`node apps/server/scripts/check-email-service.mjs`
- 自建目标库整体完整性审计：服务器 `/opt/tongpin` 下执行 `sudo docker compose exec -T api npm run audit:self-host-integrity --silent`；本地可用 `SELF_HOST_DB_URL="postgresql://..." npm run audit:self-host-integrity -w @tongpin/server`。该审计只输出计数和脱敏 id，用于发现账号/profile 缺失、active couple 异常、业务数据因关系边界不可见、上传长期 pending 等迁移维稳问题。
- 服务器 Supabase 旧数据迁移编排 dry-run：服务器 `/opt/tongpin` 下执行 `bash scripts/run-supabase-migration.sh`
- 服务器 Supabase 旧数据迁移编排 apply：服务器 `/opt/tongpin` 下执行 `bash scripts/run-supabase-migration.sh --apply`
- Supabase 旧数据迁移前置检查：`SUPABASE_DB_URL="postgresql://..." SELF_HOST_DB_URL="postgresql://..." SUPABASE_STORAGE_S3_ENDPOINT="https://<project-ref>.storage.supabase.co/storage/v1/s3" SUPABASE_STORAGE_S3_REGION="..." SUPABASE_STORAGE_S3_ACCESS_KEY_ID="..." SUPABASE_STORAGE_S3_SECRET_ACCESS_KEY="..." npm run migrate:supabase:preflight -w @tongpin/server`
- Supabase 旧数据迁移 dry-run：`SUPABASE_DB_URL="postgresql://..." SELF_HOST_DB_URL="postgresql://..." npm run migrate:supabase:data -w @tongpin/server`
- Supabase 旧数据迁移导入：`SUPABASE_DB_URL="postgresql://..." SELF_HOST_DB_URL="postgresql://..." npm run migrate:supabase:data:apply -w @tongpin/server`
- Supabase Storage 旧对象迁移：`SUPABASE_DB_URL="postgresql://..." SELF_HOST_DB_URL="postgresql://..." SUPABASE_STORAGE_S3_ENDPOINT="https://<project-ref>.storage.supabase.co/storage/v1/s3" SUPABASE_STORAGE_S3_REGION="..." SUPABASE_STORAGE_S3_ACCESS_KEY_ID="..." SUPABASE_STORAGE_S3_SECRET_ACCESS_KEY="..." npm run migrate:supabase:data:copy-storage -w @tongpin/server`
- Supabase 旧数据迁移对账：`SUPABASE_DB_URL="postgresql://..." SELF_HOST_DB_URL="postgresql://..." npm run migrate:supabase:data:verify -w @tongpin/server`
- 单用户 Supabase 迁移审计：`SUPABASE_DB_URL="postgresql://..." SELF_HOST_DB_URL="postgresql://..." MIGRATION_AUDIT_EMAIL="user@example.com" npm run migrate:supabase:audit-user -w @tongpin/server`，也可用 `MIGRATION_AUDIT_USER_ID="<uuid>"` 精确按用户 id 对账；迁移后已按安全要求移除 Supabase 源凭证时，用 `MIGRATION_AUDIT_TARGET_ONLY=true MIGRATION_AUDIT_EMAIL="user@example.com" npm run migrate:supabase:audit-user -w @tongpin/server -- --target-only` 只审计自建目标库账号、profile、active couple 和历史胶囊可见性。
- 自建 staging 全量备份：服务器 `/opt/tongpin` 下执行 `bash scripts/backup-all.sh`
- 安装自建 staging 备份 cron：服务器 `/opt/tongpin` 下执行 `sudo bash scripts/install-backup-cron.sh`
- 自建 staging 恢复演练：服务器 `/opt/tongpin` 下执行 `bash scripts/verify-backups-restore.sh`
- 安装自建 staging 恢复演练 cron：服务器 `/opt/tongpin` 下执行 `sudo bash scripts/install-restore-verify-cron.sh`
- Supabase 直连基线检查：`npm run check:supabase-usage`
- Supabase 直连严格清零检查：`npm run check:supabase-usage:strict`
- 迁移事故回归检查：`npm run check:migration-regressions`
- 完整验证：`npm run verify`
- 自建数据库 migration：`npm run db:apply`，或服务器 `/opt/tongpin` 下执行 `sh scripts/apply-db-migrations.sh`
- 静态预览：`cd apps/app && ruby -run -e httpd dist -p 4173`

## 目录结构

- `apps/app`：Expo Router 应用，Web / iOS / Android 共用。
- `apps/server`：自建后端 API/BFF，提供 Auth、关系、dashboard、相册/头像 MinIO、留言、胶囊、信件、通知/SSE、推送队列/worker、隐私反馈和家园/云宠安全子集。
- `apps/app/features`：按业务域拆分页面和服务；首页 shell 在 `features/home/HomeScreen.tsx`。
- `apps/app/components/app-ui`：跨页面 App UI 组件，`BottomTabBar.tsx` 从 `AppUI.tsx` re-export。
- `apps/app/lib`：自建 API、通知、日期、平台封装、媒体工具和产品常量。
- `apps/app/lib/selfHost`：前端自建 API/BFF 客户端、Auth session 存储和 self-host 环境配置；业务功能优先通过这里或同级封装接入，不要在页面里散写 fetch。
- `apps/app/lib/supabase/database.types.ts` 当前仅作为历史业务类型定义使用；`apps/app/lib/supabase/` 下不要再放运行时 Supabase client、Storage wrapper 或业务直连。
- `apps/app/motion`：统一动效、触感、图片淡入和动画基础设施。
- `packages/db`：Supabase schema、migration、RLS policy、测试 SQL。
- `packages/shared`：跨端共享类型和常量，workspace 包名为 `@tongpin/shared`。
- `supabase/functions`：Supabase Edge Functions。

## 开发规则

- 业务用户表命名为 `profiles`，不要创建 `public.users`；前端资料编辑只能更新昵称、头像 path / 缩略图 path、生日和 `updated_at`。
- 迁移账号可能出现 `app_auth.accounts` 存在但 `profiles` 缺行的半数据状态；self-host Auth 查询必须容忍缺 profile，`/api/profile` 与 `/api/me/dashboard` 必须自动补建当前用户 profile，避免重置密码后登录卡在个人资料页且无法保存。
- 聚合历史业务数据时不要用必须命中 `profiles` 的 inner join 过滤主数据；留言、成员等展示资料应 left join profile 并用 user id / 业务行时间兜底，否则迁移半数据会让留言或成员像“丢失”。
- 自建 `/api/profile` 更新必须保持 patch 语义：未传的生日、头像 path / 缩略图 path 不能被清空，只有显式传 `null` 才表示清除，避免局部资料更新造成用户数据“丢失”。
- 一个用户同一时间只能拥有一个 active couple；情侣关系必须通过 `pair_invites` 接受事务创建，不要在创建邀请时提前创建空 `couples`。
- 自建 `/api/pair-invites/accept` 必须兼容 `relationshipStartedAt` 与 `relationship_started_at`，并在接受邀请时保留恋爱开始日期，避免旧脚本或迁移调用方传 snake_case 时日期丢失。
- 自建 `/api/pair-invites/accept` 调用 Postgres `accept_pair_invite(...)` 后，必须在同一事务里用第二条 SQL 按返回的 `couple_id` 读取 `couples`；不要把函数调用和 `join couples` 写进同一条 SQL，否则 Postgres 语句快照可能看不到函数刚插入的情侣行，导致接受邀请 500。
- 自建关系/Profile/Dashboard API 返回给前端的日期型字段应统一为 `YYYY-MM-DD` date key，不要直接把 Postgres `date` 对象或 ISO 时间串透出给日期输入控件。
- 邀请码创建走 `create_pair_invite(invite_expires_at)` RPC；查询 `pair_invites` 时只取当前用户创建或接受的记录。
- 所有情侣业务数据必须带 `couple_id`，权限边界以 active couple member 为准；不要只靠前端隐藏按钮做数据权限。
- 信件产品文案统一叫“信件 / 胶囊信”，底层复用 `future_letters`；创建走 `create_future_letter(...)`，删除走 `delete_letter(letter_id)`。
- 伴侣侧普通业务通知走 `create_partner_notification(...)` RPC；系统推送正文只放低敏摘要，不复述留言、信件、胶囊、照片或精确位置内容。
- 留言发送、通知和删除统一走 `apps/app/features/messages/messageService.ts`；通知/推送失败不能回滚或阻塞留言本身。
- 今日胶囊删除必须软删 `checkins.deleted_at`，不要从前端 hard delete。
- 反馈入口必须通过 `submit_feedback(feedback_body, target_couple_id, feedback_metadata)` RPC 写入 `app_feedback`。
- 认证恢复、账号切换和首页初次加载期间不能渲染 mock / 测试用户数据；加载态应显示无个人信息的首页骨架，并按 `userId` 隔离缓存。
- 首页 dashboard 首次加载失败、超时或临时网络错误不能当成用户缺少 `profiles` 记录，也不能自动把用户导向个人资料补全页；只有 API 成功返回 profile 为空时才进入资料补全。
- self-host Auth 恢复遇到网络错误、CORS/DNS 超时或 API 5xx 时不能清除本地 session；只有明确 401/403 或 refresh token 被拒绝时才清 session，避免短暂后端故障让用户看起来“数据丢失”。
- staging / production 配置真实 Resend 时，Auth 冒烟和调试账号必须使用 `.test` 保留域；后端邮件服务必须对 `.test` 收件人短路返回 `test_email_skipped` 并提供 debug token，不能调用 Resend 或消耗真实邮件额度。
- Resend 返回 `daily_quota_exceeded` 后，后端邮件服务必须进入短期熔断并返回 `email_quota_exceeded` / `resend_daily_quota_exceeded`，不能在额度耗尽当天继续反复请求 Resend；前端忘记密码需提示“邮件服务今日额度已达上限”。
- 注册/邮箱验证/忘记密码这类会触发真实邮件的 Auth 入口必须保留按邮箱和 IP 前缀的服务端限流，并抑制短时间内重复请求再次调用 Resend；真实邮箱不能因为恶意或误触重复请求而持续消耗邮件额度。
- 运行时产品文案和选项常量放在 `apps/app/lib/constants/appContent.ts`；不要把真实界面常量放回 mock 文件。

## 前端与体验

- 当前 UI 视觉语言为“情绪胶囊风”：奶油白 / 浅粉白背景、纯白卡片、柔和蔷薇粉主色，辅以雾紫、奶黄和浅蓝灰。
- Web 端整体按 App 式体验设计和取舍：优先沉浸、稳定视口、固定底部导航、安全区适配、系统/类原生反馈和触控手感；不要按普通网页的可缩放、文档流长页或营销页思路处理核心界面。
- “胶囊”是品牌符号，优先使用自定义 `CapsuleMark` 或同风格插画资源，不要用 `💊` emoji 代表品牌胶囊。
- 破坏性确认类弹窗优先使用平台/手机系统风格，例如原生 `Alert.alert` 或等价系统确认；不要新增自绘确认框，除非用户明确要求。
- Web 纵向滚动必须保留 App 式边界回弹和顶部下拉刷新；不要把 `html, body` 的 `overscroll-behavior-y` 设为 `none`。
- `AppScroll` 的滚轮/触控板惯性回弹只使用浏览器 / RN Web 原生滚动；JS `rubberBand` 只用于真实触控下拉刷新。
- Web 端按 App 式体验禁用用户缩放；`+html.tsx` viewport 保留 `initial-scale=1`、`maximum-scale=1`、`user-scalable=no` 和 `viewport-fit=cover`。
- iOS Safari 底部导航要兼容地址栏收缩和回弹，但不要跟随 `visualViewport` / 键盘高度移动。
- 个人页设置详情由 `HomeScreen` 的 `subPage` 承载；从“我的”打开任一设置页时必须同时保持 `activeTab = "me"`，不要只裸设 `subPage`，否则刷新或返回时容易表现成跳回首页、底部导航状态丢失。
- 从设置详情跳到其它业务子页时，也必须同步切到该子页所属的 `activeTab`；设置详情返回必须回到 `activeTab = "me"` + `subPage = "main"`，避免出现设置页/信件页内容和底部导航状态不一致。
- 触感反馈使用 `expo-haptics` 经 `apps/app/motion/haptics.ts` 封装；Web 或不支持设备必须静默降级。
- Web portal 统一通过 `apps/app/lib/platform/portal` 调用；跨端组件不要顶层直接导入 `react-dom`。

## Android / 原生端状态

- Android APK 目前按预览包看待，不应宣称与 Web 正式版功能完全等价；完成移动端前需要专项验收原生图片、云宠、底部导航、浮层和安全区。
- Android APK 构建专用副本、Gradle 缓存、Android SDK 下载物、日志和 APK 产物已迁移到 `/Users/a123456/Downloads/同频跳动-安卓APK构建文件/android-apk-build`；不要再把这些大文件放回 Web 项目目录。
- 头像、相册、记忆配图和今日胶囊图片上传仍以 Web `File` / `FileList` / DOM canvas 流程为主；Android 端完成前需接入原生图片选择、压缩/缩略图生成和 self-host MinIO 上传链路。
- `Live2DCanvas`、`GlobalPetLayer` 和云宠全局游走当前是 Web / DOM / Pixi 实现；Android 端需要原生可用的云宠渲染或明确降级方案。
- 共享 RN 样式不要直接依赖 Web CSS：`position: "fixed"`、`calc/env/vh/vw`、`backgroundImage`、`boxShadow`、`backdropFilter`、`filter`、`outlineStyle` 等必须按平台隔离或替换为 RN 安全区、absolute 布局、`elevation` / 原生阴影等实现。
- Android / EAS 构建入口以 `apps/app/app.json` 为准；不要让根目录空 `app.json` 作为 Expo 项目配置参与原生构建。

## 首页、相册与记忆

- 当前首页结构：此刻同频卡片内合并快捷心情投递；相册卡片位于此刻同频下方；留言板在首页一级界面直接提供输入框；首页不展示最近纪念日和今日胶囊卡片。
- `HomeScreen.tsx` 只作为首页数据编排和路由 shell；主屏、今日胶囊、记忆页、家园、信件、设置、留言和相册放在对应 feature 目录，不要再把新业务整块堆回 HomeScreen。
- 首页登录恢复骨架在 `features/home/HomeScreenShell.tsx`，`HomeScreen.tsx` 继续 re-export 以兼容旧导入；不要把这类静态骨架 UI 重新堆回主 shell。
- 首页 dashboard 数据辅助逻辑已拆到 `homeDashboardTypes.ts`、`homeDashboardSelects.ts`、`homeDashboardCache.ts`、`homeDashboardUtils.ts`、`homeAvatarHydration.ts`、`homeMediaHydration.ts` 和 `homeNotificationRefresh.ts`；云宠路由/仪式 helper 在 `homePetWorldHelpers.ts`。后续维护优先复用这些模块，不要把缓存、水合或云宠仪式逻辑堆回 `useCoupleData.ts` / `HomeScreen.tsx`。
- 首页 dashboard 加载分阶段：首屏只阻塞 profiles 与 active couple 基础信息；留言、相册、心情、信件、通知和图片 signed URL 后台补齐。
- 首页 dashboard 当前也驱动完整留言、相册、信件、记忆和家园子页；在没有分页/增量加载前，聚合 limit 不能恢复到很小的首屏预览值，否则迁移后的历史数据会被误认为“丢失”。今日胶囊是日更历史数据，dashboard/checkins 服务上限必须覆盖超过 100 天的历史；如需降首屏 payload，必须先给完整页面补独立分页或全量加载入口。
- 自建业务列表 API 的默认 limit 也不能保留旧首页预览值；`messages`、`letters`、`media`、`calendar-events`、`footprints`、`creation/actions`、`notifications` 等直接列表在没有独立分页前默认应覆盖完整页面历史需求，显式传小 limit 才能作为预览。
- 前端 `apps/app/lib/selfHost/*Api.ts` 的直接列表 helper 默认 limit 也必须与后端完整历史默认保持一致；不要在客户端封装层保留 12、30、60、100 这类旧预览默认值，否则未来完整页绕过 dashboard 时会再次看起来“数据丢失”。
- 记忆页历史胶囊、留言、信件、足迹和相册独立记忆必须使用 dashboard 返回的完整列表参与时间线，不要用 `slice(0, 4)`、`slice(0, 6)` 这类首页预览截断；单张记忆卡内部图片预览可限制数量，但时间线入口不能截断，否则迁移后的旧数据会被误认为“丢失”。
- 今日胶囊页的“历史胶囊”入口也必须展示 dashboard 返回的完整胶囊列表；不要用 `slice(0, 4)` 截断，也不要显示没有真实点击行为的“查看全部”，否则用户会把界面预览限制误认为迁移数据丢失。
- 来信、足迹、今日胶囊、记忆等完整业务页不能沿用首页预览式 `slice(0, N)` 截断历史；如需性能优化，必须先补真实分页、加载更多或完整入口。首页小预览可以保留有限数量，但要避免让用户误以为迁移数据丢失。
- 首页留言板这类预览式列表若只展示最近几条，必须提供真实完整页入口和总数提示；不能把完整留言页藏起来，否则迁移后用户会误以为旧留言丢失。
- 首页/设置页通知列表当前也依赖 dashboard 与后台通知刷新结果；通知刷新 limit 必须与 dashboard 聚合保持一致，不能用很小的预览值覆盖已有通知列表，否则刷新/SSE 后历史提醒会被误认为“丢失”。
- 首页后台刷新应静默运行；兜底刷新保持温和频率，通知轮询 90 秒，全量 dashboard 兜底刷新 120 秒且仅页面可见时运行。
- 首页本地缓存只保存低敏骨架数据；不要持久化留言、通知、胶囊、信件、足迹、宠物记忆、caption、signed URL、AI 气泡或 world decision 正文。头像和相册只缓存 Storage path，刷新后后台重新签名。
- 首页 dashboard 的头像/相册 signed URL 水合必须逐资源容错；单个历史 Storage 对象缺失、签名失败或缩略图异常只能让该图片降级为空/占位，不能让整个 dashboard 刷新失败或清空其它业务数据。
- self-host 路径下头像使用 MinIO `profile-avatars`，相册使用 MinIO `couple-media`。数据库只保存 Storage path，前端展示时通过自建 API 生成 signed URL，不能把 signed URL 写回数据库。
- 头像与相册缩略图使用独立 Storage path：`profiles.avatar_thumbnail_url`、`media_files.thumbnail_storage_path`；列表/九宫格/记忆流优先展示缩略图，点开预览才按需读取原图。
- 相册大图预览应保留缩略图托底，并对当前与相邻照片的原图 signed URL 做预签名和图片预取；已加载图片 URL 需要跨组件实例记忆，避免切图后立即重复闪加载。
- self-host 头像上传、移除或资料保存成功后，前端必须把返回的 profile 合并回当前 dashboard 状态，并保留路径未变时已有的头像 signed URL；不要只依赖返回上一页后的全量 reload，否则会表现成“上传后消失”。
- self-host 相册上传完成并拿到 ready `media_files` 记录后，前端必须先把新媒体合并进当前 dashboard / 相册状态；后台 reload 只做校准，不能把上传成功后的显示完全依赖一次全量刷新，否则刷新被跳过、失败或列表上限不一致时会表现成“上传后消失”。
- 旧头像缺少 `avatar_thumbnail_url` 时，小尺寸头像只能使用 Storage transform / 本地缩略图 blob 兜底，不要回退到原图 signed URL。
- 用户只需选择一次图片；前端负责自动上传原图和缩略图。缩略图失败时不要写入缩略图 path；数据库保存失败要清理本次上传对象。
- self-host 相册上传创建记录时只有收到并成功校验缩略图对象，才允许写入 `media_files.thumbnail_storage_path`；如果历史记录有缩略图 path 但 MinIO 对象不存在，读缩略图 signed URL 必须回退原图，避免首页九宫格/相册显示破图。
- self-host 头像和相册签名 PUT 上传返回给浏览器的 `requiredHeaders` 不能包含 `content-length`；浏览器禁止手动设置该 header。服务端仍用创建上传时记录的 size 和完成阶段 S3 HEAD 校验文件大小，前端上传 helper 也要过滤旧响应中的 `content-length`。
- 图片 MIME、缩略图和预取工具位于 `apps/app/lib/media/imageStorage.ts`；不要把纯媒体工具重新挂到 Supabase client 上。
- 相册和记忆卡片图片上传当前最多 10 张；首页九宫格预览前 9 张，超过 9 张显示 `+N`。
- 记忆页筛选分类固定为“全部 / 日常 / 留言 / 纪念日 / 信件”，不展示“想你”分类。
- 首页/记忆/相册样式通过 `features/home/homeStyles.ts` 统一合并导出；相册与全屏预览相关 `photo*` 样式放在 `homePhotoStyles.ts`，记忆页 `memory*` 样式放在 `homeMemoryStyles.ts`，首页浮层/弹窗相关 `floatingReaction*`、`moodPopup*`、`letterPopup*` 样式放在 `homeOverlayStyles.ts`，不要把这些大块样式放回 `homeStyles.ts`。

## 云宠与家园

- 家园入口使用右下角悬浮圆形按钮；家园 Hub 标题只保留“家园”，包含云宠小窝、我们的足迹和今日娱乐。
- 家园页面主状态和页面编排保留在 `features/creation/CreationSpacePage.tsx`；静态谜题、云宠文案/记忆过滤/错误文案等纯逻辑放在 `creationSpaceLogic.ts`，足迹弹窗、云宠记忆行和食物卡放在 `CreationSpaceParts.tsx`，不要把这些逻辑重新堆回主页面。
- 家园相关样式从 `homeStyles.ts` 拆到 `features/home/homeCreationStyles.ts`，并通过 `styles` 合并导出保持调用兼容；新增 `creation*`、`petMemory*`、`footprintModal*` 样式优先放在该文件。
- 家园 Hub 是不可纵向滚动的中转入口页，内容需在首屏内完成入口呈现。
- 云宠模型源文件来自根目录 `LittleCat_Model/`；Web 静态运行资源放在 `apps/app/public/live2d/little-cat/`，Cubism Core 本地文件在 `apps/app/public/live2d/core/live2dcubismcore.min.js`。
- Live2D Web 渲染使用 `pixi.js`、`pixi-live2d-display/cubism4` 和 `live2dcubismcore`；`Live2DCanvas` 必须先加载本地 Cubism Core，再同步 `require` Pixi/Cubism4 并设置 `window.PIXI`。
- 云宠位置以 `creation_spaces.pet_world_surface` 为准；用户当前页面和宠物真实页面必须分离，不能因为进入页面或 `mark_pet_surface_seen` 偷偷改变真实位置。
- 云宠本体全局只能出现一个；真实 surface 为 `pet_room` 时本体只在小窝显示，云宠在外面时小窝只显示显式召回入口。
- Live2D 云宠不把 `footprints` / `playground` 作为本体位置；旧值必须归一到 `pet_room`。
- 云宠小窝不要放单独的“抚摸 / 摸摸”按钮；用户直接点击云宠本体即为摸摸或唤醒。
- 云宠睡觉动作要与气泡生命周期分离；睡觉期间眼睛必须全程闭合，不能用贴图、遮罩或覆盖层假闭眼。
- 云宠投喂、睡眠、夜间自动睡眠和外部打盹的能量恢复规则固定在数据库 RPC；前端不要重复计算或绕过 RPC。
- 云宠 AI 只做表现导演协议，不是聊天助手；上下文和 world decision 只允许低敏摘要，不传正文、caption、照片内容或精确坐标。
- `apply_pet_world_decision` 是 Edge Function / service role 专用 AI 写入入口；前端规则漫游只能调用 `apply_pet_rule_world_decision`，且该 wrapper 会清零客户端传入的状态增量和记忆写入。
- 云宠自主漫游不能自动切换用户页面，只能通过 `apply_pet_rule_world_decision` / `summon_creation_pet` 明确更新真实位置。

## 推送与通知

- 原生 iOS / Android 使用 Expo Notifications；网页版使用标准 Web Push（Service Worker + Push API + VAPID），不能依靠 `expo-notifications` 在浏览器页面关闭时收到推送。
- Web Push 订阅使用 `push_tokens.provider = 'web_push'`，endpoint 存 `token`，密钥存 `web_p256dh` / `web_auth`；Service Worker 位于 `apps/app/public/sw.js`，PWA manifest 位于 `apps/app/public/site.webmanifest` 且需保留 Chromium/Edge Android 使用的 `gcm_sender_id: "103953800507"`。
- Android Edge 在中国大陆环境下不作为可用网页后台推送渠道；即使通知权限已允许，`PushManager.subscribe()` 仍可能报 `Registration failed - push service error`。前端应提示使用站内通知，可靠系统推送需要后续接入原生 Android 国内厂商推送通道。
- iPhone 网页推送要求 iOS 16.4+，且用户先将网站添加到主屏幕，再从主屏幕图标打开并授权。
- Web 构建时不要让 `expo export` 直接解析原生推送依赖；平台拆分逻辑用于绕开 `expo-application` / `expo-device` / `expo-notifications`。
- `send-push-notifications` 只接受 service role key 或 `PUSH_DELIVERY_WORKER_SECRET`；前端客户端不要直接调用该函数。
- 需要推送的是对方新留言、快捷互动、今日胶囊和胶囊信；默认不推送自己触发的通知、删除/已读/设置变更、普通日历事件、喂养类事件、相册上传和历史快捷互动留言。
- 快捷互动通知标题需兼容 `TA 投递了一点心情` 和 `TA 向你投递了一点心情`；不要只用单一标题判断快捷互动提醒。
- 通知点击统一经 `apps/app/lib/notifications/openEvents*` 广播到页面；Web Service Worker 点击已有窗口时要 postMessage `tongpin:notification-open`，并 focus / navigate 到目标 URL。
- 用户当前没有 Apple Developer Program 账号；在用户准备好前，不推进 iOS 原生 APNs 推送上线。

## 测试与验证

- 前端或共享包修改后至少运行 `npm run typecheck` 和 `npm run build:web`。
- 迁移维稳相关改动后运行 `npm run check:migration-regressions`；该检查守住个人页设置导航、历史列表完整展示、self-host 默认 limit、上传后本地合并和 Resend 测试/额度保护等已踩坑规则。
- 权限、RLS、RPC、Storage policy、推送队列或数据删除语义变更后，执行 `packages/db/tests/rls_acceptance.sql` 的验收场景。
- `npm run check:env` 要求 `EXPO_PUBLIC_SELF_HOST_API_URL`，并禁止 `apps/app/.env` 或 shell 环境里继续出现 `EXPO_PUBLIC_SUPABASE_URL` / `EXPO_PUBLIC_SUPABASE_ANON_KEY`；前端 public env 不能再混入 Supabase。
- `npm run build:web` 会执行 `expo export --platform web --clear && node ../../scripts/prepare-web-dist.mjs`；后处理脚本必须校验 HTML 引用的入口资源和 `/assets/assets/...` 资源存在且非空。
- Web 静态后处理必须把所有 `.html` 路由（包括 `auth/reset-password.html` 这类嵌套路由）复制为同名目录下的 `index.html`，因为 Caddy 使用无扩展路径服务邮件验证/密码重置等入口；Caddy Web 兜底必须在 `/index.html` 前尝试 `{path}.html` 和 `{path}/index.html`，否则 `/auth/reset-password`、`/auth/verify-email` 会返回首页静态壳而不是对应 Auth 页面；部署时不要用整目录替换破坏 Docker bind mount，优先就地同步文件后重启/刷新 Caddy。
- 浏览器验收：启动静态预览后打开 `http://localhost:<port>`，检查首页内容、底部导航、相册预览和控制台 error/warn。
- 大重构或清理类改动应保持严格未使用检查通过：`npm run typecheck -w apps/app -- --noUnusedLocals --noUnusedParameters --pretty false`。

## 代码生成与自动产物

- `apps/app/.expo/` 和 `apps/app/dist/` 是 Expo 生成产物，不应手动维护。
- `.playwright-cli/` 是浏览器验收临时缓存，不应提交。
- 应用图标源文件：`apps/app/assets/icon.png`；Web favicon：`apps/app/assets/favicon.png`；iOS 主屏图标和 PWA manifest 资源位于 `apps/app/public/`。
- 首页互动图标位于 `apps/app/assets/interaction-icons/`；快捷互动透明 PNG 位于 `apps/app/assets/quick-interaction-icons/`；家园插画位于 `apps/app/assets/creation-town/`。

## Migration 与部署

- 旧 Supabase migration 保留在 `packages/db/migrations` 作为历史源结构；self-host migration 放在 `apps/server/db/migrations`，部署时同步到 `infra/self-host/staging/runtime/db/migrations`。
- 数据库表默认启用 RLS；RLS policy 之外还必须给 `authenticated` 角色显式表级 `grant`。
- 事务性绑定逻辑使用 Postgres RPC，不允许前端直接创建 `couples` 和 `couple_members`。
- 恋爱开始日期由 `accept_pair_invite(invite_code, relationship_started_at)` 和 `update_active_couple_dates(relationship_started_at)` 处理。
- Web 正式版使用 Expo Web 静态导出；Vercel 构建命令为 `npm run build:web`，输出目录为 `apps/app/dist`。
- App 运行时不再依赖 `@supabase/supabase-js` 或 `EXPO_PUBLIC_SUPABASE_*`；前端只需要 `EXPO_PUBLIC_SELF_HOST_API_URL` 指向自建 API。
- 根命令 `npm run db:apply` 已改为通过 SSH 执行 self-host DB migration，不再应用 `packages/db/migrations` 到 Supabase；旧 Supabase schema 只作为迁移来源结构参考。
- 完全脱离 Supabase 的自建服务器迁移方案见 `docs/self-host-migration-plan.md`，优化执行路线见 `docs/self-host-optimized-roadmap.md`，Supabase 依赖清单见 `docs/self-host-supabase-replacement-map.md`；实施时需全量替换 Auth、Postgres/RPC、Storage、Realtime、Edge Functions、Cron 和 Push worker，不要只改数据库地址。
- 自建迁移进入真实 API/BFF 前必须维护五个门槛文档：`docs/supabase-usage-inventory.md`、`docs/self-host-authorization-map.md`、`docs/self-host-data-constraints.md`、`docs/self-host-cutover-rollback.md`、`docs/self-host-security-ops.md`。
- 新增业务代码不得增加 Supabase 直连；`npm run check:supabase-usage` 以当前存量基线拦截新增，迁移完成阶段用 `npm run check:supabase-usage:strict` 要求业务代码清零。
- 旧数据迁移验收不能只看表级 count/hash；`checkins` 还要做按 `user_id` 的覆盖对账，避免某个用户的历史胶囊在迁移后“看起来丢了”却没有被脚本验出来。
- 自建目标库整体完整性审计应作为迁移维稳常规门槛：重点看 active account 缺 profile、用户多个 active couple、active couple 成员数异常、未删除业务数据挂到缺失或成员异常的 active couple、业务数据作者/上传者/收件人不再是对应 active couple member，以及头像/相册上传长期 pending；报告不得输出正文、图片路径、邮箱或 token。已结束关系上的历史行不应作为 integrity failure，除非产品决定恢复跨关系历史可见性。
- 单用户迁移审计默认不得输出胶囊正文预览；只有明确设置 `MIGRATION_AUDIT_INCLUDE_CONTENT_PREVIEW=true` 才允许输出短预览，日常排查只看计数、日期、可见性和脱敏 id。
- Supabase 旧数据迁移不能假设每个有业务数据的账号都存在 `public.profiles`；迁移脚本必须从 `auth.users` 和业务表 user id 引用合成缺失的 profile/account，再迁 `checkins`、`couple_members`、留言、相册等依赖 `profiles` FK 的业务数据，否则会出现账号能登录但历史胶囊或其它历史数据没迁入/不可见。
- Supabase 旧数据迁移不能假设源库已经跑到最新历史 schema；读取 `profiles`、`checkins`、`media_files`、`calendar_events`、`future_letters` 等旧表时，后加的可选列要在迁移脚本里用兼容默认值读取，关键列缺失时要在报告里 warning，避免旧账号少量历史胶囊或相册因源列不存在而整表漏迁。
- 前端 Auth 已切为 self-host-only：`AuthProvider` 通过 `apps/app/lib/selfHost/authApi.ts` 和 `authSession.ts` 处理登录、注册、邮箱验证、密码重置、refresh 和登出；不要把 Supabase 或散写 fetch 调回页面。
- self-host Auth 邮件链接前端路由为 `/auth/verify-email?token=...` 和 `/auth/reset-password?token=...`，共用 `features/auth/AuthLinkScreen.tsx`；密码重置成功后自建后端只返回 `status: ok` 并撤销会话，前端应让用户用新密码重新登录，不要假设会返回新 session。
- `apps/app/scripts/smoke-self-host-auth.mjs` 验证前端 self-host Auth 约定：register、邮箱验证确认、`/api/me`、refresh、logout 和密码重置确认；受 Codex 沙箱 DNS 限制时需要外网权限执行。
- `apps/app/scripts/smoke-self-host-profile.mjs` 与 `apps/server/scripts/smoke-profile.mjs` 验证自建个人资料：读取、昵称/生日更新、无 active couple 时日期暂存语义、绑定后恋爱开始日期更新、头像签名上传、伴侣读取、第三人隔离和删除；受 Codex 沙箱 DNS 限制时需要外网权限执行。
- 前端 self-host 模式已接入首页 `/api/me/dashboard` 聚合读取：`useCoupleData` 通过 `apps/app/lib/selfHost/dashboardApi.ts` 一次读取 profile、active couple members、留言、相册元数据、今日胶囊、心情、信件、站内通知、日历事件、足迹和家园/云宠最小数据；头像/相册 signed URL 仍由前端按需水合。
- 未绑定用户的 `/api/me/dashboard` 也必须返回当前用户自己创建且未过期的 `pendingInvites`；绑定页刷新后依赖这个字段继续展示邀请码，不能只在创建响应的本地 state 里保存，否则用户会以为邀请码丢失。
- 自建 DB 的 `couple_members.role` 当前为 `partner`，但前端 historical `ActiveCouple` 类型仍使用 `member`；self-host dashboard 映射层需要归一化成前端期望值，不要让 DB 内部枚举泄漏到旧 UI 类型。
- 前端已打开家园安全子集：`HomeScreen` 允许进入 `CreationSpacePage` 和悬浮家园入口，`CreationSpacePage` 通过 `apps/app/lib/selfHost/creationApi.ts` 调用 `/api/creation/space`、`/api/creation/actions`、`/api/creation/pet/feed`、`/api/creation/pet/interact`、`/api/creation/pet/sleep/settle`、`/api/creation/pet/food/buy`、`/api/creation/game/reward` 和 `/api/creation/pet/summon`；足迹新增/编辑/删除走自建 `/api/footprints`。完整云宠 AI、自主漫游和宠物记忆编辑尚未迁完，必须保持禁用或 no-op，不能触发 Supabase RPC/channel。
- 前端 self-host 模式已接入初步情侣绑定和相册：`PairingScreen` 走 `/api/pair-invites` 与 `/api/pair-invites/accept`，`useHomePhotoActions` 上传/删除走 self-host media API，照片 signed URL 通过 `/api/media/read-url` 获取。
- 前端 self-host 模式的记忆流相册照片删除已复用 `/api/media/delete`；`MemoryPage` 通过 `onDeleteMedia` 回调接入，不应在 self-host 模式下回退到 Supabase Storage 删除。
- 前端 self-host 模式已接入个人资料编辑和头像 Storage：`ProfileScreen` 通过 `apps/app/lib/selfHost/profileApi.ts` 读取/更新昵称、生日和恋爱开始日期，头像上传/删除走 `/api/profile/avatar/uploads`、`/api/profile/avatar/uploads/complete`、`/api/profile/avatar/read-url`、`/api/profile/avatar/delete`；首页头像水合在 self-host 模式下通过自建头像 read-url 获取签名 URL，不再直连 Supabase avatar bucket。
- 前端 self-host 模式已接入初步留言：`useCoupleData` 从 `/api/messages` 读取留言，`messageService` 在 self-host 模式下通过 `apps/app/lib/selfHost/messageApi.ts` 发送和软删留言；站内通知与 Push delivery 入队由自建后端处理，发送 worker 失败不能阻塞留言。
- 前端已接入快捷互动：`useQuickInteractions` 通过 `apps/app/lib/selfHost/interactionApi.ts` 调用 `/api/interactions/quick`，后端校验 active couple、active partner 和双方 block 后只写低敏伴侣通知。
- 前端 self-host 模式已接入初步今日胶囊和心情状态：`useCoupleData` 从 `/api/checkins` 与 `/api/mood-status` 读取，`TodayStoryPage` 通过 `apps/app/lib/selfHost/checkinApi.ts` 保存胶囊与 mood，`MemoryPage` 的今日胶囊删除在 self-host 模式下走 `/api/checkins/delete` 软删。
- 前端 self-host 模式已接入初步日历事件/纪念日：`useCoupleData` 从 `/api/calendar-events` 读取，`AddEventPage` 通过 `apps/app/lib/selfHost/calendarApi.ts` 创建事件，`MemoryPage` 的日历事件删除在 self-host 模式下走 `/api/calendar-events/delete` 软删；云宠记忆动作在 self-host 模式下暂时 no-op，等云宠 API 迁完再打开。
- 前端 self-host 模式已接入初步足迹数据：`useCoupleData` 从 `/api/footprints` 读取，`MemoryPage` 的足迹删除在 self-host 模式下走 `/api/footprints/delete` 软删；家园足迹编辑器在 self-host 模式下只做足迹本身和低敏 creation action，足迹奖励仍未迁完，不要在前端自行发放粮食/星糖。
- 自建足迹坐标更新必须保持成对语义：创建时经纬度要么同时提供要么同时为空；更新时可只传一个坐标字段，但服务端必须用现有行补齐后校验，不能把未传字段当作清空导致合法局部编辑失败。
- 前端 self-host 模式已接入初步信件/胶囊信：`useCoupleData` 从 `/api/letters` 读取，`WriteLetterPage` 通过 `apps/app/lib/selfHost/letterApi.ts` 创建信件，`LetterInboxPage` 走 `/api/letters/read`、`/api/letters/dismiss`、`/api/letters/delete`，`MemoryPage` 的信件删除也走自建 delete；通知提醒与 Push delivery 入队由自建后端处理，云宠送信动作等云宠 API 落地后再接。
- 前端 self-host 模式已接入初步站内通知：`useCoupleData` 从 `/api/notifications` 读取并用 `/api/notifications/stream` SSE 做低敏实时刷新触发，90 秒轮询仍作为兜底；首页通知弹窗和设置页站内通知通过 `apps/app/lib/selfHost/notificationApi.ts` 调用 `/api/notifications/read`、`/api/notifications/dismiss`；系统推送发送由自建 Push worker 处理，前端仍保留站内通知兜底。
- 前端 self-host 模式已接入初步推送偏好和 Web Push 订阅登记：通知设置页通过 `apps/app/lib/selfHost/pushApi.ts` 读写 `/api/notification-preferences`，`apps/app/lib/notifications/webPush.ts` 在 self-host 模式下通过 `/api/push-tokens/web` 与 `/api/push-tokens/disable` 登记/禁用浏览器订阅；API 只返回推送 token 计数，不回显 endpoint、p256dh 或 auth。
- 前端 self-host 模式已接入原生 Expo Push token 登记/禁用：`apps/app/lib/notifications/push.ts` 在 self-host 模式下通过 `/api/push-tokens/expo` 与 `/api/push-tokens/disable` 登记/禁用 iOS/Android Expo token，`AuthProvider` 会传当前 self-host access token；API 响应不回显原始 token。
- 前端 self-host 模式已接入初步隐私/反馈/关系解除：设置页通过 `apps/app/lib/selfHost/privacyApi.ts` 调用 `/api/feedback`、`/api/reports`、`/api/privacy/block-partner`、`/api/privacy/account-deletion`，首页和关系设置的解除关系走 `/api/couples/active/end`；账号注销请求会撤销当前 refresh sessions、禁用 push token、标记账号 disabled，并结束 active couple。
- 前端 self-host 模式下个人页设置子页（个人资料、情侣资料、云宠设置、通知设置、隐私设置、关系设置、反馈、关于）已迁移完成；`HomeScreen` 不应再用旧的 self-host 子页 allowlist 把这些 `SettingPage` 拦回首页，设置详情页也应保留底部导航，避免用户失去主导航出口。
- 未迁完的完整云宠玩法不能偷偷调用 Supabase；已迁的投喂、摸摸/清洁/陪玩/睡眠结算、商店买粮、今日娱乐奖励和召回必须走自建 API，未迁的 AI、自主漫游、宠物记忆置顶/归档应保持禁用或 no-op。
- `apps/app/scripts/smoke-self-host-media.mjs` 验证前端 self-host 相册约定：register、pair invite、signed upload、complete、list、read URL、delete；受 Codex 沙箱 DNS 限制时需要外网权限执行。
- `apps/app/scripts/smoke-self-host-messages.mjs` 与 `apps/server/scripts/smoke-messages.mjs` 验证自建留言：创建、伴侣读取、第三人隔离、非发送者删除 forbidden、发送者软删；受 Codex 沙箱 DNS 限制时需要外网权限执行。
- `apps/app/scripts/smoke-self-host-interactions.mjs` 与 `apps/server/scripts/smoke-interactions.mjs` 验证自建快捷互动：创建伴侣通知、伴侣读取、第三人 forbidden 和空 label 拒绝；受 Codex 沙箱 DNS 限制时需要外网权限执行。
- `apps/app/scripts/smoke-self-host-dashboard.mjs` 与 `apps/server/scripts/smoke-dashboard.mjs` 验证自建首页 dashboard 聚合：无情侣关系时返回 profile + 空数据，绑定后返回成员、留言、胶囊、事件等聚合数据；受 Codex 沙箱 DNS 限制时需要外网权限执行。
- `apps/app/scripts/smoke-self-host-checkins.mjs` 与 `apps/server/scripts/smoke-checkins.mjs` 验证自建今日胶囊：同日 upsert、mood upsert、伴侣读取、第三人隔离、非作者删除 forbidden、作者软删；受 Codex 沙箱 DNS 限制时需要外网权限执行。
- `apps/app/scripts/smoke-self-host-calendar-events.mjs` 与 `apps/server/scripts/smoke-calendar-events.mjs` 验证自建日历事件：创建、伴侣读取、第三人隔离、低敏站内通知、伴侣更新和软删；受 Codex 沙箱 DNS 限制时需要外网权限执行。
- `apps/app/scripts/smoke-self-host-footprints.mjs` 与 `apps/server/scripts/smoke-footprints.mjs` 验证自建足迹：坐标成对校验、创建、伴侣读取、第三人隔离、作者更新、非作者 forbidden、作者软删；受 Codex 沙箱 DNS 限制时需要外网权限执行。
- `apps/server/scripts/smoke-creation.mjs` 验证自建家园/云宠数据层：无情侣关系返回空、active couple 成员可 ensure/read creation space、第三人 forbidden、creation action/pet memory 可写可读、投喂/清洁/睡眠/买粮/奖励/召回规则可用、今日挑战奖励同情侣同题同日只能领取一次，并进入 dashboard；受 Codex 沙箱 DNS 限制时需要外网权限执行。
- `apps/app/scripts/smoke-self-host-creation.mjs` 验证前端 self-host 家园安全子集契约：绑定情侣、ensure creation space、创建足迹、记录 creation action、投喂/陪玩/奖励/召回，并确认 dashboard 返回 creation space、footprints 和 creation actions；受 Codex 沙箱 DNS 限制时需要外网权限执行。
- `apps/app/scripts/smoke-self-host-letters.mjs` 与 `apps/server/scripts/smoke-letters.mjs` 验证自建信件：创建、锁定预览不泄正文、到期可读、已读、关闭、第三人隔离、作者删除；受 Codex 沙箱 DNS 限制时需要外网权限执行。
- `apps/app/scripts/smoke-self-host-notifications.mjs` 与 `apps/server/scripts/smoke-notifications.mjs` 验证自建站内通知：业务写入自动创建低敏伴侣通知、SSE 事件触发、第三人隔离、标记已读和关闭；受 Codex 沙箱 DNS 限制时需要外网权限执行。后端 SSE smoke 在公网 HTTPS 下会让写入请求走独立 socket，避免 Node fetch 长连接复用导致测试请求排队。
- `apps/app/scripts/smoke-self-host-push-notifications.mjs` 与 `apps/server/scripts/smoke-push-notifications.mjs` 验证自建推送偏好/订阅/队列/worker：默认偏好、偏好更新、Web Push 订阅登记不回显密钥、禁用 token、推送关闭时保留站内通知、推送开启时写入投递候选，并等待 worker 处理 delivery；受 Codex 沙箱 DNS 限制时需要外网权限执行。
- `apps/app/scripts/smoke-self-host-expo-push.mjs` 验证自建原生 Expo Push token 契约：登记、API 不回显原始 token、禁用后 active Expo token 计数归零；受 Codex 沙箱 DNS 限制时需要外网权限执行。
- `apps/app/scripts/smoke-self-host-privacy.mjs` 与 `apps/server/scripts/smoke-privacy.mjs` 验证自建隐私/反馈：反馈提交、举报当前伴侣、第三人举报 forbidden、解除关系后不能写旧 couple、拉黑并解除关系、注销请求撤销会话；受 Codex 沙箱 DNS 限制时需要外网权限执行。
- 自建服务器迁移第一阶段走旁路 staging，不切生产；空服务器优先 Docker Compose + API 内置轻量 Auth，Keycloak 作为后续可选增强。
- 自建 staging 基建模板位于 `infra/self-host/staging/`，远端部署目录为 `/opt/tongpin`；模板不含真实 secrets，服务器 `.env` 不要提交或写进聊天。
- 自建 staging 执行前先看 `docs/self-host-staging-preflight.md` 和 `infra/self-host/staging/RUNBOOK.md`；服务器重启自恢复验证、真实自建 API 替换和生产切换都要单独确认。
- 自建 staging DB migration 放在 `apps/server/db/migrations/`，打包部署时同步到 `infra/self-host/staging/runtime/db/migrations/`；服务器脚本会记录 `public.self_host_schema_migrations` 并在需要时自动使用 `sudo docker compose`。`infra/self-host/staging/compose.yml` 已把 `runtime/api/scripts` 只读挂载到 API 容器 `/app/scripts`，可在容器内运行 smoke/自检脚本。
- 旧 Supabase 数据迁移源变量必须从服务器 `/opt/tongpin/.env` 注入 API 容器；`infra/self-host/staging/compose.yml` 的 `api.environment` 显式传入 `SUPABASE_DB_URL` 与 `SUPABASE_STORAGE_S3_*`。如果只修改宿主机 `.env`，需重建 API 容器（服务器 `/opt/tongpin` 下执行 `sudo docker compose up -d --force-recreate api`）后 `run-supabase-migration.sh` 才能在容器内看到新值。
- 自建 staging 运维巡检脚本为 `/opt/tongpin/scripts/monitor-staging.sh`，模板位于 `infra/self-host/staging/scripts/monitor-staging.sh`；检查 Docker 服务/health、local API、Postgres、Redis、public API deep health + `requestId`、Web auth 路由、assets endpoint、磁盘使用率、Postgres dump 和可恢复 MinIO 数据归档备份新鲜度，并运行 `audit:self-host-integrity` 检查自建目标库完整性；MinIO 对象清单只作为辅助库存检查。默认磁盘阈值 85%，备份新鲜度 30 小时，可用 `MONITOR_DISK_WARN_PERCENT`、`MONITOR_BACKUP_MAX_AGE_HOURS` 覆盖；非零退出表示 staging 发布前需要处理。
- 自建 staging 定时巡检通过 `/opt/tongpin/scripts/install-monitor-cron.sh` 安装，服务器已写入 `/etc/cron.d/tongpin-staging-monitor`，默认每 5 分钟运行并追加日志到 `/opt/tongpin/logs/monitor-staging.log`；cron 服务已验证为 active。巡检支持可选 `MONITOR_WEBHOOK_URL` 失败告警和 `MONITOR_ALERT_ON_SUCCESS=true` 测试成功告警，真实 webhook URL 只能写在服务器 `.env`，不要提交或写进聊天。服务器已验证正常路径 `SUMMARY checks=20 warnings=0 status=ok`，模拟磁盘阈值失败路径会明确 `alert skipped=webhook_not_configured`。
- 自建 staging 备份脚本 `backup-postgres.sh`、`backup-minio-list.sh` 和 `healthcheck.sh` 已加固 Docker 权限检测：普通用户无法访问 Docker socket 时自动走 `sudo docker compose`。服务器普通用户已验证可创建新 Postgres dump、MinIO object-list，并使 `monitor-staging.sh` 检查全绿。
- 自建 staging 备份入口为 `/opt/tongpin/scripts/backup-all.sh`，会生成 Postgres dump、可恢复 MinIO `/data` 归档和 MinIO 对象清单；MinIO 归档脚本使用 `docker cp` 从容器复制 `/data` 后在主机压缩，清理 root-owned 临时文件时会回退到 `sudo rm -rf`。服务器已安装 `/etc/cron.d/tongpin-staging-backup`，默认每天 `03:17` 执行并写入 `/opt/tongpin/logs/backup-staging.log`；最新巡检已验证 `SUMMARY checks=20 warnings=0 status=ok`。
- 自建 staging 恢复演练脚本为 `/opt/tongpin/scripts/verify-backups-restore.sh`，模板位于 `infra/self-host/staging/scripts/verify-backups-restore.sh`；它会检查最新新鲜 Postgres dump，导入临时库，验证 30 张关键表，删除临时库，再校验最新 MinIO 归档可读且包含 MinIO 元数据/业务桶信息。服务器已安装 `/etc/cron.d/tongpin-staging-restore-verify`，默认每周日 `04:17` 运行并写入 `/opt/tongpin/logs/restore-verify-staging.log`；手动演练已验证 `SUMMARY restore_verify status=ok`。
- 腾讯云轻量服务器已配置 Docker registry mirror：`https://mirror.ccs.tencentyun.com`；回滚脚本在 `infra/self-host/staging/scripts/rollback-docker-mirror.sh`。
- `/opt/tongpin` staging 栈已启动并通过本机健康检查：API `/health`、PostgreSQL `pg_isready`、Redis `PONG`；PostgreSQL dump、MinIO 数据归档与 MinIO 对象清单备份演练已通过；服务器 MinIO 对象清单脚本已改为 `ls -1R`，0 字节演练残留已清理；临时 `codex-tongpin-staging` SSH 公钥标记和上传临时包已清理。
- 远端 `/opt/tongpin` 的 `api` 容器已从旧 health placeholder 更新为 `apps/server` 初始 API 骨架的 staging runtime 副本，公网 `https://api-staging.fancah.tech/api/health` 返回 `status: ok`，`https://api-staging.fancah.tech/api/health/deep` 会检查 Postgres、Redis、MinIO TCP 连通性，未认证 `https://api-staging.fancah.tech/api/me` 返回 `401 auth_required`；每次更新前需备份到 `/opt/tongpin/backups/api-staging-<timestamp>/`。
- 自建 staging API 已接入初步 Auth：`/api/auth/register`、`/api/auth/login`、`/api/auth/email/verify/request`、`/api/auth/email/verify/confirm`、`/api/auth/password/reset/request`、`/api/auth/password/reset/confirm`、`/api/auth/refresh`、`/api/auth/logout`、`/api/auth/logout-all`、`/api/auth/sessions`、`/api/auth/sessions/revoke`、认证态 `/api/me`；密码使用 Argon2id，refresh token 只存哈希并支持轮换，旧 refresh token 复用会封禁同一 token family，密码重置会撤销 active refresh sessions，用户可查看脱敏 active sessions 并撤销指定非当前设备 session。Access JWT 支持 HS256 key ring：默认兼容 `AUTH_ACCESS_TOKEN_SECRET`，生产轮换可配置 `AUTH_ACCESS_TOKEN_KEYS=kid:secret,...` 和 `AUTH_ACCESS_TOKEN_CURRENT_KID`，新 token 使用 current kid 签发，验证接受 key ring 内旧 kid，移除旧 kid 后旧 token 会被拒绝。公网 `API_BASE_URL=https://api-staging.fancah.tech npm run smoke:auth -w @tongpin/server` 已验证 register/email verification/login/jwt kid/me/refresh/reuse revocation/password reset/session revocation/session list/session revoke；容器内 `node scripts/check-token-keyring.mjs` 已验证 current kid、旧 key 可验、移除旧 key 后拒绝。
- 自建 Auth 已在 staging 配置 Resend 真实邮件投递：服务器 `/opt/tongpin/.env` 使用 `EMAIL_PROVIDER=resend`、`EMAIL_FROM=noreply@fanch.tech`、`AUTH_EMAIL_DELIVERY_CONFIGURED=true`，验证/重置链接指向 `https://tongpin.fancah.tech/auth/verify-email` 和 `https://tongpin.fancah.tech/auth/reset-password`；Resend API key 只存在服务器 `.env`，不要写入仓库或聊天。配置生效后验证/重置请求不应再返回 `debugToken`；容器内 `node scripts/check-email-service.mjs` 已验证未配置跳过、Resend payload 和幂等 key。
- 忘记密码流程按产品要求直接提示未注册邮箱：`/api/auth/password/reset/request` 对不存在或已禁用账号返回 `404 account_not_found`，前端不得显示“已发送重置邮件”或进入设置新密码页；密码重置成功后必须明确提示用户使用新密码重新登录。
- staging Auth secrets 只存在服务器 `/opt/tongpin/.env`，不要写入仓库或聊天；真实邮件服务是否可达需结合 Resend 发送日志或真实收件测试确认。
- staging 数据库已应用 `001_self_host_core.sql`，包含 `app_auth` 账号/session/token 表、`profiles`、`couples`、`couple_members`、`pair_invites`、`accept_pair_invite(...)` 事务函数，以及 `couple_members_one_active_couple_per_user_idx` active couple 唯一约束；这只是自建 Auth/关系数据底座，不代表生产 Auth 已迁出 Supabase。
- 自建 staging API 已接入个人资料和头像 Storage：`/api/profile` 支持读取和更新昵称、生日，`/api/couples/active/dates` 支持更新 active couple 的恋爱开始日期；头像使用独立 MinIO bucket `profile-avatars`，上传先写 `profile_avatar_uploads` pending 记录，再发原图/缩略图 PUT 签名 URL，完成时服务端 HEAD 校验 MIME/size 后更新 `profiles.avatar_storage_path` / `profiles.avatar_thumbnail_storage_path` 并清理旧对象，读取 URL 允许本人或 active partner，删除会清空 profile path 并删除对象。
- 自建 staging API 已接入初步 Storage/MinIO：`/api/media/uploads`、`/api/media/uploads/complete`、`/api/media`、`/api/media/read-url`、`/api/media/delete`；上传先写 `media_files` pending 记录，再发 MinIO PUT 签名 URL，完成时服务端 HEAD 校验 MIME/size 后标记 ready，读取 URL 要求 active couple 成员，删除会软删 DB 并删除 MinIO 对象。公网 `API_BASE_URL=https://api-staging.fancah.tech npm run smoke:storage -w @tongpin/server` 已验证大小/MIME 拦截、签名上传、伴侣读取、第三人 forbidden 和删除同步。
- staging 数据库已应用 `002_self_host_media.sql` 与 `003_relax_media_uuid_path_checks.sql`，包含 `media_files`、active couple member 辅助函数、上传状态约束、缩略图 path 字段、MIME/大小/路径约束和 updated_at trigger。
- staging 数据库已应用 `004_self_host_messages.sql`，包含 `messages` 表、couple/sender 外键、正文长度约束、软删字段、按 couple/sender 的未删索引和 updated_at trigger；自建 API 暴露 `/api/messages` 与 `/api/messages/delete`。
- staging 数据库已应用 `005_self_host_checkins.sql`，包含 `checkins` 与 `mood_status` 表、同一用户同一情侣空间同日只允许一条未删除胶囊的唯一约束、mood 的 `couple_id + user_id` 唯一约束、软删字段、长度约束和 updated_at trigger；自建 API 暴露 `/api/checkins`、`/api/checkins/delete` 和 `/api/mood-status`。
- staging 数据库已应用 `006_self_host_letters.sql`，包含 `future_letters` 表、作者/收信人外键、标题/正文长度约束、未到期正文隐藏、已读/关闭/软删字段和 updated_at trigger；自建 API 暴露 `/api/letters`、`/api/letters/read`、`/api/letters/dismiss` 和 `/api/letters/delete`。
- staging 数据库已应用 `007_self_host_notifications.sql`，包含 `notifications` 表、用户/情侣空间索引、低敏标题/正文长度约束、已读/关闭字段；自建 API 暴露 `/api/notifications`、`/api/notifications/read`、`/api/notifications/dismiss` 和低敏 `/api/notifications/stream` SSE，留言、今日胶囊和信件创建后会尝试写伴侣站内通知，通知失败不得回滚主业务。SSE 只推 `notificationId` / `createdAt` 触发前端刷新，不推送留言、信件、照片或位置正文。
- staging 数据库已应用 `008_self_host_calendar_events.sql`，包含 `calendar_events` 表、couple/creator 外键、标题/备注长度约束、类型约束、软删字段和 updated_at trigger；自建 API 暴露 `/api/calendar-events`、`/api/calendar-events/update` 和 `/api/calendar-events/delete`，勾选提醒时会尝试写低敏伴侣站内通知，通知失败不得回滚主业务。
- staging 数据库已应用 `009_self_host_footprints.sql`，包含 `couple_footprints` 表、couple/creator 外键、标题/备注长度约束、坐标范围与成对约束、软删字段和 updated_at trigger；自建 API 暴露 `/api/footprints`、`/api/footprints/update` 和 `/api/footprints/delete`，更新/删除只允许足迹创建者操作。
- staging 数据库已应用 `010_self_host_push_notifications.sql`，包含 `notification_preferences`、`push_tokens`、`push_deliveries`，支持 Expo/Web Push token 记录、偏好开关、免打扰和投递队列候选；自建 API 暴露 `/api/notification-preferences`、`/api/push-tokens/web`、`/api/push-tokens/expo`、`/api/push-tokens/disable` 和低敏 `/api/push-deliveries/summary`。
- staging 数据库已应用 `011_self_host_push_worker.sql`，为 `push_deliveries` 增加 `next_attempt_at`、`claimed_at`、`claimed_by` 和 claim 索引；`infra/self-host/staging` 的 `worker` 容器已替换为 `apps/server/src/pushWorker.mjs`，支持 claim、stale requeue、Expo/Web Push 发送、无效 token 禁用和结果回写。Web Push 真正发送需要服务器 `.env` 配置 `WEB_PUSH_VAPID_PUBLIC_KEY` / `WEB_PUSH_VAPID_PRIVATE_KEY`；未配置时 Web Push delivery 会失败/重试但不会泄露订阅密钥。
- staging 数据库已应用 `012_self_host_profile_avatars.sql`，包含 `profile_avatar_uploads`、用户前缀 path 约束、上传状态约束、头像/缩略图 MIME 与大小约束；自建 API 暴露头像上传、完成、读取签名 URL 和删除接口。公网 `API_BASE_URL=https://api-staging.fancah.tech npm run smoke:profile -w @tongpin/server` 与 `API_BASE_URL=https://api-staging.fancah.tech npm run smoke:self-host-profile -w apps/app` 已验证头像权限与删除同步。
- staging 数据库已应用 `013_self_host_privacy_feedback.sql`，包含 `reports`、`blocks`、`account_deletion_requests`、`app_feedback`、`profiles.account_status` 和 `profiles.deletion_requested_at`；自建 API 暴露反馈、举报、解除关系、拉黑并解除关系和注销请求接口。公网 `API_BASE_URL=https://api-staging.fancah.tech npm run smoke:privacy -w @tongpin/server` 与 `API_BASE_URL=https://api-staging.fancah.tech npm run smoke:self-host-privacy -w apps/app` 已验证隐私/反馈权限与注销会话撤销。
- staging 数据库已应用 `014_self_host_creation_pet.sql`，包含 `creation_spaces`、`creation_actions`、`pet_memories` 的最小自建数据层、active couple 权限边界、字段约束和索引；自建 API 暴露 `/api/creation/space`、`/api/creation/actions`、`/api/creation/pet-memories`，并把 creation space/actions/pet memories 接入 `/api/me/dashboard`。这只是低敏家园/云宠数据骨架，不代表完整云宠 AI 或 Realtime 已迁完。公网 `API_BASE_URL=https://api-staging.fancah.tech npm run smoke:creation -w @tongpin/server` 已验证。
- staging 数据库已应用 `015_self_host_creation_game_rewards.sql`，包含 `creation_game_reward_claims`，约束同一 `couple_id + puzzle_id + reward_date` 只能领取一次；自建 API 已暴露 `/api/creation/pet/feed`、`/api/creation/pet/interact`、`/api/creation/pet/sleep/settle`、`/api/creation/pet/food/buy`、`/api/creation/game/reward` 和 `/api/creation/pet/summon`，所有规则更新在事务中锁定 `creation_spaces` 行。公网 `API_BASE_URL=https://api-staging.fancah.tech npm run smoke:creation -w @tongpin/server` 与 `API_BASE_URL=https://api-staging.fancah.tech npm run smoke:self-host-creation -w apps/app` 已验证。
- 自建 staging API 已接入快捷互动 `/api/interactions/quick`，不需要新增数据库 migration；接口复用 `notifications`、`blocks`、active couple membership 和 Push delivery 入队逻辑。公网 `API_BASE_URL=https://api-staging.fancah.tech npm run smoke:interactions -w @tongpin/server` 与 `API_BASE_URL=https://api-staging.fancah.tech npm run smoke:self-host-interactions -w apps/app` 已验证。
- 自建 staging API 已接入首页聚合 `/api/me/dashboard`；接口复用已迁业务 service 权限校验，聚合 profile、active couple members、messages、media、checkins、mood、letters、notifications、calendar events、footprints、creation space、creation actions 和 pet memories。公网 `API_BASE_URL=https://api-staging.fancah.tech npm run smoke:dashboard -w @tongpin/server` 与 `API_BASE_URL=https://api-staging.fancah.tech npm run smoke:self-host-dashboard -w apps/app` 已验证。
- `fancah.tech` 已完成 ICP 备案；DNSPod 为当前权威解析，`tongpin.fancah.tech`、`api-staging.fancah.tech`、`assets-staging.fancah.tech` 均以 A 记录指向腾讯云轻量服务器 `81.71.9.118`。
- 腾讯云轻量防火墙已开放 `HTTPS (443)`；Caddy 已为 `tongpin.fancah.tech`、`api-staging.fancah.tech`、`assets-staging.fancah.tech` 获取 Let's Encrypt 证书，公网 HTTPS 可直接访问，不再按未备案拦截处理。
- Caddy 对 `api-staging.fancah.tech` 的 `/api/notifications/stream` 有单独 `handle`，不启用 `encode` 并设置 `flush_interval -1`；普通 API 仍走 gzip/zstd。修改 Caddyfile 后必须先 `caddy validate --config /etc/caddy/Caddyfile` 再 reload。
- 自建 Web 静态前端已通过 Caddy 挂载 `/opt/tongpin/web/current` 对外服务；当前用户指定的前端子域名是 `https://tongpin.fancah.tech`，不要使用 `app.fancah.tech`。
- 自建 Web 静态前端发布到 `/opt/tongpin/web/current` 时，不要通过移动/替换整个 `current` 目录发布，因为 Caddy bind mount 可能继续读旧目录 inode；应备份后清空 `current` 内容并在同一目录解包，或重建 Caddy 容器重新挂载。打包时用 `COPYFILE_DISABLE=1 tar --no-xattrs ...`，避免上传 macOS `._*` 资源叉文件。
- 自建 Web 静态前端发布应使用 self-host 构建环境：`EXPO_PUBLIC_SELF_HOST_API_URL=https://api-staging.fancah.tech npm run build:web`。`/auth/verify-email?token=...` 与 `/auth/reset-password?token=...` 已发布到 `https://tongpin.fancah.tech` 并验证返回 HTTP 200；发布前后备份放在服务器 `/opt/tongpin/backups/web-current-<timestamp>-*/`。
- Vercel 项目：`yeyuancc0-glitchs-projects/tongpin-heartbeat` 仅作为旧 Vercel 生成域名的兜底跳转发布渠道；用户入口、邮件链接、PWA、推送授权和验收都直接使用 `https://tongpin.fancah.tech`。旧自定义域名 `https://app.fanch.tech` 不再作为发布、验证、跳转或对外入口；2026-06-25 `vercel inspect` 仍显示它挂在 Vercel alias 上，后续若清理域名需在 Vercel 项目中再次确认并移除。
- Vercel Production 环境变量只保留 self-host 前端 public env：`EXPO_PUBLIC_SELF_HOST_API_URL=https://api-staging.fancah.tech` 和 Web Push VAPID public key；不要恢复 `EXPO_PUBLIC_SUPABASE_URL` / `EXPO_PUBLIC_SUPABASE_ANON_KEY`，否则 `npm run check:env` 会阻止构建。
- Vercel 生成域名 `https://tongpin-heartbeat.vercel.app/...` 可保留为兜底永久跳转到 `https://tongpin.fancah.tech/...`；不要再绑定或依赖 `https://app.fanch.tech`。
- 旧 Supabase 用户数据切流优先用服务器 `/opt/tongpin/scripts/run-supabase-migration.sh` 编排：默认只跑 preflight + dry-run，不写目标库；`--apply` 才按 preflight、dry-run、backup、DB apply、Storage copy、final verify、post-migration smoke 顺序真实写入和验收。拆开执行时必须先跑 `migrate:supabase:preflight`，再跑 `apps/server/scripts/migrate-supabase-data.mjs`：dry-run、`--apply --include-storage`、`--verify-only --include-storage --copy-storage`、`--verify-only --include-storage --verify-storage` 四步都要成功，最后还要跑 Auth/Profile/Storage/Messages/Dashboard/Notifications/Privacy 冒烟；`--skip-smoke` 只允许同一 API 构建刚跑过等价冒烟且保留日志。preflight 只检查配置、连通性、关键表和 Storage bucket，不替代真正迁移/对账，输出不得包含 secret。脚本会保留 Supabase `profiles.id` 作为 self-host `app_auth.accounts.id` / `profiles.id`，从 `auth.users` 保留邮箱，旧密码不迁移，用户通过 self-host 密码重置激活。dry-run 的 DB verify gate 是 `preview-only`，目标库尚未导入时 mismatch warning 正常；生产切流只能以最终 verify 的 `status=ok` 作为完整性证据。脚本可用 `SELF_HOST_DB_URL` 或服务器现有 `POSTGRES_*` 自动连接目标库，但必须显式提供 `SUPABASE_DB_URL` 源库连接；Storage 复制必须显式提供 Supabase Storage S3 凭证并同 bucket/path 写入 MinIO。缺少源库 URL 时已验证会安全失败。`migration-artifacts/supabase-to-self-host/latest-report.json`、`storage-objects.json` 和服务器迁移日志属于切流证据但不要提交。
- 旧 Supabase 媒体迁移必须兼容历史缩略图路径 `couple_id/user_id/thumbs/object_id.webp` 与当前自建新路径 `couple_id/user_id/object_id-thumb.webp`；不要把 `thumbs/` 子目录判定为异常路径或迁移时改名，否则 Storage 对象哈希对账会失真。
- 旧 Supabase `pet_memories.importance` 使用 0..100 权重尺度；自建约束必须允许 0..100 并原样迁移，不要压缩成 0..10，避免丢失历史 AI/宠物记忆排序语义。
- 旧 Supabase 数据重复 apply 时，迁移脚本会在目标事务内临时关闭目标表的 `set_updated_at` trigger 并在写完后恢复，用于保留历史 `updated_at` 并保证哈希对账；不要在业务 API 路径复用这种 trigger 绕过逻辑。
- 旧 Supabase 数据最终 verify 通过后，应从服务器当前 `/opt/tongpin/.env` 和 API 容器环境移除 `SUPABASE_DB_URL` 与 `SUPABASE_STORAGE_S3_*` 源凭证并重建 API 容器；迁移报告、备份和自建 Postgres/MinIO 数据保留，运行态不应继续携带旧 Supabase 源连接。
- Web Push 和 PWA 安装是按 origin 隔离的；旧域名安装的桌面图标/通知订阅不能自动迁到新域名，用户需要从 `https://tongpin.fancah.tech` 重新授权通知或重新添加 PWA。
- 用户明确说“推送更新 / 发布 / 部署 / 上线”时，按生产发布处理：`npx vercel --prod -y`；否则不要部署。

## 依赖与维护

- App 工作区 TypeScript 固定使用 `^5.9.2`；不要升到 TypeScript 6，除非已验证 Expo/RN 类型兼容。
- 当前 React Native JSX 类型检查使用 `@types/react@^19.2.15` 可通过；Expo 建议版本可能触发 RN JSX 类型错误。
- 根 `package.json` 的 `overrides.xcode.uuid = 11.1.1` 和 `pixi-live2d-display` 相关 overrides 不要移除，除非已完成同等回归。
- 大文件重构按小步拆分：`homeStyles.ts`、`HomeScreen.tsx`、`CreationSpacePage.tsx`、`AppUI.tsx` 每次只迁移一个明确边界，并跑 typecheck/build/浏览器验收。
- `components/app-ui/AppUI.tsx` 保留通用组件实现，样式集中在 `AppUI.styles.ts`；新增通用组件样式优先写入样式文件，不要把大型 `StyleSheet.create` 块重新放回组件文件。

## 已知坑点

- 不要提交 `.env`、`node_modules/`、`apps/app/.expo/`、`apps/app/dist/`、`.playwright-cli/` 和 `.vercel/`。
- Storage RLS policy 不要直接把对象路径片段 cast 成 `uuid`；对象名可能异常，应优先文本比较或 join 已验证业务记录。
- `couple-media` 上传对象路径第一段是 `couple_id`；Storage insert policy 以当前用户是否为 active couple 成员为准。
- 自建 staging 里的 historical UUID 不一定满足版本位 `[1-5]`，服务端 UUID 预检应使用标准 8-4-4-4-12 十六进制格式，再交给 Postgres uuid / 权限函数二次约束；不要把 UUID 版本位误当业务校验。
- 当前 Node `v24.15.0` 下 `expo start --web` 可能报 `ERR_SOCKET_BAD_PORT`；`npm run build:web` 可正常导出后静态预览。
- 如果静态预览空白，先检查 `dist/index.html` 引用的入口 JS 是否存在且非 0 字节，再查控制台和 `useCoupleData` 首屏查询。
- 用户可见日期键使用 `apps/app/lib/dates/date.ts` 的 `todayIsoDate`、`localIsoDate` 或 `localDateKey`；不要用 `new Date().toISOString().slice(0, 10)` 处理本地日期。

## 更新规则

每次完成任务前判断是否发现长期有效的项目事实。只有已验证、未来会复用、不含敏感信息的信息才写入；不要写当前任务进度、临时调试过程、完整日志、聊天记录、未确认猜测或任何密码、token、API key、私钥、cookie、session、数据库连接串。
