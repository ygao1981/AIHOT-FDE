# 公众号写作与排版：源码审查和本版取舍

更新：2026-11-23（Asia/Singapore）。本轮基线 `8d0df4506a86a2981c55798300884415c4190903`，即已有 CLI 事件修复与本机代理修复之后的 PR #5。

## 结论

在 FDE 研究台内增加轻量公众号草稿区。用一次受控写作任务组织已有研究卡，然后由本地程序输出纯文字版和图文版。写作、排版和发布是不同操作：本版实现前两项，正式发布仍由用户完成。

不新增数据库服务，不重读全部网页，不让模型检查“有没有任务”，不为不同主题重复写稿。内容仍留在本机，代码和公开规则可迁移到 Linux；配图计算在用户浏览器进行。

## 恢复的个人规则

本次查回的历史对话明确：公众号为《半理性半烟火》，偏好有场景感、短句、留白、自然人味；知识融入具体问题，避免 AI 模板味。曾使用 Doocs Markdown，并偏好 CC/Claude Code 风格的克制、理性和模块化手机阅读。同一账号的长文、知识卡片、单图和短文配图应分别处理。

同时读取了当前可用的“高阳的写作风格” skill：结论清楚、事实与判断分开、未知不编造、强调实际落地。上述个人规则适用于这次写作；不把内部任务安排里的命令口吻硬套成对外文章。

历史检索提到《公众号写作规则与风格总结_扩展版.docx》，但本次没有找到可读取的原件，不能声称已逐条恢复该文档。当前落盘的是已确认规则与明确标注的产品默认值：长文目标 1200–1800 字，短文目标 600–900 字；可在 `config/editorial-profile.json` 修改。规则文件和 `prompts/editorial.md` 的内容共同进入写作指纹。

## 比较过的项目

只读审查了下列版本的相关入口、skill、实现和许可证，没有安装或执行第三方脚本，也没有复制其代码、提示词或模板。

