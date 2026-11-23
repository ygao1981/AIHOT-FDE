import test from 'node:test';
import assert from 'node:assert/strict';
import { parseFeed,parseList,extractArticle,publicationDate,collectSource,importArticle } from '../src/collect.mjs';
import { canonicalUrl,isPublicAddress,validateDestination,fetchText,closeFetcher } from '../src/fetch.mjs';
import { fixture,body } from './helpers.mjs';

const source={id:'test-source',name:'测试源',kind:'rss',url:'https://example.com/feed',allowedHosts:['example.com'],priority:5};
const html=(title='企业 AI 交付',text=body)=>`<!doctype html><html><head><title>${title}</title><meta property="article:published_time" content="2026-01-02T10:00:00+08:00"></head><body><nav>导航</nav><article><h1>${title}</h1><p>${text}</p></article></body></html>`;

test('canonical URLs remove known trackers but preserve identifiers including WeChat parameters',()=>{
  assert.equal(canonicalUrl('https://example.com/a?id=7&utm_source=x#part'),'https://example.com/a?id=7');
  assert.equal(canonicalUrl('https://mp.weixin.qq.com/s?__biz=abc&mid=1&idx=2&sn=def'),'https://mp.weixin.qq.com/s?__biz=abc&mid=1&idx=2&sn=def');
});
test('rejects loopback, metadata, private IPv4, mapped IPv6, credentials and non-web URLs',()=>{
  for(const address of ['127.0.0.1','10.1.2.3','169.254.169.254','::1','fc00::1','::ffff:127.0.0.1','100.64.0.1'])assert.equal(isPublicAddress(address),false,address);
  for(const url of ['file:///etc/passwd','http://localhost/a','http://127.1/a','http://user:secret@example.com','http://example.com:22/'])assert.throws(()=>canonicalUrl(url));
  assert.equal(isPublicAddress('93.184.216.34'),true);
});
test('DNS addresses and redirect destinations are checked before connecting',async()=>{
  await assert.rejects(validateDestination('https://example.com',null,async()=>[{address:'127.0.0.1'}]),{code:'blocked_url'});
  let calls=0;
  await assert.rejects(fetchText('https://example.com',{resolver:async()=>[{address:'93.184.216.34'}],fetchImpl:async()=>{calls++;return new Response(null,{status:302,headers:{location:'http://169.254.169.254/latest/meta-data/'}});}}),{code:'blocked_url'});
  assert.equal(calls,1);await closeFetcher();
});
test('proxy DNS is limited to registered HTTPS sources and never overrides a known private address',async()=>{
  const unavailable=async()=>{throw Object.assign(new Error('DNS unavailable'),{code:'EAI_AGAIN'});};
  assert.equal(await validateDestination('https://example.com/a',['example.com'],unavailable,{proxyDns:true}),'https://example.com/a');
  await assert.rejects(validateDestination('https://example.com/a',undefined,unavailable,{proxyDns:true}));
  await assert.rejects(validateDestination('http://example.com/a',['example.com'],unavailable,{proxyDns:true}));
  await assert.rejects(validateDestination('https://example.com/a',['example.com'],async()=>[{address:'10.1.1.1'}],{proxyDns:true}),{code:'blocked_url'});
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
