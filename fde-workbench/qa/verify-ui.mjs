// Optional development acceptance check. Never run against a production database or account.
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, writeFileSync, readFileSync, rmSync, existsSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { isAbsolute, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';
import { loadConfig, readSources } from '../src/config.mjs';
import { Store } from '../src/store.mjs';
import { Worker } from '../src/worker.mjs';
import { createApp } from '../src/server.mjs';

const outputParent = process.env.FDE_QA_OUTPUT_DIR ? resolve(process.env.FDE_QA_OUTPUT_DIR) : tmpdir();
mkdirSync(outputParent, { recursive: true });
const outputDir = mkdtempSync(join(outputParent, 'fde-ui-qa-'));
const report = {
  status: 'running', phase: 'setup', passed: [], startedAt: new Date().toISOString(), outputDir,
  viewports: [{ width: 1440, height: 1000 }, { width: 390, height: 844 }],
  browserValidationCompleted: false, modelRequests: null,
  fixtures: '仅虚构界面样例，不是真实客户案例或模型输出。登录使用本次运行生成的临时口令。',
  limitations: ['只检查本机开发副本，不访问现有部署或生产数据库。', '不验证真实模型调用、外部信源可用性或最终人工视觉质量。'],
  cleanup: { browserClosed: true, workerStopped: true, serverStopped: true, temporaryDatabaseRemoved: true },
};
let browser, config, store, worker, server, dataDir;
function checked(label) { report.passed.push(label); console.log(`PASS ${label}`); }

try {
  const modulePath = process.env.FDE_QA_PLAYWRIGHT_PATH;
  if (!modulePath || !isAbsolute(modulePath)) throw new Error('请设置 FDE_QA_PLAYWRIGHT_PATH 为临时工具目录中 playwright/index.mjs 的绝对路径，参见 qa/README.md。');
  const { chromium } = await import(pathToFileURL(modulePath).href);
  const executablePath = process.env.FDE_QA_BROWSER_PATH || chromium.executablePath();
  if (!isAbsolute(executablePath) || !existsSync(executablePath)) throw new Error('没有找到测试 Chromium。请安装到开发用缓存，并检查 FDE_QA_BROWSER_PATH 或 PLAYWRIGHT_BROWSERS_PATH。');
  dataDir = mkdtempSync(join(tmpdir(), 'fde-ui-qa-db-'));
  report.cleanup.temporaryDatabaseRemoved = false;
  const port = process.env.FDE_QA_PORT || '3217';
  // Pass a complete, isolated environment. Do not load or merge the project's .env.
  config = loadConfig({
    FDE_PORT: port, FDE_BASE_URL: `http://127.0.0.1:${port}`, FDE_HOST: '127.0.0.1',
    FDE_ACCESS_TOKEN: randomBytes(32).toString('base64url'), FDE_DATA_DIR: dataDir,
    FDE_MODEL_PROVIDER: 'off', FDE_ANALYSIS_ENABLED: 'false', FDE_AUTO_ANALYZE: 'false', FDE_COLLECT_ENABLED: 'false',
  });
  store = new Store(dataDir, readSources());
  const sampleBody = '这是用于界面验收的虚构样例，不是真实客户案例。业务团队想改善售后知识查询，先整理授权文档，再用 RAG 检索辅助员工查找答案。团队先做了小范围试点。文档注明：这是试点，没有生产上线的证据，也没有披露量化效果。测试重点是能否保存来源、区分原文证据和编辑建议，并记录适用条件。人工复核需要检查每段引文对应的上下文、权限边界、数据更新与维护方式。这个样例不用于对外传播事实，只用于验证个人研究工作台的界面与操作流程。';
  const fixture = store.upsertArticle({url:'https://example.org/fde-ui-fixture',title:'界面样例：售后知识检索试点',sourceName:'界面验收样例（虚构）',language:'zh',publishedAt:'2026-11-01',body:sampleBody,status:'analyzed'}).article;
  const analysis = {relevance:'relevant',category:'case',score:72,stage:'pilot',stageEvidence:'团队先做了小范围试点。',title:'界面样例：售后知识检索试点',summary:'本条是界面验收的虚构资料，不是真实客户案例。样例展示售后知识检索从授权文档整理到小范围试点的研究结构，便于核对原文入口、阶段证据和个人笔记。没有生产上线证据，也没有量化效果。',problem:'售后员工查找授权文档中的信息需要多个步骤。此为界面样例。',solution:'整理授权文档，通过 RAG 检索辅助查找，再由员工核对原文。',outcome:'仅描述小范围试点；原文未披露量化成效。',lessons:['先明确可用文档与权限，再验证检索和人工复核流程。'],limitations:['这是虚构界面样例，不能作为真实客户实施证据。'],evidence:[{quote:'团队先做了小范围试点。',claim:'样例只支持试点阶段，不能推断生产上线。'}],ideas:[{title:'从售后知识检索看试点前的准备工作',angle:'以文档权限、原文追溯和人工验收为提纲；写作前需要真实案例补证。'}]};
  store.db.prepare("UPDATE articles SET analysis_json=?,editorial_status='shortlisted' WHERE id=?").run(JSON.stringify(analysis),fixture.id);
  store.upsertArticle({url:'https://example.org/fde-ui-pending',title:'界面样例：待研究的 AI 交付教程',sourceName:'界面验收样例（虚构）',language:'en',body:sampleBody,status:'candidate'});
  worker = new Worker(store, config);
  report.cleanup.workerStopped = false;
  server = createApp(store, worker, config);
  report.phase = 'server-start';
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(config.port, '127.0.0.1', resolve); });
  report.cleanup.serverStopped = false;
  report.phase = 'browser-launch';
  browser = await chromium.launch({ executablePath, headless: true });
  report.cleanup.browserClosed = false;
  const context = await browser.newContext({viewport:{width:1440,height:1000},locale:'zh-CN',timezoneId:'America/Los_Angeles',acceptDownloads:true});
  const externalRequests = [];
  await context.route('**/*', route => {
    const url = route.request().url();
    if (new URL(url).origin !== config.baseUrl) { externalRequests.push(url); return route.abort(); }
    return route.continue();
  });
  const page = await context.newPage();
  page.setDefaultTimeout(15000);
  report.phase = 'browser-interaction';
  const pageErrors=[]; page.on('pageerror',e=>pageErrors.push(e.message));
  await page.goto(config.baseUrl);
  await page.locator('#login-screen').waitFor({state:'visible'});
  await page.screenshot({path:`${outputDir}/desktop-login.png`,fullPage:true});
  await page.locator('#login-token').fill('deliberately-wrong-test-token');
  await page.locator('#login-submit').click();
  await page.locator('#login-error').waitFor({state:'visible'});
  assert.match(await page.locator('#login-error').innerText(),/口令未通过验证/);
  checked('登录错误显示中文反馈');
  await page.locator('#login-token').fill(config.accessToken);
  await page.locator('#login-submit').click();
  await page.locator('#workspace').waitFor({state:'visible'});
  await page.waitForFunction(()=>document.getElementById('stat-total').textContent==='2');
  await page.locator('.article-card').nth(1).waitFor();
  const cookies=await context.cookies(); assert.equal(cookies.find(c=>c.name==='fde_session').httpOnly,true);
  assert.equal(await page.evaluate(()=>localStorage.length+sessionStorage.length),0);
  checked('登录成功，HttpOnly 会话且浏览器存储无口令');
  await page.screenshot({path:`${outputDir}/desktop-library.png`,fullPage:true});
  await page.locator('#filter-editorial').selectOption('shortlisted');
  await page.waitForFunction(()=>document.querySelectorAll('.article-card').length===1);
  assert.match(await page.locator('.article-card').innerText(),/2026\.11\.01/);
  checked('选题筛选与纯日期在负时区下不前移');
  await page.getByRole('button',{name:'界面样例：售后知识检索试点',exact:true}).click();
  await page.locator('#personal-notes').waitFor({state:'visible'});
  assert.match(await page.locator('#detail-content').innerText(),/业务问题/);
  assert.match(await page.locator('#detail-content').innerText(),/原文证据/);
  assert.match(await page.locator('#detail-content').innerText(),/以下是编辑建议/);
  const note='界面测试笔记：先核对试点范围，再决定是否形成正式选题。';
  await page.locator('#personal-notes').fill(note);
  await page.locator('#save-notes').click();
  await page.waitForFunction(()=>document.getElementById('notes-state').textContent==='笔记已保存');
  assert.equal(store.getArticle(fixture.id).personalNotes,note);
  await page.locator('#detail-editorial').selectOption('drafting');
  await page.waitForFunction(()=>document.getElementById('detail-editorial').disabled===false);
  assert.equal(store.getArticle(fixture.id).editorialStatus,'drafting');
  const downloadPromise=page.waitForEvent('download');
  await page.getByRole('button',{name:'导出 Markdown',exact:true}).click();
  const download=await downloadPromise; await download.saveAs(`${outputDir}/fixture-export.md`);
  assert.match(readFileSync(`${outputDir}/fixture-export.md`,'utf8'),/界面测试笔记/);
  checked('详情区分事实与建议，笔记和进度持久化，Markdown 下载包含笔记');
  await page.screenshot({path:`${outputDir}/desktop-detail.png`,fullPage:true});
  await page.locator('#close-detail').click();
  await page.locator('#clear-filters').click();
  await page.locator('#search').fill('不存在的验收关键词');
  await page.waitForFunction(()=>document.getElementById('result-count').textContent==='找到 0 篇资料');
  assert.match(await page.locator('#article-list').innerText(),/没有符合条件/);
  await page.locator('#clear-filters').click();
  checked('无结果筛选有清晰空状态并能重置');
  await page.locator('#open-import').click();
  await page.locator('#import-url').fill('https://example.org/fde-ui-import');
  await page.locator('#import-heading').fill('界面样例：手动导入的实施经验');
  await page.locator('#import-body').fill(sampleBody);
  await page.locator('#import-submit').click();
  await page.locator('#import-dialog').waitFor({state:'hidden'});
  await page.waitForFunction(()=>document.getElementById('detail-title')?.textContent==='界面样例：手动导入的实施经验');
  assert.equal(store.findUrl('https://example.org/fde-ui-import').body,sampleBody);
  assert.equal(await page.locator('#detail-dialog').getByRole('button',{name:'加入分析队列',exact:true}).isDisabled(),true);
  assert.equal(await page.getByRole('button',{name:'导出 Markdown',exact:true}).isDisabled(),true);
  assert.equal(store.db.prepare('SELECT count(*) n FROM attempts').get().n,0);
  checked('粘贴正文可手动入库，模型关闭时不触发请求且未分析导出禁用');
  await page.locator('#close-detail').click();
  await page.locator('#tab-sources').click();
  await page.locator('.source-card').first().waitFor();
  assert.equal(await page.locator('#collect-now').isDisabled(),true);
  assert.ok((await page.locator('.source-card').count())>0);
  const manual=page.locator('.source-card').filter({hasText:'Datawhale FDE100'});
  assert.match(await manual.innerText(),/人工阅读/);
  assert.equal(await manual.locator('input').count(),0);
  assert.equal(await page.locator('.source-card').filter({hasText:'美团技术团队'}).getByRole('link',{name:'打开来源'}).getAttribute('href'),'https://tech.meituan.com/');
  const firstSource=page.locator('.source-card').filter({hasText:'美团技术团队'}).getByRole('switch');
  const disabledResponse = page.waitForResponse(r => r.url().endsWith('/api/sources/meituan-engineering') && r.request().method() === 'POST' && r.status() === 200);
  await firstSource.uncheck();
  await disabledResponse;
  await page.locator('.source-card').filter({hasText:'美团技术团队'}).getByText('已停用',{exact:true}).waitFor();
  assert.equal(store.sources().find(s=>s.id==='meituan-engineering').enabled,false);
  const enabledResponse = page.waitForResponse(r => r.url().endsWith('/api/sources/meituan-engineering') && r.request().method() === 'POST' && r.status() === 200);
  await page.locator('.source-card').filter({hasText:'美团技术团队'}).getByRole('switch').check();
  await enabledResponse;
  await page.locator('.source-card').filter({hasText:'美团技术团队'}).getByText('已启用',{exact:true}).waitFor();
  assert.equal(store.sources().find(s=>s.id==='meituan-engineering').enabled,true);
  checked('来源可启停并恢复，人工阅读入口明确，采集关闭按钮禁用');
  await page.locator('#tab-usage').click();
  await page.locator('.usage-card').first().waitFor();
  assert.match(await page.locator('#usage-content').innerText(),/金额未知/);
  assert.match(await page.locator('#usage-content').innerText(),/单位为 token/);
  assert.match(await page.locator('#usage-content').innerText(),/API/);
  await page.screenshot({path:`${outputDir}/desktop-usage.png`,fullPage:true});
  checked('用量显示未知金额，次数和 token 不冒充美元');
  await page.setViewportSize({width:390,height:844});
  await page.locator('#tab-library').click();
  await page.locator('.article-card').first().waitFor();
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  await page.screenshot({path:`${outputDir}/mobile-library.png`,fullPage:true});
  await page.getByRole('button',{name:'界面样例：售后知识检索试点',exact:true}).click();
  await page.locator('#personal-notes').waitFor();
  assert.equal(await page.locator('#personal-notes').inputValue(),note);
  assert.equal(await page.locator('#detail-dialog').evaluate(el=>el.scrollWidth<=innerWidth),true);
  await page.screenshot({path:`${outputDir}/mobile-detail.png`,fullPage:true});
  await page.locator('#close-detail').click();
  await page.locator('#logout').click();
  await page.locator('#login-screen').waitFor();
  await page.screenshot({path:`${outputDir}/mobile-login.png`,fullPage:true});
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  checked('390 像素窄屏无横向溢出，保存内容重开仍在，退出可回登录');
  assert.deepEqual(pageErrors,[]);
  assert.deepEqual(externalRequests, []);
  assert.equal(store.db.prepare('SELECT count(*) n FROM attempts').get().n, 0);
  checked('整个流程没有未捕获的脚本异常、外部页面请求或模型尝试');
  report.status = 'passed';
  report.phase = 'completed';
  report.browserValidationCompleted = true;
  report.modelRequests = 0;
} catch (error) {
  report.status = 'failed';
  report.error = { name: error?.name || 'Error', message: String(error?.message || error) };
  console.error(`FAIL ${report.phase}: ${String(error?.message || error).split('\n').slice(0, 8).join('\n')}`);
  process.exitCode = 1;
} finally {
  const cleanup = async (key, fn) => {
    try { await fn(); report.cleanup[key] = true; }
    catch (error) {
      report.cleanup[key] = false;
      report.cleanupErrors ||= [];
      report.cleanupErrors.push({ step: key, message: String(error?.message || error) });
      report.status = 'failed'; process.exitCode = 1;
    }
  };
  if (store) {
    try { report.modelRequests = store.db.prepare('SELECT count(*) n FROM attempts').get().n; }
    catch { /* Preserve the original failure if storage could not be opened. */ }
  }
  if (browser) await cleanup('browserClosed', () => browser.close());
  if (worker) await cleanup('workerStopped', () => worker.stop());
  if (server?.listening) await cleanup('serverStopped', () => new Promise((resolve, reject) => {
    server.close(error => error ? reject(error) : resolve());
    server.closeAllConnections();
  }));
  if (store) await cleanup('storeClosed', () => store.close());
  // This path was created by this invocation and can never be a configured production data directory.
  if (dataDir && report.cleanup.storeClosed !== false) await cleanup('temporaryDatabaseRemoved', () => rmSync(dataDir, { recursive: true, force: true }));
  report.finishedAt = new Date().toISOString();
  writeFileSync(join(outputDir, 'ui-results.json'), JSON.stringify(report, null, 2));
  console.log(`报告目录：${outputDir}`);
}
