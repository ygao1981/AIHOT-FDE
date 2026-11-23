import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createServer as httpServer } from 'node:http';
import { createServer as httpsServer } from 'node:https';
import net from 'node:net';
import tls from 'node:tls';
import { once } from 'node:events';
import { parseFeed,parseList,extractArticle,publicationDate,readSource,collectSource,importArticle } from '../src/collect.mjs';
import { canonicalUrl,isPublicAddress,fetchText,closeFetcher } from '../src/fetch.mjs';
import { readSourceProxyUrl } from '../src/config.mjs';
import { fixture,body } from './helpers.mjs';

const source={id:'test-source',name:'测试源',kind:'rss',url:'https://example.com/feed',allowedHosts:['example.com'],priority:5};
const html=(title='企业 AI 交付',text=body)=>`<!doctype html><html><head><title>${title}</title><meta property="article:published_time" content="2026-01-02T10:00:00+08:00"></head><body><nav>导航</nav><article><h1>${title}</h1><p>${text}</p></article></body></html>`;

test('canonical URLs remove known trackers but preserve identifiers including WeChat parameters',()=>{
  assert.equal(canonicalUrl('https://example.com/a?id=7&utm_source=x#part'),'https://example.com/a?id=7');
  assert.equal(canonicalUrl('https://mp.weixin.qq.com/s?__biz=abc&mid=1&idx=2&sn=def'),'https://mp.weixin.qq.com/s?__biz=abc&mid=1&idx=2&sn=def');
});
test('rejects loopback, metadata, private IPv4, mapped IPv6, credentials and non-web URLs',()=>{
  for(const address of ['127.0.0.1','10.1.2.3','169.254.169.254','::1','fc00::1','::ffff:127.0.0.1','100.64.0.1','198.18.0.61','198.19.255.254','192.0.2.4','2001:db8::1','fe80::1','64:ff9b::a9fe:a9fe'])assert.equal(isPublicAddress(address),false,address);
  for(const url of ['file:///etc/passwd','http://localhost/a','http://127.1/a','http://user:secret@example.com','http://example.com:22/'])assert.throws(()=>canonicalUrl(url));
  assert.equal(isPublicAddress('93.184.216.34'),true);
  assert.equal(isPublicAddress('2606:4700::1111'),true);
});
test('DNS addresses and redirect destinations are checked before connecting',async()=>{
  for(const addresses of [['127.0.0.1'],['198.18.0.61'],['93.184.216.34','fc00::1'],['2606:4700::1111','10.1.2.3']]) {
    await assert.rejects(fetchText(source.url,{resolver:async()=>addresses.map(address=>({address})),fetchImpl:()=>assert.fail('unexpected network request')}),{code:'blocked_url'});
  }
  let calls=0;
  await assert.rejects(fetchText('https://example.com',{resolver:async()=>[{address:'93.184.216.34'}],fetchImpl:async()=>{calls++;return new Response(null,{status:302,headers:{location:'http://169.254.169.254/latest/meta-data/'}});}}),{code:'blocked_url'});
  assert.equal(calls,1);await closeFetcher();
});
test('direct connection uses the validated DNS addresses without a second lookup',async t=>{
  const server=httpServer((_req,res)=>res.end('direct response'));
  await listen(server);
  t.after(()=>new Promise(resolve=>server.close(resolve)));
  const connect=net.Socket.prototype.connect;
  let resolverCalls=0,connected=0;
  t.mock.method(net.Socket.prototype,'connect',function(...args){
    const [options,onConnect]=Array.isArray(args[0])?args[0]:args;
    if(options?.host!=='source.test')return connect.apply(this,args);
    options.lookup('source.test',{all:true},(error,addresses)=>{
      assert.ifError(error);
      assert.deepEqual(addresses,[{address:'93.184.216.34',family:4},{address:'2606:4700::1111',family:6}]);
    });
    connected++;
    return connect.call(this,{host:'127.0.0.1',port:server.address().port},onConnect);
  });
  const result=await fetchText('http://source.test/feed',{resolver:async()=>{
    resolverCalls++;
    return (resolverCalls===1?['93.184.216.34','2606:4700::1111']:['127.0.0.1']).map(address=>({address}));
  }});
  assert.equal(result.text,'direct response');
  assert.equal(resolverCalls,1);
  assert.equal(connected,1);
});
test('the explicit proxy configuration accepts only a local HTTP endpoint with a port',()=>{
  assert.equal(readSourceProxyUrl(''),'');
  assert.equal(readSourceProxyUrl('http://127.0.0.1:24567/'),'http://127.0.0.1:24567');
  assert.equal(readSourceProxyUrl('http://[::1]:24567'),'http://[::1]:24567');
  for(const value of ['http://proxy.test:24567','http://localhost:24567','http://127.1:24567','http://127.0.0.1','http://127.0.0.1:65536','http://127.0.0.1:0','https://127.0.0.1:24567','http://user:synthetic@127.0.0.1:24567','http://127.0.0.1:24567?other=1','http://127.0.0.1:24567/private']) {
    assert.throws(()=>readSourceProxyUrl(value),{code:'invalid_config'});
  }
});

