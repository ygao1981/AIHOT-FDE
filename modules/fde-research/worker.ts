// Low-volume worker. It intentionally does not start the upstream model/group/translation/report timers.
import { assertProductionSecrets } from '@aihot/backend/config';
import { sql,closeDb } from '@aihot/backend/db';
import { getBoss,stopBoss,work,enqueue,QUEUES,ensureQueue,recordRun } from '@aihot/backend/jobs/queue';
import { queueProcessing,sweepUnprocessed } from '@aihot/backend/jobs/content';
import { collectSource,loadSource } from '@aihot/backend/sources/collect';
import { extractArticleBody } from '@aihot/backend/content/extract';
import { installModules } from '@aihot/backend/modules';
import { SERVER_MODULES } from '@aihot/site/modules/server';
import { startHeartbeat } from '@aihot/backend/operations/heartbeat';
import { dailyRetention } from '@aihot/backend/operations/retention';
import { republishSource } from '@aihot/backend/publication/publish';
import { setupBudget,handleResearch } from './backend.ts';

if(process.env.MODEL_CALLS_ENABLED==='true') throw new Error('Codex个人模式要求MODEL_CALLS_ENABLED=false，避免API调用。');
installModules(SERVER_MODULES);
assertProductionSecrets([['auth','IMG_PROXY_SIGN_SECRET']]);
await setupBudget();
const boss=await getBoss({supervise:true});
const workerOptions={localConcurrency:1,pollingIntervalSeconds:10};
// Disable legacy cron dispatches in this application's own database; article data is not deleted.
const active=new Set(['cron.fde.sources','cron.fde.sweep','cron.fde.retention']);
for(const queue of await boss.getQueues()) if(queue.name.startsWith('cron.')&&!active.has(queue.name)) await boss.deleteQueue(queue.name);
async function permitted(id:string) {
  const s=await loadSource(id);
  return s?.enabled && id.startsWith('fde-') && s.kind==='rss' && s.participation_mode==='editorial' ? s : null;
}
await work(boss,QUEUES.fetchSource,workerOptions,async({sourceId,force})=>{
  if(process.env.COLLECT_ENABLED!=='true' || !await permitted(sourceId)) return {state:'disabled'};
  const result=await collectSource(sourceId,{force});
  // Never run adaptive high-frequency news collection in personal research mode.
  await sql`UPDATE sources SET next_fetch_at=greatest(coalesce(next_fetch_at,now()),now()+interval '6 hours') WHERE id=${sourceId}`;
  return result;
});
await work(boss,QUEUES.extractBody,workerOptions,async({articleId})=>{
  if(process.env.COLLECT_ENABLED!=='true') return {state:'disabled'};
  const allowed=await sql`SELECT a.id FROM articles a JOIN sources s ON s.id=a.source_id
    WHERE a.id=${articleId} AND s.enabled AND s.id LIKE 'fde-%' AND s.kind IN ('rss','external') AND s.participation_mode='editorial'`;
  if(!allowed.length) return {state:'out_of_scope'};
  try { await extractArticleBody(articleId); await queueProcessing(articleId); return {state:'extracted'}; }
  catch { // Three local extractor attempts, never a paid browser service or model fallback.
    const [row]=await sql<{processing_attempts:number}[]>`UPDATE articles SET processing_attempts=processing_attempts+1,
      processing_queued_at=NULL,processing_retry_at=now()+interval '1 hour' WHERE id=${articleId} RETURNING processing_attempts`;
    if((row?.processing_attempts||0)>=3) await sql`UPDATE articles SET body_status='unconfirmed',processing_state='failed',processing_error='正文读取失败，请核对原文；未调用Codex。' WHERE id=${articleId}`;
    return {state:'extraction_failed'};
  }
});
await work(boss,QUEUES.analyze,workerOptions,({articleId,attemptTag})=>handleResearch(articleId,attemptTag));
// Old queued group/digest/notification work must not wake another paid path after an upgrade.
await work(boss,QUEUES.group,workerOptions,async()=>({state:'disabled_in_research_mode'}));
await work(boss,QUEUES.digest,workerOptions,async()=>({state:'disabled_in_research_mode'}));
await work(boss,QUEUES.notifySelected,workerOptions,async()=>({state:'notifications_disabled'}));
await work(boss,QUEUES.republishSource,workerOptions,({sourceId})=>republishSource(sourceId));
await work(boss,QUEUES.prepareMedia,workerOptions,async()=>({state:'media_preparation_disabled'}));
const schedules:Array<{name:string;cron:string;run:()=>Promise<unknown>}>= [
  {name:'cron.fde.sources',cron:'*/10 * * * *',run:async()=>{
    if(process.env.COLLECT_ENABLED!=='true') return {disabled:true};
    const rows=await sql<{id:string}[]>`SELECT id FROM sources WHERE enabled AND id LIKE 'fde-%'
      AND kind='rss' AND participation_mode='editorial' AND (next_fetch_at IS NULL OR next_fetch_at<=now()) ORDER BY next_fetch_at NULLS FIRST LIMIT 2`;
    for(const row of rows) await enqueue(QUEUES.fetchSource,{sourceId:row.id},{singletonKey:row.id});
    return {scheduled:rows.length};
  }},
  {name:'cron.fde.sweep',cron:'*/10 * * * *',run:()=>sweepUnprocessed()},
  {name:'cron.fde.retention',cron:'30 3 * * *',run:()=>dailyRetention()},
];
for(const s of schedules) {
  await ensureQueue(s.name,{policy:'singleton',retryLimit:0,expireInSeconds:3600});
  await boss.schedule(s.name,s.cron,{}, {tz:'Asia/Shanghai'});
  await boss.work(s.name,{pollingIntervalSeconds:30},()=>recordRun(s.name,s.run));
}
const heartbeat=startHeartbeat('worker');
console.log(JSON.stringify({level:'info',msg:'FDE个人研究worker已启动，串行Codex，无付费API回退'}));
let stopping=false;
async function shutdown() { if(stopping)return; stopping=true;clearInterval(heartbeat);await stopBoss();await closeDb();process.exit(0); }
process.on('SIGTERM',shutdown);process.on('SIGINT',shutdown);
