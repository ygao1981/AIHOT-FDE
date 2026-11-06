# 给 Codex 的任务：部署 FDE 个人研究版

请实际检查、修复和部署，不要只生成教程。默认中文汇报，不能把未运行的测试写成通过。

仓库：https://github.com/ygao1981/AIHOT-FDE
本次目标分支：codex/fde-cli-single-pass
请优先检出这个分支的最新提交，不要直接部署尚未包含此次重构的main。

## 目标和限制

用途只有个人FDE研究和技术公众号选题。脚本负责采集、去重、过滤、格式校验、存储、导出；候选文章交给官方Codex CLI一次任务分析。
我会在VPS上亲自给这个项目的CLI登录ChatGPT Plus，不使用模型API Key，不使用非官方代理，不转换或提取OAuth令牌。
保留PostgreSQL17和现有Web/API，不迁移MariaDB，不加Redis、向量数据库或本地大模型。
VPS是Linux，已有MariaDB、PM、OpenClaw等服务。以前提到2核4GB/60GB只是历史信息；先测实时资源，不假定现在还有多少空间。
禁止删除数据卷、停止其他项目、覆盖现有.env、关闭服务器安全保护。不要自动清理磁盘或升级整机运行环境。

## 第一步：只读检查

读取AGENTS.md、docs/FDE_CODEX.md、Dockerfile.codex、deploy/compose.codex.yml，以及modules/fde-research中的代码。
检查Git工作区；不得覆盖用户未提交改动。记录基线SHA。
执行bash deploy/fde-preflight.sh，检查磁盘/inode、可用内存、swap、Docker目录和现有容器。
核实端口3100是否可用；不得直接抢占80/443。资源不足先完成代码验收，报告实际缺口，不强行启动。

## 第二步：代码与安全验收

执行node --test modules/fde-research/tests/*.test.mjs。
在联网构建环境使用package.json要求的Node24版本安装锁定依赖，运行typecheck、standalone、完整数据库测试、Web build和Web tests。
测试数据库必须独立，名称以_test或_ci结尾。包括modules/fde-research/tests/research.test.ts的回归检查。
验证：正常处理一个CLI任务；重复输入复用回执；24小时额度上限在调用前阻止；失效登录/额度/超时全局暂停；不自动重试；撤回内容不出现在研究页；旧cron不继续调用模型。
如果发现错误，修复并补测试，不能删除用例、伪造数据或关闭校验。将修复提交到此分支。

## 第三步：环境和镜像

优先其他可信环境构建镜像，VPS只pull。不要在空间不足的VPS上运行npm ci或完整Docker构建。
从官方npm注册表核对@openai/codex版本，固定精确CODEX_VERSION；确认支持--ignore-user-config、--ephemeral、--output-schema和只读沙箱。
核对关闭shell/apps/hooks/memory/code mode等配置是否被该版本支持。不能用danger-full-access或跳过沙箱绕过错误。
新部署从.env.codex.example建.env，生成独立管理员密码、签名和数据库密码，chmod600，不打印密钥。
已有.env逐项补充且保留旧值。现有部署继续使用原fde-observer项目名/数据库卷。
建立一个新的FDE_CODEX_HOME专用目录，按worker实际UID授权，仅挂载给worker，不挂给API/Web，不提交到Git、不上传到公开CI。
始终使用两个Compose文件：docker-compose.yml和deploy/compose.codex.yml。
首先保持COLLECT_ENABLED=false、FDE_CODEX_ENABLED=false、MODEL_CALLS_ENABLED=false，启动并检查健康状态。
个人访问先绑定127.0.0.1:3100；需要公网域名时使用已有Nginx、HTTPS及访问控制，不把noindex当鉴权。

## 第四步：由我登录Plus

在VPS给出容器内的官方设备码登录命令：
docker compose -f docker-compose.yml -f deploy/compose.codex.yml run --rm --no-deps worker codex -c 'cli_auth_credentials_store="file"' login --device-auth

这一步由我本人在浏览器完成。不要索取账号密码、一次性验证码或auth.json内容。
宿主机已有登录不等于容器有登录。必须使用本项目专用挂载目录。
登录后运行同一worker环境中的node scripts/fde-doctor.mjs，核对ChatGPT认证模式和CLI参数。
本项目不自动切API、不自动购买额度。提醒我检查账号的额外credits和付费设置，不保证只有套餐额度会被消耗。

## 第五步：小规模验收

先只开启COLLECT_ENABLED，保留FDE_CODEX_ENABLED=false，测试1–2个真实RSS、日期和正文，不能只看HTTP200。
再将FDE_DAILY_LIMIT=1并开启FDE_CODEX_ENABLED；MODEL_CALLS_ENABLED仍为false。
验证一篇真实文章的中文摘要、业务问题、方案、落地阶段、证据、限制和公众号选题。
确认没有双次评分、全文翻译、embedding或自动事件归组调用；浏览页面不能触发Codex。
检查/research、/reading、/topics、管理员登录和重启后的数据/认证持久化，核对峰值内存及磁盘增长。
验证暂停/恢复、失败任务明确人工重试、Markdown导出和数据库备份恢复步骤。
经过我的真实使用确认后才将每日上限调为5，不默认大量导入历史文章。

## 交付

给出实际部署的提交SHA/镜像标签、访问和后台地址、CLI精确版本、登录方式、各项测试结果、真实资源用量、实际Codex尝试数及token统计、备份与回滚命令。
未测真实CLI或未连VPS必须明确写出来。不要发送密码、auth.json、完整.env或含密钥的compose config。
完成集成测试和部署验收后再将该分支合并到main；未通过则保持PR待验收。
