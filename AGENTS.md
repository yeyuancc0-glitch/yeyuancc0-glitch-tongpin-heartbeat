# AGENTS.md

## 项目概览

情侣双人应用，先用 Expo Web 验证 V0.1B MVP，后续复用 Expo / React Native 代码上架 iOS 和 Android。

## 常用命令

- 安装依赖：`npm install`
- 启动 Web：`npm run web`
- 静态预览：`cd apps/app && ruby -run -e httpd dist -p 4173`
- 类型检查：`npm run typecheck`
- Web 构建：`npm run build:web`
- 环境变量检查：`npm run check:env`
- 应用数据库 migration：`npm run db:apply`
- 当前网络下 Supabase CLI `db push` 直连 `db.<project>.supabase.co:5432` 可能超时；已验证可用替代路径：先 `npx --yes supabase login`、`npx --yes supabase link --project-ref lrwzvxcuchfkchtkqdfs`，再用 `npx --yes supabase db query --linked --file <migration.sql>` 按文件顺序执行。
- 完整本地验证：`npm run verify`
- 浏览器验收：启动 Web 后用 Playwright 打开 `http://localhost:<port>`，截图可保存在 `output/playwright/`。

## 目录结构

- `apps/app`：Expo Router 应用，Web / iOS / Android 共用。
- `packages/db`：Supabase schema、RLS policy、测试 SQL。
- `packages/shared`：跨端共享类型和常量。
- `supabase/functions`：后续 Supabase Edge Functions。
- `docs`：产品、合规和开发文档。

## 开发规则

- V0.1A 只做注册登录、profiles、邀请码绑定、情侣首页、恋爱天数/纪念日倒计时、今日分享、留言板、基础日历和 RLS。
- 不在 V0.1A 引入 Next.js、原生推送、相册、未来信、AI、订阅支付、完整审核后台。
- V0.1B 加入头像、图片相册、信件、站内通知、情绪状态增强、基础删除、举报、拉黑和账号注销申请。
- V0.1B 的信件产品文案统一叫“信件 / 胶囊信”，底层仍复用 `future_letters`；即时信使用当前时间作为 `unlock_at`，未来信使用指定送达时间。
- 信件删除必须走 `delete_letter(letter_id)` RPC：发信人删除为全局软删，收信人删除为对自己隐藏；不要从前端直接 update `future_letters.deleted_at`。
- 对方收到 letter 通知时，首页应弹出独立绘制的居中来信弹窗，引导“打开来信”，不要只依赖通知设置里的普通通知行。
- V0.1B 不做 AI、支付、复杂审核后台、视频相册和账号物理删除自动化；系统消息推送已作为例外接入。
- 手机系统推送：原生 iOS / Android 使用 Expo Notifications；网页版使用标准 Web Push（Service Worker + Push API + VAPID），不能依靠 `expo-notifications` 在浏览器页面关闭时收到 Expo Push。需要推送的是对方新留言、快捷互动、今日胶囊和胶囊信，默认不推送自己触发的通知、删除/已读/设置变更、普通日历事件、喂养类事件、相册上传和历史 `投递了「...」` 留言。
- Web Push 订阅使用 `push_tokens.provider = 'web_push'`，endpoint 存 `token`，密钥存 `web_p256dh` / `web_auth`；前端 Service Worker 位于 `apps/app/public/sw.js`。iPhone 网页推送要求 iOS 16.4+ 且用户先将网站添加到主屏幕，再从主屏幕图标打开并授权。
- Web 端构建时不要直接让 `expo export` 解析原生推送依赖；`apps/app/lib/notifications/webPush.ts` 这类平台拆分逻辑用于让网页产物绕开 `expo-application` / `expo-device` / `expo-notifications`。
- 用户当前没有 Apple Developer Program 账号；在用户准备好 Apple 开发者账号前，不继续承诺或推进 iOS 原生 APNs 推送上线。等账号准备好后，再配置 EAS credentials / APNs、打真机包并验证 iPhone 后台系统推送。
- 业务用户表命名为 `profiles`，不要创建 `public.users`。
- 情侣关系必须通过 `pair_invites` 接受事务创建，不要在创建邀请时提前创建空 `couples`。
- 一个用户同一时间只能拥有一个 active couple。
- 所有情侣业务数据必须带 `couple_id`，权限边界以 active couple member 为准。
- 认证恢复、账号切换和首页数据初次加载期间不能渲染 mock / 测试用户数据；恢复登录态时不要闪登录页、白屏或“正在加载你的空间”文案，应显示无个人信息的首页骨架并按当前 `userId` 隔离缓存、静默加载。

## 测试与验证

