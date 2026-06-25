# 自建后端切流与回滚

生产切换必须单独确认。只要 selfhost 还没有通过权限、约束、备份、恢复、监控和业务验收，Supabase 继续作为生产权威源。

## 环境与权威源

| 阶段 | 用户入口 | 后端权威源 | 数据写入 |
|---|---|---|---|
| 当前生产 | `tongpin.fancah.tech` 静态 Web | Supabase | Supabase |
| Selfhost staging | 白名单 / 测试账号 | Selfhost staging | Selfhost staging |
| 灰度切流 | 白名单真实用户 | 按用户分组决定 | 已切用户 selfhost，未切用户 Supabase |
| 全量切流观察期 | `tongpin.fancah.tech` | Selfhost | Selfhost，Supabase 保留只读观察 |

## 前置条件

- `docs/supabase-usage-inventory.md` 中目标阶段的直连已清理。
- `docs/self-host-authorization-map.md` 权限测试通过。
- `docs/self-host-data-constraints.md` 并发和约束测试通过。
- 旧 Supabase 用户数据必须先完成 dry-run、导入、对账和 Storage 清单迁移校验；没有 `migrate-supabase-data` 成功报告不得切流。
- Postgres + MinIO 恢复演练通过。
- 监控和告警已覆盖 API、DB、Redis、worker、备份、磁盘、MinIO。
- 已定义切流窗口、回滚窗口、负责人和沟通文案。

## 旧数据零丢失迁移门禁

迁移不是清空重开。原 Supabase 上的用户、情侣关系、相册、留言、胶囊、信件、通知、推送偏好、家园和隐私/反馈数据必须保留或同步迁到 selfhost，且必须用报告证明。

### 必须保留的主键

- 用户主键必须沿用 Supabase `profiles.id`，导入 selfhost 时同一个 UUID 同时写入 `app_auth.accounts.id` 和 `public.profiles.id`。
- `couples.id`、业务表 `id`、`couple_id`、`user_id`、`sender_id`、`author_id`、`recipient_id`、`created_by` 等外键必须保持原值。
- Storage path 必须保持原值；signed URL 不迁移。
- 旧 Supabase Auth 密码不反解、不复制。迁移后账号用占位密码哈希创建，用户通过 selfhost 密码重置邮件激活登录。

### 执行命令

所有真实连接串只放在本地 shell 或服务器 `.env`，不要提交到仓库，不要写进聊天。

服务器 `/opt/tongpin` 下推荐用编排脚本执行，默认只跑 preflight + dry-run，不写目标库：

```bash
cd /opt/tongpin
bash scripts/run-supabase-migration.sh

# 只有确认 preflight/dry-run 和备份窗口后，才执行真实写入与 Storage 复制
bash scripts/run-supabase-migration.sh --apply
```

编排脚本严格按 preflight、dry-run、backup、DB apply、Storage copy、final verify、post-migration smoke 顺序执行；任一步失败都会停止。`--skip-smoke` 只允许在同一 API 构建刚跑过等价冒烟时使用，并且必须保留最近通过的冒烟日志。下面是拆开执行的等价命令：

