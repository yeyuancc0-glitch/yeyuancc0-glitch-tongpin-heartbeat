# 项目代码审查问题清单

审查范围：当前项目对话框内已发现的问题汇总。

项目路径：`/Users/a123456/Library/Mobile Documents/com~apple~CloudDocs/同频跳动`

说明：本报告汇总安全权限、业务逻辑、云宠/Live2D、冗余代码、配置文档和验证结果。仅记录问题和初步解决方案。

## 2026-06-09 执行结果

- 已修复 localhost 静态预览空白 / 卡加载：`npm run build:web` 重新生成 `apps/app/dist/_expo/static/js/web/entry-*.js`，`scripts/prepare-web-dist.mjs` 会校验 HTML 引用的静态入口资源存在且非 0 字节。
- 已修复 `npm run typecheck` 红灯：`apps/app` 与 `@tongpin/shared` 当前都解析到 TypeScript `5.9.3`，避免 TypeScript 6.0.3 在本项目中误报现代 JS API 缺失。
- 已移除记忆页真实数据为空时展示的 fallback 演示记忆；空分类走现有 EmptyState。
- 已调整头像 / 相册上传一致性：用户仍只需选择一次图片，前端自动生成缩略图；缩略图上传失败不写 DB path，DB 保存失败会清理本次上传对象。
- 已减少留言通知冗余查询：留言主动作仍以 `messages` 写入成功为准，伴侣提醒直接交给 `create_partner_notification(...)` RPC。
- 已整理 `AGENTS.md` 为正式版项目记忆，并在其中细化大文件拆分计划。

## P0/P1 安全与权限

1. `packages/db/migrations/001_v01a_schema.sql`：`pair_invites` 查询策略会泄露所有未过期待接受邀请码。
   - 初步方案：只允许创建者 select，接受邀请完全走 RPC。

2. `packages/db/migrations/001_v01a_schema.sql` + `004_v01b_schema.sql`：`profiles update self` 可改 `account_status` / `deletion_requested_at`。
   - 初步方案：敏感字段改 RPC 或服务端更新。

3. `packages/db/migrations/004_v01b_schema.sql`：`future_letters` 仍开放前端 insert/update/delete，和 `delete_letter` RPC 规则冲突。
   - 初步方案：撤销直接写权限，统一 RPC。

4. `packages/db/migrations/004_v01b_schema.sql`：`notifications` 允许较宽直接插入。
   - 初步方案：按业务场景拆 RPC，前端不直接指定对方 `user_id`。

5. `supabase/functions/send-push-notifications/index.ts`：推送 worker 可被普通用户 JWT 触发。
   - 初步方案：只接受 worker secret / service role。

6. `supabase/functions/send-push-notifications/index.ts`：推送队列 claim 非原子，可能重复发送。
   - 初步方案：数据库端 `FOR UPDATE SKIP LOCKED` 原子领取。

7. `apps/app/features/messages/messageService.ts`、`apps/app/features/checkins/TodayStoryPage.tsx`：推送/通知正文包含留言或胶囊正文，隐私风险。
   - 初步方案：推送只放低敏摘要。

8. `packages/db/migrations/027_pet_director_memory_protocol.sql`：`apply_pet_ai_decision` / `apply_pet_world_decision` 对 authenticated 过宽，且 JSON 可被伪造。
   - 初步方案：RPC 内部校验白名单、额度、来源和 actor。

9. `supabase/functions/pet-ai-brain/index.ts` + DB RPC：AI 决策和 DB 函数都可能改状态，存在双重 apply。
   - 初步方案：明确一个写入入口。

10. `packages/db/migrations/008_v02_creation_space.sql`：`creation_actions` 直接 insert 可被滥用刷奖励/记忆。
    - 初步方案：只保留 RPC 写入。

11. `packages/db/migrations/018_creation_reward_ecosystem.sql`：奖励领取缺唯一约束/原子防重。
    - 初步方案：加唯一索引并在 RPC 内事务锁定。

12. `packages/db/migrations/015_pet_ai_brain.sql`：`archive_expired_pet_memories` 是全局副作用函数，不应开放给普通前端。
    - 初步方案：service role / 定时任务专用。

## 业务与前端逻辑

13. `apps/app/lib/dates/date.ts`：`todayIsoDate()` 用 UTC，国内时区凌晨会错日。
    - 初步方案：本地日期格式化。

