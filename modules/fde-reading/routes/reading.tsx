import { useMemo, useState } from "react";
import { SITE } from "@aihot/site";
import { PhoneBar } from "../../../apps/web/app/components/shell/PhoneBar";
import type { Screen } from "../../../apps/web/app/components/shell/screens";
import { pageMeta } from "../../../apps/web/app/lib/seo";
import { PRACTICE_LINKS, type PracticeKind, type PracticeRegion } from "../library";

export const handle: Screen = { tab: "me", name: "阅读起点" };

export function meta() {
  return pageMeta({
    title: "FDE 阅读起点",
    description: "国内外企业 AI 项目案例、实操教程、工程架构和交付复盘的人工精选阅读目录。",
    path: "/reading",
  });
}
const kinds: Array<"全部" | PracticeKind> = ["全部", "落地案例", "工程方案", "实操教程", "交付方法", "成本效果", "项目复盘"];
const regions: Array<"全部" | PracticeRegion> = ["全部", "国内", "海外"];

export default function ReadingPage() {
  const [kind, setKind] = useState<(typeof kinds)[number]>("全部");
  const [region, setRegion] = useState<(typeof regions)[number]>("全部");
  const [query, setQuery] = useState("");
  const items = useMemo(() => {
    const q = query.trim().toLocaleLowerCase();
    return PRACTICE_LINKS.filter((entry) =>
      (kind === "全部" || entry.kind === kind) &&
      (region === "全部" || entry.region === region) &&
      (!q || [entry.title, entry.source, entry.focus, entry.note].some((value) => value.toLocaleLowerCase().includes(q))));
  }, [kind, region, query]);
  return (
    <main className="mx-auto max-w-[var(--page-max-reading)] pb-16">
      <PhoneBar back={{ to: "/more", label: "我的" }} title="阅读起点" />
      <header className="pt-5 pb-7 lg:pt-1">
        <p className="text-[12px] font-semibold tracking-[0.12em] text-accent">{SITE.name} / 实战资料库</p>
        <h1 data-page-title="" className="mt-3 text-[29px] font-black tracking-tight text-ink sm:text-[38px]">从真实问题出发，学习 AI 怎么落地</h1>
        <p className="mt-3 max-w-[56rem] text-[14px] leading-7 text-ink-3">
          先读经过人工选编的工程文章，再到主题与动态页面跟踪最新案例。这里的资料均链接到原作者；
          “厂商自述”不是第三方验证，“产品文档”也不是生产案例。
        </p>
        <div className="mt-5 flex flex-wrap gap-3 text-[12px] text-ink-3">
          <span className="rounded-full border border-line px-3 py-1.5">{PRACTICE_LINKS.length} 篇入门资料</span>
          <span className="rounded-full border border-line px-3 py-1.5">中英文并收</span>
          <span className="rounded-full border border-line px-3 py-1.5">不复制第三方全文</span>
        </div>
      </header>
      <section className="rounded-card border border-line bg-surface p-4 sm:p-5" aria-label="筛选阅读资料">
        <label htmlFor="reading-query" className="block text-[13px] font-semibold text-ink">检索主题、业务或方法</label>
        <input id="reading-query" type="search" value={query} onChange={(event) => setQuery(event.target.value)}
          placeholder="例如：RAG、验收、知识库、Agent、工业" className="mt-2 w-full rounded-control border border-line bg-bg px-3 py-3 text-[14px] text-ink outline-none focus:border-accent" />
        <div className="mt-4 flex flex-wrap gap-2" role="group" aria-label="按资料类型筛选">
          {kinds.map((value) => <button key={value} type="button" onClick={() => setKind(value)} aria-pressed={kind === value}
            className={`rounded-full px-3 py-1.5 text-[12px] font-semibold transition-colors ${kind === value ? "bg-accent text-white" : "bg-bg-sunk text-ink-2 hover:bg-well"}`}>{value}</button>)}
        </div>
        <div className="mt-3 flex flex-wrap gap-2" role="group" aria-label="按地区筛选">
          {regions.map((value) => <button key={value} type="button" onClick={() => setRegion(value)} aria-pressed={region === value}
            className={`rounded-full px-3 py-1.5 text-[12px] font-medium ${region === value ? "bg-accent text-white" : "border border-line text-ink-2"}`}>{value}</button>)}
        </div>
      </section>
      <div className="my-5 text-[13px] text-ink-3" aria-live="polite">找到 {items.length} 篇资料</div>
      {items.length ? (
        <ul className="grid gap-3 md:grid-cols-2">
          {items.map((entry) => <li key={entry.id} className="card flex flex-col p-5">
            <div className="flex flex-wrap items-center gap-2 text-[11px] text-ink-4">
              <span className="rounded bg-well px-2 py-1 font-semibold text-accent">{entry.kind}</span>
              <span>{entry.region}</span><span>·</span><span>{entry.source}</span>
            </div>
            <h2 className="mt-3 text-[17px] font-bold leading-relaxed text-ink">{entry.title}</h2>
            <p className="mt-2 flex-1 text-[13px] leading-6 text-ink-2">{entry.note}</p>
            <p className="mt-3 border-t border-line-soft pt-3 text-[12px] leading-5 text-ink-4">来源说明：{entry.evidence}</p>
            <a href={entry.url} target="_blank" rel="noopener noreferrer" className="mt-4 inline-flex w-fit items-center gap-1 text-[13px] font-bold text-accent hover:underline">
              阅读原文 <span aria-hidden="true">↗</span>
            </a>
          </li>)}
        </ul>
      ) : <div className="card p-10 text-center text-[14px] text-ink-3">没有匹配资料。试试更短的关键词，或切换为“全部”。</div>}
    </main>
  );
}
