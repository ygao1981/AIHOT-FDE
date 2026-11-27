import { parseHTML } from 'linkedom';
import { Readability } from '@mozilla/readability';
import { XMLParser, XMLValidator } from 'fast-xml-parser';
import { canonicalUrl, fetchText } from './fetch.mjs';
import { AppError } from './config.mjs';
import { precheck, prepareArticle } from './analysis.mjs';
import { researchPriority } from './relevance.mjs';
import { isXUrl, researchKey, tencentArticleId } from './research-url.mjs';

const clean=s=>String(s||'').replace(/\s+/g,' ').trim();
const asArray=v=>v===undefined||v===null?[]:Array.isArray(v)?v:[v];
const MAX_SOURCE_ENTRIES=30;
function plain(html) { const {document}=parseHTML(`<html><body>${String(html||'')}</body></html>`);for(const el of document.querySelectorAll('script,style,nav,footer,form'))el.remove();return clean(document.body.textContent); }
function atomText(v){return typeof v==='object'&&v!==null?String(v['#text']||''):String(v||'');}
// Date-only metadata has calendar-day precision, including when the host is east of UTC.
function publishedTime(value) { return value ? Date.parse(value.length===10?value+'T00:00:00':value) : NaN; }
function inCollectionRange(value,{oldestAt,dayEndAt}) {
  const time=publishedTime(value);
  return time>=oldestAt&&time<dayEndAt;
}
export function publicationDate(value) {
  if(!value||typeof value!=='string')return null;
  if(/^\s*(?:修改于|最近更新时间|更新于)/.test(value))return null;
  value=value.replace(/^\s*(?:发布于|发布日期\s*[:：])\s*/,'');
  const text=value.trim().replace(/^(\d{4})年\s*(\d{1,2})月\s*(\d{1,2})日$/,(_,y,m,d)=>`${y}-${m.padStart(2,'0')}-${d.padStart(2,'0')}`);
  if(/^\d{4}-\d{2}-\d{2}$/.test(text)) {
    const d=new Date(text+'T00:00:00Z');return Number.isNaN(+d)||d.toISOString().slice(0,10)!==text||d.getUTCFullYear()<1990||+d>Date.now()+86400000?null:text;
  }
  if(/^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}/.test(text) && !/(Z|[+-]\d{2}:?\d{2})$/i.test(text))return publicationDate(text.slice(0,10));
  // English month dates without clock time have day precision only.
  const hasTime=/\d{1,2}:\d{2}/.test(text);
  const d=new Date(hasTime?text:text+' UTC');if(Number.isNaN(+d)||d.getUTCFullYear()<1990||+d>Date.now()+86400000)return null;
  return hasTime?d.toISOString():d.toISOString().slice(0,10);
}
function metaDate(document,source={}) {
  for(const selector of ['meta[property="article:published_time"]','meta[name="datePublished"]','meta[itemprop="datePublished"]','meta[name="pubdate"]','meta[name="dcterms.date"]']){
    const date=publicationDate(document.querySelector(selector)?.getAttribute('content'));if(date)return date;
  }
  for(const node of document.querySelectorAll('meta')) {
    if((node.getAttribute('itemprop')||node.getAttribute('itemProp'))==='datePublished') {
      const date=publicationDate(node.getAttribute('content'));if(date)return date;
    }
  }
  const find=(obj,depth=0)=>{
    if(!obj||typeof obj!=='object'||depth>12)return null;
    if(obj.datePublished){const d=publicationDate(obj.datePublished);if(d)return d;}
    for(const value of Object.values(obj)){if(value&&typeof value==='object'){const d=find(value,depth+1);if(d)return d;}}
    return null;
  };
  for(const el of document.querySelectorAll('script[type="application/ld+json"]'))try{const d=find(JSON.parse(el.textContent));if(d)return d;}catch{}
  if(source.detailDateSelector){const el=document.querySelector(source.detailDateSelector);const d=publicationDate(el?.getAttribute('datetime')||el?.getAttribute('content')||el?.textContent);if(d)return d;}
  // Do not use dateModified, Atom updated, or arbitrary dates in article prose as publication dates.
  return null;
}
function tencentCommunityArticle(document,url) {
  const id=tencentArticleId(url);
  if(!id)return null;
  // Public HTML carries its own article details. Only use the record for this URL.
  let fallback;
  try {
    const script=document.querySelector('script#__NEXT_DATA__[type="application/json"]');
    fallback=script?JSON.parse(script.textContent).props?.pageProps?.fallback:null;
  }catch{}
  const record=Object.values(fallback||{}).find(value=>String(value?.articleInfo?.articleId)===id);
  const seconds=record?.publishTime;
  const publishedAt=Number.isSafeInteger(seconds)&&seconds>=631152000&&seconds<=Date.now()/1000+86400?
    new Date(seconds*1000).toISOString():metaDate(document,{detailDateSelector:'.mod-article-content .date-text'});
  const content=document.querySelector('.mod-content__markdown');
  for(const el of content?.querySelectorAll('script,style,nav,footer,form,iframe,aside')||[])el.remove();
  const staticBody=clean(content?.textContent);
  const supplied=record?.articleInfo?.plain;
  const body=(staticBody.length>=180||typeof supplied!=='string'?staticBody:clean(supplied)).slice(0,120000);
  const title=clean(record?.articleInfo?.title||document.querySelector('h1.title-text')?.textContent).slice(0,300);
  return {title:title||url,body,publishedAt};
}

