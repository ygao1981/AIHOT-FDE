# FDE个人研究版

部署入口：[Codex + Linux VPS 部署说明](docs/FDE_CODEX.md)。
交给Codex执行：[完整安装与验收提示词](docs/CODEX_VPS_PROMPT.md)。

脚本做采集、规则筛选、去重和导出；每篇候选文章提交一个官方Codex CLI任务，生成研究笔记与公众号选题。
保留PostgreSQL，不新增Redis/向量库。默认采集和Codex均关闭，通用模型API一直关闭。

```bash
node --test modules/fde-research/tests/*.test.mjs
# 部署务必同时指定专用覆盖文件：
docker compose -f docker-compose.yml -f deploy/compose.codex.yml config --quiet
```

新功能在 `/research`；来源与资料起点仍在 `/reading`。
Plus有额度限制；一个CLI任务不是固定的底层模型调用次数。账户已购买credits可能继续消耗，程序不能保证其账单为零。

当前交付的独立测试使用模拟CLI，不消耗任何真实额度。完整集成、真实CLI登录、Web构建和VPS资源验收见部署文档。
