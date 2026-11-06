import { useState } from 'react';
import { Link,useLoaderData } from 'react-router';
import { apiGet } from '@aihot/web/lib/api.server';
import { pageMeta } from '@aihot/web/lib/seo';
import { PhoneBar } from '@aihot/web/components/shell/PhoneBar';
import type { Screen } from '@aihot/web/components/shell/screens';
import type { Research } from '../core.mjs';
export const handle:Screen={tab:'me',name:'研究与选题'};
interface Note {id:string;title:string;url:string;at:string;publishedAt:string|null;research:Research}
export async function loader({request}:{request:Request}) {
 const before=new URL(request.url).searchParams.get('before');
 return apiGet<{items:Note[];next:string|null}>(`/api/fde/research${before?'?before='+encodeURIComponent(before):''}`,{signal:request.signal});
}
export function headers(){return {'Cache-Control':'no-store'};}
export function meta(){return pageMeta({title:'FDE研究与公众号选题',path:'/research',noindex:true});}
const stage={proposal:'方案',demo:'演示',pilot:'试点',production:'生产上线',not_disclosed:'阶段未披露'};
export default function ResearchPage(){
 const {items,next}=useLoaderData<typeof loader>();const [query,setQuery]=useState('');
 const visible=items.filter(n=>JSON.stringify(n.research).toLowerCase().includes(query.trim().toLowerCase()));
 return <div className="mx-auto max-w-[var(--page-max-reading)] pb-14">
  <PhoneBar title="研究与选题" back={{to:'/more',label:'我的'}}/>
  <h1 data-page-title="" className="pt-4 text-[28px] font-bold text-ink">研究笔记与公众号选题</h1>
  <p className="mt-3 text-[14px] leading-7 text-ink-3">每篇资料一次分析。事实依据、实施经验和编辑建议分别展示。AI生成内容需人工核对；浏览本页不调用模型。</p>
  <label className="mt-5 block text-[13px] text-ink-2">筛选当前页
   <input type="search" value={query} onChange={e=>setQuery(e.target.value)} placeholder="例如：知识库、成本、售后"
    className="mt-2 w-full rounded-control border border-line bg-surface p-3 text-ink"/>
  </label>
  {!visible.length&&<div className="card mt-6 p-8 text-center text-ink-3">{items.length?'没有匹配资料，请换个关键词。':'尚无已公开的研究笔记。完成登录并开启少量分析后，这里会自动更新。'}</div>}
  <div className="mt-6 space-y-4">{visible.map(n=><article key={n.id} className="card p-5 sm:p-7">
   <p className="text-[12px] text-accent">{stage[n.research.stage]} · {n.publishedAt?n.publishedAt.slice(0,10):'原文日期待确认'}</p>
   <h2 className="mt-2 text-[20px] font-bold text-ink"><Link to={`/items/${n.id}`}>{n.title}</Link></h2>
   <p className="mt-3 leading-7 text-ink-2">{n.research.summary}</p>
   <dl className="mt-4 grid gap-3 text-[14px] leading-7 sm:grid-cols-2">
    <div><dt className="font-bold text-ink">业务问题</dt><dd className="text-ink-3">{n.research.problem}</dd></div>
    <div><dt className="font-bold text-ink">实施方法</dt><dd className="text-ink-3">{n.research.solution}</dd></div>
   </dl>
   <details className="mt-4 border-t border-line pt-3 text-[14px] leading-7 text-ink-3">
    <summary className="cursor-pointer font-bold text-ink">查看效果、原文证据与限制</summary>
    <p className="mt-2">{n.research.outcome}</p>
    {n.research.evidence.map((e,i)=><blockquote key={i} className="mt-3 border-l-2 border-line pl-3"><p>{e.quote}</p><p className="mt-1">对应说明：{e.claim}</p></blockquote>)}
    {n.research.lessons.map((v,i)=><p key={'l'+i}>可复用经验：{v}</p>)}
    {n.research.limitations.map((v,i)=><p key={'r'+i}>限制：{v}</p>)}
   </details>
   <section className="mt-5 rounded-control bg-bg-sunk p-4">
    <h3 className="text-[14px] font-bold text-ink">公众号选题草案 · 编辑建议</h3>
    {n.research.ideas.map((v,i)=><div key={i} className="mt-3 text-[14px] leading-6"><h4 className="font-semibold text-ink">{v.title}</h4><p className="text-ink-3">{v.angle}</p></div>)}
   </section>
   <a href={n.url} target="_blank" rel="noopener noreferrer" className="mt-4 inline-block text-[14px] font-bold text-accent">核对原文 ↗</a>
  </article>)}</div>
  {next&&<Link to={'/research?before='+encodeURIComponent(next)} className="mt-6 inline-block text-accent">查看更早资料 →</Link>}
 </div>;
}
