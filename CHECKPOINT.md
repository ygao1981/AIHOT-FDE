# CHECKPOINT — FDE 研究台 v2

更新日期：2026-11-20。此文件是后续 Codex 接手的起点，不包含账号或运行数据。

## 1. 当前目标与入口

用户需要个人 FDE / 企业 AI 落地研究、教程阅读和微信公众号选题。低频使用，优先脚本，少量模型分析；Linux VPS 已有 MariaDB，磁盘曾紧张；模型可采用本人登录的官方 Codex CLI。

本次完成独立轻量入口 **`fde-workbench/`**，产品名“FDE 研究台”。Node.js + SQLite，一个服务进程、串行模型任务。不要执行根目录旧版 Compose 来部署这套入口。

- 仓库：`https://github.com/ygao1981/AIHOT-FDE`
- 工作分支：`codex/fde-workbench-v2`
- 初始代码基线：`194fbef74a79b2194d0119000f42f6badc5741f3`，来自此前 `codex/fde-cli-single-pass`。
- 开始工作时 `main`：`05c9b2c95398d43057800ac10fefd1c2721ff0b1`。
- 本版实际版本以 `git rev-parse HEAD` 和该分支历史为准；不要将初始基线误认成新版交付提交。
- 旧 PR #2 和旧代码保留，不自动合并、迁库或删除数据。

## 2. 已完成的实现

| 范围 | 当前行为 |
|---|---|
| 信源 | 审核 27 个公开入口；9 个自动、13 个观察、3 个人工、2 个停用 |
| 采集 | RSS/Atom 与静态 HTML；逐来源间隔、URL 去重、正文提取、原文日期；不启动浏览器 |
| 规则 | 明显无关或正文不足的资料不登记模型尝试；手动导入也先过本地准入 |
| 数据 | 内置 SQLite；articles、source_state、attempts、settings；schema user_version=1 |
| 模型 | `off / api / codex` 显式选择；一次结构化研究任务；无自动 fallback |
| 用量 | 滚动 24 小时尝试上限；API 月预算预留和实际 usage 估算；CLI 金额未知 |
| 重复与失败 | 输入和模型配置纳入缓存；失败/中断暂停，不自动重复请求；显式重试产生新收据 |
| 私有界面 | 登录、研究库、来源状态、个人笔记、选题状态、用量、Markdown 导出 |
| 部署 | 原生 Node；可调整的 systemd 模板；可选单服务 Docker；不需要数据库容器 |
| 交接 | 本 checkpoint、子目录 AGENTS、架构/来源/模型/部署/运维/验证/提示词文档 |

默认 `.env.example` 的采集、分析和自动分析全部关闭，provider 为 off。初始每日限制为 5 次，但部署提示词要求先调成 1 次验收。API 月预算默认 10 美元，只是本应用按配置价格的控制，不代表官方账户级限额。

## 3. 关键决定

1. **个人版独立入口。** 借鉴原 AIHOT 的来源配置、流水线、收据与预算、读写分离思路，不照搬公开热点站的多轮评分、语义聚簇、日报和多服务部署。
2. **SQLite。** 不额外安装 PostgreSQL，不因为已有 MariaDB 而增加适配层。只支持单实例，不自动迁移旧数据库。
3. **原文证据优先。** 模型给中文摘要、业务问题、实施方法、阶段依据、经验与选题；引用必须能定位到提供的正文。厂商自述仍需人工核验。
4. **人工选题优先。** 首次采集、旧文和日期未知资料不自动分析。公众号“已发布”只是本地标签，没有发送接口。
5. **账户方式明确。** 官方 API key 与 ChatGPT 登录官方 CLI 不混用，不把订阅说成固定可兑换 token 的 API 额度。
6. **轻量网络路径。** 不包含付费公众号采集、Jina、无头浏览器或反爬绕过。任意人工链接不能借代理访问私网。

## 4. 已实际执行的验证

开发环境为 Linux x64、Node 24.22.3、npm 11.19.1；不是用户 VPS。

- `npm run check`：22 个 JS/MJS 文件语法与来源配置通过。
- `npm test`：53 项通过，0 失败，0 跳过。后续补验以 [VALIDATION](fde-workbench/docs/VALIDATION.md) 的最新记录为准。
- `npm audit --omit=dev`：当次 0 已知漏洞；已将 fast-xml-parser 更新到 5.12.1。
- DOM 联调：6 组通过，使用模拟 API，不等于浏览器通过。
- 原生采集代码对 9 个默认来源逐一运行；每源读取列表及一篇正文，全部取得可用条目。Palantir 详情受限，使用明确标注的 feed_excerpt。
- 实际 CLI `0.172.0-alpha.2` 的非模型版本/参数/登录状态诊断通过参数检查，专用空目录未登录。
- 一条虚构资料、模型/采集关闭、10 次健康请求后的空闲 RSS 为 88.9 MiB，测量期间峰值 99.3 MiB；应用生产依赖约 14 MiB。不包含 CLI 分析峰值、Node 安装、镜像、数据库增长与备份。

