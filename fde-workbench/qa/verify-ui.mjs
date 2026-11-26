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
import { Discovery } from '../src/discovery.mjs';

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
  const pendingTitle='界面样例：待研究的 AI 交付教程';
  const pending=store.upsertArticle({url:'https://example.org/fde-ui-pending',title:pendingTitle,sourceName:'界面验收样例（虚构）',language:'en',
    body:'The fictional AI delivery pilot gave the support team a local search tool. Reviewers checked output against the authorized source before using it. This sample has no measured outcomes.',status:'candidate'}).article;
  worker = new Worker(store, config, {collector:async()=>({added:0,failed:0})});
  report.cleanup.workerStopped = false;
  const original='https://example.org/engineering-original';
  const discovery=new Discovery(store,config,{fetcher:async value=>{
    const upstream=new URL(value);
    if(upstream.hostname==='hn.algolia.com')return {text:JSON.stringify({nbHits:1,nbPages:1,
      hits:[{objectID:'12345678',title:'Fictional AI evaluation tutorial',url:original,points:17,num_comments:2,
        created_at:new Date(Date.now()-120000).toISOString()}]})};
    if(upstream.pathname==='/repos/datawhalechina/all-in-rag')return {text:JSON.stringify({
      html_url:'https://github.com/datawhalechina/all-in-rag',full_name:'datawhalechina/all-in-rag',
      description:'Fictional RAG evaluation tutorial',stargazers_count:7,
    })};
    assert.fail('unexpected discovery request');
  }});
  server = createApp(store, worker, config, {discovery});
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
  const nextArticleResponse = (expected = {}) => page.waitForResponse(response => {
    const url = new URL(response.url());
    return response.request().method() === 'GET' && response.status() === 200 && url.pathname === '/api/articles'
      && ['q', 'status', 'editorialStatus'].every(key => (url.searchParams.get(key) || '') === (expected[key] || ''));
  });
  const waitForArticleList = expected => page.waitForFunction(expected => {
    const list = document.getElementById('article-list');
    return list?.getAttribute('aria-busy') === 'false'
      && !list.querySelector('.loading-state')
      && list.querySelectorAll('.article-card').length === expected.count
      && document.getElementById('result-count')?.textContent === expected.caption
      && document.getElementById('search')?.value === (expected.q || '')
      && document.getElementById('filter-status')?.value === (expected.status || '')
      && document.getElementById('filter-editorial')?.value === (expected.editorialStatus || '');
  }, expected);
  const afterArticleAction = async (action, expected) => {
    // Listen before the action; the response must match this query, including a debounced search.
    const [response] = await Promise.all([nextArticleResponse(expected), action()]);
    await response.finished();
    // The caption can retain an earlier result while the new list is still loading.
    await waitForArticleList(expected);
  };
  await page.goto(config.baseUrl+'/#library');
  await page.locator('#login-screen').waitFor({state:'visible'});
  await page.screenshot({path:`${outputDir}/desktop-login.png`,fullPage:true});
  await page.locator('#login-token').fill('deliberately-wrong-test-token');
  await page.locator('#login-submit').click();
  await page.locator('#login-error').waitFor({state:'visible'});
  assert.match(await page.locator('#login-error').innerText(),/口令未通过验证/);
  checked('登录错误显示中文反馈');
  await page.locator('#login-token').fill(config.accessToken);
  await afterArticleAction(() => page.locator('#login-submit').click(), { count: 2, caption: '共 2 篇资料' });
  await page.locator('#workspace').waitFor({state:'visible'});
  await page.waitForFunction(()=>document.getElementById('stat-total').textContent==='2');
  const cookies=await context.cookies(); assert.equal(cookies.find(c=>c.name==='fde_session').httpOnly,true);
  assert.equal(await page.evaluate(()=>localStorage.length+sessionStorage.length),0);
  checked('登录成功，HttpOnly 会话且浏览器存储无口令');
  await page.screenshot({path:`${outputDir}/desktop-library.png`,fullPage:true});
  await afterArticleAction(() => page.locator('#filter-editorial').selectOption('shortlisted'), { editorialStatus: 'shortlisted', count: 1, caption: '找到 1 篇资料' });
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
  await page.waitForFunction(()=>document.getElementById('notes-state').textContent==='笔记已保存'
    && document.getElementById('save-notes').textContent==='保存笔记'
    && document.getElementById('article-list').getAttribute('aria-busy')==='false');
  assert.equal(store.getArticle(fixture.id).personalNotes,note);
  const editorialResponse = page.waitForResponse(r => r.url().endsWith(`/api/articles/${fixture.id}`) && r.request().method()==='PATCH' && r.status()===200);
  await page.locator('#detail-editorial').selectOption('drafting');
  await (await editorialResponse).finished();
  await page.waitForFunction(()=>document.getElementById('detail-editorial').disabled===false
    && document.getElementById('detail-editorial').value==='drafting'
    && document.getElementById('article-list').getAttribute('aria-busy')==='false');
  assert.equal(store.getArticle(fixture.id).editorialStatus,'drafting');
  const downloadPromise=page.waitForEvent('download');
  await page.getByRole('button',{name:'导出 Markdown',exact:true}).click();
  const download=await downloadPromise; await download.saveAs(`${outputDir}/fixture-export.md`);
  assert.match(readFileSync(`${outputDir}/fixture-export.md`,'utf8'),/界面测试笔记/);
  checked('详情区分事实与建议，笔记和进度持久化，Markdown 下载包含笔记');
  await page.screenshot({path:`${outputDir}/desktop-detail.png`,fullPage:false});
  await page.locator('#close-detail').click();
  await afterArticleAction(() => page.locator('#clear-filters').click(), { count: 2, caption: '共 2 篇资料' });
  await afterArticleAction(() => page.locator('#search').fill('不存在的验收关键词'), { q: '不存在的验收关键词', count: 0, caption: '找到 0 篇资料' });
  await page.locator('#article-list').getByRole('heading', { name: '暂时没有符合条件的资料', exact: true }).waitFor();
  assert.match(await page.locator('#article-list').innerText(),/没有符合条件/);
  await afterArticleAction(() => page.locator('#clear-filters').click(), { count: 2, caption: '共 2 篇资料' });
  checked('无结果筛选有清晰空状态并能重置');
  await afterArticleAction(() => page.locator('#filter-status').selectOption('candidate'), { status:'candidate', count:1, caption:'找到 1 篇资料' });
  const articleList=page.locator('#article-list');
  assert.equal(await articleList.getByRole('button',{name:'AI 分析',exact:true}).isDisabled(),true);
  await articleList.getByRole('button',{name:pendingTitle,exact:true}).click();
  await page.getByText('查看中文译文',{exact:true}).click();
  const translation=page.getByRole('button',{name:'AI 翻译成中文',exact:true});
  await translation.waitFor({state:'visible'});
  assert.equal(await translation.isDisabled(),true);
  await page.locator('#close-detail').click();
  await afterArticleAction(() => page.locator('#filter-editorial').selectOption('new'), { status:'candidate', editorialStatus:'new', count:1, caption:'找到 1 篇资料' });
  await afterArticleAction(() => articleList.getByRole('button',{name:'标为已整理',exact:true}).click(), { status:'candidate', editorialStatus:'new', count:0, caption:'找到 0 篇资料' });
  await afterArticleAction(() => page.locator('#filter-editorial').selectOption('organized'), { status:'candidate', editorialStatus:'organized', count:1, caption:'找到 1 篇资料' });
  assert.equal(store.getArticle(pending.id).editorialStatus,'organized');
  assert.equal(store.getArticle(pending.id).status,'candidate');
  await afterArticleAction(() => page.locator('#clear-filters').click(), { count:2, caption:'共 2 篇资料' });
  checked('待分析与待整理可独立筛选，标为已整理不会分析，模型关闭时英文只可查询译文状态');
  await page.locator('#open-import').click();
  await page.locator('#import-url').fill('https://example.org/fde-ui-import');
  await page.locator('#import-heading').fill('界面样例：手动导入的实施经验');
  await page.locator('#import-body').fill(sampleBody);
  await page.locator('#import-submit').click();
  await page.locator('#import-dialog').waitFor({state:'hidden'});
  await page.waitForFunction(()=>document.getElementById('detail-title')?.textContent==='界面样例：手动导入的实施经验');
  await waitForArticleList({ count: 3, caption: '共 3 篇资料' });
  assert.equal(store.findUrl('https://example.org/fde-ui-import').body,sampleBody);
  assert.equal(await page.locator('#detail-dialog').getByRole('button',{name:'AI 分析',exact:true}).isDisabled(),true);
  assert.equal(await page.getByRole('button',{name:'导出 Markdown',exact:true}).isDisabled(),true);
  assert.equal(store.db.prepare('SELECT count(*) n FROM attempts').get().n,0);
  checked('粘贴正文可手动入库，模型关闭时不触发请求且未分析导出禁用');
  await page.locator('#close-detail').click();
  const sourcesResponse = page.waitForResponse(r => new URL(r.url()).pathname==='/api/sources' && r.request().method()==='GET' && r.status()===200);
  await page.locator('#tab-sources').click();
  await (await sourcesResponse).finished();
  await page.waitForFunction(()=>document.getElementById('source-list').getAttribute('aria-busy')==='false'
    && document.querySelectorAll('#source-list .source-card').length>0);
  assert.match(await page.locator('#collection-notice').innerText(),/定时采集已关闭/);
  assert.equal(await page.locator('#collect-now').isEnabled(),true);
  assert.ok((await page.locator('.source-card').count())>0);
  const manual=page.locator('.source-card').filter({hasText:'Datawhale FDE100'});
  assert.match(await manual.innerText(),/人工阅读/);
  assert.equal(await manual.locator('input').count(),0);
  assert.equal(await page.locator('.source-card').filter({hasText:'美团技术团队'}).getByRole('link',{name:'打开来源'}).getAttribute('href'),'https://tech.meituan.com/');
  const firstSource=page.locator('.source-card').filter({hasText:'美团技术团队'}).getByRole('switch');
  const disabledResponse = page.waitForResponse(r => r.url().endsWith('/api/sources/meituan-engineering') && r.request().method() === 'POST' && r.status() === 200);
  await firstSource.uncheck();
  await (await disabledResponse).finished();
  await page.locator('.source-card').filter({hasText:'美团技术团队'}).getByText('已停用',{exact:true}).waitFor();
  assert.equal(store.sources().find(s=>s.id==='meituan-engineering').enabled,false);
  const enabledResponse = page.waitForResponse(r => r.url().endsWith('/api/sources/meituan-engineering') && r.request().method() === 'POST' && r.status() === 200);
  await page.locator('.source-card').filter({hasText:'美团技术团队'}).getByRole('switch').check();
  await (await enabledResponse).finished();
  await page.locator('.source-card').filter({hasText:'美团技术团队'}).getByText('已启用',{exact:true}).waitFor();
  assert.equal(store.sources().find(s=>s.id==='meituan-engineering').enabled,true);
  await page.locator('#collection-days').fill('14');
  await page.locator('#collection-limit').fill('12');
  await page.getByRole('button',{name:'保存采集设置'}).click();
  await page.getByText('采集设置已保存。',{exact:true}).waitFor();
  const limits=store.collectionLimits();
  assert.equal(limits.lookbackDays,14);
  assert.equal(limits.dailyLimit,12);
  const collectionResponse=page.waitForResponse(r=>new URL(r.url()).pathname==='/api/collect' && r.request().method()==='POST');
  await page.getByRole('button',{name:'检查信源更新',exact:true}).click();
  assert.equal((await collectionResponse).status(),202);
  await page.locator('.source-card').filter({hasText:'美团技术团队'}).getByText(/上次检查/).waitFor();
  checked('来源可启停，采集范围和上限可保存，定时关闭时登录用户仍可按需检查');
  const usageResponse = page.waitForResponse(r => new URL(r.url()).pathname==='/api/overview' && r.request().method()==='GET' && r.status()===200);
  await page.locator('#tab-usage').click();
  await (await usageResponse).finished();
  await page.waitForFunction(()=>document.getElementById('usage-content').getAttribute('aria-busy')==='false'
    && document.querySelectorAll('#usage-content .usage-card').length===3);
  assert.match(await page.locator('#usage-content').innerText(),/金额未知/);
  assert.match(await page.locator('#usage-content').innerText(),/单位为 token/);
  assert.match(await page.locator('#usage-content').innerText(),/API/);
  await page.screenshot({path:`${outputDir}/desktop-usage.png`,fullPage:true});
  checked('用量显示未知金额，次数和 token 不冒充美元');
  await page.locator('#tab-discovery').click();
  await page.locator('#hn-query').fill('AI evaluation');
  await page.getByRole('button',{name:'搜索 Hacker News'}).click();
  await page.getByText('Fictional AI evaluation tutorial',{exact:true}).waitFor();
  await page.getByRole('button',{name:'保存线索',exact:true}).click();
  await page.locator('#lead-list .lead-entry').waitFor();
  await page.getByRole('button',{name:'GitHub',exact:true}).click();
  await page.locator('#github-kind').selectOption('repository');
  await page.getByRole('button',{name:'检查仓库更新'}).click();
  await page.locator('#discovery-list').getByText('datawhalechina/all-in-rag',{exact:true}).waitFor();
  await page.getByRole('checkbox',{name:'定时跟踪此仓库'}).check();
  await page.getByText('已加入跟踪。定时采集当前关闭，可手动检查。',{exact:true}).waitFor();
  await page.getByRole('button',{name:'X 原生搜索'}).click();
  await page.locator('#x-author').selectOption('simonw');
  const searchLink=new URL(await page.getByRole('link',{name:'在 X 搜索'}).getAttribute('href'));
  assert.equal(searchLink.origin,'https://x.com');
  assert.match(searchLink.searchParams.get('q'),/from:simonw$/);
  await page.locator('#x-post').fill('https://x.com/fixture/status/1234567');
  await page.locator('#x-original').fill(original+'?utm_medium=fictional');
  await page.locator('#x-excerpt').fill('用于界面测试的虚构工程片段。');
  await page.getByRole('button',{name:'保存到线索池'}).click();
  await page.getByText('查看 2 条来源',{exact:true}).click();
  assert.match(await page.locator('#lead-list').innerText(),/X 帖子.*互动 未知/);
  assert.equal(await page.locator('#lead-list .lead-entry').count(),1);
  await page.locator('#topic-subscriptions > summary').click();
  await page.waitForFunction(()=>document.querySelector('#subscription-topic').options.length===10);
  await page.locator('#subscription-topic').selectOption('evals');
  await page.locator('#subscription-keyword').fill('LLM evaluation tutorial');
  await page.locator('#subscription-hours').fill('12');
  await page.locator('#subscription-save').click();
  await page.getByText('已保存主题订阅。',{exact:true}).waitFor();
  await page.locator('#subscription-run').click();
  await page.locator('#subscription-list').getByText(/获取 1 条，符合规则 1 条，新增 0 条/).waitFor();
  assert.equal(store.db.prepare('SELECT count(*) n FROM lead_mentions').get().n,2);
  checked('十个可配置订阅，保存自定义关键词、间隔并检查同一线索不重复收录');
  await page.locator('#topic-subscriptions > summary').click();
  await page.screenshot({path:`${outputDir}/desktop-discovery.png`,fullPage:true});
  await page.locator('#tab-today').click();
  const dailyLead=page.locator('.daily-entry').filter({hasText:'Fictional AI evaluation tutorial'});
  const dailyArticle=page.locator('.daily-entry').filter({hasText:'界面样例：售后知识检索试点'});
  await dailyLead.waitFor();
  assert.match(await page.locator('#daily-counts').innerText(),/新发现线索\s+1/);
  assert.match(await page.locator('#daily-runtime').innerText(),/自动分析已关闭.*5 \/ 5/);
  await dailyLead.getByText('排序依据与出处',{exact:true}).click();
  await dailyLead.getByText(/积分 17，评论 2/).waitFor();
  await dailyLead.getByText(/互动 未知，评论 未知/).waitFor();
  assert.match(await dailyArticle.innerText(),/历史资料/);
  await dailyArticle.getByRole('button',{name:'查看研究卡'}).click();
  assert.match(await page.locator('#detail-content').innerText(),/这是用于界面验收|业务问题/);
  await page.locator('#close-detail').click();
  await dailyLead.getByRole('button',{name:'收藏',exact:true}).click();
  await dailyLead.getByRole('button',{name:'已收藏',exact:true}).waitFor();
  await dailyLead.getByRole('button',{name:'已收藏',exact:true}).click();
  await dailyLead.getByRole('button',{name:'收藏',exact:true}).waitFor();
  await dailyLead.getByText('更多反馈',{exact:true}).click();
  const theory=dailyLead.getByRole('button',{name:'偏理论，暂不关注',exact:true});
  await theory.click();
  await dailyLead.locator('button[aria-pressed="true"]').filter({hasText:'偏理论'}).waitFor();
  await theory.click();
  await dailyLead.locator('button[aria-pressed="false"]').filter({hasText:'偏理论'}).waitFor();
  await page.locator('.daily-entry').filter({hasText:pendingTitle}).getByRole('button',{name:'加入公众号选题'}).click();
  await page.locator('.daily-entry').filter({hasText:pendingTitle}).getByText('已列入公众号选题',{exact:true}).waitFor();
  assert.equal(store.getArticle(pending.id).editorialStatus,'shortlisted');
  await page.locator('#research-preferences > summary').click();
  await page.locator('#pref-weight-knowledge').fill('4');
  await page.locator('#preferences-save').click();
  await page.getByText('已保存研究偏好。',{exact:true}).waitFor();
  await page.locator('#preferences-reset').click();
  await page.getByText('已恢复默认权重。',{exact:true}).waitFor();
  await page.locator('#research-preferences > summary').click();
  await page.locator('#daily-day').fill('2000-01-01');
  await page.getByText('所选日期没有新增资料或线索。',{exact:true}).waitFor();
  const dailyDownload=page.waitForEvent('download');
  await page.locator('#daily-export').click();
  const markdownDownload=await dailyDownload;
  await markdownDownload.saveAs(`${outputDir}/fixture-daily.md`);
  assert.match(readFileSync(`${outputDir}/fixture-daily.md`,'utf8'),/2000-01-01 每日研究简报/);
  await page.locator('#daily-today').click();
  await dailyLead.waitFor();
  await page.evaluate(()=>window.scrollTo(0,0));
  await page.screenshot({path:`${outputDir}/desktop-daily.png`,fullPage:true});
  await page.setViewportSize({width:390,height:844});
  await page.evaluate(()=>window.scrollTo(0,0));
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  await page.screenshot({path:`${outputDir}/mobile-daily.png`,fullPage:true});
  checked('每日看板日期、空状态、历史简报下载、原文分组与研究卡、双向反馈、选题和偏好，桌面与窄屏可操作');
  await page.locator('#tab-discovery').click();
  await page.screenshot({path:`${outputDir}/mobile-discovery.png`,fullPage:true});
  checked('发现页可按主题搜索、跟踪仓库、粘贴 X 线索并按原文合并，窄屏可操作');
  await afterArticleAction(() => page.locator('#tab-library').click(), { count: 3, caption: '共 3 篇资料' });
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  await page.screenshot({path:`${outputDir}/mobile-library.png`,fullPage:true});
  await page.getByRole('button',{name:'界面样例：售后知识检索试点',exact:true}).click();
  await page.locator('#personal-notes').waitFor();
  assert.equal(await page.locator('#personal-notes').inputValue(),note);
  assert.equal(await page.locator('#detail-dialog').evaluate(el=>el.scrollWidth<=innerWidth),true);
  const mobileDetailGeometry = await page.evaluate(() => {
    const bounds = element => {
      const { top, right, bottom, left, width, height } = element.getBoundingClientRect();
      return { top, right, bottom, left, width, height };
    };
    return {
      viewport: { width: innerWidth, height: innerHeight },
      dialog: bounds(document.getElementById('detail-dialog')),
      closeButton: bounds(document.getElementById('close-detail')),
    };
  });
  report.mobileDetailGeometry = mobileDetailGeometry;
  assert.deepEqual(mobileDetailGeometry.viewport, { width: 390, height: 844 });
  for (const [name, bounds] of Object.entries({ dialog: mobileDetailGeometry.dialog, closeButton: mobileDetailGeometry.closeButton })) {
    // Allow subpixel rounding at the viewport edge; the dialog content may scroll internally.
    assert.ok(bounds.width > 0 && bounds.height > 0 && bounds.left >= -1 && bounds.top >= -1
      && bounds.right <= 391 && bounds.bottom <= 845, `${name} must fit inside the 390 × 844 viewport`);
  }
  await page.screenshot({path:`${outputDir}/mobile-detail.png`,fullPage:false});
  await page.locator('#close-detail').click();
  await page.locator('#logout').click();
  await page.locator('#login-screen').waitFor();
  await page.screenshot({path:`${outputDir}/mobile-login.png`,fullPage:true});
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  checked('390 像素窄屏无横向溢出，详情及关闭按钮位于视口内，笔记保留且可退出');
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
