// FDE 实战观察：可复用工程实践优先，区分厂商宣传与可核实的实际交付。
// category key 会进入 URL，站点上线后不要更改。
export const CATEGORIES = [
  { key: "case", tagColor: "turquoise", label: "落地案例", feedLabel: "FDE 落地案例", section: "真实项目", guide: "有明确客户或业务场景、解决的问题、实施步骤或上线结果；注明已投产、试点还是演示。" },
  { key: "architecture", tagColor: "indigo", label: "工程方案", feedLabel: "FDE 工程方案", section: "工程方案", guide: "系统架构、选型依据、数据集成、RAG、Agent、MCP、权限和部署的可执行工程设计，不能仅是产品发布。" },
  { key: "tutorial", tagColor: "green", label: "实操教程", feedLabel: "FDE 实操教程", section: "实操方法", guide: "包含步骤、示例、代码、配置、测试方法、环境或明确复现条件的实践教程。", commentary: true },
  { key: "delivery", tagColor: "orange", label: "交付方法", feedLabel: "FDE 交付方法", section: "交付组织", guide: "需求澄清、PoC、验收、组织协作、运维交接、工作量估算与 FDE 驻场流程。" },
  { key: "roi", tagColor: "violet", label: "成本效果", feedLabel: "AI 成本与效果", section: "效果与成本", guide: "真实成本、推理费用、业务指标、对照实验、收益、失败成本与证据出处；只宣传结果却无指标的不得归此类。" },
  { key: "retrospective", tagColor: "purple", label: "项目复盘", feedLabel: "FDE 项目复盘", section: "经验复盘", guide: "真实实施中的故障、失败、技术债、限制、踩坑与纠正办法；需说明发生了什么和学到了什么。", commentary: true },
] as const satisfies ReadonlyArray<{ key: string; tagColor: string; label: string; feedLabel?: string; section: string; guide: string; commentary?: true }>;

// FDE 不存在可按“新模型发布”计数的类型。
export const RELEASE: { category: string; tag: string; unit: string } | null = null;

export const PLAIN_TERMS: readonly string[] = ["fde", "ai", "api", "llm", "agent", "rag", "mcp", "poc", "roi", "sla", "mes", "wcs", "wms"];

// 继续使用引擎既有的七种内部内容类型；读者看到的六个类别由 CATEGORIES 决定。
export const ITEM_TYPES = ["model_release", "product_launch", "tool_or_prompt", "research_paper", "industry_event", "opinion_analysis", "tutorial_explainer"] as const;

export const CATEGORY_TAGS = [
  "落地案例", "工程方案", "实操教程", "交付方法", "成本效果", "项目复盘", "其他",
] as const;

export const TOPIC_TAGS = [
  "Agent", "RAG", "MCP/工具调用", "部署/工程", "企业知识库", "AI客服/售后", "AI获客", "工业制造",
  "软件工程", "招投标", "流程自动化", "系统集成", "数据治理", "安全合规", "评测验证",
  "成本优化", "私有化部署", "编码",
] as const;

export const ENTITY_TAGS = [
  "Palantir", "Microsoft", "Anthropic", "LangChain", "Dify", "AWS", "Google",
  "OpenAI", "DeepSeek", "腾讯云", "阿里云", "GitHub", "Hugging Face",
] as const;

export const TAG_SYNONYMS: Readonly<Record<string, string>> = {
  "客户案例": "落地案例", "用户案例": "落地案例", "customer story": "落地案例", "case study": "落地案例",
  "实施案例": "落地案例", "部署方案": "工程方案", "架构设计": "工程方案", "系统方案": "工程方案",
  "教程/实践": "实操教程", "how-to": "实操教程", "上手教程": "实操教程",
  "交付经验": "交付方法", "实施方法": "交付方法", "效益": "成本效果", "ROI": "成本效果",
  "复盘": "项目复盘", "踩坑": "项目复盘", "成本/效果": "成本效果",
  "MCP": "MCP/工具调用", "知识库": "企业知识库", "售后": "AI客服/售后",
  "客服": "AI客服/售后", "获客": "AI获客", "自动化": "流程自动化",
  "DevOps": "部署/工程", "部署": "部署/工程", "评测": "评测验证",
  "评估": "评测验证", "安全": "安全合规", "数据": "数据治理",
};

