import { AppError } from './config.mjs';

const HOUR=3600;
const INITIAL_WINDOW=3*24*HOUR;
const CATCH_UP=14*24*HOUR;
const OVERLAP=6*HOUR;
const RETRY=30*60;
const PAGE_LIMIT=20;
const key=id=>'hn_subscription:'+id;
const iso=seconds=>seconds?new Date(seconds*1000).toISOString():null;

export class TopicSubscriptions {
  constructor(store,topics,search) {
    this.store=store;
    this.topics=topics;
    this.search=search;
    this.running=null;
  }

  state(topic) {
    const raw=this.store.setting(key(topic.id));
    return {keyword:topic.hn,enabled:true,hours:24,checked:null,through:0,due:0,work:null,last:null,revision:0,
      ...(raw?JSON.parse(raw):{})};
  }

  list() {
    return this.topics.map(topic=>{
      const {keyword,enabled,hours,checked,through,due,last,work}=this.state(topic);
      return {id:topic.id,label:topic.label,keyword,enabled,hours,last,checkedAt:iso(checked),coveredThrough:iso(through),
        nextAt:iso(due),progress:work?{from:iso(work.from),to:iso(work.to),page:work.page+1}:null,
        running:this.running===topic.id};
    });
  }

  configure({id,keyword,enabled,hours}) {
    const topic=this.topics.find(entry=>entry.id===id);
    if(!topic||typeof keyword!=='string'||!keyword.trim()||keyword.trim().length>160||
      typeof enabled!=='boolean'||!Number.isSafeInteger(hours)||hours<2||hours>168)
      throw new AppError('invalid_subscription','请填写搜索词，并设置 2 至 168 小时的检查间隔。');
    const current=this.state(topic),term=keyword.trim();
    const changed=current.keyword!==term;
    this.store.setSetting(key(id),JSON.stringify({...current,keyword:term,enabled,hours,revision:current.revision+1,
      ...(changed?{checked:null,through:0,work:null,last:null}:{}),
      due:changed||current.enabled!==enabled||current.work?0:current.checked?current.checked+hours*HOUR:0}));
  }

  async run({id,now=Math.floor(Date.now()/1000)}={}) {
    if(this.running)return;
    const chosen=this.topics.map(topic=>({topic,current:this.state(topic)}))
      .filter(({topic,current})=>current.enabled&&(id?topic.id===id:current.due<=now))
      .sort((a,b)=>a.current.due-b.current.due)[0];
    if(!chosen)return;
    const {topic,current}=chosen;
    // Manual checks honor an upstream cooldown and a failed/saturated window.
    const resume=Number(this.store.setting('hn_discovery_wait_until'))/1000;
    if(resume>now||current.due>now&&['failed','limited','saturated'].includes(current.last?.status))return;
    const start=Math.max(now-CATCH_UP,current.through?current.through-OVERLAP:now-INITIAL_WINDOW);
    const work=current.work??{from:start,end:now,to:now,page:0,raw:0,matched:0,added:0,duplicates:0};
    if(work.from>=work.to)return;
    this.running=topic.id;
    try{
      const page=await this.search({term:current.keyword,start:work.from,end:work.end,page:work.page});
      const latest=this.state(topic);
      if(latest.revision!==current.revision)return;
      if(!Number.isSafeInteger(page.total)||!Number.isSafeInteger(page.pages)||
        (page.total>0&&page.pages<1))throw new AppError('invalid_discovery_response','搜索服务没有返回可用的分页信息。');
      if(page.total>Math.min(PAGE_LIMIT,page.pages)*page.pageSize){
        const mid=work.from+Math.floor((work.end-work.from)/2);
        if(mid<=work.from){
          this.store.setSetting(key(topic.id),JSON.stringify({...current,work,due:now+current.hours*HOUR,
            last:{status:'saturated',at:iso(now),raw:work.raw,matched:work.matched,added:work.added,duplicates:work.duplicates}}));
          return;
        }
        this.store.setSetting(key(topic.id),JSON.stringify({...current,due:now,work:{...work,end:mid,page:0},
          last:{status:'progress',at:iso(now),raw:work.raw,matched:work.matched,added:work.added,duplicates:work.duplicates}}));
        return;
      }
      const entries=page.items.filter(item=>item.priority>=2&&item.publishedAt&&
        Date.parse(item.publishedAt)>=work.from*1000&&Date.parse(item.publishedAt)<work.end*1000);
      const saved=this.store.saveLeadMentions(entries);
      const totals={raw:work.raw+page.raw,matched:work.matched+entries.length,
        added:work.added+saved.added,duplicates:work.duplicates+saved.duplicates};
      const complete=!page.hasMore&&work.end===work.to;
      const next=page.hasMore?{...work,...totals,page:work.page+1}:
        {...work,...totals,from:work.end,end:work.to,page:0};
      this.store.setSetting(key(topic.id),JSON.stringify({...current,work:complete?null:next,
        checked:complete?now:current.checked,through:complete?work.to:current.through,
        due:complete?Math.max(now,work.to+current.hours*HOUR):now,
        last:{status:complete?'ok':'progress',at:iso(now),...totals}}));
    }catch(error){
      if(this.state(topic).revision!==current.revision)return;
      const limited=error.code==='hn_rate_limit';
      const until=Math.ceil(Number(this.store.setting('hn_discovery_wait_until'))/1000);
      this.store.setSetting(key(topic.id),JSON.stringify({...current,work,due:Math.max(now+RETRY,until),
        last:{status:limited?'limited':'failed',at:iso(now),raw:work.raw,matched:work.matched,added:work.added,duplicates:work.duplicates}}));
    }finally{this.running=null;}
  }
}
