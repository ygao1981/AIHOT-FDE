# Codex 接手顺序

## 当前入口

- 仓库：`https://github.com/ygao1981/AIHOT-FDE`
- 本轮分支：`codex/fde-editorial-workbench`；基于 PR #5 的 `8d0df4506a86a2981c55798300884415c4190903`，保留 CLI 与代理修复。
- 运行目录：`fde-workbench/`，版本 2.2.0，SQLite schema 2。
- 产品：个人 FDE 研究与公众号草稿，Node 24.x + SQLite，Windows 本机优先。
- 默认采集、模型和自动分析关闭；公众号素材稿和排版可以零模型使用。

`main` 和早期分支不是这次入口。先读远端分支及实际提交，不执行根目录旧 Compose，不回退近期修复。

## 阅读顺序

1. 根 CHECKPOINT、根与子目录 AGENTS、子目录 README。
2. `WECHAT_DESIGN_REVIEW.md`、`EDITORIAL_WORKFLOW.md`：个人规则、开源工具审查与实际功能边界。
3. `ARCHITECTURE.md`、`MODEL_USAGE.md`：单 worker、同一账本、分析与写作合计每日5次。
4. `OPERATIONS.md` 的 2.2.0 升级章节：必须用旧代码先备份，再切新代码；回滚须有旧 schema 快照。
5. `VALIDATION.md`：真实运行过的检查和仍需本机验收的项目。
6. `WINDOWS_LOCAL.md` 与已有代理配置；未改采集则不重复新装 VPN、调整系统 DNS 或重审所有来源。
7. `CODEX_WECHAT_PROMPT.md`：本轮完整可复制升级、零模型验收与真实写作提示词。

## 接手目标

保留本机未提交记录和所有数据，先备份再升级。用已分析资料验证素材稿、正文编辑、两种版本、PNG、下载与重启。未核实当前剩余次数前不调用真实模型；在已授权滚动24小时合计5次内可以直接逐项测试，不必逐篇重复确认。未知回执不自动重试，达到上限就继续零模型验证。

公众号规则在 `config/editorial-profile.json` 和 `prompts/editorial.md`。新增图片是本地模板，不是图片模型结果。HTML/PNG 已生成不等于微信后台粘贴和手机预览通过；必须分别记录。

## 保持的边界

不安装 T3、PostgreSQL、Redis、向量库或浏览器服务。网页检查、去重和排版交给程序，不引入常驻模型总管。不自动上传或发布公众号，不把研究卡和厂商自述当成独立核验事实。

不提交真实草稿、私有笔记、SQLite、口令、登录目录或原始模型日志。后续二开使用 `CODEX_DEVELOPMENT_PROMPT.md`，先判断收益，再做最小实现，持续更新 checkpoint 与验证记录。
