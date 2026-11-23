# 验证记录

## 2.2.0 — 2026-11-23 公众号草稿

基线 `8d0df45`（PR #5），功能分支 `codex/fde-editorial-workbench`，交付 [草稿 PR #6](https://github.com/ygao1981/AIHOT-FDE/pull/6)。功能与回归提交为 [`8a36611`](https://github.com/ygao1981/AIHOT-FDE/commit/8a36611d6bb60935814dcd5b57a2ffa1922e7f17)，后续验证文档提交不改变被测运行代码。本轮只扩展草稿、写作和排版，没有修改采集器或使用用户模型账号。既有 Windows / 真实信源验收是下方历史证据，不替代本轮新写作验收。

| 项目 | 实际结果 |
| --- | --- |
| Linux x64 / Node 24.22.3 锁文件安装 | `npm ci --ignore-scripts` 通过 |
| 语法、配置 | 37个脚本通过 |
| 行为测试 | 124项通过，0失败，0跳过 |
| 生产依赖审计 | 0个已知漏洞；未新增依赖 |
| 既有DOM行为 | 6组通过 |
| 新HTTP / 延迟UI响应 / revision冲突 | 自动测试通过；不将DOM模拟称为真实浏览器 |
| schema1→2 | 虚构5回执、3研究卡、笔记与设置保留；共享5次/预算/并发/unknown回归通过 |
| 真实模型请求 | 0；所有模型路径使用本地假CLI/API |
| 当前环境 Chromium | 启动前被socket权限拒绝，没有绕过环境限制；未完成页面验收 |
| 新Windows CI | 124项通过，0失败、0跳过；假CLI与隔离数据库，不是用户本机真实账号 |
| 新真实Chromium CI | 已通过：旧研究页面、素材选择/保存/冲突、最终主题预览、两版ZIP、真实PNG、富文本剪贴板、375/390px窄屏；模型请求0 |
| 新Docker CI | 独立SQLite入口已通过；旧版根目录Docker也通过 |
| 用户Windows真实写作与微信公众号 | 尚未运行；按CODEX_WECHAT_PROMPT接手 |

新增浏览器脚本：`qa/verify-editorial-assets.mjs` 验证PNG尺寸与签名、两版ZIP、富文本剪贴板和配图；`qa/verify-editorial.mjs` 验证旧资料选择、草稿保存/冲突、两种预览、下载、375px与零模型请求。它们已加入CI。正式HTML使用内联样式，但在微信公众号实际粘贴、上传PNG并手机预览仍是独立验收。

