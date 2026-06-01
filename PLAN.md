# 情侣双人应用 MVP 规划

## 1. 产品定位

核心价值：为一对情侣提供私密、轻量、长期沉淀的共同空间，重点不是聊天，而是记录关系、制造仪式感、形成持续互动。

目标用户：已建立恋爱关系、希望记录日常和纪念日的情侣，尤其适合异地情侣、热恋情侣、重视仪式感的伴侣。

差异点：
- 相比普通日历：增加双方关系、互动和情绪记忆。
- 相比聊天软件：避免重要回忆被聊天流淹没。
- 相比情侣空间：第一版不做公开社交，优先做双人私密闭环。

## 2. MVP 阶段范围

### V0.1A：Web MVP 核心闭环

只做：
- 注册 / 登录
- profiles 用户资料
- 创建情侣邀请码
- 接受邀请码并建立情侣关系
- 情侣首页
- 恋爱天数 / 纪念日倒计时
- 今日打卡
- 留言板基础版
- 基础情侣日历事件
- 基础 Row Level Security 权限控制

不做：
- 相册上传
- 未来信
- 情绪状态增强
- 复杂情侣任务
- 原生推送通知
- AI 助手
- 高级主题
- 订阅支付
- 完整审核后台

### V0.1B：Web MVP 增强版

加入：
- 相册上传
- 未来信
- 情绪状态增强
- 站内通知
- 基础内容删除
- 举报 / 拉黑入口
- 账号注销流程设计与最小实现
- 隐私政策、用户协议草案

### V0.2：移动端内测版

加入：
- iOS / Android 真机适配
- Expo Push Notifications
- APNs / FCM 配置
- 邀请链接 Deep Link
- TestFlight / Google Play Internal Testing
- 移动端权限说明
- 崩溃与行为埋点

### V1.0：应用商店上架版

加入：
- App 内账号删除入口
- 举报 / 屏蔽 / 内容处理流程
- 数据安全说明
- 完整隐私政策与用户协议
- 应用商店审核素材
- 内容处理与用户支持流程
- 基础运营后台或 Supabase 后台操作手册

## 3. V0.1A 用户流程

注册登录：用户打开 Web → 注册 / 登录 → 创建 profiles → 进入未绑定状态。

创建邀请：用户 A 点击“邀请另一半” → 生成 `pair_invites.code` → 展示邀请码和邀请链接。

接受邀请：用户 B 输入邀请码 → 系统检查邀请码有效 → 检查 A 和 B 都没有 active couple → 事务创建 `couples` 和 `couple_members` → 邀请状态改为 accepted。

日常使用：双方进入情侣首页 → 查看恋爱天数 / 纪念日倒计时 → 今日打卡 → 留言 → 添加基础日历事件。

解绑：V0.1A 先设计数据状态，不做复杂删除流程；解绑后 couple 状态变为 ended，双方不能继续写入该 couple 数据。

## 4. 信息架构

页面：
- 登录 / 注册页
- 个人资料页
- 未绑定首页
- 创建邀请码页
- 输入邀请码页
- 情侣首页
- 今日打卡页或首页内模块
- 留言板页或首页内模块
- 情侣日历页
- 设置页
- 关系解绑页

情侣首页模块：
- 双方头像与昵称
- 恋爱天数
- 下一个纪念日倒计时
- 今日打卡状态
- 最新留言
- 最近日历事件
- 快捷操作入口

## 5. 推荐技术路线

推荐技术栈：
- Expo
- React Native
- TypeScript
- Expo Router
- Supabase
- NativeWind 或 Tamagui

阶段策略：
- 第一阶段优先使用 Expo Web 做 Web MVP。
- 第一阶段不拆 Next.js，除非后续明确需要 SEO、官网、投放落地页或服务端渲染。
- 原生推送、App Store、Google Play 能力放到 V0.2 之后。
- 不引入复杂后端、微服务、Kubernetes、自建鉴权。
- Supabase 负责 Auth、Postgres、RLS、Storage、Edge Functions / RPC。

UI 选择：
- 若追求简单和速度，使用 NativeWind。
- 若需要更强跨端组件体系和主题能力，使用 Tamagui。
- V0.1A 默认选 NativeWind，减少学习和集成成本。

## 6. 数据库设计

所有业务表使用 `uuid` 主键，时间字段使用 `timestamptz`，默认开启 RLS。

### profiles

替代 `public.users`，避免和 `auth.users` 混淆。

字段：
- `id uuid primary key references auth.users(id)`
- `display_name text`
- `avatar_url text`
- `birthdate date nullable`
- `created_at timestamptz`
- `updated_at timestamptz`

权限：
- 用户可读写自己的 profile。
- 情侣关系成立后，双方可读取对方基础 profile。

### pair_invites