export function extractArticle(html,url,source={}) {
  if(/<(?:title|h1)[^>]*>\s*(?:Access Denied|Just a moment|Attention Required|403 Forbidden)/i.test(html))throw new AppError('blocked_page','来源要求验证或限制访问，请手动提供正文。');
  const {document}=parseHTML(html);
  const community=tencentCommunityArticle(document,url);
  if(community)return community;
  const publishedAt=metaDate(document,source);
  const fallbackTitle=clean(document.querySelector('meta[property="og:title"]')?.getAttribute('content')||document.querySelector('h1')?.textContent||document.title);
  // linkedom does not run page scripts or load resources.
  for(const el of document.querySelectorAll('script,style,nav,footer,form,iframe,aside'))el.remove();
  if(source.detailBodySelector){
    const title=clean(document.querySelector('h1')?.textContent||fallbackTitle).slice(0,300)||url;
    const body=clean(document.querySelector(source.detailBodySelector)?.textContent).slice(0,120000);
    return {title,body,publishedAt};
  }
  let article;try{article=new Readability(document,{charThreshold:180}).parse();}catch{}
  const body=clean(article?.textContent||document.querySelector('article')?.textContent||document.querySelector('main')?.textContent||'').slice(0,120000);
  return {title:clean(article?.title||fallbackTitle).slice(0,300)||url,body,publishedAt};
}
export function parseFeed(xml,source,maxItems=source.maxItems||8) {
  if(/<!DOCTYPE|<!ENTITY/i.test(xml))throw new AppError('unsafe_feed','订阅包含不支持的实体定义。');
  if(XMLValidator.validate(xml)!==true)throw new AppError('invalid_feed','该地址没有返回有效的 RSS 或 Atom 订阅。');
  const doc=new XMLParser({ignoreAttributes:false,attributeNamePrefix:'@_',processEntities:false,parseTagValue:false,trimValues:true}).parse(xml);
  let items;
  if(doc.rss?.channel) items=asArray(doc.rss.channel.item).map(i=>({url:atomText(i.link),title:plain(atomText(i.title)),publishedAt:publicationDate(atomText(i.pubDate)||atomText(i['dc:date'])),body:plain(atomText(i['content:encoded'])||atomText(i.description))}));
  else if(doc.feed) items=asArray(doc.feed.entry).map(i=>{
    const link=asArray(i.link).find(l=>typeof l==='object'&&(!l['@_rel']||l['@_rel']==='alternate'));
    return {url:link?.['@_href']||atomText(i.link),title:plain(atomText(i.title)),publishedAt:publicationDate(atomText(i.published)),body:plain(atomText(i.content)||atomText(i.summary))};
  });
  else throw new AppError('invalid_feed','该地址返回了网页，未发现 RSS 或 Atom 内容。');
  return dedupeEntries(items,source,maxItems);
}
function dedupeEntries(items,source,maxItems) {
  const seen=new Set(),out=[];
  for(const item of items){try{
    const url=canonicalUrl(new URL(item.url,source.url).href);
    if(seen.has(url)||!item.title||source.linkPattern&&!new RegExp(source.linkPattern).test(url))continue;
    if(source.allowedHosts?.length&&!source.allowedHosts.includes(new URL(url).hostname))continue;
    seen.add(url);out.push({...item,url,title:clean(item.title).slice(0,300)});
  }catch{}}
  out.sort((a,b)=>(publishedTime(b.publishedAt)||0)-(publishedTime(a.publishedAt)||0));
  return out.slice(0,Math.min(maxItems,MAX_SOURCE_ENTRIES));
}
export function parseList(html,source,maxItems=source.maxItems||8) {
  const {document}=parseHTML(html),items=[];
  const containers=source.itemSelector?[...document.querySelectorAll(source.itemSelector)]:[document];
  for(const container of containers){
    for(const link of container.querySelectorAll(source.linkSelector)){
      const titleNode=source.titleSelector?(link.querySelector(source.titleSelector)||container.querySelector(source.titleSelector)):link;
      const dateNode=source.dateSelector?(link.querySelector(source.dateSelector)||(source.itemSelector?container.querySelector(source.dateSelector):link.parentElement?.querySelector(source.dateSelector))):null;
      items.push({url:link.getAttribute('href'),title:clean(titleNode?.textContent||link.getAttribute('aria-label')||link.textContent),publishedAt:publicationDate(dateNode?.getAttribute('datetime')||dateNode?.textContent),body:''});
    }
  }
  return dedupeEntries(items,source,maxItems);
}
export function sourceFetchOptions(source, {sourceProxyUrl,sourceProxyFallbackUrls}, {listing=false}={}) {
  const allowedHosts=listing?[...new Set([new URL(source.url).hostname,...source.allowedHosts||[]])]:source.allowedHosts;
  return source.disposition==='auto'?{allowedHosts,sourceProxyUrl,sourceProxyFallbackUrls}:{allowedHosts};
}
export async function readSource(source,{fetcher=fetchText,sourceProxyUrl,sourceProxyFallbackUrls,maxItems}={}) {
  if(source.kind==='manual')return [];
  const listing=await fetcher(source.url,sourceFetchOptions(source,{sourceProxyUrl,sourceProxyFallbackUrls},{listing:true}));
  const entries=source.kind==='rss'?parseFeed(listing.text,source,maxItems):parseList(listing.text,source,maxItems);
  if(!entries.length)throw new AppError('empty_source','没有解析到文章，请检查信源规则或改用手动收录。');
  return entries;
}
export async function collectSource(store,source,config,{fetcher=fetchText}={}) {
  const {sourceProxyUrl,sourceProxyFallbackUrls}=config;
  const entries=await readSource(source,{fetcher,sourceProxyUrl,sourceProxyFallbackUrls,maxItems:MAX_SOURCE_ENTRIES});let added=0,failed=0;
  const detailOptions=sourceFetchOptions(source,config);
  const first=!source.lastCheckedAt;
  for(const e of entries){
    const limits=store.collectionLimits();
    if(limits.addedToday>=limits.dailyLimit)break;
    if(e.publishedAt&&!inCollectionRange(e.publishedAt,limits))continue;
    if(store.findResearchArticle(e.url))continue;
    let article={...e},bodyKind='page';
    try{
      const page=await fetcher(e.url,detailOptions);
      const detail=extractArticle(page.text,page.url,source);article={...e,...detail,publishedAt:detail.publishedAt||e.publishedAt};
      if(detail.body.length<180)throw new AppError('needs_body','正文不足。');
    }catch(error){
      article={...e,publishedAt:article.publishedAt};
      if(e.body.length>=600)bodyKind='feed_excerpt';
      else{article.body='';bodyKind='missing';}
    }
    // The day or the user's settings can change while a detail request is in flight.
    const current=store.collectionLimits();
    if(current.addedToday>=current.dailyLimit)break;
    if(!inCollectionRange(article.publishedAt,current))continue;
    const old=publishedTime(article.publishedAt)<Date.now()-30*86400000;
    const admitted=precheck(prepareArticle({title:article.title,url:e.url,body:article.body},config.maxInputChars));
    if(source.researchOnly&&admitted!=='candidate'){
      if(admitted==='needs_body')failed++;
      continue;
    }
    const state=admitted==='candidate'?'candidate':admitted==='needs_body'?'needs_body':'skipped';
    const result=store.upsertArticle({...article,url:e.url,sourceId:source.id,sourceName:source.name,language:source.language||'unknown',bodyKind,
      backfill:first||old,priority:researchPriority(article)===0?1:source.priority||3,status:state},{maxArticles:config.maxArticles});
    if(result.created){added++;if(bodyKind==='missing')failed++;}
  }
  return {added,failed,found:entries.length};
}
export async function importArticle(store,input,config,{fetcher=fetchText}={}) {
  let url=canonicalUrl(input.url);
  const supplied=typeof input.body==='string'&&input.body.trim();
  if(!supplied&&isXUrl(url))throw new AppError('x_manual_only','请在「发现线索」保存帖子，或在此粘贴有权使用的正文。');
  const existing=store.findResearchArticle(url);
  if(existing){
    const article=store.getArticle(existing.id);
    if(!supplied)return {article,created:false};
    url=article.url;
  }
  const key=researchKey(url);
  const source=store.catalog.find(entry=>entry.references?.some(ref=>ref.readable===true&&researchKey(ref.url)===key));
  const ref=source?.references.find(ref=>ref.readable===true&&researchKey(ref.url)===key);
  if(ref&&!existing)url=canonicalUrl(ref.url);
  let article={url,title:typeof input.title==='string'?input.title.trim():'',body:supplied?input.body.trim().slice(0,120000):'',publishedAt:null};
  if(!supplied){
    const options=ref?{allowedHosts:[new URL(ref.url).hostname],sourceProxyUrl:config.sourceProxyUrl,
      sourceProxyFallbackUrls:config.sourceProxyFallbackUrls,followRedirects:false}:undefined;
    const page=await fetcher(url,options);
    const parsingSource=ref&&store.catalog.find(entry=>entry.detailBodySelector&&entry.linkPattern&&new RegExp(entry.linkPattern).test(page.url));
    article={...article,...extractArticle(page.text,page.url,parsingSource||source)};
  }
  if(source)Object.assign(article,{sourceName:source.name,language:source.language});
  if(!article.title)article.title=url;
  const admitted=precheck(prepareArticle(article,config.maxInputChars));
  // A manually saved reference remains readable even if it is not eligible for model analysis.
  const status=admitted==='needs_body'?'needs_body':admitted==='candidate'?'candidate':'skipped';
  return store.upsertArticle({...article,bodyKind:supplied?'manual':'page',status,backfill:true},{updateExisting:!!supplied,maxArticles:config.maxArticles});
}
