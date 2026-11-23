import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { mkdtempSync,rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Store,hashBody } from '../src/store.mjs';
import { Worker } from '../src/worker.mjs';
import { analysisKey,prepareArticle } from '../src/analysis.mjs';
import { prepareEditorial } from '../src/editorial.mjs';
import { fixture,add,output,body } from './helpers.mjs';

function researched(store,index=1){
  const article=add(store,index);
  store.db.prepare("UPDATE articles SET status='analyzed',analysis_json=?,analysis_key=? WHERE id=?").run(JSON.stringify(output().result),`fixture-research-${index}`,article.id);
  return store.getArticle(article.id);
}
function written(){return {...output(),result:{
  title:'知识库项目怎样验收',lead:{text:'这份测试案例保留了检索和人工核对环节。',kind:'source',sources:[1]},
  sections:[{heading:'把验收步骤写清楚',paragraphs:[{text:'建议先明确哪些结果需要人工确认，再设计验收方法。',kind:'suggestion',sources:[1]}]}],
  takeaways:[{text:'验收不能只看一次演示。',sources:[1]}],caveats:['原文未披露量化收益。'],
}};}
const request=(article,extra={})=>({articleIds:[article.id],angle:'从验收方式理解企业部署',format:'article',mode:'model',...extra});

test('schema 1 migrates without changing five historical receipts, three research cards or private settings',t=>{
  const directory=mkdtempSync(join(tmpdir(),'fde-legacy-editorial-'));
  t.after(()=>rmSync(directory,{recursive:true,force:true}));
  const old=new DatabaseSync(join(directory,'research.sqlite'));
  // A fixed schema-1 fixture, independent of the new migration implementation.
  old.exec(`
    CREATE TABLE articles(id TEXT PRIMARY KEY,url TEXT NOT NULL UNIQUE,title TEXT NOT NULL,source_id TEXT NOT NULL,source_name TEXT NOT NULL,
      language TEXT NOT NULL DEFAULT 'unknown',published_at TEXT,body TEXT NOT NULL DEFAULT '',body_kind TEXT NOT NULL DEFAULT 'page',body_hash TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'candidate',editorial_status TEXT NOT NULL DEFAULT 'new',personal_notes TEXT NOT NULL DEFAULT '',analysis_json TEXT,analysis_key TEXT,queue_nonce TEXT,
      backfill INTEGER NOT NULL DEFAULT 0,priority INTEGER NOT NULL DEFAULT 3,last_error TEXT,created_at TEXT NOT NULL,updated_at TEXT NOT NULL);
    CREATE INDEX articles_queue ON articles(status,priority DESC,created_at);
    CREATE TABLE source_state(id TEXT PRIMARY KEY,enabled INTEGER NOT NULL,last_checked_at TEXT,next_fetch_at TEXT,last_error TEXT,last_count INTEGER NOT NULL DEFAULT 0);
    CREATE TABLE attempts(id TEXT PRIMARY KEY,article_id TEXT NOT NULL REFERENCES articles(id),fingerprint TEXT NOT NULL,nonce TEXT NOT NULL,provider TEXT NOT NULL,model TEXT NOT NULL,
      status TEXT NOT NULL,started_at TEXT NOT NULL,finished_at TEXT,reserved_usd REAL,cost_usd REAL,input_tokens INTEGER,cached_input_tokens INTEGER,output_tokens INTEGER,reasoning_tokens INTEGER,
      result_json TEXT,error_code TEXT,request_id TEXT,UNIQUE(fingerprint,nonce));
    CREATE INDEX attempts_budget ON attempts(started_at,provider);
    CREATE TABLE settings(key TEXT PRIMARY KEY,value TEXT NOT NULL);
    PRAGMA user_version=1;
  `);
  const timestamp=new Date().toISOString();
  for(let i=1;i<=3;i++)old.prepare(`INSERT INTO articles(id,url,title,source_id,source_name,body,body_hash,status,analysis_json,analysis_key,personal_notes,created_at,updated_at)
    VALUES(?,?,?,?,?,?,?,'analyzed',?,?,?,?,?)`).run(`legacy-${i}`,`https://example.com/legacy-${i}`,`历史资料 ${i}`,'legacy','历史信源',body,hashBody(body),JSON.stringify(output().result),`legacy-analysis-${i}`,`私人笔记 ${i}`,timestamp,timestamp);
  for(let i=0;i<5;i++)old.prepare(`INSERT INTO attempts(id,article_id,fingerprint,nonce,provider,model,status,started_at,finished_at,input_tokens,output_tokens,error_code)
    VALUES(?,?,?,'','codex','fixture',?,?,?,?,?,?)`).run(`receipt-${i}`,`legacy-${i%3+1}`,`key-${i}`,i<2?'unknown':'completed',timestamp,timestamp,i<2?null:1000,i<2?null:200,i<2?'cli_execution':null);
  old.prepare('INSERT INTO settings(key,value) VALUES(?,?)').run('analysis_pause','已手动暂停。');
  old.prepare('INSERT INTO source_state(id,enabled) VALUES(?,?)').run('legacy',0);
  const before={articles:old.prepare('SELECT * FROM articles ORDER BY id').all(),attempts:old.prepare('SELECT * FROM attempts ORDER BY id').all(),
    settings:old.prepare('SELECT * FROM settings').all(),sources:old.prepare('SELECT * FROM source_state').all()};old.close();
  const store=new Store(directory);
  try{
    assert.equal(store.db.prepare('PRAGMA user_version').get().user_version,2);
    assert.deepEqual(store.db.prepare('SELECT * FROM articles ORDER BY id').all(),before.articles);
    const attempts=store.db.prepare('SELECT * FROM attempts ORDER BY id').all();
    for(let i=0;i<attempts.length;i++){
      const {kind,draft_id,...original}=attempts[i];
      assert.deepEqual({...before.attempts[i]},original);assert.equal(kind,'analysis');assert.equal(draft_id,null);
    }
    assert.deepEqual(store.db.prepare('SELECT * FROM settings').all(),before.settings);
    assert.deepEqual(store.db.prepare('SELECT * FROM source_state').all(),before.sources);
    assert.equal(store.listEditorial().length,0);
    assert.equal(store.overview({provider:'codex'}).usage.attempts24h,5);
    assert.equal(store.overview({provider:'codex'}).usage.analysisAttempts24h,5);
    assert.equal(store.db.prepare('PRAGMA integrity_check').get().integrity_check,'ok');
    assert.deepEqual(store.db.prepare('PRAGMA foreign_key_check').all(),[]);
  }finally{store.close();}
  const reopened=new Store(directory);try{assert.equal(reopened.listEditorial().length,0);assert.equal(reopened.db.prepare('SELECT count(*) n FROM attempts').get().n,5);}finally{reopened.close();}
});

