# AGENTS.md

## 项目概览

同频跳动是情侣双人正式版应用，当前以 Expo Web 线上版本为主，同时保留 Expo / React Native 代码复用到 iOS 和 Android 的路径。核心功能包括注册登录、情侣绑定、首页、今日胶囊、留言、记忆、信件、相册、通知/推送、家园、足迹、今日娱乐和 Live2D 云宠。

## 常用命令

- 安装依赖：`npm install`
- 启动 Web：`npm run web`
- 类型检查：`npm run typecheck`
- Web 构建：`npm run build:web`
- 环境变量检查：`npm run check:env`
- 完整验证：`npm run verify`
- 数据库 migration：`npm run db:apply`
- 静态预览：`cd apps/app && ruby -run -e httpd dist -p 4173`
- Supabase CLI 直连若超时，可先 `npx --yes supabase login`、`npx --yes supabase link --project-ref lrwzvxcuchfkchtkqdfs`，再按顺序执行 `npx --yes supabase db query --linked --file <migration.sql>`。

## 目录结构

- `apps/app`：Expo Router 应用，Web / iOS / Android 共用。
- `apps/app/features`：按业务域拆分页面和服务；首页 shell 在 `features/home/HomeScreen.tsx`。
- `apps/app/components/app-ui`：跨页面 App UI 组件，`BottomTabBar.tsx` 从 `AppUI.tsx` re-export。
- `apps/app/lib`：Supabase、通知、日期、平台封装和产品常量。
- `apps/app/motion`：统一动效、触感、图片淡入和动画基础设施。
- `packages/db`：Supabase schema、migration、RLS policy、测试 SQL。
- `packages/shared`：跨端共享类型和常量，workspace 包名为 `@tongpin/shared`。
- `supabase/functions`：Supabase Edge Functions。

## 开发规则

- 业务用户表命名为 `profiles`，不要创建 `public.users`；前端资料编辑只能更新昵称、头像 path / 缩略图 path、生日和 `updated_at`。
- 一个用户同一时间只能拥有一个 active couple；情侣关系必须通过 `pair_invites` 接受事务创建，不要在创建邀请时提前创建空 `couples`。
- 邀请码创建走 `create_pair_invite(invite_expires_at)` RPC；查询 `pair_invites` 时只取当前用户创建或接受的记录。
- 所有情侣业务数据必须带 `couple_id`，权限边界以 active couple member 为准；不要只靠前端隐藏按钮做数据权限。
- 信件产品文案统一叫“信件 / 胶囊信”，底层复用 `future_letters`；创建走 `create_future_letter(...)`，删除走 `delete_letter(letter_id)`。
- 伴侣侧普通业务通知走 `create_partner_notification(...)` RPC；系统推送正文只放低敏摘要，不复述留言、信件、胶囊、照片或精确位置内容。
- 留言发送、通知和删除统一走 `apps/app/features/messages/messageService.ts`；通知/推送失败不能回滚或阻塞留言本身。
- 今日胶囊删除必须软删 `checkins.deleted_at`，不要从前端 hard delete。
- 反馈入口必须通过 `submit_feedback(feedback_body, target_couple_id, feedback_metadata)` RPC 写入 `app_feedback`。
- 认证恢复、账号切换和首页初次加载期间不能渲染 mock / 测试用户数据；加载态应显示无个人信息的首页骨架，并按 `userId` 隔离缓存。
- 运行时产品文案和选项常量放在 `apps/app/lib/constants/appContent.ts`；不要把真实界面常量放回 mock 文件。

## 前端与体验

