import { collectSource } from './collect.mjs';
import { prepareArticle, precheck, analysisKey, estimateReservation, runAnalysis, estimateStructuredReservation, runStructured } from './analysis.mjs';
import { prepareEditorial, templateEditorial, editorialFingerprint, estimateEditorialReservation, runEditorial } from './editorial.mjs';
import { translationTask } from './translation.mjs';
import { AppError } from './config.mjs';

export class Worker {
  constructor(store,config,{analyzer=runAnalysis,editor=runEditorial,translator=runStructured,collector=collectSource,discovery}={}) {
    this.store=store;this.config=config;this.analyzer=analyzer;this.editor=editor;this.collector=collector;
    this.translator=translator;
    this.discovery=discovery;
    this.busy=false;this.collecting=false;this.stopped=false;this.started=false;
    this.timer=null;this.retainedAt=0;this.analysisTask=null;this.wakeRequested=false;
  }
  input(article){const input=prepareArticle(article,this.config.maxInputChars);if(article.bodyKind==='feed_excerpt')input.truncated=true;return input;}
  enqueue(id,retry=false) {
    if(!this.config.analysisEnabled||this.config.provider==='off')throw new AppError('analysis_disabled','分析尚未开启。请先在运行环境中配置模型。',409);
    const article=this.store.getArticle(id);if(!article)throw new AppError('not_found','没有找到这篇资料。',404);
    const input=this.input(article),admitted=precheck(input);
    if(admitted!=='candidate')throw new AppError(admitted==='needs_body'?'needs_body':'not_candidate',admitted==='needs_body'?'正文不足，请补充正文后再分析。':'资料未通过本地相关性规则，未调用模型。可以继续阅读和保存个人笔记。',409);
    const result=this.store.queue(id,analysisKey(input,this.config),retry);
    // SQLite is the queue. Notify after the write succeeds; startup can recover a missed notification.
    if(result.queued&&this.started)void this.wake();
    return result;
  }
  createEditorial({articleIds,angle,format,mode}={}) {
    if(!Array.isArray(articleIds)||articleIds.length<1||articleIds.length>3||new Set(articleIds).size!==articleIds.length||
      articleIds.some(id=>typeof id!=='string'||id.length>100))throw new AppError('invalid_sources','请选择一至三篇不同的已分析资料。');
    const articles=articleIds.map(id=>this.store.getArticle(id));
    if(articles.some(article=>!article))throw new AppError('not_found','所选资料已不存在，请重新选择。',404);
    const input=prepareEditorial(articles,{angle,format,mode},this.config);
    if(input.spec.mode==='model'&&(!this.config.analysisEnabled||this.config.provider==='off'))
      throw new AppError('analysis_disabled','模型写作尚未开启。仍可生成不调用模型的素材初稿。',409);
    const output=this.store.createEditorial(input,{result:input.spec.mode==='template'?templateEditorial(input):null});
    if(output.draft.status==='queued'&&this.started)void this.wake();
    return {...output,message:output.cached?'已复用已保存的草稿及其状态，没有创建重复模型任务。':
      input.spec.mode==='template'?'素材初稿已保存，没有调用模型。':'写作任务已保存。执行后会计入模型用量。'};
  }
  retryEditorial(id) {
    if(!this.config.analysisEnabled||this.config.provider==='off')throw new AppError('analysis_disabled','模型写作尚未开启，请先检查运行配置。',409);
    const draft=this.store.queueEditorialRetry(id);
    if(this.started)void this.wake();
    return {draft,cached:false,message:'已安排写作重试。新请求仍受预算和暂停状态限制。'};
  }
  translationInput(id) {
    const article=this.store.getArticle(id);
    if(!article)throw new AppError('not_found','没有找到这篇资料。',404);
    return translationTask(article,this.config);
  }
  translationStatus(id) {
    const task=this.translationInput(id);
    return this.store.translationStatus(id,task.fingerprint);
  }
  translate(id,retry=false) {
    const task=this.translationInput(id);
    const current=this.store.translationStatus(id,task.fingerprint);
    if(['completed','running'].includes(current.status))return current;
    if(!this.config.analysisEnabled||this.config.provider==='off')throw new AppError('analysis_disabled','模型尚未开启，请先检查部署配置。',409);
    if(this.stopped||this.busy||this.analysisTask)throw new AppError('busy','已有模型任务正在处理，请稍后再翻译。',409);
    const attempt=this.store.beginTranslation(id,task.fingerprint,this.config,estimateStructuredReservation(this.config,task),retry);
    if(!attempt)return this.store.translationStatus(id,task.fingerprint);
    this.busy=true;
    this.analysisTask=Promise.resolve().then(async()=>{
      try{this.store.completeAttempt(attempt,await this.translator(this.config,task));}
      catch(error){this.store.failAttempt(attempt,error);}
    }).catch(()=>{
      this.store.setSetting('analysis_pause','任务需要人工检查，请查看设置和研究记录。');
    }).finally(()=>{
      this.busy=false;this.analysisTask=null;
      if(!this.stopped&&(this.started||this.wakeRequested))void this.wake();
    });
    return {status:'running',result:null};
  }
  async analyzeOne() {
    if(this.busy||this.stopped||!this.config.analysisEnabled||this.config.provider==='off'||this.store.setting('analysis_pause'))return 'blocked';
    this.busy=true;
    try{
      // Explicit writing requests share the same consumer and ledger, ahead of the analysis backlog.
      const draft=this.store.nextEditorialQueued();
      if(draft){
        if(editorialFingerprint(draft.sources,draft.spec,this.config)!==draft.fingerprint){
          this.store.blockEditorial(draft.id,'写作配置已变化，本次未调用模型，请以当前配置重新创建草稿。');
          return 'progressed';
        }
        const input={sources:draft.sources,spec:draft.spec,fingerprint:draft.fingerprint};
        const attempt=this.store.beginEditorialAttempt(draft.id,this.config,estimateEditorialReservation(this.config,input));
        try{const output=await this.editor(this.config,input);this.store.completeEditorialAttempt(attempt,output);}
        catch(error){this.store.failEditorialAttempt(attempt,error);return 'blocked';}
        return 'progressed';
      }
      const row=this.store.nextQueued(this.config.autoAnalyze);if(!row)return 'empty';
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
    const {stats,usage,config}=this.store.overview(c);
    return this.store.autoQueue(Math.max(0,config.dailyLimit-usage.autoAttempts24h-stats.autoQueued));
  }
  async collect({manual=false}={}) {
    if(!this.config.collectEnabled&&!manual)throw new AppError('collection_disabled','定时采集尚未开启。',409);
    if(this.collecting)throw new AppError('collection_busy','采集正在进行，请稍候。',409);
    this.collecting=true;let added=0;
    try{
      const cutoff=Date.now()-(manual?5*60000:0);
      const due=this.store.sources().filter(source=>{
        const last=manual?source.lastCheckedAt:source.nextFetchAt;
        return source.enabled&&source.kind!=='manual'&&(!last||Date.parse(last)<=cutoff);
      }).sort((a,b)=>(a.lastCheckedAt||'').localeCompare(b.lastCheckedAt||''));
      for(const source of due){
        if(this.stopped)break;
        const {dailyLimit,addedToday}=this.store.collectionLimits();
        if(addedToday>=dailyLimit)break;
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
    if(this.config.collectEnabled&&!this.discoveryTask&&this.discovery){
      this.discoveryTask=this.discovery.refreshWatched().catch(()=>{}).finally(()=>{this.discoveryTask=null;});
    }
    await this.wake();
  }
  start(){
    if(this.started||this.stopped)return;
    this.started=true;void this.wake();
    const loop=()=>{if(this.stopped)return;void this.tick().catch(()=>{});this.timer=setTimeout(loop,60000);};
    this.timer=setTimeout(loop,1000);
  }
  async stop(){this.stopped=true;clearTimeout(this.timer);await Promise.all([this.analysisTask,this.discoveryTask]);while(this.busy||this.collecting)await new Promise(r=>setTimeout(r,100));}
}
