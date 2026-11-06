// Compact research mode, independent of the upstream five-call editorial engine.
import { sql } from '@aihot/backend/db';
import { loadAnalyzeInput } from '@aihot/backend/editorial/input';
import { publishArticle } from '@aihot/backend/publication/publish';
import { queueProcessing } from '@aihot/backend/jobs/content';
import { BudgetExceededError, completeReceipt, paidRequest, ModelUnavailableError, ReceiptBusyError } from '@aihot/backend/providers/receipts';
import { SELECTION } from '@aihot/industry/selection';
import { CATEGORIES, LABELS, VERSION, PROMPT_HASH, inputFor, precheck, fingerprint, validateResult } from './core.mjs';
import { runCodex } from './cli.mjs';

export const PAUSE_KEY = 'fde.codex.pause';
export const enabled = () => process.env.FDE_CODEX_ENABLED === 'true';
export const limit = () => Math.max(1,Math.min(20,Math.floor(Number(process.env.FDE_DAILY_LIMIT)||5)));
export async function pause(code:string) {
  await sql`INSERT INTO settings(key,value,updated_by) VALUES(${PAUSE_KEY},${sql.json({code,at:new Date().toISOString()})},'fde-codex')
    ON CONFLICT(key) DO UPDATE SET value=EXCLUDED.value, updated_at=now(),updated_by=EXCLUDED.updated_by`;
}
export async function setupBudget() {
  await sql`INSERT INTO budgets(service,per_minute,per_hour,per_day) VALUES('codex_cli',1,2,${limit()}) ON CONFLICT(service) DO NOTHING`;
}
export async function processResearch(articleId:string, attemptTag?:string) {
  const [source] = await sql<{id:string;enabled:boolean;participation_mode:string}[]>`
    SELECT s.id,s.enabled,s.participation_mode FROM articles a JOIN sources s ON s.id=a.source_id WHERE a.id=${articleId}`;
  if(!source?.id.startsWith('fde-') || source.participation_mode!=='editorial' || !source.enabled) {
    await sql`UPDATE articles SET processing_state='skipped',processing_queued_at=NULL WHERE id=${articleId}`;
    return {state:'out_of_scope'};
  }
  const a=await loadAnalyzeInput(articleId);
  if(!a) return {state:'missing'};
  if(!attemptTag) {
    const done=await sql`SELECT id FROM analyses WHERE article_id=${articleId} AND input_revision=${a.revision}
      AND prompt_version=${`${VERSION}:${PROMPT_HASH}`} LIMIT 1`;
    if(done.length) {
      await sql`UPDATE articles SET processing_queued_at=NULL,processing_retry_at=NULL WHERE id=${articleId} AND revision=${a.revision}`;
      await publishArticle(articleId);return {state:'reused'};
    }
  }
  if(a.bodyStatus==='pending' && !a.bodyText) { await queueProcessing(articleId,{step:'extract'}); return {state:'needs_body'}; }
  const input=inputFor({title:a.title,url:a.url,body:a.bodyText || ''},Number(process.env.FDE_MAX_INPUT_CHARS)||16000);
  const admission=precheck(input);
  if(admission!=='candidate') {
    // No model quota spent on incomplete bodies or obviously unrelated material. No deletion.
    await sql`UPDATE articles SET processing_state=${admission==='skip'?'blocked':'failed'},
      processing_error=${admission==='skip'?'FDE规则未命中；保留原文，可人工复核。':'正文不足，未调用Codex。'},processing_queued_at=NULL WHERE id=${articleId} AND revision=${a.revision}`;
    return {state:admission};
  }
  if(!enabled()) throw new ModelUnavailableError('Codex研究开关未开启');
  const model=process.env.FDE_CODEX_MODEL || 'account-default';
  const identity={key:fingerprint(input,model),reasoning:process.env.FDE_CODEX_REASONING||'low'};
  const receipt=await paidRequest({
    service:'codex_cli',model,purpose:'fde_research',subject:`article:${articleId}@${a.revision}`,
    identity,attemptTag,requestSummary:{version:VERSION,inputChars:input.body.length,truncated:input.truncated,billing:'chatgpt-plan'},
  },async()=>{
    try {
      const response=await runCodex(input);
      return {response:response.result,usage:response.usage}; // No fabricated price: subscription cost stays unknown.
    } catch(error) {
      await pause(error instanceof Error && 'code' in error ? String(error.code) : 'execution_unknown');
      throw error; // The receipt records unknown outcome. No automatic retry/release.
    }
  },async(tx)=>{
    const stopped=await tx`SELECT key FROM settings WHERE key=${PAUSE_KEY}`;
    if(stopped.length) throw new ModelUnavailableError('Codex已暂停，请运行研究状态命令检查后再恢复');
    const [used]=await tx<{n:number}[]>`SELECT count(*)::int AS n FROM receipt_attempts
      WHERE service='codex_cli' AND origin='live' AND started_at>now()-interval '24 hours'`;
    if((used?.n||0)>=limit()) throw new BudgetExceededError('codex_cli','fde rolling day',3600);
  });
  const r=validateResult(receipt.response,input);
  const tier=SELECTION.thresholds[a.source.tier];
  const threshold=tier===undefined ? null : Math.max(tier,SELECTION.classes[a.source.selectionClass||'']?.threshold||0);
  const selected=r.relevance==='relevant' && threshold!==null && r.score>=threshold && r.evidence.length>0;
  const relevance=r.relevance==='relevant'?'pass':r.relevance==='unrelated'?'block':'unknown';
  const stale=await sql.begin(async(tx)=>{
    const [current]=await tx<{revision:number}[]>`SELECT revision FROM articles WHERE id=${articleId} FOR UPDATE`;
    if(!current || current.revision!==a.revision) { await completeReceipt(tx,receipt.receiptId); return true; }
    // Only one analysis for a successful replay. An explicit re-evaluation has its own receipt.
    const previous=await tx`SELECT id FROM analyses WHERE article_id=${articleId} AND input_revision=${a.revision}
      AND ${receipt.receiptId}=ANY(receipt_ids) LIMIT 1`;
    if(!previous.length) await tx`INSERT INTO analyses(article_id,input_revision,origin,model,prompt_version,receipt_ids,
      relevance,category,tags,subjects,title_zh,summary_zh,reason_zh,score,selected,output)
      VALUES(${articleId},${a.revision},'model',${`codex-cli:${model}`},${`${VERSION}:${PROMPT_HASH}`},${[receipt.receiptId]},
      ${relevance},${r.category},${[LABELS[CATEGORIES.indexOf(r.category)]!]},${[] as string[]},${r.title},${r.summary},
      ${r.lessons[0]||null},${r.score},${selected},${tx.json({writer:'codex-single-pass',scope:'unknown',fact:null,
        scores:null,scoreModel:`codex-cli:${model}`,threshold,fdeResearch:r,sourceUrl:a.url,truncated:input.truncated} as never)})`;
    // URL/content identities are maintained by collection. No pretend semantic clustering or event facts.
    await tx`UPDATE articles SET processing_state=${relevance==='block'?'blocked':'analyzed'},processing_error=NULL,
      processing_queued_at=NULL,processing_attempts=0,processing_retry_at=NULL,
      grouping_status='complete',grouped_at=now(),grouping_error=NULL,selection_adds_value=true
      WHERE id=${articleId} AND revision=${a.revision}`;
    await completeReceipt(tx,receipt.receiptId);
    return false;
  });
  if(!stale) await publishArticle(articleId);
  return {state:stale?'stale':'complete',reused:receipt.reused,receiptId:receipt.receiptId};
}
export async function handleResearch(articleId:string,attemptTag?:string) {
  try { return await processResearch(articleId,attemptTag); }
  catch(error) {
    const waiting=error instanceof BudgetExceededError || error instanceof ReceiptBusyError || error instanceof ModelUnavailableError;
    const reason=waiting?'研究暂缓：开关、额度或暂停状态。':'研究失败：查看codex_cli回执并人工处理，禁止自动重复消耗额度。';
    await sql`UPDATE articles SET processing_state=${waiting?'new':'failed'},processing_queued_at=NULL,
      processing_retry_at=now()+interval '1 hour',processing_error=${reason} WHERE id=${articleId}`;
    return {state:waiting?'waiting':'failed'};
  }
}