- 当前 UI 视觉语言为“情绪胶囊风”：奶油白 / 浅粉白背景、纯白卡片、柔和蔷薇粉主色，辅以雾紫、奶黄和浅蓝灰。
- “胶囊”是品牌符号，优先使用自定义 `CapsuleMark` 或同风格插画资源，不要用 `💊` emoji 代表品牌胶囊。
- 破坏性确认类弹窗优先使用平台/手机系统风格，例如原生 `Alert.alert` 或等价系统确认；不要新增自绘确认框，除非用户明确要求。
- Web 纵向滚动必须保留 App 式边界回弹和顶部下拉刷新；不要把 `html, body` 的 `overscroll-behavior-y` 设为 `none`。
- `AppScroll` 的滚轮/触控板惯性回弹只使用浏览器 / RN Web 原生滚动；JS `rubberBand` 只用于真实触控下拉刷新。
- Web 端不要禁用系统缩放；`+html.tsx` viewport 保留 `initial-scale=1` 和 `viewport-fit=cover`。
- iOS Safari 底部导航要兼容地址栏收缩和回弹，但不要跟随 `visualViewport` / 键盘高度移动。
- 触感反馈使用 `expo-haptics` 经 `apps/app/motion/haptics.ts` 封装；Web 或不支持设备必须静默降级。
- Web portal 统一通过 `apps/app/lib/platform/portal` 调用；跨端组件不要顶层直接导入 `react-dom`。

## 首页、相册与记忆

- 当前首页结构：此刻同频卡片内合并快捷心情投递；相册卡片位于此刻同频下方；留言板在首页一级界面直接提供输入框；首页不展示最近纪念日和今日胶囊卡片。
- `HomeScreen.tsx` 只作为首页数据编排和路由 shell；主屏、今日胶囊、记忆页、家园、信件、设置、留言和相册放在对应 feature 目录，不要再把新业务整块堆回 HomeScreen。
- 首页登录恢复骨架在 `features/home/HomeScreenShell.tsx`，`HomeScreen.tsx` 继续 re-export 以兼容旧导入；不要把这类静态骨架 UI 重新堆回主 shell。
- 首页 dashboard 数据辅助逻辑已拆到 `homeDashboardTypes.ts`、`homeDashboardSelects.ts`、`homeDashboardCache.ts`、`homeDashboardUtils.ts`、`homeAvatarHydration.ts`、`homeMediaHydration.ts` 和 `homeNotificationRefresh.ts`；云宠路由/仪式 helper 在 `homePetWorldHelpers.ts`。后续维护优先复用这些模块，不要把缓存、水合或云宠仪式逻辑堆回 `useCoupleData.ts` / `HomeScreen.tsx`。
- 首页 dashboard 加载分阶段：首屏只阻塞 profiles 与 active couple 基础信息；留言、相册、心情、信件、通知和图片 signed URL 后台补齐。
- 首页后台刷新应静默运行；兜底刷新保持温和频率，通知轮询 90 秒，全量 dashboard 兜底刷新 120 秒且仅页面可见时运行。
- 首页本地缓存只保存低敏骨架数据；不要持久化留言、通知、胶囊、信件、足迹、宠物记忆、caption、signed URL、AI 气泡或 world decision 正文。头像和相册只缓存 Storage path，刷新后后台重新签名。
- 头像和相册使用 Supabase private Storage；数据库只保存 Storage path，前端展示时生成 signed URL，不能把 signed URL 写回数据库。
- 头像与相册缩略图使用独立 Storage path：`profiles.avatar_thumbnail_url`、`media_files.thumbnail_storage_path`；列表/九宫格/记忆流优先展示缩略图，点开预览才按需读取原图。
- 旧头像缺少 `avatar_thumbnail_url` 时，小尺寸头像只能使用 Storage transform / 本地缩略图 blob 兜底，不要回退到原图 signed URL。
- 用户只需选择一次图片；前端负责自动上传原图和缩略图。缩略图失败时不要写入缩略图 path；数据库保存失败要清理本次上传对象。
- `apps/app/lib/supabase/storage.ts` 生成的 transformed image `blob:` URL 必须在替换或过期时 revoke。
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
- iPhone 网页推送要求 iOS 16.4+，且用户先将网站添加到主屏幕，再从主屏幕图标打开并授权。
- Web 构建时不要让 `expo export` 直接解析原生推送依赖；平台拆分逻辑用于绕开 `expo-application` / `expo-device` / `expo-notifications`。
- `send-push-notifications` 只接受 service role key 或 `PUSH_DELIVERY_WORKER_SECRET`；前端客户端不要直接调用该函数。
- 需要推送的是对方新留言、快捷互动、今日胶囊和胶囊信；默认不推送自己触发的通知、删除/已读/设置变更、普通日历事件、喂养类事件、相册上传和历史快捷互动留言。
- 快捷互动通知标题需兼容 `TA 投递了一点心情` 和 `TA 向你投递了一点心情`；不要只用单一标题判断快捷互动提醒。
- 通知点击统一经 `apps/app/lib/notifications/openEvents*` 广播到页面；Web Service Worker 点击已有窗口时要 postMessage `tongpin:notification-open`，并 focus / navigate 到目标 URL。
- 用户当前没有 Apple Developer Program 账号；在用户准备好前，不推进 iOS 原生 APNs 推送上线。

