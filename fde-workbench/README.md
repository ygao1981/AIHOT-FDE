# FDE 研究台

个人使用的企业 AI 落地研究库与公众号选题台。借鉴 AIHOT 的采集、筛选、分析和展示思路，将运行入口收敛为 **Node.js + SQLite + 一个后台进程**。采集和规则筛选由脚本完成，模型只处理你选择的资料。

这是仓库中独立的个人版，目录为 `fde-workbench/`。它不依赖根目录的 npm workspaces、PostgreSQL、MariaDB、Redis 或旧版 Compose，也不会迁移或修改旧版数据库。旧版仍保留作参考。

## 能做什么

- 从已核验的 RSS、Atom 和静态网页列表采集文章，保留原文链接和来源日期。
- 用本地规则筛除明显无关内容，支持人工补充链接与正文。
- 从待分析资料手动安排 AI 分析。官方 API 或已登录 ChatGPT 的官方 Codex CLI 可用一次模型任务生成结构化研究结果。
- 记录业务问题、实施方案、阶段依据、效果、经验、限制和原文引文。
- 对已收录的英文正文手动生成中文译文。翻译、研究分析与写作共用滚动 24 小时额度。
- 手动整理素材和标记已整理，保存个人笔记，导出已分析资料的 Markdown。
- 选择 1–3 篇有原文证据的研究卡，生成公众号素材稿或安排一次 AI 写作；草稿可修改并保存。
- 同一正文输出纯文字与图文排版，程序绘制封面和要点卡，浏览器导出 PNG、TXT、Markdown、HTML 与排版包。排版不调用模型。
- 查看采集状态、分析次数、API 费用估算与未知预留。
- 通过 `npm run intake` 接收外部脚本提供的文章；默认只收录，显式请求才排队分析。
- 入队后及时通知串行消费者；繁忙时的新任务接着处理，慢来源不阻塞已有分析。

不提供公众号自动发布、多用户协作、公开 RSS、付费数据接口或完整历史归档。`已发布` 只是你的选题进度标签。

## 五分钟本地启动

当前版本 **2.2.0**，公众号写作分支为 `codex/fde-editorial-workbench`，基于保留 CLI 与代理修复的 PR #5。已有 2.1 用户先按 [升级说明](docs/OPERATIONS.md#220-草稿数据库升级) 用旧代码备份，再切换新代码；SQLite 会从 schema 1 升级到 2。Windows 本机优先，新增写作和微信公众号粘贴仍需本机验收。对 T3 的取舍不变；公众号工具比较见 [WECHAT_DESIGN_REVIEW](docs/WECHAT_DESIGN_REVIEW.md)。

需要 Node.js **24.22.1 或更新的 24.x**。本版在 24.22.3 验证。先从仓库根目录进入本目录：

```bash
cd fde-workbench
npm ci --ignore-scripts
npm run init
npm run doctor
npm run check
npm test
npm start
```

打开 `http://127.0.0.1:3210`。登录口令由初始化脚本写入本目录 `.env` 的 `FDE_ACCESS_TOKEN`。在自己的终端查看，不发到聊天或提交 Git。初始化不会覆盖已有配置。

首次启动 **采集、分析和自动分析全部关闭**。没有模型账号也可以导入资料、做个人笔记、管理选题。未完成分析的资料暂不提供 Markdown 导出。

## 推荐启用顺序

1. 按 [部署文档](docs/DEPLOYMENT.md) 在目标机器完成资源与端口检查。
2. 保持模型关闭，仅将 `FDE_COLLECT_ENABLED=true`，重启，检查首批来源与文章质量。
3. 选择 `api` 或 `codex`，设置 `FDE_DAILY_LIMIT=5`，保持 `FDE_AUTO_ANALYZE=false`。分析与写作共享上限，失败和未知尝试也计入。
4. 在界面人工选择一篇资料，核对原文引文、实际用量和结果。
5. 已有研究卡可进入“公众号草稿”。先用零模型素材稿验证编辑与排版，再在剩余次数内测试 AI 写作。不要清空账本来制造剩余额度。

首次采集、旧文章和未披露日期的资料不会自动送给模型；它们仍可以人工排队分析。打开网页、搜索、保存笔记和导出均不触发模型。

如果代理的 Fake-IP 让已审核信源返回 `blocked_url`，可以在研究台的 `.env` 中设置 `FDE_SOURCE_PROXY_URL`，指向已经核实的本机 HTTP CONNECT 代理。留空可沿用普通网络的采集路径。运行 `npm run sources:check -- --id=meituan-engineering` 可检查入口、正文和原始日期，命令只访问公开信源。 [Windows 代理检查与验收](docs/WINDOWS_LOCAL.md#检查本机采集代理)

## 文档入口

| 目的 | 文档 |
|---|---|
| 当前完成情况、限制、后续接手 | [仓库 CHECKPOINT](../CHECKPOINT.md)、[Codex 接手顺序](docs/CODEX_HANDOFF.md) |
| 直接交给 Codex 安装与验收 | [Codex 部署提示词](docs/CODEX_DEPLOY_PROMPT.md) |
| 交给 Codex 继续开发 | [二次开发提示词](docs/CODEX_DEVELOPMENT_PROMPT.md) |
| T3 为什么不直接嵌入 | [T3 设计取舍](docs/T3_DESIGN_REVIEW.md) |
| Windows 本机 / 外部脚本接入 | [WINDOWS_LOCAL](docs/WINDOWS_LOCAL.md)、[EVENT_INTAKE](docs/EVENT_INTAKE.md) |
| 系统设计与模块职责 | [ARCHITECTURE](docs/ARCHITECTURE.md) |
| 信源选择、偏差和实际核验 | [SOURCES](docs/SOURCES.md)、[机器可读审计](config/source-audit.json) |
| API / Plus CLI、用量与失败处理 | [MODEL_USAGE](docs/MODEL_USAGE.md) |
| 本机 / VPS / 可选 Docker | [DEPLOYMENT](docs/DEPLOYMENT.md) |
| 研究与公众号选题 | [EDITORIAL_WORKFLOW](docs/EDITORIAL_WORKFLOW.md) |
| 公众号写作、两种版本、排版与工具取舍 | [WECHAT_DESIGN_REVIEW](docs/WECHAT_DESIGN_REVIEW.md)、[本机升级与验收提示词](docs/CODEX_WECHAT_PROMPT.md) |
| 备份、恢复、升级和锁处理 | [OPERATIONS](docs/OPERATIONS.md) |
| 已运行的验证与未验证项 | [VALIDATION](docs/VALIDATION.md) |
| 修改规则 | [AGENTS](AGENTS.md)、[CHANGELOG](CHANGELOG.md) |

信源列表不等于转载许可，模型结果也不等于事实核查。准备公开文章时，保留出处，核对效果数字和部署阶段，加入自己的分析。
