// Manual historical reading-list import. Does not scrape, reshare full text, or call a paid provider.
// Example: FDE_BASE_URL=http://localhost:3000 INGEST_TOKEN=... node scripts/fde-import.ts industry/fde-history.example.jsonl
import { readFileSync } from "node:fs";

const filepath = process.argv.find((arg, index) => index > 1 && !arg.startsWith("--"));
const dryRun = process.argv.includes("--dry-run");
const base = (process.env.FDE_BASE_URL ?? process.env.SITE_URL ?? "").replace(/\/$/, "");
const token = process.env.INGEST_TOKEN ?? "";
if (!filepath) throw new Error("需要提供 JSONL 文件路径，如 industry/fde-history.example.jsonl");
if (!dryRun && (!base.startsWith("http://") && !base.startsWith("https://") || token.length < 16))
  throw new Error("需要设置 FDE_BASE_URL（或 SITE_URL）与至少 16 位 INGEST_TOKEN；不在命令行里写密钥");

type Entry = { title: string; url: string; publishedAt: string; author?: string };
const lines = readFileSync(filepath, "utf8").split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
const rows: Entry[] = lines.map((line, i) => {
  const row: unknown = JSON.parse(line);
  if (!row || typeof row !== "object") throw new Error(`第 ${i + 1} 行必须是 JSON 对象`);
  const entry = row as Record<string, unknown>;
  if (typeof entry.title !== "string" || !entry.title.trim()) throw new Error(`第 ${i + 1} 行没有标题`);
  if (typeof entry.url !== "string" || !/^https:\/\//.test(entry.url)) throw new Error(`第 ${i + 1} 行 URL 无效`);
  if (typeof entry.publishedAt !== "string" || !Number.isFinite(Date.parse(entry.publishedAt))) throw new Error(`第 ${i + 1} 行发布时间无效`);
  return { title: entry.title.trim(), url: entry.url, publishedAt: entry.publishedAt, ...(typeof entry.author === "string" ? { author: entry.author } : {}) };
});
console.log(`已读取 ${rows.length} 条历史索引；不在本站转载来源全文。`);
if (!dryRun) {
  let created = 0;
  for (let i = 0; i < rows.length; i += 50) {
    const chunk = rows.slice(i, i + 50).map((item) => ({ ...item, raw: { _aihot: { backfill: true } } }));
    const response = await fetch(`${base}/api/ingest/items`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ sourceId: "fde-curated", sourceName: "人工精选与历史案例", items: chunk }),
    });
    const body = await response.text();
    if (!response.ok) throw new Error(`批次 ${Math.floor(i / 50) + 1} 推送失败（HTTP ${response.status}）：${body.slice(0, 300)}`);
    const data = JSON.parse(body) as { created: number };
    created += data.created;
  }
  console.log(`推送完成；新建 ${created} 条。历史回灌不会刷进“今天”或发送通知。`);
}
