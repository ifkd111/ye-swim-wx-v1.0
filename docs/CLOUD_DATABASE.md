# 云数据库集合

v1.0 使用这些集合：

- `accounts`：账号、角色、微信绑定、密码哈希、教练/学员绑定。
- `members`：学员档案。
- `courseProducts`：课程产品。
- `availabilitySlots`：教练空余时间。
- `bookingRequests`：预约申请。
- `schedules`：正式排课。
- `attendanceLogs`：出勤和消课。
- `courseApplications`：课程申请。
- `auditLogs`：关键操作日志。

数据库权限建议：

- 小程序端不直接读写集合。
- 所有集合默认关闭客户端写入。
- 所有业务操作通过 `cloudfunctions/api` 完成。

这样能避免学员绕过页面直接改自己的课时。

## 云函数部署

在微信开发者工具中：

1. 右键 `cloudfunctions/api`。
2. 选择“上传并部署：云端安装依赖”。
3. 等待部署成功。
4. 确认 `miniprogram/env.js` 中 `useMock` 已改为 `false`，`envId` 是你的真实云环境 ID。
