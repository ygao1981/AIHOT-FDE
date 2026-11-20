# 可选的前端开发验收

这里的脚本用于开发机或 CI 验证 FDE 研究台。**生产部署不需要 Playwright 或浏览器。不要把它们装进 VPS 的生产部署流程、生产依赖或生产镜像。**

先在 `fde-workbench` 目录按项目锁文件安装现有依赖，并使用项目要求的 Node.js 24 版本。脚本不会修改项目的 `package.json` 或锁文件。

## 两种检查分别证明什么

| 脚本 | 使用的环境 | 可以检查 | 不能证明 |
| --- | --- | --- | --- |
| `qa/verify-dom.mjs` | LinkeDOM 和模拟 API | DOM 内容、HTML 文本转义、日期精度、笔记提交字段、人工来源入口、费用说明、过滤资料禁止排队 | 真实浏览器布局、Cookie、原生弹窗、下载和模型调用 |
| `qa/verify-ui.mjs` | 真实后端、独立临时 SQLite、Playwright 和 Chromium | 登录、HttpOnly Cookie、筛选、详情、笔记持久化、手动导入、导出下载、来源启停、用量和两个视口 | 真实模型结果质量、外部信源可用性、最终人工视觉评审 |

UI 验收使用 1440 × 1000 和 390 × 844 两个视口，并以负时区检查只有年月日的日期不会前移。页面上的案例、分析结果、笔记和登录会话均为测试数据。虚构的分析内容由脚本写入测试数据库，不代表模型运行结果。

## 快速运行 DOM 检查

在 `fde-workbench` 目录运行：

```bash
npm ci
node qa/verify-dom.mjs
```

`linkedom` 是项目已有依赖，不需要另装测试框架。默认报告保存在系统临时目录，每次运行生成独立的 `fde-dom-qa-*` 子目录。也可以指定输出父目录：

```bash
FDE_QA_OUTPUT_DIR="$(mktemp -d)" node qa/verify-dom.mjs
```

检查通过时退出码为 `0`。断言失败时退出码非 `0`，并在该次目录中写入 `dom-results.json`。该报告明确标注 `kind: "dom-only"` 和 `browserValidationCompleted: false`。

## 在开发机运行真实浏览器检查

下面的命令适用于已经具备 Chromium 系统依赖的 Linux 或 macOS 开发环境。Playwright 和浏览器缓存均放在独立临时目录中。

```bash
set -euo pipefail

fde_qa_tools="$(mktemp -d)"
fde_qa_browsers="$(mktemp -d)"
fde_qa_output="$(mktemp -d)"

npm install --prefix "$fde_qa_tools" --no-save --package-lock=false playwright@1.65.1
export FDE_QA_PLAYWRIGHT_PATH="$fde_qa_tools/node_modules/playwright/index.mjs"
export PLAYWRIGHT_BROWSERS_PATH="$fde_qa_browsers"
node "$fde_qa_tools/node_modules/playwright/cli.js" install chromium

export FDE_QA_BROWSER_PATH="$(node --input-type=module -e 'const { chromium } = await import(process.env.FDE_QA_PLAYWRIGHT_PATH); process.stdout.write(chromium.executablePath());')"
export FDE_QA_OUTPUT_DIR="$fde_qa_output"
node qa/verify-ui.mjs
```

若开发机已有可用 Chromium，也可以把 `FDE_QA_BROWSER_PATH` 设为其绝对路径，省略浏览器下载。仍需在临时工具目录安装 Playwright。不要通过关闭系统保护或修改生产机器权限来解决浏览器启动失败。

## GitHub Actions 可直接采用的命令

在独立开发验收 job 中配置 Node.js 24，并把该步骤的工作目录设为 `fde-workbench`。以下脚本以 Linux GitHub runner 为目标，依赖和浏览器安装均与生产部署分开。

