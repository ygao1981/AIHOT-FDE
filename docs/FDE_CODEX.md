# FDE 个人研究版：Codex CLI + PostgreSQL

## 交付边界

用途是个人 FDE 研究与技术公众号选题，不是无人审核的新闻发布平台。
本版保留现有 PostgreSQL、Web、API、采集器、公共读取层；新增独立低频 worker，替代原多轮模型流水线。
**不是把 Plus 登录令牌填进 LLM_API_KEY，不提供非官方 API 网关，也不读取 OAuth 令牌。**

新部署入口是 `docker-compose.yml` 加 `deploy/compose.codex.yml`。
不要只按旧版 `docs/FDE_DEPLOY.md` 启动原 worker。
已有 main 数据不改表、不清库。原 worker 代码保留用于回滚，但两种 worker 不能同时工作。
切换后只删除本项目的旧 cron 队列/待执行调度，保留文章、分析、回执与原数据库卷。

## 程序和模型各做什么

| 环节 | 实现 |
|---|---|
| RSS 列表、正文提取、URL 去重 | 原采集器，无模型调用 |
| FDE 宽松相关性与明显招聘/推广过滤 | 本地规则，无模型调用 |
| 中文摘要、场景、阶段、方案、结果、证据、经验、选题 | 每个新候选提交一个 `codex exec` 任务 |
| JSON 结构、引文是否在正文中 | 本地验证；不合格就暂停，不再让模型反复修复 |
| 网页查询、筛选、研究笔记导出 | 数据库/脚本，无模型调用 |
| 双次评分、语义归组、全文翻译、向量模型、周月综述 | 本版 worker 不运行 |

一次 CLI 任务不等于一定只有一次底层推理请求。Codex 自身有上下文和执行开销；以使用面板、CLI usage 为准。
默认每滚动24小时最多5个新的Codex执行尝试，单并发；请求次数上限不是token/金额上限。
原后台 budgets 还有每分钟/小时约束。复用回执不再次占额度；失败/超时的尝试仍计数。
这是人工标注前的初始配置，不保证 Plus 可以连续处理多少篇。

## 安全和计费

- `MODEL_CALLS_ENABLED=false` 始终关闭原模型 API。`FDE_CODEX_ENABLED` 单独控制本版 CLI。
- 仅用官方 CLI 的 ChatGPT 登录。任务固定 `forced_login_method="chatgpt"`，剔除进程中的 API、数据库和管理员密钥。
- Codex 工作目录是独立临时目录，不是 Git 仓库。只读沙箱；关闭 shell、网页搜索、应用连接、多智能体、hooks、memory 与 code mode。
- Plus 登录目录只挂载给 worker，不给 Web/API，不复制到镜像，不上传 GitHub 或 CI。CLI 自己维护凭据刷新。
- CLI 原始 stderr/stdout 不写应用日志；只保留安全错误码、结果及 usage。不要公开 `auth.json`。
- 输入网页不可信。只能提取事实，不执行网页中的命令。JSON与引文校验不是完整事实核查，使用前仍需读原文。
- 额度、认证、超时或无效结果发生后，全局暂停新任务；不换账号、不自动续费、不切换API。
- 账户若已有可消费的额外 credits，官方 CLI 可能使用它们。本程序不能识别或保证只花套餐额度；请在账户使用面板自行检查额度和付费设置。
- `/research` 与原站同为公开读取层。`noindex` 不是鉴权。个人使用默认只绑定127.0.0.1；公网反代前增加访问控制。

## 1. 资源预检与源码验收

先执行只读脚本：

```bash
bash deploy/fde-preflight.sh
node --test modules/fde-research/tests/*.test.mjs
```

预检检查 Docker 所在文件系统而非仅根目录；不足10GiB磁盘或1.5GiB可用内存退出2。
这个门槛只用于提醒，不是“保证够用”。此 VPS 还有 MariaDB、PM 和 OpenClaw，不得为本项目停止或删掉它们。
建议在其他机器构建镜像并推送私有/受控镜像仓库；VPS只拉取运行。
PostgreSQL与MariaDB并存，数据卷独立，无需额外Redis。内存限制是故障边界，不代表实际使用量或保证不OOM。

联网构建机使用仓库要求的 Node.js 24（最低版本以 package.json 为准）：

```bash
npm ci --no-audit --no-fund
npm run typecheck
npm run test:standalone
DATABASE_URL=postgres://<测试用户>:<密码>@127.0.0.1:5432/fde_ci npm test
npm run build -w @aihot/web
npm run test:web
```

新数据库回归测试在 `modules/fde-research/tests/research.test.ts`；独立测试不连接数据库或真实CLI。
不要删除测试、关闭断言或把未执行检查写成通过。不要在生产库跑测试。

## 2. 新部署配置

只在全新目录执行 `cp .env.codex.example .env`；现有 `.env` 应先备份，再逐项补字段。
填好独立 ADMIN_PASSWORD（>=12位）、SESSION_SECRET、IMG_PROXY_SIGN_SECRET 和 POSTGRES_PASSWORD。
三个密钥分别生成，不重复使用。数据库密码优先十六进制，避免连接URL特殊字符转义问题。
`chmod 600 .env`。不要把 .env、数据库dump或登录文件传到Git。

核实官方包版本，记录一个精确版本，不长期使用 `latest`：

```bash
npm view @openai/codex version --registry=https://registry.npmjs.org
# 将上面精确版本写入 .env 的 CODEX_VERSION；验收CLI参数后再部署。
```

