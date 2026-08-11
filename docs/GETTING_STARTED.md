# 小白启动说明

## 你现在需要知道的

这个项目已经切到真实微信云开发环境；如果只是本地看页面，可以临时把 `miniprogram/env.js` 的 `useMock` 改回 `true`。

以下账号仅供本地 mock 和自动测试：

- 管理员：`yeats` / `1324`
- 教练：`jl001` / `1234`
- 学员：`xy001` / `1234`

## 电脑上验证

在 PowerShell 里进入项目：

```powershell
cd D:\课表\ye-swim-wx-v1.0
npm install
npm run validate
npm run test:rules
npm run test:auth
npm run test:flow
npm run seed:export
```

## 用微信开发者工具打开

1. 打开微信开发者工具。
2. 选择“导入项目”。
3. 项目目录选择：`D:\课表\ye-swim-wx-v1.0`。
4. AppID 当前已配置为 `wx7f2d509804954eaf`。
5. 当前 `miniprogram/env.js` 使用真实云环境；正式云端账号需先导入，不能依赖默认口令自动初始化。

## 接入真实云开发

1. 在微信开发者工具里开通云开发环境。
2. 复制云环境 ID。
3. 修改 `miniprogram/env.js`：

```js
module.exports = {
  version: "1.4.0",
  envId: "cloudbase-d6ge373q7724bcfe4",
  useMock: false
};
```

4. 上传并部署 `cloudfunctions/api`。
5. 用随机长值设置云函数环境变量 `YE_SWIM_SEED_SECRET`，再按 [IMPORT_SEED.md](IMPORT_SEED.md) 导入起手数据。
6. `YE_SWIM_ALLOW_ADMIN_BOOTSTRAP`、`YE_SWIM_ALLOW_ADMIN_REBIND`、`YE_SWIM_ENABLE_TEST_LOGIN` 保持 `false`；如确有应急需要，只临时开启并在完成后关闭。

## 上传体验版

代码上传密钥准备好后：

```powershell
npm run ci:preview
npm run ci:upload -- --key=你的代码上传密钥路径 --uv=1.4.0 --ud=v1.4.0三角色日程、供需匹配与板块式界面
```

当前 `1.4.0` 用真实云环境联调。正式上线还需要在微信公众平台设置体验版、提交审核并发布。
