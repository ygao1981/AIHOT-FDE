// DOM behavior checks only. Browser layout, iframe CSP and PNG/clipboard are tested in qa/.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createContext, runInContext } from 'node:vm';
import { parseHTML } from 'linkedom';

function sample(id='draft-one',status='ready') {
  return {id,status,revision:1,createdAt:'2026-11-23T00:00:00Z',updatedAt:'2026-11-23T00:00:00Z',
    spec:{mode:'template',format:'article',angle:'测试写作角度'},sources:[{id:1,articleId:'article-old',title:'虚构素材',url:'https://example.org/source',sourceName:'测试',analysis:{evidence:[{quote:'虚构引文'}],limitations:[]}}],
    result:status==='ready'?{title:'虚构稿件 <img src=x onerror=bad()>',lead:{text:'虚构开篇。',kind:'source',sources:[1]},sections:[{heading:'虚构小节',paragraphs:[{text:'虚构分析。',kind:'interpretation',sources:[1]}]}],takeaways:[{text:'测试要点',sources:[1]}],caveats:[]}:null};
}
async function ui(t,{initial='draft-one',drafts=[sample()],sourceText}={}) {
  const {window,document}=parseHTML(readFileSync(new URL('../public/editorial.html',import.meta.url),'utf8'));
  Object.defineProperty(window.HTMLSelectElement.prototype,'value',{configurable:true,get(){return this.querySelector('option[selected]')?.value||this.querySelector('option')?.value||'';},set(value){for(const option of this.querySelectorAll('option'))option.toggleAttribute('selected',option.value===value);}});
  window.confirm=()=>true;
  const timers=new Set(),requests=[],server=new Map(drafts.map(d=>[d.id,structuredClone(d)]));
  const ctx={document,window,server,requests,gate:null,copied:[],downloads:[]};
  const article={id:'article-old',title:'不在首屏的目标资料',status:'analyzed',editorialStatus:'new',analysis:{relevance:'relevant',title:'不在首屏的目标资料'},publishedAt:null};
  const overview={usage:{attempts24h:5,analysisAttempts24h:5,editorialAttempts24h:0},config:{provider:'off',analysisEnabled:false,dailyLimit:5},paused:null};
  const fetch=async(path,options={})=>{
    const method=options.method||'GET';requests.push({path,method});
    if(ctx.gate)await ctx.gate(path,method);
    if(path==='/api/overview')return Response.json(overview);
    if(path.startsWith('/api/articles?'))return Response.json({items:[],total:90});
    if(path==='/api/articles/article-old')return Response.json(article);
    if(path==='/api/editorial'&&method==='GET')return Response.json({items:[...server.values()],profile:{brand:'测试品牌'}});
    if(path==='/api/editorial'&&method==='POST'){const draft=sample('draft-created');server.set(draft.id,draft);return Response.json({draft,cached:false});}
    const match=/^\/api\/editorial\/([^/?]+)(?:\/(retry|render))?/.exec(path);
    if(match){const [,id,action]=match,draft=server.get(id);if(!draft)return Response.json({error:{code:'not_found',message:'没有找到草稿'}},{status:404});
      if(action==='retry'){draft.status='queued';draft.revision++;return Response.json({draft});}
      if(action==='render')return Response.json({variant:new URL(path,'http://127.0.0.1').searchParams.get('variant')});
      if(method==='PATCH'){const body=JSON.parse(options.body);if(body.revision!==draft.revision)return Response.json({error:{code:'revision_conflict',message:'草稿已更新'}},{status:409});draft.result=body.result;draft.revision++;}
      return Response.json({draft});
    }
    throw new Error(`Unexpected mock request ${method} ${path}`);
  };
  const context=createContext({window,document,Node:window.Node,URL,URLSearchParams,AbortController,Intl,Date,Response,fetch,
    location:{search:`?article=article-old${initial?`&draft=${initial}`:''}`},history:{replaceState(){}},console,
    setTimeout(callback,delay){const timer=setTimeout(()=>{timers.delete(timer);callback();},delay);timer.unref();timers.add(timer);return timer;},clearTimeout(timer){clearTimeout(timer);timers.delete(timer);},setInterval(){},
    downloadEditorialPackage:async(...items)=>{ctx.downloads.push(items);return {files:6};},copyEditorialText:async item=>{ctx.copied.push(item);return {format:'html'};}});
  t.after(()=>{for(const timer of timers)clearTimeout(timer);});
  // Git may check the browser module out with CRLF on Windows. Normalize before adapting it for this DOM-only VM.
  const source=(sourceText??readFileSync(new URL('../public/editorial.js',import.meta.url),'utf8'))
    .replace(/\r\n?/g,'\n').replace(/^import .*?;\n/,'').replace(/await boot\(\);\s*$/,'boot();');
  await runInContext(source,context);ctx.run=code=>runInContext(code,context);
  ctx.input=value=>{const element=document.getElementById('edit-title');element.value=value;element.dispatchEvent(new window.Event('input'));};
  ctx.delay=(target,method='GET')=>{let release;const pending=new Promise(resolve=>{release=resolve;});ctx.gate=async(path,m)=>{if(path===target&&m===method)await pending;};return()=>{ctx.gate=null;release();};};
  return ctx;
}
test('editorial preselects a linked older source, renders untrusted titles as text and preserves unsaved edits on refresh/conflict',async t=>{
  const ctx=await ui(t);
  assert.match(ctx.document.getElementById('selected-sources').textContent,/不在首屏的目标资料/);
  assert.equal(ctx.document.querySelectorAll('img[src="x"]').length,0);
  assert.equal(ctx.document.getElementById('create-model').disabled,true);
  assert.equal(ctx.document.getElementById('create-template').disabled,false);
  ctx.input('未保存的自己的判断');
  ctx.server.get('draft-one').revision++;
  await ctx.run('refresh()');
  assert.equal(ctx.document.getElementById('edit-title').value,'未保存的自己的判断');
  assert.match(ctx.document.getElementById('edit-state').textContent,/另一页面有更新/);
  await ctx.run('saveDraft()');
  assert.equal(ctx.document.getElementById('edit-title').value,'未保存的自己的判断');
  assert.match(ctx.document.getElementById('workspace-error-text').textContent,/另一页面已保存/);
  assert.equal(ctx.document.getElementById('download-draft').disabled,true);
});
test('edits typed while opening or creating a draft cannot be overwritten by its delayed response',async t=>{
  const ctx=await ui(t,{drafts:[sample(),sample('draft-two')]});
  let release=ctx.delay('/api/editorial/draft-two');const opening=ctx.run("openDraft('draft-two')");
  ctx.input('读取其他草稿时继续输入');release();await opening;
  assert.equal(ctx.run('state.current.id'),'draft-one');
  assert.equal(ctx.document.getElementById('edit-title').value,'读取其他草稿时继续输入');
  release=ctx.delay('/api/editorial','POST');const creating=ctx.run("createDraft('template')");
  ctx.input('创建任务时继续输入');release();await creating;
  assert.ok(ctx.server.has('draft-created'));
  assert.equal(ctx.run('state.current.id'),'draft-one');
  assert.equal(ctx.document.getElementById('edit-title').value,'创建任务时继续输入');
});
test('delayed retry cannot replace another open draft, and saving keeps typing made after submission',async t=>{
  const ctx=await ui(t,{initial:'draft-unknown',drafts:[sample('draft-unknown','unknown'),sample('draft-two')]});
  let release=ctx.delay('/api/editorial/draft-unknown/retry','POST');const retrying=ctx.run('retryDraft()');
  await ctx.run("openDraft('draft-two')");ctx.input('不要被重试任务覆盖');release();await retrying;
  assert.equal(ctx.run('state.current.id'),'draft-two');assert.equal(ctx.document.getElementById('edit-title').value,'不要被重试任务覆盖');
  release=ctx.delay('/api/editorial/draft-two','PATCH');const saving=ctx.run('saveDraft()');
  ctx.input('保存期间又补充了一句');release();await saving;
  assert.equal(ctx.server.get('draft-two').result.title,'不要被重试任务覆盖');
  assert.equal(ctx.document.getElementById('edit-title').value,'保存期间又补充了一句');
  assert.equal(ctx.run('state.dirty'),true);assert.equal(ctx.run('state.current.revision'),2);
});
test('copy requests text layout and a package requests both layouts without a model mutation',async t=>{
  const ctx=await ui(t);
  ctx.document.getElementById('preview-variant').value='illustrated';
  const before=ctx.requests.length;await ctx.run('copyDraft()');await ctx.run('exportDraft()');
  assert.equal(ctx.copied[0].variant,'text');
  assert.deepEqual(ctx.downloads[0].map(item=>item.variant),['illustrated','text']);
  assert.ok(ctx.requests.slice(before).every(request=>request.method==='GET'));
});
test('a Windows CRLF checkout boots the editorial UI and saves an edit without model requests',async t=>{
  const sourceText=readFileSync(new URL('../public/editorial.js',import.meta.url),'utf8').replace(/\r\n?/g,'\n').replace(/\n/g,'\r\n');
  const ctx=await ui(t,{sourceText});
  assert.equal(ctx.document.getElementById('editorial-workspace').hidden,false);
  assert.equal(ctx.run('state.current.id'),'draft-one');
  ctx.input('Windows 换行下保存的虚构草稿');await ctx.run('saveDraft()');
  assert.equal(ctx.server.get('draft-one').result.title,'Windows 换行下保存的虚构草稿');
  assert.equal(ctx.run('state.dirty'),false);
  assert.deepEqual(ctx.requests.filter(request=>request.method!=='GET'),[{path:'/api/editorial/draft-one',method:'PATCH'}]);
});
