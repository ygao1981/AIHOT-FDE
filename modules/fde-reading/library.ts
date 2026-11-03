// Curated reading index. Only metadata and links, never third-party full-text reproduction.
// These are reading starting points, not verified production deployments unless explicitly stated.
export type PracticeKind = "落地案例" | "工程方案" | "实操教程" | "交付方法" | "成本效果" | "项目复盘";
export type PracticeRegion = "国内" | "海外";
export interface PracticeLink {
  id: string;
  title: string;
  source: string;
  kind: PracticeKind;
  region: PracticeRegion;
  focus: string;
  url: string;
  note: string;
  evidence: string;
}
export const PRACTICE_LINKS: readonly PracticeLink[] = [
  {
    "id": "cn-01",
    "title": "FDE 落地指南：从演示走向生产",
    "source": "腾讯云社区 · 技术方舟",
    "kind": "交付方法",
    "region": "国内",
    "focus": "从试点到生产",
    "url": "https://developer.cloud.tencent.com/article/2766642",
    "note": "围绕生产化的数据、评估、安全、人机兜底、场景选择与成本约束整理实施注意事项。",
    "evidence": "方法论，非客户案例"
  },
  {
    "id": "cn-02",
    "title": "FDE 需求挖掘：先判断是不是一个真需求",
    "source": "腾讯云社区 · 技术方舟",
    "kind": "交付方法",
    "region": "国内",
    "focus": "需求与边界",
    "url": "https://developer.cloud.tencent.com/article/2733246",
    "note": "用户访谈、流程损失、责任人和 No-Go 清单，用于售前选场景。",
    "evidence": "社区作者原创"
  },
  {
    "id": "cn-03",
    "title": "企业 AI 落地的业务语言与五步交付",
    "source": "腾讯云社区 · 技术方舟",
    "kind": "成本效果",
    "region": "国内",
    "focus": "ROI 与优先级",
    "url": "https://developer.cloud.tencent.com/article/2772461",
    "note": "强调用业务语言定义问题，按场景识别、智能体建设、业务运行、价值验证和持续改进组织交付。",
    "evidence": "行业方法观点，非客户验收数据"
  },
  {
    "id": "cn-04",
    "title": "60 天跑通第一个 AI 生产闭环",
    "source": "腾讯云社区 · 技术方舟",
    "kind": "交付方法",
    "region": "国内",
    "focus": "阶段门与验收",
    "url": "https://cloud.tencent.com/developer/article/2736945",
    "note": "五阶段交付、Gate 评审、上线验值及运营交接。",
    "evidence": "社区作者原创"
  },
  {
    "id": "cn-05",
    "title": "FDE 标准 SOP 与交付物清单",
    "source": "腾讯云社区",
    "kind": "实操教程",
    "region": "国内",
    "focus": "交付资产",
    "url": "https://developer.cloud.tencent.com/article/2745802",
    "note": "包含交付物清单、客户现场节奏和异常处理机制。",
    "evidence": "社区文章，参考模板"
  },
  {
    "id": "en-01",
    "title": "Microsoft ISE：用 Agent 自动配置实验流程",
    "source": "Microsoft ISE",
    "kind": "落地案例",
    "region": "海外",
    "focus": "业务流程自动化",
    "url": "https://devblogs.microsoft.com/ise/using-agents-to-setup-experiments/",
    "note": "从项目交付遇到的重复人工配置问题出发，介绍 Agent 实施方案。",
    "evidence": "官方工程团队经验"
  },
  {
    "id": "en-02",
    "title": "Microsoft ISE：生产智能体的接入与评估流程",
    "source": "Microsoft ISE",
    "kind": "实操教程",
    "region": "海外",
    "focus": "验收与评估",
    "url": "https://devblogs.microsoft.com/ise/agent-onboarding-process-for-agentic-systems/",
    "note": "用金标准测试集、召回率和调用准确率评估多 Agent 接入。",
    "evidence": "官方工程团队经验"
  },
  {
    "id": "en-03",
    "title": "Anthropic：多智能体研究系统从原型到生产",
    "source": "Anthropic Engineering",
    "kind": "项目复盘",
    "region": "海外",
    "focus": "多 Agent 系统",
    "url": "https://www.anthropic.com/engineering/multi-agent-research-system",
    "note": "分享多 Agent 编排、工具设计、评估与可靠性上的实际权衡。",
    "evidence": "厂商自述工程复盘"
  },
  {
    "id": "en-04",
    "title": "Anthropic：构建有效智能体的工程模式",
    "source": "Anthropic Research",
    "kind": "工程方案",
    "region": "海外",
    "focus": "架构与工具设计",
    "url": "https://www.anthropic.com/research/building-effective-agents",
    "note": "解释简单工作流和自治 Agent 的选择条件及常见模式。",
    "evidence": "工程方法，非具体客户成果"
  },
  {
    "id": "en-05",
    "title": "Palantir：AI FDE 的功能与变更审核机制",
    "source": "Palantir 文档",
    "kind": "工程方案",
    "region": "海外",
    "focus": "FDE / Ontology",
    "url": "https://www.palantir.com/docs/foundry/ai-fde/overview",
    "note": "涵盖 Foundry 操作、权限、代码变更、评测和人工审查。",
    "evidence": "产品技术文档，不等于客户案例"
  },
  {
    "id": "en-06",
    "title": "Palantir：大规模 SQL 迁移案例",
    "source": "Palantir",
    "kind": "落地案例",
    "region": "海外",
    "focus": "数据迁移",
    "url": "https://www.palantir.com/migration",
    "note": "介绍将旧 SQL 迁移到 PySpark 时的任务编排和结果披露。",
    "evidence": "厂商案例与自述结果，非独立审计"
  },
  {
    "id": "en-07",
    "title": "LangChain：智能体、RAG、SQL Agent 教程目录",
    "source": "LangChain Docs",
    "kind": "实操教程",
    "region": "海外",
    "focus": "RAG 与智能体",
    "url": "https://docs.langchain.com/oss/python/learn",
    "note": "提供从 RAG 到 SQL Agent、多智能体转交和评测的教程入口。",
    "evidence": "官方文档，需按版本复现"
  }
] as PracticeLink[];
