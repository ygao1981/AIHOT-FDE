# 交给 Codex：检查机器并部署 FDE 研究台

将下面整段交给目标机器上的 Codex。它先做只读评估，再完成合适的安装。不要把登录口令、API key、设备码或数据库发到对话中。

---

请接手我的个人 FDE 研究台，并在你实际能够访问的机器上评估和部署。

## 项目与目标

- 仓库：`https://github.com/ygao1981/AIHOT-FDE`
- 分支：`codex/fde-workbench-v2`
- 当前运行入口：`fde-workbench/`
- 用途：个人 FDE/企业 AI 落地研究，积累微信公众号选题和原文证据。
- 我的 VPS 是 Linux，已经有 MariaDB，之前磁盘紧张。你必须用本次实测判断是否能部署，不能沿用旧估算。
- 我计划在目标机器登录自己的 ChatGPT 账号，使用官方 Codex CLI 分析文章。默认按这个路径准备；若账号另有可用 API 权益，请说明区别，由我选择，不自动切换。

先读取根 `CHECKPOINT.md`、根和子目录 `AGENTS.md`、子目录 README，然后读 `docs/CODEX_HANDOFF.md`、`docs/ARCHITECTURE.md`、`docs/SOURCES.md`、`docs/MODEL_USAGE.md`、`docs/DEPLOYMENT.md`、`docs/OPERATIONS.md`、`docs/VALIDATION.md`。后续文档路径均相对 `fde-workbench/`。先报告实际分支和提交，不把旧版 root Compose 当成本版。

## 第一步：判断机器是否合适

只读检查操作系统、CPU 架构、CPU、MemAvailable、磁盘可用空间、inode、数据目录挂载点、Node/npm、3210 端口和已有服务。明确你检查的是我的 VPS 还是当前本机；无法访问 VPS 时不能替它下结论。

建议试运行余量为：原生 API/off 至少 768 MiB 可用内存，Codex CLI 至少 1 GiB；数据所在盘至少 2 GiB 可用空间。它们是起步建议，不是峰值保证。给现有 MariaDB 和其他应用留余量。资源不够就优先在本机完成试运行，并输出 VPS 尚缺什么。

不要自动删除数据、清理整个 Docker、替换其他服务的 Node、停止 MariaDB 或改数据库端口。本版是 SQLite，不需要 PostgreSQL、MariaDB 连接、Redis 或 GPU。优先原生部署；已有 Docker 且资源足够时才考虑文档中的单服务 Compose。

## 第二步：完成安全的基础部署

如果已有仓库，先检查未提交改动和运行版本，不覆盖。首次下载指定分支；记录实际 commit。使用独立目录、数据目录和合适的运行用户。

准备 Node.js 24.22.1 或更新的 24.x，核对平台和官方发行来源。进入 `fde-workbench/`，执行：

```bash
npm ci --ignore-scripts
npm run init
npm run doctor
npm run check
npm test
npm audit --omit=dev
```

已有 `.env` 不覆盖；缺失设置按示例补齐。默认保持：

```dotenv
FDE_COLLECT_ENABLED=false
FDE_ANALYSIS_ENABLED=false
FDE_AUTO_ANALYZE=false
FDE_MODEL_PROVIDER=off
```

先完成页面登录、人工导入一份非敏感资料、笔记保存、重启持久化、健康检查和安全备份。不要在输出中显示口令或环境变量全量。VPS 优先只监听回环地址并使用 SSH 隧道；已有 HTTPS 反向代理时按实际域名配置 Host/Origin。

## 第三步：验证来源

阅读来源目录和审核状态。首批自动源为美团技术团队、Microsoft Frontier Engineering、Anthropic Engineering、LangChain 客户案例、Hamel、Eugene Yan、Shopify Engineering、Dify 中文博客、Palantir 博客。

运行 `npm run sources:check`，记录成功、受限和正文/日期结果。Palantir 的 feed 正文可能只是部分内容，不将它描述成完整原文。Datawhale 教程和 FDE100 作为人工/观察入口，不把 release notes 当生产案例。

仅开启采集，保持模型关闭，观察候选质量。首次采集和历史文章需要人工选择，不批量追溯历史。

## 第四步：准备官方 Codex CLI

按官方文档安装 CLI，记录并固定实际验证版本。为研究台创建专用登录目录；使用同一个系统运行用户完成官方登录。无桌面 VPS 可以使用官方支持的设备登录。

让我本人在官方页面完成登录；不要读取、复制、展示或转换 auth.json 中的令牌，不要求我把设备码发到聊天。不复用含有其他项目 MCP、插件或记忆设置的登录目录。

设置绝对路径 `FDE_CODEX_BIN`、`FDE_CODEX_HOME`。手工登录命令中的官方变量是 `CODEX_HOME`，不要混淆。运行 `npm run doctor -- --codex`，先确认版本、参数和登录状态。这一步不调用模型。

如果当前官方 CLI 与适配器的参数不兼容，先核对 `codex exec --help` 和官方文档，修复后运行相关测试；不要删掉只读限制、工具关闭、环境隔离、任务收据和预算保护来强行通过。

若我明确选择 API，则只走官方 Responses API，私下配置 API key、实际可用模型及最新单价，保留美元月预算。不要将 ChatGPT 登录令牌当作 API key，也不自动从 CLI 失败转 API。

## 第五步：只验收一篇真实分析

确认账号就绪后设置所选 provider，开启分析，保持 `FDE_AUTO_ANALYZE=false`、`FDE_DAILY_LIMIT=1`。手动选择一篇与 FDE 交付相关的资料。

核对：

- 分析前先产生持久化 attempt；成功后有结构化结果和真实可定位引文。
- 原文没有披露的部署阶段、ROI 或客户数字不能被补造。
- UI 的 API 美元估算和 Codex 未知金额正确区分；账户用量另行核对。
- 重复打开页面、保存笔记、导出及普通重复排队不增加模型调用。
- 失败/超时暂停，保留可能已消耗的记录，不自动重试。
- 重启保留资料与用量；备份能独立读取。

不要为测试重试机制额外消耗我的额度；使用现有自动测试的假服务验证失败分支。只有这篇验收通过后，再建议是否提高每日次数。暂不启用自动分析，不生成或自动发送公众号文章。

## 第六步：交付与后续接手

输出实际部署机器、commit、服务入口、数据位置、所选模型方式、已执行检查、资源实测、已知限制、启动/停止/更新/备份方法。日志和截图不得带凭据。

更新根 `CHECKPOINT.md` 和 `docs/VALIDATION.md`。明确区分真正通过的测试、使用假服务的测试、未完成的真实账号/浏览器/Docker 验收。

如果我尚未登录，先完成所有不需要登录的安装与检查，再给我准确的官方登录步骤。除需要我本人登录或确实会影响现有服务的动作外，持续完成已授权的工作，不停在计划或命令建议上。
