# 自建后端安全与运维

此文档定义 Auth、备份、监控、隐私删除和运维访问要求。`/health` 只能证明进程还活着，不能证明系统安全或可恢复。

## Auth 安全

- 邮箱注册必须验证邮箱；未验证用户只允许有限操作。
- 密码使用 Argon2id 哈希，参数随服务器能力评估并记录。
- 密码重置使用一次性 token，短 TTL，使用后立即失效。
- access token 短有效期；refresh token 必须轮换。
- refresh token 复用检测必须封禁该 session family，并记录安全事件。
- 支持单设备登出和全设备登出。
- JWT key 必须支持 rotation；旧 key 保留验证窗口，过期后撤销。
- 登录失败按账号和 IP/设备维度限流；异常登录写安全日志。
- 账号状态支持 active、frozen、deletion_requested、deleted。

## Secrets

- 服务器 `.env` 只保存在服务器本地或 secret manager，不提交仓库，不写进聊天。
- 禁止日志输出 password、token、cookie、VAPID private key、模型 API key、数据库密码。
- 内部 worker token 独立于用户 JWT，定期轮换。

## 备份与恢复

- Postgres 每日全量备份；生产切流前定义是否增加 WAL / 高频增量备份。
- MinIO 对象和 Postgres 必须能恢复到同一业务时间点。
- staging RPO 允许 24 小时；生产默认目标不超过 1 小时，正式切流前确认。
- staging RTO 目标 4 小时；生产 RTO 必须通过恢复演练确认。
- 备份必须异地保存，不只放在同一台服务器。
- 每次生产切流前做一次恢复演练：新库恢复 Postgres dump，恢复 MinIO 对象，运行一致性校验。
- 备份失败必须告警；未演练恢复的备份视为不可用。

## 监控告警

最低覆盖：

- API 5xx 数量和比例。
- API p95 / p99 延迟。
- 数据库不可用、连接池耗尽、慢查询。
- Redis 不可用、队列堆积。
- worker job 失败、重试耗尽、推送失败率异常。
- 磁盘空间和 inode。
- MinIO 写入失败、读取失败、容量。
- Caddy 反代错误、TLS 证书续期异常。
- 备份失败或备份文件异常小。

每个请求生成 `request_id`，API、worker 和数据库操作日志要能串联。

## 日志脱敏

- 不记录消息正文、信件正文、照片内容、caption、精确位置。
- 不记录 push endpoint 完整值；只保留 hash 或后缀。
- 不记录 signed URL。
- AI prompt/context 只保留低敏摘要和 request_id。
- 管理员排障默认使用脱敏日志和元数据。

## 隐私与删除

- 账号注销流程必须冻结登录、停止推送、吊销 session、处理 active couple 和业务数据。
- 解除情侣关系后，非 active member 不得继续访问原 active couple 数据。
- 相册删除必须同时处理数据库记录和对象删除重试。
- 备份中的已删除数据需定义最长残留期；恢复后必须重放删除/注销标记。
- 管理员默认不能看用户正文和照片；任何例外必须有审计记录和明确授权。

## 运维访问

- SSH key 配好后收紧 `22/tcp` 来源。
- PostgreSQL、Redis、MinIO API 和 MinIO Console 不暴露公网。
- MinIO Console 如临时开放，必须有额外保护并及时关闭。
- 服务器重启自恢复、备份恢复、回滚脚本都要在 staging 演练。