```bash
# 0. 前置检查：确认 Supabase DB、selfhost DB、Supabase Storage S3 和 MinIO 凭证/表/bucket 都可用。
#    输出只包含变量名和检查项，不打印任何连接串、密码或 S3 secret。
SUPABASE_DB_URL="postgresql://..." \
SELF_HOST_DB_URL="postgresql://..." \
SUPABASE_STORAGE_S3_ENDPOINT="https://<project-ref>.storage.supabase.co/storage/v1/s3" \
SUPABASE_STORAGE_S3_REGION="..." \
SUPABASE_STORAGE_S3_ACCESS_KEY_ID="..." \
SUPABASE_STORAGE_S3_SECRET_ACCESS_KEY="..." \
npm run migrate:supabase:preflight -w @tongpin/server

# 1. 只读 dry-run：读取 Supabase 和 selfhost，生成迁移预演报告，不写入目标库。
#    这一步的 DB verify gate 是 preview-only；目标库尚未导入旧数据时出现 mismatch warning 是正常的。
SUPABASE_DB_URL="postgresql://..." \
SELF_HOST_DB_URL="postgresql://..." \
npm run migrate:supabase:data -w @tongpin/server

# 2. 切流窗口前：先备份 selfhost 目标库和 MinIO
ssh -i ~/Desktop/codex.pem -o IdentitiesOnly=yes ubuntu@81.71.9.118
cd /opt/tongpin && bash scripts/backup-all.sh

# 3. 导入：显式 --apply 才写入 selfhost，同时生成 Storage 对象清单
SUPABASE_DB_URL="postgresql://..." \
SELF_HOST_DB_URL="postgresql://..." \
npm run migrate:supabase:data:apply -w @tongpin/server

# 4. Storage 复制：需要 Supabase Storage S3 凭证和 MinIO 凭证，逐对象同名 path 复制
SUPABASE_DB_URL="postgresql://..." \
SELF_HOST_DB_URL="postgresql://..." \
SUPABASE_STORAGE_S3_ENDPOINT="https://<project-ref>.storage.supabase.co/storage/v1/s3" \
SUPABASE_STORAGE_S3_REGION="..." \
SUPABASE_STORAGE_S3_ACCESS_KEY_ID="..." \
SUPABASE_STORAGE_S3_SECRET_ACCESS_KEY="..." \
npm run migrate:supabase:data:copy-storage -w @tongpin/server

# 5. 复核：只读对账，确认源/目标 DB count/hash 匹配，并 HEAD 校验 Storage 对象
SUPABASE_DB_URL="postgresql://..." \
SELF_HOST_DB_URL="postgresql://..." \
SUPABASE_STORAGE_S3_ENDPOINT="https://<project-ref>.storage.supabase.co/storage/v1/s3" \
SUPABASE_STORAGE_S3_REGION="..." \
SUPABASE_STORAGE_S3_ACCESS_KEY_ID="..." \
SUPABASE_STORAGE_S3_SECRET_ACCESS_KEY="..." \
npm run migrate:supabase:data:verify -w @tongpin/server

# 6. 迁移后冒烟：确认认证、个人资料、相册、留言、首页、通知和隐私链路仍可用。
#    这些 smoke 会写入少量 disposable 测试数据；迁移对账只校验 Supabase 旧数据子集，允许目标库存在额外 smoke 行。
API_BASE_URL=https://api-staging.fancah.tech npm run smoke:auth -w @tongpin/server
API_BASE_URL=https://api-staging.fancah.tech npm run smoke:profile -w @tongpin/server
API_BASE_URL=https://api-staging.fancah.tech npm run smoke:storage -w @tongpin/server
API_BASE_URL=https://api-staging.fancah.tech npm run smoke:messages -w @tongpin/server
API_BASE_URL=https://api-staging.fancah.tech npm run smoke:dashboard -w @tongpin/server
API_BASE_URL=https://api-staging.fancah.tech npm run smoke:notifications -w @tongpin/server
API_BASE_URL=https://api-staging.fancah.tech npm run smoke:privacy -w @tongpin/server
```

脚本默认输出到 `migration-artifacts/supabase-to-self-host/latest-report.json`，并生成带时间戳的历史报告。报告必须归档到服务器安全目录或加密备份位置；不要提交，因为可能含表级业务规模和对象 path。

报告里的 `gates.dbVerify` 在 dry-run 下应为 `preview-only`；只有 `migrate:supabase:data:apply`、`migrate:supabase:data:copy-storage` 和 `migrate:supabase:data:verify` 阶段会把 DB count/hash mismatch 当作失败。生产切流只能以最终 `migrate:supabase:data:verify` 的 `status=ok` 作为数据完整性证据。
`migrate:supabase:preflight` 只是配置与连通性门禁，不替代 dry-run/apply/verify。

### Storage 迁移要求

