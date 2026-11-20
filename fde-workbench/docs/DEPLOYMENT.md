# 部署：先判断本机还是 VPS

本入口只需要 Node.js 24.x 和本目录依赖。SQLite 已包含在 Node 中。**不安装 PostgreSQL，不接管 MariaDB，不需要 Redis。** 首次推荐原生运行，Docker 为可选项。

本次没有登录用户 VPS，也没有读取它的容量、进程或账单。以下容量是试运行建议，不是对目标机器的判断。

## 1. 怎样选机器

| 目标机器当前情况 | 建议 |
|---|---|
| 可用磁盘不足 2 GiB，或其他服务已有内存压力 | 先在本机试用；继续处理 VPS 容量问题 |
| 可用磁盘至少 2 GiB，可用内存至少 768 MiB | 可考虑原生 API / 关闭模型模式的小规模试运行 |
| 可用磁盘至少 2 GiB，可用内存至少 1 GiB | 可考虑原生 Codex CLI 试运行，另检查安装包和进程峰值 |
| 需要全天采集、机器长期在线 | 通过预检的 VPS 更合适 |
| 更看重省资源、低频使用、方便 Plus 登录 | 本机更合适；关机时不会采集 |

这些是空闲资源建议，不是总内存门槛或性能保证。现有 MariaDB、其他站点、系统缓存与备份都需要保留空间。CLI 内存峰值尚未使用真实账号测量。

最小 Node 进程不需要本地 GPU，也不下载大模型权重。实际会话仍通过网络调用官方服务。应用源码和依赖的开发环境测量见 [VALIDATION](VALIDATION.md)。它不包含 Node 本体、Codex CLI、Docker 镜像、数据库和备份。

数据只保存文字，不缓存图片、视频或浏览器截图。资料上限默认 10,000 条；只有未收藏、无笔记、无分析和任务收据的原始候选可按默认 60 天清理。已研究资料会持续增长。每次完整备份也会增加磁盘占用，因此 2 GiB 只是起步余量，不能当作长期容量上限。

## 2. 在目标机器预检

先只读检查系统，不安装或清理：

```bash
uname -m
cat /etc/os-release
df -h
df -i
free -h
nproc
node --version
npm --version
ss -lnt
```

缺少命令时使用该系统等效工具，不因此安装整套数据库或 Docker。记录可用内存和磁盘所在挂载点，检查 3210 端口冲突。如果已有应用依赖另一 Node 版本，给研究台单独安装 Node 24.x 并使用绝对路径，不直接替换全机运行时。

