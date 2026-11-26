const AI=/\b(?:fde|ai|genai|llms?|vllm|rag|agents?|agentic|langgraph|dify|mcp|reranking)\b|人工智能|生成式|大模型|智能体|知识库|检索增强|向量检索/i;
const ENGINEERING=[
  /\b(?:deploy\w*|production|enterprise|customer|case stud\w*|tutorial|workflow|implement\w*|lessons?|pilot|poc)\b|落地|部署|投产|实战|教程|工程|交付|企业|客户|工作流|验收/i,
  /\b(?:integration|connector|retrieval|local rag|knowledge base|reranking|embeddings?|legacy systems?)\b|系统集成|检索|向量|接口|数据接入/i,
  /\b(?:permissions?|authori[sz]ation|rbac|access control|tenant isolation|sandbox|mcp gateway|least privilege)\b|权限|鉴权|隔离|审计/i,
  /\b(?:evals?|evaluation|benchmarks?|observability|tracing|monitoring)\b|评测|评估|监控|可观测|测试集/i,
  /\b(?:costs?|latency|throughput|caching|inference|decoding|token budget|scalability)\b|成本|延迟|吞吐|推理|缓存/i,
  /\b(?:postmortem|retries|retry|rollback|fallback|recovery|incident|reliability)\b|故障|复盘|回滚|降级|恢复/i,
  /\b(?:human.in.the.loop|approvals?|manual review|human review|escalation)\b|人工审批|人工复核|人工确认|人工转交/i,
  /\b(?:manufacturing|industrial|maintenance|factory|inspection|quality control|operations)\b|工业|制造|设备|质检|运维|现场/i,
];
const VACANCY=/\b(?:now hiring|we(?:'re| are) hiring|who is hiring|early talent hiring|job openings?|careers at|join our team)\b|^招聘[：:\s]|招聘公告|岗位招聘|校园招聘|招聘启事|求职内推/i;
const FUNDING=/\b(?:funding round|raises?\s+(?:USD\s*)?\$|raised\s+\$|seed funding)\b|融资快讯|获[^，。]{0,15}融资/i;
const PROMOTION=/\b(?:webinar registration|register now|enroll now|limited.time offer|waitlist|giveaway|sign up for (?:our|the) (?:course|bootcamp)|save \d+% on)\b|训练营报名|直播预告|课程优惠|培训报名|限时优惠|点击领取/i;
const DETAILS=/\b(?:code|implementation|latency|benchmark|configuration|dataset|example|schema|architecture|measurements?|trace)\b|代码|架构|示例|配置|指标|测试集|实现|延迟|运行日志|检索增强/i;
const SITE_PRODUCTION=/\b(?:in production|production rollout|deployed (?:in|to) production|rolled out to|runs? in production|live traffic|postmortem)\b|生产上线|正式上线|已经上线|生产环境|投产|现场部署|故障复盘/i;
const UNPROVEN_PRODUCTION=/\b(?:not (?:yet )?(?:in|for) production|never deployed|(?:no|without) (?:evidence of |proof of )?(?:a )?production (?:deployment|rollout))\b|(?:没有|未见|尚无|暂无|缺少)[^。；，\n]{0,12}(?:生产上线|正式上线|生产运行|投产)/i;
const BUSINESS=/\b(?:support tickets?|customers?|operators?|production lines?|workflows?|internal team|business process|fulfillment|warehouse)\b|客服|企业流程|操作员|生产线|仓储|客户|业务场景|运维团队/i;
const STEPS=/\b(?:implemented|implementation|we (?:built|integrated|migrated|deployed|configured)|step.by.step|reproduction steps)\b|实现步骤|接入|配置|实施|实现|复现步骤|部署过程/i;
const ARCH=/\b(?:architecture|interfaces?|data pipeline|rbac|tenant isolation|schema|api gateway|legacy systems?|access control)\b|架构|接口|权限|隔离|数据链路|传统系统/i;
const EVAL=/\b(?:evals?|error analysis|benchmarks?|baseline|p(?:95|99)|before and after|test set|precision|recall)\b|测试集|评测|基线|样本|错误分析|验收结果/i;
const LIMIT=/\b(?:limitation|failure mode|failed|rollback|postmortem|trade.off|did not work|idempotenc\w*)\b|限制|失败|边界|故障恢复|幂等|回滚|降级/i;
const GUIDES=/\b(?:hands.on|tutorial|walkthrough|notebooks?|how to|practical guide|engineering guide)\b|实操|教程|教程开发|实例代码/i;

export function assessResearch({title='',body='',url='',trustedProject=false,signal=null}) {
  const content=`${title}\n${body}`;
  const signals=ENGINEERING.filter(pattern=>pattern.test(content)).length;
  const concrete=body.length>=180&&DETAILS.test(body)&&ENGINEERING.filter(pattern=>pattern.test(body)).length>=2;
  const steps=STEPS.test(body),architecture=ARCH.test(body),evaluation=EVAL.test(body);
  const production=SITE_PRODUCTION.test(content),business=BUSINESS.test(body);
  const promo=PROMOTION.test(title)||FUNDING.test(title)||VACANCY.test(title);
  const method=GUIDES.test(title)&&AI.test(content)&&signals>0;
  const primaryLink=/^https:\/\/github\.com\/[^/]+\/[^/]+(?:\/(?:blob|tree|commit|pull|releases)\/[^?#]+)?\/?(?:[?#].*)?$/.test(url);
  const reasons=[];
  if(steps)reasons.push('描述了实施或复现步骤');
  if(architecture)reasons.push('涉及架构、接口或数据权限');
  if(evaluation)reasons.push('提及评测、基线或验收指标');
  if(LIMIT.test(body))reasons.push('描述了失败、限制或恢复方法');
  if(production)reasons.push('提及生产上线或复盘，待核对范围');
  if(primaryLink)reasons.push('可查看关联的代码仓库或项目记录');
  if(signal==='maintainer_answer')reasons.push('讨论有项目成员答复');
  if(signal==='reproduction')reasons.push('问题描述含复现线索');
  if(!concrete)reasons.push('现有文字缺少可核对的实施细节');
  if(promo)reasons.unshift('标题含招聘、融资或报名推广信号');
  let priority=1;
  if((AI.test(content)||trustedProject)&&signals)priority=concrete?3:2;
  if(method)priority=Math.max(priority,2);
  if(promo&&(!concrete||(!steps&&!architecture&&!evaluation)||FUNDING.test(title)||VACANCY.test(title)&&!method))priority=0;
  const type=priority>=2&&production&&!UNPROVEN_PRODUCTION.test(content)&&business&&steps?'practice':
    priority>=2&&(method||concrete||primaryLink)?'method':'lead';
  return {priority,type,reasons,production,business};
}

export function researchPriority(article) { return assessResearch(article).priority; }
