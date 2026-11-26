import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { parseHTML } from 'linkedom';
import { fetch } from 'undici';
import { AppError } from './config.mjs';
import { canonicalUrl, fetchText } from './fetch.mjs';
import { researchPriority } from './relevance.mjs';
import { isXUrl, researchKey, xPostUrl } from './research-url.mjs';
import { TopicSubscriptions } from './subscriptions.mjs';

const CATALOG=JSON.parse(readFileSync(new URL('../config/discovery.json',import.meta.url),'utf8'));
const GITHUB='https://api.github.com';
const HN='https://hn.algolia.com';
const CACHE_MS=5*60000;
const DISCUSSIONS_QUERY=`query($owner:String!,$name:String!){
  repository(owner:$owner,name:$name){
    isPrivate
    discussions(first:12,orderBy:{field:UPDATED_AT,direction:DESC}){
      nodes{title url createdAt updatedAt bodyText author{login} comments{totalCount} answer{authorAssociation}}
    }
  }
}`;
const date=value=>typeof value==='string'&&Number.isFinite(Date.parse(value))?new Date(value).toISOString():null;
const metric=value=>Number.isSafeInteger(value)&&value>=0?value:null;
const compact=(value,size)=>typeof value==='string'?value.replace(/\s+/g,' ').trim().slice(0,size):'';

function integer(value,fallback,min,max) {
  const n=value==null||value===''?fallback:typeof value==='number'||/^\d+$/.test(value)?Number(value):NaN;
  if(!Number.isSafeInteger(n)||n<min||n>max)throw new AppError('invalid_discovery_number','请检查搜索页数、日期天数和互动数量的范围。');
  return n;
}

function calendarDate(input) {
  if(!/^\d{4}-\d{2}-\d{2}$/.test(input))throw new AppError('invalid_discovery_date','请输入有效的开始和结束日期。');
  const result=new Date(input+'T00:00:00Z');
  if(!Number.isFinite(+result)||result.toISOString().slice(0,10)!==input)
    throw new AppError('invalid_discovery_date','请输入有效的开始和结束日期。');
  return result;
}

function localText(html) {
  if(typeof html!=='string'||!html)return '';
  const {document}=parseHTML(`<html><body>${html.slice(0,32000)}</body></html>`);
  for(const el of document.querySelectorAll('script,style'))el.remove();
  return compact(document.body.textContent,3000);
}

function publicUrl(value) {
  if(typeof value!=='string'||!value.trim()||value.length>4096)return null;
  try{return canonicalUrl(value.trim());}catch{return null;}
}

function relatedUrl(input,mentionUrl) {
  if(input==null||input==='')return null;
  const url=publicUrl(input);
  if(!url||isXUrl(url)||new URL(url).hostname==='t.co'||researchKey(url)===researchKey(mentionUrl))
    throw new AppError('invalid_related_link','请填写工程原文的公开直达链接。');
  return url;
}

function item({url,relatedUrl:original=null,channel,kind,title,excerpt='',publishedAt,activityAt,points,comments,author,signal}) {
  url=publicUrl(url);
  title=compact(title,300);
  if(!url||!title)return null;
  excerpt=compact(excerpt,3000);
  let priority=kind==='doc'?2:researchPriority({title,body:excerpt,trustedProject:channel==='github'});
  if(channel==='hn'&&/^Ask HN:/i.test(title))priority=Math.min(1,priority);
  if(channel==='hn'&&/^Launch HN:/i.test(title))priority=Math.min(2,priority);
  if(channel==='github'&&signal)priority=Math.max(2,priority);
  return {url,relatedUrl:publicUrl(original),channel,kind,title,excerpt,publishedAt:date(publishedAt),
    activityAt:date(activityAt),points:metric(points),comments:metric(comments),
    priority,author:compact(author,80)||null,signal:signal||null};
}

function uniqueItems(items) {
  const seen=new Set();
  return items.filter(entry=>{
    if(!entry)return false;
    const key=researchKey(entry.url);
    if(seen.has(key))return false;
    seen.add(key);return true;
  });
}

