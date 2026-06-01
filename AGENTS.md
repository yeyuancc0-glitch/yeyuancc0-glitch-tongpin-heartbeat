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
- V0.1B 不做原生推送、AI、支付、复杂审核后台、视频相册和账号物理删除自动化。
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
- 头像和相册使用 Supabase private Storage；数据库只保存 Storage path，前端展示时生成 signed URL，不能把 signed URL 写回数据库。
- 首页快捷心情投递必须写入双方共享数据；当前实现复用 `messages` 表保存“投递了「...」”，不能只做本地 toast 假反馈。
- 首页快捷互动不再写入 `messages` 留言表；只创建 `notifications` 站内弹窗，用户点“知道了”后标记已读并消失。历史 `messages.body` 形如 `投递了「...」` 的数据应从留言板、日历和记忆展示中过滤。
- 首页快捷互动通知通过 `send_quick_interaction(target_couple_id, interaction_label)` RPC 创建，避免前端直接向对方 `user_id` 插入 `notifications` 触发 RLS 失败。
- 首页快捷互动最多 10 个，自定义项先用 Web localStorage 保存；按钮需随数量增加自动换行并保持小图标不裁切。
- 首页“此刻同频”快捷互动总数最多 8 个，最后一张固定作为自定义互动入口，不要把自定义项插到中间。
- 首页自定义快捷互动必须使用页内输入/编辑 UI，不要使用 `window.prompt`；内置浏览器中原生 prompt 可能表现为点击无反馈。
- 首页后台刷新应静默运行，不展示“后台同步 / 正在同步”类状态提示；用户只需要看到实际内容变化。
- 首页首屏不能等待头像或相册 signed URL 全部生成后才渲染；刷新或重新打开时应优先恢复/展示已缓存的当前用户 dashboard，再后台补齐图片签名 URL。
- 首页 dashboard 加载必须分阶段：首屏只阻塞 profiles 与 active couple 基础信息；留言、相册、心情、信件、通知和图片 signed URL 在后台补齐；无 active couple 时才查询 pending pair_invites。
- 当前首页结构：此刻同频卡片内合并快捷心情投递；相册卡片位于此刻同频下方；留言板在首页一级界面直接提供输入框；首页不展示最近纪念日和今日胶囊卡片。
- 首页“写情书 / 写一封信”入口必须融合在恋爱天数主卡内部，位于开始日期下方，作为首屏可见入口；来信页可保留回复/空状态入口，但不能作为唯一入口。
- 首页“共创空间”入口使用右下角悬浮圆形按钮，样式参考记忆页添加事件入口；不要改成首页大卡片或新增底部 tab。
- 共创空间首版是首页子页，包含共享宠物/小屋 MVP、轻量足迹记录和小游戏占位；双人小游戏在玩法确定前只保留入口，不创建房间、对局或积分等表。
- 共创宠物/小屋状态通过 `creation_spaces`、`creation_actions` 和 `ensure_creation_space` / `interact_creation_pet` / `update_creation_home` RPC 管理，关键成长值不要由前端直接改。
- 共创空间后续宠物默认资产放在 `apps/app/assets/creation-pets/`，当前提供写实风云猫/云狗可选项（银纹云猫、奶霜短毛猫、金毛云狗、柯基云狗）；宠物选择、喂养、买粮和解谜奖励分别走 `choose_creation_pet` / `feed_creation_pet` / `buy_creation_food` / `claim_creation_game_reward` RPC。
- 共创空间粮仓首版使用 `treat_balance`、`basic_food_count`、`premium_food_count` 和 `last_fed_food` 保存共享资源，解谜/脑筋急转弯奖励用于购买宠物粮，再喂给共享云宠。
- 共创空间页面本地状态不要被较旧的父级缓存直接覆盖，必须优先保留 `updated_at` 更新更晚的共享状态。
- 足迹记录使用 `couple_footprints`，允许坐标为空；只记录地点名和备注也必须可用，且足迹可沉淀到记忆页“日常”。
- 今日胶囊卡片位于分享页，用于替代“今天存下的胶囊”卡片。
- 分享页今日胶囊以 `checkins` 写入成功作为封存成功标准；`mood_status` 与 `notifications` 属于附属同步，失败时不能阻塞封存按钮或底部导航交互。
- 分享页今日胶囊采用触感化视觉：精致小尺寸情绪糖果、折角心情便签、柔和呼吸胶囊预览；标题仍叫“今日胶囊”，不要使用“情感封存魔盒”作为界面标题。
- 首页相册缩略图必须可点开全屏查看，查看层使用居中预览卡片而不是系统原生弹窗。
- 分享页“今天的心情”固定选项为“开心 / 难过 / 想你 / 委屈”，不展示“甜蜜 / 平静”。
- 记忆页筛选分类固定为“全部 / 日常 / 留言 / 纪念日 / 信件”，不展示“想你”分类；想你类今日胶囊仍归入“日常”。
- 记忆页时间线采用“彩色回忆风铃”视觉：奶油气泡筛选器、蔷薇到雾紫渐变轨道、微缩胶囊节点、按分类异构的糖果色记忆卡；卡片内角标和图标需保持移动端小尺寸。
- Web 底部导航的默认位置应保持在更低的起始位，避免悬浮得过高；`BottomTabBar` 仍需保留 `visualViewport` 修正（已将 Web 端默认 bottom offset 降至 2px，并在 `useVisualViewportLift` 中引入了 45px 的微小偏差过滤阈值，避免非键盘状态下由 Safari 滚动阻尼或工具栏收缩引发底栏无端高高托起）。
- 相册和记忆卡片图片上传当前最多 10 张；首页相册卡片使用九宫格预览前 9 张，超过 9 张显示 `+N` 并提供“查看全部”入口，完整预览层支持全量浏览与单张删除。

