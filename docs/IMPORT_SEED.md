# 导入初始化数据

运行：

```powershell
cd D:\课表\ye-swim-wx-v1.0
npm run seed:export
```

会生成：

- `cloudbase.seed.json`：完整备份包，仅本地使用。
- `dist/cloudbase-seed/accounts.json`
- `dist/cloudbase-seed/courseProducts.json`
- `dist/cloudbase-seed/members.json`
- `dist/cloudbase-seed/schedules.json`
- `dist/cloudbase-seed/attendanceLogs.json`
- `dist/cloudbase-seed/availabilitySlots.json`
- `dist/cloudbase-seed/bookingRequests.json`
- `dist/cloudbase-seed/courseApplications.json`
- `dist/cloudbase-seed/auditLogs.json`

推荐直接运行自动导入：

```powershell
cd D:\课表\ye-swim-wx-v1.0
$env:YE_SWIM_SEED_SECRET="请替换为随机长密钥"
$env:YE_SWIM_ENABLE_SEED_IMPORT="true"
npm run ci:upload-function-direct -- --env=cloudbase-d6ge373q7724bcfe4
npm run ci:seed-cloud -- --env=cloudbase-d6ge373q7724bcfe4
```

脚本会先清空同名集合，再按 `accounts -> courseProducts -> members -> schedules -> attendanceLogs -> availabilitySlots` 的顺序分批导入，避免把大数据导入塞到手机登录流程里。

如果自动导入失败，也可以在微信开发者工具的云开发数据库里，按集合名称创建集合，然后手动导入对应 JSON 文件。

导入样例里的老板初始密码是 `1324`，首次登录后应立即修改。教练和学员不使用样例密码登录，而是使用老板登记的手机号完成微信手机号验证。账号规则：

- 管理员：`yeats`
- 教练：`jl001` 起
- 学员：`xy001` 起，按学员姓名拼音排序

导入完成后立即把云函数环境变量 `YE_SWIM_ENABLE_SEED_IMPORT` 改回 `false`，再用老板账号登录并修改初始密码，分别使用已登记的教练、学员手机号验证三角色页面。`YE_SWIM_SEED_SECRET` 不要写进仓库，也不要使用文档中的占位文字。
