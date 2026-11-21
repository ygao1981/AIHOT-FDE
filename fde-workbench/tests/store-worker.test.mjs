import test from 'node:test';
import assert from 'node:assert/strict';
import { Store } from '../src/store.mjs';
import { Worker } from '../src/worker.mjs';
import { analysisKey,prepareArticle } from '../src/analysis.mjs';
import { fixture,add,output } from './helpers.mjs';
import { acquireLock } from '../src/main.mjs';
import { importArticle } from '../src/collect.mjs';

test('busy-time enqueue and repeated notifications drain promptly with one model at a time',async t=>{
  const {store,config}=fixture(t),first=Promise.withResolvers(),release=Promise.withResolvers();
  let calls=0,active=0,maximum=0;
  const worker=new Worker(store,config,{analyzer:async()=>{
    calls++;maximum=Math.max(maximum,++active);
    if(calls===1){first.resolve();await release.promise;}
    active--;return output();
  }}),a=add(store),b=add(store,2);
  try{
    worker.start();worker.enqueue(a.id);await first.promise;
    worker.enqueue(b.id);worker.enqueue(b.id);void worker.wake();
    release.resolve();await worker.wake();
    assert.equal(calls,2);assert.equal(maximum,1);
    assert.equal(store.getArticle(a.id).status,'analyzed');assert.equal(store.getArticle(b.id).status,'analyzed');
    assert.equal(store.overview(config).usage.attempts24h,2);
  }finally{release.resolve();await worker.stop();}
});
test('slow collection does not block analysis of a durable queue item',async t=>{
  const {store,config}=fixture(t,{collectEnabled:true}),release=Promise.withResolvers(),analyzed=Promise.withResolvers();
  const worker=new Worker(store,config,{collector:async()=>{await release.promise;return {added:0};},analyzer:async()=>{analyzed.resolve();return output();}});
  try{
    worker.enqueue(add(store).id);const tick=worker.tick();
    await analyzed.promise;assert.equal(worker.collecting,true);
    await tick;assert.equal(store.overview(config).usage.attempts24h,1);
  }finally{release.resolve();await worker.stop();}
});
test('a failed analysis stops the drain and resume processes only the remaining queued item',async t=>{
  const {store,config}=fixture(t);let calls=0;
  const worker=new Worker(store,config,{analyzer:async()=>{if(++calls===1)throw Object.assign(new Error('test failure'),{code:'timeout'});return output();}});
  const a=add(store),b=add(store,2);worker.enqueue(a.id);worker.enqueue(b.id);
  await worker.wake();await worker.wake();
  assert.equal(calls,1);assert.equal(store.getArticle(a.id).status,'failed');assert.equal(store.getArticle(b.id).status,'queued');
  store.setSetting('analysis_pause',null);await worker.wake();
  assert.equal(calls,2);assert.equal(store.getArticle(a.id).status,'failed');assert.equal(store.getArticle(b.id).status,'analyzed');
});
test('daily and monthly blocks end the drain without spinning or making a model request',async t=>{
  const {store,config}=fixture(t,{dailyLimit:1});let calls=0;
  const worker=new Worker(store,config,{analyzer:async()=>{calls++;return output();}});
  worker.enqueue(add(store).id);worker.enqueue(add(store,2).id);
  await worker.wake();await worker.wake();assert.equal(calls,1);
  config.dailyLimit=2;config.monthlyBudgetUsd=0.000001;
  await worker.wake();assert.equal(calls,1);assert.equal(store.overview(config).usage.attempts24h,1);
  assert.equal(store.overview(config).stats.queued,1);
});
test('automatic filling stays bounded while paused or out of daily allowance, then recovers',async t=>{
  const {store,config}=fixture(t,{autoAnalyze:true,dailyLimit:1});let calls=0;
  const worker=new Worker(store,config,{analyzer:async()=>{calls++;return output();}});
  for(let i=1;i<=4;i++)add(store,i,{backfill:false});
  store.setSetting('analysis_pause','test pause');await worker.tick();await worker.tick();
  assert.equal(store.overview(config).stats.candidate,4);assert.equal(store.overview(config).stats.queued,0);
  store.setSetting('analysis_pause',null);await worker.tick();await worker.tick();await worker.tick();
  assert.equal(calls,1);assert.equal(store.overview(config).stats.candidate,3);assert.equal(store.overview(config).stats.queued,0);
  store.db.prepare('UPDATE attempts SET started_at=?').run(new Date(Date.now()-86400001).toISOString());
  await worker.tick();assert.equal(calls,2);assert.equal(store.overview(config).stats.candidate,2);
});
test('startup consumes a persisted queue and shutdown leaves the next task queued',async t=>{
  const {store,config}=fixture(t),started=Promise.withResolvers(),release=Promise.withResolvers();let calls=0;
  const a=add(store),b=add(store,2);
  store.queue(a.id,analysisKey(prepareArticle(a),config));store.queue(b.id,analysisKey(prepareArticle(b),config));
  const worker=new Worker(store,config,{analyzer:async()=>{calls++;started.resolve();await release.promise;return output();}});
  try{
    worker.start();await started.promise;const stopping=worker.stop();release.resolve();await stopping;
    await worker.wake();assert.equal(calls,1);assert.equal(store.getArticle(b.id).status,'queued');
  }finally{release.resolve();await worker.stop();}
});
test('empty wakes and local rejections never call a model or leave a valid task stuck',async t=>{
  const {store,config}=fixture(t);let calls=0;
  const worker=new Worker(store,config,{analyzer:async()=>{calls++;return output();}});
  await worker.wake();await worker.tick();assert.equal(calls,0);
  const a=add(store,1,{title:'招聘：工程岗位'}),b=add(store,2);
  store.queue(a.id,analysisKey(prepareArticle(a),config));worker.enqueue(b.id);await worker.wake();
  assert.equal(calls,1);assert.equal(store.getArticle(a.id).status,'skipped');assert.equal(store.getArticle(b.id).status,'analyzed');
});
test('manual revision of an automatically collected article waits for explicit analysis',async t=>{
  const {store,config}=fixture(t,{autoAnalyze:true});let calls=0;
  const worker=new Worker(store,config,{analyzer:async()=>{calls++;return output();}}),a=add(store,1,{backfill:false});
  await worker.tick();assert.equal(calls,1);
  await importArticle(store,{url:a.url,title:a.title,body:a.body+'人工补充的实施记录。'},config);
  assert.equal(store.getArticle(a.id).backfill,true);
  await worker.tick();assert.equal(calls,1);assert.equal(store.getArticle(a.id).status,'candidate');
  worker.enqueue(a.id);await worker.wake();assert.equal(calls,2);
});

