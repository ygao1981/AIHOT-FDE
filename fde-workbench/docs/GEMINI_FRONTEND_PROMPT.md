# 给 Gemini 的 FDE 研究台前端优化提示词

## 任务

请直接优化我的「FDE 研究台」前端。研究台用于从真实案例里核对企业 AI 落地的业务问题、实施过程和原文证据，再把选题做成「半理性半烟火」的公众号草稿。改动后我需要能在浏览器里继续完成整个流程。

仓库为 `ygao1981/AIHOT-FDE`。先核对草稿 PR #7 的实时 head，从 `codex/fde-editorial-windows-acceptance` 建独立前端分支。入口为 `fde-workbench/`，本机地址 `http://127.0.0.1:3210/`。先读根及子目录 `AGENTS.md`、`CHECKPOINT.md`、`fde-workbench/README.md`、`docs/EDITORIAL_WORKFLOW.md` 和 `docs/VALIDATION.md`。再读 `public/index.html`、`app.js`、`style.css`、`editorial.html`、`editorial.js`、`editorial.css` 以及 `guide.html`、`guide.css`。后文的 `docs/` 与 `public/` 均相对 `fde-workbench/`。 [草稿 PR #7](https://github.com/ygao1981/AIHOT-FDE/pull/7)

## 沿用 PM PC 的前端优化方法

1. **用 `hallmark` 主导视觉重排。** 参照 PM PC 实际采用的 Hallmark v2.0.0 `redesign` 流程。先量出现有页面的问题，保存真实浏览器基线，再用统一的颜色、字号和间距组织真实操作。沿用 FDE 自己的青绿标识和中文字体。优先重排登录、研究列表、详情和草稿工作区的展示层。小范围调整沿用现有组件与功能。能访问本机时读取 `D:/.codex/skills/hallmark/SKILL.md` 和 `references/redesign.md`。
2. **用 `impeccable audit` 做独立复查。** 改完后按 Operate 模式查主内容区、标题层级、筛选首屏高度、状态名称、焦点、对比度和响应式。逐条复核自动报告，记录问题、实测证据和修复结果。能访问本机时读取 `D:/.codex/skills/impeccable/SKILL.md` 与 `reference/audit.md`。
3. **参考 PM 地图曾用的 `finesse-ui` 和 `ui-ux-pro-max`。** 用 `finesse-ui` 的 product/workflow 准则检查密度和主次操作。用 `ui-ux-pro-max` 检查文字可读性、键盘和触屏。两者按需补充主流程。本机技能在 `D:/.codex/skills/finesse-ui/SKILL.md` 和 `D:/.codex/skills/ui-ux-pro-max/SKILL.md`。
4. **用 `playwright` 在真实浏览器验收。** 参考 `D:/.codex/skills/playwright/SKILL.md`。复用仓库 `qa/README.md` 和浏览器验收脚本，输出同页面同尺寸的前后对比截图。若没有实际运行某项工具，记录为待验。

云端环境读不到本机技能时，直接应用以下设计与验收要求。技能不需要进入产品运行依赖。

## 要改好的地方

1. **研究库。** 让资料标题、来源、日期、阶段和最值得读的判断易于扫描。把「待分析」与「待整理／已整理」的两个筛选维度做清楚。手动「AI 分析」「整理素材」「标为已整理」、导入、搜索、导出、登录和「使用说明」都要在正常操作路径上。
2. **资料详情。** 先呈现业务问题、实施方案和披露的效果。原文证据、编辑判断、个人笔记有清晰层级。保留英文原文和已有的手动中文翻译。长标题、长译文和深度研究卡应换行，笔记、关闭与保存按钮容易找到。
3. **公众号草稿。** 清楚呈现选 1–3 篇资料、填角度、整理素材或发起一次 AI 写作、编辑保存、预览、复制、下载的顺序。桌面可并排比较编辑与预览。窄屏按实际顺序排布，所有必需操作可以滚动到。保留纯文字与图文两版、清爽白纸与深色卡片两主题，以及 TXT、Markdown、HTML、PNG 和 ZIP。
4. **视觉与状态。** 沿用现有的青绿主色、带色温的浅中性色和可离线使用的中文字体栈，收紧圆角、描边、层级与留白。重点是阅读密度与保存反馈。默认避免宣传页式大首屏、紫色渐变、装饰数字和重复文案。正文对比度达到 WCAG AA，触屏目标尽量达到 44 × 44 CSS 像素。给加载、空状态、选中、禁用、错误、暂停、额度不足和保存冲突明确中文反馈。保留 `:focus-visible`、Esc、合理的 Tab 顺序和减少动效设置。

## 功能边界与验收

- 保留 Node 24、SQLite 和既有 API、认证、路由及 CSP。保护 `.env`、真实 SQLite、私人笔记、历史回执和所有登录文件。仅修改前端及与验收相关的最小范围。
- 手动分析、翻译和写作记录用量，由用户决定何时发起。保留「用量 → 自动分析额度」设置及两类任务的行为，滚动 24 小时次数上限用于自动分析。页面读取、编辑、排版和导出保持零模型调用。前端优化用虚构数据和隔离配置。保留未知结果、手动重试和保存冲突的行为。
- 保留「信源 → 采集范围与条数」、今日新增计数和「检查信源更新」。保留日期、篇数的校验及达到上限的提示。
- 先跑 `npm.cmd ci --ignore-scripts`、`npm.cmd run check`、`npm.cmd test`，再用真实浏览器检查桌面 1440px、平板和 375/390px 手机视口。实际走一遍登录、筛选、详情、整理、编辑保存、两种预览、ZIP 下载和说明页跳转。确认无横向溢出、焦点可见、长中文可读。同一素材编辑与导出后，尝试账本应不增长。
- 交付独立分支、实际截图和验收结果。说明修改内容、实际测试与未验证项，更新 `CHECKPOINT.md` 和 `docs/VALIDATION.md`。可提交面向 PR #7 分支的草稿 PR，交由本人评审合并。
