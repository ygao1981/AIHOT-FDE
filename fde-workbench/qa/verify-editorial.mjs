// Development/CI acceptance only. Isolated fictional records, model off, no existing account or database.
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { createServer } from 'node:net';
import { once } from 'node:events';
import { isAbsolute, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { tmpdir } from 'node:os';
import { loadConfig } from '../src/config.mjs';
import { Store } from '../src/store.mjs';
import { Worker } from '../src/worker.mjs';
import { createApp } from '../src/server.mjs';

const outputParent=process.env.FDE_QA_OUTPUT_DIR?resolve(process.env.FDE_QA_OUTPUT_DIR):tmpdir();
mkdirSync(outputParent,{recursive:true});
const outputDir=mkdtempSync(join(outputParent,'fde-editorial-qa-'));
const report={status:'running',phase:'setup',passed:[],startedAt:new Date().toISOString(),outputDir,
  browserValidationCompleted:false,modelRequests:null,viewports:[{width:1440,height:1000},{width:375,height:812}],
  fixtures:'仅虚构素材和临时数据库。模型、采集关闭；不读取项目 .env、生产数据库或账号。',
  limitations:['不验证真实模型写作质量。','没有访问微信公众号后台；粘贴兼容性与手机预览仍需用户验收。'],
  cleanup:{browserClosed:true,serverStopped:true,workerStopped:true,databaseRemoved:true}};
let browser,server,worker,store,dataDir;
const checked=label=>{report.passed.push(label);console.log(`PASS ${label}`);};
function zipEntries(bytes) {
  const files=new Map();let offset=0;
  while(offset+30<=bytes.length&&bytes.readUInt32LE(offset)===0x04034b50){
    assert.equal(bytes.readUInt16LE(offset+8),0,'package entries use stored ZIP encoding');
    const size=bytes.readUInt32LE(offset+18),nameLength=bytes.readUInt16LE(offset+26),extraLength=bytes.readUInt16LE(offset+28);
    const name=bytes.subarray(offset+30,offset+30+nameLength).toString('utf8'),start=offset+30+nameLength+extraLength;
    files.set(name,bytes.subarray(start,start+size));offset=start+size;
  }
  return files;
}
async function previewReady(frame,expectedUrl,expectedTitle) {
  const deadline=Date.now()+15000;
  const bounded=async(stage,action)=>{
    const remaining=deadline-Date.now();report.previewWait={url:expectedUrl,stage};
    if(remaining<=0)throw new Error(`预览检查超过 15 秒总期限：${stage}`);
    let timer;
    try{return await Promise.race([Promise.resolve().then(action),new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error(`预览检查超过 15 秒总期限：${stage}`)),remaining);})]);}
    finally{clearTimeout(timer);}
  };
  await bounded('前台页面',()=>frame.page().bringToFront());
  await bounded('最终版式地址',()=>frame.waitForURL(expectedUrl));
  if(frame.parentFrame())await bounded('预览进入视口',async()=>{const element=await frame.frameElement();try{await element.scrollIntoViewIfNeeded();}finally{await element.dispose();}});
  const heading=frame.locator('h1');await bounded('标题可见',()=>heading.waitFor({state:'visible'}));
  assert.equal(await bounded('标题内容',()=>heading.innerText()),expectedTitle);
  await bounded('标题进入视口',()=>heading.scrollIntoViewIfNeeded());
  await bounded('字体加载',()=>frame.evaluate(()=>document.fonts.ready.then(()=>true)));
  await bounded('图片解码',()=>frame.evaluate(()=>Promise.all([...document.images].map((image,index)=>image.decode().catch(()=>{throw new Error(`第 ${index+1} 张预览图片解码失败`);}))).then(()=>true)));
  // The production preview forbids scripts. Do not depend on rAF/timer callbacks in that sandbox;
  // the following visibility checks and Playwright's bounded screenshots supply the visual evidence.
  const evidence=await bounded('实际可见尺寸',()=>frame.evaluate(()=>{
    const bounds=element=>{const {x,y,width,height}=element.getBoundingClientRect();return {x,y,width,height};};
    return {url:location.href,title:document.querySelector('h1')?.innerText,fonts:document.fonts.status,
      viewport:{width:innerWidth,height:innerHeight},heading:bounds(document.querySelector('h1')),
      images:[...document.images].map(image=>({complete:image.complete,naturalWidth:image.naturalWidth,naturalHeight:image.naturalHeight,
        bounds:bounds(image),display:getComputedStyle(image).display,visibility:getComputedStyle(image).visibility,opacity:getComputedStyle(image).opacity}))};
  }));
  assert.equal(evidence.url,expectedUrl);assert.equal(evidence.title,expectedTitle);assert.equal(evidence.fonts,'loaded');
  assert.ok(evidence.heading.width>0&&evidence.heading.height>0&&evidence.heading.y>=-1&&evidence.heading.y<evidence.viewport.height);
  assert.ok(evidence.images.length>=2);
  for(const image of evidence.images){
    assert.ok(image.complete&&image.naturalWidth>0&&image.naturalHeight>0&&image.bounds.width>0&&image.bounds.height>0);
    assert.ok(image.display!=='none'&&image.visibility==='visible'&&Number(image.opacity)>0);
  }
  report.previewWait={url:expectedUrl,stage:'completed'};
  return evidence;
}
try{
  const modulePath=process.env.FDE_QA_PLAYWRIGHT_PATH;
  if(!modulePath||!isAbsolute(modulePath))throw new Error('请设置开发用 FDE_QA_PLAYWRIGHT_PATH，参见 qa/README.md。');
  const {chromium}=await import(pathToFileURL(modulePath).href);
  const executablePath=process.env.FDE_QA_BROWSER_PATH||chromium.executablePath();
  if(!isAbsolute(executablePath)||!existsSync(executablePath))throw new Error('没有找到开发用 Chromium；不要在生产部署安装浏览器。');
  const reservation=createServer();reservation.listen(0,'127.0.0.1');await once(reservation,'listening');
  const port=reservation.address().port;await new Promise(resolve=>reservation.close(resolve));
  dataDir=mkdtempSync(join(tmpdir(),'fde-editorial-qa-db-'));report.cleanup.databaseRemoved=false;
  const config=loadConfig({FDE_PORT:String(port),FDE_BASE_URL:`http://127.0.0.1:${port}`,FDE_HOST:'127.0.0.1',
    FDE_ACCESS_TOKEN:randomBytes(32).toString('base64url'),FDE_DATA_DIR:dataDir,
    FDE_MODEL_PROVIDER:'off',FDE_ANALYSIS_ENABLED:'false',FDE_COLLECT_ENABLED:'false',FDE_AUTO_ANALYZE:'false'});
  store=new Store(dataDir,[]);
  const body='这是界面验收用的虚构材料，不是真实项目。团队先做了小范围试点。业务人员整理授权知识，工程师使用 RAG 检索并保留人工核对。没有披露生产上线或量化收益。'.repeat(5);
  const analysis={relevance:'relevant',category:'case',score:75,stage:'pilot',stageEvidence:'团队先做了小范围试点。',title:'虚构的 FDE 交付观察',
    summary:'这是界面验收用的虚构研究材料，不是真实案例。团队先整理授权知识，再做检索试点，所有结果仍需业务人员核对。',problem:'样例中的授权知识分散。',solution:'整理授权资料，进行检索试点并保留人工核对。',outcome:'虚构材料未披露生产上线或量化收益。',lessons:['先明确权限与验收条件。'],limitations:['此材料仅用于界面测试。'],
    evidence:[{quote:'团队先做了小范围试点。',claim:'虚构材料仅支持试点阶段。'}],ideas:[{title:'试点前应该准备什么',angle:'从权限与验收开始。'}]};
  let article;
  for(let i=0;i<34;i++){
    const row=store.upsertArticle({url:`https://example.org/editorial-fixture-${i}`,title:i===0?'目标源素材：虚构案例 <img src=x onerror=bad()>':`其他虚构研究材料 ${i}`,body,sourceName:'虚构测试信源',language:'zh',publishedAt:'2026-11-01'}).article;
    store.db.prepare("UPDATE articles SET status='analyzed',analysis_json=?,analysis_key=?,personal_notes=?,created_at=? WHERE id=?")
      .run(JSON.stringify({...analysis,title:row.title}),`test-research-${i}`,'仅供测试的私人笔记，不可加入稿件',i===0?'2000-01-01T00:00:00Z':new Date().toISOString(),row.id);
    if(i===0)article=store.getArticle(row.id);
  }
  worker=new Worker(store,config,{analyzer:async()=>{throw new Error('QA must never call an analyzer');},editor:async()=>{throw new Error('QA must never call an editor');}});report.cleanup.workerStopped=false;
  server=createApp(store,worker,config);server.listen(config.port,'127.0.0.1');await once(server,'listening');report.cleanup.serverStopped=false;
  report.phase='browser-launch';browser=await chromium.launch({executablePath,headless:true});report.cleanup.browserClosed=false;
  const context=await browser.newContext({viewport:{width:1440,height:1000},locale:'zh-CN',timezoneId:'Asia/Singapore',acceptDownloads:true});
  context.setDefaultTimeout(15000);
  await context.grantPermissions(['clipboard-read','clipboard-write'],{origin:config.baseUrl});
  const externalRequests=[],pageErrors=[];
  await context.route('**/*',route=>{const url=new URL(route.request().url());if(url.origin!==config.baseUrl&&!['data:','blob:'].includes(url.protocol)){externalRequests.push(url.href);return route.abort();}return route.continue();});
  const page=await context.newPage();page.setDefaultTimeout(15000);page.on('pageerror',error=>pageErrors.push(error.message));
  report.phase='editorial-page';
  await page.goto(`${config.baseUrl}/editorial.html?article=${article.id}`);
  await page.locator('#login-screen').waitFor({state:'visible'});
  await page.locator('#login-token').fill('fictional-wrong-token');await page.locator('#login-submit').click();
  await page.locator('#login-error').waitFor({state:'visible'});assert.match(await page.locator('#login-error').innerText(),/访问口令不正确/);
  await page.locator('#login-token').fill(config.accessToken);await page.locator('#login-submit').click();
  await page.locator('#editorial-workspace').waitFor({state:'visible'});
  await page.waitForFunction(()=>document.querySelectorAll('#source-choices .source-choice').length===30&&document.querySelectorAll('#selected-sources .selected-source').length===1);
  assert.match(await page.locator('#selected-sources').innerText(),/目标源素材/);
  assert.doesNotMatch(await page.locator('#source-choices').innerText(),/目标源素材/);
  assert.equal(await page.locator('img[src=x]').count(),0);
  assert.equal(await page.locator('#create-model').isDisabled(),true);assert.equal(await page.locator('#create-template').isEnabled(),true);
  assert.equal(await page.evaluate(()=>localStorage.length+sessionStorage.length),0);
  checked('登录、中文错误、旧资料链接预选、模型关闭时素材稿可用，标题按文字显示');
  await page.locator('#source-search').fill('目标源素材');
  await Promise.all([page.waitForResponse(r=>r.request().method()==='GET'&&r.url().includes('/api/articles?')&&r.status()===200),page.locator('#source-search-form button').click()]);
  await page.waitForFunction(()=>document.querySelectorAll('#source-choices .source-choice').length===1&&document.getElementById('source-choices').textContent.includes('目标源素材'));
  await page.locator('#draft-angle').fill('从试点边界看 FDE 的交付责任。');
  await page.locator('#create-template').click();await page.locator('#edit-title').waitFor({state:'visible'});
  await page.frameLocator('#draft-preview').locator('h1').waitFor();
  const draft=store.listEditorial()[0];assert.equal(draft.spec.mode,'template');assert.equal(draft.status,'ready');
  assert.doesNotMatch(JSON.stringify(draft),/仅供测试的私人笔记/);
  checked('搜索不限于首屏；零模型素材稿生成、保存并加载隔离预览');
  await page.locator('#edit-title').fill('未保存的测试判断');
  await Promise.all([page.waitForResponse(r=>r.request().method()==='GET'&&r.url().endsWith(`/api/editorial/${draft.id}`)),page.locator('#refresh-all').click()]);
  assert.equal(await page.locator('#edit-title').inputValue(),'未保存的测试判断');assert.equal(await page.locator('#download-draft').isDisabled(),true);
  const externalEdit=structuredClone(store.getEditorial(draft.id).result);externalEdit.title='另一页面保存的虚构稿件';
  store.editEditorial(draft.id,externalEdit,store.getEditorial(draft.id).revision);
  await page.locator('#save-draft').click();await page.locator('#workspace-error').waitFor({state:'visible'});
  assert.match(await page.locator('#workspace-error-text').innerText(),/另一页面已保存/);assert.equal(await page.locator('#edit-title').inputValue(),'未保存的测试判断');
  page.once('dialog',dialog=>dialog.accept());await page.locator('#reload-draft').click();
  await page.waitForFunction(()=>document.getElementById('edit-title').value==='另一页面保存的虚构稿件');
  await page.locator('#edit-title').fill(' ');await page.locator('#save-draft').click();
  await page.waitForFunction(()=>document.getElementById('workspace-error-text').textContent.includes('空白'));
  await page.locator('#edit-title').fill('FDE 交付观察：先把试点边界说清楚');await page.locator('#save-draft').click();
  await page.waitForFunction(()=>document.getElementById('edit-state').textContent==='已保存'&&document.getElementById('save-draft').disabled);
  assert.equal(store.getEditorial(draft.id).result.title,'FDE 交付观察：先把试点边界说清楚');
  checked('刷新不覆盖未保存输入；版本冲突保留编辑；空白内容给中文错误；修订保存成功');
  const previewUrl=`${config.baseUrl}/api/editorial/${draft.id}/preview?${new URLSearchParams({variant:'illustrated',theme:'ink',revision:String(store.getEditorial(draft.id).revision)})}`;
  await page.locator('#preview-variant').selectOption('illustrated');
  const [previewFrame,previewResponse]=await Promise.all([
    page.waitForEvent('framenavigated',{predicate:frame=>frame.parentFrame()===page.mainFrame()&&frame.url()===previewUrl}),
    page.waitForResponse(response=>response.url()===previewUrl&&response.request().method()==='GET'),
    page.locator('#preview-theme').selectOption('ink'),
  ]);
  assert.equal(previewResponse.status(),200);await previewResponse.finished();
  assert.equal(await page.locator('#draft-preview').getAttribute('src'),new URL(previewUrl).pathname+new URL(previewUrl).search);
  await page.locator('#draft-preview').scrollIntoViewIfNeeded();
  report.previewEvidence={embedded:await previewReady(previewFrame,previewUrl,'FDE 交付观察：先把试点边界说清楚')};
  assert.equal(await previewFrame.locator('script').count(),0);
  await page.screenshot({path:join(outputDir,'desktop-editorial.png'),fullPage:true,timeout:15000});
  await page.screenshot({path:join(outputDir,'desktop-editorial-viewport.png'),fullPage:false,timeout:15000});
  // A top-level capture avoids depending on full-page capture of an out-of-process iframe.
  const standalonePreview=await context.newPage();standalonePreview.on('pageerror',error=>pageErrors.push(error.message));
  await standalonePreview.setViewportSize({width:760,height:1000});
  await standalonePreview.goto(previewUrl,{waitUntil:'load'});
  report.previewEvidence.standalone=await previewReady(standalonePreview.mainFrame(),previewUrl,'FDE 交付观察：先把试点边界说清楚');
  await standalonePreview.screenshot({path:join(outputDir,'desktop-preview.png'),fullPage:true,timeout:15000});
  await standalonePreview.close();
  await page.bringToFront();
  report.previewEvidence.screenshots=['desktop-editorial-viewport.png','desktop-preview.png'];
  await page.locator('#copy-draft').click();
  await page.waitForFunction(()=>document.getElementById('toast').textContent.includes('已复制'));
  assert.match(await page.evaluate(()=>navigator.clipboard.readText()),/FDE 交付观察/);
  const downloadPromise=page.waitForEvent('download');await page.locator('#download-draft').click();
  const download=await downloadPromise,zipPath=join(outputDir,'fictional-editorial-package.zip');await download.saveAs(zipPath);
  const files=zipEntries(readFileSync(zipPath));
  for(const name of ['article.txt','article.md','wechat-text.html','wechat-illustrated.html','manifest.json','images/cover.png'])assert.ok(files.has(name),name);
  assert.match(files.get('article.txt').toString('utf8'),/FDE 交付观察/);
  assert.doesNotMatch(files.get('article.txt').toString('utf8'),/仅供测试的私人笔记/);
  assert.equal(files.get('images/cover.png').subarray(0,8).toString('hex'),'89504e470d0a1a0a');
  checked('图文预览、文字版剪贴板和含两版 HTML 与 PNG 的下载包可用');
  await page.setViewportSize({width:375,height:812});
  await page.locator('#active-draft').scrollIntoViewIfNeeded();
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  const bounds=await page.locator('#draft-preview').boundingBox();assert.ok(bounds.width<=375&&bounds.x>=-1&&bounds.x+bounds.width<=376);
  await page.screenshot({path:join(outputDir,'mobile-editorial.png'),fullPage:true,timeout:15000});
  await page.locator('#draft-preview').scrollIntoViewIfNeeded();
  report.previewEvidence.mobile=await previewReady(previewFrame,previewUrl,'FDE 交付观察：先把试点边界说清楚');
  await page.screenshot({path:join(outputDir,'mobile-preview-viewport.png'),fullPage:false,timeout:15000});
  await page.reload();await page.locator('#edit-title').waitFor();
  assert.equal(await page.locator('#edit-title').inputValue(),'FDE 交付观察：先把试点边界说清楚');
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  assert.equal(store.db.prepare('SELECT count(*) n FROM attempts').get().n,0);
  assert.deepEqual(pageErrors,[]);assert.deepEqual(externalRequests,[]);
  checked('375 像素无横向溢出；重载保留稿件；无外部请求、脚本异常或模型任务');
  report.browserValidationCompleted=true;report.status='passed';report.phase='completed';
}catch(error){report.status='failed';report.error={name:error?.name||'Error',message:String(error?.message||error)};process.exitCode=1;console.error(`FAIL ${report.phase}: ${report.error.message.split('\n').slice(0,8).join('\n')}`);}
finally{
  const cleanup=async(key,action)=>{try{await action();report.cleanup[key]=true;}catch(error){report.cleanup[key]=false;report.cleanupErrors||=[];report.cleanupErrors.push({step:key,message:String(error.message||error)});report.status='failed';process.exitCode=1;}};
  if(store)try{report.modelRequests=store.db.prepare('SELECT count(*) n FROM attempts').get().n;}catch{}
  if(browser)await cleanup('browserClosed',()=>browser.close());
  if(worker)await cleanup('workerStopped',()=>worker.stop());
  if(server?.listening)await cleanup('serverStopped',()=>new Promise((resolve,reject)=>server.close(error=>error?reject(error):resolve())));
  if(store)await cleanup('databaseRemoved',()=>{store.close();rmSync(dataDir,{recursive:true,force:true});});
  report.finishedAt=new Date().toISOString();writeFileSync(join(outputDir,'editorial-results.json'),JSON.stringify(report,null,2));console.log(`报告目录：${outputDir}`);
}
