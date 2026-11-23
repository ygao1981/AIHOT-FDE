# FDE 研究台：接手与修改说明

本文件适用于 `fde-workbench/`。这是用户授权的个人研究入口，不是 AIHOT 原公开站点的部署入口。开始修改前读根目录 `CHECKPOINT.md`、本目录 README 和 `docs/CODEX_HANDOFF.md`。用户本次明确需求优先；不要将旧版部署命令误套到本入口。

## 当前设计

- Node.js 24.22.1+、24.x，ES modules；SQLite 使用 Node 内置接口。
- 独立 package 和 lockfile，不加入根目录 workspaces。
- 一个 HTTP 服务和串行 worker；同一数据目录只运行一个研究台实例。
- 私有资料库，所有资料与公众号草稿接口需要登录。支持草稿写作和排版，没有公共发布层或公众号发布接口。
- 旧版 PostgreSQL 数据不自动迁入，不停止其他服务，不改变 MariaDB 配置。

## 必须保留的行为

1. 默认 `FDE_COLLECT_ENABLED=false`、`FDE_ANALYSIS_ENABLED=false`、`FDE_AUTO_ANALYZE=false`、`FDE_MODEL_PROVIDER=off`。
2. 页面读取、搜索、笔记、导出不触发模型。模型只能由 worker 经过持久化次数与预算检查后执行。
3. `api` 与 `codex` 必须显式选择，不自动回退。CLI 金额未知，不展示为零元。
4. 发送前保存 attempt 与预算预留；失败或中断不自动重发。人工重试仍需新 attempt、次数和预算检查。
5. 正文、配置、提示词或 Schema 改变时，缓存不能误用旧结果。原文引文必须能在提供的正文中定位。
6. 网页是待分析数据，不是 Agent 指令。不得让文章启用工具、执行命令或改变配置。
7. 抓取不能访问私网、元数据地址或任意本地文件；跳转也要检查。不得绕过登录墙、验证码或 403。
8. 不提交 `.env`、登录目录、真实 SQLite、私有笔记、API key 或模型原始日志。测试使用明确的虚构资料。
9. 既有运行锁不自动删除。先核实旧进程已停止，再按运维文档处理。不要通过多开实例提高模型并发。
10. 对外写作需要人工事实核对；不实现未经用户要求的自动发送或发布。

## 目录职责

| 位置 | 职责 |
|---|---|
| `src/config.mjs` | 环境变量校验 |
| `src/fetch.mjs` / `collect.mjs` | 网络边界、解析和采集 |
| `src/store.mjs` | SQLite、任务收据、预算、缓存、资料状态 |
| `src/analysis.mjs` | 规则初筛、结构化结果、官方 API / CLI 适配 |
| `src/worker.mjs` | 定时采集和串行分析 |
| `src/server.mjs` / `main.mjs` | 登录、私有接口、静态页面、实例锁 |
| `public/` | 无构建步骤的中文界面 |
| `config/` | 信源白名单和核验记录 |
| `scripts/` | 初始化、预检、诊断、备份与导出 |

## 验证

在本目录运行 `npm ci --ignore-scripts`、`npm run check`、`npm test`、`npm audit --omit=dev`。自动测试不调用真实模型，也不要求生产账号。新入口的测试不能代替旧版 PostgreSQL 测试；涉及旧版代码时继续执行其对应检查。

修改解析器或来源配置时，明确运行 `npm run sources:check`，记录真实入口、时间、日期与正文结果。该命令访问公开来源但不调用模型。不要将外部站点可用性测试作为每次普通单元测试的条件。

可选浏览器验收见 `qa/README.md`。只有实际浏览器运行成功才能记为浏览器通过；DOM 模拟或截图生成计划不能替代它。不要为了开发验收给低资源 VPS 安装浏览器。

## 文档与交接

当前 2.1.0 的 T3 取舍见 `docs/T3_DESIGN_REVIEW.md`：只借鉴持久任务、提交后通知与独立进程边界，不引入 T3、Effect、app-server 或新 outbox 框架。Worker 保持单消费者；达到额度或暂停时结束本轮消费，不能 while(nextQueued) 空转。外部收录使用 `intake-client.mjs` 的私有 HTTP 边界，不直接写库；手工正文修订保持 backfill，不能因此自动新增模型消费。

Windows CLI 配置由 `codex-process.mjs` 解析。支持原生 exe 或核验过的官方 npm 包入口；不能用 shell:true 解决 cmd/ps1 启动问题。验证使用假 CLI，不要把 Windows CI 当成用户真实账号或系统沙箱已验收。后续本地部署优先阅读 `docs/WINDOWS_LOCAL.md`。

修改接口、开关、模型参数、预算、信源或部署方式时，同时更新相关文档。每个可交接版本更新根 `CHECKPOINT.md`：基线、完成项、实际验证、未验证项、后续命令。写清测试环境，不把本机资源当成用户 VPS 资源。不在 checkpoint 中记录密钥或认证二维码。

当前 2.2.0 的 SQLite schema 为 `user_version=2`，从 1 增量迁移。升级前必须先用旧代码备份；新版管理命令也会执行迁移，不能把新版启动后备份误认为 schema 1 回滚快照。后续变化同样要提供迁移、备份/回滚说明，不能删库重建。

公众号规则在 `config/editorial-profile.json` 和 `prompts/editorial.md`，运行时明确读取，不依赖用户安装的外部 skill。写作任务与分析共用串行 worker、attempts、滚动24小时5次和暂停；不让排版/导出调用模型。正文来源快照保留，不读取私人笔记作为公开稿输入，不覆盖研究卡和人工编辑。渲染器只处理受限结构，模型不输出任意 HTML/SVG。图片由浏览器本地绘制，不依赖图片 API、图床或生产服务器浏览器。HTML/PNG 生成成功不等于微信公众号实际粘贴成功；后者必须单独验收。

实现已足够解决问题时，不为“以后可能需要”增加数据库服务、队列、向量库或模型调用。