| 项目及固定版本 | 实际适用部分 | 本版取舍 |
| --- | --- | --- |
| [mcncarl/yichen-skills](https://github.com/mcncarl/yichen-skills/tree/c9f47ecbcda513c0ce160bb55bfaf01060765053) | 已知链接采集、微信历史导出、本地数据归档、X Articles 草稿上传 | 微信部分主要是输入端；未发现公众号成稿与排版完整链路。参考“内容与媒体清单、预检、保存后回读”的工作方法 |
| [doocs/md](https://github.com/doocs/md/tree/0b583775b9db715c5ceac7e632baec435f05f58e) | 微信 Markdown 编辑、内联样式、正文复制与主题 | 继续支持用户将 Markdown 放入 Doocs 进一步精修。本版借鉴正文与样式分离，不嵌入整套 Vue 编辑器 |
| [JimLiu/baoyu-skills](https://github.com/JimLiu/baoyu-skills/tree/bf1ff076e25f8da4a339eb1c8cf03361fea5ea4c) | Markdown 转公众号 HTML、配图规划、图片与草稿适配 | 功能更接近需求，但默认联网、图片调用和运行权限需要改造。本版独立实现更窄的本地排版；以后需要任意 Markdown/公式时再评估 baoyu-md |
| [zdyya/writer-skill](https://github.com/zdyya/writer-skill/tree/dd100aaf4bb4c028bbda6b11184d232c4c0a0737) | 个性化规则、证据区分、结构化信息图 | 参考规则与信息结构，保留 Node 单运行时；不把已有研究再跑全网调查和六角色模型审稿 |

### 为什么不直接装 yichen 整包

该版本[根 LICENSE](https://github.com/mcncarl/yichen-skills/blob/c9f47ecbcda513c0ce160bb55bfaf01060765053/LICENSE)限制个人非商业用途，对商业、公司内部用途和公开重新打包另有授权要求。因此不能把“GitHub 可见”理解成可以任意嵌入公开项目或企业交付。本版没有复制其受限实现。

其微信模块主要读取已有文章；[文章上传器](https://github.com/mcncarl/yichen-skills/blob/c9f47ecbcda513c0ce160bb55bfaf01060765053/yichen-x-article-draft-uploader/SKILL.md)面向 X，不是微信公众号。旧下载脚本仍包含某中转服务默认地址，而新归档模块文档已说明该服务停用，进一步说明不能整包照搬安装说明。

### 为什么不直接接 doocs CLI 或 baoyu 图片包装器

doocs 的 [`@md/core`](https://github.com/doocs/md/blob/0b583775b9db715c5ceac7e632baec435f05f58e/packages/core/package.json) 是 monorepo 内部包，标为 private 并依赖 workspace。其 [`md-cli/server.js`](https://github.com/doocs/md/blob/0b583775b9db715c5ceac7e632baec435f05f58e/packages/md-cli/server.js)启动本地图床和到在线编辑器的代理，不是独立离线转换命令。根许可为 WTFPL，具体子包仍应逐项核对。

baoyu 的[排版 skill](https://github.com/JimLiu/baoyu-skills/blob/bf1ff076e25f8da4a339eb1c8cf03361fea5ea4c/skills/baoyu-markdown-to-html/SKILL.md)确实能转 HTML，纯渲染不需要语言模型。但[图片下载实现](https://github.com/JimLiu/baoyu-skills/blob/bf1ff076e25f8da4a339eb1c8cf03361fea5ea4c/packages/baoyu-md/src/images.ts)没有沿用本项目的地址、大小与跳转边界。[Codex 图片启动器](https://github.com/JimLiu/baoyu-skills/blob/bf1ff076e25f8da4a339eb1c8cf03361fea5ea4c/packages/baoyu-codex-imagegen/src/spawn.ts)默认使用更宽的沙箱并保存原始事件日志，直接接入还会绕开本项目次数账本。本版保留已有受限 CLI，不采用这条图片路径。

baoyu 根许可为 MIT，内部 baoyu-md 还保留 doocs 归属；writer-skill 为 MIT。未来真要复用对应代码时，要固定文件与版本、保留适用许可并重新做运行验证。当前仅借鉴设计，不新增这几套依赖。

历史推荐过的 `xiaoyu-chen-ntu/chinese-writing-skill` 此次按给定路径未能读取，不能当作已验证可用依赖。

## 已实现的产品边界

1. 选择 1–3 篇已完成分析、相关且有原文引文的研究卡。重新校验引文能在所保存正文中定位。
2. 保存来源、研究卡、正文哈希、分析指纹及写作角度的快照；默认不带私人笔记，也不重复传全文。
3. 选择“素材稿”时确定性整理，不调模型。选择“AI 初稿”时先持久化，等待同一串行 worker，先记回执再调用已有受限官方 CLI/API。
4. 一份受限 JSON 正文包含导语、小节、段落类型、来源编号、要点与限制。程序校验结构与编号，无法自动证明每一句推理正确。
5. 正文可编辑和保存，原始生成结果保留。版本冲突拒绝覆盖；同输入重复提交复用已有稿。材料更新只提示，不自动改稿。
6. 纯文字与图文共用正文。图片由固定模板绘制：封面与编辑要点卡；不伪装为原作者配图或原系统架构。浏览器转 PNG，文字仍可复制编辑，不把整篇文章压成大长图。
7. 程序输出 TXT、Markdown、内联 CSS HTML、PNG 和来源清单。两套主题都维持正文可读性；不承诺整页深色样式在微信稳定保留。
8. 不调用图床、不读取公众号 cookie、不上传草稿、不发布。公开表达仍需核对数字、阶段、归属和引用范围。

## 用量与资源

| 操作 | 新增模型任务 |
| --- | ---: |
| 从已分析资料整理素材稿 | 0 |
| 生成一份 AI 写作初稿 | 1 |
| 切换纯文字/图文、主题、预览、修改保存 | 0 |
| 绘制封面/要点卡、转换 PNG、导出 | 0 |
| 明确重试结果未知的写作 | 新的 1 次尝试，仍需通过上限与预算 |

分析和写作合计受滚动 24 小时 5 次保护；不是分析 5 次再送写作 5 次。可安排 4 次研究加 1 次成稿。已有研究卡不会因为生成两种排版再次分析。一次 CLI 任务不等于固定 token 数，也不能由本地计数反推官方余额。金额未返回时保持未知。

没有新增生产依赖、Python、浏览器服务或图片 API。新增资源主要为草稿文本和下载的图片包；PNG 计算放到用户浏览器，不给低资源 VPS 增设常驻绘图服务。源码跨平台并不替代真实 Windows 和公众号后台验收。

## 验收状态与后续

实际结果见 [VALIDATION](VALIDATION.md)，不要把设计或测试用例存在当作执行通过。本版必须验证迁移保留旧回执、缓存和人工编辑、共享次数、错误后的暂停、预览隔离、两版正文一致与实际 PNG 导出。公众号最终粘贴、图片上传和手机预览由本机完成。

下一阶段只有在实际需要时才加入自有图片上传、资料对比图、任意 Markdown 编辑或微信草稿箱适配。每个功能独立判断，不因 skill 提供就全部接入。
