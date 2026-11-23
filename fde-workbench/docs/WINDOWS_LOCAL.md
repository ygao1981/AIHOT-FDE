# Windows 本机部署与验收

> **2026-11-23 最新用户授权（覆盖旧的一篇/每天一次试运行要求）：** Windows 本机真实测试上限改为 `FDE_DAILY_LIMIT=5`，表示滚动 24 小时内**最多五次真实分析尝试**，失败和 unknown 同样计入。旧美团 unknown 回执必须保留且如仍在 24 小时内已占一次。修复验证、备份和安全核对后允许恢复暂停、逐篇测试，无须每篇重复请求授权；不得自动重试未知请求或超出总次数。先手动测试，成功且稳定后可在剩余次数内短暂开启自动分析，结束后关闭。完整操作见 [5 次真实测试接手提示词](fde-workbench/docs/CODEX_TEST_5_PER_DAY_PROMPT.md)。

当前优先方案是在 Windows 本机原生运行 FDE 研究台。Codex 桌面版用于接手代码与维护；研究台作为独立 Node 进程运行，分析时调用已配置的官方 Codex CLI。仅打开 Codex 桌面版，并不等于研究台已经在后台运行。

本版提供 Windows 路径、官方 npm 启动器、环境和进程树终止适配。实现提交 `2263556` 已在 Windows CI 通过 79 项测试，包括真实启动假 CLI 和终止子进程树；精确运行链接见 [VALIDATION](VALIDATION.md)。真实账号、目标电脑的沙箱与登录仍须按本文验收，不把假 CLI 测试写成真实 Windows 账号通过。

## 1. 先检查本机

在 PowerShell 中只读检查：

```powershell
Get-ComputerInfo | Select-Object WindowsProductName, OsArchitecture, CsTotalPhysicalMemory
Get-CimInstance Win32_OperatingSystem | Select-Object FreePhysicalMemory
Get-PSDrive -PSProvider FileSystem
Get-Command node,npm,git,codex -All -ErrorAction SilentlyContinue
Get-NetTCPConnection -LocalPort 3210 -ErrorAction SilentlyContinue
node --version
npm.cmd --version
```

需要 Node 24.22.1 或更新的 24.x。资源建议沿用 [DEPLOYMENT](DEPLOYMENT.md)，并考虑 Windows、本机其他应用及 CLI 峰值。选一个本机普通目录，避免 OneDrive 等同步目录、网络盘和程序安装目录；SQLite 及登录数据不要跨机器并发共享。

如果 PowerShell 阻止 npm.ps1，直接使用 `npm.cmd`，不要为这个项目更改整机执行策略。下文 npm 命令在该情况下全部替换为 `npm.cmd`。

## 2. 安装研究台，保持模型关闭

```powershell
git clone --branch codex/fde-workbench-v2 --single-branch https://github.com/ygao1981/AIHOT-FDE.git
Set-Location AIHOT-FDE/fde-workbench
npm.cmd ci --ignore-scripts
npm.cmd run init
npm.cmd run doctor
npm.cmd run check
npm.cmd test
npm.cmd start
```

已有目录时先检查工作区和当前服务，不能重新覆盖 `.env` 或 `.data`。浏览器访问 `http://127.0.0.1:3210`，使用本机 `.env` 中的口令登录。保持这个终端运行；另开终端执行导入、备份等命令。

先验证页面、资料导入、个人笔记、正常退出后重启，以及 `npm.cmd run backup`。这一步不需要模型登录。

### 检查本机采集代理

