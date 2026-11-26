# Codex 接手顺序

## 当前入口

- 仓库：`https://github.com/ygao1981/AIHOT-FDE`
- 每日研究分支为 `codex/fde-daily-research`，基于 [免费信源草稿 PR #8](https://github.com/ygao1981/AIHOT-FDE/pull/8) 的 `c148c7a`。
- 运行目录为 `fde-workbench/`，版本 2.3.1，SQLite schema 5，打开工作台默认进入「今日研究」。
- 产品：个人 FDE 研究与公众号草稿，Node 24.x + SQLite，Windows 本机优先。
- 默认采集、模型和自动分析关闭；公众号素材稿和排版可以零模型使用。

`main` 和早期分支不是这次入口。先读远端分支及实际提交，不执行根目录旧 Compose，不回退近期修复。

## 阅读顺序

1. 根 CHECKPOINT、根与子目录 AGENTS、子目录 README。
2. `WECHAT_DESIGN_REVIEW.md`、`EDITORIAL_WORKFLOW.md`：个人规则、开源工具审查与实际功能边界。
3. `DISCOVERY.md`、`MODEL_USAGE.md`。搜索与采集由普通程序处理。滚动 24 小时次数上限只计自动分析，手动任务写入同一账本。
4. `OPERATIONS.md`。用旧代码先备份，再切换新代码。回滚使用旧 schema 快照。
5. `VALIDATION.md`：真实运行过的检查和仍需本机验收的项目。
6. `WINDOWS_LOCAL.md` 与已有代理配置；未改采集则不重复新装 VPN、调整系统 DNS 或重审所有来源。
7. 公众号功能维持 `EDITORIAL_WORKFLOW.md` 中的编辑与导出流程。过往提示词用于查阅当时的验收条件。

## 接手目标

保留本机未提交记录和所有数据，先用旧版备份，再在副本验证迁移。对公开信源分别记录原始返回、去重、规则命中和人工核查样本。用已分析资料验证看板及现有公众号工作流。2.3.1 开发和验收以零真实模型调用为准。自动分析的滚动上限与手动分析、写作、翻译的记账沿用现有逻辑。未知回执继续留存，重试由用户在核对用量后明确发起。

公众号规则在 `config/editorial-profile.json` 和 `prompts/editorial.md`。新增图片是本地模板，不是图片模型结果。HTML/PNG 已生成不等于微信后台粘贴和手机预览通过；必须分别记录。

## 保持的边界

不安装 T3、PostgreSQL、Redis、向量库或浏览器服务。网页检查、去重和排版交给程序，不引入常驻模型总管。不自动上传或发布公众号，不把研究卡和厂商自述当成独立核验事实。

不提交真实草稿、私有笔记、SQLite、口令、登录目录或原始模型日志。后续二开使用 `CODEX_DEVELOPMENT_PROMPT.md`，先判断收益，再做最小实现，持续更新 checkpoint 与验证记录。
