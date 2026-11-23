# FDE 研究台 · AIHOT-FDE

面向个人 FDE 研究与公众号选题的轻量工作台。重点记录企业 AI 如何接入业务、怎样交付、如何验收、效果与限制，而不是追踪泛 AI 热点。

**当前推荐入口是 [`fde-workbench/`](fde-workbench/)，运行于 Node.js + SQLite。** 不需要新装 PostgreSQL，也不需要接入已有 MariaDB。官方 API 和 ChatGPT 登录的官方 Codex CLI 显式二选一；默认采集和模型都关闭。

当前个人版为 **2.1.0**：补齐任务入队通知、串行连续消费、Windows CLI 进程适配和外部脚本收录。借鉴 T3 Code 的少量设计，不引入整套 T3；[判断与源码依据](fde-workbench/docs/T3_DESIGN_REVIEW.md)。优先按 [Windows 本机指南](fde-workbench/docs/WINDOWS_LOCAL.md) 试运行。

## 从这里开始

| 你要做什么 | 阅读入口 |
|---|---|
| 看本次实现和未完成验收 | [CHECKPOINT.md](CHECKPOINT.md) |
| 交给 Codex 安装 | [完整 Codex 提示词](fde-workbench/docs/CODEX_DEPLOY_PROMPT.md) |
| 交给 Codex 继续开发 | [二次开发提示词](fde-workbench/docs/CODEX_DEVELOPMENT_PROMPT.md) |
| 接收外部监视脚本提供的资料 | [脚本收录入口](fde-workbench/docs/EVENT_INTAKE.md) |
| 判断 VPS 还是本机 | [部署与资源预检](fde-workbench/docs/DEPLOYMENT.md) |
| 理解当前架构 | [架构设计](fde-workbench/docs/ARCHITECTURE.md) |
| 查看 27 个候选信源的核验 | [来源说明](fde-workbench/docs/SOURCES.md)、[审计记录](fde-workbench/config/source-audit.json) |
| 理解哪些步骤消耗模型额度 | [模型与用量](fde-workbench/docs/MODEL_USAGE.md) |
| 日常研究、笔记、公众号选题 | [编辑工作流](fde-workbench/docs/EDITORIAL_WORKFLOW.md) |

## 新入口快速启动

检出 `codex/fde-workbench-v2` 分支，准备 Node.js 24.22.1 或更新的 24.x，然后从仓库根目录执行：

```bash
cd fde-workbench
npm ci --ignore-scripts
npm run init
npm run doctor
npm run check
npm test
npm start
```

访问 `http://127.0.0.1:3210`。口令位于该目录 `.env`，只在自己的终端查看。初始化不会覆盖已有配置。浏览页面、搜索、笔记与导出不调用模型；首次建议人工选一篇资料分析。

## 这次收敛了什么

- 首批 9 个自动信源，另保留观察和人工阅读入口；Datawhale 教程不会被当作生产案例自动计分。
- 脚本完成采集、正文提取、日期识别、规则筛选和 URL 去重。
- 每篇资料一次结构化模型任务，保存原文引文、阶段依据、经验和选题建议。
- SQLite 保存个人资料、选题状态和模型任务收据；失败暂停，未知用量不按零处理。
- 无前端构建步骤、浏览器采集服务或额外数据库进程；可选原生 Linux 服务和单服务 Docker。

这是一套私有研究资料库。公众号文章由你选题、核对和写作，程序不自动发布。

## 与原 AIHOT / 旧 FDE 版的关系

本仓库保留 [AIHOT](https://github.com/KKKKhazix/AIHOT) 及此前 FDE 适配，借鉴了来源配置、任务收据、模型预算与读取不触发模型等设计。原公开站点的多服务、PostgreSQL 和多轮精选流程仍在历史目录中，详见 [旧版 README](README-LEGACY.md)。

**根目录 `package.json`、`docker-compose.yml`、`apps/` 和旧 `docs/FDE_*` 属于历史入口。** 部署本次个人版时进入 `fde-workbench/`，使用其独立配置。没有自动数据库迁移；不要向同一数据目录启动两个实例。

源代码沿用 [MIT License](LICENSE)，保留 [NOTICE](NOTICE)。界面使用新名称“FDE 研究台”；信源内容的权利仍归原作者，公开写作时保留出处并自行核验。
