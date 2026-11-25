import test from 'node:test';
import assert from 'node:assert/strict';
import { Discovery } from '../src/discovery.mjs';
import { fetchText } from '../src/fetch.mjs';
import { importArticle, publicationDate } from '../src/collect.mjs';
import { precheck } from '../src/analysis.mjs';
import { researchPriority } from '../src/relevance.mjs';
import { fixture,body } from './helpers.mjs';

test('HN dates, filters, zero and unknown metrics survive search and saving from the same cached snapshot',async t=>{
  const {store,config}=fixture(t);let requests=0;
  const discovery=new Discovery(store,config,{fetcher:async value=>{
    requests++;
    const url=new URL(value);
    assert.equal(url.origin,'https://hn.algolia.com');
    assert.equal(url.pathname,'/api/v1/search_by_date');
    assert.equal(url.searchParams.get('query'),'LLM evaluation & latency');
    assert.equal(url.searchParams.get('tags'),'story');
    assert.equal(url.searchParams.get('numericFilters'),'created_at_i>=1795132800,created_at_i<1795305600,points>=5,num_comments>=1');
    return {text:JSON.stringify({nbHits:2,nbPages:1,hits:[
      {objectID:'77777',title:'LLM Evaluation case',url:'https://example.com/article?utm_source=hn',story_text:'<p>Metrics &amp; results.</p>',points:6,num_comments:2},
      {objectID:'77778',title:'Enterprise RAG architecture',url:'https://example.com/article/',points:0},
    ]})};
  }});
  const params=new URLSearchParams({q:'LLM evaluation & latency',from:'2026-11-20',to:'2026-11-21',points:'5',comments:'1'});
  const page=await discovery.hn(params);
  assert.equal((await discovery.hn(params)).snapshot,page.snapshot);
  assert.equal(requests,1);
  assert.equal(page.items[1].points,0);
  assert.equal(page.items[1].comments,null);
  assert.equal(page.items[0].excerpt,'Metrics & results.');
  assert.deepEqual(discovery.save({snapshot:page.snapshot}),{added:2,duplicates:0,linked:1});
  assert.deepEqual(discovery.save({snapshot:page.snapshot}),{added:0,duplicates:2,linked:0});
  assert.equal(discovery.leads(new URLSearchParams()).items[0].mentionCount,2);
  await assert.rejects(discovery.hn(new URLSearchParams({q:'AI',from:'2026-02-30'})),{code:'invalid_discovery_date'});
  assert.throws(()=>discovery.save({snapshot:'missing'}),{code:'discovery_expired'});
  assert.equal(store.overview(config).usage.attempts24h,0);
});

test('X saves pasted excerpts without a request, unifies tweet aliases, and joins existing research via an original URL',async t=>{
  const {store,config}=fixture(t);
  const neverFetch=()=>assert.fail('manual X must not access a network');
  const discovery=new Discovery(store,config,{fetcher:neverFetch});
  const article=store.upsertArticle({url:'http://example.com/primary/',title:'原始工程案例',body}).article;
  const post='https://twitter.com/example/status/123456789?utm_source=test';
  assert.deepEqual(discovery.save({url:post,excerpt:'用户提供的 AI 评测线索。',points:555,comments:999}),{added:1,duplicates:0,linked:0});
  assert.deepEqual(discovery.save({url:'https://x.com/i/status/123456789/photo/1',relatedUrl:'https://example.com/primary?utm_campaign=x'}),{added:0,duplicates:1,linked:0});
  discovery.save({url:'https://x.com/example/status/223456789',excerpt:'架构相关讨论。',relatedUrl:'https://example.com/other'});
  discovery.link({url:'https://x.com/example/status/223456789',relatedUrl:'https://example.com/primary'});
  const result=discovery.leads(new URLSearchParams());
  assert.equal(result.items.length,1);
  const group=result.items[0];
  assert.equal(group.mentionCount,2);
  assert.equal(group.article.id,article.id);
  const entry=group.mentions.find(mention=>mention.url.endsWith('/123456789'));
  assert.match(entry.excerpt,/用户提供/);
  assert.equal(entry.points,null);
  assert.equal(entry.comments,null);
  assert.equal(entry.publishedAt,null);
  assert.throws(()=>discovery.save({url:'https://unsafe.example/status/123456789'}),{code:'invalid_x_link'});
  assert.throws(()=>discovery.link({url:post,relatedUrl:'http://127.0.0.1/'}),{code:'invalid_related_link'});
  await assert.rejects(importArticle(store,{url:post},config,{fetcher:neverFetch}),{code:'x_manual_only'});
  assert.equal((await importArticle(store,{url:'https://example.com/primary'},config,{fetcher:neverFetch})).article.id,article.id);
  assert.equal(store.overview(config).usage.attempts24h,0);
});

