// Explicit operator controls. No credential contents are read or printed.
import { randomUUID } from 'node:crypto';
import { mkdir,writeFile } from 'node:fs/promises';
import { resolve,join } from 'node:path';
import { sql,closeDb } from '@aihot/backend/db';
import { queueProcessing } from '@aihot/backend/jobs/content';
import { stopBoss } from '@aihot/backend/jobs/queue';
import { researchNotes } from '@aihot/backend/publication/fde-research';
import { PAUSE_KEY,pause } from '../modules/fde-research/backend.ts';
import { markdown } from '../modules/fde-research/core.mjs';
const action=process.argv[2]||'status';
try {
 if(action==='status') {
  const stopped=await sql`SELECT value FROM settings WHERE key=${PAUSE_KEY}`;
  const usage=await sql`SELECT count(*)::int AS attempts,count(*) FILTER(WHERE status IN ('received','completed'))::int AS received
    FROM receipt_attempts WHERE service='codex_cli' AND origin='live' AND started_at>now()-interval '24 hours'`;
  const queue=await sql`SELECT processing_state,count(*)::int AS count FROM articles WHERE source_id LIKE 'fde-%' GROUP BY processing_state`;
  console.log(JSON.stringify({paused:stopped[0]?.value||null,last24h:usage[0],articles:queue},null,2));
 } else if(action==='pause') {
  await pause('manual');console.log('已暂停新Codex任务；不影响已保存资料的阅读。');
 } else if(action==='resume') {
  await sql.begin(async tx=>{
   await tx`DELETE FROM settings WHERE key=${PAUSE_KEY}`;
   await tx`INSERT INTO settings(key,value,updated_by) VALUES('fde.codex.last_resume',${tx.json({at:new Date().toISOString()})},'fde-control')
    ON CONFLICT(key) DO UPDATE SET value=EXCLUDED.value,updated_at=now(),updated_by=EXCLUDED.updated_by`;
  });
  console.log('暂停已解除；不会自动重新调用结果未知的失败任务。仍受FDE_CODEX_ENABLED与额度上限约束。');
 } else if(action==='retry') {
  const id=process.argv[3];
  if(!id || !process.argv.includes('--accept-extra-usage')) throw new Error('重试可能再次消耗Plus额度。使用 retry <文章ID> --accept-extra-usage 明确同意。');
  const found=await sql`SELECT id FROM articles WHERE id=${id} AND source_id LIKE 'fde-%'`;
  if(!found.length) throw new Error('没有找到该FDE文章。');
  await sql`UPDATE articles SET processing_state='new',processing_retry_at=now() WHERE id=${id}`;
  await queueProcessing(id,{attemptTag:`manual-${randomUUID()}`});
  console.log('已排入人工重试任务，仍受暂停和额度限制。');
 } else if(action==='export') {
  const directory=resolve(process.argv[3]||'/data/fde-export');await mkdir(directory,{recursive:true,mode:0o700});
  let before:string|undefined,count=0;
  do {
   const page=await researchNotes(before);
   for(const n of page.items) {
    const file=n.id.replace(/[^a-zA-Z0-9_-]/g,'_')+'.md';
    await writeFile(join(directory,file),markdown(n.research,{title:n.title,url:n.url,body:'',truncated:false}),{mode:0o600});count++;
   }
   before=page.next||undefined;
  } while(before);
  console.log(`已导出${count}篇公开研究笔记到${directory}，没有模型调用。`);
 } else throw new Error('操作应为 status / pause / resume / retry / export');
} finally { await stopBoss();await closeDb(); }
