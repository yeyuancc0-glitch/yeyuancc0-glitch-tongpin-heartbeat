# V0.1B 验收标准

## 用户路径

1. 用户可上传、替换、移除个人头像。
2. 情侣绑定后，首页、我的页和资料页展示双方头像。
3. 记忆页可上传图片到相册，刷新后仍可通过 signed URL 查看。
4. 用户可写一封信，选择立即送达或指定未来日期送达。
5. 收信方会看到来信提醒；未到时间只显示信封和开启时间，到时间后可读正文。
6. 关闭来信提醒后，信件仍在记忆页对应日期显示小信封。
7. 留言、今日胶囊、日历事件和信件可产生站内通知。
8. 用户可提交举报、拉黑并解除关系、申请账号注销。

## 功能验收

- Storage bucket `profile-avatars` 和 `couple-media` 必须为 private。
- 数据库只保存 Storage path，不保存 signed URL。
- 信件底层可继续使用 `future_letters`，产品和前端文案统一叫“信件”。
- 锁定信件只能通过自建 letters API 返回安全预览，正文为 `null`。
- 头像只允许本人上传/替换/移除；本人和当前 active partner 可查看。
- 相册第一版只支持图片，不支持视频。
- 注销账号在当前 self-host 路线中记录申请、标记 profile、撤销 refresh session，并禁用推送 token；旧 Supabase Auth 用户只作为迁移来源/回滚参照保留观察。

## 验证命令

```bash
npm run typecheck
npm run build:web
```

云端联调前：

```bash
npm run check:env
npm run db:apply
```

`npm run db:apply` 当前连接自建服务器执行 `/opt/tongpin/scripts/apply-db-migrations.sh`，不再应用 Supabase migration。

权限验收参考：

```text
packages/db/tests/rls_acceptance.sql
```