```bash
set -euo pipefail

npm ci

fde_qa_tools="$RUNNER_TEMP/fde-qa-tools"
export PLAYWRIGHT_BROWSERS_PATH="$RUNNER_TEMP/fde-qa-browsers"
export FDE_QA_OUTPUT_DIR="$RUNNER_TEMP/fde-qa-output"

npm install --prefix "$fde_qa_tools" --no-save --package-lock=false playwright@1.65.1
export FDE_QA_PLAYWRIGHT_PATH="$fde_qa_tools/node_modules/playwright/index.mjs"
node "$fde_qa_tools/node_modules/playwright/cli.js" install --with-deps chromium
export FDE_QA_BROWSER_PATH="$(node --input-type=module -e 'const { chromium } = await import(process.env.FDE_QA_PLAYWRIGHT_PATH); process.stdout.write(chromium.executablePath());')"

node qa/verify-dom.mjs
node qa/verify-ui.mjs
```

CI 上传 artifact 的目录设为 `${{ runner.temp }}/fde-qa-output/`，上传步骤使用 `if: always()`。这样断言失败时，已经产生的报告和截图也会保留。不要把测试输出提交到 Git，也不要上传浏览器缓存或测试工具目录。

UI 脚本在 `FDE_QA_OUTPUT_DIR` 下创建独立的 `fde-ui-qa-*` 子目录，包含：

- `ui-results.json`：本次执行状态、完成的断言、失败阶段、限制、模型尝试次数与清理结果。
- `desktop-*.png`、`mobile-*.png`：已经到达的页面截图。某一步失败后，不会伪造后续截图。
- `fixture-export.md`：仅包含虚构资料和测试笔记的下载结果。

只有全部断言完成且清理成功，脚本才以 `0` 退出。报告中的 `status` 为 `passed` 且 `browserValidationCompleted` 为 `true`，才表示该次浏览器链路完成。截图仍应人工检查文字、层次、遮挡与可读性。

## 可配置参数

| 参数 | 用途 | 默认行为 |
| --- | --- | --- |
| `FDE_QA_PLAYWRIGHT_PATH` | 临时安装的 `playwright/index.mjs` 绝对路径 | UI 脚本必填；不自动安装包 |
| `FDE_QA_BROWSER_PATH` | Chromium 可执行文件的绝对路径 | 使用 Playwright 对应版本的安装路径 |
| `PLAYWRIGHT_BROWSERS_PATH` | Playwright 安装和运行时使用的浏览器缓存 | 建议显式设到开发机临时目录或 `RUNNER_TEMP` |
| `FDE_QA_OUTPUT_DIR` | 报告和截图的输出父目录 | 系统临时目录；每次另建唯一子目录 |
| `FDE_QA_PORT` | UI 测试服务端口 | `3217`；冲突时换一个本机空闲端口 |

脚本通过相对模块地址定位当前检出的应用源码，不依赖当前机器的工作区绝对路径。启动测试时会在同一 Node.js 进程中创建服务，只监听 `127.0.0.1`，不连接已有运行实例。

数据库路径由脚本在系统临时目录生成，不能通过项目 `.env` 指向生产数据。正常结束或可捕获的失败都会关闭浏览器、工作器、HTTP 服务与数据库，并删除该次临时数据库；报告和截图会保留。进程被强制终止时，临时文件可能需要开发环境自行清理。

## 数据和调用边界

UI 脚本显式使用 `provider=off`，关闭分析、自动分析和采集，也不加载或合并项目 `.env`。测试时手动导入的正文由脚本提供，因此不需要读取外部网页。浏览器遇到本站以外的网络请求会中止该请求，并使最终检查失败。

来源启停只修改临时数据库中的状态，不会触发采集。脚本核对模型尝试表为空，不使用真实 API Key、Codex 登录目录、生产访问口令或用户 Cookie。报告不包含生成的登录口令或 Cookie 值。

DOM 脚本不创建数据库，所有 API 都由测试数据模拟。它通过并不能替代真实浏览器验收。

## 初始验证状态与受限环境

整理脚本时，DOM 检查的六组断言可以通过，其中包括“分析开启时，已过滤资料仍不安排模型”的检查。最初开发环境中的 Chromium 在进入页面前被系统拒绝创建 socket，报 `Operation not permitted`，因此当时没有完成真实浏览器交互，也没有产生页面截图。

这类启动失败应如实保留为失败结果。可在允许运行浏览器的独立开发机或 GitHub runner 执行同一脚本；后续验证结论以该次生成的 JSON、截图和 CI 退出码为准。不要因为 DOM 检查通过，就把真实浏览器检查标为通过。