## Migration 与数据变更

- Supabase migration 放在 `packages/db/migrations`。
- V0.1B 新增 schema 放在 `packages/db/migrations/004_v01b_schema.sql`。
- 共创空间 schema 放在 `packages/db/migrations/008_v02_creation_space.sql`。
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
- 用户明确说“推送更新 / 发布 / 部署 / 上线”时，按生产发布处理，使用项目根目录命令：`npx vercel --prod -y`。
- 当前环境里 `vercel` 不在 PATH，已验证可直接用 `npx vercel ...`；第一次可能需要访问 npm registry，若沙盒报 `ENOTFOUND registry.npmjs.org`，用同一条命令申请网络授权重跑。
- Vercel 生产部署当前基本按固定流程成功：本地验证通过后运行 `npx vercel --prod -y`，部署成功后记录 Production URL，并以 `https://app.fanch.tech` 作为用户访问主地址。
- 生产部署后不需要常规检查 alias；只有访问域名异常、Vercel 输出提示域名变更，或用户明确要求排查域名时，才运行 `npx vercel alias ls` / 检查 Domains。
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
- Web 版 `DateField` 需要同时处理 `input` / `change` / `blur` 事件；涉及关键日期提交（如 V0.1B 未来信）时，提交函数应兜底读取当前 date input 值，避免状态滞后把未来日期错误提交为当天。
- iOS Safari 下底部导航必须兼容地址栏收缩和回弹，`BottomTabBar` 使用 `visualViewport` 动态修正 fixed 底栏位置，不要随意删除。
- 底部导航参考 App Store 风格：半透明玻璃长胶囊承载主要 tab，选中态只在固定 tab 槽位内显示柔和彩虹折射高光，不改变 tab 宽度或位置；右侧独立圆形“我的”入口；调整时保留高透明度、强圆角、模糊背景和 `visualViewport` 修正。
- mock 数据不能包含真实或测试账号昵称、邮箱等可识别信息，避免被打包进 Web 产物或误用于加载态。

## 更新 `AGENTS.md` 的规则

每次完成任务前判断是否发现长期有效的项目事实。只有已验证、未来会复用、不含敏感信息的信息才写入。
