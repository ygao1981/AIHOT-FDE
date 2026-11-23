import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:net';
import { once } from 'node:events';
import { createApp } from '../src/server.mjs';
import { Worker } from '../src/worker.mjs';
import { templateEditorial } from '../src/editorial.mjs';
import { AnalysisError } from '../src/analysis.mjs';
import { fixture,add,output,body } from './helpers.mjs';

async function app(t,overrides={},deps={}) {
  const ctx=fixture(t,overrides),reservation=createServer();reservation.listen(0,'127.0.0.1');await once(reservation,'listening');
  ctx.config.port=reservation.address().port;ctx.config.baseUrl=`http://127.0.0.1:${ctx.config.port}`;await new Promise(r=>reservation.close(r));
  ctx.calls=0;ctx.editorCalls=0;ctx.worker=new Worker(ctx.store,ctx.config,{analyzer:async()=>{ctx.calls++;return output();},editor:async(c,input)=>{ctx.editorCalls++;return deps.editor?deps.editor(c,input):{...output(),result:templateEditorial(input)};}});
  const server=createApp(ctx.store,ctx.worker,ctx.config);server.listen(ctx.config.port,'127.0.0.1');await once(server,'listening');
  t.after(()=>new Promise(r=>server.close(r)));
  ctx.request=(path,options={})=>fetch(ctx.config.baseUrl+path,{...options,headers:{...(options.body?{'Content-Type':'application/json',Origin:ctx.config.baseUrl}:{}),...options.headers}});
  return ctx;
}
test('private APIs require login; health contains no credentials; session uses HttpOnly',async t=>{
  const ctx=await app(t);assert.equal((await ctx.request('/api/articles')).status,401);
  assert.deepEqual(await(await ctx.request('/api/health')).json(),{ok:true,version:'2.2.0'});
  const login=await ctx.request('/api/login',{method:'POST',body:JSON.stringify({token:ctx.config.accessToken})});
  assert.equal(login.status,200);assert.match(login.headers.get('set-cookie'),/HttpOnly/);
  const cookie=login.headers.get('set-cookie').split(';')[0];
  const overview=await(await ctx.request('/api/overview',{headers:{Cookie:cookie}})).json();assert.equal(overview.config.provider,'api');
  assert.ok(!JSON.stringify(overview).includes(ctx.config.accessToken));assert.equal(ctx.calls,0);
});
test('cross-origin mutations and incorrect tokens are rejected',async t=>{
  const ctx=await app(t);
  assert.equal((await ctx.request('/api/login',{method:'POST',body:'{"token":"wrong"}',headers:{Origin:'https://untrusted.example'}})).status,403);
  assert.equal((await ctx.request('/api/login',{method:'POST',body:'{"token":"wrong"}'})).status,401);
});
test('authenticated private reading, editorial changes and export never call a model',async t=>{
  const ctx=await app(t),a=add(ctx.store);const auth={Authorization:`Bearer ${ctx.config.accessToken}`};
  const edit=await ctx.request(`/api/articles/${a.id}`,{method:'PATCH',headers:auth,body:JSON.stringify({editorialStatus:'shortlisted',personalNotes:'用于公众号选题。'})});
  assert.equal(edit.status,200);assert.equal((await edit.json()).editorialStatus,'shortlisted');
  assert.equal((await ctx.request(`/api/articles/${a.id}`,{headers:auth})).status,200);
  assert.equal((await ctx.request(`/api/export/${a.id}`,{headers:auth})).status,404);assert.equal(ctx.calls,0);
});
test('manual pasted material stays pending and the analysis switch is enforced at HTTP boundary',async t=>{
  const ctx=await app(t,{analysisEnabled:false,provider:'off'}),auth={Authorization:`Bearer ${ctx.config.accessToken}`};
  const result=await ctx.request('/api/import',{method:'POST',headers:auth,body:JSON.stringify({url:'https://example.com/manual',title:'企业 AI 实战',body})});
  assert.equal(result.status,200);const data=await result.json();assert.equal(data.article.status,'candidate');
  const queued=await ctx.request(`/api/articles/${data.article.id}/queue`,{method:'POST',headers:auth,body:'{}'});
  assert.equal(queued.status,409);assert.equal((await queued.json()).error.code,'analysis_disabled');assert.equal(ctx.calls,0);
});
test('authenticated resume wakes queued work and cached requeue never adds another attempt',async t=>{
  const ctx=await app(t),a=add(ctx.store),auth={Authorization:`Bearer ${ctx.config.accessToken}`};
  ctx.store.setSetting('analysis_pause','test pause');
  const queue=await ctx.request(`/api/articles/${a.id}/queue`,{method:'POST',headers:auth,body:'{}'});
  assert.equal(queue.status,202);await ctx.worker.wake();assert.equal(ctx.calls,0);
  const resume=await ctx.request('/api/control',{method:'POST',headers:auth,body:'{"action":"resume"}'});
  assert.equal(resume.status,200);await ctx.worker.wake();assert.equal(ctx.calls,1);
  const repeated=await ctx.request(`/api/articles/${a.id}/queue`,{method:'POST',headers:auth,body:'{}'});
  assert.equal((await repeated.json()).cached,true);await ctx.worker.wake();
  assert.equal(ctx.calls,1);assert.equal(ctx.store.overview(ctx.config).usage.attempts24h,1);
});

