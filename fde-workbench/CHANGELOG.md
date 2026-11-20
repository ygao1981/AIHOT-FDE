# 更新记录

## 2.0.0 — 2026-11-20

新增独立的个人 FDE 研究入口，运行于 `fde-workbench/`。

- Node + SQLite，私有登录，一进程串行任务，无单独数据库服务。
- 核验 27 个来源入口，首批启用 9 个；自动、观察、人工和停用状态分开。
- RSS/Atom 和静态列表采集、来源日期、正文提取、规则筛选与 URL 去重。
- 官方 Responses API 或官方 ChatGPT 登录 Codex CLI，默认关闭，显式选择。
- 持久化次数、API 预算预留、配置感知缓存、失败暂停与人工重试。
- 原文证据、阶段依据、研究笔记、选题进度和 Markdown 导出。
- 完整 checkpoint、来源审计、模型用量、部署、运维和 Codex 接手文档。

旧版 AIHOT/FDE 公开站点代码仍保留，不自动迁移其 PostgreSQL 数据。真实账号、目标 VPS 和容器验收状态见 `docs/VALIDATION.md`，不能从版本号推断这些检查已完成。
