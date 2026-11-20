import { collectSource } from './collect.mjs';
import { prepareArticle, precheck, analysisKey, estimateReservation, runAnalysis } from './analysis.mjs';
import { AppError } from './config.mjs';

export class Worker {
  constructor(store,config,{analyzer=runAnalysis,collector=collectSource}={}) {
    this.store=store;this.config=config;this.analyzer=analyzer;this.collector=collector;
    this.busy=false;this.collecting=false;this.stopped=false;this.timer=null;this.retainedAt=0;
  }
  input(article){const input=prepareArticle(article,this.config.maxInputChars);if(article.bodyKind==='feed_excerpt')input.truncated=true;return input;}
  enqueue(id,retry=false) {
    if(!this.config.analysisEnabled||this.config.provider==='off')throw new AppError('analysis_disabled','分析尚未开启。请先在运行环境中配置模型和额度。',409);
    const article=this.store.getArticle(id);if(!article)throw new AppError('not_found','没有找到这篇资料。',404);
    const input=this.input(article),admitted=precheck(input);
    if(admitted!=='candidate')throw new AppError(admitted==='needs_body'?'needs_body':'not_candidate',admitted==='needs_body'?'正文不足，请补充正文后再分析。':'资料未通过本地相关性规则，未调用模型。可以继续阅读和保存个人笔记。',409);
    return this.store.queue(id,analysisKey(input,this.config),retry);
  }
  async analyzeOne() {
    if(this.busy||this.stopped||!this.config.analysisEnabled||this.config.provider==='off'||this.store.setting('analysis_pause'))return;
    this.busy=true;
    try{
      const row=this.store.nextQueued();if(!row)return;
      const article=this.store.getArticle(row.id),input=this.input(article),key=analysisKey(input,this.config);
      const admitted=precheck(input);
      if(admitted!=='candidate'){
        this.store.markStatus(article.id,admitted==='needs_body'?'needs_body':'skipped');
        return;
      }
      const attempt=this.store.beginAttempt(article.id,key,this.config,estimateReservation(this.config,input));
      if(attempt.cached)return;
      try{const output=await this.analyzer(this.config,input);this.store.completeAttempt(attempt,output);}
      catch(error){this.store.failAttempt(attempt,error);}
    }catch(error){
      if(!['daily_limit','monthly_limit','paused','busy','not_queued'].includes(error.code))
        this.store.setSetting('analysis_pause','任务需要人工检查，请查看设置和研究记录。');
    }finally{this.busy=false;}
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
      }
      return {added};
    }finally{this.collecting=false;}
  }
  async tick() {
    if(this.stopped)return;
    if(Date.now()-this.retainedAt>86400000){this.store.retention(this.config.rawRetentionDays);this.retainedAt=Date.now();}
    if(this.config.collectEnabled&&!this.collecting)await this.collect().catch(()=>{});
    if(this.config.autoAnalyze&&this.config.analysisEnabled)this.store.autoQueue(this.config.dailyLimit);
    await this.analyzeOne();
  }
  start(){const loop=async()=>{await this.tick();if(!this.stopped)this.timer=setTimeout(loop,60000);};this.timer=setTimeout(loop,1000);}
  async stop(){this.stopped=true;clearTimeout(this.timer);while(this.busy||this.collecting)await new Promise(r=>setTimeout(r,100));}
}
