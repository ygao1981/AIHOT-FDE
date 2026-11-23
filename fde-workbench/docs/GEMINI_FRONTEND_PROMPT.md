# 给 Gemini 的 FDE 研究台前端优化提示词

## 任务

请直接优化我的「FDE 研究台 2.2.0」前端。研究台用于从真实案例里核对企业 AI 落地的业务问题、实施过程和原文证据，再把选题做成「半理性半烟火」的公众号草稿。改动后我需要能在浏览器里继续完成整个流程。

仓库为 `ygao1981/AIHOT-FDE`。先核对草稿 PR #7 的实时 head，从 `codex/fde-editorial-windows-acceptance` 建独立前端分支。入口为 `fde-workbench/`，本机地址 `http://127.0.0.1:3210/`。先读根及子目录 `AGENTS.md`、`CHECKPOINT.md`、`fde-workbench/README.md`、`docs/EDITORIAL_WORKFLOW.md` 和 `docs/VALIDATION.md`。再读 `public/index.html`、`app.js`、`style.css`、`editorial.html`、`editorial.js`、`editorial.css` 以及 `guide.html`、`guide.css`。后文的 `docs/` 与 `public/` 均相对 `fde-workbench/`。 [草稿 PR #7](https://github.com/ygao1981/AIHOT-FDE/pull/7)

## 沿用的前端技能

- **`finesse-ui` 用于设计主流程。** 能读本机技能时打开 `D:/.codex/skills/finesse-ui/SKILL.md`。按 product 类型审查现有页面。研究库属于浏览和比较，上手要快。公众号草稿属于编辑工作流，先让用户找到选材、保存和预览。按需使用技能中的 `product-ui.md`、`workflow-ui.md`、`anti-cheap.md` 和 `preflight.md`。
- **`ui-ux-pro-max` 用于交互与无障碍复查。** 本机文件为 `D:/.codex/skills/ui-ux-pro-max/SKILL.md`。沿用已有设计系统，复核对比度、键盘焦点、触屏目标、状态反馈、长文本和响应式。保留当前 HTML、CSS 与原生 JavaScript 技术栈。
- **`playwright` 用于真实浏览器验收。** 如有本机技能，读取 `D:/.codex/skills/playwright/SKILL.md`。仓库已有 `qa/README.md` 和浏览器验收脚本，能使用时直接复用。

云端环境读不到本机技能时，直接应用以下设计与验收要求。技能不需要进入产品运行依赖。

## 要改好的地方

1. **研究库。** 让资料标题、来源、日期、阶段和最值得读的判断易于扫描。把「待分析」与「待整理／已整理」的两个筛选维度做清楚。手动「AI 分析」「整理素材」「标为已整理」、导入、搜索、导出、登录和「使用说明」都要在正常操作路径上。
2. **资料详情。** 先呈现业务问题、实施方案和披露的效果。原文证据、编辑判断、个人笔记有清晰层级。保留英文原文和已有的手动中文翻译。长标题、长译文和深度研究卡应换行，笔记、关闭与保存按钮容易找到。
3. **公众号草稿。** 清楚呈现选 1–3 篇资料、填角度、整理素材或发起一次 AI 写作、编辑保存、预览、复制、下载的顺序。桌面可并排比较编辑与预览。窄屏按实际顺序排布，所有必需操作可以滚动到。保留纯文字与图文两版、清爽白纸与深色卡片两主题，以及 TXT、Markdown、HTML、PNG 和 ZIP。
4. **视觉与状态。** 沿用现有的青绿主色、带色温的浅中性色和可离线使用的中文字体栈，收紧圆角、描边、层级与留白。重点是阅读密度与保存反馈。默认避免宣传页式大首屏、紫色渐变、装饰数字和重复文案。正文对比度达到 WCAG AA，触屏目标尽量达到 44 × 44 CSS 像素。给加载、空状态、选中、禁用、错误、暂停、额度不足和保存冲突明确中文反馈。保留 `:focus-visible`、Esc、合理的 Tab 顺序和减少动效设置。

## 功能边界与验收

- 保留 Node 24、SQLite 和既有 API、认证、路由及 CSP。保护 `.env`、真实 SQLite、私人笔记、历史回执和所有登录文件。仅修改前端及与验收相关的最小范围。
- 研究分析、翻译、写作共享滚动 24 小时最多 5 次。页面读取、编辑、排版和导出保持零模型调用。前端优化用虚构数据和关闭模型的隔离配置，真实模型验收由已有的本机流程单独执行。保留未知结果、手动重试和保存冲突的行为。
- 先跑 `npm.cmd ci --ignore-scripts`、`npm.cmd run check`、`npm.cmd test`，再用真实浏览器检查桌面 1440px、平板和 375/390px 手机视口。实际走一遍登录、筛选、详情、整理、编辑保存、两种预览、ZIP 下载和说明页跳转。确认无横向溢出、焦点可见、长中文可读。同一素材编辑与导出后，尝试账本应不增长。
- 交付独立分支、实际截图和验收结果。说明修改内容、实际测试与未验证项，更新 `CHECKPOINT.md` 和 `docs/VALIDATION.md`。可提交面向 PR #7 分支的草稿 PR，交由本人评审合并。