14. 多处直接 `toISOString().slice(0,10)`：宠物照顾次数、快捷互动统计、纪念日 dedupe 也受 UTC 日期影响。
    - 初步方案：统一走本地日期工具。

15. `apps/app/features/auth/AuthScreen.tsx`：密码重置只发邮件，没有 recovery 落地流程。
    - 初步方案：监听 recovery session，进入改密页。

16. `apps/app/features/pairing/PairingScreen.tsx`：复制了 `/?invite=` 链接，但应用没有解析 invite 参数。
    - 初步方案：启动时读取 URL 并预填邀请码。

17. `apps/app/features/pairing/PairingScreen.tsx`：邀请码用 `Math.random` 且无冲突重试。
    - 初步方案：用 DB 唯一约束 + retry 或 RPC 生成。

18. `apps/app/features/memory/MemoryPage.tsx`：删除今日胶囊直接 hard delete `checkins`。
    - 初步方案：软删或 RPC。

19. `apps/app/features/memory/MemoryPage.tsx`：删除媒体只删原图，缩略图可能残留。
    - 初步方案：同时删除 `thumbnail_storage_path`。

20. `apps/app/features/checkins/TodayStoryPage.tsx`：胶囊保存成功后，图片上传失败也可能整体被当成功。
    - 初步方案：拆分主动作和附属动作结果。

21. `apps/app/features/checkins/TodayStoryPage.tsx`：自定义心情会覆盖固定心情选择。
    - 初步方案：点固定心情时清空 `customMood`，或 UI 明确显示“自定义优先生效”。

22. `apps/app/features/checkins/TodayStoryPage.tsx`：待上传图片在部分失败后也会被清空。
    - 初步方案：`onPhotoFiles` 返回成功/失败项，只清成功项。

23. `apps/app/features/calendar/AddEventPage.tsx`：备注字段收集了但未写入。
    - 初步方案：写入 schema 字段或移除输入。

24. `apps/app/features/calendar/AddEventPage.tsx`：默认 reminder true 可能创建过多通知。
    - 初步方案：默认关闭或明确 UI。

25. `apps/app/features/letters/LetterPages.tsx`：日期读取依赖 DOM query。
    - 初步方案：用受控 state，不查 DOM。

26. `apps/app/features/media/PhotoAlbum.tsx`：预览索引 fallback 用 `Math.max` 可能在 id 不匹配时跳错。
    - 初步方案：明确优先 activeId，找不到才用 activeIndex。

27. `apps/app/motion/CrossFadeImage.tsx`：图片失败后直接空白。
    - 初步方案：保留 skeleton / 占位图 / 重试。

28. `apps/app/features/profile/ProfileScreen.tsx`：头像 object URL 有泄漏风险。
    - 初步方案：切换/卸载时 revoke。

29. 多个 async 操作缺 `try/finally`：失败时 busy 状态可能卡住。
    - 初步方案：统一 busy guard。

30. `apps/app/features/home/useCoupleData.ts`：轮询/刷新频率偏高。
    - 初步方案：合并请求、指数退避、减少通知轮询。

31. `apps/app/app/+html.tsx`：禁用了缩放手势。
    - 初步方案：除非强业务需要，否则保留系统缩放。

32. `apps/app/features/auth/AuthProvider.tsx`：登出时推送清理可能阻塞退出。
    - 初步方案：清理失败不阻断 signOut。

33. `apps/app/lib/notifications/push.ts`：原生 token refresh 只存在内存态。
    - 初步方案：持久化并按用户同步。

34. `apps/app/lib/notifications/webPush.ts`：已有订阅没有校验 VAPID 变化。
    - 初步方案：检测 key 变化后重新订阅。

35. `apps/app/features/settings/SettingsPages.tsx`：反馈/举报/注销多处只 toast，没有完整状态闭环。
    - 初步方案：返回可追踪状态或后台记录。

36. `apps/app/features/settings/SettingsPages.tsx`：隐私操作缺 `finally`，失败可能卡 loading。
    - 初步方案：补 `try/finally`。

37. `apps/app/features/settings/SettingsPages.tsx`：Web Push 设置加载在不支持 Service Worker 时可能体验卡住。
    - 初步方案：显式 unsupported 状态。

