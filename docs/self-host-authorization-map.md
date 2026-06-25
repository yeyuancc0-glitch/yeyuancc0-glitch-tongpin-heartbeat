# 自建后端权限矩阵

迁出 Supabase 后，RLS、`auth.uid()`、Storage policy 和 Realtime policy 都不再自动保护数据。所有 API 必须显式从 session 解析 `user_id`，并验证 `couple_id`、资源归属、active membership 和动作权限。

## 全局规则

- 前端传入的 `user_id`、`couple_id`、`author_id`、`uploader_id` 只能作为请求参数线索，不能作为授权事实。
- 授权事实必须来自服务端 session、数据库查询和事务内锁定结果。
- 所有情侣业务数据必须带 `couple_id`；读取和写入都必须校验请求用户是该 `couple_id` 的 active member。
- service / worker 权限只能通过内部凭证使用，并且只允许调用内部接口或专用 service 方法。
- 管理员默认不可读取消息正文、信件正文、照片内容、caption、精确位置和 token；排障只看脱敏日志和元数据。

## 主体

| 主体 | 身份来源 | 说明 |
|---|---|---|
| Anonymous | 无 session | 只能访问 health、注册、登录、密码重置发起 |
| User self | session user | 本人资料、本人通知、本人 token、本人 session |
| Active couple member | session user + `couple_members.left_at is null` | 同一 active couple 的情侣业务数据 |
| Author | 资源 `author_id` / `sender_id` 等于 session user | 可编辑/删除自己创建的部分资源 |
| Uploader | `media_files.uploader_id` 等于 session user | 可删除自己上传的媒体，仍需 active couple 校验 |
| Recipient | 信件/通知收件人为 session user | 可读/标记/隐藏自己的收件内容 |
| Internal worker | internal token / mTLS / private network | 推送、AI、cron、队列重试 |
| Admin | 独立后台角色 | 只允许低敏运维和合规动作 |

## 资源权限

