# FDE 信源目录与核查说明

本目录服务于个人 FDE 落地研究和公众号选题。FDE 在这里指深入客户业务现场、把 AI 方案变成可运行系统的工程与交付工作。资料应帮助回答：哪个业务环节存在问题、团队如何实施、如何评估、上线后如何运行，以及哪些做法失败了。

2.3.0 有 **32 个信源，默认启用 13 个**。新增 Uber、Cloudflare、Simon Willison 和 Shreya Shankar，Datawhale Happy-LLM 增加人工入口。主题搜索、作者、跟踪仓库和文档路径见免费发现配置。 [免费发现说明](DISCOVERY.md) [主题与仓库目录](../config/discovery.json)

| 新增入口 | 关注方向 | 日期与证据 |
| --- | --- | --- |
| [Uber AI / ML 工程](https://www.uber.com/us/en/blog/engineering/uber-ai/) | 评测、权限、内部系统集成 | 列表卡片给出日期，原文可读。合作公告与项目实施报告分别使用 |
| [Cloudflare Agents](https://blog.cloudflare.com/tag/agents/) | Agent 运行、委派、权限与部署 | 官方 RSS 与原文样本均可读。技术图和示例可作为架构证据 |
| [Simon Willison](https://simonwillison.net/atom/entries/) | 公开可复现工具、LLM 工程、个人实测 | 长文 Atom 保留发布日。作者试验结论仍受样本和环境限制 |
| [Shreya Shankar](https://www.sh-reya.com/blog/) | 定性评测、人机复核、实验设计 | 列表与正文均含原文日期。近期窗口可能没有新作，扩大范围后可找过往教程 |
| [Datawhale Happy-LLM](https://github.com/datawhalechina/happy-llm) | 中文教材与开源项目练习 | 源码与章节人工阅读。GitHub 跟踪同目录的实质文档更新 |

以下保留 2.2.x 的核查基线。旧目录核查 27 个一手资料入口，默认启用 9 个，其余有 13 个关注项、3 个手动入口和 2 个暂不可用入口。

核查日期为 **2026-11-20，UTC**。每次请求的精确时间、最终 URL、HTTP 状态、响应哈希、条目数与样本日期证据见 [`../config/source-audit.json`](../config/source-audit.json)。可执行的配置种子见 [`../config/sources.json`](../config/sources.json)。这些是一次可复核的观察，不是长期可用性承诺。VPS 网络出口不同，上线前必须复测。

默认 9 个来源还经过了项目原生 `parseFeed` / `parseList` / `extractArticle` 对本次真实 HTTP 响应的复测：9 个列表都按配置解析出 8 条候选；其中 8 个来源的样本正文和原始日期通过，Palantir 仅通过原站订阅正文与日期，并明确保留详情 403 的限制。Dify 跨卡片日期串用、Hamel 日期元数据和 Shopify 属性大小写差异均已用真实样本核对。具体结果保存在审计文件的 `nativeParserVerification` 中。

## 1. 默认 9 个来源

| 来源 | 取什么 | 本轮入口与证据 | 主要限制 |
|---|---|---|---|
| [美团技术团队](https://tech.meituan.com/) | 国内业务团队自己的 Agent、评测、数据与运行经验 | [官方 Atom](https://tech.meituan.com/atom.xml) 200，10 条；商家 AI 助手样本正文 200，页面原文日期可见 | Atom 只有 `updated`；详情 `.vp-post-date` 才是可见原文日期。论文合集和模型发布仍需淘汰 |
| [Microsoft Frontier Engineering](https://devblogs.microsoft.com/frontier-engineering/) | 客户协作、交付、工业数据、评估、受限网络 | [新 RSS](https://devblogs.microsoft.com/frontier-engineering/feed/) 200，10 条；样本正文及 `article:published_time` 通过 | 旧 ISE 地址已迁移。不同出口存在间歇 403；两天 hackathon 不能当作长期生产案例 |
| [Anthropic Engineering](https://www.anthropic.com/engineering) | Agent 架构、评测、工具、上下文、长任务和失败经验 | 静态列表 200，24 个可解析卡片；样本正文、`article:published_time` 通过 | 页面标示总数不等于静态可采集数；文章路径同时有 `/research/` 和 `/engineering/`；没有宣称存在已验证 RSS |
| [LangChain Customer Stories](https://www.langchain.com/customers) | 具名客户工程经验，优先客户工程师署名 | 36 张文章卡片，去重 33 个 URL；列表首篇 Orange Business 正文与 JSON-LD `datePublished` 通过 | 排除视频和 Logo 链接。客户卡没有日期，必须从正文取。仍有厂商选稿及成功案例偏差 |
| [Hamel Husain](https://hamel.dev/) | 评测集、人工校准、错误分析、业务成功标准 | [真实 RSS](https://hamel.dev/index.xml) 200，20 条；正文与 `dcterms.date` 通过 | `/blog/` 当前只是跳首页的 HTML 空壳；有培训及咨询业务，实验结论有样本边界 |
| [Eugene Yan](https://eugeneyan.com/) | 应用 AI、检索、评测与工程模式 | [真实 RSS](https://eugeneyan.com/rss/) 200，214 条；正文及日期通过 | 仅保留 `/writing/`，排除演讲入口。存档较多，不能当成当天新文章；综述里的第三方结论仍需追原研究 |
| [Shopify Engineering](https://shopify.engineering/) | 实际业务 Agent 的架构、工具、评测、运行与成本 | [官方 Atom](https://shopify.engineering/blog.atom) 200，441 条；正文和详情 `datePublished` 通过 | 全工程订阅含非 AI 内容。每轮只取有限条目；详情日期与 feed 日期精度可能不同 |
| [Dify 中文入口](https://www.dify.ai/zh/blog) | 私有部署、现有系统集成、知识管理和应用运营 | 静态列表 200，152 个带标题的文章链接；样本正文和日期通过 | 中英文混合，中文入口不等于中国项目；置顶、产品发布、融资宣传需继续过滤；匿名客户只能作线索 |
| [Palantir 官方博客](https://blog.palantir.com/) | Bootcamp、业务工作流、数据与行动之间的连接 | [RSS](https://blog.palantir.com/feed) 200，10 条，包含原站提供的正文；详情抽验 403 | 状态明确为 `feed_body_only`。只依据订阅内容时标 `feed_excerpt`，不得写“全文已核验”。招聘和品牌观点需淘汰 |

默认源不是全部内容都值得阅读。列表发现之后仍应按业务相关性和证据筛选。优先级 `5` 最高、`1` 最低；每源每轮上限默认 8 条。首次采集与历史文章先进入资料库，不把积压文章自动当成今日选题，更不自动消耗模型额度分析整站存档。

### 为什么不只按 FDE 三个字筛选

大量可迁移经验不会在标题里写 FDE。例如售后知识库、旧系统数据迁移、员工经验采集、评测标准、人工转交、权限和上线维护，都是实际交付工作的组成部分。反过来，招聘、融资、职业热度和没有工程细节的 FDE 观点稿，即使命中 FDE 也应降级。

## 2. Datawhale 与中国资料的处理

Datawhale 是重点方法资料来源，但教程、版本发布和客户生产案例要分别使用。

| 入口 | 状态 | 使用方式与依据 |
|---|---|---|
| [Hello-Agents](https://github.com/datawhalechina/hello-agents) | 关注，默认关闭自动采集 | 官方教程与代码可读。[Release Atom](https://github.com/datawhalechina/hello-agents/releases.atom) 200/3 条，但内容主要是教材版本说明；不能拿发布说明凑实战案例 |
| [All-in-RAG](https://github.com/datawhalechina/all-in-rag) | 手动 | 适合文档处理、检索、评估与项目练习；公开仓库正文可读。[Release Atom](https://github.com/datawhalechina/all-in-rag/releases.atom) 200，但 0 条，不能当增量源 |
| [FDE100](https://fde100.datawhale.cn/) | 手动 | 本轮普通 HTTP 得到约 2 KB 的 JavaScript 应用壳，没有核实到可采集案例正文和原始日期。可人工发现资料后补充原文，不保证自动全文导入 |
| [AgentScope](https://github.com/agentscope-ai/agentscope) | 关注 | 官方框架、代码与示例可读；Release Atom 200/10 条。项目中的作者声明可追到阿里通义团队；版本记录不是客户案例 |
| [Spring AI Alibaba](https://github.com/alibaba/spring-ai-alibaba) | 关注 | 官方 Java AI 应用框架、集成示例；Release Atom 200/10 条。关注实际项目需要的实现，避免形成框架升级快讯流 |
| [阿里云 Spring Cloud Alibaba 最佳实践](https://sca.aliyun.com/blog/case/) | 关注 | 5 张静态实践卡片，样本正文可读；包含 [代码助手教程](https://sca.aliyun.com/blog/sca-gvr7dx_awbbpb_zvckkyzhmfqhgql4/)。当前栏目最新卡片为 2025-02-24，内容也包含普通云原生迁移，不默认每日启用 |
| [百度千帆 AppBuilder SDK](https://github.com/baidubce/app-builder) | 关注 | 官方知识库、文档处理、端云工具调用示例；Release Atom 200/10 条，样本正文可读。云服务示例的运行可能需要平台凭据，阅读资料不需要 |
| [PaddleOCR](https://github.com/PaddlePaddle/PaddleOCR) | 关注 | 文档解析、PDF、表格和结构化输出是企业 RAG 的关键基础；Release Atom 200/10 条。它是组件资料，不能当作完整 FDE 交付案例 |
| [腾讯 WeKnora](https://github.com/Tencent/WeKnora) | 关注 | 腾讯官方知识库系统，代码和部署文档可读；Release Atom 200/10 条。按实际接入、检索、权限和运行问题学习，不把能力声明当生产效果证明 |

国内持续增量案例目前主要由美团团队原文补充。阿里、腾讯、百度在本目录中更多提供官方项目和实施资料；这不等于已经覆盖了这些厂商的完整客户交付案例。FDE100 的全文抓取仍有缺口。Dify 中文资料中也有海外客户。**不为了“国内外各半”而把二手报道、匿名指标或项目 README 伪装成国内生产案例。**

GitHub release Atom 常常只有 `updated`。它表明发布记录最后更新时间，不自动等于教材、章节或案例的最初发布日期。未知原始日期应为 `null`。

微信资料仅采用手动提供链接、手动提供正文或明确授权的数据渠道。本版没有默认浏览器采集器，也没有承诺能够绕过微信限制、付费墙、登录或站点验证。

## 3. 海外扩展候选与关闭原因

| 入口 | 状态 | 本轮证据与取舍 |
|---|---|---|
| [Microsoft ISE Engineering Fundamentals Playbook](https://microsoft.github.io/code-with-engineering-playbook/) | 手动 | 静态手册可读，适合需求发现、完成标准、测试、交付与维护检查表；不是资讯 feed，也不是仅针对 AI 的案例集 |
| [Chip Huyen](https://huyenchip.com/) | 关注 | [RSS](https://huyenchip.com/feed.xml) 200/10 条，正文与日期可读；本轮 feed 最新条目仍为 2025-01-16。接口可用不代表持续更新，适合作为低频方法库 |
| [Airbnb Engineering](https://airbnb.tech/) | 关注 | [RSS](https://airbnb.tech/feed/) 200/10 条，样本正文可读，原始日期来自 feed `pubDate`。质量较高，作为默认源扩容时的优先候选，暂时控制数量 |
| [Netflix TechBlog](https://netflixtechblog.com/) | 关注 | [RSS](https://netflixtechblog.com/feed) 200/10 条并带正文，样本详情 403；只能按 `feed_body_only` 使用。传统推荐和大规模基础设施内容也较多 |
| [DoorDash Engineering](https://careersatdoordash.com/engineering-blog/) | 关注 | 工程列表及样本正文、日期通过；内部支持 Agent 和持续改进文章很贴近交付。站点同时含招聘，需要限定工程列表及 `/blog/文章/` 路径 |
| [Stripe 工程专题](https://stripe.dev/blog/topic/engineering) | 关注 | 旧地址已跳到 `stripe.dev`。[新 RSS](https://stripe.dev/blog/feed) 200/131 条；样本正文及 JSON-LD 日期通过。订阅覆盖全开发者博客，先控制产品公告噪声 |
| [Intercom / Fin 博客](https://www.intercom.com/blog/) | 关注 | 旧 `/blog/engineering/` 404；从当前首页发现的 [RSS](https://www.intercom.com/blog/feed) 200/20 条，样本正文及日期通过。客服 Agent 技术叙述与购买产品的宣传交织 |
| [AWS 制造业工程分类](https://aws.amazon.com/blogs/industries/category/industries/manufacturing/) | 暂不可用 | 本轮普通 HTTP 列表 403；没有验证可执行 CSS 选择器，默认关闭。搜索工具能看到部分文章不代表 VPS 可以自动采集 |
| [AWS Machine Learning Blog](https://aws.amazon.com/blogs/machine-learning/) | 暂不可用 | `/feed/` 本轮 403，未取得有效 XML 或条目；同时范围比制造业专栏更宽。待目标 VPS 复测后再决定，不预先宣布接通 |

所有来源都应逐篇判断。官方来源能证明“某团队这样描述了自己的工作”，不自动证明其商业指标经过独立审计。个人专家的原创方法与实验有价值，但也不能代表其任职机构的正式结论。

## 4. 本轮纠正的重要入口与解析问题

### 4.1 不能根据习惯猜 RSS

- 微软旧 `https://devblogs.microsoft.com/ise/` 已跳到 `https://devblogs.microsoft.com/frontier-engineering/`。旧 `/ise/feed/` 404；从新页面实际链接找到的新 `/frontier-engineering/feed/` 已解析成功。
- LangChain 旧 `https://blog.langchain.com/rss/` 曾跳到 HTML 页面；当前详情页明确声明的 `https://www.langchain.com/blog/rss.xml` 本轮解析出 100 条。默认仍用客户列表，避免整个博客的融资和产品新闻。
- Hamel 的 `/blog/` 是跳转空壳；从首页发现 `/index.xml`，解析出 20 条。猜测的 `/blog/index.xml` 404。
- Eugene Yan 的官方入口是 `/rss/`。目录不采用未经验证的 `/rss.xml`。
- 美团的 `rss.xml` 虽然可解析，但条目没有日期；`atom.xml` 有更新时间，详情有可见原文日期。二者不能混为一谈。
- Stripe 旧域名的 feed 404；新 `stripe.dev/blog/feed` 有效。Intercom 的旧 engineering 栏目 404，但首页声明的 feed 有效。

### 4.2 三个已观察到的 HTML 选择器

| 来源 | 列表容器 | 相对链接 | 标题 | 日期 |
|---|---|---|---|---|
| Anthropic | `article[data-listing-row]` | `h3 a` | `h3` | 卡片 `time`；正文 `article:published_time` |
| LangChain 客户 | `[data-body-story-title]` | `a[data-body-story-card="article"]` | `.t-heading-6-rg` | 卡片没有；正文 JSON-LD `datePublished` |
| Dify 中文入口 | 无独立 item，直接选择带标题的文章卡片 | `a[href^="/zh/blog/"]:has(h2), a[href^="/zh/blog/"]:has(h3)` | 链接内 `h2, h3` | 当前链接内 `time[datetime]`；正文 `article:published_time` |

Dify 的日期必须从**当前卡片**查找。若全局取页面第一个 `time`，会把置顶文章的日期错误地套到所有文章上。还要排除同路径的 3 个无标题导航或重复链接，因此选择器要求链接内有 `h2` 或 `h3`。Anthropic 的稳定选择依据是 `data-listing-row` 和语义标签，避免依赖随构建变化的哈希类名。LangChain 只取 article 卡，不抓视频卡与客户 Logo。

Shopify 的原始 HTML 使用 `itemProp="datePublished"`。有的解析库会统一属性名大小写，linkedom 则会保留；只用小写属性名的 CSS 查询可能漏掉日期。原生采集器已兼容这个实际观察到的属性写法；本轮实际采集器复测得到样本原文日期 `2026-11-18T00:00:00Z`，详情日期优先于 feed 日期。Dify 的新卡片选择器也已在实际采集器复测中通过。

### 4.3 两个无需密钥的 XML 复测样例

下面只读取公开订阅，不调用模型、不写站点，也不执行订阅中的内容。可以在目标 VPS 用 Python 标准库运行：

```bash
python3 - <<'PY'
import urllib.request
import xml.etree.ElementTree as ET

for url in (
    "https://tech.meituan.com/atom.xml",
    "https://eugeneyan.com/rss/",
):
    request = urllib.request.Request(url, headers={"User-Agent": "FDE-Source-Check/1.0"})
    with urllib.request.urlopen(request, timeout=25) as response:
        data = response.read(4_000_000)
    root = ET.fromstring(data)
    entries = root.findall("./channel/item") or root.findall("{http://www.w3.org/2005/Atom}entry")
    print(url, "root=", root.tag, "entries=", len(entries))
PY
```

HTML 两个最小可跑配置是 `anthropic-engineering` 和 `langchain-customers`，完整选择器与 host 白名单已经写入 `sources.json`。VPS 使用项目的 `npm run sources:check` 复核。**HTTP 200 只是第一步**，还要确认列表有文章、标题不是导航、正文长度足够、日期来自原文，以及最终跳转 host 符合来源范围。

本轮 Node 原生检查继承运行环境已经提供的出口代理。只有在本地 DNS 不可用时，采集器才可对静态精确白名单中的 HTTPS 域名把解析交给已配置代理；这不等于本机 DNS 校验成功，也不允许任意导入地址使用该例外。该模式依赖可信出口代理，VPS 应按自身网络复测。审计不会记录代理地址、凭据或密钥。

## 5. 内容与证据评级

每篇资料至少区分两个维度。

**内容类型：**教程、概念验证、生产案例、交付方法、厂商方案、媒体线索。教程可进入方法库；它不需要被包装成生产案例才有价值。

**证据强度：**

1. **较强：**具名实施团队或客户工程师署名；说明业务流程、约束、数据、实施、运行阶段和结果口径。仍标明自述。
2. **中等：**厂商介绍具名客户，有具体技术与运营细节，但指标只有单方报告。
3. **线索：**客户匿名、只给提升倍数、只有演示、缺少原文，或来自媒体转述。适合继续核实，不直接输出成确定事实。

对“提升 10 倍”“成本下降 98%”之类表述，保留原始指标、基线、样本、时间范围和任务边界。未披露就写未披露。原型速度不等于整个项目交付周期；生成有效 JSON 不等于业务结果正确；模型基准分不等于客户任务完成率。

本目录不把媒体加入默认核心池。媒体和公众号可以提供线索，但涉及技术事实时应追到客户、实施团队、代码或原始技术文档。

## 6. 可立即研究的原文

这些条目是阅读建议，不会因本文件存在而自动批量触发模型分析。

| 原文与日期 | 值得研究的问题 | 证据边界 |
|---|---|---|
| [美团：商家 AI 助手的评测与优化闭环实践](https://tech.meituan.com/2026/11/17/Agent-Evaluation-White-Paper-02.html)，2026-11-17 | 如何把业务 SOP、真实错误、工具调用、日期范围与最终交付物变成评测标准 | 国内实施团队原文；不要拿通用 benchmark 分数替代业务验收 |
| [Shopify：Building production-ready agentic systems](https://shopify.engineering/building-production-ready-agentic-systems)，2025-08-26 | 业务工具变多后，Agent 架构和评测为什么必须调整 | 产品团队自己的复盘；平台资源条件与客户现场不同 |
| [Remote：客户数据导入案例](https://www.langchain.com/blog/customers-remote)，2026-01-19 | 大模型做映射与规划，代码处理批量数据；怎样连接沙箱、验证和可恢复流程 | 客户工程师署名，效果仍是自述；代码执行不能被说成彻底消除模型错误 |
| [DoorDash：内部支持 Agent 的持续改进](https://careersatdoordash.com/blog/building-an-automated-improvement-harness-for-an-ai-support-agent/)，2026-11-10 | 知识缺口、能力缺口、工具利用问题和资料错误，应分别如何修复 | 具名工程师原文；改进比例必须保留原作者统计口径 |
| [Hamel：How To Use Decision Models for Evals](https://hamel.dev/blog/posts/decision-model-evals/)，2026-10-20 | 评测器阈值如何与业务误报、漏报和成本关联 | 特定实验与样本；模型价格、可用性和版本需重新核实 |
| [Anthropic：Building effective agents](https://www.anthropic.com/research/building-effective-agents)，2024-12-19 | 哪些任务用明确工作流就足够，何时需要自主 Agent | 官方已注明部分旧工具内容变化；保留方法，接口按当前文档 |

## 7. 运行与维护边界

- `sources.json` 是初始目录种子。用户在应用里修改的启用状态存入 SQLite，升级目录不能覆盖用户的开关决定。
- `auto` 表示适合默认自动读取；`watch` 表示有价值但默认关闭；`manual` 表示按需要人工选资料；`disabled` 表示当前抓取路径未通过。`verification.status` 单独记录技术结果，避免把“值得看”和“可以抓”混为一件事。
- `passed` 表示本次对应入口和样本成功，并不承诺每篇都可用。`feed_body_only` 明确说明详情没有通过，只能用原站订阅中的内容。`js_only` 不是已经接通。
- 优先详情的原始发布日期。禁止将抓取时间、HTTP `Last-Modified`、仓库最近提交、RSS 更新或模型猜测写成文章原始发布日期。日期只有“天”就保留到天；未知保持 `null`。
- 不同来源的长期更新时间不同。没有新文章不等于故障；过久没有更新则看目录用途和 feed 是否落后于官网。先人工核实再替换，避免维护无效的重复来源。
- 普通公开网页和 RSS 的读取不消耗大模型 token。全文分析、翻译、摘要和选题生成才可能调用所配置模型。运行某个教程或供应商 SDK 的示例也可能产生独立 API 用量，和阅读这份资料是两件事。
- 自动采集和手动导入都先用本地规则区分 `candidate`、`skipped` 与 `needs_body`。排队与执行前还会复核；未通过的资料可以阅读、记笔记或补正文，不能强制分析。本地拒绝不建立模型任务收据，不占用尝试次数或预算，也不触发分析暂停。具体顺序见 [ARCHITECTURE.md](ARCHITECTURE.md)。
- 仅作个人研究与原文引用；默认保留摘要、证据和原文链接。公众号发布应以自己的分析为主，引用遵守来源许可；不批量镜像教程和完整付费内容。

本轮没有登录站点、调用模型、安装浏览器抓取器或绕过访问控制。某些站点在搜索工具中可读，而普通 HTTP 失败；审计保留这个差异，不把其中一方的成功套到另一方。
