import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadConfig } from '../src/config.mjs';
import { Store } from '../src/store.mjs';

export const body='企业 AI 知识库项目的测试材料。工程团队对接业务系统，使用 RAG 检索增强，保留人工确认和评测步骤。系统已在生产环境运行，所有结果仍由业务人员核对。'.repeat(8);
export function analysis(){return {relevance:'relevant',category:'case',score:80,stage:'production',stageEvidence:'系统已在生产环境运行',title:'测试案例的研究笔记',summary:'这是一份仅用于测试的研究摘要。',problem:'知识分散。',solution:'建立检索与人工确认流程。',outcome:'原文未披露量化结果。',lessons:['先建立评测集。'],limitations:['没有成本数据。'],evidence:[{quote:'系统已在生产环境运行',claim:'作者说明了运行阶段。'}],ideas:[{title:'如何设计知识库验收',angle:'从测试和人工确认开始。'}]};}
export function fixture(t,overrides={}) {
  const dir=mkdtempSync(join(tmpdir(),'fde-workbench-test-'));
  const config={...loadConfig({}),dataDir:dir,accessToken:'fixture-token-is-long-enough-for-private-tests',provider:'api',analysisEnabled:true,model:'test-model',...overrides};
  const store=new Store(dir,[{id:'test-source',name:'测试信源',kind:'rss',url:'https://example.com/feed',allowedHosts:['example.com'],enabled:true,disposition:'auto',intervalHours:12}]);
  t.after(()=>{store.close();rmSync(dir,{recursive:true,force:true});});
  return {store,config,dir};
}
export function add(store,index=1,extra={}) {return store.upsertArticle({url:`https://example.com/article-${index}`,title:`企业 AI 部署测试 ${index}`,body,...extra}).article;}
export const output=()=>({result:analysis(),usage:{inputTokens:1000,cachedInputTokens:0,outputTokens:200,reasoningTokens:50},costUsd:0.004,requestId:'fixture-request',provider:'api',model:'test-model'});
