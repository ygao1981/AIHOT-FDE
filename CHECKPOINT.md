# CHECKPOINT — FDE 研究台 v2.2

## 2026-11-24 手动分析、信源采集与多代理

- [RUN] Windows 本机 `2.2.1` 运行代码 `ed55c01`。Edge 核对「AI 分析」在研究库卡片和详情均可用。手动分析、写作和翻译照常记账。「用量 → 自动分析额度」独立配置，初始为滚动 24 小时 5 次。本机自动分析关闭。
- [RUN] 「信源 → 采集范围与条数」默认最近 30 天、每天最多新增 50 篇。实机按需检查 9 个信源，去重后新增 9 篇。初始资料和两条 unknown 均保留，本轮真实模型尝试新增 0。
- [RUN] 采集同时配置 0day Cloud 与 Clash 的回环 HTTP CONNECT 端点。两条路径均以公开信源实测。首选端口不可达时使用已配置的备用端点。
- [RUN] 旧版 schema 2 快照在升级前独立验证。升级后的 schema 3 实际库逐字段核对通过。新在线快照验证通过。 [验收明细](fde-workbench/docs/VALIDATION.md#221-windows-验收)

## 2026-11-24 网页使用说明与 Gemini 交接

- [RUN] 新增 `/guide.html`，从登录页、研究库和公众号草稿均可打开。包含分析与选题进度、翻译、写稿、两版导出、额度和备份操作。说明页本身只读取静态文件，资料库仍需登录。 [验收记录](fde-workbench/docs/VALIDATION.md#2026-11-24-使用说明页)
- [READ] [Gemini 前端提示词](fde-workbench/docs/GEMINI_FRONTEND_PROMPT.md) 以草稿 PR #7 为基线，按 PM PC 实际采用的 Hallmark 重排和 Impeccable 独立审查交接。保留 `finesse-ui`、`ui-ux-pro-max` 和 Playwright 的适用检查。

## 2026-11-24 Windows 五次真实模型验收

- [RUN] 按用户单次授权临时为进程增加 5 个尝试名额。官方 Codex CLI 实际完成 1 份公众号初稿、2 张研究卡和 2 份中文译文。五项重复操作都复用已保存结果。 [验收结果](fde-workbench/docs/VALIDATION.md#2026-11-24-真实-codex-五次验收)
- [RUN] 首次长文翻译发现句中切分被拼成空行。`0442124` 修复译文拼接，130 项测试通过，另用最后一次真实请求验了四个片段的长文。翻译请求和缓存标识保持原样，前一份译文和回执可继续读取。
- [RUN] 24 小时上限已恢复 5。测试前后 `.env` 相同，采集、分析和自动分析恢复关闭，原 5 条回执包含的 2 条 unknown 保留。账本共 10 条回执。

## 2026-11-23 Windows 本机升级与公众号验收

- [READ] [PR #6](https://github.com/ygao1981/AIHOT-FDE/pull/6) 为草稿，`codex/fde-editorial-workbench` 头部 `56b6230` 在功能提交 `8a36611` 之上补交接文档。Windows 修复在叠加分支 `codex/fde-editorial-windows-acceptance`，保留上游 CLI 和采集代理修复。
- [RUN] Windows 实际运行 2.2.0，运行代码为 `07cad45`。旧版仍在前台时生成 schema 1 快照并独立读取；停旧服务后迁移到 schema 2。全字段比较通过，26 篇资料、3 张研究卡、3 条私人笔记、27 条信源状态和全部 5 条回执（含 2 条 unknown）都保留。
- [RUN] Edge 在用户数据库中，从一张既有研究卡生成素材稿。两窗保存冲突、编辑与重启持久化、原稿缓存、富文本剪贴板、纯文字与图文、浅暖与墨色两主题均已实测。实际打开两包内的 TXT、Markdown、两版 HTML 和 PNG，检查 390 像素预览。此次新增真实模型回执 0。 [验收明细](fde-workbench/docs/VALIDATION.md#220-windows-本机验收)
- [RUN] 修复了「待整理」筛选项未生成、素材稿小节重复编号与标点、出处日期显示。新增「AI 分析」「整理素材」「标为已整理」和手动翻译。英语译文、研究分析和写作共享串行执行位、24 小时 5 次上限和 unknown 保护。新的研究卡提纲增加实施步骤、人工复核和数字证据口径。 [使用流程](fde-workbench/docs/EDITORIAL_WORKFLOW.md)
- [RUN] Codex CLI `0.169.1` 的版本、实际参数和现有登录诊断通过。本机采集、分析、自动分析三个开关关闭，provider 仍为 Codex。验收时滚动额度 5/5，下一档额度约于 2026-11-24 07:59:09（UTC+8）可用，恢复测试前再按实际账本判断。
- [UNKNOWN] 账号真实写作、英文翻译和新版研究卡的实际生成质量待验。微信公众号后台粘贴、上传 PNG 与真机预览待验。该轮保留本机验证记录、草稿、截图与数据库于本地。

## 2026-11-23 公众号草稿与两种排版（2.2.0）

- [READ] 基线为 PR #5 的 `8d0df4506a86a2981c55798300884415c4190903`。本轮分支 `codex/fde-editorial-workbench`，交付 [草稿 PR #6](https://github.com/ygao1981/AIHOT-FDE/pull/6)，保留已有 CLI 和代理修复。功能与回归提交为 `8a36611d6bb60935814dcd5b57a2ffa1922e7f17`，详细取舍见 [公众号工具审查](fde-workbench/docs/WECHAT_DESIGN_REVIEW.md)。
- [RUN] 新增已分析资料选择、零模型素材稿或一次 AI 写作任务、持久草稿、修订冲突、原文快照、纯文字/图文、两主题、HTML/Markdown/TXT、浏览器 PNG 与双版本 ZIP。研究卡不被写稿覆盖，私人笔记不自动进入公开稿。
- [RUN] 分析和写作合计仍是滚动24小时最多5次，包含失败和 unknown；一个串行 worker，同一 attempts 账本。换主题、编辑、图片绘制和导出不调用模型。默认三个工作开关关闭，provider=off，无新增生产依赖。
- [RUN] Linux x64 / Node24.22.3：37个脚本语法与配置检查、124项自动测试、既有DOM6组通过，依赖审计0漏洞。Windows CI 同样124项通过。真实模型调用0。迁移用虚构5回执/3研究卡作回归，没有访问用户正式库。
- [RUN] [FDE CI 45168134888](https://github.com/ygao1981/AIHOT-FDE/actions/runs/45168134888) 的 Windows、Linux与Docker全部通过；真实Chromium验证草稿交互、PNG、剪贴板、两版ZIP和375/390px窄屏。已下载报告并实际查看桌面/手机预览及配图截图，模型请求0，详见 [VALIDATION](fde-workbench/docs/VALIDATION.md)。首轮Windows CRLF夹具、配图句尾标点及预览验收等待问题均已修复。
- [UNKNOWN] 用户Windows真实写作及微信公众号粘贴、PNG上传、手机预览尚待本机。开发容器不能启动Chromium，真实浏览器证据来自GitHub runner，不将两种环境混为一谈。
- [READ] SQLite升为schema2。**必须先用旧版代码备份，再切新版**；新版backup/status同样可能触发迁移。回滚需升级前快照，不能手改schema或让历史真实消费随备份回退。见 [运维升级章节](fde-workbench/docs/OPERATIONS.md#220-草稿数据库升级)。
- 下一步直接使用 [Codex公众号升级与验收提示词](fde-workbench/docs/CODEX_WECHAT_PROMPT.md)。未合并main，没有访问或部署到用户Windows/VPS，没有上传或发布公众号。

下方保留历史交接和各次环境报告。历史的一次试运行要求以本段共享5次和最新接手提示为准，历史schema1不是本版结构。

## 2026-11-23 Windows Fake-IP 采集兼容

- [READ] 本轮分支 `codex/fde-proxy-dns-compat` 基于 PR #4 的 `a5b18b1`，保留已有 CLI 事件兼容修复。本轮只验收网页采集。
- [RUN] Windows 默认 DNS 为三个实测信源返回 Fake-IP，直连采集器正确拒绝。已用 `FDE_SOURCE_PROXY_URL` 接入现有本机 HTTP CONNECT 代理。已审核的 HTTPS 信源委托代理解析，逐跳守域名白名单和证书校验。直连固定已校验的公网地址。 [架构与网络边界](fde-workbench/docs/ARCHITECTURE.md)
- [RUN] 美团、Shopify、Anthropic 共收录 19 篇完整且有原始日期的资料。重复采集新增 0 篇。重启后保留资料和信源状态。分析、自动分析和采集恢复为关闭，五条既有回执逐字段一致。
- [RUN] Windows 检查和 90 项自动测试通过，生产依赖审计报告 0 个漏洞。三家信源的真实验收走同一条专用代理路径。DNS 防泄露配置保持不变，全局防泄露效果未重新验证。 [验收记录](fde-workbench/docs/VALIDATION.md#2026-11-23-windows-fake-ip-采集验收)

> **2026-11-23 最新用户授权（覆盖旧的一篇/每天一次试运行要求）：** Windows 本机真实测试上限改为 `FDE_DAILY_LIMIT=5`，表示滚动 24 小时内**最多五次真实分析尝试**，失败和 unknown 同样计入。旧美团 unknown 回执必须保留且如仍在 24 小时内已占一次。修复验证、备份和安全核对后允许恢复暂停、逐篇测试，无须每篇重复请求授权；不得自动重试未知请求或超出总次数。先手动测试，成功且稳定后可在剩余次数内短暂开启自动分析，结束后关闭。完整操作见 [5 次真实测试接手提示词](fde-workbench/docs/CODEX_TEST_5_PER_DAY_PROMPT.md)。

> **2026-11-23 Codex CLI 事件兼容修复：** Windows 单篇真实分析曾返回 `unexpected_tool` 并保留 1 条 `unknown` 回执，暂停状态不可自行清除。官方 CLI 的正常 `todo_list` 事件可能被旧白名单误拒；修复只放行此非工具事件，实际触发类型仍未知。详见 [事件处置说明](fde-workbench/docs/INCIDENT_20261123_CODEX_EVENT.md)。本机已有未提交现场 CHECKPOINT 时，合并而非覆盖。修复提交 [`046a7cb`](https://github.com/ygao1981/AIHOT-FDE/commit/046a7cbc7afbdad191cfabd3a069defc3a9f23ef) 已通过 [FDE CI 45135209199](https://github.com/ygao1981/AIHOT-FDE/actions/runs/45135209199)：Windows、Linux 各 82 项测试通过，Linux 浏览器验收及基础 Docker 检查通过；真实账号尚未复测。


更新日期：2026-11-22（Asia/Singapore）。此文件是后续 Codex 接手的起点，不包含账号或运行数据。

## 历史交接：2.1.0

用户明确要求先独立判断 T3 对自身需求的价值，再选择是否采用。当前决定为：**不安装或嵌入整套 T3，不复制其代码；补齐现有 FDE 研究台的少量实际缺口。** 详细依据与舍弃方案见 [T3_DESIGN_REVIEW](fde-workbench/docs/T3_DESIGN_REVIEW.md)。

- 本轮开始基线：`57d5a49910398e85254b5497624ad7743fd44b9d`；工作分支继续为 `codex/fde-workbench-v2`，沿用 PR #3。
- T3 审查基线：`pingdotgg/t3code@b4277089795299da077e784f9f3432b3cc1c1c7d`；重点核对持久化、任务执行、provider、CLI 进程边界及外部触发。
- 本轮实现：持久入队后唤醒、单消费者排空、采集与分析分离、额度阻塞退出、自动队列有界；Windows 官方 CLI 启动器及进程树适配；认证 HTTP 的 intake 客户端。
- 人工修订正文后保持人工选择分析；未知消耗不自动重试，网页恢复不会重发失败资料。
- 数据库仍为 `user_version=1`，无需结构迁移；没有新增运行依赖；三个默认开关和 provider=off 均保留。
- 当前建议：**先 Windows 本机原生试运行**。本机睡眠/关机期间不会采集；VPS 是否能承载需真实预检。
- 本地验证：Linux x64 / Node 24.22.3，安装成功，27 个文件语法与配置通过，79 项测试通过、0 失败、0 跳过，依赖审计 0 已知漏洞。模型使用假 CLI / 本地假服务，未调用用户账号。
- 本轮实现提交：[`2263556`](https://github.com/ygao1981/AIHOT-FDE/commit/2263556c880624627507d00ba8b453250f096306)。[FDE CI 44930155298](https://github.com/ygao1981/AIHOT-FDE/actions/runs/44930155298) 的 Windows 原生 79 项测试、Linux 79 项测试与真实 Chromium、基础 Docker 均已通过。后续文档提交不改变这些被测运行代码、测试和 workflow。真实 Windows 官方登录、沙箱和一篇分析未在用户机器验证。
- 本轮不更改来源目录或抓取解析器，不重复宣称旧来源审计是本日重新核验；旧版公开站业务源码也未修改。

接手先读 [WINDOWS_LOCAL](fde-workbench/docs/WINDOWS_LOCAL.md) 与 [CODEX_DEPLOY_PROMPT](fde-workbench/docs/CODEX_DEPLOY_PROMPT.md)。外部程序按 [EVENT_INTAKE](fde-workbench/docs/EVENT_INTAKE.md) 提交资料；二开任务使用 [CODEX_DEVELOPMENT_PROMPT](fde-workbench/docs/CODEX_DEVELOPMENT_PROMPT.md)。下方 2.0 的实现与历史证据继续保留，不能代替 2.1 新代码的验证。

## 1. 当前目标与入口

用户需要个人 FDE / 企业 AI 落地研究、教程阅读和微信公众号选题。低频使用，优先脚本，少量模型分析；本机是 Windows，Linux VPS 已有 MariaDB，磁盘曾紧张；模型可采用本人登录的官方 Codex CLI。

本次完成独立轻量入口 **`fde-workbench/`**，产品名“FDE 研究台”。Node.js + SQLite，一个服务进程、串行模型任务。不要执行根目录旧版 Compose 来部署这套入口。

- 仓库：`https://github.com/ygao1981/AIHOT-FDE`
- 工作分支：`codex/fde-workbench-v2`
- GitHub 交付：[PR #3](https://github.com/ygao1981/AIHOT-FDE/pull/3)，保留草稿供目标环境验收；没有合并到 main。
- 2.0 历史版本通过新版及旧版完整 CI 的提交：`d9200c08a930e1954e7db404b0ea5facbf647649`。本轮 2.1 源码已改变，其独立验收见顶部与 VALIDATION。
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

## 4. 2.0 历史验证（保留证据）

开发环境为 Linux x64、Node 24.22.3、npm 11.19.1；不是用户 VPS。

- `npm run check`：22 个 JS/MJS 文件语法与来源配置通过。
- `npm test`：53 项通过，0 失败，0 跳过。后续补验以 [VALIDATION](fde-workbench/docs/VALIDATION.md) 的最新记录为准。
- `npm audit --omit=dev`：当次 0 已知漏洞；已将 fast-xml-parser 更新到 5.12.1。
- DOM 联调：6 组通过，使用模拟 API，不等于浏览器通过。
- **真实 Chromium 验收通过**：[GitHub run 44749368030](https://github.com/ygao1981/AIHOT-FDE/actions/runs/44749368030)，10 组浏览器流程，1440×1000 / 390×844；登录、筛选、笔记、导入、导出、来源开关、用量、窄屏与退出均通过，模型尝试为 0。移动端详情和关闭按钮位于视口内，桌面与移动端截图已实际查看。
- **新版基础 Docker 通过**：同一 CI 完成单服务镜像构建、启动、健康检查和容器内 SQLite 备份，所有采集与模型开关关闭。
- **旧版完整回归通过**：[Check run 44749367965](https://github.com/ygao1981/AIHOT-FDE/actions/runs/44749367965)，59 项 Web 测试、1052 项后端测试均为 0 失败、0 跳过；typecheck、生产构建、站点烟测、原 Docker 构建和烟测均通过。仅同步旧行业测试夹具并扩展环境配置检查，没有修改旧站业务源码或关闭检查。
- 原生采集代码对 9 个默认来源逐一运行；每源读取列表及一篇正文，全部取得可用条目。Palantir 详情受限，使用明确标注的 feed_excerpt。
- 实际 CLI `0.172.0-alpha.2` 的非模型版本/参数/登录状态诊断通过参数检查，专用空目录未登录。
- 一条虚构资料、模型/采集关闭、10 次健康请求后的空闲 RSS 为 88.9 MiB，测量期间峰值 99.3 MiB；应用生产依赖约 14 MiB。不包含 CLI 分析峰值、Node 安装、镜像、数据库增长与备份。

没有使用用户账号或真实模型额度。完整证据、测试范围、来源样本和限制见 [VALIDATION](fde-workbench/docs/VALIDATION.md)。

## 5. 未完成的目标环境验收

- **真实账号分析**：用户 Plus/其他 ChatGPT 权益、官方 API 余额和所选模型可用性未验证。需要用户本人完成登录，再验收一篇。
- **用户 VPS**：没有连接，也没有查看实际磁盘、内存、端口、MariaDB 或其他服务。
- **Codex Docker / systemd**：基础镜像已通过 CI；真实 CLI 版本、登录目录、容器内认证和目标系统服务仍需在选定机器验证。

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