本提交的 [FDE workbench CI 45168134888](https://github.com/ygao1981/AIHOT-FDE/actions/runs/45168134888) 已全部通过：Windows与Linux各124项测试，Linux真实浏览器及独立SQLite Docker入口成功。[旧版 Check 45168134824](https://github.com/ygao1981/AIHOT-FDE/actions/runs/45168134824) 验证保留的旧版工程，不能把它和独立入口的结果混为一谈。

已下载该run的 `fde-workbench-qa` artifact（ID `14816290438`），核对 `editorial-results.json` 的 `status=passed`、`browserValidationCompleted=true`、`modelRequests=0`，并实际查看桌面内嵌预览、手机视口、两主题排版与中文PNG。截图中的资料均为虚构测试样本。产物保留7天，过期后可由同一QA脚本重建。

交叉检查发现并修复了延迟打开/重试响应覆盖新输入，以及合法多换行要点导致配图过高无法下载的问题。首轮CI的Windows失败来自DOM测试夹具只匹配LF；已统一换行并用CRLF内容实际启动界面、修改保存作回归。截图检查还修复了中文句尾标点孤行。124项测试包含这些回归，没有删除失败断言。

浏览器预览验收要求实际URL、主题、修订号和标题匹配，等待字体与图片解码，检查可见尺寸，再输出独立页面及视口截图。完整页面截图中的跨进程iframe可能为空白，不能单独拿它证明预览成功。验收脚本曾在预览加载阶段停滞；已移除无脚本预览内的动画回调等待，并从Node侧为各阶段设置15秒总期限，保留生产CSP、内容和可见性检查。最新浏览器报告与截图已通过。

升级前备份须在旧代码执行；不要先切新版再把其自动迁移后的备份当成旧版回滚点。真实库没有在本环境打开或迁移。

## 2026-11-23 Windows Fake-IP 采集验收

[RUN] 以 PR #4 的 `a5b18b1` 为基线，在 Windows、Node 24.22.3 上验收。此次关闭模型分析与自动分析，采集只在验收期间开启。SQLite 用量账本逐字段比对一致，保留原有 5 条回执，其中 2 条 `unknown`。

| 检查 | 实际结果 |
|---|---|
| 默认 DNS | 美团、Shopify 和 Anthropic 返回 `198.18.0.0/15` 中的地址，直接采集返回 `blocked_url`。TUN 的 DNS 应答与 Node 查询一致。 |
| 明确配置的采集路径 | 使用既有回环 HTTP CONNECT 代理，三家的公开入口均可读取。`sources:check` 各解析 8 个条目，首篇均为全文且具备原始日期。 |
| 美团技术团队 | 新增 6 篇。首篇示例正文 7,900 字符，日期 2026-11-18。 [原文](https://tech.meituan.com/2026/11/18/Papers-EMNLP-2026.html) |
| Shopify Engineering | 新增 5 篇。首篇示例正文 6,919 字符，日期 2026-11-18。 [原文](https://shopify.engineering/secure-agentic-apps) |
| Anthropic Engineering | 新增 8 篇。首篇示例正文 27,861 字符，日期 2026-11-13。 [原文](https://www.anthropic.com/research/building-strong-safety-evaluations) |
| SQLite 与重启 | 19 篇新增资料均含正文和原始日期，重复检查新增 0 篇。正常重启后仍有 26 篇资料及三家信源状态，旧资料逐字段一致，待分析队列与新增模型请求均为 0。 |
| Windows 自动回归 | `npm.cmd run check` 检查 27 个文件。`npm.cmd test` 90 项通过，`npm.cmd audit --omit=dev` 报告 0 个漏洞。 |

[RUN] 模拟回归覆盖 IPv4、IPv6、混合答案和特殊用途地址，验证直连连接使用已核验地址、代理拒绝无效证书与越界跳转、断开时不回退、重复采集不重复入库。Fake-IP 在未显式配置可信代理时继续拒绝。任意手工 URL 不走专用代理。

[READ] 采用应用级的本机代理设置，让可信代理为已审核域名解析，保留源站 HTTPS 证书检查。系统 DNS、代理、路由与 TUN 设置保持原状。应用没有采用双公共 DNS、Fake-IP 全量放行或禁用 TLS 校验。代理最终解析的 IP 由代理管理。全局 DNS 防泄露效果本轮未重新验证。 [架构说明](ARCHITECTURE.md) · [部署配置](WINDOWS_LOCAL.md#检查本机采集代理)

## 2026-11-23 CLI 事件适配器修复（尚未进行用户真实重试）

Windows 用户报告：授权和 CLI 参数诊断通过，但一次真实美团文章分析返回 `unexpected_tool`，保存 1 条 `unknown` 回执并暂停。CLI 官方协议允许 `todo_list` 作为非工具计划事件；原代码只允许两种 item，存在误判。**无法根据现场回执证明本次具体 item 类型就是 `todo_list`。**

本版仅将 `todo_list` 纳入非工具白名单，实际命令、文件、MCP、网页等工具事件和未知 item 继续失败关闭，并以受限类型名记录未来的拒绝原因。不修改用户已有回执、不自动重试、不增加模型调用。新增假 CLI 测试覆盖计划事件和工具事件。完整处置见 [INCIDENT_20261123_CODEX_EVENT.md](INCIDENT_20261123_CODEX_EVENT.md)。修复提交 [`046a7cb`](https://github.com/ygao1981/AIHOT-FDE/commit/046a7cbc7afbdad191cfabd3a069defc3a9f23ef) 的 [FDE workbench CI 45135209199](https://github.com/ygao1981/AIHOT-FDE/actions/runs/45135209199) 已通过：Windows 82 项、Linux 82 项测试（均为 0 失败）、真实 Chromium 页面验收和基础 Docker 检查通过。所有模型相关用例使用模拟 CLI，没有消耗用户真实模型额度。用户真实账号仍未复验。

---


## 2.1.0 — 2026-11-22

本轮为 T3 设计取舍后的最小改造。开始基线 `57d5a49910398e85254b5497624ad7743fd44b9d`；源码仍在 `codex/fde-workbench-v2`，数据 schema=1。下方 2026-11-20 的浏览器、Docker、来源与旧版回归属于 2.0 历史证据，不替代本轮验证。

本地环境：Linux x64，Node 24.22.3，npm 11.19.1。

| 本轮实际执行 | 结果 |
|---|---|
| `npm ci --ignore-scripts --no-fund` | 成功，31 个依赖包；运行依赖版本未改变 |
| `npm run check` | 27 个 JS/MJS 文件、配置与来源目录通过 |
| `npm test` | 79 项通过，0 失败、0 跳过，约 4.1 秒 |
| `npm audit --omit=dev` | 0 已知漏洞（本次查询） |
| `git diff --check` | 通过 |

新增测试覆盖繁忙期间入队、重复通知仍单并发、慢采集与分析分离、预算阻塞退出、失败后暂停、自动补队有界、队列启动恢复、停机不启动下一项、人工正文修订不自动分析、HTTP 恢复及时唤醒、intake 收录/状态/不明结果不重试，以及 Windows 命令解析、环境隔离和进程树终止。

假 CLI 采用官方 npm 包目录结构；Windows 的假 `.cmd` 故意返回失败，测试必须绕过它直接执行 JS 才能通过。进程超时用例实际创建父子进程并检查退出。所有模型测试均为假程序或本地 HTTP 服务，**本轮真实模型调用为 0**。

实现提交 [`2263556`](https://github.com/ygao1981/AIHOT-FDE/commit/2263556c880624627507d00ba8b453250f096306) 的 [FDE CI 44930155298](https://github.com/ygao1981/AIHOT-FDE/actions/runs/44930155298) 已实际通过：

| Job | 实际结果与范围 |
|---|---|
| `personal-windows` | Windows 原生、Node 24.22.3；安装、27 文件语法与配置、79 项测试，0 失败、0 跳过；实际执行假 CLI 和子进程树测试 |
| `personal-workbench` | Linux；79 项测试、审计、DOM 联调和真实 Chromium 页面验收通过 |
| `personal-docker` | 基础单服务构建、启动、健康检查、容器内 SQLite 备份通过 |

后续仅更新文档的提交不改变此处被测源码、测试或 workflow。没有把跳过的“失败时输出日志”步骤当成跳过测试。真实模型请求仍为 0。用户 Windows 的官方 CLI 登录、沙箱、账号额度与一篇真实文章分析仍需目标机验收；用户 VPS 也未连接。

本轮不修改 UI、来源目录、抓取解析器或旧 AIHOT 业务源码；未在本地重复做新来源采集或旧版数据库验收。既有 workflow 仍会运行其要求的检查。

---

## 2.0.0 历史记录

日期：2026-11-20。范围：`fde-workbench/` 个人版。环境：Linux x64、Node v24.22.3、npm 11.19.1。**这不是用户 VPS 的测试报告。**

## GitHub 验收结果

实现与验收脚本提交 [`d9200c0`](https://github.com/ygao1981/AIHOT-FDE/commit/d9200c08a930e1954e7db404b0ea5facbf647649) 的 [FDE workbench workflow](https://github.com/ygao1981/AIHOT-FDE/actions/runs/44749368030) 已通过两个 job。后续纯文档提交不改变本次被验收的源码、测试和部署配置：

| Job | 实际验证 |
|---|---|
| `personal-workbench` | 安装、语法、53 项业务测试、依赖审计、6 组 DOM 检查、10 组真实 Chromium 流程 |
| `personal-docker` | 基础单服务镜像构建、容器启动、健康接口、容器内 SQLite 备份和清理 |

浏览器覆盖 1440×1000 与 390×844，报告 `browserValidationCompleted=true`、`modelRequests=0`。测试使用虚构资料和临时随机口令，没有访问生产数据。截图和 JSON 是该 run 的 `fde-workbench-qa` artifact，保留期为 7 天；过期后可运行仓库中的同一脚本重建。

## 本地自动验证

| 检查 | 实际结果 | 证明范围 |
|---|---|---|
| `npm ci --ignore-scripts` | 完成 | 独立 package 和 lockfile 可安装；没有安装根 workspace |
| `npm run check` | 22 个 JS/MJS 文件和配置通过 | 源码、脚本、UI、测试和可选 QA 的语法 |
| `npm test` | 53 通过，0 失败、0 跳过，约 3.0 秒 | 下述业务、HTTP、模型适配和备份行为 |
| `npm audit --omit=dev` | 0 已知漏洞 | 当次 npm 公告检查，不是永久安全保证 |
| `node qa/verify-dom.mjs` | 6 组通过 | 模拟 API 的 DOM 联调，不等于真实浏览器 |

最初依赖审计提示 fast-xml-parser 5.11.1 的低危公告，已更新到 5.12.1 并复查。没有用忽略公告的方式把检查改成通过。

### 自动测试覆盖

- 默认关闭；本地相关性拒绝在 attempt 和预留之前完成，不消耗尝试或暂停其他任务。
- API 官方入口、无工具、结构化结果、输出上限、UTF-8 预算预留和 usage 结算。
- 失败不重发、不切 provider；未知消耗保留预留；已知错误 usage 仍记账。
- API 重定向不转发凭据；本地代理 CONNECT 测试不发送 API key，也没有建立真实模型请求。
- CLI 参数位置、环境隔离、超时子进程清理、异常工具事件中止、累计已完成回合用量。
- 配置感知缓存；正文更新不被旧在途结果覆盖；人工重试与每日/API 月预算限制。
- SQLite 全局运行中任务限制、单实例锁、重启后 unknown 与暂停。
- RSS/Atom、静态 HTML 卡片日期、真实发表日期元数据；不将 updated/modified 当发表日期。
- 私网、元数据地址、DNS 与跳转校验；代理 DNS 只允许精确白名单 HTTPS 来源。
- 登录、HttpOnly Cookie、Origin、错误脱敏、私有读取与笔记不调用模型。
- 管理命令遇到空数据目录明确失败，不新建空库或误报备份成功。
- 在线 WAL 备份的已提交快照、单文件独立打开；恢复含 running 的回执后转 unknown，保留笔记、分析和预留。

模型测试使用临时假 CLI、本地 HTTP 假服务或固定结果。没有使用用户 API key、Plus 登录、真实模型额度或生产 SQLite。

## 真实来源验证

审核目录共 27 项：自动 9、观察 13、人工 3、停用 2。完整时间、HTTP 状态、响应摘要、入口变更和样本证据在 [`config/source-audit.json`](../config/source-audit.json)。下表是实际运行应用 `npm run sources:check` 的默认源结果，每源读取列表及一篇详情；不是整站全量抓取。

| 来源 | 列表条目 | 样本正文字符 | 样本原文日期 | 正文状态 |
|---|---:|---:|---|---|
| 美团技术团队 | 8 | 7,900 | 2026-11-18 | page |
| Microsoft Frontier Engineering | 8 | 24,195 | 2026-09-24 | page |
| Anthropic Engineering | 8 | 27,861 | 2026-11-13 | page |
| LangChain 客户案例 | 8 | 6,964 | 2026-10-13 | page |
| Hamel | 8 | 23,583 | 2026-10-20 | page |
| Eugene Yan | 8 | 25,091 | 2026-06-21 | page |
| Shopify Engineering | 8 | 6,919 | 2026-11-18 | page |
| Dify 中文博客 | 8 | 5,408 | 2026-11-05 | page |
| Palantir 博客 | 8 | 13,557 | 2026-10-02 | feed_excerpt |

运行时间为 2026-11-20 13:19–13:28 UTC。日期与字符数只代表当时样本；后续内容或页面可能变化。Shopify 复测确认 `itemProp=datePublished` 为 `2026-11-18T00:00:00Z`。Dify 收紧卡片选择器后复测通过。

Palantir 文章详情返回受限响应，使用原 RSS 中已经提供的正文，明确标为 `feed_excerpt`，没有绕过 403。首条是招聘话题，会被本地规则过滤，不因为“来自 Palantir”就送模型。Dify 的厂商荣誉类内容同样需要相关性与人工判断。来源可访问不代表每篇都是高价值生产案例。

实际环境通过已有网络代理出站。正常 TLS 校验保留，未记录代理地址或凭据。当地 DNS 不可用时仅对白名单 HTTPS 来源委托代理解析；没有声称本机检查了代理最终解析的 IP。任意人工 URL 没有此例外，受限时可粘贴正文。

## CLI 非模型诊断

实际可用 CLI 为 `0.172.0-alpha.2`。对空白专用登录目录执行版本、帮助和登录状态检查，得到 `supported=true`、`authenticated=false`、`issues=[cli_authentication]`。

实测修正了两处参数差异：`--ignore-user-config` 放在 `exec` 后；不覆盖当前 CLI 禁止覆盖的内置 openai provider。CLI 仍可能有内部连接或推理重试，因此工作台只承诺应用层不自动重新启动失败任务。

这项验证没有真实登录，不能证明某个账户当前可用模型、剩余额度或单篇 token 量。需要目标机器按部署文档补一篇真实验收。

## 界面验证

DOM 联调覆盖资料渲染、标题不执行 HTML、日期精度、原文证据与编辑建议分区、笔记提交、人工入口、采集关闭、API/CLI 费用边界和 skipped 资料禁止分析。六组通过。

最初真实浏览器验收未完成：云端浏览器无法访问测试服务；本地 Chromium 在页面打开前被系统拒绝创建 socket。没有修改权限绕过，也没有生成页面截图。

随后在 GitHub runner 完成真实浏览器验收。首轮发现验收脚本把搜索加载前的旧标题误当成新结果；已改为等待匹配参数的响应与稳定 DOM，保留全部断言。第二轮与第三轮十组检查均通过，流程中没有未捕获脚本异常、外部页面请求或模型尝试。第三轮增加移动端详情和关闭按钮位于 390×844 视口内的断言，并将详情截图改为实际视口；报告显示详情边界为 `(0, 0, 390, 844)`，关闭按钮完整可见。桌面研究库、资料详情、用量以及移动研究库、移动详情截图已实际查看。

可重跑脚本为 [`qa/verify-ui.mjs`](../qa/verify-ui.mjs)，测试使用真实后端、独立虚构 SQLite、关闭模型与采集。后续提交以对应 run 的报告为准。生产部署不需要安装 Playwright 或浏览器。

## 旧版入口的补充检查

原 Check workflow 前两轮发现旧行业测试夹具中的分类/主题与当前 FDE 目录未同步，以及环境变量检查只扫描旧入口的问题。本次同步合法分类、实际主题别名和指标字段契约；环境检查加入新入口生产 `.mjs`、真实数字配置 helper 与 Compose/Dockerfile 的使用。双向配置断言保留，没有白名单豁免，没有修改旧站业务实现或关闭 gate。

本地完整 typecheck、生产 web build、245 项 standalone 测试以及定向环境和指标测试通过。实现提交 `d9200c08a930e1954e7db404b0ea5facbf647649` 的 [Check workflow](https://github.com/ygao1981/AIHOT-FDE/actions/runs/44749367965) 最终两个 job 均成功：

| 检查 | 实际结果 |
|---|---|
| Typecheck 与生产 Web 构建 | 通过 |
| Web 全套测试 | 59 通过，0 失败、0 跳过 |
| PostgreSQL / 后端全套测试 | 1052 通过，0 失败、0 跳过 |
| 构建后站点烟测 | 通过 |
| 原入口 Docker 构建、启动与烟测 | 通过 |

这些结果用于确认保留入口的兼容性，不混入新版 53 项测试统计，也不代表已经迁移或连接用户的旧数据库。

## 资源观察

使用真实 HTTP 服务、1 条虚构资料、模型/采集关闭，执行 10 次健康请求后测量：

| 项目 | 当次测量 |
|---|---:|
| 单进程空闲 RSS | 88.9 MiB |
| 本次运行的峰值 RSS | 99.3 MiB |
| 已安装应用生产依赖目录 | 约 14 MiB |

测量在开发环境完成，未执行真实 CLI、模型分析或大规模采集。峰值不代表所有任务的最大值。依赖大小不包含 Node、Codex、npm 缓存、Git 历史、Docker 镜像、SQLite、日志和备份。

部署建议仍为 API/off 留至少 768 MiB 可用内存，CLI 留至少 1 GiB，数据所在盘留至少 2 GiB 可用空间，并考虑现有服务余量。该建议是小规模试运行前提，不能据此断言用户 VPS 足够。

## 尚未验证

- 用户 VPS 的系统、磁盘、inode、内存、端口和长期资源峰值。
- 用户真实 ChatGPT / API 权益、官方登录、单篇分析质量与账户用量。
- 容器内真实 Codex CLI 认证与分析、目标 VPS 的 Docker 条件及 systemd 常驻运行；基础 Docker 已通过 CI。
- 长期来源稳定性与未来页面变化；跨网站同内容的语义去重。

这些项不影响先运行关闭模型的个人试用，但不能在交接时写成已验收。下一个 Codex 只需补目标环境相关检查，不必重复消耗模型额度测试已由假服务覆盖的错误分支。
