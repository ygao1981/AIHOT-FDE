import { lookup } from 'node:dns';
import { lookup as lookupAsync } from 'node:dns/promises';
import { isIP } from 'node:net';
import { Agent, EnvHttpProxyAgent, fetch } from 'undici';
import ipaddr from 'ipaddr.js';
import { AppError } from './config.mjs';

export function isPublicAddress(address) {
  try { return ipaddr.process(address).range() === 'unicast'; } catch { return false; }
}
export function canonicalUrl(value) {
  let u; try { u=new URL(value); } catch { throw new AppError('invalid_url','请提供完整的公开网页地址。'); }
  if(!['http:','https:'].includes(u.protocol) || u.username || u.password || (u.port && !['80','443'].includes(u.port)))
    throw new AppError('invalid_url','只支持不含账号密码的公开 HTTP 或 HTTPS 网页。');
  const host=u.hostname.replace(/^\[|\]$/g,'').toLowerCase();
  if(host==='localhost' || host.endsWith('.localhost') || host.endsWith('.local') || host.endsWith('.internal') || (isIP(host) && !isPublicAddress(host)))
    throw new AppError('blocked_url','不能采集本机、内网或云服务器管理地址。');
  u.hash='';
  for(const k of [...u.searchParams.keys()]) if(/^utm_/i.test(k)||['fbclid','gclid','mc_cid','mc_eid'].includes(k))u.searchParams.delete(k);
  return u.href;
}
export async function validateDestination(value, allowedHosts, resolver = lookupAsync, {proxyDns=false}={}) {
  const url=canonicalUrl(value), u=new URL(url), host=u.hostname.replace(/^\[|\]$/g,'');
  if(allowedHosts?.length && !allowedHosts.includes(host)) throw new AppError('source_host_changed','文章跳到了未登记的网站，请人工核对信源。');
  let addresses;
  try { addresses=isIP(host)?[{address:host}]:await resolver(host,{all:true}); }
  catch(error) {
    // An inherited HTTP proxy may be the only available DNS path. Delegate only
    // explicitly registered HTTPS hosts; arbitrary manual URLs still fail closed.
    // Explicitly resolved private addresses never take this branch.
    if(proxyDns&&u.protocol==='https:'&&!isIP(host)&&allowedHosts?.includes(host)&&['EAI_AGAIN','ENOTFOUND'].includes(error.code))return url;
    throw error;
  }
  if(!addresses.length || addresses.some(r=>!isPublicAddress(r.address))) throw new AppError('blocked_url','目标地址不能用于公开网页采集。');
  return url;
}
function guardedLookup(hostname, options, cb) {
  lookup(hostname,{...options,all:true},(error,addresses)=>{
    if(error)return cb(error);
    if(!addresses.length || addresses.some(r=>!isPublicAddress(r.address)))return cb(new Error('blocked destination'));
    if(options?.all)cb(null,addresses);else cb(null,addresses[0].address,addresses[0].family);
  });
}
let dispatcher;
function outgoingDispatcher() {
  if(!dispatcher) {
    const options={connect:{lookup:guardedLookup,timeout:15000},headersTimeout:20000,bodyTimeout:20000};
    // Honor existing proxy and certificate settings. A configured proxy is a trusted network boundary.
    dispatcher=(process.env.HTTPS_PROXY||process.env.HTTP_PROXY||process.env.https_proxy||process.env.http_proxy)
      ? new EnvHttpProxyAgent(options) : new Agent(options);
  }
  return dispatcher;
}
export async function fetchText(value, {allowedHosts,maxBytes=3*1024*1024,timeoutMs=20000,fetchImpl=fetch,resolver=lookupAsync,dispatcherOverride}={}) {
  const signal=AbortSignal.timeout(timeoutMs);
  let current=value;
  try {
    for(let hop=0;hop<5;hop++) {
      const proxyDns=!!(process.env.HTTPS_PROXY||process.env.HTTP_PROXY||process.env.https_proxy||process.env.http_proxy);
      const abort=new Promise((_,reject)=>signal.addEventListener('abort',()=>reject(new AppError('fetch_timeout','网页响应超时，请稍后手动重试。')),{once:true}));
      current=await Promise.race([validateDestination(current,allowedHosts,resolver,{proxyDns}),abort]);
      if(signal.aborted)throw new AppError('fetch_timeout','网页响应超时，请稍后手动重试。');
      const response=await fetchImpl(current,{redirect:'manual',signal,dispatcher:dispatcherOverride||outgoingDispatcher(),
        headers:{'User-Agent':'FDEWorkbench/2.0 (personal research; low-frequency)','Accept':'text/html,application/xhtml+xml,application/rss+xml,application/atom+xml,application/xml,text/plain;q=0.8'}});
      if([301,302,303,307,308].includes(response.status)) {
        const location=response.headers.get('location'); await response.body?.cancel();
        if(!location)throw new AppError('invalid_redirect','网页跳转地址无效。');
        current=new URL(location,current).href;continue;
      }
      if(!response.ok) { await response.body?.cancel();throw new AppError('source_http',`来源返回 HTTP ${response.status}，请打开原文或手动粘贴正文。`); }
      const type=response.headers.get('content-type')||'';
      if(type && !/text\/|xml|json/i.test(type)) {await response.body?.cancel();throw new AppError('unsupported_content','仅支持网页、文字和订阅内容，不自动下载文件或媒体。');}
      if(Number(response.headers.get('content-length'))>maxBytes){await response.body?.cancel();throw new AppError('page_too_large','页面过大，请手动选取与研究有关的正文。');}
      const chunks=[];let size=0;
      for await(const chunk of response.body){size+=chunk.length;if(size>maxBytes){await response.body.cancel().catch(()=>{});throw new AppError('page_too_large','页面过大，请手动选取正文。');}chunks.push(Buffer.from(chunk));}
      const bytes=Buffer.concat(chunks), charset=/charset=["']?([^;\s"']+)/i.exec(type)?.[1]||'utf-8';
      let text;try{text=new TextDecoder(charset).decode(bytes);}catch{text=bytes.toString('utf8');}
      return {url:current,text,contentType:type,bytes:size,status:response.status};
    }
    throw new AppError('too_many_redirects','网页多次跳转，请人工检查原文地址。');
  } catch(error) {
    if(error instanceof AppError)throw error;
    if(signal.aborted)throw new AppError('fetch_timeout','网页响应超时，请稍后手动重试。');
    throw new AppError('fetch_failed','无法读取网页，请检查网络，或粘贴正文手动收录。');
  }
}
export async function closeFetcher(){if(dispatcher){await dispatcher.close();dispatcher=null;}}
