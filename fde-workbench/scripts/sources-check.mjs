import { readSources } from '../src/config.mjs';
import { readSource, extractArticle } from '../src/collect.mjs';
import { fetchText, closeFetcher } from '../src/fetch.mjs';

// Explicit network diagnostic only. Does not open the database or call any model.
const id=process.argv.find(arg=>arg.startsWith('--id='))?.slice(5);
const all=readSources().filter(s=>id?s.id===id:s.enabled);
if(!all.length){console.error('未找到待检查的信源。');process.exitCode=1;}
try{
  for(const source of all){
    const report={id:source.id,checkedAt:new Date().toISOString(),ok:false};
    try{
      const entries=await readSource(source);report.entries=entries.length;
      const sample=entries[0];report.sampleUrl=sample.url;
      try{const page=await fetchText(sample.url,{allowedHosts:source.allowedHosts}),detail=extractArticle(page.text,page.url,source);report.bodyChars=detail.body.length;report.publishedAt=detail.publishedAt||sample.publishedAt;report.bodyKind='page';report.ok=detail.body.length>=180;}
      catch{report.bodyChars=sample.body.length;report.publishedAt=sample.publishedAt;report.bodyKind='feed_excerpt';report.ok=sample.body.length>=600;}
    }catch(error){report.error=error.code||'source_check_failed';}
    console.log(JSON.stringify(report));if(!report.ok)process.exitCode=2;
  }
}finally{await closeFetcher();}