| 资源 | 读 | 写/创建 | 更新 | 删除/撤销 | 关键校验 |
|---|---|---|---|---|---|
| `profiles` | 本人读完整资料；active partner 读展示字段和头像签名 URL | 注册事务创建本人 profile | 本人更新昵称、生日；头像 path 只能由头像上传完成/删除接口更新 | 账号注销流程处理 | `profiles.id = session.user_id`；伴侣读需 active couple |
| `/api/me/dashboard` 聚合 | session user 读本人 profile；active member 读同 couple 已迁业务摘要 | 不写入 | 不更新 | 不删除 | 只聚合各业务 service 已授权数据；不返回 signed URL、token、云宠 AI 上下文或未迁家园数据 |
| `couples` | active member 读当前 active couple | 只能由接受邀请事务创建 | 日期更新需 active member | 结束关系需 active member 且服务端事务 | 单用户唯一 active couple |
| `couple_members` | active member 读同 couple 成员 | 接受邀请事务创建两条 member | 离开/结束关系由事务更新 | 不直接硬删 | `user_id` 与 active couple 唯一约束 |
| `pair_invites` | 创建者读自己的 invite；接受者通过 code 校验 | 无 active couple 的用户创建 | 创建者可取消 pending | 接受后状态变 accepted | code 唯一；接受时锁 invite 和双方 active 状态 |
| `messages` | active member 读同 couple | active member 发送 | 作者可按产品规则编辑或撤回 | 作者/隐私流程软删 | `couple_id` active member；通知失败不回滚消息 |
| 快捷互动 action | 无独立读取；结果体现为收件人通知 | active member 向 active partner 投递 | 不更新历史 | 收件人可隐藏通知 | `/api/interactions/quick` 校验 active couple、active partner 和双方 block；只写低敏通知 |
| `checkins` | active member 读同 couple | 本人创建今日胶囊 | 本人更新自己的今日内容 | 软删 `deleted_at` | 用户每日唯一键；禁止 hard delete |
| `mood_status` | active member 读同 couple | 本人 upsert | 本人更新 | 按账号/关系结束策略处理 | user + couple + date 唯一 |
| `calendar_events` | active member 读同 couple | active member 创建 | 创建者或 active member 按产品规则更新 | 软删 | 通知创建由服务端处理 |
| `future_letters` | 作者和收件人可见；未解锁正文隐藏 | active member 创建给 partner | 收件人可标记已读/隐藏 | 作者删除或服务端 delete API | 锁定正文不能提前泄漏 |
| `media_files` | active member 读元数据；对象读走签名 URL | active member 上传并写元数据 | 上传者/active member 更新 caption 等低敏字段 | 软删元数据，异步删对象 | path 不构成授权；必须 join 元数据 |
| `profile_avatar_uploads` | 本人读上传状态；对象读走 profile avatar read-url | 本人创建 pending upload | 本人 complete 后更新 profile path | 本人删除头像或替换头像后标记 deleted | path 必须以 `session.user_id/` 开头；active partner 只能经 read-url 读展示头像 |
| `notifications` | 仅 `user_id = session.user_id` | 只允许服务端业务方法创建 | 本人标记已读 | 本人隐藏 | 推送正文低敏 |
| `notification_preferences` | 本人读 | 本人初始化 | 本人更新 | 账号删除处理 | `user_id = session.user_id` |
| `push_tokens` | 本人读自己的设备概要；worker 可查投递 | 本人注册 | 本人禁用；worker 标记失效 | 本人/注销流程删除或禁用 | token/endpoint 不进日志 |
| `push_deliveries` | 本人读概要；worker claim 明细 | 通知创建事务按偏好入队 | worker 回写 claimed/sent/skipped/failed | 过期清理 | delivery 不含敏感正文；并发 claim 必须互斥 |
| `reports` | 本人读自己的提交状态；admin 读脱敏内容 | 本人仅可举报当前 active partner | admin 处理状态 | 合规流程 | `couple_id` 必须 active member；`reported_user_id` 必须是当前伴侣 |
| `blocks` | 本人读自己的 block 概要；admin 读脱敏内容 | 本人拉黑当前 active partner | 本人重复拉黑可更新原因 | 合规流程 | 拉黑必须同事务结束 active couple |
| `account_deletion_requests` | 本人读自己的请求；admin 读脱敏内容 | 本人提交注销请求 | admin 处理状态 | 异步物理删除和备份残留策略 | 请求时撤销 refresh session、禁用 push token、结束 active couple |
| `app_feedback` | 本人读自己的提交状态；admin 读脱敏内容 | 本人提交反馈 | admin 处理状态 | 合规流程 | 敏感内容最小化；可选 couple_id 必须 active member |
| `creation_spaces` | active member 读 | 首次访问确保创建 | 宠物动作 API 更新 | 关系删除策略处理 | AI 写入只允许 worker |
| `creation_actions` | active member 读 | active member 记录互动 | 不直接编辑历史 | 可按隐私策略清理 | 可丢展示事件和必须持久事件分离 |
| `pet_memories` | active member 读低敏摘要 | worker / allowed pet API 创建 | active member toggle core/archive | 隐私删除处理 | 禁止写入正文、caption、精确位置 |
| `pet_ai_generations` | 本人或 active member 查看限流概要 | 服务端创建 | 服务端更新结果 | 过期清理 | 不保存敏感 prompt |
| `couple_footprints` | active member 读 | active member 创建 | 创建者或 active member 按产品规则更新 | 软删 | 精确位置不可进推送/AI 上下文 |

## API 校验模板

每个业务接口都按以下顺序执行：

1. 解析并验证 session，拿到 `session.user_id` 和 `session_id`。
2. 校验账号状态：未冻结、未删除、邮箱验证状态满足接口要求。
3. 读取目标资源，必要时 `SELECT ... FOR UPDATE`。
4. 校验 `couple_id` 与 active membership。
5. 校验动作角色：本人、作者、上传者、收件人、worker 或 admin。
6. 在同一事务中写入业务数据、通知、队列任务或对象元数据。
7. 返回前按响应 schema 脱敏，不返回正文给无权主体。

## 测试场景

- 用户 A 不能读取用户 B 的 `profiles` 完整资料。
- 非 active couple member 不能读取任何带 `couple_id` 的业务数据。
- 解除情侣关系后，旧成员不能继续访问原 active couple 数据。
- 拉黑并解除关系必须在同一事务里写 `blocks` 并结束 active couple。
- 账号注销请求后，当前 refresh session 必须被撤销，后续 `/api/me` 不可继续认证通过。
- 作者之外不能删除消息/信件，除非产品规则明确允许 active member 删除共同资源。
- `media_files` 知道 path 但不是 active member 时不能获取签名 URL。
- `profile_avatar_uploads` 知道 path 但不是本人或 active partner 时不能获取头像签名 URL。
- 管理员接口不能返回用户正文、照片内容、token 或精确位置。
