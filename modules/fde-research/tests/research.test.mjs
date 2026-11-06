import assert from 'node:assert/strict';
import {test,after} from 'node:test';
import {mkdtemp,writeFile,chmod,rm,readFile,readdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {inputFor,precheck,fingerprint,validateResult,markdown,SCHEMA} from '../core.mjs';
import {runCodex,argumentsFor,childEnvironment} from '../cli.mjs';
const body='We deployed a RAG workflow to a pilot customer. The team documented evaluation steps and human review. '.repeat(5);
const article=inputFor({title:'Enterprise AI implementation',url:'https://example.org/case',body});
function result(){return {relevance:'relevant',category:'case',score:80,stage:'pilot',title:'企业知识库试点',summary:'团队在客户场景开展知识库试点，保留人工审核。',problem:'客户需要检索知识。',solution:'采用RAG工作流并保留人工审核。',outcome:'原文未披露量化效果。',lessons:['先做试点'],limitations:['没有成本数据'],evidence:[{quote:'We deployed a RAG workflow to a pilot customer.',claim:'项目处于试点阶段'}],ideas:[{title:'知识库上线前如何验证',angle:'从试点步骤讨论验收方法'}]};}
const root=await mkdtemp(join(tmpdir(),'fde-unit-'));after(()=>rm(root,{recursive:true,force:true}));
const fake=join(root,'fake-codex.mjs');
await writeFile(fake,`#!/usr/bin/env node
import fs from 'node:fs';
let s='';for await (const c of process.stdin)s+=c;
const a=process.argv.slice(2);const o=a[a.indexOf('--output-last-message')+1];
if(s.includes('FIXTURE_AUTH')){console.error('not logged in');process.exit(1);}
if(s.includes('FIXTURE_QUOTA')){console.error('usage limit reached');process.exit(1);}
if(s.includes('FIXTURE_TIMEOUT')){setInterval(()=>{},1000);await new Promise(()=>{});}
if(s.includes('FIXTURE_BIG')){console.log('x'.repeat(1100000));await new Promise(r=>setTimeout(r,5000));}
if(process.env.DATABASE_URL || process.env.OPENAI_API_KEY || process.env.NODE_OPTIONS)process.exit(12);
if(!a.includes('forced_login_method="chatgpt"')||!a.includes('features.shell_tool=false'))process.exit(13);
const r=${JSON.stringify(result())};
if(s.includes('FIXTURE_BAD'))r.evidence[0].quote='A fabricated return on investment.';
if(s.includes('FIXTURE_TOOL'))console.log(JSON.stringify({type:'item.completed',item:{type:'command_execution'}}));
fs.writeFileSync(o,JSON.stringify(r));
console.log(JSON.stringify({type:'turn.completed',usage:{input_tokens:123,output_tokens:45,cached_input_tokens:0}}));
`,{mode:0o700});await chmod(fake,0o700);
const opts={binary:fake,home:root,env:{...process.env,DATABASE_URL:'secret',OPENAI_API_KEY:'secret',NODE_OPTIONS:'--bad-option'},timeoutMs:5000};
test('schema has required fields and disallows additional properties',()=>{
 assert.equal(SCHEMA.additionalProperties,false);assert.deepEqual(SCHEMA.required,Object.keys(result()));
});
test('empty or short body never spends model quota',()=>{
 assert.equal(precheck(inputFor({title:'FDE case',url:article.url,body:''})),'needs_body');
});
test('FDE relevance does not require the literal acronym',()=>{
 assert.equal(precheck(article),'candidate');
 assert.equal(precheck(inputFor({title:'制造业知识库落地',url:article.url,body:'企业知识库部署和人工验收的实践流程。'.repeat(20)})),'candidate');
});
test('generic words do not turn paragraph into RAG',()=>{
 assert.equal(precheck(inputFor({title:'Production report',url:article.url,body:'This paragraph describes a production enterprise workflow without artificial models. '.repeat(10)})),'skip');
});
test('hiring and unrelated articles are rejected without model calls',()=>{
 assert.equal(precheck({...article,title:'We are hiring AI engineers'}),'skip');
 assert.equal(precheck({...article,title:'Recipe',body:'A cooking recipe with fruits and vegetables. '.repeat(10)}),'skip');
});
test('source URL rejects credentials and non-http schemes',()=>{
 for(const url of ['file:///etc/passwd','https://user:secret@example.com','javascript:alert(1)'])assert.throws(()=>inputFor({title:'a',url,body}));
});
test('context truncation is visible and participates in cache identity',()=>{
 const long=inputFor({...article,body:body.repeat(100)},2000);assert.equal(long.body.length,2000);assert.equal(long.truncated,true);
 assert.notEqual(fingerprint(long),fingerprint(article));
 const v=validateResult(result(),long);assert.ok(v.limitations.some(x=>x.includes('截断')));
});
test('unchanged input reuses fingerprint; model or content change does not',()=>{
 assert.equal(fingerprint(article),fingerprint({...article}));
 assert.notEqual(fingerprint(article,'A'),fingerprint(article,'B'));
 assert.notEqual(fingerprint(article),fingerprint({...article,body:body+'new information'}));
});
test('missing, extra, malformed and ungrounded outputs fail closed',()=>{
 const extra={...result(),foo:1};assert.throws(()=>validateResult(extra,article));
 const missing=result();delete missing.summary;assert.throws(()=>validateResult(missing,article));
 assert.throws(()=>validateResult({...result(),score:101},article));
 assert.throws(()=>validateResult({...result(),evidence:[{quote:'ROI 999%',claim:'result'}]},article),/ungrounded/);
 assert.throws(()=>validateResult({...result(),ideas:Array(4).fill({title:'t',angle:'a'})},article));
});
test('unrelated output cannot publish scores, invented stages or pitches',()=>{
 const v=validateResult({...result(),relevance:'unrelated'},article);assert.equal(v.score,0);assert.equal(v.stage,'not_disclosed');assert.deepEqual(v.ideas,[]);
 assert.equal(validateResult({...result(),evidence:[],stage:'production'},article).stage,'not_disclosed');
});
test('markdown contains provenance and labels editorial suggestions',()=>{
 const s=markdown(result(),article);assert.ok(s.includes(article.url));assert.ok(s.includes('未经独立事实核查'));assert.ok(s.includes('公众号选题草案'));
 assert.ok(!markdown({...result(),title:'<script>x</script>'},article).includes('<script>'));
});
test('subprocess environment excludes application and API credentials',()=>{
 const e=childEnvironment(opts.env,root);for(const key of ['DATABASE_URL','OPENAI_API_KEY','NODE_OPTIONS'])assert.equal(e[key],undefined);
 assert.equal(e.CODEX_HOME,root);assert.throws(()=>childEnvironment({},'relative'));
});
test('arguments use read-only tools-disabled subscription auth and ephemeral output',()=>{
 const a=argumentsFor(root,'test-model');for(const s of ['read-only','--ephemeral','--ignore-user-config','forced_login_method="chatgpt"','features.shell_tool=false','features.hooks=false','web_search="disabled"'])assert.ok(a.includes(s));
 assert.equal(a.at(-1),'-');assert.ok(!a.includes('--dangerously-bypass-approvals-and-sandbox'));
});
test('successful CLI runs once and returns validated data and usage',async()=>{
 const v=await runCodex(article,opts);assert.equal(v.result.title,result().title);assert.equal(v.usage.input_tokens,123);
});
test('article content is stdin data and never shell interpolation',async()=>{
 const marker=join(root,'should-not-exist');await runCodex({...article,title:`$(touch ${marker}); echo PWNED`},opts);
 assert.ok(!(await readdir(root)).includes('should-not-exist'));
});
for(const [marker,code] of [['FIXTURE_AUTH','authentication'],['FIXTURE_QUOTA','quota'],['FIXTURE_BAD','invalid_or_ungrounded_result'],['FIXTURE_TOOL','unexpected_tool']]) {
 test(`CLI ${marker} stops without automatic retry`,async()=>{await assert.rejects(runCodex({...article,title:marker},opts),e=>e.code===code);});
}
test('timeout terminates the subprocess, rather than retrying',async()=>{
 await assert.rejects(runCodex({...article,title:'FIXTURE_TIMEOUT'},{...opts,timeoutMs:200}),e=>e.code==='timeout_unknown');
});
test('oversized CLI output is bounded and rejected',async()=>{
 await assert.rejects(runCodex({...article,title:'FIXTURE_BIG'},opts),e=>e.code==='output_limit');
});
