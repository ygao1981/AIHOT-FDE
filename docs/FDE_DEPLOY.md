# FDE 实战观察：Ubuntu VPS 部署与验收

本分支基于 AIHOT，保留 React Router + Fastify + PostgreSQL 17 + pg-boss。
本仓库只聚合原文链接与自生成摘要，不取得原文转载权；网站公开前须审阅 `site/pages/terms.md` 和 `privacy.md`。

## 1. 环境准备

建议至少 2 核 / 4 GB 内存的 Ubuntu VPS（编译时可临时加交换空间）。
安装 Docker Engine + Compose 插件、Git；确保能访问 GitHub、npm、所选模型与信源的域名。
若已有 OpenClaw/Nginx/Caddy，**不要复用已有项目的 Docker Compose 项目名/数据库卷/端口**。
本项目 Compose 名称为 `fde-observer`。

## 2. 克隆与配置

```bash
git clone https://github.com/ygao1981/AIHOT-FDE.git
cd AIHOT-FDE
cp .env.example .env
# 编辑 .env：SITE_URL、ADMIN_PASSWORD、SESSION_SECRET、IMG_PROXY_SIGN_SECRET、
# POSTGRES_PASSWORD、LLM_BASE_URL、LLM_API_KEY、LLM_MODEL
```

`ADMIN_PASSWORD` 不少于 12 位；三个签名和数据库密钥分别运行 `openssl rand -hex 32` 生成。
**禁止提交 .env。** `SITE_URL` 必须是用户真实访问的域名或地址。
例：`SITE_URL=http://<你的服务器IP>:3100`、`PORT=127.0.0.1:3100`；有 Nginx 时反向代理到该端口，`TRUST_PROXY=true`。
所有开关初次保持 `COLLECT_ENABLED=false`、`MODEL_CALLS_ENABLED=false`。
部署前检查 `docker compose config`，确保端口不冲突、没有在公网暴露数据库。

```bash
docker compose config
docker compose up -d --build
docker compose ps
docker compose logs --tail=100 api web worker setup
```

本版从 `industry/sources.json` **只新增** FDE 信源；已有数据库里旧的 AI 示例信源不会自动删除。
旧数据库升级前备份数据库，再执行：

```bash
docker compose run --rm --no-deps setup node scripts/fde-disable-legacy-sources.ts --dry-run
docker compose run --rm --no-deps setup node scripts/fde-disable-legacy-sources.ts
```

上述 `--no-deps` 需要数据库服务已在运行。脚本只停用 18 个已知示范源，不删除其文章；也不影响人工新增的源。

## 3. 验证网站和采集

访问 `/reading`：阅读起点不需要数据库里已有文章也能展示人工精选的原文入口。
访问 `/topics`：检查 FDE 主题；访问 `/admin/sources`：逐个“预览抓取”。
正文抓取是否可用、发布日期是否准确、中文信源是否覆盖足够，需在 VPS 实测。部分 RSS 可能超时或停止服务，不能以 JSON 存在作为抓取成功。
首轮可只启用 2 个验证过的信源；人工复核 10–20 篇被过滤与入选的资料，修改 `ingestNoiseFilter.requireAny` 避免误删。

```bash
# 环境验证需要 Node.js >=24.22.1（在本机或 CI）：
npm ci --no-audit --no-fund
npm run typecheck
npm run test:standalone
npm run build -w @aihot/web
# PostgreSQL 测试库独立，必须以 _test 或 _ci 结尾：
DATABASE_URL=postgres://<用户>:<密码>@127.0.0.1:5432/fde_ci npm test
npm run test:web
node scripts/smoke.ts --base http://localhost:3100
```

测试必须真的运行；不可凭文件存在宣称通过。GitHub 的 Check workflow 包含全量测试与 Docker 端到端验收。

## 4. 低成本开启模型与数据

后台确认密钥、模型 API 接口、请求额度后，先开启 `COLLECT_ENABLED=true`，保持 `MODEL_CALLS_ENABLED=false` 测试抓取。
观察信源列表与文章是否正常，再设置 `MODEL_CALLS_ENABLED=true`，只处理少量资料并在后台检查预算。
原框架评分会**独立调用两次模型**，加上预筛/结构/摘要/归组通常不止两次。
RSS/网页抓取不消耗模型 token，但部分第三方 RSS、Jina/公众号/X、embedding API 可能另收费。
`ingestNoiseFilter.requireAny` 是标题/摘要的廉价过滤，无法保证 100% 召回；重点行业文章可由手工历史入口补全。
不建议一开始启用全部付费采集、向量 API、X、公众号。

## 5. 历史案例（不混入实时日报）

在 `.env` 填 `INGEST_TOKEN`（长度 >=16），启动 API 后，用 JSONL 文件：
```bash
FDE_BASE_URL=http://127.0.0.1:3100 node --env-file=.env scripts/fde-import.ts industry/fde-history.example.jsonl --dry-run
FDE_BASE_URL=http://127.0.0.1:3100 node --env-file=.env scripts/fde-import.ts industry/fde-history.example.jsonl
```
输入一行一个对象：`{"title":"...","url":"https://...","publishedAt":"2026-01-01T10:00:00+08:00"}`。
回灌标记只归档不刷进“今天”，会触发后续必要的后台处理，若开启模型仍可能消耗 token。
对完全不会进后台处理的文档链接，推荐直接更新 `modules/fde-reading/library.ts` 的静态阅读起点。

## 6. 运行、更新、备份和回滚

```bash
docker compose logs -f api worker
docker compose exec -T db pg_isready -U aihot -d aihot
# 更新前先备份！参考 docs/deploy.md 的 PostgreSQL 备份章节
git pull --ff-only
docker compose build
docker compose stop api worker web
docker compose run --rm setup
docker compose up -d
```

不要使用 `docker compose down -v`；那会删除数据库卷。升级涉及数据库迁移，回滚需要考虑恢复备份而不是简单切旧镜像。
公网展示前核对反向代理 HTTPS、管理员密码、法律页和 RSS/MCP 域名配置。