- 数据库表默认启用 RLS。
- 完成权限相关修改后，执行 `packages/db/tests/rls_acceptance.sql` 中的验收场景。
- V0.1B 产品验收标准在 `docs/product/v01b-acceptance.md`。
- 前端修改后至少运行 `npm run typecheck` 和 `npm run build:web`。
- 没有配置 Supabase 环境变量时，Web 构建会输出缺少 `EXPO_PUBLIC_SUPABASE_URL` / `EXPO_PUBLIC_SUPABASE_ANON_KEY` 的预期提示。
- 云端联调前必须先创建 `apps/app/.env` 并填入真实 Supabase URL 和 anon key，否则 `npm run check:env` 会失败。

## 代码生成与自动产物

- `apps/app/.expo/` 和 `apps/app/dist/` 是 Expo 生成产物，不应手动维护。
- `.playwright-cli/` 是浏览器验收临时缓存，不应提交。
- 应用图标源文件位于 `apps/app/assets/icon.png`，Web favicon 源文件位于 `apps/app/assets/favicon.png`，均由 `apps/app/app.json` 引用。
- iOS Safari 添加到主屏幕使用 `apps/app/public/apple-touch-icon.png`，PWA manifest 与 192/512 图标位于 `apps/app/public/`，由 `apps/app/app/+html.tsx` 引用。
- 首页互动和日历小事使用内置卡通图标，资源位于 `apps/app/assets/interaction-icons/`。
- `apps/app/assets/interaction-icons/` 中的卡通小图标需要保持正方形画布，避免在正方形 UI 槽位中被裁切后出现错位。
- 首页快捷互动使用绘图工具生成的透明 PNG，资源位于 `apps/app/assets/quick-interaction-icons/`；保持正方形透明画布，避免白色贴纸边、投影和大面积外框。
- 登录/注册首屏主插画位于 `apps/app/assets/auth-hero.png`，由 `apps/app/features/auth/AuthScreen.tsx` 引用。
- 日历 tab 当前对外呈现为“记忆”时间线界面，仍复用 `calendar_events`、分享和留言数据；右下角悬浮按钮进入添加事件流程。
- 当前 UI 视觉语言为“情绪胶囊风”：奶油白 / 浅粉白背景、纯白卡片、柔和蔷薇粉主色，辅助色可使用雾紫、奶黄和浅蓝灰；胶囊化控件与“胶囊 / 封存 / 投递 / 记忆”文案体系应保持一致。
- “胶囊”是品牌符号，优先使用半粉半奶油色的自定义 `CapsuleMark` 或同风格插画资源，不要再用 `💊` emoji 代表品牌胶囊。
- 全局动效基础层位于 `apps/app/motion/`，通过 `MotionProvider`、`BouncyPressable`、`BreathingSkeleton`、`CrossFadeImage`、`MotionLayer`、`useErrorShake` 统一弹簧、骨架、图片淡入、投递飞行和错误抖动；根布局需保留 `GestureHandlerRootView` 与 `MotionProvider`。
- Web 端纵向滚动必须保留 App 式边界回弹和顶部下拉刷新；不要把 `html, body` 的 `overscroll-behavior-y` 设为 `none`，下拉刷新入口统一通过 `AppScroll` / `useAppPullToRefresh` 维护。
- `AppScroll` 的 Web 顶部/底部滚轮和触控板惯性回弹只使用浏览器 / RN Web 原生滚动；JS `rubberBand` 只用于真实触控下拉刷新，并按 `requestAnimationFrame` 合并位移更新，不要给滚轮 overscroll 写 `translateY` 或堆叠 release timer，避免快速拉到边界卡顿。
- 触感反馈使用 `expo-haptics` 经 `apps/app/motion/haptics.ts` 封装；Web 或不支持设备必须静默降级，不能让触感失败阻塞交互。
- 头像和相册使用 Supabase private Storage；数据库只保存 Storage path，前端展示时生成 signed URL，不能把 signed URL 写回数据库。
- 头像与相册缩略图使用独立 Storage path：`profiles.avatar_thumbnail_url`、`media_files.thumbnail_storage_path`；列表/九宫格/记忆流优先展示缩略图，点开预览必须按需读取 `storage_path` 原图。Storage RLS 读取策略必须同时关联原图 path 与缩略图 path，不能上传无业务记录可关联的孤立缩略图。
- 首页本地 dashboard / localStorage 缓存不要持久化 `avatar_signed_url` 或相册 `signedUrl`；只缓存 Storage path，刷新后后台重新签名，避免头像更新、对象删除或 URL 过期后继续显示失效链接。
- 首页相册 signed URL 水合时只有非空且 path 匹配的 `signedUrl` 才能复用；缓存中被清空的 `signedUrl: null` 必须重新签名，否则拍立得时光墙会一直停在骨架图。
- 首页快捷心情投递必须写入双方共享数据；当前实现复用 `messages` 表保存“投递了「...」”，不能只做本地 toast 假反馈。
- 首页快捷互动不再写入 `messages` 留言表；只创建 `notifications` 站内弹窗，用户点“知道了”后标记已读并消失。历史 `messages.body` 形如 `投递了「...」` 的数据应从留言板、日历和记忆展示中过滤。
- 首页快捷互动通知通过 `send_quick_interaction(target_couple_id, interaction_label)` RPC 创建，避免前端直接向对方 `user_id` 插入 `notifications` 触发 RLS 失败。
- 首页快捷互动只创建站内通知和系统推送，不写入留言；推送标题使用“TA 向你投递了一点心情”，正文只放互动短句。
- 首页快捷互动最多 10 个，自定义项先用 Web localStorage 保存；按钮需随数量增加自动换行并保持小图标不裁切。
- 首页“此刻同频”快捷互动总数最多 8 个，最后一张固定作为自定义互动入口，不要把自定义项插到中间。
- 首页自定义快捷互动必须使用页内输入/编辑 UI，不要使用 `window.prompt`；内置浏览器中原生 prompt 可能表现为点击无反馈。
- 首页后台刷新应静默运行，不展示“后台同步 / 正在同步”类状态提示；用户只需要看到实际内容变化。
- 首页首屏不能等待头像或相册 signed URL 全部生成后才渲染；刷新或重新打开时应优先恢复/展示已缓存的当前用户 dashboard，再后台补齐图片签名 URL。
- 首页 dashboard 加载必须分阶段：首屏只阻塞 profiles 与 active couple 基础信息；留言、相册、心情、信件、通知和图片 signed URL 在后台补齐；无 active couple 时才查询 pending pair_invites。
- 当前首页结构：此刻同频卡片内合并快捷心情投递；相册卡片位于此刻同频下方；留言板在首页一级界面直接提供输入框；首页不展示最近纪念日和今日胶囊卡片。
- 首页“写情书 / 写一封信”入口必须融合在恋爱天数主卡内部，位于开始日期下方，作为首屏可见入口；来信页可保留回复/空状态入口，但不能作为唯一入口。
- 首页“家园”入口使用右下角悬浮圆形按钮，样式参考记忆页添加事件入口；不要改成首页大卡片或新增底部 tab；底层仍复用 `creation_*` 命名。
- 家园首版是首页子页，标题只保留“家园”，包含云宠小窝、我们的足迹和今日娱乐；双人小游戏在玩法确定前只保留入口，不创建房间、对局或积分等表。
- 家园 Hub 是不可纵向滚动的中转入口页，内容需在首屏内完成入口呈现。
- 云宠分步实施路线保存在根目录 `PLAN.md`；第一版只保证 Expo Web 的云宠体验，不做静态 PNG / 轻动画降级，原生 iOS / Android 稳定验证前不开放云宠。
- 云宠模型源文件来自根目录 `LittleCat_Model/`，Web 静态运行资源放在 `apps/app/public/live2d/little-cat/`；Cubism Core 本地文件放在 `apps/app/public/live2d/core/live2dcubismcore.min.js`，不要依赖运行时 CDN。
- Live2D Web 渲染使用 `pixi.js`、`pixi-live2d-display/cubism4` 和 `live2dcubismcore`；`Live2DCanvas` 必须先加载本地 Cubism Core，再用同步 `require("pixi.js")` / `require("pixi-live2d-display/cubism4")` 初始化并设置 `window.PIXI`。不要改回运行时动态 `import()`，Expo Web 静态导出会把 Pixi/Cubism4 拆成异步 chunk，可能导致 `Requiring unknown module` 后模型不加载。
- 云宠自定义动作文件位于 `apps/app/public/live2d/little-cat/motions/`，源模型目录同步在 `LittleCat_Model/LittleCat_vts/motions/`；`LittleCat.model3.json` 注册 `Walk` / `Pet` / `Sleep` / `Eat` / `Clean` / `Play` / `Happy` / `Sad` motion groups。运行时 `Live2DCanvas` 先尝试 action motion，再保留参数驱动兜底；当前模型只有整体手臂参数（如 `ParamArms`），没有独立左右爪 rig。
- 云宠睡觉动作要与气泡生命周期分离：哄睡后气泡可消失，但云宠应保持 `sleep` / `lie-down`，直到用户再次摸摸、喂食、清洁或陪玩；不要把 sleep 当成 2-3 秒临时反应后自动回 idle。
- Live2D 云宠投喂精力恢复数值固定在数据库 RPC：`feed_creation_pet(..., 'basic')` 精力 +14、`feed_creation_pet(..., 'premium')` 精力 +24。哄睡不再立即加满精力，而是写入共享睡眠开始时间 `creation_spaces.pet_sleep_started_at`，被摸摸、清洁、陪玩或投喂打断时按已睡时长结算：少于 30 秒 +0、30 秒到 2 分钟 +6、2 到 5 分钟 +12、5 分钟以上 +18。
- 云宠睡觉期间眼睛必须全程闭合，不要让 sleep motion 循环开头或眨眼逻辑重新睁眼；闭眼只能走模型自身参数/rig，不要强加贴图、遮罩或覆盖层，避免头部旋转/缩放时错位。`Live2DCanvas` 需在 `beforeModelUpdate` 阶段最终写入睡眠眼睛参数，防止被 SDK 的 motion/眨眼/pose 更新覆盖；小窝/全局 overlay 的云宠本体周围不能带单独浅色框、白底或径向光底。
- 云宠小窝主舞台布局必须按模型 `getLocalBounds()` 包围盒显式对齐，不要只依赖 anchor；同一房间页避免同时挂多个 LittleCat canvas，防止主舞台 ready 但视觉透明或不可见。
- Step 4-7 阶段 Live2D 云宠已接入首页全局层、`pet_world_surface` 页面位置分离、分享页送信场景和记忆页看照片/记忆场景；不要恢复旧 3D `PetWorldCanvas` / 全局 3D 漫游层。
- Live2D 云宠位置以 `creation_spaces.pet_world_surface` 为准；用户当前页面和宠物真实页面必须分离，宠物不在当前主 tab 时只显示轻量状态，不自动切换用户页面。
- 云宠本体全局只能出现一个；`pet_world_surface` 是 `pet_room` 时本体只在小窝显示，不要再映射成首页全局本体。云宠在外面时小窝是空的，只显示显式召回入口；召回后首页不应再保留第二只云宠。
- 云宠在 `home` / `pet_room` / `creation_hub` 时视为“在家”，不要显示旧式“宠物不在当前页”的浮动离开提示；共创空间内云宠本体必须只在 `pet_world_surface` 对应的真实子页显示，避免 Hub、小窝、足迹页同时出现多个本体。
- Live2D Step 0-7 不把 `footprints` / `playground` 作为云宠本体位置；这两个共创子页只保留足迹和小游戏功能，旧 `pet_world_surface` 值必须归一到 `pet_room`。
- Live2D 云宠离开当前主 tab 时的轻量状态可以提供“回小窝”显式召回，召回使用 `summon_creation_pet(couple_id, 'pet_room')`，不能通过进入页面或 `mark_pet_surface_seen` 偷偷改变真实位置。
- 云宠可以按真实 `pet_world_surface` 到处跑；进入小窝时不能自动把它改回 `pet_room`。如果云宠不在小窝，小窝舞台应显示用户可点击的“召回云宠”入口，点击后才调用 `summon_creation_pet(couple_id, 'pet_room')`。
- 云宠小窝不要放单独的“抚摸 / 摸摸”操作按钮；用户直接点击云宠本体即为摸摸或唤醒。底部操作区只保留清洁、陪玩、哄睡、粮仓/投喂等明确动作。
- Live2D 送信、照片和记忆事件只允许写入低敏 world decision（如 `target_surface`、`intent`、`animation`、`prop` 和短句），不要把信件正文、留言正文、胶囊正文、照片内容、caption 或精确坐标放入宠物上下文。
- `pet-ai-brain` 的 `world.target_surface` 白名单只允许 `home` / `share` / `memory` / `creation_hub` / `pet_room`；不要再让 AI 输出 `footprints` / `playground`。
- `pet-ai-brain` 的 Step 8 输出是云宠表现导演协议，不是聊天助手：`world` 必须包含 `target_surface`、`intent`、`animation`、`expression`、`symbol`、`sound_cue`、`speech`、`prop`、`state_delta` 和 `memory_policy`；表达分两套，平时、自主漫游、送信、看照片、页面切换、伴侣事件和同步只用动作/拟声/符号/道具，`speech` / `bubble` 只能是“喵”“喵呜”“呼噜”“咕噜”“...”等动物表达；只有用户主动摸摸、喂食、清洁、陪玩、哄睡、拖动、找到/召回或点宠物记忆/道具时，才允许 2-8 字短人话，如“摸头，舒服”“饭饭”“干净啦”“再追一下”“困困”“找到啦”。不要输出完整人话、关系建议、催促或隐私正文复述。
- 云宠说话气泡需根据文字长度自适应展开；“喵”等短句使用小气泡，不要固定撑成大卡片。
- Step 9 云宠记忆只允许低敏白名单事项：第一次领养、第一次命名、第一次送信、纪念日事件、最近常去记忆页、常摸摸或常喂食；禁止保存留言正文、信件正文、胶囊正文、照片内容、caption 和精确坐标。写入统一走 `memory_policy` / `insert_pet_memory_if_allowed` 的阈值、去重和 7 天短期过期规则；用户删除记忆走 `archive_pet_memory(memory_id)`，取消核心记忆走 `toggle_pet_memory_core(memory_id, false)`。
- Step 10 云宠自主漫游规则优先、AI 辅助：普通页面切换、刷新、连续摸摸、连续喂食、清洁、休息、饥饿和久未互动走 `apps/app/features/pet-world/logic/petWorldRules.ts` / `usePetWorldRoaming` 规则落库；来信、新照片、今日胶囊、纪念日、两人同时在线和第一次事件走 `applyPetRitualDecision`，先检查 `pet_ai_generations` 当日非 fallback 次数，超额或 AI 失败必须回退规则 decision。
- Step 10 不能因为自主漫游自动切换用户页面，不能用 `mark_pet_surface_seen` 移动真实位置；只允许通过 `apply_pet_world_decision` / `summon_creation_pet` 明确更新 `pet_world_surface`。默认 `PET_AI_DAILY_LIMIT` 为 12 次/情侣/天，高频互动不得直接消耗 AI。
- Step 10 首页全局云宠可视层会把真实 `pet_room` / `creation_hub` 映射为首页可显示状态；真实位置仍以 `creation_spaces.pet_world_surface` 为准，不要因为首页可见而改写成 `home`。
- Step 10 自主漫游必须能被用户实际观察到：首刷没有 `pet_last_surface_changed_at` 时可规则投递首页探头；空闲检查当前为 2 分钟，满足能量/舒适度后约 8 分钟可从小窝游走。
- Step 10 云宠在 `home` / `share` / `memory` 外部可见页面之间切换时，可由 page-change 规则即时投递到当前页；从小窝 `pet_room` 出门仍保留约 8 分钟门槛。饥饿回窝判断必须结合 `fullness`，不要只因 `last_fed_at` 时间久就把饱腹值仍正常的云宠锁回小窝。
- Step 10 云宠刚打开应用时可触发一次会话级随机刷新，使用 `app_open` 规则和本地随机种子，候选只限低敏外部可见页面与小窝状态；同一浏览器会话、同一情侣只触发一次，不消耗 AI 额度，不自动切用户页面。
- 首页全局云宠必须在页面内克制地走动到不同锚点，移动期间使用 `walk` 动作，不要用瞬移/闪动，也不要高频大幅跳动；气泡只在新事件或到达新锚点时短暂出现，约 2.8 秒后自动消失，不能常驻；Web 可视层必须挂到 `data-app-scroll-content` 滚动内容容器并使用内容层相对坐标，不要再用 body 级 fixed 层把宠物钉在视口上。云宠允许轻微遮挡页面内容，不需要过度避让到边缘；用户可通过长按/拖动把云宠移开。
- 云宠在 `home` / `share` / `memory` 外部可见页面可以原地休息或打盹；外部打盹也必须写入 `pet_sleep_started_at` 并复用同一套按时长恢复精力规则，休息/睡眠状态下不能继续自动换锚点或被移动状态覆盖成 `walk`。夜间自动睡眠仍以小窝正式睡眠逻辑为准。
- Step 11 云宠用户设置位于 `apps/app/features/pet/userPetSettings.ts`，Web 端按 `pet-user-settings:<userId|anonymous>` 存入 localStorage；显示/隐藏、声音、自主漫游、大小、减少动画和重置位置只影响当前登录用户与当前设备，不改写情侣共享的 `creation_spaces` 状态。
- Step 12 云宠模型预留配置位于 `apps/app/features/pet/live2dCatalog.ts`；当前只注册 `little_cat`，`activeLive2DPet` 是模型路径、动作、表情、声音 cue、默认体型和偏好页面的统一来源，不要在组件里重新硬编码云宠配置。
- 共创空间页面本地状态不要被较旧的父级缓存直接覆盖，必须优先保留 `updated_at` 更新更晚的共享状态。
- 家园视觉插画资源位于 `apps/app/assets/creation-town/`；`cloud-cabin.png`、`footprints.png`、`playground.png` 和 `cabin-interior.png` 用于家园 Hub、足迹页、今日娱乐页和小屋背景。
- 足迹页对外标题为“我们的足迹”；新增/编辑足迹使用居中弹窗，只填写地点名、日期和备注，不在页面暴露纬度/经度；足迹记录使用 `couple_footprints`，允许坐标为空，且可沉淀到记忆页“日常”。
- 今日娱乐页只保留今日挑战主体，不展示顶部奖励资产条或额外口粮说明卡。
- 云宠小窝顶部不展示情侣头像关系卡、云宠档案或小屋设置；小屋日志最多展示 3 条有意义的低敏记忆，过滤“喵 / 咕噜 / 呼噜”等短反应。
- 分享页今日胶囊以 `checkins` 写入成功作为封存成功标准；`mood_status` 与 `notifications` 属于附属同步，失败时不能阻塞封存按钮或底部导航交互。
- 今日胶囊图片不新增独立表字段，仍上传到 `couple-media` 并写入 `media_files`，caption 使用 `今日胶囊图片:<checkin_id>` 绑定到对应 `checkins`；这类图片也必须自动进入拍立得时光墙。
- 分享页今日胶囊采用触感化视觉：精致小尺寸情绪糖果、折角心情便签、柔和呼吸胶囊预览；预览提示文案为“把今天存起来吧”，标题仍叫“今日胶囊”，不要使用“情感封存魔盒”作为界面标题；图片计数只显示如 `0/3 张`，不展示“会同步到拍立得时光墙”。
- 首页相册缩略图必须可点开全屏查看，查看层使用居中预览卡片而不是系统原生弹窗。
- 分享页“今天的心情”固定选项为“开心 / 难过 / 想你 / 委屈”，不展示“甜蜜 / 平静”。
- 记忆页筛选分类固定为“全部 / 日常 / 留言 / 纪念日 / 信件”，不展示“想你”分类；想你类今日胶囊仍归入“日常”。
- 记忆页时间线采用“彩色回忆风铃”视觉：奶油气泡筛选器、蔷薇到雾紫渐变轨道、微缩胶囊节点、按分类异构的糖果色记忆卡；卡片内角标和图标需保持移动端小尺寸。
- Web 底部导航必须是固定导航栏：`BottomTabBar` 的 Web bottom offset 使用 `max(6px, calc(env(safe-area-inset-bottom) - 26px))` 抵消 iPhone 网页安全区过度抬升，同时让导航比屏幕底部略高一点；不要再用 `visualViewport` / 键盘高度动态抬升，否则顶部回弹或输入聚焦会让底栏上下跳动。
- 相册和记忆卡片图片上传当前最多 10 张；首页相册卡片使用九宫格预览前 9 张，超过 9 张显示 `+N` 并提供“查看全部”入口，完整预览层支持全量浏览与单张删除。

