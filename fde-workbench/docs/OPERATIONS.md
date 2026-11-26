# 个人研究台运维

## 2.3.1 今日研究升级

SQLite 从 schema 4 增量升级到 5。先用正在运行的旧版执行 `npm run backup`，在独立副本用只读连接检查 schema、`PRAGMA integrity_check` 和外键。对副本试迁移，并核对原资料、笔记、草稿、译文、账本、信源及线索。确认旧服务和运行锁都已退出后，再切换正式工作目录。新版启动和会打开数据库的管理命令都可能触发迁移。

回滚先正常停止本版并对升级后数据另存备份。用 schema 4 快照复制到另一个数据目录，指定旧版代码读取该目录。需要把新采集的资料带回旧版时先导出，按需人工收录。

设 `FDE_COLLECT_ENABLED=true` 后重启，即可同时运行订阅、已跟踪 GitHub 仓库与启用的工程博客。定时采集与 `FDE_AUTO_ANALYZE` 各自控制。滚动 24 小时自动分析上限仍在「用量」设置。模型全部关闭时仍可采集、查看研究卡、导出简报和编辑素材稿。 [发现与订阅](DISCOVERY.md)

## 2.3.0 线索池升级

升级前用 2.2.1 生成独立的 SQLite 快照。用旧版或只读 SQLite 验证快照完整性，再正常停止旧实例并启动 2.3.0。schema 3 会增量迁至 4，建立线索表和原文关联索引，原文、研究成果、笔记、草稿和回执继续保留。还原旧程序时，保存升级后的数据库，再用升级前的 schema 3 快照在独立目录恢复。

「发现线索」的搜索、关联和收录不会发起模型请求。定时跟踪按仓库选择，沿用现有定时采集开关。全部数据保存在同一 SQLite 库，使用现有备份命令。 [免费发现与 GitHub 限流](DISCOVERY.md)

## 2.2.1 手动与自动分析的用量设置

升级前用旧版命令备份并验证 SQLite 快照。停止旧实例后再启动新版，SQLite 由 schema 2 增量升级到 3。分析队列和用量回执新增来源字段，原文章、笔记、草稿、回执和设置保留。旧回执继续显示在总用量中。升级前已排队而来源未知的资料遵循自动开关，确认需要处理时可以改为手动分析。

「用量 → 自动分析额度」保存滚动 24 小时内允许的自动尝试数。范围为 1–50 次，尚未保存时使用部署配置的 `FDE_DAILY_LIMIT`。单独保存额度不会开启自动分析。手动分析、写作和翻译仍由同一串行 worker 记录用量、执行暂停和重试规则。

「信源 → 采集范围与条数」保存最近 1–365 天和每天最多新增 1–200 篇。默认 30 天、50 篇。范围含当天，按原文发布日期和运行电脑的自然日计算。采集累计使用同一自然日内新增的信源资料数，去重、手动导入及超出日期范围的资料不计入。扩大窗口后可在下一轮检查时补收仍出现在信源上的文章。收窄窗口不会清除已有资料。

「检查信源更新」可手动检查启用的信源，最近 5 分钟检查过的信源会跳过。每轮从较久未检查的信源开始，每个信源优先处理发布日期较新的文章，最多检查 30 条列表候选。定时采集由 `FDE_COLLECT_ENABLED` 控制，沿用各信源间隔。

需要回滚时先保存新版快照，然后让旧版读取升级前快照的独立副本。已发生的真实消耗以实际账号和新版账本为准。

## 2.2.0 草稿数据库升级

本版从 `PRAGMA user_version=1` 增量迁移到 2，增加公众号草稿和模型任务类型。迁移保留既有文章、分析 JSON、个人笔记、回执、来源状态与设置；不建 PostgreSQL，不改 MariaDB。

升级顺序必须如下：

