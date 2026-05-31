# 本机工具状态

## GitHub CLI

工具名：`gh`

用途：

- 创建 GitHub 仓库。
- 查看仓库状态。
- 推送/管理 release、issue 等。

当前状态：

- 已安装：`gh version 2.93.0`
- 已登录：`ifkd111`
- 权限包含：`repo`、`workflow`、`read:org`

登录方法：

```powershell
gh auth login
```

按提示选择：

- GitHub.com
- HTTPS
- Login with a web browser

登录完成后，Codex 可以直接使用 `gh repo create`、`gh repo view` 等命令。

本项目仓库：`https://github.com/ifkd111/ye-swim-wx-v1.0`

## 微信开发者工具

安装路径：

```text
C:\Program Files (x86)\Tencent\微信web开发者工具
```

可用命令：

```powershell
& 'C:\Program Files (x86)\Tencent\微信web开发者工具\cli.bat' --help
```

常用命令：

```powershell
& 'C:\Program Files (x86)\Tencent\微信web开发者工具\cli.bat' open --project 'D:\课表\ye-swim-wx-v1.0'
& 'C:\Program Files (x86)\Tencent\微信web开发者工具\cli.bat' preview --project 'D:\课表\ye-swim-wx-v1.0'
& 'C:\Program Files (x86)\Tencent\微信web开发者工具\cli.bat' upload --project 'D:\课表\ye-swim-wx-v1.0' -v 1.0.0 -d '叶 微信小程序 v1.0'
```

注意：

- 图形界面已经开启“服务端口/命令行自动化”。
- 当前服务端口：`32271`。
- `cli.bat` 当前版本仍会尝试占用默认 `127.0.0.1:3799`，所以自动化优先使用 HTTP 接口。
- Codex 已验证可以通过 `http://127.0.0.1:32271/open?projectpath=...` 打开项目。
- 预览二维码需要真实小程序 AppID；当前 `touristappid` 可用于本地开发，但预览会报 `appid missing`。
