import { DatabaseSync, backup } from 'node:sqlite';
import { mkdirSync, chmodSync } from 'node:fs';
import { resolve } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { AppError, MAX_AUTO_DAILY_LIMIT } from './config.mjs';

const EDITORIAL = ['new', 'organized', 'shortlisted', 'drafting', 'published', 'archived'];
const MODEL_WINDOW_MS = 86400000;
const windowStart = now => new Date(now - MODEL_WINDOW_MS).toISOString();
export const hashBody = body => createHash('sha256').update(String(body).normalize('NFKC').replace(/\s+/g, ' ').trim()).digest('hex');
const nowIso = () => new Date().toISOString();
function present(row, body = false) {
  if (!row) return null;
  return { id:row.id, url:row.url, title:row.title, sourceId:row.source_id, sourceName:row.source_name,
    language:row.language, publishedAt:row.published_at, status:row.status, editorialStatus:row.editorial_status, queueOrigin:row.queue_origin,
    personalNotes:row.personal_notes, bodyExcerpt:row.body.slice(0, 240), ...(body ? {body:row.body} : {}),
    bodyKind:row.body_kind, bodyHash:row.body_hash, backfill:!!row.backfill,
    analysis:row.analysis_json ? JSON.parse(row.analysis_json) : null, analysisKey:row.analysis_key,
    priority:row.priority, lastError:row.last_error, createdAt:row.created_at, updatedAt:row.updated_at };
}
export class Store {
  constructor(dataDir, catalog = []) {
    mkdirSync(dataDir, {recursive:true, mode:0o700});
    this.path = resolve(dataDir, 'research.sqlite');
    this.db = new DatabaseSync(this.path);
    chmodSync(this.path, 0o600);
    this.db.exec('PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;');
    const version = this.db.prepare('PRAGMA user_version').get().user_version;
    if (version > 3) { this.db.close(); throw new AppError('newer_database', '数据库版本高于本程序，请使用对应的新版本。'); }
    if (version === 0) this.db.exec(`BEGIN IMMEDIATE;
      CREATE TABLE articles (
        id TEXT PRIMARY KEY, url TEXT NOT NULL UNIQUE, title TEXT NOT NULL, source_id TEXT NOT NULL,
        source_name TEXT NOT NULL, language TEXT NOT NULL DEFAULT 'unknown', published_at TEXT,
        body TEXT NOT NULL DEFAULT '', body_kind TEXT NOT NULL DEFAULT 'page', body_hash TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'candidate', editorial_status TEXT NOT NULL DEFAULT 'new',
        personal_notes TEXT NOT NULL DEFAULT '', analysis_json TEXT, analysis_key TEXT, queue_nonce TEXT,
        backfill INTEGER NOT NULL DEFAULT 0, priority INTEGER NOT NULL DEFAULT 3,
        last_error TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
      );
      CREATE INDEX articles_queue ON articles(status, priority DESC, created_at);
      CREATE TABLE source_state (id TEXT PRIMARY KEY, enabled INTEGER NOT NULL, last_checked_at TEXT,
        next_fetch_at TEXT, last_error TEXT, last_count INTEGER NOT NULL DEFAULT 0);
      CREATE TABLE attempts (id TEXT PRIMARY KEY, article_id TEXT NOT NULL REFERENCES articles(id),
        fingerprint TEXT NOT NULL, nonce TEXT NOT NULL, provider TEXT NOT NULL, model TEXT NOT NULL,
        status TEXT NOT NULL, started_at TEXT NOT NULL, finished_at TEXT, reserved_usd REAL, cost_usd REAL,
        input_tokens INTEGER, cached_input_tokens INTEGER, output_tokens INTEGER, reasoning_tokens INTEGER,
        result_json TEXT, error_code TEXT, request_id TEXT, UNIQUE(fingerprint, nonce));
      CREATE INDEX attempts_budget ON attempts(started_at, provider);
      CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
      PRAGMA user_version=1;
      COMMIT;`);
    // Additive migration: keep the existing articles, receipts, reservations and settings intact.
    if (version < 2) try { this.db.exec(`BEGIN IMMEDIATE;
      CREATE TABLE editorial_drafts (
        id TEXT PRIMARY KEY, fingerprint TEXT NOT NULL UNIQUE, sources_json TEXT NOT NULL,
        spec_json TEXT NOT NULL, status TEXT NOT NULL, result_json TEXT, generated_json TEXT,
        revision INTEGER NOT NULL DEFAULT 1, queue_nonce TEXT NOT NULL DEFAULT '',
        attempt_id TEXT, last_error TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
      );
      CREATE INDEX editorial_queue ON editorial_drafts(status,created_at);
      ALTER TABLE attempts ADD COLUMN kind TEXT NOT NULL DEFAULT 'analysis';
      ALTER TABLE attempts ADD COLUMN draft_id TEXT REFERENCES editorial_drafts(id);
      PRAGMA user_version=2;
      COMMIT;`); }
    catch {
      try { this.db.exec('ROLLBACK'); } catch { /* SQLite may already have rolled back the transaction. */ }
      this.db.close();
      throw new AppError('migration_failed','资料库升级未完成，请保留数据库与备份，并检查文件权限和可用空间。');
    }
    if (version < 3) try { this.db.exec(`BEGIN IMMEDIATE;
      ALTER TABLE articles ADD COLUMN queue_origin TEXT CHECK(queue_origin IN ('manual','auto','legacy'));
      UPDATE articles SET queue_origin='legacy' WHERE status IN ('queued','analyzing');
      ALTER TABLE attempts ADD COLUMN origin TEXT NOT NULL DEFAULT 'legacy' CHECK(origin IN ('manual','auto','legacy'));
      CREATE INDEX attempts_origin_window ON attempts(origin,started_at);
      CREATE INDEX articles_collection_day ON articles(created_at) WHERE source_id<>'manual';
      PRAGMA user_version=3;
      COMMIT;`); }
    catch {
      try { this.db.exec('ROLLBACK'); } catch { /* SQLite may already have rolled back the transaction. */ }
      this.db.close();
      throw new AppError('migration_failed','资料库升级未完成，请保留数据库与备份，并检查文件权限和可用空间。');
    }
    this.catalog = catalog;
    for (const s of catalog) this.db.prepare('INSERT OR IGNORE INTO source_state(id,enabled) VALUES(?,?)').run(s.id, s.enabled ? 1 : 0);
  }
  close() { this.db.close(); }
  transaction(fn) {
    this.db.exec('BEGIN IMMEDIATE');
    try { const out = fn(); this.db.exec('COMMIT'); return out; }
    catch (error) { try { this.db.exec('ROLLBACK'); } catch {} throw error; }
  }
  setting(key) { return this.db.prepare('SELECT value FROM settings WHERE key=?').get(key)?.value ?? null; }
  setSetting(key, value) {
    if (value === null) this.db.prepare('DELETE FROM settings WHERE key=?').run(key);
    else this.db.prepare('INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').run(key, String(value));
  }
  automaticDailyLimit(config) {
    const saved=Number(this.setting('auto_daily_limit'));
    return Number.isInteger(saved)&&saved>=1&&saved<=MAX_AUTO_DAILY_LIMIT?saved:config.dailyLimit;
  }
  setAutomaticDailyLimit(limit) {
    if (!Number.isSafeInteger(limit)||limit<1||limit>MAX_AUTO_DAILY_LIMIT)
      throw new AppError('invalid_auto_limit',`请输入 1–${MAX_AUTO_DAILY_LIMIT} 之间的整数。`);
    this.setSetting('auto_daily_limit',limit);
  }
  collectionLimits(now = Date.now()) {
    const lookbackDays=Number(this.setting('collection_lookback_days'))||30;
    const dailyLimit=Number(this.setting('collection_daily_limit'))||50;
    const today=new Date(now);today.setHours(0,0,0,0);
    const tomorrow=new Date(today);tomorrow.setDate(today.getDate()+1);
    const oldest=new Date(today);oldest.setDate(today.getDate()-lookbackDays+1);
    const addedToday=this.db.prepare("SELECT count(*) n FROM articles WHERE source_id<>'manual' AND created_at>=? AND created_at<?")
      .get(today.toISOString(),tomorrow.toISOString()).n;
    return {lookbackDays,dailyLimit,addedToday,oldestAt:oldest.getTime(),dayEndAt:tomorrow.getTime()};
  }
  setCollectionLimits({lookbackDays,dailyLimit}) {
    if(!Number.isSafeInteger(lookbackDays)||lookbackDays<1||lookbackDays>365)
      throw new AppError('invalid_collection_days','请输入 1 到 365 之间的天数。');
    if(!Number.isSafeInteger(dailyLimit)||dailyLimit<1||dailyLimit>200)
      throw new AppError('invalid_collection_limit','请输入 1 到 200 之间的篇数。');
    this.transaction(()=>{
      this.setSetting('collection_lookback_days',lookbackDays);
      this.setSetting('collection_daily_limit',dailyLimit);
    });
  }
  getArticle(id) { return present(this.db.prepare('SELECT * FROM articles WHERE id=?').get(id), true); }
  findUrl(url) { return present(this.db.prepare('SELECT * FROM articles WHERE url=?').get(url), true); }
  upsertArticle(a, {updateExisting = false, maxArticles = 10000} = {}) {
    const old = this.findUrl(a.url);
    const body = String(a.body || '').slice(0, 120000), bodyHash = hashBody(body), timestamp = nowIso();
    if (old) {
      if (updateExisting && body && bodyHash !== old.bodyHash) {
        this.db.prepare(`UPDATE articles SET body=?,body_hash=?,body_kind=?,title=?,status=?,backfill=?,analysis_json=NULL,
          analysis_key=NULL,queue_nonce=NULL,queue_origin=NULL,last_error=NULL,updated_at=? WHERE id=?`).run(body, bodyHash, a.bodyKind || 'manual', a.title || old.title, a.status || 'candidate',
          (a.backfill===undefined?old.backfill:a.backfill)?1:0,timestamp,old.id);
      }
      return {article:this.getArticle(old.id), created:false};
    }
    if (this.db.prepare('SELECT count(*) n FROM articles').get().n >= maxArticles)
      throw new AppError('storage_limit', '资料数量已达上限，请先导出并整理旧资料。', 409);
    const id = randomUUID();
    this.db.prepare(`INSERT INTO articles(id,url,title,source_id,source_name,language,published_at,body,body_kind,body_hash,status,backfill,priority,created_at,updated_at)
      VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(id, a.url, String(a.title || a.url).slice(0,300), a.sourceId || 'manual', a.sourceName || '手动收录',
      a.language || 'unknown', a.publishedAt || null, body, a.bodyKind || 'page', bodyHash, a.status || (body.length >= 180 ? 'candidate' : 'needs_body'), a.backfill ? 1 : 0,
      a.priority || 3, timestamp, timestamp);
    return {article:this.getArticle(id), created:true};
  }
  listArticles({q='',status='',editorialStatus='',limit=50,offset=0} = {}) {
    const where = ['1=1'], args = [];
    if (q) { where.push("(title LIKE ? ESCAPE '\\' OR personal_notes LIKE ? ESCAPE '\\' OR analysis_json LIKE ? ESCAPE '\\')"); const pattern=`%${String(q).slice(0,200).replace(/[\\%_]/g,'\\$&')}%`; args.push(pattern,pattern,pattern); }
    if (status) { where.push('status=?'); args.push(status); }
    if (editorialStatus) { where.push('editorial_status=?'); args.push(editorialStatus); }
    const filter=where.join(' AND ');
    return {total:this.db.prepare(`SELECT count(*) n FROM articles WHERE ${filter}`).get(...args).n,
      items:this.db.prepare(`SELECT * FROM articles WHERE ${filter} ORDER BY created_at DESC,id DESC LIMIT ? OFFSET ?`).all(...args, Math.max(1,Math.min(100,Number(limit)||50)), Math.max(0,Number(offset)||0)).map(r=>present(r))};
  }
  editArticle(id, patch) {
    if (!this.getArticle(id)) throw new AppError('not_found','没有找到这篇资料。',404);
    if (patch.editorialStatus !== undefined) {
      if (!EDITORIAL.includes(patch.editorialStatus)) throw new AppError('invalid_status','请选择有效的选题状态。');
      this.db.prepare('UPDATE articles SET editorial_status=?,updated_at=? WHERE id=?').run(patch.editorialStatus,nowIso(),id);
    }
    if (patch.personalNotes !== undefined) {
      if (typeof patch.personalNotes !== 'string' || patch.personalNotes.length > 10000) throw new AppError('invalid_notes','笔记最多 10000 个字符。');
      this.db.prepare('UPDATE articles SET personal_notes=?,updated_at=? WHERE id=?').run(patch.personalNotes,nowIso(),id);
    }
    return this.getArticle(id);
  }
  markStatus(id,status,error=null) { this.db.prepare('UPDATE articles SET status=?,last_error=?,updated_at=? WHERE id=?').run(status,error,nowIso(),id); }
  queue(id, key, retry = false) {
    const a=this.getArticle(id);
    if (!a) throw new AppError('not_found','没有找到这篇资料。',404);
    if (a.status === 'analyzing') throw new AppError('busy','这篇资料正在分析，请等待结果。',409);
    if (!a.body || a.body.length < 180) throw new AppError('needs_body','正文不足，请通过手动收录粘贴原文后再分析。');
    if (!retry && a.analysisKey === key && a.analysis) return {queued:false,cached:true,message:'已复用现有研究结果，没有新模型请求。'};
    if (a.status === 'queued') {
      this.db.prepare("UPDATE articles SET queue_origin='manual' WHERE id=? AND status='queued' AND queue_origin IS NOT 'manual'").run(id);
      return {queued:true,cached:false,message:'已安排手动分析。'};
    }
    const prior=this.db.prepare("SELECT status FROM attempts WHERE fingerprint=? AND kind='analysis' AND status IN ('unknown','failed','running') LIMIT 1").get(key);
    if (prior && !retry) throw new AppError('retry_confirmation','之前的请求可能已消耗额度，请明确确认重试。',409);
    this.db.prepare("UPDATE articles SET status='queued',queue_origin='manual',queue_nonce=?,last_error=NULL,updated_at=? WHERE id=?").run(retry ? randomUUID() : '',nowIso(),id);
    return {queued:true,cached:false,message:'已加入分析队列。'};
  }
  nextQueued(allowAutomatic = false) {
    return this.db.prepare(`SELECT * FROM articles WHERE status='queued' AND (? OR COALESCE(queue_origin,'manual')='manual')
      ORDER BY COALESCE(queue_origin,'manual')<>'manual',priority DESC,created_at LIMIT 1`).get(allowAutomatic?1:0);
  }
  autoQueue(limit=5) {
    if(limit<=0)return 0;
    const rows=this.db.prepare("SELECT id FROM articles WHERE status='candidate' AND backfill=0 AND editorial_status!='archived' ORDER BY priority DESC,created_at DESC LIMIT ?").all(limit);
    for(const r of rows) this.db.prepare("UPDATE articles SET status='queued',queue_origin='auto',queue_nonce='' WHERE id=? AND status='candidate'").run(r.id);
    return rows.length;
  }
  assertModelSlot() {
    const paused=this.setting('analysis_pause');
    if(paused) throw new AppError('paused',`模型任务已暂停：${paused}`,409);
    if(this.db.prepare("SELECT id FROM attempts WHERE status='running' LIMIT 1").get())
      throw new AppError('busy','已有模型任务正在执行。',409);
  }
  assertBudget(config,reservation,timestamp,origin='manual') {
    if(origin==='auto') {
      const n=this.db.prepare("SELECT count(*) n FROM attempts WHERE origin='auto' AND started_at>?").get(windowStart(Date.parse(timestamp))).n;
      if(n>=this.automaticDailyLimit(config)) throw new AppError('daily_limit','自动分析已达到滚动 24 小时上限。',409);
    }
    if(config.provider==='api') {
      if(!Number.isFinite(reservation) || reservation<=0) throw new AppError('invalid_reservation','无法计算请求预算，请检查模型价格配置。');
      const used=this.db.prepare("SELECT COALESCE(sum(COALESCE(cost_usd,reserved_usd,0)),0) n FROM attempts WHERE provider='api' AND started_at>=?").get(timestamp.slice(0,7)+'-01T00:00:00.000Z').n;
      if(used+reservation>config.monthlyBudgetUsd) throw new AppError('monthly_limit','本月预算不足以预留这次模型任务，任务会等待。',409);
    }
  }
  beginAttempt(articleId, key, config, reservation) {
    return this.transaction(()=>{
      this.assertModelSlot();
      const row=this.db.prepare("SELECT * FROM articles WHERE id=? AND status='queued'").get(articleId);
      if(!row) throw new AppError('not_queued','任务已改变，请刷新后查看。',409);
      const nonce=row.queue_nonce || '';
      const cached=this.db.prepare("SELECT * FROM attempts WHERE fingerprint=? AND nonce=? AND kind='analysis'").get(key,nonce);
      if(cached?.status==='completed' && cached.result_json) {
        this.db.prepare("UPDATE articles SET analysis_json=?,analysis_key=?,status='analyzed',updated_at=? WHERE id=?").run(cached.result_json,key,nowIso(),articleId);
        return {cached:true};
      }
      if(cached) throw new AppError('retry_confirmation','请求结果不明确，需要手动确认重试。',409);
      const timestamp=nowIso();
      const origin=row.queue_origin==='auto'||row.queue_origin==='legacy'?'auto':'manual';
      if(origin==='auto'&&!config.autoAnalyze)throw new AppError('not_queued','自动分析已关闭。',409);
      this.assertBudget(config,reservation,timestamp,origin);
      const id=randomUUID();
      this.db.prepare('INSERT INTO attempts(id,article_id,fingerprint,nonce,provider,model,status,started_at,reserved_usd,origin) VALUES(?,?,?,?,?,?,?,?,?,?)').run(id,articleId,key,nonce,config.provider,config.model,'running',timestamp,reservation,origin);
      this.markStatus(articleId,'analyzing');
      return {id,articleId,key,bodyHash:row.body_hash,cached:false};
    });
  }
  translationStatus(articleId, key) {
    const row = this.db.prepare("SELECT status,result_json FROM attempts WHERE article_id=? AND fingerprint=? AND kind='translation' ORDER BY started_at DESC,id DESC LIMIT 1").get(articleId,key);
    return { status:row?.status??'not_requested', result:row?.status==='completed'&&row.result_json?JSON.parse(row.result_json):null };
  }
  beginTranslation(articleId, key, config, reservation, retry) {
    return this.transaction(()=>{
      const prior=this.translationStatus(articleId,key);
      if(prior.status==='running'||prior.status==='completed')return null;
      if(prior.status!=='not_requested'&&!retry)throw new AppError('retry_confirmation','这次翻译可能已消耗额度，请核对用量后再明确重试。',409);
      this.assertModelSlot();
      const timestamp=nowIso(),id=randomUUID();
      this.assertBudget(config,reservation,timestamp);
      this.db.prepare("INSERT INTO attempts(id,article_id,fingerprint,nonce,provider,model,status,started_at,reserved_usd,kind,origin) VALUES(?,?,?,?,?,?,'running',?,?,'translation','manual')")
        .run(id,articleId,key,retry?randomUUID():'',config.provider,config.model,timestamp,reservation);
      return {id,articleId,key,kind:'translation'};
    });
  }
  completeAttempt(attempt, output) {
    this.transaction(()=>{
      const u=output.usage || {}, json=JSON.stringify(output.result), timestamp=nowIso();
      this.db.prepare(`UPDATE attempts SET status='completed',finished_at=?,cost_usd=?,input_tokens=?,cached_input_tokens=?,output_tokens=?,reasoning_tokens=?,result_json=?,request_id=? WHERE id=?`).run(
        timestamp,output.costUsd??null,u.inputTokens??null,u.cachedInputTokens??null,u.outputTokens??null,u.reasoningTokens??null,json,output.requestId||null,attempt.id);
      if(attempt.kind!=='translation')
        this.db.prepare("UPDATE articles SET status='analyzed',analysis_json=?,analysis_key=?,last_error=NULL,updated_at=? WHERE id=? AND body_hash=?").run(json,attempt.key,timestamp,attempt.articleId,attempt.bodyHash);
    });
  }
  failAttempt(attempt, error) {
    this.transaction(()=>{
      const code=typeof error.code==='string' && /^[a-z0-9_]{1,64}$/.test(error.code) ? error.code : 'analysis_failed';
      const u=error.usage || {},knownCost=Number.isFinite(error.costUsd)&&error.costUsd>=0?error.costUsd:null;
      this.db.prepare(`UPDATE attempts SET status='unknown',finished_at=?,error_code=?,cost_usd=?,input_tokens=?,cached_input_tokens=?,output_tokens=?,reasoning_tokens=?,request_id=? WHERE id=?`).run(
        nowIso(),code,knownCost,u.inputTokens??null,u.cachedInputTokens??null,u.outputTokens??null,u.reasoningTokens??null,error.requestId||null,attempt.id);
      if(attempt.kind==='translation'){
        this.setSetting('analysis_pause','上次翻译未完成。请核对账号、网络和用量，再恢复任务。');
      }else{
        this.db.prepare("UPDATE articles SET status='failed',last_error=?,updated_at=? WHERE id=? AND body_hash=?").run('分析未完成，请核对用量后决定是否重试。',nowIso(),attempt.articleId,attempt.bodyHash);
        this.setSetting('analysis_pause','上次分析未完成。请核对账号、网络和用量，再恢复任务。');
      }
    });
  }
  recoverInterrupted() {
    const n=this.db.prepare("SELECT count(*) n FROM attempts WHERE status='running'").get().n;
    if(n) this.transaction(()=>{
      this.db.exec("UPDATE articles SET status='failed',last_error='程序在分析期间退出，请核对用量后重试。' WHERE status='analyzing';");
      this.db.prepare("UPDATE editorial_drafts SET status='unknown',last_error=?,revision=revision+1,updated_at=? WHERE status='writing'").run('程序在写作期间退出，请核对用量后决定是否重试。',nowIso());
      this.db.exec("UPDATE attempts SET status='unknown',error_code='interrupted' WHERE status='running';");
      this.setSetting('analysis_pause','检测到中断的模型请求，已保留预算且不会自动重发。');
    });
    return n;
  }
  presentEditorial(row) {
    if(!row)return null;
    const sources=JSON.parse(row.sources_json);
    const staleSources=sources.some(source=>{
      const article=this.getArticle(source.articleId);
      return !article || article.bodyHash!==source.bodyHash || article.analysisKey!==source.analysisKey ||
        JSON.stringify(article.analysis)!==JSON.stringify(source.analysis);
    });
    return {id:row.id,fingerprint:row.fingerprint,sources,spec:JSON.parse(row.spec_json),status:row.status,
      result:row.result_json?JSON.parse(row.result_json):null,generatedResult:row.generated_json?JSON.parse(row.generated_json):null,
      revision:row.revision,createdAt:row.created_at,updatedAt:row.updated_at,attemptId:row.attempt_id,lastError:row.last_error,staleSources};
  }
  createEditorial(input,{result=null}={}) {
    return this.transaction(()=>{
      const existing=this.db.prepare('SELECT * FROM editorial_drafts WHERE fingerprint=?').get(input.fingerprint);
      if(existing)return {draft:this.presentEditorial(existing),cached:true};
      const id=randomUUID(),timestamp=nowIso();
      this.db.prepare(`INSERT INTO editorial_drafts(id,fingerprint,sources_json,spec_json,status,result_json,created_at,updated_at)
        VALUES(?,?,?,?,?,?,?,?)`).run(id,input.fingerprint,JSON.stringify(input.sources),JSON.stringify(input.spec),
        input.spec.mode==='template'?'ready':'queued',result===null?null:JSON.stringify(result),timestamp,timestamp);
      return {draft:this.getEditorial(id),cached:false};
    });
  }
  getEditorial(id) {return this.presentEditorial(this.db.prepare('SELECT * FROM editorial_drafts WHERE id=?').get(id));}
  listEditorial() {return this.db.prepare('SELECT * FROM editorial_drafts ORDER BY updated_at DESC,id DESC LIMIT 100').all().map(row=>this.presentEditorial(row));}
  editEditorial(id,result,expectedRevision) {
    if(!Number.isSafeInteger(expectedRevision)||expectedRevision<1)throw new AppError('invalid_revision','草稿版本不正确，请刷新后重试。');
    return this.transaction(()=>{
      const draft=this.getEditorial(id);
      if(!draft)throw new AppError('not_found','没有找到这份草稿。',404);
      if(draft.revision!==expectedRevision)throw new AppError('revision_conflict','草稿已在其他页面更新。请保留当前修改并重新读取最新版本。',409);
      if(draft.status!=='ready')throw new AppError('draft_not_ready','草稿尚未生成完成，暂时不能修改正文。',409);
      this.db.prepare('UPDATE editorial_drafts SET result_json=?,revision=revision+1,updated_at=? WHERE id=?').run(JSON.stringify(result),nowIso(),id);
      return this.getEditorial(id);
    });
  }
  queueEditorialRetry(id) {
    return this.transaction(()=>{
      const draft=this.getEditorial(id);
      if(!draft)throw new AppError('not_found','没有找到这份草稿。',404);
      if(draft.status!=='unknown')throw new AppError('retry_not_allowed','只有结果不明确的写作任务可以确认重试。',409);
      this.db.prepare("UPDATE editorial_drafts SET status='queued',queue_nonce=?,last_error=NULL,revision=revision+1,updated_at=? WHERE id=?").run(randomUUID(),nowIso(),id);
      return this.getEditorial(id);
    });
  }
  blockEditorial(id,message) {
    this.db.prepare("UPDATE editorial_drafts SET status='blocked',last_error=?,revision=revision+1,updated_at=? WHERE id=? AND status='queued'").run(message,nowIso(),id);
    return this.getEditorial(id);
  }
  nextEditorialQueued() {return this.presentEditorial(this.db.prepare("SELECT * FROM editorial_drafts WHERE status='queued' ORDER BY created_at,id LIMIT 1").get());}
  beginEditorialAttempt(draftId,config,reservation) {
    return this.transaction(()=>{
      this.assertModelSlot();
      const row=this.db.prepare("SELECT * FROM editorial_drafts WHERE id=? AND status='queued'").get(draftId);
      if(!row)throw new AppError('not_queued','写作任务已改变，请刷新后查看。',409);
      const prior=this.db.prepare('SELECT id FROM attempts WHERE fingerprint=? AND nonce=?').get(row.fingerprint,row.queue_nonce);
      if(prior)throw new AppError('retry_confirmation','写作请求已经记录，不能自动重复发送。',409);
      const timestamp=nowIso();this.assertBudget(config,reservation,timestamp);
      const id=randomUUID(),articleId=JSON.parse(row.sources_json)[0].articleId;
      this.db.prepare(`INSERT INTO attempts(id,article_id,fingerprint,nonce,provider,model,status,started_at,reserved_usd,kind,draft_id,origin)
        VALUES(?,?,?,?,?,?,?,?,?,'editorial',?,'manual')`).run(id,articleId,row.fingerprint,row.queue_nonce,config.provider,config.model,'running',timestamp,reservation,draftId);
      this.db.prepare("UPDATE editorial_drafts SET status='writing',attempt_id=?,revision=revision+1,updated_at=? WHERE id=?").run(id,timestamp,draftId);
      return {id,draftId,articleId,key:row.fingerprint,cached:false};
    });
  }
  completeEditorialAttempt(attempt,output) {
    this.transaction(()=>{
      const u=output.usage||{},json=JSON.stringify(output.result),timestamp=nowIso();
      const receipt=this.db.prepare(`UPDATE attempts SET status='completed',finished_at=?,cost_usd=?,input_tokens=?,cached_input_tokens=?,output_tokens=?,reasoning_tokens=?,result_json=?,request_id=?
        WHERE id=? AND kind='editorial' AND draft_id=? AND status='running'`).run(timestamp,output.costUsd??null,u.inputTokens??null,u.cachedInputTokens??null,
        u.outputTokens??null,u.reasoningTokens??null,json,output.requestId||null,attempt.id,attempt.draftId);
      if(receipt.changes)this.db.prepare("UPDATE editorial_drafts SET status='ready',result_json=?,generated_json=?,last_error=NULL,revision=revision+1,updated_at=? WHERE id=? AND attempt_id=? AND status='writing'").run(json,json,timestamp,attempt.draftId,attempt.id);
    });
  }
  failEditorialAttempt(attempt,error) {
    this.transaction(()=>{
      const code=typeof error.code==='string'&&/^[a-z0-9_]{1,64}$/.test(error.code)?error.code:'editorial_failed';
      const u=error.usage||{},knownCost=Number.isFinite(error.costUsd)&&error.costUsd>=0?error.costUsd:null,timestamp=nowIso();
      const receipt=this.db.prepare(`UPDATE attempts SET status='unknown',finished_at=?,error_code=?,cost_usd=?,input_tokens=?,cached_input_tokens=?,output_tokens=?,reasoning_tokens=?,request_id=?
        WHERE id=? AND kind='editorial' AND draft_id=? AND status='running'`).run(timestamp,code,knownCost,u.inputTokens??null,u.cachedInputTokens??null,
        u.outputTokens??null,u.reasoningTokens??null,error.requestId||null,attempt.id,attempt.draftId);
      if(receipt.changes){
        this.db.prepare("UPDATE editorial_drafts SET status='unknown',last_error=?,revision=revision+1,updated_at=? WHERE id=? AND attempt_id=? AND status='writing'").run('写作未完成，可能已消耗额度。请核对用量后决定是否重试。',timestamp,attempt.draftId,attempt.id);
        this.setSetting('analysis_pause','上次写作未完成。请核对账号、网络和用量，再恢复模型任务。');
      }
    });
  }
  sources() {
    return this.catalog.map(s=>{const r=this.db.prepare('SELECT * FROM source_state WHERE id=?').get(s.id); return {...s,description:s.notes||'',enabled:!!r?.enabled,lastCheckedAt:r?.last_checked_at||null,lastError:r?.last_error||null,lastCount:r?.last_count||0,nextFetchAt:r?.next_fetch_at||null};});
  }
  setSource(id,enabled) {
    const s=this.catalog.find(s=>s.id===id);
    if(!s) throw new AppError('not_found','没有找到这个信源。',404);
    if(enabled && (s.kind==='manual' || ['disabled','watch'].includes(s.disposition))) throw new AppError('source_unverified','此入口尚未通过自动采集验证，请先手动收录。');
    this.db.prepare('UPDATE source_state SET enabled=? WHERE id=?').run(enabled?1:0,id);
  }
  recordSource(id,count,error=null) {
    const s=this.catalog.find(s=>s.id===id), now=nowIso();
    this.db.prepare('UPDATE source_state SET last_checked_at=?,next_fetch_at=?,last_count=?,last_error=? WHERE id=?').run(now,new Date(Date.now()+Math.max(1,s?.intervalHours||12)*3600000).toISOString(),count,error,id);
  }
  overview(config) {
    const grouped=this.db.prepare('SELECT status,count(*) n FROM articles GROUP BY status').all();
    const stats={total:0,candidate:0,queued:0,analyzed:0,shortlisted:0};
    for(const g of grouped) {stats.total+=g.n;if(g.status in stats)stats[g.status]=g.n;}
    stats.shortlisted=this.db.prepare("SELECT count(*) n FROM articles WHERE editorial_status='shortlisted'").get().n;
    stats.editorialQueued=this.db.prepare("SELECT count(*) n FROM editorial_drafts WHERE status='queued'").get().n;
    stats.autoQueued=this.db.prepare("SELECT count(*) n FROM articles WHERE status='queued' AND queue_origin IN ('auto','legacy')").get().n;
    const month=nowIso().slice(0,7)+'-01T00:00:00.000Z';
    const u=this.db.prepare(`SELECT COALESCE(sum(input_tokens),0) inputTokens,COALESCE(sum(output_tokens),0) outputTokens,
      COALESCE(sum(CASE WHEN provider='api' THEN cost_usd ELSE 0 END),0) monthCostUsd,
      COALESCE(sum(CASE WHEN provider='api' AND cost_usd IS NULL THEN reserved_usd ELSE 0 END),0) monthReservedUsd,
      COALESCE(sum(CASE WHEN provider='codex' THEN 1 ELSE 0 END),0) cliAttemptsMonth FROM attempts WHERE started_at>=?`).get(month);
    const recent=this.db.prepare(`SELECT count(*) attempts24h,COALESCE(sum(CASE WHEN kind='analysis' THEN 1 ELSE 0 END),0) analysisAttempts24h,
      COALESCE(sum(CASE WHEN kind='editorial' THEN 1 ELSE 0 END),0) editorialAttempts24h,
      COALESCE(sum(CASE WHEN kind='translation' THEN 1 ELSE 0 END),0) translationAttempts24h,
      COALESCE(sum(CASE WHEN origin='auto' THEN 1 ELSE 0 END),0) autoAttempts24h FROM attempts WHERE started_at>?`).get(windowStart(Date.now()));
    return {stats,usage:{...u,...recent,costKnown:config.provider==='api'},
      config:{provider:config.provider,model:config.model,analysisEnabled:config.analysisEnabled,collectEnabled:config.collectEnabled,autoAnalyze:config.autoAnalyze,dailyLimit:this.automaticDailyLimit(config),monthlyBudgetUsd:config.monthlyBudgetUsd,editorialMaxOutputTokens:config.editorialMaxOutputTokens},paused:this.setting('analysis_pause')};
  }
  retention(days) {
    // Never delete analyzed material, personal notes, shortlisted topics or receipt history.
    return this.db.prepare(`DELETE FROM articles WHERE status IN ('skipped','candidate','needs_body') AND editorial_status='new' AND personal_notes='' AND analysis_json IS NULL AND created_at<? AND NOT EXISTS(SELECT 1 FROM attempts WHERE attempts.article_id=articles.id)`).run(new Date(Date.now()-days*86400000).toISOString()).changes;
  }
  exportRows() { return this.db.prepare("SELECT * FROM articles WHERE analysis_json IS NOT NULL AND editorial_status!='archived' ORDER BY created_at DESC").all().map(r=>present(r,true)); }
  async backupTo(path) { await backup(this.db,path); chmodSync(path,0o600); }
}