1. **旧代码仍在使用时**，暂时关闭新模型任务并执行 `npm.cmd run backup`（Linux 为 `npm run backup`）。记录旧 commit、实际资料目录与最新快照路径。
2. 独立只读打开这份快照，确认 `integrity_check=ok`、schema 1、文章/研究卡/回执数量及重要字段。已有 schema 2 则按实际版本记录。
3. 停止旧服务，确认没有活跃模型子进程，保留 `.env`、CLI 登录目录和运行记录。不要自动删除未知状态的锁。
4. 在新分支安装锁定依赖并跑检查，保持三个工作开关关闭。首次用新代码打开资料库会在事务内升级；失败回滚，不删库重建。
5. 对比升级前后的历史数据。先验收零模型素材稿、编辑保存、排版、重启与备份，再按实际剩余次数启用人工写作。

**不能先切新代码再运行旧库备份命令来得到回滚快照。** `scripts/manage.mjs` 会创建 Store，新版 backup/status 等命令也可能先迁移数据库。回滚点应在第 1 步保存。

若要回滚旧代码：先停止新版，另存新版完整快照及新草稿；使用升级前的 schema 1 备份恢复到独立资料目录，再启动旧版并指向该目录。不要把 `user_version` 手工改小，不让旧代码直接操作 schema 2。旧快照不包含升级后的新稿和真实调用记录；供应商的消费不会回退，因此回滚后保持模型关闭，待原真实 24 小时窗口过期或完整核对账本后再启用，不能利用恢复备份重新获得 5 次调用。

公众号草稿、来源快照与回执包含在 SQLite Backup API 快照中。配图是确定性生成的下载件，可由保存正文重新绘制；不需要备份另一个图床或模型服务。完整操作提示见 [CODEX_WECHAT_PROMPT](CODEX_WECHAT_PROMPT.md)。

**日常使用先保证数据目录一致，定期执行在线备份；恢复数据前必须停服务。** 模型超时、中断或返回无效结果后，研究台会暂停新分析。先核对账户用量，再决定恢复队列或明确重试。

本说明对应独立的 `fde-workbench/`。实际命令来自 [package.json](../package.json)、[管理脚本](../scripts/manage.mjs)、[启动与锁文件](../src/main.mjs)、[SQLite 存储](../src/store.mjs) 和 [systemd 示例](../deploy/fde-workbench.service)。没有恢复、账本合并、自动解锁或命令行重试等未实现的管理命令。

## 1. 先核对目录和运行用户

Node.js 需要 **24.22.1 或更新的 24.x**。本机试用时，在仓库的 `fde-workbench/` 目录执行命令。采用随仓库提供的 systemd 示例时，工作目录是 `/opt/fde-workbench/fde-workbench`，运行用户是 `fde`，资料目录应统一设置为 `/var/lib/fde-workbench`。

**systemd、`.env` 和手动管理命令必须指向同一个 `FDE_DATA_DIR`。** 服务部署时，在 `.env` 中明确填写：

```dotenv
FDE_DATA_DIR=/var/lib/fde-workbench
```

服务通过 `EnvironmentFile` 读取同一份 `.env`，管理脚本通过 `--env-file-if-exists` 读取它，不另设一个不同的数据目录。否则，从终端执行备份时可能打开另一个默认 `.data` 目录。管理脚本在 `research.sqlite` 不存在时会拒绝执行，不会为状态检查或备份创建空库；如果错误目录里本来就有另一个库，仍需人工核对数据数量。

Docker 模式的数据位于容器 `/app/.data` 对应的命名卷，宿主机 `.env` 中的资料路径不能代表这个卷。管理与备份命令必须在容器内运行，见第 5 节。

下面的命令只显示解析后的资料目录，不显示密钥：

```bash
node --env-file-if-exists=.env --input-type=module -e \
  'import {loadConfig} from "./src/config.mjs"; console.log(loadConfig().dataDir);'
```

核对这个目录中已经存在 `research.sqlite`，再执行状态、备份等操作。普通 `node`、`npm` 管理命令应由拥有资料目录权限的用户执行。systemd 部署下，可以在正确工作目录中使用：

```bash
sudo -u fde /usr/bin/node --env-file-if-exists=.env scripts/manage.mjs status
```

主要文件如下。这里的 `FDE_DATA_DIR` 指实际配置值，不是需要原样创建的目录名。

