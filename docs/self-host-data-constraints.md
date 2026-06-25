# 自建后端数据约束

此文档记录必须落到 PostgreSQL schema、唯一索引、外键、事务和后台补偿里的硬规则。测试不能替代约束；约束也不能替代 API 权限校验。

## 迁移目录

- Supabase 形态保留在 `packages/db/migrations`。
- 自建 PostgreSQL migration 放入 `apps/server/db/migrations`，部署打包时同步到 `infra/self-host/staging/runtime/db/migrations`。
- 自建 smoke / 约束验收脚本优先放入 `apps/server/scripts` 和 `apps/app/scripts`。

## 身份与用户

- `users.id` 使用 UUID；迁移 Supabase 用户时尽量保留原 Auth user UUID。
- `profiles.id` 外键指向自建 `users.id`，继续作为业务用户主键。
- email 必须做大小写规范化唯一索引，保留原始展示 email 可选。
- 账号状态使用枚举或受限字段：active、frozen、deletion_requested、deleted。
- 删除用户不能只删 profile；必须吊销 session、禁用 push token、处理情侣数据和备份残留策略。

## 情侣关系

- 单用户同一时间最多一个 active couple：在 `couple_members(user_id)` 上建立 `where left_at is null` 的 partial unique index。
- `couple_members.couple_id` 外键指向 `couples.id`；`couple_members.user_id` 外键指向 `users.id`。
- 接受邀请码必须在单事务中：
  - 锁定 `pair_invites` code 行：`SELECT ... FOR UPDATE`。
  - 校验 invite pending、未过期、接受者不是创建者、双方都无 active couple。
  - 创建 `couples`。
  - 插入双方 active `couple_members`。
  - 标记 invite accepted，并记录 accepted_by / accepted_at。
- `pair_invites.code` 唯一；pending invite 过期后不可接受。
- 不允许创建空 couple；couple 创建和两条 member 插入必须同事务。

## 业务数据

- 所有情侣业务表必须有 `couple_id not null` 和外键。
- 常用表至少包括：checkins、messages、calendar_events、media_files、mood_status、notifications、future_letters、creation_spaces、creation_actions、pet_memories、couple_footprints。
- 今日胶囊使用软删 `deleted_at`；用户同一 couple 同一天 active checkin 需要唯一约束或等价事务保护。
- `messages.sender_id`、`future_letters.author_id`、`media_files.uploader_id`、`notifications.user_id` 必须外键到 `users.id`。
- 信件解锁语义必须在查询层和服务层同时保护；未解锁正文不返回给无权主体。
- 通知创建和业务写入在同一事务内写数据库记录；外部推送失败不能回滚主业务。
- 快捷互动不建独立历史表，`/api/interactions/quick` 事务内只写给 active partner 的低敏通知；label trim 后不能为空，写入通知正文前最多保留 32 字符。

## 隐私与反馈

- `reports.reporter_id` 必须外键到 `profiles.id`；举报当前伴侣时必须校验 `couple_id` active membership 和 `reported_user_id` 是当前 active partner。
- `blocks(blocker_id, blocked_user_id)` 必须唯一；拉黑当前伴侣必须和结束 active couple 放在同一事务中。
- 解除关系必须更新 `couples.status = 'ended'`、`couples.ended_at`，并把该 couple 的 active `couple_members` 更新为 `status = 'left'`、`left_at`。
- `account_deletion_requests(user_id, status)` 必须唯一；提交注销请求必须标记 `profiles.account_status = 'deletion_requested'`、撤销 active refresh sessions、禁用 push tokens，并结束 active couple。
- `app_feedback.body` 必须限制长度；可选 `couple_id` 必须校验 active membership，metadata 必须是 JSON object。

## Storage 一致性

- 对象 path 不是授权依据；必须有数据库元数据记录。
- self-host 头像路径只允许写入 `profiles.avatar_storage_path`、`profiles.avatar_thumbnail_storage_path`；前端兼容类型可映射为 `avatar_url`、`avatar_thumbnail_url`，但数据库以 self-host 字段为准。
- 头像上传必须先写 `profile_avatar_uploads` pending 记录，object path 必须以 `user_id/` 开头；complete 时服务端 HEAD 校验原图/缩略图 MIME 与 size 后再更新 `profiles`。
- 相册路径只允许写入 `media_files.storage_path`、`media_files.thumbnail_storage_path`。
- 上传推荐状态机：pending_upload -> active -> deleting -> deleted。
- API 生成上传 URL 后记录 pending object；数据库业务提交成功后标记 active。
- 数据库提交失败必须清理本次上传对象；对象删除失败必须进入重试队列。
- 删除数据库记录和删除对象必须幂等；重复删除不能报业务失败。
- signed URL 禁止写回数据库。

## 推送与队列

- `notification_preferences.user_id` 必须唯一，默认允许消息、互动、胶囊和信件推送，普通日历默认关闭。
- `push_tokens(user_id, token)` 必须唯一；Web Push 订阅必须记录 provider=`web_push`、platform=`web`、endpoint、p256dh 和 auth，原生推送必须记录 provider=`expo` 和平台；API 响应与日志不得回显 endpoint、p256dh、auth 或原始 Expo token。
- `push_deliveries.notification_id` 必须唯一，避免同一站内通知重复入队。
- `push_deliveries` 或等价队列表必须支持 claim、retry、stale requeue 和过期放弃。
- claim 必须避免多个 worker 同时发送同一 delivery。
- token 失效要标记禁用，不能无限重试。
- 推送正文只允许低敏摘要。

## Realtime 与事件

- 必须送达的事件先写数据库，再通过 SSE/WebSocket 通知。
- 可丢事件只用于即时 UI 表现，例如云宠轻量 broadcast。
- 断线恢复以数据库状态为准。

## 约束测试

必须覆盖：

- 同一用户并发接受两个邀请码，只能成功一个。
- 同一个邀请码并发被接受，只能成功一次。
- 非 active member 写入带 `couple_id` 的业务数据失败。
- 数据库失败后 pending storage object 被清理或进入清理队列。
- worker 并发 claim 不重复发送同一推送。
