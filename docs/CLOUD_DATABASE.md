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
- `leaveRequests`：学员请假申请和审批状态。
- `makeupCredits`：请假通过后生成的补课额度和补课排课状态。
- `lessonFeedbacks`：课后反馈标签、备注和成长记录。
- `auditLogs`：关键操作日志。
- `settings`：老板每周排课模板等云端运营配置。

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

## 鉴权环境变量

- `YE_SWIM_SEED_SECRET`：必填，使用随机长密钥；上传云函数和导入种子数据时必须显式提供。
- `YE_SWIM_ALLOW_ADMIN_BOOTSTRAP`：默认 `false`，只用于空库受控初始化。
- `YE_SWIM_ALLOW_ADMIN_REBIND`：默认 `false`，只用于老板账号紧急换绑。
- `YE_SWIM_ENABLE_TEST_LOGIN`：正式环境保持 `false`。
- `YE_SWIM_ENABLE_SEED_IMPORT`：默认 `false`；导入期间临时开启，完成后立即关闭。

业务会话不信任客户端传入的角色或账号对象；云函数会按账号重新读取角色，并要求账号绑定的 `openid` 与当前微信一致。