const proxySource={...source,disposition:'auto',url:'https://source.test/feed',allowedHosts:['source.test']};
// This throwaway key and certificate identify only the local source.test fixture.
const key=readFileSync(new URL('./fixtures/source.test-key.pem',import.meta.url));
const cert=readFileSync(new URL('./fixtures/source.test-cert.pem',import.meta.url),'utf8');
const fakeIp=async()=>[{address:'198.18.0.61'}];
async function listen(server) {
  server.listen(0,'127.0.0.1');
  await once(server,'listening');
}
async function connectFixture(t,{trustCertificate=true}={}) {
  const requests=[], authorities=[], sockets=new Set();
  const origin=httpsServer({key,cert},(req,res)=>{
    requests.push(req.url);
    if(req.url==='/feed') {
      res.setHeader('Content-Type','application/rss+xml');
      res.end('<rss><channel><item><title>AI 交付案例</title><link>https://source.test/story</link></item></channel></rss>');
    } else {
      res.setHeader('Content-Type','text/html');
      res.end(html());
    }
  });
  const proxy=httpServer((_req,res)=>{res.writeHead(405);res.end();});
  const track=socket=>{
    sockets.add(socket);
    socket.on('close',()=>sockets.delete(socket));
    socket.on('error',()=>socket.destroy());
  };
  proxy.on('connection',track);
  origin.on('connection',track);
  proxy.on('connect',(req,client,head)=>{
    authorities.push(req.url);
    const peer=net.connect(origin.address().port,'127.0.0.1',()=>{
      client.write('HTTP/1.1 200 Connection Established\r\n\r\n');
      if(head.length)peer.write(head);
      client.pipe(peer);
      peer.pipe(client);
    });
    track(peer);
    client.on('close',()=>peer.destroy());
    peer.on('close',()=>client.destroy());
  });
  await listen(origin);
  await listen(proxy);
  if(trustCertificate) {
    const previous=tls.getCACertificates('default');
    tls.setDefaultCACertificates([...previous,cert]);
    t.after(()=>tls.setDefaultCACertificates(previous));
  }
  t.after(async()=>{
    for(const socket of sockets)socket.destroy();
    await closeFetcher();
    await Promise.all([origin,proxy].map(server=>new Promise(resolve=>server.close(resolve))));
  });
  return {proxyUrl:'http://127.0.0.1:'+proxy.address().port,requests,authorities};
}

