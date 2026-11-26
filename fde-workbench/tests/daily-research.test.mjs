import test from 'node:test';
import assert from 'node:assert/strict';
import { AppError } from '../src/config.mjs';
import { Store } from '../src/store.mjs';
import { Discovery } from '../src/discovery.mjs';
import { fetchText } from '../src/fetch.mjs';
import { TopicSubscriptions } from '../src/subscriptions.mjs';
import { DailyResearch } from '../src/daily.mjs';
import { assessResearch } from '../src/relevance.mjs';
import { fixture,body,analysis } from './helpers.mjs';

const topics=[{id:'evals',label:'评测',hn:'LLM evals'}];
const baseTime=Math.floor(Date.now()/1000);
const lead=(n,relatedUrl=null,author='fixture')=>({channel:'hn',kind:'story',url:`https://news.ycombinator.com/item?id=${10000+n}`,
  title:'Enterprise AI evaluation tutorial '+n,excerpt:'An engineering evaluation with production constraints.',
  priority:2,publishedAt:new Date((baseTime-120)*1000).toISOString(),author,points:3,comments:null,relatedUrl});
const pack=(items,extra={})=>({items,total:items.length,pages:items.length?1:0,pageSize:20,raw:items.length,hasMore:false,...extra});

test('topic checks survive failure and restart, retain pagination, and deduplicate with a bounded overlap',async t=>{
  const {store,config,dir}=fixture(t);
  let calls=0;
  const seen=[];
  const search=({term,start,end,page})=>{
    seen.push({term,start,end,page});
    if(++calls===1)return pack([lead(1)],{total:21,pages:2,hasMore:true});
    if(calls===2)throw new AppError('network','fake failure');
    return pack([lead(1),lead(2)]);
  };
  const service=new TopicSubscriptions(store,topics,search);
  await service.run({now:baseTime});
  assert.equal(service.list()[0].progress.page,2);
  assert.equal(service.list()[0].checkedAt,null);
  await service.run({now:baseTime+1});
  assert.equal(service.list()[0].last.status,'failed');
  assert.equal(service.list()[0].progress.page,2);
  assert.equal(service.list()[0].coveredThrough,null);
  const reopened=new Store(dir);
  try{
    const resumed=new TopicSubscriptions(reopened,topics,search);
    await resumed.run({now:baseTime+5});
    assert.equal(calls,2);
    await resumed.run({now:baseTime+1801});
    const status=resumed.list()[0];
    assert.equal(status.last.status,'ok');
    assert.equal(status.last.added,2);
    assert.equal(status.last.duplicates,1);
    assert.equal(status.coveredThrough,new Date(baseTime*1000).toISOString());
    assert.equal(status.progress,null);
    assert.deepEqual(seen[1],seen[2]);
    await resumed.run({now:baseTime+30*86400});
    assert.equal(seen[3].start,baseTime+16*86400);
    await resumed.run({id:'evals',now:baseTime+30*86400+60});
    assert.equal(seen[4].start,baseTime+30*86400-6*3600);
  }finally{reopened.close();}
  assert.equal(store.overview(config).usage.attempts24h,0);
});

test('a provider pagination cap splits and retains the rest of its window',async t=>{
  const {store}=fixture(t);const requests=[];
  const service=new TopicSubscriptions(store,topics,params=>{
    requests.push(params);
    return requests.length===1?pack([],{total:600,pages:20}):pack([]);
  });
  await service.run({now:baseTime});
  assert.equal(service.list()[0].last.status,'progress');
  assert.equal(service.list()[0].coveredThrough,null);
  await service.run({now:baseTime+1});
  assert.equal(service.list()[0].progress.page,1);
  await service.run({now:baseTime+2});
  assert.equal(service.list()[0].last.status,'ok');
  assert.equal(requests[1].end,requests[2].start);
  assert.equal(requests[0].end,requests[2].end);
  service.configure({id:'evals',keyword:'retrieval evaluation',enabled:false,hours:8});
  assert.equal(service.list()[0].keyword,'retrieval evaluation');
  assert.equal(service.list()[0].last,null);
  await service.run({now:baseTime+400000});
  assert.equal(requests.length,3);
});

test('HN honors Retry-After across manual and background queries',async t=>{
  const {store,config}=fixture(t);let calls=0;
  const discovery=new Discovery(store,config,{
    fetcher:(url,opts)=>fetchText(url,{...opts,resolver:async()=>[{address:'93.184.216.34'}]}),
    transport:async()=>{calls++;return new Response('{}',{status:429,headers:{'retry-after':'170'}});},
  });
  await discovery.subscriptions.run({now:baseTime});
  assert.equal(discovery.subscriptions.list()[0].last.status,'limited');
  assert.equal(discovery.subscriptions.list()[0].coveredThrough,null);
  assert.ok(Number(store.setting('hn_discovery_wait_until'))>Date.now()+160000);
  await assert.rejects(discovery.hn(new URLSearchParams({q:'RAG'})),{code:'hn_rate_limit'});
  await discovery.subscriptions.run({now:baseTime+1});
  assert.equal(calls,1);
});