38. `apps/app/features/home/HomeScreen.tsx`：缩略图上传失败后清空 DB 字段未检查错误。
    - 初步方案：检查并重试/提示。

39. `apps/app/features/home/HomeScreen.tsx`：动态 file input 取消选择时可能残留。
    - 初步方案：复用 `PhotoUploadInput` 或 focus 兜底清理。

40. `apps/app/lib/supabase/storage.ts`：blob transform 缓存无统一 revoke。
    - 初步方案：过期/替换/卸载时清理。

41. `apps/app/features/home/HomeMainPage.tsx`：若干 props 被 `void` 掉，拆分接口未收敛。
    - 初步方案：删除未用 props 或接回功能。

42. `apps/app/features/messages/MessagePages.tsx`：发送/删除失败路径缺异常捕获。
    - 初步方案：服务层捕获网络异常并返回统一错误。

## 云宠 / Live2D

43. `apps/app/features/creation/CreationSpacePage.tsx`：足迹/游戏页仍渲染 PetStage，和 AGENTS “不作为本体位置”冲突。
    - 初步方案：只保留功能，不挂本体。

44. `apps/app/features/creation/CreationSpacePage.tsx`：`displayPetName()` 固定“云宠”，可能覆盖真实名字。
    - 初步方案：以 DB 名称为准。

45. `apps/app/features/pet/components/Live2DCanvas.tsx`：Cubism script 已存在但事件已触发时，Promise 可能永远不 resolve。
    - 初步方案：加 loaded/error 标记和超时。

46. `apps/app/features/pet/components/Live2DCanvas.tsx`：大小或 compact 改变会重建 Pixi / model。
    - 初步方案：只 relayout，不重建。

47. `apps/app/features/pet/components/Live2DCanvas.tsx`：cleanup 可能重复 destroy model / textures。
    - 初步方案：移除 child 后单一路径销毁。

48. `apps/app/features/pet-world/hooks/usePetWorldRoaming.ts`：规则返回的 minInterval 未真正执行。
    - 初步方案：在 hook 内保存 lastApply 时间。

49. `apps/app/features/pet-world/hooks/usePetWorldRoaming.ts`：dedupe 在 RPC 成功前写入，失败后会吞掉下一次重试。
    - 初步方案：成功后再更新 dedupe。

50. `apps/app/lib/supabase/database.types.ts`：pet surface 类型仍包含旧 `footprints` / `playground`。
    - 初步方案：同步 DB 约束后的类型。

51. `supabase/functions/pet-ai-brain/index.ts`：AI context 包含 footprint titles，可能仍属隐私。
    - 初步方案：只传分类/数量/低敏摘要。

52. `apps/app/features/pet-world/components/GlobalPetLayer.tsx`：portalHost 只取一次，页面 remount 后可能挂旧 DOM。
    - 初步方案：随 surface / subPage 重取。

53. `apps/app/features/pet-world/components/GlobalPetLayer.tsx`：全局 `document.querySelector` 找锚点，重复 DOM 时定位错。
    - 初步方案：限定当前容器 scope。

54. `apps/app/features/home/petDomProps.ts`：`petSafeZone` 标记未被全局层使用。
    - 初步方案：实现避让或删除标记。

55. `apps/app/features/messages/MessagePages.tsx`、`apps/app/features/media/PhotoAlbum.tsx`：复制了 `petAnchorProps`，且部分锚点不在全局表。
    - 初步方案：统一导入并同步枚举。

56. `apps/app/features/pet/logic/livePetRig.ts`：旧 motion profile helper 未被引用。
    - 初步方案：删除或接回 Live2DCanvas。

57. `apps/app/features/pet/logic/petRules.ts`：照顾次数用 UTC 日期。
    - 初步方案：改本地日期。

## 冗余、过期、配置

58. 严格 unused 检查失败，存在大量未使用 import / 变量。
    - 初步方案：逐文件清理，开启 `noUnusedLocals` / `noUnusedParameters`。

59. `apps/app/features/messages/MessageBoard.tsx`：旧消息组件仍残留。
    - 初步方案：删除或迁移引用到新组件。

60. `apps/app/features/calendar/CalendarCard.tsx`：旧日历卡片残留。
    - 初步方案：确认无引用后删除。

61. `apps/app/components/app-ui/AppUI.tsx`：组件过大且混合 Web portal、底部导航、基础 UI。
    - 初步方案：拆分 ui primitives、navigation、cards。