test('the audited feed and detail use explicit CONNECT with a verified certificate and deduplicate',async t=>{
  const {proxyUrl,requests,authorities}=await connectFixture(t);
  const {store,config}=fixture(t,{sourceProxyUrl:proxyUrl});
  const previous=process.env.NO_PROXY;
  process.env.NO_PROXY='*';
  t.after(()=>{if(previous===undefined)delete process.env.NO_PROXY;else process.env.NO_PROXY=previous;});
  let dnsLookups=0;
  const fetcher=(url,options)=>fetchText(url,{...options,resolver:async()=>{dnsLookups++;return fakeIp();}});
  assert.equal((await collectSource(store,proxySource,config,{fetcher})).added,1);
  assert.equal((await collectSource(store,proxySource,config,{fetcher})).added,0);
  assert.equal(dnsLookups,0);
  assert.deepEqual(requests,['/feed','/story','/feed']);
  assert.ok(authorities.length>0&&authorities.every(authority=>authority==='source.test:443'));
  const item=store.listArticles().items[0];
  assert.equal(item.publishedAt,'2026-01-02T02:00:00.000Z');
  assert.equal(item.bodyKind,'page');
  assert.equal(store.overview(config).usage.attempts24h,0);
  await assert.rejects(readSource({...proxySource,disposition:'watch'},{fetcher,sourceProxyUrl:proxyUrl}),{code:'blocked_url'});
  assert.equal(dnsLookups,1);
});
test('an explicit proxy does not accept an untrusted HTTPS certificate',async t=>{
  const {proxyUrl,requests,authorities}=await connectFixture(t,{trustCertificate:false});
  await assert.rejects(readSource(proxySource,{sourceProxyUrl:proxyUrl}),{code:'source_tls_failed'});
  assert.deepEqual(authorities,['source.test:443']);
  assert.deepEqual(requests,[]);
});
test('the inherited proxy honors NO_PROXY and rejects a known nonpublic DNS answer',async t=>{
  const {proxyUrl,requests}=await connectFixture(t);
  const keys=['http_proxy','https_proxy','no_proxy'];
  const previous=keys.map(key=>[key,process.env[key]]);
  t.after(()=>{
    for(const [key,value] of previous) {
      if(value===undefined)delete process.env[key];
      else process.env[key]=value;
    }
  });
  process.env.http_proxy=proxyUrl;
  process.env.https_proxy=proxyUrl;
  process.env.no_proxy='';
  const unavailable=async()=>{throw Object.assign(new Error('DNS unavailable'),{code:'EAI_AGAIN'});};
  const allowedHosts=proxySource.allowedHosts;
  assert.equal((await fetchText(proxySource.url,{allowedHosts,resolver:unavailable})).status,200);
  await assert.rejects(fetchText(proxySource.url,{allowedHosts,resolver:fakeIp}),{code:'blocked_url'});
  process.env.no_proxy='source.test';
  await assert.rejects(fetchText(proxySource.url,{allowedHosts,resolver:unavailable}),{code:'fetch_failed'});
  assert.deepEqual(requests,['/feed']);
});
test('proxy redirects reapply the scheme, port, hostname and literal address checks',async()=>{
  const options={allowedHosts:proxySource.allowedHosts,sourceProxyUrl:'http://127.0.0.1:24567',resolver:()=>assert.fail('proxy route ran local DNS')};
  for(const [location,code] of [
    ['http://source.test/story','blocked_url'],
    ['https://source.test:80/story','blocked_url'],
    ['https://source.test.other.test/story','source_host_changed'],
    ['https://127.0.0.1/story','blocked_url'],
    ['https://169.254.169.254/story','blocked_url'],
    ['https://[::ffff:127.0.0.1]/story','blocked_url'],
  ]) {
    let requests=0;
    await assert.rejects(fetchText(proxySource.url,{...options,fetchImpl:async()=>{
      requests++;
      return new Response(null,{status:302,headers:{location}});
    }}),{code});
    assert.equal(requests,1);
  }
  await assert.rejects(fetchText(proxySource.url,{...options,allowedHosts:undefined}),{code:'blocked_url'});
  await closeFetcher();
});
test('an unavailable explicit proxy never retries by direct DNS or transfers a manual URL',async t=>{
  const unused=httpServer();
  await listen(unused);
  const proxyUrl='http://127.0.0.1:'+unused.address().port;
  await new Promise(resolve=>unused.close(resolve));
  t.after(closeFetcher);
  const options={allowedHosts:proxySource.allowedHosts,sourceProxyUrl:proxyUrl,resolver:()=>assert.fail('unexpected direct lookup')};
  await assert.rejects(fetchText(proxySource.url,options),{code:'source_proxy_failed'});
  const {store,config}=fixture(t,{sourceProxyUrl:proxyUrl});
  await assert.rejects(importArticle(store,{url:proxySource.url},config,{
    fetcher:(url,options)=>fetchText(url,{...options,resolver:fakeIp,fetchImpl:()=>assert.fail('manual URL reached network')}),
  }),{code:'blocked_url'});
});
test('feed parsing accepts RSS and Atom, rejects ordinary HTML and XML entity definitions',()=>{
  const rss=`<rss><channel><item><title>AI 实施教程</title><link>https://example.com/a</link><pubDate>Fri, 02 Jan 2026 10:00:00 GMT</pubDate><description><![CDATA[<p>${body}</p>]]></description></item></channel></rss>`;
  assert.equal(parseFeed(rss,source)[0].body,body);
  const atom='<feed><entry><title>RAG 实操</title><link rel="alternate" href="https://example.com/b"/><updated>2026-01-02T00:00:00Z</updated><content>材料</content></entry></feed>';
  assert.equal(parseFeed(atom,source)[0].publishedAt,null);
  assert.throws(()=>parseFeed('<html><body>RSS moved</body></html>',source),{code:'invalid_feed'});
  assert.throws(()=>parseFeed('<!DOCTYPE x [<!ENTITY a "attack">]><rss/>',source),{code:'unsafe_feed'});
});
test('list entries keep each card date instead of the page first date',()=>{
  const page='<a href="/post/a"><h2>第一篇</h2><time datetime="2026-01-02"></time></a><a href="/post/b"><h2>第二篇</h2><time datetime="2026-03-04"></time></a>';
  const list=parseList(page,{...source,linkSelector:'a',titleSelector:'h2',dateSelector:'time'});
  assert.deepEqual(list.map(x=>x.publishedAt),['2026-01-02','2026-03-04']);
});
test('article publication dates do not come from dateModified or arbitrary prose',()=>{
  const result=extractArticle('<html><head><meta property="article:modified_time" content="2026-10-10"></head><body><article><h1>测试</h1><p>2026-01-01 '+body+'</p></article></body></html>','https://example.com');
  assert.equal(result.publishedAt,null);assert.ok(result.body.length>180);
  assert.equal(publicationDate('2026年1月2日'),'2026-01-02');assert.equal(publicationDate('2026-02-30'),null);
});
test('extractor preserves declared publication metadata and excludes scripts',()=>{
  const result=extractArticle(html('AI 实战',body+'<script>steal secrets</script>'),'https://example.com');
  assert.equal(result.publishedAt,'2026-01-02T02:00:00.000Z');assert.ok(!result.body.includes('steal secrets'));
});
test('React-style itemProp and a declared visible publication selector preserve original dates',()=>{
  const shopify=extractArticle(`<html><head><meta itemProp="datePublished" content="2026-11-18T00:00:00.000Z"></head><body><article>${body}</article></body></html>`,'https://example.com');
  assert.equal(shopify.publishedAt,'2026-11-18T00:00:00.000Z');
  const chinese=extractArticle(`<html><body><span class="vp-post-date">2026年11月17日</span><article>${body}</article></body></html>`,'https://example.com',{detailDateSelector:'.vp-post-date'});
  assert.equal(chinese.publishedAt,'2026-11-17');
});
test('feed-body fallback is labeled partial, first collection is backfill, repeated collection deduplicates',async t=>{
  const {store,config}=fixture(t);const rss=`<rss><channel><item><title>企业 AI 部署教程</title><link>https://example.com/a</link><description><![CDATA[<p>${body}</p>]]></description></item></channel></rss>`;
  const fetcher=async url=>{if(url===source.url)return{text:rss,url};throw new Error('403');};
  const result=await collectSource(store,source,config,{fetcher});assert.equal(result.added,1);
  const item=store.listArticles().items[0];assert.equal(item.bodyKind,'feed_excerpt');assert.equal(item.backfill,true);assert.equal(item.publishedAt,null);
  assert.equal((await collectSource(store,source,config,{fetcher})).added,0);
});
test('manual paste works without network and without starting any analysis',async t=>{
  const {store,config}=fixture(t);let fetches=0;
  const {article}=await importArticle(store,{url:'https://example.com/a',title:'AI 工程案例',body},config,{fetcher:async()=>{fetches++;throw new Error();}});
  assert.equal(fetches,0);assert.equal(article.status,'candidate');assert.equal(article.bodyKind,'manual');assert.equal(store.overview(config).usage.attempts24h,0);
});
