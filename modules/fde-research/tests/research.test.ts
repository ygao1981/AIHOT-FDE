// Requires the project's PostgreSQL _test/_ci harness. Never calls a real model.
import {tag} from '../../../tests/setup.ts';
import assert from 'node:assert/strict';
import {before,after,test} from 'node:test';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {sql,closeDb} from '@aihot/backend/db';
import {stopBoss} from '@aihot/backend/jobs/queue';
import {upsertMaterial} from '@aihot/backend/content/materials';
import {handleResearch,setupBudget,PAUSE_KEY} from '../backend.ts';
import {researchNotes} from '@aihot/backend/publication/fde-research';
const T=tag(),source=`fde-integration-${T}`;
const dir=await mkdtemp(join(tmpdir(),'fde-db-test-'));
const saved={...process.env};
let id:string;
const body='We deployed a RAG workflow to a pilot customer. The team documented evaluation steps and human review. '.repeat(5);
async function article(title:string) {
 return (await upsertMaterial({sourceId:source,title,url:`https://example.org/fde/${T}/${encodeURIComponent(title)}`,
 bodyText:body+title,bodyStatus:'ok',via:'fetch',publishedAt:new Date()})).articleId;
}
before(async()=>{
 const binary=join(dir,'codex.mjs');
 await writeFile(binary,`#!/usr/bin/env node\nimport fs from 'node:fs';let s='';for await(const c of process.stdin)s+=c;
 const a=process.argv.slice(2);const o=a[a.indexOf('--output-last-message')+1];
 if(s.includes('AUTH_FAIL')){console.error('not logged in');process.exit(1);}
 fs.writeFileSync(o,JSON.stringify({relevance:'relevant',category:'case',score:85,stage:'pilot',title:'RAG客户试点',summary:'实施知识库试点并保留人工审核。',problem:'知识检索',solution:'RAG工作流',outcome:'未披露ROI',lessons:['先试点再扩展'],limitations:['没有量化数据'],evidence:[{quote:'We deployed a RAG workflow to a pilot customer.',claim:'试点'}],ideas:[{title:'知识库如何验收',angle:'介绍评测步骤'}]}));
 console.log(JSON.stringify({type:'turn.completed',usage:{input_tokens:10,output_tokens:5}}));`,{mode:0o700});
 Object.assign(process.env,{FDE_CODEX_BIN:binary,CODEX_HOME:dir,FDE_CODEX_ENABLED:'true',FDE_DAILY_LIMIT:'1'});
 await sql`INSERT INTO sources(id,name,kind,tier,participation_mode,next_fetch_at) VALUES(${source},'FDE fixture','rss','T1','editorial','2100-01-01')`;
 await setupBudget();await sql`UPDATE budgets SET per_minute=100,per_hour=100,per_day=100 WHERE service='codex_cli'`;
});
after(async()=>{for(const k of ['FDE_CODEX_BIN','CODEX_HOME','FDE_CODEX_ENABLED','FDE_DAILY_LIMIT']){if(saved[k]===undefined)delete process.env[k];else process.env[k]=saved[k];}
 await stopBoss();await closeDb();await rm(dir,{recursive:true,force:true});});
test('one successful article produces one receipt, one analysis, and no fake double scores',async()=>{
 id=await article('RAG enterprise case');assert.equal((await handleResearch(id)).state,'complete');
 const rows=await sql`SELECT output,receipt_ids FROM analyses WHERE article_id=${id}`;
 assert.equal(rows.length,1);assert.equal(rows[0]!.receipt_ids.length,1);assert.equal(rows[0]!.output.scores,null);
 assert.equal(rows[0]!.output.fdeResearch.ideas.length,1);
 assert.equal((await sql`SELECT id FROM receipt_attempts WHERE service='codex_cli'`).length,1);
 assert.equal((await handleResearch(id)).state,'reused');
 assert.equal((await sql`SELECT id FROM receipt_attempts WHERE service='codex_cli'`).length,1);
});
test('rolling daily cap blocks before another subprocess is launched',async()=>{
 const next=await article('Another AI production tutorial');assert.equal((await handleResearch(next)).state,'waiting');
 assert.equal((await sql`SELECT id FROM receipt_attempts WHERE service='codex_cli'`).length,1);
});
test('authentication failure pauses all later calls; unknown receipt is never auto-released',async()=>{
 process.env.FDE_DAILY_LIMIT='5';const bad=await article('AUTH_FAIL AI deployment');
 assert.equal((await handleResearch(bad)).state,'failed');
 assert.equal((await sql`SELECT key FROM settings WHERE key=${PAUSE_KEY}`).length,1);
 const before=(await sql`SELECT id FROM receipt_attempts WHERE service='codex_cli'`).length;
 const next=await article('Third AI implementation case');assert.equal((await handleResearch(next)).state,'waiting');
 assert.equal((await sql`SELECT id FROM receipt_attempts WHERE service='codex_cli'`).length,before);
 assert.equal((await sql`SELECT id FROM receipts WHERE service='codex_cli' AND status='unknown'`).length,1);
});
test('research outlet observes withdrawal and never exposes nonpublic notes',async()=>{
 await sql`UPDATE publications SET visible_after=now()-interval '1 minute' WHERE article_id=${id}`;
 assert.ok((await researchNotes()).items.some(n=>n.id===id));
 await sql`UPDATE publications SET visibility='withdrawn' WHERE article_id=${id}`;
 assert.ok(!(await researchNotes()).items.some(n=>n.id===id));
});