- `latest-report.json` 和 `storage-objects.json` 会列出 `couple-media`、`profile-avatars` 两类对象。
- Supabase Storage S3 的 endpoint 形如 `https://<project-ref>.storage.supabase.co/storage/v1/s3`，region、access key 和 secret 从 Supabase Storage S3 配置页获取，只能放本机 shell 或服务器 `.env`。
- `npm run migrate:supabase:data:copy-storage -w @tongpin/server` 会逐个 bucket 同名 path 写入 MinIO，不得改变 path；已有目标对象会跳过，后续 verify 仍会校验大小和抽样 hash。
- 导入 DB 前后都要确认对象数量；生产切流前必须通过 `npm run migrate:supabase:data:verify -w @tongpin/server` 的 Storage HEAD 校验和抽样 hash。
- 如果 DB 已导入但 Storage 对象缺失，必须暂停切流；不能让用户进入缺图状态。

### 对账失败处理

- 任一表 `sourceHash != targetHash`、源/目标 count 不一致、Storage 清单数量异常，切流立即停止。
- 不允许靠手工猜测修正情侣关系或 user_id；必须修正映射脚本后重跑 dry-run 和 apply。
- 若 selfhost 已产生新写入，再发现旧数据缺失，禁止直接回滚 DNS；必须先导出 selfhost 新写入并制定补偿方案。

## 灰度方案

- 第一批只允许测试账号。
- 第二批允许白名单真实用户；白名单必须在服务端控制，不能只靠前端隐藏。
- 第三批按用户或 couple 分组灰度，避免情侣两端落到不同后端。
- 切流单位优先是 couple；同一个 active couple 的双方必须使用同一权威源。

## 回滚规则

- 未产生 selfhost 新写入前，可通过配置回滚到 Supabase。
- 一旦 selfhost 对真实用户产生新写入，禁止简单 DNS 或环境变量回滚。
- 回滚前必须处理 selfhost 新数据：
  - 可补偿迁回 Supabase 的，执行补偿脚本并校验。
  - 不能可靠补偿的，必须明确丢弃范围并由用户确认。
  - 冲突数据按阶段权威源判定，不能双边猜测合并。
- 回滚后要冻结 selfhost 写入，导出差异报告，再决定是否二次切流。

## 数据一致性

- 切流期间必须记录每个用户/couple 的 backend assignment。
- Supabase 和 selfhost 不能同时接受同一 couple 的业务写入，除非设计了完整双写和冲突处理。
- 不建议第一版做双写；优先白名单迁移和单权威源。
- Storage 对象迁移以 path、对象字节数、抽样 hash 校验；signed URL 不迁移。

## 切流步骤

1. 冻结目标白名单用户在 Supabase 的写入窗口，或确保其请求路由到单一后端。
2. 运行 `npm run migrate:supabase:data -w @tongpin/server` dry-run，确认源表可读、目标表存在、报告无 error。
3. 执行 selfhost Postgres + MinIO 全量备份。
4. 运行 `npm run migrate:supabase:data:apply -w @tongpin/server` 导入 DB 并生成 Storage 对象清单。
5. 运行 `npm run migrate:supabase:data:copy-storage -w @tongpin/server`，按 `storage-objects.json` 迁移 Supabase Storage 对象到 MinIO。
6. 运行 `npm run migrate:supabase:data:verify -w @tongpin/server`，确认 DB count/hash 对账、Storage HEAD 和抽样 hash 通过。
7. 运行迁移后 API 冒烟，确认认证、个人资料、相册、留言、首页、通知和隐私链路仍可用。
8. 更新 backend assignment 或发布 selfhost-only 前端。
9. 让白名单用户登录 selfhost Auth；旧密码不迁移，走重置密码或迁移激活。
10. 观察日志、告警、业务事件和用户反馈。
11. 满足观察窗口后扩大范围。

## 验收

- 白名单 couple 双方能登录、绑定状态一致、dashboard 正常。
- Supabase 旧数据导入报告 `status=ok`，关键表 count/hash 匹配，Storage 对象清单已迁入 MinIO。
- 迁移后 API 冒烟日志通过；若使用 `--skip-smoke`，必须说明哪一次等价冒烟覆盖了同一 API 构建。
- 留言、今日胶囊、信件、相册、通知、设置、注销/解除关系路径正常。
- 回滚演练能解释并处理切流后新增数据。
- Supabase 保持只读观察期，不立即关闭或删除项目。