test('template drafts work with models off, preserve edits on reuse and survive another connection',async t=>{
  const {store,config,dir}=fixture(t,{analysisEnabled:false,provider:'off'}),article=researched(store);let calls=0;
  store.editArticle(article.id,{personalNotes:'不应进入公众号的私人客户备注。'});
  const worker=new Worker(store,config,{analyzer:async()=>{calls++;return output();},editor:async()=>{calls++;return written();}});
  const first=worker.createEditorial(request(article,{mode:'template'}));
  assert.equal(first.draft.status,'ready');assert.equal(first.cached,false);assert.equal(first.draft.generatedResult,null);
  assert.ok(!JSON.stringify(first.draft.sources).includes('私人客户备注'));assert.ok(!('body' in first.draft.sources[0]));
  const changed={...first.draft.result,title:'保留我的人工标题'};
  const edited=store.editEditorial(first.draft.id,changed,first.draft.revision);
  assert.throws(()=>store.editEditorial(first.draft.id,first.draft.result,first.draft.revision),{code:'revision_conflict'});
  const reused=worker.createEditorial(request(article,{mode:'template'}));
  assert.equal(reused.cached,true);assert.equal(reused.draft.id,first.draft.id);assert.equal(reused.draft.result.title,changed.title);
  assert.equal(reused.draft.revision,edited.revision);assert.equal(reused.draft.generatedResult,null);
  const other=new Store(dir);try{assert.deepEqual(other.getEditorial(first.draft.id).result,changed);}finally{other.close();}
  await worker.wake();store.listEditorial();store.overview(config);
  assert.equal(calls,0);assert.equal(store.overview(config).usage.attempts24h,0);
});

