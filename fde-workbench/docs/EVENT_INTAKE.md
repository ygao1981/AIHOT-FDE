# 外部脚本收录与事件触发

研究台提供一个小型客户端，将外部程序已取得的文章交给现有私有 HTTP API。它不要求 T3、消息队列或额外数据库。先启动研究台，在 `fde-workbench/` 内使用下面的命令。

## 1. 最小用法

保存 UTF-8 JSON 文件，例如 `material.json`。URL 必填，标题和正文可选；建议提交已合法取得的正文，减少再次抓取。示例不是实际研究材料：

```json
{
  "url": "https://example.com/enterprise-ai-case",
  "title": "企业 AI 实施案例",
  "body": "请替换为自己取得的原文。正文需要足够长，并符合 AI 工程实践的本地筛选规则。"
}
```

```bash
npm run intake -- --file material.json
npm run intake -- --file material.json --analyze
npm run intake -- --status <article-id>
```

第一条只调用收录接口；第二条额外请求分析入队；第三条只查询状态。**已入队不代表分析已完成。** 不带 `--analyze` 不新建分析请求，也不取消同一 URL 先前已经授权的排队或运行任务。人工修改正文则取消旧正文对应的待处理状态，等待新的明确分析请求。

已经发出的旧正文模型请求不会因此取消，仍可能消耗额度；旧结果不会覆盖新正文。

没有正文时由服务端按现有网络限制尝试读原文；遇到登录墙或无法取得正文，改为人工补充，不自动购买抓取服务。客户端只接受 `url`、`title`、`body` 三个字段，不接受任意模型提示词、命令或来源配置。

从 stdin 提交时，文件名使用 `-`。Linux 可以 `cat material.json | npm run intake -- --file -`；Windows 优先传文件，避免旧版 PowerShell 管道编码改变中文。程序需要解析 stdout JSON 时使用 `npm run --silent intake -- ...`，避免 npm 的脚本提示混入输出。

## 2. 认证和配置

客户端只需要 `FDE_BASE_URL`（默认 `http://127.0.0.1:3210`）和 `FDE_ACCESS_TOKEN`；可从当前 `.env` 读取。跨机器使用时应在客户端私下配置端点和口令，不把服务端模型登录目录或 API key 复制过去。

- 请求带 Bearer 口令，复用已有服务端认证。
- 只允许 HTTPS 或明确的本机回环 HTTP；不跟随跳转。
- 资料 JSON 与响应分别最多 1 MiB；每个 HTTP 请求最多等待 30 秒。
- 不在命令行参数中传口令，不将正文、凭据或原始服务端异常写入错误输出。
- 客户端不访问 SQLite。运行中的研究台负责存储、任务、额度和结果。

该客户端不是公开 webhook 服务。公网签名回调、邮件订阅和文件夹监视器尚未实现；以后按具体来源需要新增小型适配器，再调用这个边界。

## 3. 成功、失败和恢复

成功时 stdout 输出一行 JSON，包含 `articleId`、`created`、`importStatus` 和 `stage`。`stage` 为 `stored`、`queued` 或 `cached`；查询状态返回 `status` 与 `analysisAvailable`。

失败时退出码为 1，stderr 输出固定中文说明与安全错误码。若 `stage=queue` 且 `imported=true`，说明资料已存入，只有分析入队未完成或结果不明确。保留 `articleId`，先执行状态查询或在网页中核对，不重复导入并反复重试。

模型开关关闭、本地规则拒绝、已有运行任务、未知尝试需要确认等情况都会沿用原有服务端行为。客户端不发送 `acceptExtraUsage=true`，不会替使用者同意额外重试。收到 `queued=true` 后，仍可能因每日上限、月预算或暂停继续等待。

同一规范化 URL 复用现有资料；相同正文及模型参数可命中分析缓存。请求中断时不能保证对端没有执行，因此不自动重试，也不宣称端到端 exactly-once。来源侧需要可靠交付时应保存自己的已确认资料 ID；当前没有离线发送箱。

## 4. 验证与扩展

先保持 `FDE_MODEL_PROVIDER=off` 和分析关闭，验证默认收录与状态查询；此时带 `--analyze` 应明确报告“已收录但分析未开启”。该失败是预期边界，不应通过开启模型来掩盖。

研究台本体使用 [Worker](../src/worker.mjs) 及时消费持久队列；没有待分析任务时不会调用模型。目录监视或邮箱接口可后续按真实需求增加，不先建设通用总管 Agent。模型未知结果依旧暂停并保留账本。