当 RSS 或列表报 `blocked_url` 时，先用当前运行 Node 的终端查看原域名的解析结果，并检查活动网卡、本机监听端口及代理进程。`198.18.0.0/15` 属于特殊用途地址，查询返回该网段时可继续确认是否由活动 TUN 的 Fake-IP 服务应答。 [Mihomo DNS 配置](https://wiki.metacubex.one/en/config/dns/)

```powershell
node -e "require('node:dns').lookup('tech.meituan.com',{all:true},(error,addresses)=>console.log(error?.code ?? addresses))"
Get-NetAdapter | Where-Object Status -eq Up | Select-Object Name, InterfaceDescription
Get-NetTCPConnection -State Listen -LocalAddress '127.0.0.1' | Select-Object LocalPort, OwningProcess
Get-ChildItem Env: | Where-Object Name -Match '^(HTTP|HTTPS|ALL|NO)_PROXY$' | Select-Object Name
```

如果现有可信代理提供 HTTP CONNECT，在研究台 `.env` 中将 `FDE_SOURCE_PROXY_URL` 设置为 `http://127.0.0.1:<已核实端口>`。端口和所属进程以本机实测为准。只在同机回环代理支持 CONNECT 时填写。已审核信源的 HTTPS 读取由代理解析域名，应用继续核对跳转白名单和证书。Windows DNS、TUN、路由和系统代理可沿用原配置。手工补正文仍可独立使用。 [网络安全边界](ARCHITECTURE.md)

```powershell
npm.cmd run sources:check -- --id=meituan-engineering
npm.cmd run sources:check -- --id=shopify-engineering
npm.cmd run sources:check -- --id=anthropic-engineering
```

检查结果中的 `bodyKind=page` 表示成功读取原文，`publishedAt` 为原始发表日期。确认后重启研究台，采集与模型分析可以独立开关。

## 3. 准备官方 Codex CLI

先查找已经存在的官方 CLI；存在且兼容时无需重复安装。缺失时按 [官方 CLI 文档](https://developers.openai.com/codex/cli/) 安装，核对官方包 `@openai/codex` 或官方原生发行文件，记录验证版本。[非交互文档](https://developers.openai.com/codex/noninteractive/) 说明了 `codex exec` 的结构化输出和自动化用法。

本项目支持以下绝对路径：

| 配置路径 | 如何执行 |
|---|---|
| 原生 `codex.exe` | 直接启动 |
| 标准 npm 安装的 `codex.cmd` / `codex.ps1` | 核验相邻官方包后，使用 Node 执行 `bin/codex.js`；不执行批处理或 PowerShell 脚本 |
| 官方包内 `bin/codex.js` | 核验 package 元数据后，由 Node 执行 |

任意自制 `.bat`、其他名称的 `.cmd/.ps1`、非标准包布局不在支持范围。`Get-Command codex -All` 用于定位，不应把一个旧版或其他产品的同名命令直接当作官方 CLI。

为研究台创建专用登录目录，由当前 Windows 用户使用官方 CLI 登录。以下路径为示例，须替换成刚核实的真实路径：

```powershell
$fdeCodexHome = Join-Path $env:LOCALAPPDATA 'FDEHot/codex-home'
New-Item -ItemType Directory -Force -Path $fdeCodexHome | Out-Null
$env:CODEX_HOME = $fdeCodexHome
& 'C:/实际路径/codex.cmd' login
```

使用官方页面完成本人登录。不要把 auth.json、令牌或设备码交给聊天；不要复制桌面版私有登录文件。只给自己可读写权限。登录变量 `CODEX_HOME` 与研究台配置 `FDE_CODEX_HOME` 必须指向同一专用目录。

在 `.env` 中设置真实绝对路径，示意如下：

```dotenv
FDE_MODEL_PROVIDER=codex
FDE_CODEX_BIN="C:/Users/实际用户名/AppData/Roaming/npm/codex.cmd"
FDE_CODEX_HOME="C:/Users/实际用户名/AppData/Local/FDEHot/codex-home"
FDE_ANALYSIS_ENABLED=false
FDE_AUTO_ANALYZE=false
FDE_DAILY_LIMIT=1
```

执行 `npm.cmd run doctor -- --codex`。它只运行版本、帮助及登录状态检查。参数不兼容或沙箱设置未完成时，按官方文档修复，不通过 `shell:true`、关闭系统沙箱或危险权限模式强行通过。Windows 沙箱参考 [官方说明](https://developers.openai.com/codex/windows/)。

## 4. 仅验收一篇分析

本人登录完成、非模型诊断通过后，开启分析，保持自动分析关闭和每日一次。重启研究台，在页面选择一篇真实资料，核对引文与实际账户用量；同一输入重复操作应命中缓存。

确认后可用 `npm.cmd run intake -- --file material.json --analyze` 接入其他脚本；不带该参数默认只收录。详情见 [EVENT_INTAKE](EVENT_INTAKE.md)。不要为了测试失败或重试再耗真实额度，自动测试已使用假 CLI 覆盖这些行为。

## 5. 常驻与迁移

前台试运行稳定后，再决定是否配置 Windows 任务计划程序：按登录启动研究台进程，写清工作目录、运行用户和停止方式，禁止同一数据目录多实例。当前仓库不自动注册系统任务；已有 Codex 桌面自动化不必承担每分钟检查资料的职责。

Windows 睡眠或关机会暂停采集与任务处理；不是全天在线服务。需要迁到 VPS 时，先检查 VPS 余量，再正常停服务、生成并核验 SQLite 备份，在 Linux 单实例恢复，重新完成当地官方登录。已有模型调用的真实消费不会随恢复备份而回退，迁移时先保持分析关闭。
