import { collectSource } from './collect.mjs';
import { prepareArticle, precheck, analysisKey, estimateReservation, runAnalysis } from './analysis.mjs';
import { AppError } from './config.mjs';

export class Worker {
  constructor(store,config,{analyzer=runAnalysis,collector=collectSource}={}) {
    this.store=store;this.config=config;this.analyzer=analyzer;this.collector=collector;
    this.busy=false;this.collecting=false;this.stopped=false;this.started=false;
    this.timer=null;this.retainedAt=0;this.analysisTask=null;this.wakeRequested=false;
  }
  input(article){const input=prepareArticle(article,this.config.maxInputChars);if(article.bodyKind==='feed_excerpt')input.truncated=true;return input;}
  enqueue(id,retry=false) {
    if(!this.config.analysisEnabled||this.config.provider==='off')throw new AppError('analysis_disabled','分析尚未开启。请先在运行环境中配置模型和额度。',409);
    const article=this.store.getArticle(id);if(!article)throw new AppError('not_found','没有找到这篇资料。',404);
    const input=this.input(article),admitted=precheck(input);
    if(admitted!=='candidate')throw new AppError(admitted==='needs_body'?'needs_body':'not_candidate',admitted==='needs_body'?'正文不足，请补充正文后再分析。':'资料未通过本地相关性规则，未调用模型。可以继续阅读和保存个人笔记。',409);
    const result=this.store.queue(id,analysisKey(input,this.config),retry);
    // SQLite is the queue. Notify after the write succeeds; startup can recover a missed notification.
    if(result.queued&&this.started)void this.wake();
    return result;
  }
  async analyzeOne() {
    if(this.busy||this.stopped||!this.config.analysisEnabled||this.config.provider==='off'||this.store.setting('analysis_pause'))return 'blocked';
    this.busy=true;
    try{
      const row=this.store.nextQueued();if(!row)return 'empty';
      const article=this.store.getArticle(row.id),input=this.input(article),key=analysisKey(input,this.config);
      const admitted=precheck(input);
      if(admitted!=='candidate'){
        this.store.markStatus(article.id,admitted==='needs_body'?'needs_body':'skipped');
        return 'progressed';
      }
      const attempt=this.store.beginAttempt(article.id,key,this.config,estimateReservation(this.config,input));
      if(attempt.cached)return 'progressed';
      try{const output=await this.analyzer(this.config,input);this.store.completeAttempt(attempt,output);}
      catch(error){this.store.failAttempt(attempt,error);return 'blocked';}
      return 'progressed';
    }catch(error){
      if(!['daily_limit','monthly_limit','paused','busy','not_queued'].includes(error.code))
        this.store.setSetting('analysis_pause','任务需要人工检查，请查看设置和研究记录。');
      return 'blocked';
    }finally{this.busy=false;}
  }
  wake() {
    if(this.stopped)return Promise.resolve();
    this.wakeRequested=true;
    if(this.analysisTask)return this.analysisTask;
    this.analysisTask=Promise.resolve().then(async()=>{
      while(!this.stopped){
        this.wakeRequested=false;
        const outcome=await this.analyzeOne();
        if(outcome==='progressed')continue;
        if(outcome==='empty'&&this.wakeRequested)continue;
        // A queued but over-budget item must not make this loop spin.
        this.wakeRequested=false;break;
      }
    }).catch(()=>{
      this.store.setSetting('analysis_pause','任务需要人工检查，请查看设置和研究记录。');
    }).finally(()=>{
      this.analysisTask=null;
      if(this.wakeRequested&&!this.stopped)void this.wake();
    });
    return this.analysisTask;
  }
  refill() {
    const c=this.config;
    if(this.stopped||!c.autoAnalyze||!c.analysisEnabled||c.provider==='off'||this.store.setting('analysis_pause'))return 0;
    const {stats,usage}=this.store.overview(c);
    // Keep the automatic backlog within the remaining daily allowance, including manual queue items.
    return this.store.autoQueue(Math.max(0,c.dailyLimit-usage.attempts24h-stats.queued));
  }
  async collect({force=false}={}) {
    if(!this.config.collectEnabled)throw new AppError('collection_disabled','采集尚未开启，请先在运行环境中开启。',409);
    if(this.collecting)throw new AppError('collection_busy','采集正在进行，请稍候。',409);
    this.collecting=true;let added=0;
    try{
      const due=this.store.sources().filter(s=>s.enabled&&s.kind!=='manual'&&(force||!s.nextFetchAt||Date.parse(s.nextFetchAt)<=Date.now()));
      for(const source of due){
        if(this.stopped)break;
        try{const result=await this.collector(this.store,source,this.config);added+=result.added;this.store.recordSource(source.id,result.added,result.failed?`${result.failed} 篇正文未能读取，可手动补充。`:null);}
        catch(error){this.store.recordSource(source.id,0,error instanceof AppError?error.message:'采集失败，请检查网络或手动导入。');}
        if(this.refill())void this.wake();
      }
      return {added};
    }finally{this.collecting=false;}
  }
  async tick() {
    if(this.stopped)return;
    if(Date.now()-this.retainedAt>86400000){this.store.retention(this.config.rawRetentionDays);this.retainedAt=Date.now();}
    this.refill();
    // Collection is ordinary I/O; a slow source must not delay already queued analysis.
    if(this.config.collectEnabled&&!this.collecting)void this.collect().catch(()=>{});
    await this.wake();
  }
  start(){
    if(this.started||this.stopped)return;
    this.started=true;void this.wake();
    const loop=()=>{if(this.stopped)return;void this.tick().catch(()=>{});this.timer=setTimeout(loop,60000);};
    this.timer=setTimeout(loop,1000);
  }
  async stop(){this.stopped=true;clearTimeout(this.timer);await this.analysisTask;while(this.busy||this.collecting)await new Promise(r=>setTimeout(r,100));}
}