test('four analyses and one writing task share the five-attempt rolling limit',async t=>{
  const {store,config}=fixture(t,{dailyLimit:5});let analysisCalls=0,writingCalls=0;
  const worker=new Worker(store,config,{analyzer:async()=>{analysisCalls++;return output();},editor:async()=>{writingCalls++;return written();}});
  const articles=Array.from({length:4},(_,i)=>add(store,i+1));
  for(const article of articles)worker.enqueue(article.id);
  await worker.wake();assert.equal(analysisCalls,4);
  const draft=worker.createEditorial(request(articles[0])).draft;await worker.wake();
  assert.equal(store.getEditorial(draft.id).status,'ready');assert.equal(writingCalls,1);
  worker.enqueue(add(store,5).id);
  const waiting=worker.createEditorial(request(articles[1],{angle:'另一个不同的选题'})).draft;
  await worker.wake();await worker.wake();
  const usage=store.overview(config).usage;
  assert.equal(usage.attempts24h,5);assert.equal(usage.analysisAttempts24h,4);assert.equal(usage.editorialAttempts24h,1);
  assert.equal(analysisCalls,4);assert.equal(writingCalls,1);assert.equal(store.getEditorial(waiting.id).status,'queued');
  assert.equal(worker.createEditorial(request(articles[0])).cached,true);
  assert.equal(store.getArticle(articles[0].id).status,'analyzed');assert.deepEqual(store.getArticle(articles[0].id).analysis,output().result);
});

test('writing waits for active analysis, then runs before the remaining analysis backlog without overlap',async t=>{
  const {store,config}=fixture(t),source=researched(store,99),started=Promise.withResolvers(),release=Promise.withResolvers();
  const order=[];let active=0,maximum=0,analysisCalls=0;
  const worker=new Worker(store,config,{
    analyzer:async()=>{order.push(`analysis-${++analysisCalls}`);maximum=Math.max(maximum,++active);if(analysisCalls===1){started.resolve();await release.promise;}active--;return output();},
    editor:async()=>{order.push('editorial');maximum=Math.max(maximum,++active);active--;return written();},
  });
  try{
    worker.start();worker.enqueue(add(store).id);await started.promise;
    worker.enqueue(add(store,2).id);const created=worker.createEditorial(request(source));
    worker.createEditorial(request(source));assert.equal(created.draft.status,'queued');
    release.resolve();await worker.wake();
    assert.deepEqual(order,['analysis-1','editorial','analysis-2']);assert.equal(maximum,1);
    assert.equal(store.overview(config).usage.attempts24h,3);
  }finally{release.resolve();await worker.stop();}
});

test('unknown writing is cached without retry, pauses all work and only explicit retry makes a new receipt',async t=>{
  const {store,config}=fixture(t),article=researched(store);let writingCalls=0,analysisCalls=0;
  const worker=new Worker(store,config,{analyzer:async()=>{analysisCalls++;return output();},editor:async()=>{
    if(++writingCalls===1)throw Object.assign(new Error('private upstream detail'),{code:'invalid_result',usage:{inputTokens:1400,outputTokens:200},costUsd:0.02});
    return written();
  }});
  const first=worker.createEditorial(request(article)).draft;await worker.wake();
  assert.equal(store.getEditorial(first.id).status,'unknown');assert.ok(store.setting('analysis_pause'));
  assert.equal(store.getArticle(article.id).status,'analyzed');assert.deepEqual(store.getArticle(article.id).analysis,article.analysis);
  assert.equal(worker.createEditorial(request(article)).cached,true);await worker.wake();assert.equal(writingCalls,1);
  assert.equal(store.overview(config).usage.monthCostUsd,0.02);
  worker.enqueue(add(store,2).id);await worker.wake();assert.equal(analysisCalls,0);
  store.setSetting('analysis_pause',null);await worker.wake();assert.equal(analysisCalls,1);assert.equal(writingCalls,1);
  worker.retryEditorial(first.id);await worker.wake();assert.equal(writingCalls,2);
  assert.equal(store.getEditorial(first.id).status,'ready');assert.equal(store.overview(config).usage.attempts24h,3);
  assert.equal(store.db.prepare("SELECT count(*) n FROM attempts WHERE kind='editorial' AND status='unknown'").get().n,1);
  assert.throws(()=>worker.retryEditorial(first.id),{code:'retry_not_allowed'});
});

test('recovering an interrupted writing request keeps sources intact and never requeues it',t=>{
  const {store,config,dir}=fixture(t),article=researched(store);
  const input=prepareEditorial([article],{mode:'model',format:'article',angle:'中断恢复验证'},config);
  const created=store.createEditorial(input).draft,attempt=store.beginEditorialAttempt(created.id,config,0.25);
  const other=new Store(dir);
  try{
    assert.equal(other.recoverInterrupted(),1);assert.equal(other.recoverInterrupted(),0);
    assert.equal(other.getEditorial(created.id).status,'unknown');assert.equal(other.nextEditorialQueued(),null);
    assert.equal(other.getArticle(article.id).status,'analyzed');assert.deepEqual(other.getArticle(article.id).analysis,article.analysis);
    assert.equal(other.db.prepare('SELECT status FROM attempts WHERE id=?').get(attempt.id).status,'unknown');
    assert.equal(other.overview(config).usage.monthReservedUsd,0.25);assert.ok(other.setting('analysis_pause'));
    assert.equal(other.createEditorial(input).cached,true);
  }finally{other.close();}
});