## Migration 与数据变更

- Supabase migration 放在 `packages/db/migrations`。
- V0.1B 新增 schema 放在 `packages/db/migrations/004_v01b_schema.sql`。
- 共创空间 schema 放在 `packages/db/migrations/008_v02_creation_space.sql`。
- 共创空间足迹/解谜反哺生态 RPC 放在 `packages/db/migrations/018_creation_reward_ecosystem.sql`。
- 当前 Supabase 项目 `lrwzvxcuchfkchtkqdfs` 已应用 `018_creation_reward_ecosystem.sql`，并确认 `claim_creation_footprint_reward(uuid, uuid)` 与 `claim_creation_game_reward(uuid, text, boolean)` 存在。
- 云宠 surface 约束与旧值归一化放在 `packages/db/migrations/026_live2d_pet_surface_scope.sql`；当前 Supabase 项目 `lrwzvxcuchfkchtkqdfs` 已应用，`creation_spaces_normalize_pet_world_surface` 触发器会把旧 `footprints` / `playground` 写入归一为 `pet_room`。
- Live2D 云宠计划验收权限加固放在 `packages/db/migrations/028_pet_plan_security_hardening.sql`；当前 Supabase 项目 `lrwzvxcuchfkchtkqdfs` 已应用。计划相关云宠 RPC 不允许 `anon` 执行，内部记忆写入函数不开放给前端角色，`pets` / `pet_events` 兼容视图使用 `security_invoker=true` 且 `anon` 不可读。
- Live2D 云宠投喂恢复基础数值放在 `packages/db/migrations/029_pet_energy_recovery_tuning.sql`；睡眠按时长结算规则放在 `packages/db/migrations/030_pet_sleep_duration_recovery.sql`；夜间自动睡眠/天亮醒来放在 `packages/db/migrations/031_pet_night_auto_sleep.sql`。当前 Supabase 项目 `lrwzvxcuchfkchtkqdfs` 已应用，哄睡开始不立即加精力，打断或满 5 分钟结算时才恢复 `creation_spaces.energy`；23:00-07:00 自动睡眠要在小窝真实睡下，07:00 后自动结算醒来，清空 `pet_sleep_started_at` 后再恢复自主漫游。
- 云宠外部打盹恢复精力逻辑放在 `packages/db/migrations/033_pet_outside_sleep_recovery.sql`；当前 Supabase 项目 `lrwzvxcuchfkchtkqdfs` 已应用。`start_creation_pet_sleep(target_couple_id, 'outside_rest', sleep_surface)` 允许 `home` / `share` / `memory` 原地睡眠并复用同一套按时长恢复精力规则，`refresh_creation_pet_sleep` 必须保留睡眠所在 surface，不要刷新回 `pet_room`。
- 头像/相册缩略图字段与 Storage RLS 扩展放在 `packages/db/migrations/032_media_thumbnail_paths.sql`；当前 Supabase 项目 `lrwzvxcuchfkchtkqdfs` 已应用并验证 `profiles.avatar_thumbnail_url`、`media_files.thumbnail_storage_path` 存在，新上传头像与相册会保存 WebP 缩略图 path。
- 当前 Supabase 项目 `lrwzvxcuchfkchtkqdfs` 已按顺序应用 `001_v01a_schema.sql` 到 `004_v01b_schema.sql`，并验证 V0.1B 表、RPC、private bucket 和 RLS 存在。
- RLS policy 放在 `packages/db/policies`。
- 事务性绑定逻辑使用 Postgres RPC，不允许前端直接创建 `couples` 和 `couple_members`。
- `packages/db/migrations/001_v01a_schema.sql` 设计为可重复执行，trigger 和 policy 会先 drop 再 create。
- 恋爱开始日期由 `accept_pair_invite(invite_code, relationship_started_at)` 和 `update_active_couple_dates(relationship_started_at)` 处理；云端未执行最新 SQL 时，前端会回退旧绑定但不能保存自定义日期。