export const ENTITIES: Record<string, { name: string; displayTag: string | null; aliases: string[]; orgNames?: string[]; otherNames?: string[] }> = {
  palantir: { name: "Palantir", displayTag: "Palantir", aliases: ["Palantir", "AIP", "Foundry"] },
  microsoft: { name: "Microsoft", displayTag: "Microsoft", aliases: ["Microsoft", "微软", "ISE", "Azure", "Copilot"] },
  anthropic: { name: "Anthropic", displayTag: "Anthropic", aliases: ["Anthropic", "Claude"] },
  langchain: { name: "LangChain", displayTag: "LangChain", aliases: ["LangChain", "LangGraph", "LangSmith"] },
  dify: { name: "Dify", displayTag: "Dify", aliases: ["Dify", "LangGenius"] },
  aws: { name: "AWS", displayTag: "AWS", aliases: ["AWS", "Amazon Web Services", "Bedrock"] },
  google: { name: "Google", displayTag: "Google", aliases: ["Google", "Gemini", "DeepMind"] },
  openai: { name: "OpenAI", displayTag: "OpenAI", aliases: ["OpenAI", "ChatGPT", "Codex", "GPT"] },
  deepseek: { name: "DeepSeek", displayTag: "DeepSeek", aliases: ["DeepSeek", "深度求索"] },
  tencent: { name: "腾讯云", displayTag: "腾讯云", aliases: ["腾讯", "腾讯云", "Tencent Cloud", "WeKnora", "WorkBuddy"] },
  alibaba: { name: "阿里云", displayTag: "阿里云", aliases: ["阿里云", "Alibaba Cloud", "百炼", "通义"] },
  github: { name: "GitHub", displayTag: "GitHub", aliases: ["GitHub"] },
  "hugging-face": { name: "Hugging Face", displayTag: "Hugging Face", aliases: ["Hugging Face"] },
};

// 标题摘要里的公司名称需要在原文里有依据；避免把部署方错认成客户方。
export const IDENTITY_LEXICON: ReadonlyArray<{ id: string; name: string; patterns: RegExp[] }> = [
  { id: "palantir", name: "Palantir", patterns: [/palantir|\baip\b|foundry/i] },
  { id: "microsoft", name: "Microsoft", patterns: [/microsoft|微软|azure|copilot/i] },
  { id: "anthropic", name: "Anthropic", patterns: [/anthropic|\bclaude\b/i] },
  { id: "langchain", name: "LangChain", patterns: [/langchain|langgraph|langsmith/i] },
  { id: "dify", name: "Dify", patterns: [/\bdify\b/i] },
  { id: "aws", name: "AWS", patterns: [/\baws\b|amazon web services|bedrock/i] },
  { id: "openai", name: "OpenAI", patterns: [/openai|chatgpt|\bcodex\b/i] },
  { id: "google", name: "Google", patterns: [/google|gemini|deepmind/i] },
  { id: "deepseek", name: "DeepSeek", patterns: [/deepseek|深度求索/i] },
  { id: "tencent", name: "腾讯云", patterns: [/腾讯云|tencent cloud|weknora|workbuddy/i] },
  { id: "alibaba", name: "阿里云", patterns: [/alibaba|阿里巴巴|阿里云|百炼/i] },
];

export const PUBLISHER_DOMAINS: ReadonlyArray<{ entityId: string; domains: readonly string[] }> = [
  { entityId: "palantir", domains: ["palantir.com"] },
  { entityId: "microsoft", domains: ["microsoft.com", "devblogs.microsoft.com"] },
  { entityId: "anthropic", domains: ["anthropic.com"] },
  { entityId: "langchain", domains: ["langchain.com"] },
  { entityId: "dify", domains: ["dify.ai"] },
  { entityId: "aws", domains: ["aws.amazon.com"] },
  { entityId: "openai", domains: ["openai.com"] },
  { entityId: "google", domains: ["google.com"] },
  { entityId: "tencent", domains: ["tencent.com", "cloud.tencent.com"] },
  { entityId: "alibaba", domains: ["aliyun.com"] },
];

export const IDENTITY_CONTEXT_ALIASES: ReadonlyArray<{ entityId: string; pattern: RegExp }> = [];