## 测试与验证

- 前端或共享包修改后至少运行 `npm run typecheck` 和 `npm run build:web`。
- 权限、RLS、RPC、Storage policy、推送队列或数据删除语义变更后，执行 `packages/db/tests/rls_acceptance.sql` 的验收场景。
- 没有配置 Supabase 环境变量时，Web 构建会输出缺少 `EXPO_PUBLIC_SUPABASE_URL` / `EXPO_PUBLIC_SUPABASE_ANON_KEY` 的预期提示。
- `npm run build:web` 会执行 `expo export --platform web --clear && node ../../scripts/prepare-web-dist.mjs`；后处理脚本必须校验 HTML 引用的入口资源和 `/assets/assets/...` 资源存在且非空。
- 浏览器验收：启动静态预览后打开 `http://localhost:<port>`，检查首页内容、底部导航、相册预览和控制台 error/warn。
- 大重构或清理类改动应保持严格未使用检查通过：`npm run typecheck -w apps/app -- --noUnusedLocals --noUnusedParameters --pretty false`。

## 代码生成与自动产物

- `apps/app/.expo/` 和 `apps/app/dist/` 是 Expo 生成产物，不应手动维护。
- `.playwright-cli/` 是浏览器验收临时缓存，不应提交。
- 应用图标源文件：`apps/app/assets/icon.png`；Web favicon：`apps/app/assets/favicon.png`；iOS 主屏图标和 PWA manifest 资源位于 `apps/app/public/`。
- 首页互动图标位于 `apps/app/assets/interaction-icons/`；快捷互动透明 PNG 位于 `apps/app/assets/quick-interaction-icons/`；家园插画位于 `apps/app/assets/creation-town/`。

## Migration 与部署

- Supabase migration 放在 `packages/db/migrations`，RLS policy 放在 `packages/db/policies`，按文件名顺序执行。
- 数据库表默认启用 RLS；RLS policy 之外还必须给 `authenticated` 角色显式表级 `grant`。
- 事务性绑定逻辑使用 Postgres RPC，不允许前端直接创建 `couples` 和 `couple_members`。
- 恋爱开始日期由 `accept_pair_invite(invite_code, relationship_started_at)` 和 `update_active_couple_dates(relationship_started_at)` 处理。
- Web 正式版使用 Expo Web 静态导出；Vercel 构建命令为 `npm run build:web`，输出目录为 `apps/app/dist`。
- Supabase 配置通过 `EXPO_PUBLIC_SUPABASE_URL` 和 `EXPO_PUBLIC_SUPABASE_ANON_KEY` 注入。
- Vercel 项目：`yeyuancc0-glitchs-projects/tongpin-heartbeat`；生产地址：`https://tongpin-heartbeat.vercel.app`；自定义应用域名：`https://app.fanch.tech`。
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
- 当前 Node `v24.15.0` 下 `expo start --web` 可能报 `ERR_SOCKET_BAD_PORT`；`npm run build:web` 可正常导出后静态预览。
- 如果静态预览空白，先检查 `dist/index.html` 引用的入口 JS 是否存在且非 0 字节，再查控制台和 `useCoupleData` 首屏查询。
- 用户可见日期键使用 `apps/app/lib/dates/date.ts` 的 `todayIsoDate`、`localIsoDate` 或 `localDateKey`；不要用 `new Date().toISOString().slice(0, 10)` 处理本地日期。

## 更新规则

每次完成任务前判断是否发现长期有效的项目事实。只有已验证、未来会复用、不含敏感信息的信息才写入；不要写当前任务进度、临时调试过程、完整日志、聊天记录、未确认猜测或任何密码、token、API key、私钥、cookie、session、数据库连接串。
