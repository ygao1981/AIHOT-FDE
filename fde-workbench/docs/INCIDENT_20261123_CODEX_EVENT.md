# Codex CLI 事件拦截：2026-11-23 现场验收记录与处置

实现提交 [`046a7cb`](https://github.com/ygao1981/AIHOT-FDE/commit/046a7cbc7afbdad191cfabd3a069defc3a9f23ef) 已通过 [FDE CI 45135209199](https://github.com/ygao1981/AIHOT-FDE/actions/runs/45135209199)：Windows、Linux 82 项自动测试均通过，Linux 浏览器和基础 Docker 检查通过；**实际账号的第 2 次分析尚未执行**。注意此前唯一真实分析的 `unknown` 回执没有被修改。

## 已确认事实（用户本机报告，不是我们远程实测）

- 本机 Windows、研究台 2.1.0，Codex ChatGPT 登录与 CLI 参数诊断通过。
- 使用美团 2026-05-07 的 AI Coding 复盘提交了一次真实分析；适配器返回 `unexpected_tool`。
- SQLite 已保存文章正文和 1 次 `unknown` 回执，分析队列已暂停，暂无待处理任务。
- 用户在分析前后看到官方用量面板周剩余额度均为 76%、额外 credits 均为 0。**这不足以证明该次没有 token 消耗。**
- 数据库备份独立完整性检查和既有假 CLI 异常事件拦截测试通过。首次事件类型、实际 token 消耗和研究卡结果**未确认**。
- 本机 `F:/AIHOT-FDE/source/` 的 CHECKPOINT 和 VALIDATION 由本机 Codex 写入了现场结果；它们可能存在尚未推送的修改。**同步远程时先保留并人工合并，禁止 reset --hard 或覆盖本地记录。**

## 通过代码与官方协议确认的兼容性缺陷

源文件 `fde-workbench/src/analysis.mjs` 的 CLI JSONL 事件处理此前只允许 `agent_message` 和 `reasoning`。官方 `codex exec --json` 可能发出 `todo_list`（纯任务计划事件，含 started/updated/completed），不应视作工具执行。

本次将 `todo_list` 加入**严格非工具白名单**；`command_execution`、`file_change`、`mcp_tool_call`、`web_search`、`collab_tool_call` 及未知类型仍被拒绝；`error` item 作为执行错误处理。本次修改不能证明首次真实失败就是 `todo_list`，因为旧版没有记录该类型。

未来拒绝时，后端日志仅输出形如 `FDE Codex blocked item type: <safe-type>` 的受限类型名，不保存、打印正文、命令、事件原始负载、登录凭据或 token。诊断时先使用这条类型名区分“真工具触发”与适配器误判。

参考官方：
- https://developers.openai.com/codex/noninteractive
- https://github.com/openai/codex/blob/main/codex-rs/exec/src/exec_events.rs

## 处置原则

1. **不自动恢复、重试或释放未知消耗。** 原回执仍是 `unknown`，不伪装为已完成或零费用。
2. 先在 Codex 本机保留 `.env`、`.data`、用户现场报告，以及本地未提交修改；数据库备份需验证独立可读。禁止把真实库、凭据、CLI 原始日志推送 GitHub。
3. 安全合并此修复分支，运行 `npm run check`、`npm test`，分别验证普通计划事件允许和执行工具仍拒绝；测试使用假 CLI，不消耗真实额度。
4. 复查安装的官方 CLI 版本、`codex exec --help` 与本项目实际禁用工具的参数。只读沙箱不等于没有任何工具；不能为了通过验证删掉限制。
5. **在用户明确接受再消耗一次且有新的可用尝试额度时**，解除暂停，手工对已知文章单次重试或换一篇非敏感文章做一次测试。第一次已占用默认日上限 1，未满滚动 24 小时不得偷偷调高上限。不得自动重发，也不得启动自动分析。
6. 若仍返回 `unexpected_tool`，先读日志里受限的具体事件类型；如果是 `command_execution` 或 MCP 等真实工具事件，应排查 CLI 配置而非放行该类型。
7. 有完整结构化输出、可定位原文引文、正确用量回执且同一输入普通重复排队不新增模型请求，才视为真实单篇验收通过。
8. 在本机 `CHECKPOINT.md`、`docs/VALIDATION.md` 记录最终安装的提交号、真正运行过的测试、实际事件类型和账户页面变化；记录为本机结果，不写成 CI 实测。

## 版本控制

此处是研究台的安全兼容修复，不引入 T3、PostgreSQL 或其他服务，SQLite schema 不变。原型与历史记录保留。