字段：
- `id uuid primary key`
- `code text unique not null`
- `created_by uuid references profiles(id)`
- `accepted_by uuid nullable references profiles(id)`
- `status text check in ('pending','accepted','expired','cancelled')`
- `expires_at timestamptz`
- `created_at timestamptz`
- `accepted_at timestamptz nullable`

权限：
- 创建者可读取和取消自己的 pending 邀请。
- 登录用户可通过 code 校验 pending 邀请。
- 接受邀请必须走事务函数，不允许前端直接拼接写入 couples / couple_members。

### couples

字段：
- `id uuid primary key`
- `started_at date not null`
- `anniversary_date date nullable`
- `status text check in ('active','ended')`
- `created_by uuid references profiles(id)`
- `created_at timestamptz`
- `ended_at timestamptz nullable`

权限：
- active member 可读。
- 只能通过绑定事务创建。
- 解绑后禁止继续写入关联业务数据。

### couple_members

字段：
- `id uuid primary key`
- `couple_id uuid references couples(id)`
- `user_id uuid references profiles(id)`
- `role text default 'member'`
- `joined_at timestamptz`
- `left_at timestamptz nullable`

权限：
- 用户可读取自己所属 couple 的成员关系。
- active couple 判断以 `left_at is null` 且 `couples.status = 'active'` 为准。

### checkins

字段：
- `id uuid primary key`
- `couple_id uuid references couples(id)`
- `user_id uuid references profiles(id)`
- `checkin_date date`
- `content text nullable`
- `created_at timestamptz`
- `updated_at timestamptz`

权限：
- couple active member 可读。
- 用户只能为自己的 active couple 创建打卡。
- 作者可更新 / 删除自己的打卡。

### messages

字段：
- `id uuid primary key`
- `couple_id uuid references couples(id)`
- `sender_id uuid references profiles(id)`
- `body text not null`
- `created_at timestamptz`
- `updated_at timestamptz`
- `deleted_at timestamptz nullable`

权限：
- couple active member 可读。
- sender 只能在自己的 active couple 下创建留言。
- message 作者可以删除自己的留言。
- 非作者不能删除对方留言，除非后续明确加入双方共同管理规则。

### calendar_events

字段：
- `id uuid primary key`
- `couple_id uuid references couples(id)`
- `created_by uuid references profiles(id)`
- `title text not null`
- `event_date date not null`
- `type text check in ('anniversary','date','todo','other')`
- `created_at timestamptz`
- `updated_at timestamptz`
- `deleted_at timestamptz nullable`

权限：
- couple active member 可读。
- active member 可创建自己 couple 下的事件。
- V0.1A 默认双方都可编辑 / 删除事件，后续可细分作者权限。

### 后续表

V0.1B / V0.2 再加入：
- `future_letters`
- `media_files`
- `mood_status`
- `notifications`
- `reports`
- `blocks`

这些表仍必须以 `couple_id` 或 `user_id` 做权限边界。

## 7. 情侣邀请事务流程

不在创建邀请时提前创建空 couple。

流程：
1. 用户 A 创建 `pair_invites`，状态为 `pending`。
2. 用户 B 输入邀请码。
3. 系统校验邀请码存在、未过期、状态为 `pending`。
4. 系统校验 `created_by != auth.uid()`。
5. 系统校验 A 当前没有 active couple。
6. 系统校验 B 当前没有 active couple。
7. 使用数据库事务创建 `couples`。
8. 插入两条 `couple_members`：A 和 B。
9. 更新 `pair_invites.accepted_by`、`accepted_at`、`status = 'accepted'`。
10. 返回新 couple 信息。

实现要求：
- 使用 Supabase RPC 或 Edge Function 执行事务。
- 前端不能直接创建 couples 和 couple_members。
- 并发接受同一个邀请码时，只能成功一次。
- 同一用户不能同时存在两个 active couple。

## 8. RLS 权限设计与验收测试

RLS 原则：
- 未登录用户不能读取任何情侣数据。
- 所有情侣业务数据必须带 `couple_id`。
- 读写权限统一判断当前用户是否为该 couple 的 active member。
- 写入时必须校验传入 `couple_id` 属于当前用户。
- Storage 必须使用私有 bucket 或受控访问策略。

验收测试：
- 未登录用户不能读取任何情侣数据。
- 用户只能读取自己所属 couple 的数据。
- 用户不能读取其他情侣的 `checkins` / `messages` / `calendar_events`。
- 用户只能创建自己 `couple_id` 下的数据。
- 解绑后不能继续写入原 couple 数据。
- message 作者可以删除自己的留言。
- 非作者不能删除对方留言，除非规则明确允许。
- `future_letters` 未到 `unlock_at` 时，接收方不可读。
- `media_files` 必须校验 couple member 权限。
- Storage 文件必须使用私有 bucket 或受控访问策略。