没有使用用户账号或真实模型额度。完整证据、测试范围、来源样本和限制见 [VALIDATION](fde-workbench/docs/VALIDATION.md)。

## 5. 未完成的目标环境验收

- **真实账号分析**：用户 Plus/其他 ChatGPT 权益、官方 API 余额和所选模型可用性未验证。需要用户本人完成登录，再验收一篇。
- **用户 VPS**：没有连接，也没有查看实际磁盘、内存、端口、MariaDB 或其他服务。
- **Docker / systemd**：提供配置；本开发环境没有 Docker daemon，也没有安装系统服务，需在选定目标上验证。
- **真实浏览器**：最初云端浏览器不能连接测试服务，本地 Chromium 创建 socket 被环境拒绝。DOM 测试已通过；新增独立 GitHub Actions 会运行真实浏览器脚本。只有其实际结果才能更新浏览器结论。
- **旧版全套测试**：本次没有修改旧站业务源码，也没有在本地运行旧 PostgreSQL 全套测试；新增检查与旧 Check workflow 分开。

## 6. 必须知道的运维边界

- 数据目录只能由一个研究台服务持有。存在 `workbench.lock` 就拒绝启动；崩溃后按文档确认旧实例已停止，再处理精确锁文件。
- 超时或断连不代表免费；未知 attempt 保留预算预留并暂停。恢复暂停不会自动重试失败文章。
- 已研究资料、个人笔记和回执不按原始资料保留天数自动删除；备份和导出也需本人管理空间。
- 恢复旧备份会回退本地账本，真实消费不会退款。先关闭分析，保留恢复前库，核对官方用量后再启用。
- API 金额依赖配置价格，CLI 只有已收到的用量统计；都不能替代官方账户账单。
- 来源静态选择器可能变化。403、登录墙或空列表保留失败状态；优先人工补充，不自动购买其他抓取服务。
- 规则可能误筛，URL 去重不等于跨网站语义去重；两种情况都需要人工研究判断。

## 7. 下一个 Codex 应做的事

按 [CODEX_HANDOFF](fde-workbench/docs/CODEX_HANDOFF.md) 阅读，再执行 [完整部署提示词](fde-workbench/docs/CODEX_DEPLOY_PROMPT.md)。

1. 记录当前分支、提交和未提交修改。
2. 在真正目标机器做只读资源检查，选择本机还是 VPS。
3. 以关闭模型的配置启动，完成登录、导入、笔记、重启和备份。
4. 验证来源，再配置专用官方 CLI 登录目录；不读取或转发登录文件。
5. 开启每日一次、人工选择的一篇真实分析，核对证据、缓存与账户用量。
6. 更新本 checkpoint 和验证文档，写清真正运行过的环境与结果。

## 8. 主要文件导航

- 新版说明：[fde-workbench/README.md](fde-workbench/README.md)
- 工程规则：[fde-workbench/AGENTS.md](fde-workbench/AGENTS.md)
- 设计：[ARCHITECTURE.md](fde-workbench/docs/ARCHITECTURE.md)
- 来源：[SOURCES.md](fde-workbench/docs/SOURCES.md)、[sources.json](fde-workbench/config/sources.json)、[source-audit.json](fde-workbench/config/source-audit.json)
- 模型：[MODEL_USAGE.md](fde-workbench/docs/MODEL_USAGE.md)
- 部署与运维：[DEPLOYMENT.md](fde-workbench/docs/DEPLOYMENT.md)、[OPERATIONS.md](fde-workbench/docs/OPERATIONS.md)
- 使用流程：[EDITORIAL_WORKFLOW.md](fde-workbench/docs/EDITORIAL_WORKFLOW.md)
- 验证：[VALIDATION.md](fde-workbench/docs/VALIDATION.md)、[qa/README.md](fde-workbench/qa/README.md)
- 交接：[CODEX_HANDOFF.md](fde-workbench/docs/CODEX_HANDOFF.md)、[CODEX_DEPLOY_PROMPT.md](fde-workbench/docs/CODEX_DEPLOY_PROMPT.md)
- 历史公开站说明：[README-LEGACY.md](README-LEGACY.md)
