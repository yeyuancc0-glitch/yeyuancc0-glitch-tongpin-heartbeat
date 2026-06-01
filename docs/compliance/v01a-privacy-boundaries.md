# V0.1A 隐私边界

V0.1A 保持合规意识，但不把应用商店完整审核功能前置。

## 已实现或预留

- 所有情侣数据通过 `couple_id` 绑定。
- RLS 以 active couple member 为权限边界。
- 解绑后 `couples.status = ended`，`couple_members.left_at` 被写入，原 couple 不再可写。
- profile 使用 `profiles`，不和 Supabase `auth.users` 混用。
- V0.1A 不做公开社区和陌生人匹配。

## 后续阶段

V0.1B / V0.2：

- 举报。
- 拉黑。
- 账号注销。
- 内容删除。
- 隐私政策。
- 用户协议。

V1.0：

- App 内账号删除入口。
- 举报 / 屏蔽 / 内容处理流程。
- 数据安全说明。
- 应用商店审核材料。