测试方式：
- 准备用户 A/B/C/D，其中 A+B 是情侣，C+D 是另一对情侣。
- 使用 Supabase SQL 测试、RPC 测试或集成测试分别以不同用户 session 执行查询和写入。
- 所有越权查询应返回空结果或权限错误。
- 所有越权写入、更新、删除应失败。

## 9. 通知策略

V0.1A：
- 默认不做通知，或只做非常轻量的站内提示。
- 不接入 Expo Push Notifications。
- 不配置 APNs / FCM。

V0.1B：
- 可加入站内通知表 `notifications`。
- 用于留言、打卡、日历事件提醒。

V0.2：
- 接入 Expo Push Notifications。
- 配置 APNs / FCM。
- 支持移动端推送权限申请、token 管理和失败重试。

## 10. 合规功能阶段规划

V0.1A：
- 基础隐私边界。
- 基础数据删除能力预留。
- 基础关系解绑设计。

V0.1B / V0.2：
- 举报。
- 拉黑。
- 账号注销。
- 内容删除。
- 隐私政策。
- 用户协议。

V1.0：
- 完整应用商店审核准备。
- App 内账号删除入口。
- 举报 / 屏蔽 / 内容处理流程。
- 数据安全说明。
- App Review / Google Play 测试账号和审核说明。

## 11. MVP 验证指标

- 注册完成率：判断注册流程是否过长或有技术阻塞。
- 邀请发送率：判断用户是否理解产品核心是“双人绑定”。
- 情侣绑定成功率：判断邀请码流程是否顺畅。
- 绑定后首日打卡率：判断首页和打卡是否形成首次互动。
- 绑定后首日留言率：判断留言板是否有真实使用价值。
- 双方互动率：判断是否只有一方在用，还是双方都参与。
- D1 留存：判断首日体验是否足够清晰。
- D7 留存：判断产品是否有持续关系价值。
- 每对情侣 7 天内产生的 checkin 数量：判断日常打卡频率。
- 每对情侣 7 天内产生的 message 数量：判断留言板是否替代或补充聊天。

建议 V0.1A 不追求大规模增长，重点验证“绑定成功后是否愿意连续 7 天产生内容”。

## 12. 推荐目录结构

```text
apps/
  app/
    app/
    components/
    features/
      auth/
      profile/
      pairing/
      home/
      checkins/
      messages/
      calendar/
    lib/
      supabase/
      navigation/
      dates/
    styles/
packages/
  db/
    migrations/
    policies/
    tests/
  shared/
    types/
    constants/
supabase/
  functions/
docs/
  product/
  compliance/
PLAN.md
AGENTS.md
```

初期可以只保留：
- `apps/app`
- `packages/db`
- `docs`
- `PLAN.md`
- `AGENTS.md`

等复用需求明确后再拆更细。

## 13. 第一周开发计划

Day 1：初始化 Expo + TypeScript + Expo Router + Supabase 项目，建立基础目录结构。

Day 2：建立 Supabase schema：`profiles`、`pair_invites`、`couples`、`couple_members`，并开启 RLS。

Day 3：实现注册、登录、session 管理、路由保护。

Day 4：实现邀请码创建、邀请码输入、情侣绑定事务。

Day 5：实现情侣首页，展示双方资料、恋爱天数、纪念日倒计时。

Day 6：实现今日打卡和留言板基础 CRUD。

Day 7：补齐 RLS policy、RLS 测试、基础 UI 修正、部署 Web 预览版。

## 14. 风险与规避

产品风险：功能过多导致 MVP 失焦。规避：V0.1A 只验证注册、绑定、日常互动、纪念日四件事。

技术风险：跨端 UI 在 Web 和原生表现不一致。规避：优先使用 Expo 兼容组件，复杂平台能力后置到 V0.2。

权限风险：情侣数据越权访问。规避：所有业务表启用 RLS，所有情侣数据必须带 `couple_id`，并做 RLS 验收测试。

审核风险：UGC、账号删除、举报能力不足。规避：V0.1A 预留数据结构，V0.1B / V0.2 补齐，V1.0 完整实现。

隐私风险：情侣内容高度敏感。规避：最小化采集、私有 Storage、删除能力、解绑状态、禁止公开内容。

成本风险：图片和推送过早引入成本。规避：相册和原生推送不进 V0.1A。

## 15. 默认假设

- 一个用户同一时间只能有一个 active couple。
- V0.1A 不做公开社区和陌生人匹配。
- V0.1A 不做图片上传和未来信。
- V0.1A 不做原生推送。
- V0.1A 使用 Expo Web 验证产品闭环。
- 后续进入实现阶段时，先创建并维护 `AGENTS.md`，再创建 `PLAN.md`。