test('a changed writing configuration blocks the old task without charging or pausing other tasks',async t=>{
  const {store,config}=fixture(t),source=researched(store);let writingCalls=0,analysisCalls=0;
  const worker=new Worker(store,config,{analyzer:async()=>{analysisCalls++;return output();},editor:async()=>{writingCalls++;return written();}});
  const old=worker.createEditorial(request(source)).draft;config.model='different-fixture-model';
  worker.enqueue(add(store,2).id);await worker.wake();
  assert.equal(store.getEditorial(old.id).status,'blocked');assert.equal(writingCalls,0);assert.equal(analysisCalls,1);
  assert.equal(store.overview(config).usage.editorialAttempts24h,0);assert.equal(store.setting('analysis_pause'),null);
  const current=worker.createEditorial(request(source)).draft;assert.notEqual(current.id,old.id);await worker.wake();
  assert.equal(writingCalls,1);assert.equal(store.getEditorial(current.id).status,'ready');
});

test('generated text and selected evidence stay as snapshots after manual editing or source changes',async t=>{
  const {store,config}=fixture(t),article=researched(store),worker=new Worker(store,config,{editor:async()=>written()});
  const created=worker.createEditorial(request(article)).draft;await worker.wake();
  const ready=store.getEditorial(created.id),edited={...ready.result,title:'人工复核后修改的标题'};
  store.editEditorial(ready.id,edited,ready.revision);
  store.upsertArticle({...article,body:article.body+'补充了新的现场信息。'},{updateExisting:true});
  const saved=store.getEditorial(ready.id);
  assert.equal(saved.result.title,edited.title);assert.equal(saved.generatedResult.title,written().result.title);
  assert.equal(saved.staleSources,true);assert.equal(saved.sources[0].bodyHash,article.bodyHash);
  assert.deepEqual(saved.sources[0].analysis,article.analysis);assert.equal(store.overview(config).usage.attempts24h,1);
});

test('analysis and writing share the cross-connection running gate and unknown budget reservation',t=>{
  const {store,config,dir}=fixture(t,{monthlyBudgetUsd:0.15}),source=researched(store),candidate=add(store,2);
  const input=prepareEditorial([source],{mode:'model',format:'article',angle:'共享预算'},config),draft=store.createEditorial(input).draft;
  const key=analysisKey(prepareArticle(candidate),config);store.queue(candidate.id,key);
  const attempt=store.beginEditorialAttempt(draft.id,config,0.1),other=new Store(dir);
  try{
    assert.throws(()=>other.beginAttempt(candidate.id,key,config,0.1),{code:'busy'});
    store.failEditorialAttempt(attempt,{code:'cli_execution'});store.setSetting('analysis_pause',null);
    assert.throws(()=>other.beginAttempt(candidate.id,key,config,0.1),{code:'monthly_limit'});
    assert.equal(store.overview(config).usage.monthReservedUsd,0.1);assert.equal(store.overview(config).usage.attempts24h,1);
    config.monthlyBudgetUsd=1;const analysisAttempt=other.beginAttempt(candidate.id,key,config,0.1);
    store.queueEditorialRetry(draft.id);
    assert.throws(()=>store.beginEditorialAttempt(draft.id,config,0.1),{code:'busy'});
    other.completeAttempt(analysisAttempt,output());
  }finally{other.close();}
});

test('automatic analysis refill accounts for queued writing and a template does not wake unrelated models',async t=>{
  const {store,config}=fixture(t,{autoAnalyze:true,dailyLimit:2}),source=researched(store),worker=new Worker(store,config,{editor:async()=>written()});
  worker.createEditorial(request(source));for(let i=2;i<=5;i++)add(store,i,{backfill:false});
  worker.refill();const overview=store.overview(config);
  assert.equal(overview.stats.editorialQueued,1);assert.equal(overview.stats.queued,1);
  let wakes=0;worker.started=true;worker.wake=()=>{wakes++;return Promise.resolve();};
  const template=worker.createEditorial(request(source,{mode:'template'}));
  assert.equal(template.draft.status,'ready');assert.equal(wakes,0);
  await worker.stop();
});