| 文件或目录 | 内容 | 维护方式 |
|---|---|---|
| `FDE_DATA_DIR/research.sqlite` | 文章、研究结果、个人笔记、选题状态、请求回执和暂停状态 | 使用在线备份命令 |
| `research.sqlite-wal`、`research.sqlite-shm` | SQLite 运行时文件 | 服务运行时不要移动或删除 |
| `FDE_DATA_DIR/workbench.lock` | 同一资料目录的进程运行锁 | 正常退出自动移除；崩溃后按第 4 节人工核对 |
| `FDE_DATA_DIR/backups/` | 数据库快照 | 私有保存，并另存一份到独立安全位置 |
| `FDE_DATA_DIR/exports/` | 导出的 Markdown 研究笔记 | 用于写作；不能替代数据库备份 |
| 工作目录中的 `.env` | 登录口令、运行配置、可能配置的 API key | 权限设为 600，不提交 Git，不粘贴到聊天或日志 |
| `FDE_CODEX_HOME` | 官方 CLI 自己维护的登录目录 | 与其他项目隔离，不提交 Git，不公开备份 |

数据库备份不包含 `.env`、源码、依赖或 CLI 登录目录。记录对应的源码提交和配置保管位置；凭据单独保护。

## 2. 日常状态与停止

在 `fde-workbench/` 目录执行：

```bash
node --env-file-if-exists=.env scripts/manage.mjs status
npm run doctor
```

使用 Codex 时，可增加只执行版本、帮助和登录状态检查的诊断：

```bash
npm run doctor -- --codex
```

这些命令不提交模型任务。状态中的已估算费用不是供应商账单；未知消费对应的预留金额也不是已经确认的支出。详细定义见 [模型用量说明](MODEL_USAGE.md)。

systemd 部署的状态、日志和健康检查：

```bash
sudo systemctl status fde-workbench.service --no-pager
sudo journalctl -u fde-workbench.service -n 80 --no-pager
curl --fail http://127.0.0.1:3210/api/health
```

如果修改了端口，健康检查地址也要修改。健康接口只证明进程能够响应，不证明信源或模型账户可用。

正常停止：

```bash
sudo systemctl stop fde-workbench.service
sudo systemctl show fde-workbench.service -p ActiveState -p SubState -p MainPID
```

应确认服务已经停止，`MainPID=0`。前台运行 `npm start` 时，在原终端按 Ctrl+C。程序会等待当前处理结束、关闭数据库并释放自己持有的锁。已经发往模型的请求可能继续完成，不要通过删锁或启动第二个实例来催促退出。

### 采集网络故障

`blocked_url` 表示目标或 DNS 地址不符合安全校验，可能由 Fake-IP 引起。先核对活动代理，再通过 `npm run sources:check -- --id=meituan-engineering` 验证正式采集路径。Windows 使用 `npm.cmd`。该命令无需打开资料库，也不会排队分析。

