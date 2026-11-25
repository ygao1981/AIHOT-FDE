import { lookup as lookupAsync } from 'node:dns/promises';
import { isIP } from 'node:net';
import { Agent, EnvHttpProxyAgent, ProxyAgent, fetch } from 'undici';
import ipaddr from 'ipaddr.js';
import { AppError, readSourceProxyUrl } from './config.mjs';

export function isPublicAddress(address) {
  try { return ipaddr.process(address).range() === 'unicast'; } catch { return false; }
}
export function canonicalUrl(value) {
  let u; try { u=new URL(value); } catch { throw new AppError('invalid_url','请提供完整的公开网页地址。'); }
  if(!['http:','https:'].includes(u.protocol) || u.username || u.password || (u.port && !['80','443'].includes(u.port)))
    throw new AppError('invalid_url','只支持不含账号密码的公开 HTTP 或 HTTPS 网页。');
  const host=u.hostname.replace(/^\[|\]$/g,'').toLowerCase().replace(/\.$/,'');
  if(host==='localhost' || host.endsWith('.localhost') || host.endsWith('.local') || host.endsWith('.internal') || (isIP(host) && !isPublicAddress(host)))
    throw new AppError('blocked_url','不能采集本机、内网或云服务器管理地址。');
  u.hash='';
  for(const k of [...u.searchParams.keys()]) if(/^utm_/i.test(k)||['fbclid','gclid','mc_cid','mc_eid'].includes(k))u.searchParams.delete(k);
  return u.href;
}
async function validateDestination(value, allowedHosts, resolver, {sourceProxyUrl,inheritedProxy}) {
  const url=canonicalUrl(value), u=new URL(url), host=u.hostname.replace(/^\[|\]$/g,'');
  if(allowedHosts?.length && !allowedHosts.includes(host)) throw new AppError('source_host_changed','文章跳到了未登记的网站，请人工核对信源。');
  const auditedHttps=u.protocol==='https:' && !u.port && !isIP(host) && allowedHosts?.includes(host);
  if(sourceProxyUrl) {
    if(!auditedHttps) throw new AppError('blocked_url','采集代理仅能访问登记的 HTTPS 信源域名。');
    // The trusted proxy receives the audited hostname and resolves it under its own policy.
    return {url,host,addresses:[]};
  }
  let addresses;
  try { addresses=isIP(host)?[{address:host}]:await resolver(host,{all:true}); }
  catch(error) {
    if(inheritedProxy&&auditedHttps&&['EAI_AGAIN','ENOTFOUND'].includes(error.code))return {url,host,addresses:[]};
    throw error;
  }
  if(!addresses.length || addresses.some(r=>!isPublicAddress(r.address))) throw new AppError('blocked_url','目标地址不能用于公开网页采集。');
  return {url,host,addresses:addresses.map(({address})=>({address,family:isIP(address)}))};
}
function pinnedLookup({host,addresses}) {
  return (hostname,options,callback)=>{
    const matches=hostname===host?addresses.filter(record=>!options.family||options.family===record.family):[];
    if(!matches.length)return callback(Object.assign(new Error('No validated destination address'),{code:'ENOTFOUND'}));
    if(options.all)callback(null,matches);
    else callback(null,matches[0].address,matches[0].family);
  };
}
const sourceProxies=new Map();
function sourceProxyDispatcher(uri) {
  if(!sourceProxies.has(uri)) sourceProxies.set(uri,new ProxyAgent({uri,requestTls:{rejectUnauthorized:true}}));
  return sourceProxies.get(uri);
}
function cannotReachProxy(error, proxyUrl) {
  const proxy=new URL(proxyUrl),cause=error.cause;
  return ['ECONNREFUSED','EHOSTUNREACH','ENETUNREACH'].includes(cause?.code)&&
    cause.address===proxy.hostname.replace(/^\[|\]$/g,'')&&cause.port===Number(proxy.port||80);
}
const sourceProxyError=()=>new AppError('source_proxy_failed','无法通过已配置的采集代理连接信源，请检查本地代理是否在运行及信源规则。');
export async function fetchText(value, {sourceProxyUrl,sourceProxyFallbackUrls=[],timeoutMs=20000,...options}={}) {
  const proxies=[...new Set([sourceProxyUrl,...sourceProxyFallbackUrls].map(url=>readSourceProxyUrl(url)).filter(Boolean))];
  const signal=AbortSignal.timeout(timeoutMs);
  if(!proxies.length)return fetchRoute(value,{...options,signal});
  for(const proxy of proxies){
    try{return await fetchRoute(value,{...options,sourceProxyUrl:proxy,signal});}
    catch(error){if(error.code!=='source_proxy_unreachable')throw error;}
  }
  throw sourceProxyError();
}
async function fetchRoute(value, {allowedHosts,sourceProxyUrl,signal,maxBytes=3*1024*1024,fetchImpl=fetch,resolver=lookupAsync,followRedirects=true}) {
  const inheritedProxy=!sourceProxyUrl&&allowedHosts?.length&&
    !!(process.env.HTTPS_PROXY||process.env.HTTP_PROXY||process.env.https_proxy||process.env.http_proxy);
  let current=value, receivedResponse=false;
  try {
    for(let hop=0;hop<5;hop++) {
      const abort=new Promise((_,reject)=>signal.addEventListener('abort',()=>reject(new AppError('fetch_timeout','网页响应超时，请稍后手动重试。')),{once:true}));
      const destination=await Promise.race([validateDestination(current,allowedHosts,resolver,{sourceProxyUrl,inheritedProxy}),abort]);
      current=destination.url;
      if(signal.aborted)throw new AppError('fetch_timeout','网页响应超时，请稍后手动重试。');
      const options={connect:{lookup:pinnedLookup(destination),timeout:15000,rejectUnauthorized:true}};
      const dispatcher=sourceProxyUrl?sourceProxyDispatcher(sourceProxyUrl):inheritedProxy
        ? new EnvHttpProxyAgent({...options,proxyTls:{rejectUnauthorized:true},requestTls:{rejectUnauthorized:true}}) : new Agent(options);
      try {
        const response=await fetchImpl(current,{redirect:'manual',signal,dispatcher,
          headers:{'User-Agent':'FDEWorkbench/2.0 (personal research; low-frequency)','Accept':'text/html,application/xhtml+xml,application/rss+xml,application/atom+xml,application/xml,text/plain;q=0.8'}});
        receivedResponse=true;
        if([301,302,303,307,308].includes(response.status)) {
          const location=response.headers.get('location'); await response.body?.cancel();
          if(!followRedirects)throw new AppError('invalid_redirect','接口返回了意外的跳转地址。');
          if(!location)throw new AppError('invalid_redirect','网页跳转地址无效。');
          try { current=new URL(location,current).href; }
          catch { throw new AppError('invalid_redirect','网页跳转地址无效。'); }
          continue;
        }
        if(!response.ok) { await response.body?.cancel();throw new AppError('source_http',`来源返回 HTTP ${response.status}，请打开原文或手动粘贴正文。`); }
        const type=response.headers.get('content-type')||'';
        if(type && !/text\/|xml|json/i.test(type)) {await response.body?.cancel();throw new AppError('unsupported_content','仅支持网页、文字和订阅内容，不自动下载文件或媒体。');}
        if(Number(response.headers.get('content-length'))>maxBytes){await response.body?.cancel();throw new AppError('page_too_large','页面过大，请手动选取与研究有关的正文。');}
        const chunks=[];let size=0;
        for await(const chunk of response.body){size+=chunk.length;if(size>maxBytes){await response.body.cancel().catch(()=>{});throw new AppError('page_too_large','页面过大，请手动选取正文。');}chunks.push(Buffer.from(chunk));}
        const bytes=Buffer.concat(chunks), charset=/charset=["']?([^;\s"']+)/i.exec(type)?.[1]||'utf-8';
        let text;try{text=new TextDecoder(charset).decode(bytes);}catch{text=bytes.toString('utf8');}
        return {url:current,text,contentType:type,bytes:size,status:response.status,
          ...(sourceProxyUrl?{sourceProxyPort:Number(new URL(sourceProxyUrl).port||80)}:{})};
      } finally {
        if(!sourceProxyUrl)await dispatcher.destroy();
      }
    }
    throw new AppError('too_many_redirects','网页多次跳转，请人工检查原文地址。');
  } catch(error) {
    if(error instanceof AppError)throw error;
    if(signal.aborted)throw new AppError('fetch_timeout','网页响应超时，请稍后手动重试。');
    if(/^(?:CERT_|ERR_TLS_CERT_|UNABLE_TO_GET_ISSUER_CERT|UNABLE_TO_VERIFY_LEAF_SIGNATURE|DEPTH_ZERO_SELF_SIGNED_CERT|SELF_SIGNED_CERT_IN_CHAIN)/.test(error.cause?.code))
      throw new AppError('source_tls_failed','信源 HTTPS 证书未通过验证，请核对原文地址及本机证书。');
    if(sourceProxyUrl){
      if(!receivedResponse&&cannotReachProxy(error,sourceProxyUrl))throw new AppError('source_proxy_unreachable','采集代理的本机端口无法连接。');
      throw sourceProxyError();
    }
    throw new AppError('fetch_failed','无法读取网页，请检查网络，或粘贴正文手动收录。');
  }
}
export async function closeFetcher(){
  const dispatchers=[...sourceProxies.values()];
  sourceProxies.clear();
  await Promise.all(dispatchers.map(dispatcher=>dispatcher.close()));
}