test('GitHub discovers public project artifacts and Discussion, accepts substantive path changes and keeps proposals as leads',async t=>{
  const {store,config}=fixture(t,{githubDiscussionsToken:'fixture-only'}),calls=[];
  const repo='datawhalechina/all-in-rag',project='https://github.com/'+repo;
  const stamp=new Date().toISOString(),sha='1'.repeat(40),minor='2'.repeat(40);
  const row=(id,notes={})=>({html_url:`${project}/issues/${id}`,title:'RAG integration permission setup',body,created_at:stamp,updated_at:stamp,...notes});
  const added=Array.from({length:10},(_,i)=>'+Implementation instructions for indexed data '+i).join('\n');
  const discovery=new Discovery(store,config,{fetcher:async (value,options)=>{
    assert.deepEqual(options.allowedHosts,['api.github.com']);
    assert.equal(options.followRedirects,false);
    const path=new URL(value).pathname.split('/').at(-1);calls.push(path);
    const payload={
      'all-in-rag':{html_url:project,full_name:repo,private:false,description:'RAG tutorial',pushed_at:stamp,stargazers_count:321},
      issues:[row(1),row(2,{pull_request:{}})],pulls:[row(2,{html_url:project+'/pull/2',merged_at:null}),row(3,{html_url:project+'/pull/3',merged_at:stamp})],
      releases:[row(0,{html_url:project+'/releases/tag/v1',name:'RAG release',draft:false,published_at:stamp})],
      commits:[{sha,html_url:project+'/commit/'+sha,commit:{message:'Add detailed directions',committer:{date:stamp}}},
        {sha:minor,html_url:project+'/commit/'+minor,commit:{message:'Minor change',committer:{date:stamp}}}],
      [sha]:{files:[{filename:'docs/retrieval.md',status:'added',patch:added}]},
      [minor]:{files:[{filename:'docs/CHANGELOG.md',status:'modified',patch:added},{filename:'docs/wording.md',status:'modified',patch:'+Short change'}]},
      graphql:{data:{repository:{isPrivate:false,discussions:{nodes:[{url:project+'/discussions/4',title:'RAG evaluation',bodyText:body,createdAt:stamp,updatedAt:stamp,comments:{totalCount:0}}]}}}},
    };
    assert.ok(path in payload);
    return {text:JSON.stringify(payload[path])};
  }});
  const result=await discovery.github({repo,days:2});
  assert.deepEqual(new Set(result.items.map(x=>x.kind)),new Set(['repository','issue','pull','release','doc','discussion']));
  assert.equal(result.items.length,7);
  assert.equal(result.items.filter(x=>x.kind==='doc').length,1);
  assert.equal(result.items.find(x=>x.url.endsWith('/pull/2')).relatedUrl,null);
  assert.equal(result.items.find(x=>x.url.endsWith('/pull/3')).relatedUrl,project+'/pull/3');
  assert.equal(result.items.find(x=>x.kind==='discussion').comments,0);
  assert.equal(result.warnings.length,0);
  assert.equal(calls.length,8);
  await assert.rejects(discovery.github({repo:'side/project'}),{code:'invalid_discovery_repo'});
  assert.throws(()=>discovery.watch({repo,enabled:'yes'}),{code:'invalid_discovery_repo'});
  discovery.watch({repo,enabled:true});
  await discovery.refreshWatched();
  assert.equal(discovery.leads(new URLSearchParams()).items.length,0);
  config.collectEnabled=true;
  await discovery.refreshWatched();
  assert.equal(discovery.catalog().repositories.find(entry=>entry.repo===repo).watching,true);
  assert.ok(discovery.catalog().repositories.find(entry=>entry.repo===repo).checkedAt);
  assert.ok(discovery.leads(new URLSearchParams()).items.some(group=>group.mentions.some(entry=>entry.kind==='doc')));
  assert.equal(store.overview(config).usage.attempts24h,0);
});

test('GitHub REST respects a persisted limit and GraphQL never forwards credentials to redirects',async t=>{
  const {store,config}=fixture(t,{githubDiscussionsToken:'fixture-only'});
  const fetcher=(url,options)=>fetchText(url,{...options,resolver:async()=>[{address:'93.184.216.34'}]});
  const requests=[];
  const discovery=new Discovery(store,config,{fetcher,transport:async (url,options)=>{
    requests.push(url);
    if(url.endsWith('/graphql')){
      assert.equal(options.method,'POST');
      assert.equal(options.headers.Authorization,'Bearer fixture-only');
      return new Response(null,{status:302,headers:{location:'https://api.github.com/another-route'}});
    }
    assert.equal(options.headers.Authorization,undefined);
    return new Response('{}',{status:429,headers:{'retry-after':'120'}});
  }});
  assert.match((await discovery.github({repo:'datawhalechina/all-in-rag',kind:'discussion'})).warnings[0],/Discussion 暂时无法读取/);
  await assert.rejects(discovery.api('https://api.github.com/rate_limit',{github:true}),{code:'github_rate_limit'});
  await assert.rejects(discovery.api('https://api.github.com/repos/datawhalechina/all-in-rag',{github:true}),{code:'github_rate_limit'});
  assert.equal(requests.length,2);
  assert.ok(Number(store.setting('github_discovery_wait_until'))>Date.now()+100000);
});

test('initial local screening keeps hands-on tutorials and lowers recruiting and promotion',()=>{
  assert.equal(precheck({title:'企业 AI 岗位招聘公告',body}),'skip');
  assert.equal(precheck({title:'限时优惠 RAG 课程',body:'报名学习企业 AI 知识库。'.repeat(18)}),'skip');
  assert.equal(precheck({title:'Show HN: AI Startup raises $1.25M',body}),'skip');
  assert.equal(precheck({title:'RAG 实操课程：接入业务系统并设计复核',body}),'candidate');
  assert.equal(precheck({title:'用 AI 实现招聘流程的人类审批',body}),'candidate');
  assert.ok(researchPriority({title:'RAG 直播预告',body:body+'附完整配置与架构示例。'})>=2);
  assert.equal(publicationDate('November 23, 2026'),'2026-11-23');
});
