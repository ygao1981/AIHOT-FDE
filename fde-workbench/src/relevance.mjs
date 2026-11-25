const AI=/\b(?:fde|ai|genai|llms?|rag|agents?|agentic|langgraph|dify|mcp|reranking)\b|人工智能|生成式|大模型|智能体|知识库|检索增强|向量检索/i;
const ENGINEERING=[
  /\b(?:deploy\w*|production|enterprise|customer|case stud\w*|tutorial|workflow|implement\w*|lessons?|pilot|poc)\b|落地|部署|投产|实战|教程|工程|交付|企业|客户|工作流|验收/i,
  /\b(?:integration|connector|retrieval|reranking|embeddings?|legacy systems?)\b|系统集成|检索|向量|接口|数据接入/i,
  /\b(?:permissions?|authori[sz]ation|rbac|access control|tenant isolation|sandbox)\b|权限|鉴权|隔离|审计/i,
  /\b(?:evals?|evaluation|benchmark|observability|tracing|monitoring)\b|评测|评估|监控|可观测|测试集/i,
  /\b(?:costs?|latency|throughput|caching|inference|token budget|scalability)\b|成本|延迟|吞吐|推理|缓存/i,
  /\b(?:postmortem|retries|retry|rollback|fallback|recovery|incident|reliability)\b|故障|复盘|回滚|降级|恢复/i,
  /\b(?:human.in.the.loop|approvals?|manual review|human review|escalation)\b|人工审批|人工复核|人工确认|人工转交/i,
  /\b(?:manufacturing|industrial|maintenance|factory|inspection|quality control|operations)\b|工业|制造|设备|质检|运维|现场/i,
];
const VACANCY=/\b(?:now hiring|we(?:'re| are) hiring|early talent hiring|job openings?|careers at|join our team)\b|^招聘[：:\s]|招聘公告|岗位招聘|校园招聘|招聘启事|求职内推/i;
const FUNDING=/\b(?:funding round|raises?\s+(?:USD\s*)?\$|raised\s+\$|seed funding)\b|融资快讯|获[^，。]{0,15}融资/i;
const PROMOTION=/\b(?:webinar registration|register now|enroll now|limited.time offer|waitlist|giveaway)\b|直播预告|课程优惠|培训报名|限时优惠|点击领取/i;
const DETAILS=/\b(?:code|implementation|latency|benchmark|configuration|dataset|example|schema|architecture|measurements?|trace)\b|代码|架构|示例|配置|指标|测试集|实现|延迟|运行日志|检索增强/i;

export function researchPriority({title='',body='',trustedProject=false}) {
  if(VACANCY.test(title)||FUNDING.test(title))return 0;
  const content=`${title}\n${body}`;
  const signals=ENGINEERING.filter(pattern=>pattern.test(content)).length;
  const concrete=body.length>=180&&DETAILS.test(body)&&ENGINEERING.filter(pattern=>pattern.test(body)).length>=2;
  if(PROMOTION.test(title)&&!concrete)return 0;
  if((AI.test(content)||trustedProject)&&signals)return concrete?3:2;
  return 1;
}