62. `apps/app/features/home/homeStyles.ts`、`CreationSpacePage.tsx`、`HomeScreen.tsx` 等文件过大。
    - 初步方案：按页面/组件拆分。

63. 多个文件顶层导入 `react-dom`。
    - 初步方案：Web-only portal 封装为平台文件或动态 require。

64. `apps/app/react-dom.d.ts`：手写 stub 是技术债。
    - 初步方案：使用真实类型或隔离 Web 入口。

65. `apps/app/app/live2d-poc.tsx`：PoC 路由仍在产物中。
    - 初步方案：移除或开发环境限定。

66. `README.md`：migration / 产品状态描述落后。
    - 初步方案：按当前 schema 和功能更新。

67. `docs/mobile-push*`：Vault / 推送流程与现状冲突。
    - 初步方案：更新为当前 worker secret + pg_net 方案。

68. `.env.example`：客户端 env 和 Edge secrets 混在一起。
    - 初步方案：分 `.env.example` 与 `supabase/functions/.env.example`。

69. `PET_AI_*` 默认值在文档/代码间不一致。
    - 初步方案：单一配置源。

70. `scripts/apply-supabase-migration.mjs` / `db:apply`：仍偏向 `supabase db push`，和 AGENTS 记录的可用替代路径不完全一致。
    - 初步方案：脚本支持 linked query 文件顺序执行。

71. `vercel.json` SPA rewrite 与 Expo route copies 可能重叠。
    - 初步方案：确认 404 / 深链策略并简化。

72. `AGENTS.md` 已被修改且内容过长/过期。
    - 初步方案：压缩，只保留长期规则，删除失效项。

73. `packages/shared` 不是实际有效 workspace 使用面，内容偏 V0.1A。
    - 初步方案：要么接入 app，要么删除/更新。

74. `package.json` override `pixi-live2d-display -> gh-pages` 当前看起来无效。
    - 初步方案：确认依赖树后移除。

75. `SetupRequired` / 初始化提示仍只识别早期 migration。
    - 初步方案：同步当前 V0.1B / V0.2 schema 检查。

76. `.playwright-cli` 历史缓存仍存在。
    - 初步方案：保持忽略，不提交，必要时清理。

77. mock 文件里既有真实产品常量又叫 mock。
    - 初步方案：把产品常量迁到 `constants`，测试数据留 mock。

78. `mockCouple` / `mockRecentActivity` / `mockCalendarDays` 等未使用。
    - 初步方案：确认无引用后删除。

79. `DateField` 和旧 DOM fallback 逻辑不一致。
    - 初步方案：统一受控 date input。

80. `usePetRealtime` / `usePetWorldRealtime` / `usePetWorld` / `usePetAiDirector` 等存在重复或未使用 hook。
    - 初步方案：保留一套实时/漫游入口。

81. `MotionLayer` 顶层 `react-dom` 同样有跨端风险。
    - 初步方案：平台隔离。

82. `BottomTabBar` 与 AGENTS 记录的 bottom offset 不一致。
    - 初步方案：以当前验收结果更新 AGENTS 或调整样式。

83. `AGENTS.md` 中 Supabase functions 目录、auth hero、部分上线状态等与实际文件/功能不完全一致。
    - 初步方案：任务允许修改时统一修订。

## 依赖与验证

84. `npm audit --omit=dev` 当前为 0 vulnerabilities。
    - 初步方案：后续升级 Expo / React Native 时继续按生产依赖审计和浏览器回归验证。

85. `npm run typecheck` 通过，但严格 unused 失败。
    - 初步方案：先清 unused，再考虑把严格项纳入 CI。

86. `npm run build:web` 已执行并通过；`apps/app/dist` 为生成产物，后续需要用同命令重建，不应手工维护。
    - 初步方案：保持构建后处理脚本的入口资源校验。

## 已执行验证

- `npm run typecheck`：通过。
- `npm run build:web`：通过。
- `npm audit --omit=dev`：0 vulnerabilities。
- in-app browser 静态预览 `http://localhost:4175/`：首页、分享、记忆、家园、我的入口烟测通过，控制台无 error/warn。
- `npm run typecheck -w apps/app -- --noUnusedLocals --noUnusedParameters --pretty false`：仍作为后续清理项，需逐文件处理 unused 后再纳入常规验证。