function significantDocFiles(files,path) {
  return (files||[]).filter(file=>{
    if(!(file.filename===path||file.filename?.startsWith(path+'/'))||!/\.(?:mdx?|rst|adoc|qmd)$/i.test(file.filename)||
      /(?:^|\/)(?:changelog|release[-_ ]?notes|license|contributing)(?:[.\/]|$)/i.test(file.filename)||
      !['added','modified','renamed'].includes(file.status))return false;
    const added=new Set(),removed=new Set();
    for(const line of (file.patch||'').split('\n')) {
      if(!/^[+-](?![+-])/.test(line))continue;
      const content=line.slice(1).trim().replace(/\s+/g,' ');
      if(content.length>=12&&/[\p{L}]/u.test(content)&&!/^\[.+\]:?\s*https?:/i.test(content))
        (line[0]==='+'?added:removed).add(content);
    }
    return [...added].filter(line=>!removed.has(line)).length>=8;
  }).slice(0,5);
}

function hasReproduction(body) {
  const clean=String(body||'').replace(/<!--[\s\S]*?-->/g,'');
  const heading=/(?:^|\n)[ \t]*(?:#{1,6}[ \t]+)?(?:steps to reproduce|minimal (?:example|reproducer)|reproduction(?: steps)?|复现步骤|最小复现)(?:[ \t]*[:：][ \t]*|[ \t]*\r?\n)/i.exec(clean);
  if(!heading)return false;
  const notes=clean.slice(heading.index+heading[0].length).split(/\r?\n\s*#{1,6}\s+/,1)[0];
  return notes.split(/\r?\n/).some(line=>{
    const text=line.replace(/^[\s#>*\d.、()-]+/,'').trim();
    return !/^(?:请|please\b|例如[：:]|example:|(?:no response|n\/a|none|todo|无|暂无)(?:$|[\s。,.：:]))/i.test(text)&&
      (/[\u4e00-\u9fff]{8}/u.test(text)||text.length>=18);
  });
}

export class Discovery {
  constructor(store,config,{fetcher=fetchText,transport=fetch}={}) {
    this.store=store;this.config=config;this.fetcher=fetcher;this.transport=transport;
    this.cache=new Map();
    this.githubBusy=false;
    this.hnBusy=false;
    this.subscriptions=new TopicSubscriptions(store,CATALOG.topics,options=>this.hnPage(options));
  }

  catalog() {
    const repositories=CATALOG.repositories.map(entry=>({...entry,
      watching:(this.store.setting('discovery_watch:'+entry.repo)??String(Boolean(entry.watchByDefault)))==='true',
      checkedAt:this.store.setting('discovery_checked:'+entry.repo),
      attemptedAt:this.store.setting('discovery_attempted:'+entry.repo),
    }));
    return {...CATALOG,repositories,githubDiscussions:Boolean(this.config.githubDiscussionsToken)};
  }

  async api(url,{github=false,query}={}) {
    const cooldown=github?'github_discovery_wait_until':'hn_discovery_wait_until';
    const limit=()=>new AppError(github?'github_rate_limit':'hn_rate_limit',
      github?'GitHub 要求降低频率。请在限流解除后重新检查。':'Hacker News 要求降低频率。请在限流解除后重新检查。',429);
    if(Date.now()<Number(this.store.setting(cooldown)))throw limit();
    const address=new URL(url);
    // The destinations and the optional token are confined to these endpoints.
    if(address.origin!==(github?GITHUB:HN)||(query&&(!github||address.pathname!=='/graphql')))
      throw new AppError('invalid_discovery_endpoint','此发现入口不可用。');
    try{
      const response=await this.fetcher(url,{
        allowedHosts:[address.hostname],sourceProxyUrl:this.config.sourceProxyUrl,
        sourceProxyFallbackUrls:this.config.sourceProxyFallbackUrls,followRedirects:false,maxBytes:4*1024*1024,timeoutMs:12000,
        fetchImpl:async (target,options)=>{
          const headers={...options.headers,Accept:github?'application/vnd.github+json':'application/json'};
          if(github)headers['X-GitHub-Api-Version']='2026-03-10';
          if(query) {
            headers.Authorization='Bearer '+this.config.githubDiscussionsToken;
            headers['Content-Type']='application/json';
          }
          const response=await this.transport(target,{...options,headers,...(query?{method:'POST',body:JSON.stringify(query)}:{})});
          const retryAfter=response.headers.get('retry-after');
          const retry=retryAfter===null?0:/^\d+$/.test(retryAfter)?Date.now()+Number(retryAfter)*1000:Date.parse(retryAfter)||0;
          if(!github&&(response.status===429||response.status===503&&retry))
            this.store.setSetting(cooldown,Math.max(Date.now()+60000,retry));
          if(github){
            const exhausted=response.headers.get('x-ratelimit-remaining')==='0';
            const reset=exhausted?(Number(response.headers.get('x-ratelimit-reset'))||0)*1000:0;
            if(exhausted||retry||[403,429].includes(response.status)) {
              const resume=Math.max(Date.now()+60000,retry,reset);
              this.store.setSetting(cooldown,resume);
            }
          }
          return response;
        },
      });
      try{return JSON.parse(response.text);}
      catch{throw new AppError('invalid_discovery_response','上游返回的内容暂时无法读取。',502);}
    }catch(error){
      if(Date.now()<Number(this.store.setting(cooldown))&&error.code==='source_http')throw limit();
      throw error;
    }
  }

  cached(key) {
    for(const [cacheKey,value] of this.cache)if(Date.now()>value.expires)this.cache.delete(cacheKey);
    return this.cache.get(key)?.result;
  }

  remember(key,data) {
    if(this.cache.size>=40)this.cache.delete(this.cache.keys().next().value);
    const result={...data,snapshot:randomUUID()};
    this.cache.set(key,{result,expires:Date.now()+CACHE_MS});
    return result;
  }

  async hn(params) {
    const term=compact(params.get('q'),160);
    if(!term)throw new AppError('missing_discovery_query','请填写主题关键词。');
    const points=integer(params.get('points'),0,0,10000);
    const comments=integer(params.get('comments'),0,0,10000);
    const page=integer(params.get('page'),0,0,19);
    const from=params.get('from'),to=params.get('to');
    const currentDay=+calendarDate(new Date().toISOString().slice(0,10));
    const start=from?+calendarDate(from):currentDay-29*86400000;
    const end=(to?+calendarDate(to):currentDay)+86400000;
    if(start>=end)throw new AppError('invalid_discovery_date','开始日期应早于或等于结束日期。');
    return this.hnPage({term,points,comments,page,start:Math.floor(start/1000),end:Math.floor(end/1000),sort:params.get('sort')});
  }

  async hnPage({term,points=0,comments=0,page=0,start,end,sort}) {
    const url=new URL(HN+'/api/v1/'+(sort==='relevant'?'search':'search_by_date'));
    const numericFilters=[`created_at_i>=${start}`,`created_at_i<${end}`];
    if(points)numericFilters.push('points>='+points);
    if(comments)numericFilters.push('num_comments>='+comments);
    url.search=new URLSearchParams({query:term,tags:'story',numericFilters:numericFilters.join(','),hitsPerPage:'20',page:String(page)});
    if(term.includes('"'))url.searchParams.set('advancedSyntax','true');
    const cacheKey='hn '+url.href;
    const existing=this.cached(cacheKey);
    if(existing)return existing;
    if(this.hnBusy)throw new AppError('discovery_busy','搜索正在进行，请稍候。',409);
    this.hnBusy=true;
    try{
      const data=await this.api(url.href);
      if(!Array.isArray(data.hits))throw new AppError('invalid_discovery_response','Hacker News 搜索结果暂时无法读取。',502);
      const items=uniqueItems(data.hits.filter(hit=>/^\d+$/.test(hit.objectID)).map(hit=>{
        const platformUrl='https://news.ycombinator.com/item?id='+hit.objectID;
        return item({channel:'hn',kind:'story',url:platformUrl,relatedUrl:hit.url===platformUrl?null:hit.url,
          title:hit.title,excerpt:localText(hit.story_text),publishedAt:hit.created_at||(
            Number.isSafeInteger(hit.created_at_i)?new Date(hit.created_at_i*1000).toISOString():null),
          points:hit.points,comments:hit.num_comments,author:hit.author});
      })).sort((a,b)=>b.priority-a.priority);
      return this.remember(cacheKey,{items,page,total:metric(data.nbHits),pages:metric(data.nbPages),raw:data.hits.length,
        pageSize:20,hasMore:page+1<Math.min(20,data.nbPages||0)});
    }finally{this.hnBusy=false;}
  }

  async github({repo,days,kind='all'}) {
    const selection=CATALOG.repositories.find(entry=>entry.repo===repo);
    if(!selection)throw new AppError('invalid_discovery_repo','请从跟踪清单选择仓库。');
    days=integer(days,30,1,365);
    if(!['all','repository','issue','pull','release','doc','discussion'].includes(kind))
      throw new AppError('invalid_discovery_kind','请选择需要查看的仓库活动。');
    const cacheKey=`github ${repo} ${days} ${kind}`;
    const existing=this.cached(cacheKey);
    if(existing)return existing;
    if(this.githubBusy)throw new AppError('discovery_busy','有仓库正在检查，请稍后再试。',409);
    this.githubBusy=true;
    try{
      return this.remember(cacheKey,await this.githubItems(selection,days,kind));
    }finally{this.githubBusy=false;}
  }

  async githubItems(selection,days,kind) {
    const repo=selection.repo;
    const endpoint=GITHUB+'/repos/'+repo;
    const since=new Date(Date.now()-days*86400000).toISOString();
    const want=type=>kind===type||kind==='all';
    const items=[],warnings=[];
    let complete=true;
    const read=(path,params={})=>this.api(endpoint+path+(Object.keys(params).length?'?'+new URLSearchParams(params):''),{github:true});
    const push=(entry,type,options={})=>items.push(item({channel:'github',kind:type,url:entry.html_url,
      relatedUrl:['repository','release','doc'].includes(type)||type==='pull'&&entry.merged_at?entry.html_url:null,
      title:entry.title,excerpt:entry.body,publishedAt:entry.created_at,activityAt:entry.updated_at,comments:entry.comments,
      author:entry.user?.login,...options}));
    const jobs=[];
    if(want('repository'))jobs.push(['仓库',async()=>{
      const entry=await read('');
      if(entry.private)return;
      push(entry,'repository',{title:entry.full_name,excerpt:entry.description,activityAt:entry.pushed_at,points:entry.stargazers_count});
    }]);
    if(want('issue'))jobs.push(['Issue',async()=>{
      for(const entry of await read('/issues',{state:'all',sort:'updated',direction:'desc',since,per_page:'20'}))
        if(!entry.pull_request&&date(entry.updated_at)>=since)push(entry,'issue',{signal:hasReproduction(entry.body)?'reproduction':null});
    }]);
    if(want('pull'))jobs.push(['PR',async()=>{
      for(const entry of await read('/pulls',{state:'all',sort:'updated',direction:'desc',per_page:'12'}))
        if(date(entry.updated_at)>=since)push(entry,'pull');
    }]);
    if(want('release'))jobs.push(['Release',async()=>{
      for(const entry of await read('/releases',{per_page:'12'}))
        if(!entry.draft&&date(entry.published_at)>=since)push(entry,'release',{title:(entry.name||entry.tag_name)+(entry.prerelease?'（预发布）':''),
          publishedAt:entry.published_at,activityAt:entry.published_at});
    }]);
    if(want('doc'))jobs.push(['文档更新',async()=>{
      const commits=await read('/commits',{path:selection.path,since,per_page:'18'});
      const candidates=commits.filter(commit=>!/^\s*(?:typo|spelling|(?:docs|chore):\s*(?:fix typo|update changelog|format))\b/i.test(commit.commit?.message||''));
      for(const commit of candidates.slice(0,kind==='doc'?8:4)){
        if(!/^[0-9a-f]{40}$/i.test(commit.sha))continue;
        const detail=await read('/commits/'+commit.sha);
        const files=significantDocFiles(detail.files,selection.path);
        if(!files.length)continue;
        const message=commit.commit?.message||'';
        push(commit,'doc',{
          title:message.split('\n')[0]||'工程文档更新',publishedAt:commit.commit?.committer?.date,
          excerpt:message+' · '+files.map(file=>file.filename).join(' · '),
        });
      }
    }]);
    if(want('discussion')){
      if(this.config.githubDiscussionsToken)jobs.push(['Discussion',async()=>{
        const [owner,name]=repo.split('/');
        const response=await this.api(GITHUB+'/graphql',{github:true,query:{query:DISCUSSIONS_QUERY,variables:{owner,name}}});
        const record=response.data?.repository;
        if(response.errors?.some(error=>error.type==='RATE_LIMITED')){
          this.store.setSetting('github_discovery_wait_until',Date.now()+60000);
          throw new AppError('github_rate_limit','GitHub 要求降低频率。',429);
        }
        if(!record||response.errors?.length||!record.discussions?.nodes)throw new AppError('github_discussion_unavailable','这个仓库的 Discussion 暂不可读。');
        if(record.isPrivate)return;
        for(const entry of record.discussions.nodes)
          if(entry&&date(entry.updatedAt)>=since)push(entry,'discussion',{url:entry.url,excerpt:entry.bodyText,author:entry.author?.login,
            signal:['OWNER','MEMBER','COLLABORATOR'].includes(entry.answer?.authorAssociation)?'maintainer_answer':null,
            publishedAt:entry.createdAt,activityAt:entry.updatedAt,comments:entry.comments?.totalCount});
      }]);
      else warnings.push('Discussion 可打开仓库中的原生页面。配置只读 GitHub 凭据后可以在这里检查。');
    }
    for(const [label,job] of jobs) {
      try{await job();}
      catch(error){
        complete=false;
        warnings.push(`${label} ${error.code==='github_rate_limit'?'暂时达到 GitHub 请求限制，请稍后再检查。':'暂时无法读取。可以打开原项目查看。'}`);
        if(error.code==='github_rate_limit')break;
      }
    }
    const sorted=uniqueItems(items).sort((a,b)=>b.priority-a.priority||(b.activityAt||b.publishedAt||'').localeCompare(a.activityAt||a.publishedAt||''));
    return {items:sorted,warnings,complete};
  }

  watch({repo,enabled}) {
    if(!CATALOG.repositories.some(entry=>entry.repo===repo)||typeof enabled!=='boolean')
      throw new AppError('invalid_discovery_repo','请选择跟踪仓库和是否启用。');
    this.store.setSetting('discovery_watch:'+repo,enabled);
  }

  async refreshWatched(now=Date.now()) {
    if(!this.config.collectEnabled||this.githubBusy||now<Number(this.store.setting('github_discovery_wait_until'))||
      now-Number(this.store.setting('discovery_last_poll'))<15*60000)return;
    const last=entry=>entry.attemptedAt||entry.checkedAt||'';
    const due=this.catalog().repositories.filter(entry=>entry.watching&&
      now-(Date.parse(last(entry))||0)>=12*3600000).sort((a,b)=>last(a).localeCompare(last(b)))[0];
    if(!due)return;
    this.store.setSetting('discovery_last_poll',now);
    this.store.setSetting('discovery_attempted:'+due.repo,new Date(now).toISOString());
    const result=await this.github({repo:due.repo,days:30});
    this.store.saveLeadMentions(result.items.filter(entry=>entry.priority>=2&&entry.kind!=='repository'));
    if(result.complete)this.store.setSetting('discovery_checked:'+due.repo,new Date(now).toISOString());
  }

  async refresh() {
    await Promise.allSettled([this.subscriptions.run(),this.refreshWatched()]);
  }

  save(body) {
    let entries;
    if(body.snapshot){
      this.cached('');
      const result=[...this.cache.values()].find(value=>value.result.snapshot===body.snapshot)?.result;
      if(!result)throw new AppError('discovery_expired','这批搜索结果已过期，请重新搜索。',409);
      const urls=Array.isArray(body.urls)?new Set(body.urls):null;
      entries=urls?result.items.filter(entry=>urls.has(entry.url)):result.items.filter(entry=>entry.priority>0);
    }else{
      if(typeof body.url!=='string'||!body.url.trim())throw new AppError('invalid_x_link','请粘贴一条 X 帖子的完整链接。');
      const url=xPostUrl(body.url.trim()),excerpt=typeof body.excerpt==='string'?body.excerpt.trim().slice(0,16000):'';
      const title=compact(body.title,300)||(excerpt?compact(excerpt,100):'X 帖子 '+url.split('/').at(-1));
      const handle=/^\/([\w]+)\/status\//.exec(new URL(body.url.trim()).pathname)?.[1];
      entries=[{channel:'x',kind:'post',url,relatedUrl:relatedUrl(body.relatedUrl,url),title,excerpt,
        author:handle&&handle.toLowerCase()!=='i'?handle:null,
        priority:researchPriority({title,body:excerpt})}];
    }
    if(!entries.length)throw new AppError('empty_discovery_selection','请选择需要留下的线索。');
    return this.store.saveLeadMentions(entries);
  }

  link(body) {
    const url=publicUrl(body.url);
    if(!url||!body.relatedUrl)throw new AppError('invalid_related_link','请填写工程原文的公开直达链接。');
    this.store.linkLeadMention(url,relatedUrl(body.relatedUrl,url));
  }

  leads(params) {
    return this.store.listLeadGroups(integer(params.get('offset'),0,0,10000));
  }
}
