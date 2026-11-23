# Codex CLI 事件拦截：2026-11-23 现场验收记录与处置

> **2026-11-23 最新用户授权（覆盖旧的一篇/每天一次试运行要求）**　Windows 本机真实测试上限改为 `FDE_DAILY_LIMIT=5`，表示滚动 24 小时内**最多五次真实分析尝试**，失败和 unknown 同样计入。旧美团 unknown 回执必须保留且如仍在 24 小时内已占一次。修复验证、备份和安全核对后允许恢复暂停、逐篇测试，无须每篇重复请求授权；不得自动重试未知请求或超出总次数。手工分析至少成功两篇且安全检查通过后，可在剩余次数内临时开启自动分析，结束后关闭。完整操作见 [5 次真实测试接手提示词](CODEX_TEST_5_PER_DAY_PROMPT.md)。

实现提交 `046a7cb` 在 Windows 和 Linux 各通过 82 项自动测试，Linux 浏览器和基础 Docker 检查通过。当时实际账号已执行一次分析，保留了 `unknown` 回执。 [提交](https://github.com/ygao1981/AIHOT-FDE/commit/046a7cbc7afbdad191cfabd3a069defc3a9f23ef) · [FDE CI 45135209199](https://github.com/ygao1981/AIHOT-FDE/actions/runs/45135209199)

## 已确认事实（用户本机报告，不是我们远程实测）

- 本机 Windows、研究台 2.1.0，Codex ChatGPT 登录与 CLI 参数诊断通过。
- 使用美团 2026-05-07 的 AI Coding 复盘提交了一次真实分析；适配器返回 `unexpected_tool`。
- SQLite 已保存文章正文和 1 次 `unknown` 回执，分析队列已暂停，暂无待处理任务。
- 用户在分析前后看到官方用量面板周剩余额度均为 76%、额外 credits 均为 0。**这不足以证明该次没有 token 消耗。**
- 数据库备份独立完整性检查和既有假 CLI 异常事件拦截测试通过。首次事件类型、实际 token 消耗和研究卡结果**未确认**。
- 本机 `F:/AIHOT-FDE/source/` 的 CHECKPOINT 和 VALIDATION 由本机 Codex 写入了现场结果；它们可能存在尚未推送的修改。**同步远程时先保留并人工合并，禁止 reset --hard 或覆盖本地记录。**

## 通过代码与官方协议确认的兼容性缺陷

源文件 `fde-workbench/src/analysis.mjs` 的 CLI JSONL 事件处理此前只允许 `agent_message` 和 `reasoning`。官方 `codex exec --json` 可能发出 `todo_list`（纯任务计划事件，含 started/updated/completed），不应视作工具执行。

`046a7cb` 将 `todo_list` 加入白名单。`command_execution`、`file_change`、`mcp_tool_call`、`web_search`、`collab_tool_call` 及未知类型仍会中止分析。首次真实失败的具体事件类型未被旧版记录。

官方 CLI 0.169.1 会把运行警告、配置提示和模型路由提示编码为 `item.completed`，其 `item.type` 是 `error`。适配器收到这种通知后继续读取，直到收到 `turn.completed` 且进程正常退出，再按 Schema 和原文校验结果。顶层 `error`、`turn.failed`、异常退出及未知事件仍会拒绝结果。 [官方 JSONL 事件实现](https://github.com/openai/codex/blob/rust-v0.169.1/codex-rs/exec/src/event_processor_with_jsonl_output.rs#L412-L565) · [事件协议](https://github.com/openai/codex/blob/rust-v0.169.1/codex-rs/exec/src/exec_events.rs#L8-L37)

诊断日志只报告受限类型名，例如 `FDE Codex notice item type: error`、`FDE Codex failure event type: turn.failed`、`FDE Codex blocked item type: command_execution`。通知、失败和被拒绝的工具可以据此区分。历史回执缺少事件分类时，具体原因仍须记为未知。 [Codex 非交互模式](https://developers.openai.com/codex/noninteractive)

## 处置原则

1. **不自动恢复、重试或释放未知消耗。** 原回执仍是 `unknown`，不伪装为已完成或零费用。
2. 先在 Codex 本机保留 `.env`、`.data`、用户现场报告，以及本地未提交修改；数据库备份需验证独立可读。禁止把真实库、凭据、CLI 原始日志推送 GitHub。
3. 安全合并此修复分支，运行 `npm run check`、`npm test`，分别验证普通计划事件允许和执行工具仍拒绝；测试使用假 CLI，不消耗真实额度。
4. 复查安装的官方 CLI 版本、`codex exec --help` 与本项目实际禁用工具的参数。只读沙箱不等于没有任何工具；不能为了通过验证删掉限制。
5. 用户已授权且滚动 24 小时仍有额度时，可在故障核对完成后解除暂停，换一篇非敏感文章进行下一次人工测试。已保存的 `unknown` 同样占用当日尝试额度。自动化验收的开启条件和关停步骤见 [5 次真实测试接手提示词](CODEX_TEST_5_PER_DAY_PROMPT.md)。
6. 若仍返回 `unexpected_tool`，先读日志里受限的具体事件类型；如果是 `command_execution` 或 MCP 等真实工具事件，应排查 CLI 配置而非放行该类型。
7. 有完整结构化输出、可定位原文引文、正确用量回执且同一输入普通重复排队不新增模型请求，才视为真实单篇验收通过。
8. 在本机 `CHECKPOINT.md`、`docs/VALIDATION.md` 记录最终安装的提交号、真正运行过的测试、实际事件类型和账户页面变化；记录为本机结果，不写成 CI 实测。

## 版本控制

此处是研究台的安全兼容修复，不引入 T3、PostgreSQL 或其他服务，SQLite schema 不变。原型与历史记录保留。
