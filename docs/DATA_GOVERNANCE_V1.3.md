# v1.3 数据治理

## 推荐索引

- `accounts`：`account`、`phone`、`openid`、`role + status`。
- `members`：`chineseName`、`coach`、`campus`。
- `schedules`：`memberId + lessonDate`、`coach + lessonDate`、`lessonStatus + lessonDate`、`verificationCode`。
- `attendanceLogs`：`memberId + attendanceDate`、`coach + attendanceDate`、`sourceScheduleId`。
- `bookingRequests`：`memberId + status`、`slotId + status`、`status + createdAt`。
- `leaveRequests`：`memberId + status`、`scheduleId + status`、`status + createdAt`。
- `makeupCredits`：`memberId + status`、`status + createdAt`。
- `lessonFeedbacks`：`memberId + lessonDate`、`coach + lessonDate`、`scheduleId`。

## 分页方向

`getHomeData` 继续作为首页聚合接口保留；大列表后续拆到分页动作：

- `listMembers`
- `listSchedules`
- `listAttendanceLogs`
- `listBookingRequests`
- `listLessonFeedbacks`

分页默认 `pageSize: 30`，最大 `80`，按日期或创建时间倒序。

## 迁移

运行迁移前先备份云数据库。旧账号补字段不删除旧密码：

```powershell
npm run migrate:v1.3 -- --env=cloudbase-d6ge373q7724bcfe4
```

迁移目标：

- 管理员账号：`loginMode=password`。
- 教练/学员账号：`loginMode=phone`，有 `openid` 则 `bindingStatus=bound`，否则 `pending`。
- 手机号为空的旧教练/学员账号保留可用，但后台保存时会要求补手机号。
