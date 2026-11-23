// Optional DOM-only smoke check; this does not verify browser layout, cookies or native dialogs.
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdirSync, mkdtempSync } from 'node:fs';
import { createContext, runInContext } from 'node:vm';
import { dirname, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { parseHTML } from 'linkedom';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const outputParent = process.env.FDE_QA_OUTPUT_DIR ? resolve(process.env.FDE_QA_OUTPUT_DIR) : tmpdir();
mkdirSync(outputParent, { recursive: true });
const outputDir = mkdtempSync(join(outputParent, 'fde-dom-qa-'));
const report = {
  status: 'running', passed: [], startedAt: new Date().toISOString(), outputDir,
  kind: 'dom-only', mockApiOnly: true, browserValidationCompleted: false,
  fixtures: '仅虚构界面数据；API 全部模拟，不连接模型、信源、真实服务或数据库。',
  limitations: ['不能验证真实浏览器、布局、Cookie、原生弹窗、下载或模型端到端行为。'],
};
const timers = new Set();
function trackedTimeout(callback, delay) {
  const timer = setTimeout(() => { timers.delete(timer); callback(); }, delay);
  timer.unref(); timers.add(timer); return timer;
}
function clearTrackedTimeout(timer) { clearTimeout(timer); timers.delete(timer); }
function checked(label) { report.passed.push(label); console.log(`PASS ${label}`); }
try {
  const {window,document}=parseHTML(readFileSync(`${root}/public/index.html`,'utf8'));
  // LinkeDOM does not implement these interactive browser primitives.
  Object.defineProperty(window.HTMLSelectElement.prototype,'value',{configurable:true,get(){return this.querySelector('option[selected]')?.value||this.querySelector('option')?.value||'';},set(value){for(const option of this.querySelectorAll('option'))option.toggleAttribute('selected',option.value===value);}});
  for(const d of document.querySelectorAll('dialog')){d.showModal=function(){this.open=true;};d.close=function(){this.open=false;this.dispatchEvent(new window.Event('close'));};}
  for(const f of document.querySelectorAll('form'))f.reset=function(){for(const el of this.querySelectorAll('input,textarea,select'))el.value='';};
  const a={id:'sample',url:'https://example.org/sample',title:'界面样例 <img src=x onerror=alert(1)>',sourceName:'虚构样例',language:'zh',publishedAt:'2026-11-01',status:'analyzed',editorialStatus:'shortlisted',personalNotes:'',body:'界面样例正文。'.repeat(40),bodyExcerpt:'界面样例，仅供测试。',analysis:{relevance:'relevant',category:'case',stage:'pilot',stageEvidence:'界面样例正文。',title:'界面样例 <img src=x onerror=alert(1)>',summary:'界面验收样例，不是真实案例。',problem:'示例业务问题',solution:'示例实施方法',outcome:'原文未披露量化效果',lessons:['示例经验'],limitations:['仅用于界面验证'],evidence:[{quote:'界面样例正文。',claim:'示例引用'}],ideas:[{title:'示例选题',angle:'编辑建议'}]}};
  const overview={stats:{total:1,candidate:0,queued:0,analyzed:1,shortlisted:1},usage:{attempts24h:0,inputTokens:0,outputTokens:0,monthCostUsd:0.25,monthReservedUsd:0.1,costKnown:false,cliAttemptsMonth:2},config:{provider:'off',model:'',analysisEnabled:false,collectEnabled:false,autoAnalyze:false,dailyLimit:5,monthlyBudgetUsd:10},paused:null};
  const skipped={...a,id:'filtered',url:'https://example.org/filtered',title:'界面样例：已过滤的无关资料',status:'skipped',analysis:null,personalNotes:''};
  let libraryItems=[a];
  const requests=[];
  const fetch=async(path,options={})=>{
    requests.push({path,method:options.method||'GET'});
    if(path==='/api/overview')return Response.json(overview);
    if(path.startsWith('/api/articles?'))return Response.json({items:libraryItems,total:libraryItems.length});
    if(path==='/api/articles/sample'){
      if(options.method==='PATCH')Object.assign(a,JSON.parse(options.body));
      return Response.json(a);
    }
    if(path==='/api/articles/filtered'){
      if(options.method==='PATCH')Object.assign(skipped,JSON.parse(options.body));
      return Response.json(skipped);
    }
    if(path==='/api/sources')return Response.json({items:[{id:'manual-sample',name:'人工阅读样例',url:'https://example.org/feed',homepage:'https://example.org/',kind:'manual',language:'zh',enabled:false,description:'用于人工核对的入口。'}]});
    throw new Error(`Unexpected mock request: ${path}`);
  };
  const context=createContext({window,document,Node:window.Node,URL,URLSearchParams,AbortController,Intl,Date,Response,fetch,location:{hash:'#library'},history:{replaceState(){}},setTimeout:trackedTimeout,clearTimeout:clearTrackedTimeout,setInterval(){},console});
  window.confirm=()=>true;
  await runInContext(readFileSync(`${root}/public/app.js`,'utf8'),context);
  assert.equal(document.querySelectorAll('.article-card').length,1);
  assert.equal(document.querySelectorAll('img[src="x"]').length,0);
  assert.match(document.querySelector('.article-title').textContent,/<img/);
  assert.match(document.querySelector('.article-meta').textContent,/2026\.11\.01/);
  checked('资料列表能渲染；不把标题中的 HTML 当作节点；日期保留原有日精度');
  await runInContext("openDetail('sample')",context);
  assert.match(document.querySelector('#detail-content').textContent,/业务问题/);
  assert.match(document.querySelector('#detail-content').textContent,/原文证据/);
  assert.match(document.querySelector('#detail-content').textContent,/以下是编辑建议/);
  assert.equal(document.querySelectorAll('img[src="x"]').length,0);
  const notes=document.querySelector('#personal-notes');notes.value='DOM 验收笔记';notes.dispatchEvent(new window.Event('input'));
  await runInContext('saveNotes()',context);
  assert.equal(a.personalNotes,'DOM 验收笔记');
  assert.match(document.querySelector('#notes-state').textContent,/笔记已保存/);
  assert.equal(document.querySelector('#toast').parentNode,document.querySelector('#detail-dialog'));
  checked('详情区分原文证据与编辑建议；笔记提交正确字段；提示位于弹窗内');
  await runInContext("switchView('sources')",context);
  assert.match(document.querySelector('#source-list').textContent,/人工阅读/);
  assert.equal(document.querySelector('#source-list input'),null);
  assert.equal(document.querySelector('#source-list a').getAttribute('href'),'https://example.org/');
  assert.equal(document.querySelector('#collect-now').disabled,true);
  checked('人工来源仅有阅读入口；打开首页；采集关闭时按钮不可用');
  await runInContext("switchView('usage')",context);
  assert.match(document.querySelector('#usage-content').textContent,/金额未知/);
  assert.match(document.querySelector('#usage-content').textContent,/本月另有 API 估算费用/);
  overview.config.provider='api';overview.usage.costKnown=true;
  await runInContext('loadOverview()',context);
  assert.match(document.querySelector('#usage-content').textContent,/本月 API 估算费用/);
  assert.match(document.querySelector('#usage-content').textContent,/本月 Codex 尝试 2 次/);
  assert.match(document.querySelector('#usage-content').textContent,/不含 Codex/);
  checked('未知费用不写零；API 估算明确排除历史 Codex 消耗');
  // Keep analysis enabled in the mock so this proves the skipped status blocks the action.
  overview.config.analysisEnabled=true;
  await runInContext('loadOverview()',context);
  await runInContext('closeDetail()',context);
  libraryItems=[skipped];
  await runInContext("switchView('library')",context);
  const filteredButton=[...document.querySelectorAll('.article-card button')].find(b=>b.textContent==='已被规则过滤');
  assert.ok(filteredButton);
  assert.equal(filteredButton.disabled,true);
  assert.match(filteredButton.getAttribute('title'),/未调用模型/);
  filteredButton.click();
  await runInContext("openDetail('filtered')",context);
  const filteredDetailButton=[...document.querySelectorAll('#detail-content button')].find(b=>b.textContent==='已被规则过滤');
  assert.ok(filteredDetailButton);
  assert.equal(filteredDetailButton.disabled,true);
  assert.match(document.querySelector('#detail-content').textContent,/没有调用模型/);
  const addBodyButton=[...document.querySelectorAll('#detail-content button')].find(b=>b.textContent==='补充正文');
  assert.ok(addBodyButton);
  assert.equal(addBodyButton.disabled,false);
  assert.equal(document.querySelector('#detail-content .detail-actions a').getAttribute('href'),skipped.url);
  const filteredNotes=document.querySelector('#personal-notes');
  filteredNotes.value='被过滤的样例仍可记录人工阅读笔记。';
  filteredNotes.dispatchEvent(new window.Event('input'));
  await runInContext('saveNotes()',context);
  assert.equal(skipped.personalNotes,'被过滤的样例仍可记录人工阅读笔记。');
  assert.equal(requests.some(r=>r.path.includes('/queue')),false);
  checked('已过滤资料在分析开启时仍禁止排队；阅读、补正文和保存笔记保持可用');
  assert.equal(requests.some(r=>r.path.includes('/queue')),false);
  checked('本次 DOM 验收没有模型排队请求');
  report.status = 'passed';
} catch (error) {
  report.status = 'failed';
  report.error = { name: error?.name || 'Error', message: String(error?.message || error) };
  console.error(`FAIL DOM: ${String(error?.message || error)}`);
  process.exitCode = 1;
} finally {
  for (const timer of timers) clearTimeout(timer);
  report.finishedAt = new Date().toISOString();
  writeFileSync(join(outputDir, 'dom-results.json'), JSON.stringify(report, null, 2));
  console.log(`报告目录：${outputDir}`);
}
