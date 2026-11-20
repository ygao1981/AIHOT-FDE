# Codex 接手顺序

## 当前入口

- 仓库：`https://github.com/ygao1981/AIHOT-FDE`
- 分支：`codex/fde-workbench-v2`
- 运行目录：`fde-workbench/`
- 产品：FDE 研究台，个人研究和公众号选题。
- 默认：采集关闭、模型关闭、自动分析关闭。

先以远端分支和实际提交为准。`main` 和旧 `codex/fde-cli-single-pass` 可能仍指向 PostgreSQL 版本；不要只看仓库名字就执行根目录安装。

## 阅读顺序

1. 根 `CHECKPOINT.md`：已完成、真实验证、待完成与当前边界。
2. 根 `AGENTS.md` 和 `fde-workbench/AGENTS.md`：对应入口的工程规则。
3. `fde-workbench/README.md` 与 `docs/ARCHITECTURE.md`：目录与数据流。
4. `docs/SOURCES.md` 和 `config/source-audit.json`：来源状态与限制。
5. `docs/MODEL_USAGE.md`：实际费用触发、两种接入与未知用量。
6. `docs/DEPLOYMENT.md` 和 `docs/OPERATIONS.md`：机器预检、安装、备份恢复。
7. `docs/VALIDATION.md`：哪些证据可以复用、哪些需要目标环境补验。

## 第一轮接手应完成

- 记录当前提交及工作区变化，不覆盖使用者改动。
- 在真正目标机器只读检查磁盘、内存、已有服务、端口和 Node。
- 明确选择原生本机或原生 VPS；低资源机器不默认安装 Docker。
- 启动关闭模型的研究台，完成登录、导入、笔记、重启和备份。
- 用户选择 Codex 时，安装官方 CLI 并让本人完成专用目录登录；只运行非模型诊断。
- 配好每 24 小时一次的初始上限和关闭的自动分析，再人工验收一篇真实资料。
- 记录分析前后 attempt、重复操作是否命中缓存，以及官方账户实际用量。
- 更新 checkpoint 和验证文档，写清测试机器与提交，不写账号凭据。

## 不需要现在做

不用新装 PostgreSQL、迁移 MariaDB、引入向量数据库、自动写整篇公众号文章、对外开放资料库、多账号轮换或编写通用爬虫。候选源不能因为“来自大厂”就直接启用，教程、产品宣传和客户自述应继续区分。

## 出现问题时

先看来源状态、暂停说明、用量预留和官方登录状态。未知模型请求不会自动重发；确认重试可能新增消耗。运行锁按运维文档核查，不能无条件删除。网络受限时保留人工导入路径；不增加绕过站点限制的抓取服务。

完整可复制任务见 [CODEX_DEPLOY_PROMPT.md](CODEX_DEPLOY_PROMPT.md)。
