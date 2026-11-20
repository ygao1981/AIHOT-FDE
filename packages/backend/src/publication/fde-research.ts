// All public research reads share the engine's publication visibility/release rules.
import { sql } from '../db.ts';
import { listedCondition } from './scope.ts';
import type { Research } from '../../../../modules/fde-research/core.mjs';
export async function researchNotes(before?:string) {
  const [date,id]=before?.split('|') ?? [];
  const cursor=date && id && id.length<=200 && Number.isFinite(Date.parse(date)) ? {at:new Date(date),id} : null;
  const rows=await sql<{id:string;title:string;url:string;published_at:Date|null;at:Date;research:Research}[]>`
    SELECT p.article_id AS id,p.title,p.url,p.published_at,p.sort_at AS at,a.output->'fdeResearch' AS research
    FROM publications p JOIN analyses a ON a.id=p.analysis_id
    WHERE ${listedCondition(new Date())} AND jsonb_typeof(a.output->'fdeResearch')='object'
      AND ${cursor ? sql`(p.sort_at,p.article_id)<(${cursor.at},${cursor.id})` : sql`TRUE`}
    ORDER BY p.sort_at DESC,p.article_id DESC LIMIT 50`;
  return {items:rows.map(r=>({...r,at:r.at.toISOString(),publishedAt:r.published_at?.toISOString()??null})),
    next:rows.length===50 ? `${rows[rows.length-1]!.at.toISOString()}|${rows[rows.length-1]!.id}` : null};
}