Node 安装按目标系统选择官方发行包或现有版本管理器；核对架构、官方校验和和维护版本。本版最低 24.22.1，在 24.22.3 验证。参见 [Node 官方下载](https://nodejs.org/en/download)。不要把当前开发环境的预检输出当成 VPS 的结果。

## 3. 下载与安全启动

首次下载：

```bash
git clone --branch codex/fde-workbench-v2 --single-branch https://github.com/ygao1981/AIHOT-FDE.git
cd AIHOT-FDE/fde-workbench
npm ci --ignore-scripts
npm run init
npm run doctor
npm run check
npm test
npm start
```

如果机器已经有本仓库，先记录 `git status` 与当前提交，保留未提交修改，再按 [OPERATIONS](OPERATIONS.md) 更新。不要在根目录执行旧版 Compose 来安装本入口。

初始化生成本目录 `.env` 和独立随机登录口令。配置中默认采集和模型都关闭。口令只在本人终端查看。首次访问 `http://127.0.0.1:3210`，健康接口为 `/api/health`。

### 从自己的电脑访问 VPS

服务默认只监听 VPS 的回环地址。优先使用 SSH 隧道，在自己的电脑上执行：

```bash
ssh -N -L 3210:127.0.0.1:3210 your-user@your-vps
```

浏览器打开 `http://127.0.0.1:3210`。如果本机端口已占用，调整隧道本地端口，并把工作台 `FDE_BASE_URL` 改为实际浏览器访问地址后重启，否则 Host / Origin 校验会拒绝请求。

如果已有 HTTPS 反向代理，设置 `FDE_BASE_URL=https://你的域名`，代理到回环端口，并保留 Host。仍需工作台登录，不向公网开放数据库或 Codex 登录目录。不要在没有 HTTPS 的公网地址输入口令。

## 4. 先采集，再选模型

编辑本目录 `.env`，先只开启：

```dotenv
FDE_COLLECT_ENABLED=true
FDE_ANALYSIS_ENABLED=false
FDE_AUTO_ANALYZE=false
FDE_MODEL_PROVIDER=off
```

重启后，后台按各来源间隔采集；界面的采集按钮也遵守这个间隔。初次列表最多取每源配置数量，不回填所有历史。首次采集、旧文章和日期未知资料标为历史候选，需要人工选择分析。

诊断来源可以运行 `npm run sources:check`；只访问公开信源，不写资料库，不调用模型。某站受限时按 [SOURCES](SOURCES.md) 改用人工阅读与正文粘贴，不绕过站点限制。

### A. 使用已登录 ChatGPT 的官方 Codex CLI

1. 采用官方安装方式，核对 `codex --version`，固定实际验证的版本。官方文档：[CLI](https://developers.openai.com/codex/cli)、[认证](https://developers.openai.com/codex/auth)。本次只核验了开发环境 `0.172.0-alpha.2` 的参数，不把它指定为长期推荐版本。
2. 创建专用、仅运行用户可读写的目录，例如 `/var/lib/fde-workbench/codex-home`。不要复用包含其他项目 MCP/插件配置的目录，不复制登录文件。
3. 以实际运行研究台的系统用户执行官方登录。在无桌面 Linux 上可以尝试官方设备登录：

```bash
CODEX_HOME=/var/lib/fde-workbench/codex-home /实际绝对路径/codex login --device-auth
```

在自己的浏览器完成官方登录。设备码、登录文件和令牌均不放入聊天、源码或日志。若账号要求其他官方认证流程，按 CLI 提示处理，不通过 API key 模拟 Plus 登录。

4. 配置工作台：

```dotenv
FDE_MODEL_PROVIDER=codex
FDE_CODEX_BIN=/实际绝对路径/codex
FDE_CODEX_HOME=/var/lib/fde-workbench/codex-home
FDE_CODEX_MODEL=
FDE_ANALYSIS_ENABLED=false
FDE_AUTO_ANALYZE=false
FDE_DAILY_LIMIT=1
```

`FDE_CODEX_HOME` 是工作台配置名；手动登录 CLI 时使用官方的 `CODEX_HOME`。两者指向同一个专用目录。模型留空代表账户默认模型，明确填写账户支持的模型更便于比较用量。

5. 执行 `npm run doctor -- --codex`。它只检查版本、参数和登录状态，不提交模型任务。通过后改为 `FDE_ANALYSIS_ENABLED=true` 并重启，人工选择一篇文章验收。

CLI 任务使用官方会话和其额度规则。它没有与 API 等同的美元预算硬上限；工作台限制尝试次数与时间，并记录 CLI 提供的用量。失败不会自动切换到 API。详见 [MODEL_USAGE](MODEL_USAGE.md)。

### B. 使用官方 Responses API

若使用者确认有可用的官方 API key/额度，并选择 API 模式，在目标机器私下填写：

```dotenv
FDE_MODEL_PROVIDER=api
OPENAI_API_KEY=在本机填写真实密钥
FDE_API_MODEL=账户可用的模型
FDE_API_INPUT_PRICE=对应官方输入单价
FDE_API_OUTPUT_PRICE=对应官方输出单价
FDE_MONTHLY_BUDGET_USD=10
FDE_DAILY_LIMIT=1
FDE_ANALYSIS_ENABLED=true
FDE_AUTO_ANALYZE=false
```

单价单位为美元/百万 token。示例文件带有核验日期与当时默认模型价格；更换模型必须同步核对价格。不能将 ChatGPT 订阅、Codex 额度和 API 余额直接等同，也不假定某一套餐必然含 API 权益。

## 5. Linux 常驻服务

模板见 [`deploy/fde-workbench.service`](../deploy/fde-workbench.service)。先前台启动成功，再配置常驻服务。

模板假设代码在 `/opt/fde-workbench/fde-workbench`，Node 在 `/usr/bin/node`，使用独立 `fde` 用户，数据目录为 `/var/lib/fde-workbench`。部署者必须核对并调整这些路径，创建对应目录并授予 `fde` 必要权限；不要直接复制模板后启动不存在的路径。

- 代码由部署者管理，服务只需读代码和配置，写独立数据目录。
- `.env` 对服务可读但不对其他普通用户公开。systemd 的 `EnvironmentFile` 不依赖交互式 shell。
- 在同一份 `.env` 中明确设置 `FDE_DATA_DIR=/var/lib/fde-workbench`，让服务、doctor、备份和导出指向同一个库；不要只在 unit 里另设一个路径。
- 模板 `ProtectHome=true`；不要将 Node 或 Codex 可执行文件放在受保护的个人 home 中。选择服务可访问的绝对路径。
- API / off 模式默认内存上限 768 MiB；CLI 试运行可调整为 1280 MiB，并再次检查整机余量。这是限制值，不是实测峰值。
- 先 `systemd-analyze verify` 检查调整后的 unit，再 `systemctl daemon-reload`，启用并查看该服务状态。
- 更新配置后重启研究台。不要重启无关的 MariaDB 或其他站点。

异常退出可能遗留实例锁。服务会拒绝再次启动而不是冒险多开；按 [OPERATIONS](OPERATIONS.md) 核实后处理锁。不要用无限重启掩盖失败。

## 6. 可选 Docker

只有目标机器已经采用 Docker 且空间足够时才考虑。镜像和构建缓存的占用高于原生方案。基础镜像、健康检查与容器内备份已在 GitHub CI 通过，见 [VALIDATION](VALIDATION.md)。这不替代目标 VPS 检查；真实 Codex 版本与容器登录仍需目标机器验证。

在本目录初始化 `.env` 后，API / off 模式运行：

```bash
docker compose config --quiet
docker compose up -d --build
docker compose ps
```

配置校验使用 `--quiet`，避免把展开后的 `.env` 密钥打印出来。此 Compose 只有一个服务和 SQLite 命名卷，没有数据库容器。默认端口仅绑定宿主机 `127.0.0.1`。

Codex 模式额外设置 `.env` 中 `FDE_CODEX_VERSION` 为实际验证的精确官方版本，`FDE_CODEX_HOST_DIR` 为已创建的独立绝对目录；确保容器 `node` 用户有权限。随后：

```bash
docker compose -f compose.yml -f compose.codex.yml config --quiet
docker compose -f compose.yml -f compose.codex.yml build
docker compose -f compose.yml -f compose.codex.yml run --rm --no-deps -e CODEX_HOME=/codex app codex login --device-auth
docker compose -f compose.yml -f compose.codex.yml run --rm --no-deps app node scripts/doctor.mjs --codex
docker compose -f compose.yml -f compose.codex.yml up -d
```

先保持分析关闭，登录和诊断成功后再开启。若固定版本安装脚本或二进制布局与当前 Dockerfile 不兼容，应停止并修正，不以危险权限选项绕过。不要运行 `down -v` 删除数据卷。

**容器资料位于 `/app/.data` 的命名卷，不能用宿主机 `npm run backup` 备份。** 基础 Compose 在运行中的容器内执行：

```bash
docker compose exec -T app node scripts/manage.mjs backup
```

Codex 组合部署保留两个 `-f`：

```bash
docker compose -f compose.yml -f compose.codex.yml exec -T app node scripts/manage.mjs backup
```

快照保存在容器 `/app/.data/backups/`；按 [运维文档](OPERATIONS.md#docker在运行中的容器内备份) 使用相同 Compose 组合的 `cp` 命令复制实际生成的文件到私有位置，并独立验证。Markdown 导出位于容器 `/app/.data/exports/`。不要直接复制运行中的主数据库，也不要把宿主机另一份资料库当作容器数据。

## 7. 最小验收

完成登录、人工导入、笔记保存、来源启停和重启保留数据。保持模型关闭验证这些操作不产生 attempt。然后只选一篇资料分析，核对引文、阶段和账户用量；再次打开或普通排队应复用缓存，不产生第二次模型调用。最后完成一次安全备份并确认可独立读取。

真实模型验收需要账号本人完成登录；不要以缺少账号为由跳过其余已能完成的安装和检查。完整交接提示词见 [CODEX_DEPLOY_PROMPT](CODEX_DEPLOY_PROMPT.md)。