设置 `FDE_CODEX_HOME=/var/lib/fde-observer/codex` 等独立绝对路径。
容器以 node 用户（官方Node镜像通常为1000:1000）运行；先核对UID，再创建目录：

```bash
# 仅对这个全新专用目录授权，不改其他用户的家目录。
sudo install -d -m 700 -o 1000 -g 1000 /var/lib/fde-observer/codex
```

`SITE_URL` 是实际访问地址；`PORT=127.0.0.1:3100` 默认不对公网开放。
首次保持三个开关：`COLLECT_ENABLED=false`、`MODEL_CALLS_ENABLED=false`、`FDE_CODEX_ENABLED=false`。

以下命令均在仓库根目录使用同一组合：

```bash
docker compose -f docker-compose.yml -f deploy/compose.codex.yml config --quiet
# 优先在构建机执行，不能在空间不足的VPS盲目构建：
docker compose -f docker-compose.yml -f deploy/compose.codex.yml build
# 远程构建时把FDE_IMAGE设为对应版本的镜像，VPS pull，不要 --build。
docker compose -f docker-compose.yml -f deploy/compose.codex.yml up -d --no-build
```

不要在对话里粘贴完整 `docker compose config`，它可能展开密码。
已有数据库继续使用同一 Compose 项目名 `fde-observer` 和原卷；先备份。

## 3. 在 VPS 给 worker 登录 Plus

**宿主机登录和容器登录不是同一环境。** 本版使用 worker 镜像内的CLI和专用挂载目录。
在VPS终端执行以下命令，然后由你本人在浏览器完成设备码登录：

```bash
docker compose -f docker-compose.yml -f deploy/compose.codex.yml run --rm --no-deps worker \
  codex -c 'cli_auth_credentials_store="file"' login --device-auth

docker compose -f docker-compose.yml -f deploy/compose.codex.yml run --rm --no-deps worker \
  node scripts/fde-doctor.mjs
```

不必另外把宿主机CLI复制进容器。不需要OPENAI_API_KEY，不复制其他项目的Codex配置。
账号安全设置可能需要启用设备码登录；浏览器链接/验证码在你自己的终端查看，切勿提交到Git。
官方CLI参数若不被所选版本支持，先核对版本文档并升级/固定正确版本；不可用危险权限开关绕过。

## 4. 小规模开启

先在后台核验RSS原文标题、正文和日期，停用失败来源。自动采集只处理 `fde-` 开头的 RSS，6小时以上一次；
`fde-curated` 外部导入也可走新分析流程。X/公众号付费采集和第三方RSS镜像不自动启用。
采集器保留旧版初始回灌规则，历史内容可能不出现在“今天”；请到研究页和全部动态查看。

先 `COLLECT_ENABLED=true`、`FDE_CODEX_ENABLED=false`，重建worker容器加载环境，检查正文。
再设 `FDE_DAILY_LIMIT=1`、`FDE_CODEX_ENABLED=true`，**MODEL_CALLS_ENABLED 仍为 false**：

```bash
docker compose -f docker-compose.yml -f deploy/compose.codex.yml up -d --no-build worker
docker compose -f docker-compose.yml -f deploy/compose.codex.yml exec worker node scripts/fde-control.ts status
```

一篇真实资料完成后核对 `/research`：痛点、方案、阶段、原文引文、效果声明、选题草案。
确认使用面板额度和回执后再改日上限到5，不能据此承诺无限额度。
重复处理同一输入/版本应复用结果；改变提示词/模型或人工重试会生成新请求。

## 5. 暂停、恢复、人工重试、导出

```bash
# 以下 node 命令均在worker容器中执行：
node scripts/fde-control.ts status
node scripts/fde-control.ts pause
# 先恢复账号/网络/额度，再明确解除暂停：
node scripts/fde-control.ts resume
# 失败或结果未知任务不自动重跑。确定接受可能重复消耗后：
node scripts/fde-control.ts retry <文章ID> --accept-extra-usage
# 生成Markdown，不调用模型：
node scripts/fde-control.ts export /data/fde-export
```

`/data/fde-export` 可通过 `docker compose cp` 复制到个人知识库。只导出当前公开研究结果，不导出撤回条目或原文全文。
status 显示的“尝试数”不是官方计费金额，不能把null费用显示成0元。

## 6. 更新、备份与回滚

更新前把当前提交、镜像标签、`.env` 和数据库备份位置记下来。保护登录目录，别把它纳入公开备份。
数据库备份可用 `docker compose exec -T db pg_dump -U aihot -d aihot -Fc > <独立备份路径>`，检查文件非空。
切换镜像前停止本项目的 worker/api/web，执行 setup 后再启动。不要动其他Compose项目。
本版无新增数据库迁移，因此可停新worker、切回旧镜像及原Compose配置；旧worker重新注册自己的定时任务。
恢复旧worker时先保持MODEL_CALLS_ENABLED=false，避免意外恢复API费用。新研究记录保留，但旧界面可能不展示新字段。
**禁止 `docker compose down -v`、无差别 prune volumes、删除 /var/lib/docker、复制生产库到测试库名再直接测试。**

## 参考官方文档

- https://developers.openai.com/codex/noninteractive
- https://developers.openai.com/codex/auth
- https://developers.openai.com/codex/config-reference
- https://help.openai.com/en/articles/11369540-using-codex-with-your-chatgpt-plan
- https://help.openai.com/en/articles/12642688-using-credits-for-flexible-usage-in-chatgpt-personal-plans
