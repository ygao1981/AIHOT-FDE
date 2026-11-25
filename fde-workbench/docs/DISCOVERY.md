# 免费信息发现与线索池

从「发现线索」进入。搜索结果可以逐条保存，也可一次保存本页待核对和工程相关的线索。确认原文后，在线索池点击「收录工程原文」。已有研究库资料会显示「查看研究库资料」。

| 渠道 | 使用方式 | 来源与互动 |
| --- | --- | --- |
| X | 选择工程主题和作者，点「在 X 搜索」，在本人浏览器查看。复制帖子链接，可粘贴正文或摘录并关联原文 | 帖子日期与互动缺失时显示未知。 [X 高级搜索](https://help.x.com/en/using-x/x-advanced-search) |
| Hacker News | 按主题或关键词搜索，设置开始和结束日期、最低积分、最少评论。时间按 UTC，结束日期包含当天 | 原站搜索提供积分与评论数，讨论链接和投稿原文分别保存。 [HN Search API](https://hn.algolia.com/api) |
| GitHub | 选仓库、活动类型和天数后检查。可以保存本页线索。已启用跟踪的仓库随本机定时采集更新 | 仓库概况、Issue、PR、Release 和文档差异来自公开 REST 接口。Discussion 走只读 GraphQL，未配置凭据时可打开原生讨论区。 [REST 接口](https://docs.github.com/en/rest) [Discussion 接口](https://docs.github.com/en/graphql/guides/using-the-graphql-api-for-discussions) |
| 工程博客与教程 | 工程博客从「信源」更新。Datawhale 教程首页可人工打开，章节变动也可在「发现线索 → GitHub」查看 | 按正文和原文日期筛选。教程、厂商自述、试点和生产部署分别核对。 [信源目录](SOURCES.md) |

工程主题覆盖企业 AI 上线、系统集成、RAG、权限与数据隔离、评测与可观测性、成本与性能、故障恢复、人工审批及工业现场。按标题和正文的实际工程细节下调招聘、单纯营销和报名活动的优先级。包含实现步骤、代码、评测或架构的教程仍可保留。排序标签只用于阅读优先级，证据强度要看原文。

**聚合规则**。线索按标准化后的原文链接分组，保留各来源的标题、出处、时间和平台计数。例如 X 帖子和 HN 投稿指向同一个教程时，会一起显示在同一组。尚未找到原文时先保留单独的线索，随后可以点「关联原文」。链接跟踪参数和 X 帖子域名变体不会创建重复记录。标题相近、链接不同的资料需要人工确认。

**GitHub 增量**。按更新时间取近期 Issue、PR 和 Discussion，按发布日期取 Release。合并的 PR 会自动附上自己的项目原文。文档检查只看指定目录和有限数量的近期提交，要求差异新增实际内容，排除常见变更日志及只改空白的提交。项目记录可用于核对实现，客户上线和量化收益需补充原始证据。

**免费限流**。GitHub 匿名 REST 主限额是每个出口 IP 每小时 60 次。请求串行执行，5 分钟内复用相同查询，尊重 `Retry-After` 和主限额重置时间。定时跟踪只在定时采集开启后运行，已选仓库约 12 小时检查一次，批次间至少 15 分钟。HN 和 GitHub 沿用工作台已配置的本机采集代理。 [GitHub 限流规则](https://docs.github.com/en/rest/using-the-rest-api/rate-limits-for-the-rest-api) [GitHub 使用建议](https://docs.github.com/en/rest/using-the-rest-api/best-practices-for-using-the-rest-api)

如需在工作台读取 Discussion，可在服务端 `.env` 的 `FDE_GITHUB_DISCUSSIONS_TOKEN` 配置可读目标公开仓库的免费 GitHub 凭据，然后重启。优先使用满足接口权限的只读细粒度凭据。只有对 `api.github.com/graphql` 的固定查询携带此项。搜索、初筛、保存线索和收录原文均为普通程序操作。自动分析继续使用「用量」页的滚动上限，手动任务照常记账。 [GitHub GraphQL 认证](https://docs.github.com/en/graphql/guides/forming-calls-with-graphql)

## OpenCLI 与 Agent-Reach 源码核查

2026-11-25 通过上游仓库核对默认分支、最近提交、最新正式版本、许可证和关键实现。

| 上游 | 维护与许可 | 账号边界与采用方式 |
| --- | --- | --- |
| OpenCLI | [READ] Apache-2.0。未归档。最新正式版 v2.0.3 与最近主分支更新均为 2026-11-08（UTC+8）。 [提交](https://github.com/jackwener/OpenCLI/commit/9bc5f5ca132ec4d4e48d7ee517d4303bf159e8e8) [Release](https://github.com/jackwener/OpenCLI/releases/tag/v2.0.3) [许可证](https://github.com/jackwener/OpenCLI/blob/9bc5f5ca132ec4d4e48d7ee517d4303bf159e8e8/LICENSE) | [READ] 浏览器桥权限含 Cookie 和全站主机访问。X 搜索适配器依赖已登录会话和 X 内部搜索接口。采用按渠道展示能力与失败原因的设计。 [浏览器权限](https://github.com/jackwener/OpenCLI/blob/9bc5f5ca132ec4d4e48d7ee517d4303bf159e8e8/extension/manifest.json) [X 适配器](https://github.com/jackwener/OpenCLI/blob/9bc5f5ca132ec4d4e48d7ee517d4303bf159e8e8/clis/twitter/search.js) |
| Agent-Reach | [READ] MIT。未归档。最新正式版 v1.6.1 为 2026-11-01，最近主分支更新为 2026-11-24（UTC+8）。 [提交](https://github.com/Panniantong/Agent-Reach/commit/8d9ecc1f5521fe7d223cde782aaa4005695e2671) [Release](https://github.com/Panniantong/Agent-Reach/releases/tag/v1.6.1) [许可证](https://github.com/Panniantong/Agent-Reach/blob/8d9ecc1f5521fe7d223cde782aaa4005695e2671/LICENSE) | [READ] 当前 X 渠道标记为实验性，通过 OpenCLI 与专用浏览器会话运行。仓库通过独立适配器核查上游工具状态。采用统一线索表示与渠道独立错误处理。 [X 渠道](https://github.com/Panniantong/Agent-Reach/blob/8d9ecc1f5521fe7d223cde782aaa4005695e2671/agent_reach/channels/twitter.py) [GitHub 渠道](https://github.com/Panniantong/Agent-Reach/blob/8d9ecc1f5521fe7d223cde782aaa4005695e2671/agent_reach/channels/github.py) |

[READ] 上游许可证覆盖各自代码，平台访问以平台规则为准。X 条款对未经授权的抓取明确设限。本次采用 X 原生搜索和人工粘贴，HN 和 GitHub 使用各自公开文档中的接口。两套上游工具与浏览器扩展均未安装。 [X 服务条款](https://x.com/en/tos) [X 自动化规则](https://help.x.com/en/rules-and-policies/x-automation)
