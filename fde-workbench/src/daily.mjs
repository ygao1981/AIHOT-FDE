import { AppError } from './config.mjs';
import { assessResearch } from './relevance.mjs';
import { researchKey } from './research-url.mjs';

const PREFERENCES=[
  {id:'knowledge',label:'企业知识库与智能客服',words:'知识库,客服,RAG,retrieval,customer support',weight:3},
  {id:'integration',label:'业务系统集成',words:'系统集成,传统系统,integration,legacy system,ERP,CRM',weight:3},
  {id:'industry',label:'工业、仓储物流及运维',words:'工业,WCS,仓储,设备运维,物流,warehouse,manufacturing,maintenance',weight:3},
  {id:'software',label:'企业软件开发效率',words:'软件开发,coding agent,developer productivity,code review,开发效率',weight:2},
  {id:'delivery',label:'售前、投标与交付',words:'售前,投标,技术交付,forward deployed,client delivery,客户协作',weight:3},
  {id:'outcomes',label:'可验证的降本增效',words:'降本,增效,latency,cost,baseline,throughput,基线',weight:2},
  {id:'tools',label:'可复用开源工程方法',words:'开源,Skill,MCP,open source,教程,架构,评测,evals',weight:2},
];
const FEEDBACK={
  follow:['值得继续关注',2],proposal:['可用于企业方案',3],wechat:['适合公众号选题',2],practical:['有实际工程价值',2],
  theory:['偏理论，暂不关注',-1],promo:['营销或课程推广',-3],duplicate:['重复内容',-3],unrelated:['与研究方向无关',-3],
};
const SECTIONS={practice:'企业落地实践',method:'工程研究与方法',lead:'值得关注的线索'};
const SIGNALS={reproduction:'复现线索',maintainer_answer:'项目成员答复'};
const datePart=d=>[d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-');
const labelFor={hn:'Hacker News',github:'GitHub',x:'X'};
const authorsFor=rows=>rows.filter(row=>row.author).map(row=>labelFor[row.channel]+' / '+row.author.toLowerCase());

function bounds(day,now) {
  const value=day||datePart(now);
  if(!/^\d{4}-\d{2}-\d{2}$/.test(value))throw new AppError('invalid_research_day','请选择有效日期。');
  const start=new Date(value+'T00:00:00');
  if(!Number.isFinite(+start)||datePart(start)!==value)throw new AppError('invalid_research_day','请选择有效日期。');
  const end=new Date(start);end.setDate(end.getDate()+1);
  return {day:value,today:datePart(now),start:start.toISOString(),end:end.toISOString()};
}

function publishedDay(value) {
  if(!value)return null;
  if(/^\d{4}-\d{2}-\d{2}$/.test(value))return value;
  const date=new Date(value);
  return Number.isFinite(+date)?datePart(date):null;
}

function dateKind(day,value) {
  if(!value)return 'unknown';
  if(value<day)return 'historical';
  return value===day?'published':'outside';
}

function contexts(preferences,title,body,sources,authors) {
  const text=(title+' '+body).toLowerCase();
  const topics=preferences.filter(p=>p.words.split(/[,，]/).some(word=>{
    const term=word.trim().toLowerCase();
    if(!term)return false;
    if(/^[a-z0-9]+$/.test(term))return new RegExp('\\b'+term+'s?\\b','i').test(text);
    return text.includes(term);
  })).map(p=>p.id);
  return {topics,sources:[...new Set(sources)],authors:[...new Set(authors)]};
}

function signals(rows) {
  const weights={topics:new Map(),sources:new Map(),authors:new Map()};
  for(const row of rows){
    const score=FEEDBACK[row.label]?.[1]??0;
    const context=JSON.parse(row.context_json);
    for(const [field,values] of Object.entries(context))
      for(const value of values)weights[field].set(value,(weights[field].get(value)||0)+score);
  }
  return weights;
}

function ranked(items) {
  const all=items.sort((a,b)=>b.score-a.score||b.firstSeen.localeCompare(a.firstSeen)||a.key.localeCompare(b.key));
  if(all.length<=8)return all;
  const usual=all.slice(0,7),known=new Set(usual.flatMap(item=>item.context.sources));
  const rest=all.slice(7);
  const explore=rest.find(item=>item.priority>=2&&item.context.sources.some(source=>!known.has(source)))||
    rest.find(item=>item.priority>=2)||rest[0];
  return [...usual,{...explore,explore:true}];
}

const markdown=value=>String(value??'').replace(/\r?\n/g,' ').replace(/[\\`*_[\]<>]/g,'\\$&');

export class DailyResearch {
  constructor(store,config) {this.store=store;this.config=config;}

  preferences() {
    const stored=this.store.setting('research_preferences');
    return stored?JSON.parse(stored):PREFERENCES;
  }

  profile() {
    const preferences=this.preferences(),adaptive=signals(this.recentFeedback());
    return {preferences,labels:Object.fromEntries(Object.entries(FEEDBACK).map(([id,[label]])=>[id,label])),
      learned:Object.fromEntries(Object.entries(adaptive).map(([field,values])=>[field,[...values].sort((a,b)=>Math.abs(b[1])-Math.abs(a[1])).slice(0,8)
        .map(([name,value])=>({name,adjustment:Math.max(-3,Math.min(3,value/3))}))]))};
  }

  setPreferences({preferences,reset}) {
    if(reset===true){this.store.setSetting('research_preferences',null);return;}
    if(!Array.isArray(preferences)||preferences.length!==PREFERENCES.length||
      preferences.some((item,index)=>item?.id!==PREFERENCES[index].id||typeof item.label!=='string'||!item.label.trim()||
        item.label.length>40||typeof item.words!=='string'||!item.words.trim()||item.words.length>250||
        !Number.isInteger(item.weight)||item.weight< -3||item.weight>5))throw new AppError('invalid_research_preferences','请检查名称、关键词和 -3 至 5 之间的整数权重。');
    this.store.setSetting('research_preferences',JSON.stringify(preferences.map(({id,label,words,weight})=>
      ({id,label:label.trim(),words:words.trim(),weight}))));
  }

  recentFeedback(now=Date.now()) {
    return this.store.db.prepare('SELECT * FROM research_feedback WHERE created_at>=?').all(new Date(now-90*86400000).toISOString());
  }

  feedback({type,id,label,enabled}) {
    if(!Object.hasOwn(FEEDBACK,label)||typeof enabled!=='boolean'||typeof id!=='string'||!id||id.length>4096)
      throw new AppError('invalid_research_feedback','请选择需要保存的反馈。');
    let entry,group,sources=[];
    if(type==='article'){
      entry=this.store.db.prepare('SELECT title,body,source_name,research_key FROM articles WHERE id=?').get(id);
      if(entry){group=entry.research_key;sources=[entry.source_name];}
    }else if(type==='lead'){
      entry=this.store.db.prepare('SELECT * FROM lead_mentions WHERE mention_key=?').get(researchKey(id));
      if(entry)group=entry.related_key||entry.mention_key;
    }
    if(!group)throw new AppError('not_found','这个研究条目已找不到，请刷新页面。',404);
    const mentions=this.store.db.prepare('SELECT channel,author FROM lead_mentions WHERE COALESCE(related_key,mention_key)=?').all(group);
    const context=contexts(this.preferences(),entry.title,entry.body||entry.excerpt||'',
      [...sources,...mentions.map(row=>labelFor[row.channel])],authorsFor(mentions));
    if(enabled)this.store.db.prepare(`INSERT OR IGNORE INTO research_feedback(target_key,label,context_json,created_at) VALUES(?,?,?,?)`)
      .run(group,label,JSON.stringify(context),new Date().toISOString());
    else this.store.db.prepare('DELETE FROM research_feedback WHERE target_key=? AND label=?').run(group,label);
  }

  read(day,now=new Date()) {
    const scope=bounds(day,now),{start,end}=scope,db=this.store.db;
    const articles=db.prepare(`SELECT id,research_key,url,title,source_name,language,published_at,status,editorial_status,
      created_at,analysis_json,body_kind,substr(body,1,16000) body FROM articles WHERE created_at<? AND
      (created_at>=? OR published_at=? OR (length(published_at)>10 AND published_at>=? AND published_at<?))
      ORDER BY analysis_json IS NULL,created_at,id`).all(end,start,scope.day,start,end);
    const leadGroups=db.prepare(`SELECT COALESCE(related_key,mention_key) AS key,MIN(created_at) AS firstSeen
      FROM lead_mentions WHERE created_at<? GROUP BY 1 HAVING MIN(created_at)>=?`).all(end,start);
    const members=db.prepare(`SELECT * FROM lead_mentions WHERE COALESCE(related_key,mention_key)=? AND created_at<?
      ORDER BY priority DESC,created_at LIMIT 20`);
    const observations=rows=>rows.map(row=>({platform:labelFor[row.channel],kind:row.kind,url:row.url,author:row.author,
      points:row.points,comments:row.comments,observedAt:row.checked_at,publishedAt:row.published_at,signal:SIGNALS[row.signal]||null}));
    const preferences=this.preferences(),learned=signals(this.recentFeedback(+now));
    const flags=db.prepare('SELECT label FROM research_feedback WHERE target_key=? ORDER BY label');
    const entries=new Map();
    const review={published:0,older:0,pending:0,analyzed:0,shortlisted:0};
    for(const row of articles){
      if(entries.has(row.research_key))continue;
      const originalDay=publishedDay(row.published_at);
      const check=assessResearch({title:row.title,body:row.body,url:row.url});
      const result=row.analysis_json?JSON.parse(row.analysis_json):null;
      const labels=flags.all(row.research_key).map(value=>value.label);
      const mentions=members.all(row.research_key,end);
      const summary=result?.summary||null;
      const currentShortlist=row.editorial_status==='shortlisted'||labels.includes('wechat');
      if(originalDay===scope.day)review.published++;
      else if(originalDay&&originalDay<scope.day&&row.created_at>=start)review.older++;
      if(['candidate','queued','analyzing','needs_body'].includes(row.status))review.pending++;
      if(result)review.analyzed++;
      if(currentShortlist)review.shortlisted++;
      const category=result&&check.type==='practice'&&result.stage!=='production'?'method':check.type;
      entries.set(row.research_key,{key:row.research_key,id:row.id,type:'article',category:result?.stage==='production'&&result.relevance==='relevant'?'practice':category,
        title:result?.title||row.title,original:row.url,source:row.source_name,firstSeen:row.created_at,publishedAt:row.published_at,
        dateKind:dateKind(scope.day,originalDay),articleId:row.id,language:row.language,
        status:row.status,stage:result?.stage||null,editorialStatus:row.editorial_status,queueable:row.status==='candidate',
        priority:check.priority,reasons:check.reasons,summary,labels,mentions:observations(mentions),
        checkBasis:result?'已有研究卡':row.body_kind==='feed_excerpt'?'官方订阅摘录':row.body_kind==='missing'?'待补正文':'可打开原文核对',
        context:contexts(preferences,row.title,row.body,[row.source_name,...mentions.map(mention=>labelFor[mention.channel])],authorsFor(mentions))});
    }
    for(const group of leadGroups){
      if(entries.has(group.key))continue;
      const rows=members.all(group.key,end),best=rows[0];
      const original=rows.find(row=>row.related_url)?.related_url||null;
      const linked=original?this.store.findResearchArticle(original):null;
      const article=linked?this.store.getArticle(linked.id):null;
      const check=assessResearch({title:best.title,body:best.excerpt,url:original||best.url,signal:best.signal,trustedProject:best.channel==='github'});
      const labels=flags.all(group.key).map(value=>value.label);
      const originalDay=publishedDay(article?.publishedAt);
      if(originalDay&&originalDay<scope.day)review.older++;
      if(article?.analysis)review.analyzed++;
      else if(best.priority>=2)review.pending++;
      if(article?.editorialStatus==='shortlisted'||labels.includes('wechat'))review.shortlisted++;
      entries.set(group.key,{key:group.key,id:best.url,type:'lead',category:'lead',title:best.title,original,source:labelFor[best.channel],
        firstSeen:group.firstSeen,publishedAt:article?.publishedAt||null,dateKind:dateKind(scope.day,originalDay),articleId:article?.id||null,
        editorialStatus:article?.editorialStatus||null,status:article?.status||null,stage:article?.analysis?.stage||null,queueable:article?.status==='candidate',
        summary:article?.analysis?.summary||best.excerpt||null,priority:Math.max(best.priority,check.priority),reasons:check.reasons,
        labels,mentions:observations(rows),checkBasis:article?.analysis?'已有研究卡':original?'已关联原文，待核对':'尚待查找原文',
        context:contexts(preferences,best.title,best.excerpt,rows.map(row=>labelFor[row.channel]),authorsFor(rows))});
    }
    for(const entry of entries.values()){
      const explicit=preferences.filter(p=>entry.context.topics.includes(p.id));
      const pref=explicit.reduce((sum,p)=>sum+p.weight,0);
      const adaptive=Object.entries(entry.context).reduce((sum,[field,values])=>sum+
        values.reduce((value,key)=>value+(learned[field].get(key)||0)/3,0),0);
      const personal=entry.labels.reduce((sum,label)=>sum+(FEEDBACK[label]?.[1]??0),0);
      entry.score=entry.priority*4+Math.max(-5,Math.min(6,pref))+Math.max(-3,Math.min(3,adaptive))+Math.max(-6,Math.min(6,personal));
      entry.recommendation=explicit.filter(p=>p.weight>0).map(p=>p.label);
    }
    const sections=Object.entries(SECTIONS).map(([id,label])=>{
      const matches=[...entries.values()].filter(entry=>entry.category===id);
      return {id,label,count:matches.length,items:ranked(matches)};
    });
    const overview=this.store.overview(this.config);
    return {...scope,counts:{newLeads:leadGroups.length,...review},sections,
      runtime:{collecting:overview.config.collectEnabled,automaticAnalysis:overview.config.autoAnalyze&&overview.config.analysisEnabled,
        remaining:Math.max(0,overview.config.dailyLimit-overview.usage.autoAttempts24h),limit:overview.config.dailyLimit}};
  }

  markdown(day) {
    const report=this.read(day);
    const {newLeads,published,older,pending,analyzed,shortlisted}=report.counts;
    const lines=[`# ${report.day} 每日研究简报`,'',
      `新发现 ${newLeads} 组线索，当日发布 ${published} 篇，发现历史资料 ${older} 篇。待深入 ${pending} 项，已有分析 ${analyzed} 篇，公众号候选 ${shortlisted} 项。`,''];
    for(const group of report.sections){
      lines.push(`## ${group.label}`,'');
      if(!group.items.length)lines.push('本日无新增。','');
      for(const entry of group.items){
        const url=entry.original||entry.mentions[0]?.url;
        lines.push(`- [${markdown(entry.title)}](<${url}>) · ${markdown(entry.source)} · ${entry.publishedAt?publishedDay(entry.publishedAt):'原文日期未知'}`,
          `  - ${entry.checkBasis}${entry.reasons.length?'。'+entry.reasons.join('；'):''}`);
        if(entry.summary)lines.push(`  - ${markdown(entry.summary.slice(0,350))}`);
        if(entry.mentions.length)lines.push(...entry.mentions.map(obs=>`  - ${obs.platform} [讨论或活动](<${obs.url}>)，${obs.kind==='repository'?'星标':obs.platform==='Hacker News'?'积分':'互动'} ${obs.points??'未知'}，评论 ${obs.comments??'未知'}，观察时间 ${obs.observedAt}`));
      }
      if(group.count>group.items.length)lines.push(`本节展示 ${group.items.length} 条，另有 ${group.count-group.items.length} 条可在研究库或线索池查看。`);
      lines.push('');
    }
    return {day:report.day,text:lines.join('\n')};
  }
}