`source_proxy_failed` 时核对 `FDE_SOURCE_PROXY_URL` 与 `FDE_SOURCE_PROXY_FALLBACK_URLS` 的监听进程和端口。`source_tls_failed` 时核对信源证书和部署环境的信任根。结果保存在信源状态中。需要停用专用代理时，清空两项并正常重启。 [代理配置与诊断](WINDOWS_LOCAL.md#检查本机采集代理) · [网络边界](ARCHITECTURE.md)

## 3. 暂停、恢复与明确重试

暂停后仍可阅读原文、查看已有分析、修改个人笔记和导出：

```bash
node --env-file-if-exists=.env scripts/manage.mjs pause
```

暂停只阻止**新的分析**启动，不取消已经发出的请求，也不停止独立的网页采集。若要停止所有后台外部操作，正常停止服务；或修改 `.env` 中的采集和分析开关后重启。

超时、连接中断、无效结果或进程中断会进入保守处理：保留请求记录，结果未知时保留 API 预留，并暂停新分析。即使能够记录已返回的 usage，失败任务也不会自动再发。

处理顺序是：

1. 查看“用量”和失败资料，核对官方账号的额度或账单，处理网络、认证或参数问题。
2. 确认允许未失败的排队资料继续处理，再解除全局暂停：

   ```bash
   node --env-file-if-exists=.env scripts/manage.mjs resume
   ```

3. 对需要再次分析的失败资料，在页面中点击“确认后重试”或“重新分析”，确认提示中的额外用量。该操作产生新的执行尝试，仍受次数和 API 预算限制。

`resume` 不会自动重发结果未知的失败资料。界面的额外用量确认也不会自动解除全局暂停。不要直接改回执状态、清空 attempts 表或删除数据库来解除限额。

2.1.0 中，网页恢复会立即唤醒待处理队列；管理脚本只修改 SQLite，运行中的服务最多等到下一次普通维护检查（约 60 秒）再发现恢复。该检查不调用模型。入队后的连续处理仍遵守单模型并发与上限，暂停时不继续扩大自动队列。

当前管理脚本只有 `status`、`pause`、`resume`、`backup`、`export`，没有 `retry` 命令。命令行导出与备份均不调用模型。

另有独立的 `npm run intake` 客户端用于外部脚本收录和状态查询，见 [EVENT_INTAKE.md](EVENT_INTAKE.md)。它复用私有 HTTP API，不能代替备份管理，也不自动确认未知模型请求的重试。

## 4. 崩溃后出现运行锁

**只要 `workbench.lock` 已存在，启动就会拒绝。程序不根据旧 PID 自动回收锁。** 这防止两个重启进程互相删除对方刚创建的运行锁。

如果遇到“运行锁已存在”，先检查是否还有一个正常实例。systemd 使用 `Restart=on-failure`，崩溃后的自动重启也可能持续被旧锁拦住；先执行 `systemctl stop` 停止重启循环。

采用上述标准部署路径时，可以查看锁中记录的 PID：

```bash
sudo -u fde /usr/bin/node --input-type=module -e \
  'import {readFileSync} from "node:fs"; console.log(JSON.parse(readFileSync(process.argv[1],"utf8")).pid);' \
  /var/lib/fde-workbench/workbench.lock
```

将输出的数字用于进程检查。下面的 `12345` 仅表示需要替换的 PID：

```bash
ps -p 12345 -o pid=,comm=,lstart=
sudo readlink /proc/12345/cwd
```

结合服务状态、进程和工作目录，确认没有任何实例仍在使用这个资料目录。PID 可能已经被系统复用，不能仅凭数字存在或不存在自动判断。若还有旧研究台进程，先正常停止它；若锁损坏或无法判断，也先停止排查，不继续删文件。

**只有确认所有相关实例已经停止后**，才人工移除这一份精确锁文件：

```bash
sudo -u fde rm -- /var/lib/fde-workbench/workbench.lock
```

不要扩大到 `.data`、SQLite 数据库、WAL 或其他项目的锁。自定义路径必须替换成先前核对过的资料目录，不能照抄标准路径。

随后启动一个实例。启动代码会把上次遗留的 `running` 请求转为 `unknown`，保留预留并暂停新分析。按第 3 节核对后处理，不会因为删除了进程锁就重复调用模型。

## 5. 在线备份并验证

程序已通过 Node 内置 SQLite Backup API 生成快照，可以在研究台运行、WAL 仍在使用时备份。它不只是复制主数据库文件；在线备份机制见 [SQLite 官方说明](https://www.sqlite.org/backup.html)。

原生部署在正确工作目录、正确运行用户下执行：

```bash
npm run backup
```

systemd 部署可使用同一功能的明确命令：

```bash
sudo -u fde /usr/bin/node --env-file-if-exists=.env scripts/manage.mjs backup
```

成功后终端会显示 `FDE_DATA_DIR/backups/research-时间.sqlite` 的实际路径。该备份文件权限为 600。不要用 `cp research.sqlite` 代替运行中的在线备份，也不要为备份手动删除 WAL。

### Docker：在运行中的容器内备份

不要在宿主机运行 `npm run backup` 来备份容器资料。API / off 的基础 Compose 使用：

```bash
docker compose exec -T app node scripts/manage.mjs backup
```

使用 Codex 的组合部署必须保留两个配置文件：

```bash
docker compose -f compose.yml -f compose.codex.yml exec -T app node scripts/manage.mjs backup
```

输出路径位于容器 `/app/.data/backups/`。将下面的文件名替换为命令实际输出的快照文件名，并将目标替换为已有私有目录中一个尚不存在的文件。基础 Compose 复制命令是：

```bash
docker compose cp app:/app/.data/backups/research-实际时间.sqlite /绝对路径/私有备份目录/research-实际时间.sqlite
chmod 600 /绝对路径/私有备份目录/research-实际时间.sqlite
```

Codex 组合部署使用：

```bash
docker compose -f compose.yml -f compose.codex.yml cp app:/app/.data/backups/research-实际时间.sqlite /绝对路径/私有备份目录/research-实际时间.sqlite
chmod 600 /绝对路径/私有备份目录/research-实际时间.sqlite
```

只复制刚生成的备份文件，不直接复制运行中的 `research.sqlite`。状态、暂停、恢复和导出也应使用同一 Compose 组合执行容器内的 `node scripts/manage.mjs`，不能操作宿主机另一份库。导出的 Markdown 位于容器 `/app/.data/exports/`，同样通过 `docker compose cp` 复制。

### 独立读取快照

选取刚生成的备份，使用下面的 Node 命令独立只读打开。先把第一行路径替换为**刚才实际输出的备份路径**，不要修改正在使用的数据库：

Docker 模式应验证已复制出来的单文件快照。若宿主机没有 Node.js 24，可在另一台已有兼容 Node 的机器上执行此检查。

```bash
node --input-type=module - '/绝对路径/刚生成的备份.sqlite' <<'NODE'
import { DatabaseSync } from 'node:sqlite';
import { statSync } from 'node:fs';
const file = process.argv[2];
if (!file || !statSync(file).isFile()) throw new Error('请选择真实的数据库备份文件。');
const db = new DatabaseSync(file, { readOnly: true });
try {
  const integrity = db.prepare('PRAGMA integrity_check').all();
  const foreignKeys = db.prepare('PRAGMA foreign_key_check').all();
  if (integrity.length !== 1 || integrity[0].integrity_check !== 'ok' || foreignKeys.length) {
    throw new Error('备份完整性检查未通过，不能用于恢复。');
  }
  console.log({
    integrity: 'ok',
    schemaVersion: db.prepare('PRAGMA user_version').get().user_version,
    articles: db.prepare('SELECT count(*) n FROM articles').get().n,
    analyses: db.prepare('SELECT count(*) n FROM articles WHERE analysis_json IS NOT NULL').get().n,
    personalNotes: db.prepare("SELECT count(*) n FROM articles WHERE personal_notes <> ''").get().n,
    attempts: db.prepare('SELECT count(*) n FROM attempts').get().n,
  });
} finally { db.close(); }
NODE
```

除 `integrity: 'ok'` 外，还要核对数量是否符合预期。空库通过完整性检查，不代表备份对象正确。验证后，将快照另存到独立的私有位置；同一磁盘上的备份不能应对磁盘损坏。

备份可能包含处于分析中的请求。快照是一致的数据状态，但不等于外部模型任务已经结束。恢复这类快照时，启动程序仍会将遗留请求标为未知并暂停。

## 6. 恢复数据库：始终停服务

恢复是把资料回退到旧快照。快照之后保存的笔记、文章、选题状态和请求记录不会自动合并回来。**先保留恢复前的数据库，再执行替换。**

1. 验证目标备份，并记录其时间、源码版本和数据数量。
2. 在 `.env` 中把 `FDE_COLLECT_ENABLED`、`FDE_ANALYSIS_ENABLED`、`FDE_AUTO_ANALYZE` 都设为 `false`。保留原模型接入方式和其他配置，便于核对。
3. 正常停止服务，确认全部实例退出。如果需要，按第 4 节处理已确认遗留的锁。
4. 如果当前资料库仍可读，先执行一次 `backup`，保留恢复前的最新快照。
5. 将停止状态下的旧数据库及其侧文件一起留存，再安装已验证的单文件备份。

以下仅适用于示例 systemd 路径和 `fde` 用户。先把 `fde_backup` 改为已验证的真实路径。这个代码块不会自动停止服务或自动删除锁；任何检查失败都会退出：

```bash
sudo bash -eu <<'BASH'
fde_data_dir='/var/lib/fde-workbench'
fde_backup='/这里替换为已验证备份的绝对路径.sqlite'
test -s "$fde_backup"
test -d "$fde_data_dir"
test ! -e "$fde_data_dir/workbench.lock"
if systemctl is-active --quiet fde-workbench.service; then
  echo '服务仍在运行，不能恢复。' >&2
  exit 1
fi
fde_archive="$fde_data_dir/before-restore-$(date -u +%Y%m%dT%H%M%SZ)"
mkdir -m 700 -- "$fde_archive"
for fde_file in research.sqlite research.sqlite-wal research.sqlite-shm; do
  if [ -e "$fde_data_dir/$fde_file" ]; then
    mv -- "$fde_data_dir/$fde_file" "$fde_archive/"
  fi
done
install -m 600 -o fde -g fde -- "$fde_backup" "$fde_data_dir/research.sqlite"
BASH
```

不运行 systemd 的本机部署，应在确认前台进程退出后按实际路径完成同样的文件操作，不使用上面的服务用户或绝对路径。

恢复后先以关闭采集和分析的配置启动：

```bash
sudo systemctl start fde-workbench.service
sudo systemctl status fde-workbench.service --no-pager
curl --fail http://127.0.0.1:3210/api/health
```

登录页面核对文章、个人笔记、选题和已有研究结果；运行 `status` 核对回执和暂停状态。数据库版本高于当前代码时，程序会拒绝打开；应使用兼容的源码版本，不手改 `user_version`。

### 恢复后的用量账本需要重新核对

恢复旧快照也会回退本地 attempts 账本。**旧快照之后已经发生的真实 API 或 CLI 消耗不会因此退款。** 本地滚动 24 小时次数和月预算记录可能少于实际消费。

保持分析关闭，结合恢复前留下的数据库和官方用量核对差额，再调整剩余预算和处理计划。当前没有合并回执或补录账单的管理命令。无法确定剩余额度时，继续暂停；不能把回退后的较低数字直接当作可用新额度。

确认恢复正确且预算可用后，再按部署方式修改开关并重启。失败或未知资料仍需明确确认重试，不能通过批量改状态跳过确认。

## 7. 更新、导出和空间维护

更新前记录当前提交，执行并验证一次数据库备份。停止服务后再更换代码和依赖，使用 `npm ci` 保持锁文件版本一致，执行 `npm run check` 和 `npm test`，再启动。不要覆盖已有 `.env`、资料目录或独立 CLI 登录目录；`npm run init` 对已有 `.env` 不会覆盖，但不能代替人工核对新增配置。

导出当前未归档的已分析资料：

```bash
npm run export
```

导出的 Markdown 包含研究内容、原文链接和个人笔记。它不包含完整数据库状态，也不会导出所有未分析笔记或回执。所有资料的完整恢复仍依赖数据库备份。

默认清理超过 60 天且仍待整理的原始候选。清理只针对没有个人笔记、没有分析、没有请求回执的 `candidate`、`skipped`、`needs_body` 条目；已选题、写作中、已发布、已归档资料，以及研究结果、个人笔记和请求回执都会保留。归档不是删除，也不会自动回收这些资料的空间。

备份和 Markdown 导出目录不会被数据库保留策略自动清理。定期核对磁盘空间和备份留存，只删除已经另有可靠副本且明确不再需要的备份文件，不对资料目录执行批量清空或 Docker 卷清理。

相关验证可单独运行：

```bash
node --test tests/backup.test.mjs
```

测试在临时数据库中验证运行中 WAL 的在线快照、未提交事务隔离、单文件独立读取、完整性、笔记与分析保留，以及恢复中的未知请求暂停。测试不调用模型，也不操作使用者资料库。
