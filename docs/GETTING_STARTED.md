# 小白启动说明

## 你现在需要知道的

这个项目已经可以先用 mock 模式看页面和流程，不需要你马上申请 AppID。

默认账号：

- 管理员：`admin` / `1324`
- 教练：`jl001` / `1324`
- 学员：`xy001` / `1324`

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
4. AppID 当前是 `touristappid`，可先用于开发者工具本地打开；正式预览/上传前再替换真实 AppID。
5. 先保持 `miniprogram/env.js` 里的 `useMock: true`，这样不需要云环境也能看流程。

## 接入真实云开发

1. 在微信开发者工具里开通云开发环境。
2. 复制云环境 ID。
3. 修改 `miniprogram/env.js`：

```js
module.exports = {
  version: "1.0.4",
  envId: "你的云环境ID",
  useMock: false
};
```

4. 上传并部署 `cloudfunctions/api`。
5. 把 `npm run seed:export` 生成的 `dist/cloudbase-seed/*.json` 按集合导入云数据库。详细看 [IMPORT_SEED.md](IMPORT_SEED.md)。

## 上传体验版

真实 AppID 和上传密钥准备好后：

```powershell
$env:WX_APPID="你的AppID"
$env:WX_PRIVATE_KEY_PATH="D:\课表\ye-swim-wx-v1.0\private.key"
npm run ci:preview
```

如果你不会做这一步，让 Codex/Hermes 提醒我接手即可。
