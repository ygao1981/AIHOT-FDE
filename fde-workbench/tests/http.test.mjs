import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:net';
import { once } from 'node:events';
import { createApp } from '../src/server.mjs';
import { Worker } from '../src/worker.mjs';
import { fixture,add,output,body } from './helpers.mjs';

async function app(t,overrides={}) {
  const ctx=fixture(t,overrides),reservation=createServer();reservation.listen(0,'127.0.0.1');await once(reservation,'listening');
  ctx.config.port=reservation.address().port;ctx.config.baseUrl=`http://127.0.0.1:${ctx.config.port}`;await new Promise(r=>reservation.close(r));
  ctx.calls=0;ctx.worker=new Worker(ctx.store,ctx.config,{analyzer:async()=>{ctx.calls++;return output();}});
  const server=createApp(ctx.store,ctx.worker,ctx.config);server.listen(ctx.config.port,'127.0.0.1');await once(server,'listening');
  t.after(()=>new Promise(r=>server.close(r)));
  ctx.request=(path,options={})=>fetch(ctx.config.baseUrl+path,{...options,headers:{...(options.body?{'Content-Type':'application/json',Origin:ctx.config.baseUrl}:{}),...options.headers}});
  return ctx;
}
test('private APIs require login; health contains no credentials; session uses HttpOnly',async t=>{
  const ctx=await app(t);assert.equal((await ctx.request('/api/articles')).status,401);
  assert.deepEqual(await(await ctx.request('/api/health')).json(),{ok:true,version:'2.0.0'});
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