function researched(store){
  const article=add(store);
  store.db.prepare("UPDATE articles SET status='analyzed',analysis_json=?,analysis_key=?,personal_notes=? WHERE id=?")
    .run(JSON.stringify(output().result),'private-fixture-research','这条私人笔记不可发给写作任务',article.id);
  return store.getArticle(article.id);
}
test('editorial reads and preview stay private; inline styles are confined to an inert preview',async t=>{
  const ctx=await app(t,{analysisEnabled:false,provider:'off'}),article=researched(ctx.store),auth={Authorization:`Bearer ${ctx.config.accessToken}`};
  const created=await ctx.request('/api/editorial',{method:'POST',headers:auth,body:JSON.stringify({articleIds:[article.id],mode:'template'})});
  assert.equal(created.status,200);const {draft}=await created.json();
  for(const path of ['/api/editorial',`/api/editorial/${draft.id}`,`/api/editorial/${draft.id}/render`,`/api/editorial/${draft.id}/preview`])assert.equal((await ctx.request(path)).status,401);
  const shell=await ctx.request('/editorial.html');assert.equal(shell.status,200);
  assert.ok(!shell.headers.get('content-security-policy').includes('unsafe-inline'));
  assert.match(shell.headers.get('content-security-policy'),/frame-src 'self'/);
  const preview=await ctx.request(`/api/editorial/${draft.id}/preview?variant=illustrated&theme=ink`,{headers:auth});
  assert.equal(preview.status,200);assert.match(preview.headers.get('content-type'),/^text\/html/);
  assert.match(preview.headers.get('content-security-policy'),/default-src 'none'/);
  assert.match(preview.headers.get('content-security-policy'),/style-src 'unsafe-inline'/);
  assert.match(preview.headers.get('content-security-policy'),/script-src 'none'/);
  assert.match(preview.headers.get('content-security-policy'),/sandbox/);
  assert.equal(preview.headers.get('x-frame-options'),'SAMEORIGIN');
  assert.doesNotMatch(await preview.text(),/<script\b|这条私人笔记/);
  assert.equal(ctx.calls+ctx.editorCalls,0);assert.equal(ctx.store.overview(ctx.config).usage.attempts24h,0);
});
test('editorial edit validates citations, preserves revisions and cached edits, and two renders cost no requests',async t=>{
  const ctx=await app(t,{analysisEnabled:false,provider:'off'}),article=researched(ctx.store),auth={Authorization:`Bearer ${ctx.config.accessToken}`};
  const payload={articleIds:[article.id],mode:'template',angle:'怎样做知识库验收'};
  const response=await ctx.request('/api/editorial',{method:'POST',headers:auth,body:JSON.stringify(payload)});
  const {draft}=await response.json(),result=structuredClone(draft.result);
  result.title='测试标题 <script>并非可执行代码</script>';
  const saved=await ctx.request(`/api/editorial/${draft.id}`,{method:'PATCH',headers:auth,body:JSON.stringify({revision:draft.revision,result})});
  assert.equal(saved.status,200);const latest=(await saved.json()).draft;assert.equal(latest.revision,draft.revision+1);
  const conflict=await ctx.request(`/api/editorial/${draft.id}`,{method:'PATCH',headers:auth,body:JSON.stringify({revision:draft.revision,result})});
  assert.equal(conflict.status,409);assert.equal((await conflict.json()).error.code,'revision_conflict');
  const invalid=structuredClone(result);invalid.lead.sources=[3];
  const rejected=await ctx.request(`/api/editorial/${draft.id}`,{method:'PATCH',headers:auth,body:JSON.stringify({revision:latest.revision,result:invalid})});
  assert.equal(rejected.status,400);
  const cached=await(await ctx.request('/api/editorial',{method:'POST',headers:auth,body:JSON.stringify(payload)})).json();
  assert.equal(cached.cached,true);assert.equal(cached.draft.result.title,result.title);
  const [text,illustrated]=await Promise.all(['text','illustrated'].map(async variant=>{
    const r=await ctx.request(`/api/editorial/${draft.id}/render?variant=${variant}`,{headers:auth});assert.equal(r.status,200);return r.json();
  }));
  assert.equal(text.plainText,illustrated.plainText);assert.doesNotMatch(text.fragment,/<script>/);
  assert.equal(text.assets.length,0);assert.ok(illustrated.assets.length>=2);
  assert.equal((await ctx.request(`/api/editorial/${draft.id}/render?variant=custom`,{headers:auth})).status,400);
  assert.equal(ctx.calls+ctx.editorCalls,0);assert.equal(ctx.store.overview(ctx.config).usage.attempts24h,0);
});
test('editorial model writes use one shared attempt and reject cross-origin mutation with a valid cookie',async t=>{
  const ctx=await app(t),article=researched(ctx.store),auth={Authorization:`Bearer ${ctx.config.accessToken}`};
  const login=await ctx.request('/api/login',{method:'POST',body:JSON.stringify({token:ctx.config.accessToken})});
  const cookie=login.headers.get('set-cookie').split(';')[0];
  const payload=JSON.stringify({articleIds:[article.id],mode:'model'});
  const denied=await ctx.request('/api/editorial',{method:'POST',body:payload,headers:{Cookie:cookie,Origin:'https://untrusted.example'}});
  assert.equal(denied.status,403);assert.equal(ctx.editorCalls,0);
  const created=await ctx.request('/api/editorial',{method:'POST',body:payload,headers:auth});assert.equal(created.status,202);
  const {draft}=await created.json();await ctx.worker.wake();
  assert.equal(ctx.editorCalls,1);assert.equal(ctx.calls,0);
  assert.equal(ctx.store.overview(ctx.config).usage.attempts24h,1);
  assert.equal(ctx.store.overview(ctx.config).usage.editorialAttempts24h,1);
  const repeated=await ctx.request('/api/editorial',{method:'POST',body:payload,headers:auth});assert.equal((await repeated.json()).cached,true);
  await ctx.request(`/api/editorial/${draft.id}/render`,{headers:auth});await ctx.request(`/api/editorial/${draft.id}/preview`,{headers:auth});
  await ctx.worker.wake();assert.equal(ctx.editorCalls,1);
});
test('unknown editorial attempts are retained and retry needs explicit extra-usage acknowledgement',async t=>{
  const ctx=await app(t,{}, {editor:async()=>{throw new AnalysisError('cli_execution');}}),article=researched(ctx.store),auth={Authorization:`Bearer ${ctx.config.accessToken}`};
  const payload=JSON.stringify({articleIds:[article.id],mode:'model'});
  const {draft}=await(await ctx.request('/api/editorial',{method:'POST',headers:auth,body:payload})).json();
  await ctx.worker.wake();assert.equal(ctx.store.getEditorial(draft.id).status,'unknown');
  assert.equal((await ctx.request(`/api/editorial/${draft.id}/retry`,{method:'POST',headers:auth,body:'{}'})).status,409);
  const duplicate=await(await ctx.request('/api/editorial',{method:'POST',headers:auth,body:payload})).json();assert.equal(duplicate.cached,true);assert.equal(duplicate.draft.status,'unknown');
  const queued=await ctx.request(`/api/editorial/${draft.id}/retry`,{method:'POST',headers:auth,body:'{"acceptExtraUsage":true}'});
  assert.equal(queued.status,202);await ctx.worker.wake();assert.equal(ctx.editorCalls,1);
  assert.equal(ctx.store.overview(ctx.config).usage.attempts24h,1);
  assert.equal(ctx.store.getEditorial(draft.id).status,'queued');assert.ok(ctx.store.setting('analysis_pause'));
});
