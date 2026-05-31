# 叶 微信小程序 v1.0

这是“叶”的微信小程序版本，主打手机端使用：

- 管理员老板：审批预约、查看学员、发布空余时间、账号管理。
- 教练：今日课程、确认出勤、提交空余时间。
- 学员：查看课时、预约课程、课程申请、查看记录。

## 当前状态

- 版本：`1.0.0`
- 小程序 AppID：先使用微信开发者工具可识别的测试占位 `touristappid`，后续在 `project.config.json` 中替换。
- 云环境 ID：先使用 `cloud1-placeholder`，后续在 `miniprogram/env.js` 和云函数环境中替换。
- 数据源：默认支持 mock 模式；接入微信云开发后由 `cloudfunctions/api` 统一处理数据。

## 本地命令

```bash
npm install
npm run validate
npm run test:rules
npm run seed:export
```

## 默认账号

- 管理员：`admin` / `1324`
- 教练：`jl001` / `1324`
- 学员：`xy001` / `1324`

第一次登录会绑定当前微信 openid；mock 模式下会模拟绑定。

## 小白启动说明

看 [docs/GETTING_STARTED.md](docs/GETTING_STARTED.md)。

## 本机工具状态

看 [docs/LOCAL_TOOLS.md](docs/LOCAL_TOOLS.md)。

## 版本记录

看 [docs/RELEASES.md](docs/RELEASES.md)。
