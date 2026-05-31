# 本机工具状态

## GitHub CLI

工具名：`gh`

用途：

- 创建 GitHub 仓库。
- 查看仓库状态。
- 推送/管理 release、issue 等。

当前状态：

- 已安装：`gh version 2.93.0`
- 未登录：需要运行 `gh auth login`

登录方法：

```powershell
gh auth login
```

按提示选择：

- GitHub.com
- HTTPS
- Login with a web browser

登录完成后，Codex 就可以直接使用 `gh repo create`、`gh repo view` 等命令。

本项目这次已经不用等 `gh`：仓库 `ifkd111/ye-swim-wx-v1.0` 已创建并推送完成。

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
& 'C:\Program Files (x86)\Tencent\微信web开发者工具\cli.bat' upload --project 'D:\课表\ye-swim-wx-v1.0' -v 1.0.0 -d 'ye-swim 微信小程序 v1.0'
```

注意：

- 当前 CLI 能响应，但 `open` 报 `listen EACCES: permission denied 127.0.0.1:3799`。
- 需要先在微信开发者工具图形界面里开启“服务端口/命令行自动化”。
- 开启后 Codex 可以继续用 CLI 打开、预览和上传项目。