## 部署与环境

- Web MVP 使用 Expo Web。
- Supabase 配置通过 `EXPO_PUBLIC_SUPABASE_URL` 和 `EXPO_PUBLIC_SUPABASE_ANON_KEY` 注入。
- Vercel 项目：`yeyuancc0-glitchs-projects/tongpin-heartbeat`。
- Vercel 生产地址：`https://tongpin-heartbeat.vercel.app`。
- 自定义应用域名：`https://app.fanch.tech`，绑定到 Vercel 项目 `tongpin-heartbeat`。
- Vercel 项目已通过 `.vercel/project.json` 绑定到 `tongpin-heartbeat`，不要重新 `vercel link`，除非确认项目绑定损坏。
- `fanch.tech` DNS 托管在 Cloudflare；`app.fanch.tech` 使用 DNS-only A 记录指向 Vercel `76.76.21.21`。
- `fanch.tech` 和 `www.fanch.tech` 不再作为 `tongpin-heartbeat` 的 Vercel alias；不要把该应用直接部署到根域名。
- Vercel 构建配置在根目录 `vercel.json`，构建命令为 `npm run build:web`，输出目录为 `apps/app/dist`。
- Vercel 的 Production、Preview、Development 环境都需要配置 `EXPO_PUBLIC_SUPABASE_URL` 和 `EXPO_PUBLIC_SUPABASE_ANON_KEY`。
- 推送更新到线上时，先运行 `npm run typecheck` 和 `npm run build:web`；普通 UI 更新无需跑数据库验收。
- 推送功能上线前除前端构建外，还需要应用 `packages/db/migrations/011_push_notifications.sql`、`012_web_push_subscriptions.sql`、`022_push_delivery_scheduler.sql`、`023_push_service_role_grants.sql` 和 `025_push_immediate_delivery.sql`，部署 Supabase Edge Function `send-push-notifications --no-verify-jwt`，配置 Web Push VAPID secrets，并在 `push_delivery_settings` 写入项目 URL 与 `PUSH_DELIVERY_WORKER_SECRET`。当前 Supabase 项目没有 `vault` extension，不能依赖 Vault 存 worker 调用密钥。推送延迟修复依赖 `push_deliveries_immediate_flush` 在新队列写入后立即通过 `pg_net` 调用发送函数，`push-delivery-worker` 的 30 秒 cron 只作为兜底；不要退回只靠 cron 轮询。`send-push-notifications` 的 Web Push TTL / Expo ttl 当前为入队后 5 分钟内的剩余有效期并使用高优先级，超过 5 分钟的队列直接 `skipped`，Web Service Worker 也会按 `expiresAt` 丢弃过期通知，避免设备离线或浏览器滞留后把旧消息隔天展示；不要再把 TTL 设回 2 小时或 24 小时。原生移动端还需要真实 EAS projectId，并用 EAS credentials 配好 iOS APNs / Android FCM。移动端真机包至少登录打开过一次才能注册 Expo Push Token；Web 端至少需要用户在通知设置中手动开启当前网页推送。iOS APNs 配置依赖有效 Apple Developer Program 账号，用户当前未准备好账号时只保留已完成的基础设施，不做 iOS 真机推送验收。
- 用户明确说“推送更新 / 发布 / 部署 / 上线”时，按生产发布处理，使用项目根目录命令：`npx vercel --prod -y`。
- 当前环境里 `vercel` 不在 PATH，已验证可直接用 `npx vercel ...`；第一次可能需要访问 npm registry，若沙盒报 `ENOTFOUND registry.npmjs.org`，用同一条命令申请网络授权重跑。
- Vercel 生产部署当前基本按固定流程成功：本地验证通过后运行 `npx vercel --prod -y`，部署成功后记录 Production URL，并以 `https://app.fanch.tech` 作为用户访问主地址。
- 生产部署后不需要常规检查 alias；只有访问域名异常、Vercel 输出提示域名变更，或用户明确要求排查域名时，才运行 `npx vercel alias ls` / 检查 Domains。
- Vercel 本地 CLI 部署必须保留根目录 `.vercelignore` 对 `PLAN.md`、`*方案*`、`*proposal*`、`AGENTS.md` 等计划/方案/项目记忆文件的排除，避免把非运行源码上传到 Vercel。
- 未经用户明确要求“推送更新 / 发布 / 部署 / 上线”，不要执行 Vercel 部署；普通 UI 微调只做本地修改和验证。

