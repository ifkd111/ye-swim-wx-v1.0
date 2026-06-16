# 小白启动说明

## 你现在需要知道的

这个项目已经切到真实微信云开发环境；如果只是本地看页面，可以临时把 `miniprogram/env.js` 的 `useMock` 改回 `true`。

默认账号：

- 管理员：`yeats` / `1324`
- 教练：`jl001` / `1234`
- 学员：`xy001` / `1234`

## 电脑上验证

在 PowerShell 里进入项目：

```powershell
cd D:\ye-swim\ye-swim-wx-v1.0
npm install
npm run validate
npm run test:rules
npm run seed:export
```

## 用微信开发者工具打开

1. 打开微信开发者工具。
2. 选择“导入项目”。
3. 项目目录选择：`D:\ye-swim\ye-swim-wx-v1.0`。
4. AppID 当前已配置为 `wx7f2d509804954eaf`。
5. 当前 `miniprogram/env.js` 使用真实云环境；云函数已支持首次 `yeats / 1324` 登录时自动初始化示例数据。

## 接入真实云开发

1. 在微信开发者工具里开通云开发环境。
2. 复制云环境 ID。
3. 修改 `miniprogram/env.js`：

```js
module.exports = {
  version: "1.0.10",
  envId: "cloudbase-d6ge373q7724bcfe4",
  useMock: false
};
```

4. 上传并部署 `cloudfunctions/api`。
5. 首次用 `yeats / 1324` 登录时，如果云数据库还是空的，云函数会自动初始化示例数据；手动导入方式见 [IMPORT_SEED.md](IMPORT_SEED.md)。

## 上传体验版

代码上传密钥准备好后：

```powershell
npm run ci:preview
npm run ci:upload -- --key=D:\ye-swim\ye-swim-private-backup\private.wx7f2d509804954eaf.key --uv=1.0.10 --ud=v1.10正式版稳定安全升级
```

当前 `1.0.10` 用真实云环境联调。正式上线还需要在微信公众平台设置体验版、提交审核并发布。
