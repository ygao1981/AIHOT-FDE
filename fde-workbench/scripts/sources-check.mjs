import { readSources, readSourceProxyUrl } from '../src/config.mjs';
import { readSource, extractArticle, sourceFetchOptions } from '../src/collect.mjs';
import { fetchText, closeFetcher } from '../src/fetch.mjs';

// Explicit network diagnostic only. Does not open the database or call any model.
const id=process.argv.find(arg=>arg.startsWith('--id='))?.slice(5);
const all=readSources().filter(s=>id?s.id===id:s.enabled);
if(!all.length){console.error('未找到待检查的信源。');process.exitCode=1;}
try{
  const sourceProxyUrl=readSourceProxyUrl(process.env.FDE_SOURCE_PROXY_URL);
  for(const source of all){
    const report={id:source.id,checkedAt:new Date().toISOString(),ok:false};
    try{
      const entries=await readSource(source,{sourceProxyUrl});report.entries=entries.length;
      const sample=entries[0];report.sampleUrl=sample.url;
      try{const page=await fetchText(sample.url,sourceFetchOptions(source,sourceProxyUrl)),detail=extractArticle(page.text,page.url,source);report.bodyChars=detail.body.length;report.publishedAt=detail.publishedAt||sample.publishedAt;report.bodyKind='page';report.ok=detail.body.length>=180;}
      catch(error){report.detailError=error.code||'source_check_failed';report.bodyChars=sample.body.length;report.publishedAt=sample.publishedAt;report.bodyKind='feed_excerpt';report.ok=sample.body.length>=600;}
    }catch(error){report.error=error.code||'source_check_failed';}
    console.log(JSON.stringify(report));if(!report.ok)process.exitCode=2;
  }
}catch(error){console.error(error.code==='invalid_config'?error.message:'信源检查未完成。');process.exitCode=2;}
finally{await closeFetcher();}