## 已知坑点

- 当前项目已初始化为 git 仓库，可用 `git status` / `git diff` 复核变更；仍需避免把 `.env`、`node_modules/`、`apps/app/.expo/`、`apps/app/dist/`、`.playwright-cli/` 和 `.vercel/` 提交进去。
- `master` 保留当前包含共创模块的工作基线；`pre-creation-module` / `pre-creation-module-base` 指向提交 `f5ae9f6`，是去掉共创模块后的“共创模块之前”基线，可从该提交创建新分支。
- Codex 创建 worktree 需要一个包含实际项目文件的可回放基线；只有空的 root commit 时，`git worktree add` 仍可能在“apply working tree diff”阶段失败。
- 不要把情侣数据权限只做在前端 UI；必须通过 RLS 强制限制。
- RLS policy 之外还必须给 `authenticated` 角色显式表级 `grant`，否则会先报 `permission denied for table ...`，policy 不会生效。
- 不要将 Supabase `auth.users` 和业务 profile 混用。
- Storage 后续必须使用私有 bucket 或受控访问策略。
- V0.1B 使用 private bucket `profile-avatars` 存头像、`couple-media` 存情侣相册图片。
- Storage RLS policy 不要直接把对象路径片段 cast 成 `uuid`；对象名可能异常，应优先用文本比较或 join 已验证的业务记录。
- `couple-media` 上传对象路径第一段是 `couple_id`；Storage insert policy 应以当前用户是否为该 active couple 成员为准，不应额外要求路径第二段等于 `auth.uid()`，否则相册上传可能报 `new row violates row-level security policy`。
- 当前 React Native JSX 类型检查使用 `@types/react@^19.2.15` 可通过；Expo 可能提示建议 `~19.1.10`，但该版本在本项目中会触发 RN JSX 类型错误。
- 当前 Node `v24.15.0` 下 `expo start --web` 可能报 `ERR_SOCKET_BAD_PORT`；`npm run build:web` 可正常导出，之后可用 `apps/app/dist` 静态预览。
- Expo Web 静态导出需要让 Expo 从 `apps/app/.env` 加载公开变量；`build:web` 使用 `--clear` 避免旧 bundle 继续显示“需要先连接 Supabase”。
- 最近 30 天内 Vercel 生产部署已验证：`npx vercel --prod -y` 会在云端执行 `npm install` 和 `npm run build:web`，构建成功后自动 alias 到 `app.fanch.tech`，通常无需额外域名检查。
- Expo Web 上新增 React Native `Animated` 微交互时使用 `useNativeDriver: false`，否则浏览器控制台会出现 native animated module 缺失警告。
- `BouncyPressable` 在 Web 上必须先在组件内部解析 `style` 再交给 Reanimated；不要把 `style` 函数直接透传给 `AnimatedPressable`，否则会丢失布局样式并导致底部导航、按钮等控件错位。
- `CrossFadeImage` 判断图片是否变化时必须使用稳定的 uri/source key，不要把每次 render 新建的 `{ uri }` 对象作为 effect 依赖；否则头像、快捷互动图标和相册图会反复重置加载态并闪烁。
- `CrossFadeImage` 必须让外层容器继承传入尺寸、内部图片绝对铺满；若只把尺寸给内部 `Animated.Image`，相册缩略图会因为外层无高度而压成 1-3px 白块。
- Web 相册上传入口应优先使用真实 `input[type=file]` 覆盖在按钮上，让用户点击直接命中原生文件控件；不要只依赖动态创建 input 后再程序化 `input.click()`，内置浏览器可能表现为点击无反应。
- 全局动效修改后除 `npm run typecheck` 和 `npm run build:web` 外，还应静态预览并用浏览器检查首页、底部导航、相册预览；共创模块若不在当前范围内，只做入口/页面可打开回归。
- Web 版 `DateField` 需要同时处理 `input` / `change` / `blur` 事件；涉及关键日期提交（如 V0.1B 未来信）时，提交函数应兜底读取当前 date input 值，避免状态滞后把未来日期错误提交为当天。
- iOS Safari 下底部导航必须兼容地址栏收缩和回弹，但不能跟随 `visualViewport` / 键盘高度移动；固定贴近底部安全区，避免滚动阻尼或输入聚焦导致底栏弹上弹下。
- 底部导航参考 App Store 风格：半透明玻璃长胶囊承载主要 tab，选中态只在固定 tab 槽位内显示柔和彩虹折射高光，不改变 tab 宽度或位置；右侧独立圆形“我的”入口；调整时保留高透明度、强圆角和模糊背景。
- mock 数据不能包含真实或测试账号昵称、邮箱等可识别信息，避免被打包进 Web 产物或误用于加载态。
- 首页若长时间停留在骨架屏，优先检查 `AuthProvider` 的会话恢复和 `useCoupleData` 的首屏查询是否报错或超时；这两处现在有兜底，但仍应作为首查点。

## 更新 `AGENTS.md` 的规则

每次完成任务前判断是否发现长期有效的项目事实。只有已验证、未来会复用、不含敏感信息的信息才写入。
