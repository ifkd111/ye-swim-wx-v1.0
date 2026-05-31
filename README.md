# 叶 微信小程序 v1.0

这是“叶”的微信小程序版本，主打手机端使用：

- 管理员老板：审批预约、排课、学员新增修改、账号管理、批量导入。
- 教练：本周排课、确认出勤、我的学员、可编辑空余时间助手。
- 学员：查看课时、推荐预约、本周课程、消课记录和课程申请。

## 当前状态

- 版本：`1.0.6`
- 小程序 AppID：`wx7f2d509804954eaf`
- 云环境 ID：`cloudbase-d6ge373q7724bcfe4`
- 数据源：微信云开发正式环境；所有业务写入由 `cloudfunctions/api` 统一处理，空库首次管理员登录会自动初始化示例数据。

## 本地命令

```bash
npm install
npm run validate
npm run test:rules
npm run seed:export
```

## CI 上传

CI 上传需要微信公众平台的“代码上传密钥”，不是 AppSecret。

1. 到微信公众平台 `开发管理 / 开发设置` 下载代码上传密钥。
2. 保存为项目根目录 `private.key`，这个文件已被 `.gitignore` 忽略，不会提交。
3. 如平台要求 IP 白名单，先按页面提示配置本机公网 IP，或临时关闭 IP 白名单限制。本机曾检测到 `116.230.254.110` 和 `212.87.195.173` 两条出口；如网络或代理变化，请重新查询公网 IP 后再填。

常用命令：

```bash
npm run ci:preview
npm run ci:upload -- 1.0.6 叶小程序真实云环境联调版
npm run ci:upload -- --uv=1.0.6 --ud=叶小程序真实云环境联调版
npm run ci:upload-function -- --env=cloudbase-d6ge373q7724bcfe4
npm run ci:quality
```

当前 `1.0.6` 切换到真实微信云开发环境；远端 GitHub 和 tag 按发布记录同步。

## 默认账号

- 管理员：`yeats` / `1324`
- 教练：`jl001` / `1234`
- 学员：`xy001` / `1234`

第一次登录会绑定当前微信 openid；mock 模式下会模拟绑定。

## 小白启动说明

看 [docs/GETTING_STARTED.md](docs/GETTING_STARTED.md)。

## 批量添加学员

看 [docs/BULK_IMPORT.md](docs/BULK_IMPORT.md)。

## 本机工具状态

看 [docs/LOCAL_TOOLS.md](docs/LOCAL_TOOLS.md)。

## 版本记录

看 [docs/RELEASES.md](docs/RELEASES.md)。
