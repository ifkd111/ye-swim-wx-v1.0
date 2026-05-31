# 小白启动说明

## 你现在需要知道的

这个项目已经可以先用 mock 模式看页面和流程，不需要你马上申请 AppID。

默认账号：

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
npm run seed:export
```

## 用微信开发者工具打开

1. 打开微信开发者工具。
2. 选择“导入项目”。
3. 项目目录选择：`D:\课表\ye-swim-wx-v1.0`。
4. AppID 当前已配置为 `wx7f2d509804954eaf`。
5. 先保持 `miniprogram/env.js` 里的 `useMock: true`，这样不需要云环境也能看流程。

## 接入真实云开发

1. 在微信开发者工具里开通云开发环境。
2. 复制云环境 ID。
3. 修改 `miniprogram/env.js`：

```js
module.exports = {
  version: "1.0.5",
  envId: "你的云环境ID",
  useMock: false
};
```

4. 上传并部署 `cloudfunctions/api`。
5. 把 `npm run seed:export` 生成的 `dist/cloudbase-seed/*.json` 按集合导入云数据库。详细看 [IMPORT_SEED.md](IMPORT_SEED.md)。

## 上传体验版

代码上传密钥准备好后：

```powershell
npm run ci:preview
npm run ci:upload -- 1.0.5 账号密码体系修复
```

当前 `1.0.5` 开发版已经通过 `miniprogram-ci` 上传成功。正式上线还需要在微信公众平台设置体验版、提交审核并发布。
