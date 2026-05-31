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

在微信开发者工具的云开发数据库里，按集合名称创建集合，然后导入对应 JSON 文件。

默认密码是 `1324`。账号规则：

- 管理员：`admin`
- 教练：`jl001` 起
- 学员：`xy001` 起，按学员姓名拼音排序

导入完成后，先用 `admin / 1324` 登录，再用 `jl001 / 1324` 和 `xy001 / 1324` 验证。
