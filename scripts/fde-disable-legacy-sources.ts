// One-time, opt-in migration for databases seeded with the upstream AI demo feeds.
// Never removes the articles, sources, or the operator's custom sources.
import { closeDb, sql } from "@aihot/backend/db";

const oldDemoIds = [
  "rss-openai-news", "rss-google-deepmind", "rss-google-research", "rss-hugging-face",
  "rss-microsoft-research", "rss-nvidia-blog", "rss-aws-ml", "rss-github-ai",
  "rss-mistral", "rss-bair", "rss-the-verge-ai", "rss-techcrunch-ai",
  "rss-ars-technica-ai", "rss-mit-tech-review-ai", "rss-the-decoder",
  "rss-simon-willison", "rss-import-ai", "rss-latent-space",
];
try {
  if (process.argv.includes("--dry-run")) {
    const rows = await sql<{ id: string; name: string; enabled: boolean }[]>`SELECT id, name, enabled FROM sources WHERE id = ANY(${oldDemoIds}::text[]) ORDER BY id`;
    console.log("这些历史示范源将被停用（保留原始文章）：");
    for (const row of rows) console.log(`${row.enabled ? "[开]" : "[停]"} ${row.id} - ${row.name}`);
  } else {
    const rows = await sql<{ id: string }[]>`
      UPDATE sources SET enabled = false, updated_at = now()
      WHERE id = ANY(${oldDemoIds}::text[]) AND enabled = true RETURNING id`;
    console.log(`已停用 ${rows.length} 个旧示范源。没有删除源、文章或其他配置。`);
  }
} finally {
  await closeDb();
}