test('completed analysis is reused; reading and exporting never invoke the model',async t=>{
  const {store,config}=fixture(t);let calls=0;
  const worker=new Worker(store,config,{analyzer:async()=>{calls++;return output();}}),a=add(store);
  assert.equal(worker.enqueue(a.id).queued,true);await worker.analyzeOne();
  assert.equal(store.getArticle(a.id).status,'analyzed');assert.equal(worker.enqueue(a.id).cached,true);
  store.listArticles();store.exportRows();store.overview(config);await worker.analyzeOne();
  assert.equal(calls,1);assert.equal(store.overview(config).usage.attempts24h,1);
});
test('failure pauses all new analysis and preserves its budget; explicit retry consumes a new attempt',async t=>{
  const {store,config}=fixture(t);let calls=0;
  const worker=new Worker(store,config,{analyzer:async()=>{calls++;if(calls===1)throw Object.assign(new Error('private upstream error'),{code:'timeout'});return output();}});
  const a=add(store),b=add(store,2);worker.enqueue(a.id);worker.enqueue(b.id);await worker.analyzeOne();
  assert.ok(store.setting('analysis_pause'));assert.ok(store.overview(config).usage.monthReservedUsd>0);
  await worker.analyzeOne();assert.equal(calls,1);assert.throws(()=>worker.enqueue(a.id),{code:'retry_confirmation'});
  store.setSetting('analysis_pause',null);worker.enqueue(a.id,true);await worker.analyzeOne();
  assert.equal(calls,2);assert.equal(store.overview(config).usage.attempts24h,2);
});
test('daily limit counts failed attempts and changing config takes effect without a stale second budget',async t=>{
  const {store,config}=fixture(t,{dailyLimit:1});let calls=0;
  const worker=new Worker(store,config,{analyzer:async()=>{calls++;return output();}});
  const a=add(store),b=add(store,2);worker.enqueue(a.id);worker.enqueue(b.id);await worker.analyzeOne();await worker.analyzeOne();
  assert.equal(calls,1);assert.equal(store.getArticle(b.id).status,'queued');
  config.dailyLimit=2;await worker.analyzeOne();assert.equal(calls,2);
});
test('monthly reservation prevents an unaffordable request before sending',async t=>{
  const {store,config}=fixture(t,{monthlyBudgetUsd:0.000001});let calls=0;
  const worker=new Worker(store,config,{analyzer:async()=>{calls++;return output();}}),a=add(store);
  worker.enqueue(a.id);await worker.analyzeOne();assert.equal(calls,0);assert.equal(store.overview(config).usage.attempts24h,0);
  assert.equal(store.getArticle(a.id).status,'queued');
});
test('local relevance rejection does not reserve budget, count an attempt or pause other work',async t=>{
  const {store,config}=fixture(t);let calls=0;
  const worker=new Worker(store,config,{analyzer:async()=>{calls++;return output();}});
  const a=add(store,1,{title:'本周招聘公告'});
  assert.throws(()=>worker.enqueue(a.id),{code:'not_candidate'});
  // Re-check an already queued row as well, e.g. after the rules or limits change.
  store.queue(a.id,analysisKey(prepareArticle(a),config));await worker.analyzeOne();
  assert.equal(store.getArticle(a.id).status,'skipped');
  assert.equal(calls,0);assert.equal(store.overview(config).usage.attempts24h,0);
  assert.equal(store.overview(config).usage.monthReservedUsd,0);assert.ok(!store.setting('analysis_pause'));
});
test('known usage on an invalid model response is recorded instead of shown as free',t=>{
  const {store,config}=fixture(t),a=add(store),key=analysisKey(prepareArticle(a),config);
  store.queue(a.id,key);const attempt=store.beginAttempt(a.id,key,config,0.1);
  store.failAttempt(attempt,{code:'invalid_result',usage:{inputTokens:1000,outputTokens:200},costUsd:0.004,requestId:'test-request'});
  const u=store.overview(config).usage;assert.equal(u.monthCostUsd,0.004);assert.equal(u.monthReservedUsd,0);assert.equal(u.attempts24h,1);
});
test('a second startup cannot remove or replace another workbench instance lock',t=>{
  const {dir}=fixture(t);const release=acquireLock(dir);
  assert.throws(()=>acquireLock(dir),{code:'already_running'});release();
  const releaseAgain=acquireLock(dir);releaseAgain();
});
test('a different process opening the database cannot reserve while a request is running',t=>{
  const {store,config,dir}=fixture(t),a=add(store),b=add(store,2),key=analysisKey(prepareArticle(a),config);
  store.queue(a.id,key);store.beginAttempt(a.id,key,config,0.1);
  const other=new Store(dir);try{const key2=analysisKey(prepareArticle(b),config);other.queue(b.id,key2);assert.throws(()=>other.beginAttempt(b.id,key2,config,0.1),{code:'busy'});}finally{other.close();}
});
test('restart marks running requests unknown and does not automatically repeat them',t=>{
  const {store,config}=fixture(t),a=add(store),key=analysisKey(prepareArticle(a),config);
  store.queue(a.id,key);store.beginAttempt(a.id,key,config,0.1);assert.equal(store.recoverInterrupted(),1);
  assert.equal(store.getArticle(a.id).status,'failed');assert.ok(store.setting('analysis_pause'));
  assert.throws(()=>store.queue(a.id,key),{code:'retry_confirmation'});assert.equal(store.overview(config).usage.monthReservedUsd,0.1);
});
test('model changes do not silently reuse the previous model result',async t=>{
  const {store,config}=fixture(t);let calls=0;
  const worker=new Worker(store,config,{analyzer:async()=>{calls++;return output();}}),a=add(store);
  worker.enqueue(a.id);await worker.analyzeOne();config.model='different-model';
  assert.equal(worker.enqueue(a.id).queued,true);await worker.analyzeOne();assert.equal(calls,2);
});
test('a revised body cannot be overwritten by an older in-flight response',t=>{
  const {store,config}=fixture(t),a=add(store),key=analysisKey(prepareArticle(a),config);
  store.queue(a.id,key);const attempt=store.beginAttempt(a.id,key,config,0.1);
  store.upsertArticle({...a,body:a.body+'新的材料版本。'},{updateExisting:true});store.completeAttempt(attempt,output());
  assert.equal(store.getArticle(a.id).analysis,null);assert.equal(store.getArticle(a.id).status,'candidate');
  assert.equal(store.db.prepare("SELECT count(*) n FROM attempts WHERE status='completed'").get().n,1);
});
test('first-import and undated historical material is not automatically analyzed',t=>{
  const {store}=fixture(t);const a=add(store,1,{backfill:true}),b=add(store,2,{backfill:false});store.autoQueue(5);
  assert.equal(store.getArticle(a.id).status,'candidate');assert.equal(store.getArticle(b.id).status,'queued');
});
test('retention preserves personal notes, shortlist, completed results and receipts',t=>{
  const {store}=fixture(t);const old=new Date(Date.now()-100*86400000).toISOString();
  const a=add(store),b=add(store,2),c=add(store,3);store.editArticle(b.id,{editorialStatus:'shortlisted'});store.editArticle(c.id,{personalNotes:'值得以后研究。'});
  store.db.prepare('UPDATE articles SET created_at=?').run(old);assert.equal(store.retention(60),1);
  assert.equal(store.getArticle(a.id),null);assert.ok(store.getArticle(b.id));assert.ok(store.getArticle(c.id));
});
test('source synchronization never resets user enable switches',t=>{
  const {store,dir}=fixture(t);store.setSource('test-source',false);
  const other=new Store(dir,store.catalog);try{assert.equal(other.sources()[0].enabled,false);}finally{other.close();}
});
test('private notes and source metadata are searchable without treating percent as a wildcard',t=>{
  const {store}=fixture(t);const a=add(store);store.editArticle(a.id,{personalNotes:'收益率 10% 需复核'});
  assert.equal(store.listArticles({q:'10%'}).total,1);assert.equal(store.listArticles({q:'_'}).total,0);
});