test('quoted HN topic searches use phrase matching',async t=>{
  const {store,config}=fixture(t);
  const discovery=new Discovery(store,config,{fetcher:async value=>{
    const url=new URL(value);
    assert.equal(url.searchParams.get('query'),'"RAG"');
    assert.equal(url.searchParams.get('advancedSyntax'),'true');
    return {text:JSON.stringify({hits:[],nbHits:0,nbPages:0})};
  }});
  await discovery.subscriptions.run({id:'rag',now:baseTime});
  assert.equal(discovery.subscriptions.list().find(entry=>entry.id==='rag').last.status,'ok');
});

test('daily reports use original dates, group leads, preserve current preferences, and export without calling a model',async t=>{
  const {store,config,dir}=fixture(t,{autoAnalyze:false,analysisEnabled:false});
  const service=new DailyResearch(store,config),today=service.read('').today;
  const add=(slug,title,publishedAt)=>store.upsertArticle({url:'https://example.org/'+slug,title,body,publishedAt}).article;
  const newArticle=add('today','企业 AI 客服评测教程',today);
  const oldArticle=add('old','企业 AI 客服项目复盘','2024-01-01');
  const unknown=add('unknown','带权限方案的企业 AI 评测教程',null);
  store.db.prepare("UPDATE articles SET status='analyzed',analysis_json=? WHERE id=?").run(JSON.stringify(analysis()),oldArticle.id);
  store.saveLeadMentions([lead(1,newArticle.url),{...lead(2,newArticle.url),channel:'x',kind:'post',url:'https://x.com/i/status/123456',points:null}]);
  let report=service.read(today);
  assert.deepEqual(report.counts,{newLeads:1,published:1,older:1,pending:2,analyzed:1,shortlisted:0});
  assert.equal(report.sections.flatMap(group=>group.items).filter(entry=>entry.articleId===newArticle.id).length,1);
  assert.match(service.markdown(today).text,/Hacker News.*积分 3，评论 未知/);
  assert.match(service.markdown(today).text,/原文日期未知/);
  assert.equal(service.read('2000-01-01').counts.newLeads,0);
  assert.ok(service.read('2000-01-01').sections.every(group=>group.count===0));
  assert.throws(()=>service.read('2026-02-30'),{code:'invalid_research_day'});
  const find=(report,id)=>report.sections.flatMap(x=>x.items).find(x=>x.id===id);
  const score=find(report,unknown.id).score;
  service.feedback({type:'article',id:unknown.id,label:'proposal',enabled:true});
  service.feedback({type:'article',id:unknown.id,label:'wechat',enabled:true});
  report=service.read(today);
  assert.equal(report.counts.shortlisted,1);
  assert.ok(find(report,unknown.id).score>score);
  assert.ok(service.profile().learned.sources.length);
  const reopened=new Store(dir);
  try{
    const peer=new DailyResearch(reopened,config);
    assert.equal(find(peer.read(today),unknown.id).labels.includes('proposal'),true);
    peer.feedback({type:'article',id:unknown.id,label:'proposal',enabled:false});
    peer.feedback({type:'article',id:unknown.id,label:'wechat',enabled:false});
    assert.equal(find(peer.read(today),unknown.id).score,score);
    const preferences=peer.preferences().map(entry=>({...entry,weight:0}));
    peer.setPreferences({preferences});
    assert.ok(find(peer.read(today),unknown.id).score<score);
    peer.setPreferences({reset:true});
    assert.equal(find(peer.read(today),unknown.id).score,score);
  }finally{reopened.close();}
  assert.deepEqual(store.getArticle(oldArticle.id).analysis,analysis());
  assert.equal(store.overview(config).usage.attempts24h,0);
});

test('local relevance keeps practical tutorials and flags announcement copy',()=>{
  assert.equal(assessResearch({title:'Free LLM evals course walkthrough',body:body+'附代码与指标。'}).priority,3);
  assert.ok(assessResearch({title:'Careers platform AI engineering tutorial',body}).priority>=2);
  assert.equal(assessResearch({title:'We are hiring: AI Agent engineer',body}).priority,0);
  assert.equal(assessResearch({title:'训练营报名：企业 AI 工程教程',body:'点击报名学习课程。'.repeat(30)}).priority,0);
  assert.ok(assessResearch({title:'MCP Gateway: How Snap Checks Both the Person and the Agent'}).priority>=2);
  assert.ok(assessResearch({title:'Production Grammar-Guided Decoding in vLLM with Xgrammar Benchmarks'}).priority>=2);
  assert.ok(assessResearch({title:'Rhebok: free local RAG for your coding agent'}).priority>=2);
  assert.notEqual(assessResearch({title:'企业 AI 客服评测试点',body:body.replaceAll('系统已在生产环境运行','原文没有生产上线的证据')}).type,'practice');
  assert.match(assessResearch({title:'Agentic production rollout postmortem',body:body+'实现步骤、权限和复盘。'}).reasons.join(' '),/生产上线|生产/);
});
