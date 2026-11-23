import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { AppError } from './config.mjs';
import { validateAnalysis, runStructured, estimateStructuredReservation } from './analysis.mjs';

const freeze = value => { for (const item of Object.values(value)) if (item && typeof item === 'object') freeze(item); return Object.freeze(value); };
export const EDITORIAL_PROFILE = freeze(JSON.parse(readFileSync(new URL('../config/editorial-profile.json', import.meta.url), 'utf8')));
const INSTRUCTION = readFileSync(new URL('../prompts/editorial.md', import.meta.url), 'utf8');
const object = properties => ({ type: 'object', properties, required: Object.keys(properties), additionalProperties: false });
const string = maxLength => ({ type: 'string', minLength: 1, maxLength });
const array = (items, minItems, maxItems) => ({ type: 'array', items, minItems, maxItems });
const refs = min => array({ type: 'integer', minimum: 1, maximum: 3 }, min, 3);
const paragraph = object({ text: string(800), kind: { type: 'string', enum: ['source', 'interpretation', 'suggestion'] }, sources: refs(0) });
export const EDITORIAL_SCHEMA = freeze(object({
  title: string(80), lead: paragraph,
  sections: array(object({ heading: string(80), paragraphs: array(paragraph, 1, 5) }), 1, 8),
  takeaways: array(object({ text: string(180), sources: refs(1) }), 1, 3),
  caveats: array(string(300), 0, 6),
}));
const VERSION = 'fde-editorial-v1';
const PROMPT_HASH = createHash('sha256').update(INSTRUCTION + JSON.stringify(EDITORIAL_PROFILE) + JSON.stringify(EDITORIAL_SCHEMA)).digest('hex');
const invalid = message => { throw new AppError('invalid_editorial', message || '草稿格式不完整，请检查正文、段落类型和来源。'); };
const normalized = value => String(value ?? '').normalize('NFC').replace(/\s+/gu, ' ').trim();
const length = value => Array.from(value).length;
const short = (value, max) => Array.from(normalized(value)).slice(0, max).join('');

function specOf(raw = {}) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) invalid('请选择写作角度与篇幅。');
  const angle = raw.angle === undefined ? '' : raw.angle;
  if (typeof angle !== 'string' || length(angle) > 800 || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(angle)) invalid('写作角度最多 800 个字符，请使用普通文字。');
  const format = raw.format ?? 'article', mode = raw.mode ?? 'model';
  if (!['article', 'brief'].includes(format) || !['model', 'template'].includes(mode)) invalid('请选择有效的篇幅与生成方式。');
  return { angle: angle.trim(), format, mode, profileVersion: EDITORIAL_PROFILE.version, promptHash: PROMPT_HASH };
}
function modelConfig(config = {}) {
  return { ...config, maxOutputTokens: config.editorialMaxOutputTokens ?? 4500 };
}
export function editorialFingerprint(sources, spec, config = {}) {
  const c = modelConfig(config);
  return createHash('sha256').update(JSON.stringify({ version: VERSION, prompt: PROMPT_HASH, sources, spec,
    model: spec.mode === 'template' ? null : { provider: c.provider ?? 'off', name: c.model || 'account-default',
      reasoning: c.reasoning ?? 'low', maxInputChars: c.maxInputChars ?? 16000,
      maxOutputTokens: c.maxOutputTokens, timeoutMs: c.timeoutMs ?? 180000 } })).digest('hex');
}
export function prepareEditorial(articles, rawSpec = {}, config = {}) {
  if (!Array.isArray(articles) || articles.length < 1 || articles.length > 3 ||
      new Set(articles.map(a => a?.id)).size !== articles.length) invalid('请选择 1–3 篇不同的已分析资料。');
  const spec = specOf(rawSpec);
  const sources = articles.map((article, index) => {
    if (!article || article.status !== 'analyzed' || article.editorialStatus === 'archived' ||
        !article.analysisKey || !article.bodyHash || article.analysis?.relevance !== 'relevant' || !article.analysis?.evidence?.length)
      throw new AppError('editorial_source_unready', '只可使用已完成分析、相关且有原文证据的资料；请先核对所选资料。', 409);
    let analysis;
    try { analysis = validateAnalysis(article.analysis, { body: article.body }); }
    catch { throw new AppError('editorial_source_unready', '资料的研究卡或引文已无法核对，请先重新检查原文和研究结果。', 409); }
    let url;
    try { url = new URL(article.url); } catch { invalid('资料的原文链接无效。'); }
    if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) invalid('资料的原文链接无效。');
    return { id: index + 1, articleId: article.id, url: url.href, title: article.title,
      sourceName: article.sourceName, publishedAt: article.publishedAt ?? null,
      bodyHash: article.bodyHash, analysisKey: article.analysisKey, analysis };
  });
  const input = { sources, spec };
  if (length(JSON.stringify(input)) > (config.maxInputChars ?? 16000))
    throw new AppError('editorial_input_limit', '所选研究资料超出当前输入上限。请减少资料数量或缩短写作角度；尚未调用模型。', 409);
  return { ...input, fingerprint: editorialFingerprint(sources, spec, config) };
}

function check(value, schema) {
  if (schema.enum && !schema.enum.includes(value)) invalid('请选择来源转述、编辑判断或行动建议作为段落类型。');
  if (schema.type === 'string') {
    if (typeof value !== 'string') invalid();
    const text = value.trim();
    if (length(text) < (schema.minLength ?? 0) || length(text) > (schema.maxLength ?? Infinity) ||
        /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(text)) invalid('草稿存在空白或过长的内容，请检查标题、段落和要点。');
    return text;
  }
  if (schema.type === 'integer') {
    if (!Number.isSafeInteger(value) || value < schema.minimum || value > schema.maximum) invalid('来源编号不正确，请使用所选资料的编号。');
    return value;
  }
  if (schema.type === 'array') {
    if (!Array.isArray(value) || value.length < schema.minItems || value.length > schema.maxItems) invalid('段落、来源或要点数量不符合要求。');
    return value.map(item => check(item, schema.items));
  }
  if (!value || typeof value !== 'object' || Array.isArray(value) ||
      Object.keys(value).sort().join('|') !== schema.required.slice().sort().join('|')) invalid();
  return Object.fromEntries(Object.entries(schema.properties).map(([key, type]) => [key, check(value[key], type)]));
}
export function validateEditorial(raw, input) {
  const result = check(raw, EDITORIAL_SCHEMA), sourceIds = new Set((input.sources || []).map(source => source.id));
  for (const part of [result.lead, ...result.sections.flatMap(s => s.paragraphs), ...result.takeaways]) {
    if (new Set(part.sources).size !== part.sources.length || part.sources.some(id => !sourceIds.has(id))) invalid('草稿引用了没有选中的来源或重复编号。');
    if (part.kind === 'source' && !part.sources.length) invalid('来源转述必须至少选择一个依据来源。');
  }
  return result;
}

export function templateEditorial(input) {
  const stages = { proposal: '方案', demo: '演示', pilot: '试点', production: '生产上线', not_disclosed: '原文未披露' };
  const { sources } = input;
  const sectionFor = source => {
    const a = source.analysis, paragraph = text => ({ text, kind: 'source', sources: [source.id] });
    const prefix = sources.length > 1 ? `资料 [${source.id}]：` : '';
    const boundaries = [`研究卡记录的实施阶段：${stages[a.stage]}。`,
      ...a.limitations.map(text => /[。！？.!?…]$/u.test(text) ? text : `${text}。`)];
    if (!a.limitations.length) boundaries.push('适用条件仍需结合原文核对。');
    return [
      { heading: `${prefix}问题与实施方法`, paragraphs: [paragraph(a.problem), paragraph(a.solution)] },
      { heading: `${prefix}效果与适用边界`, paragraphs: [paragraph(a.outcome), paragraph(boundaries.join('\n'))] },
    ];
  };
  const summaries = sources.map(s => normalized(s.analysis.summary));
  let lead = summaries.join('\n\n');
  if (length(lead) > 800) {
    const max = Math.floor((800 - 2 * (sources.length - 1)) / sources.length);
    lead = summaries.map(summary => length(summary) > max ? `${short(summary, max - 1)}…` : summary).join('\n\n');
  }
  return validateEditorial({
    title: short(sources.length === 1 ? sources[0].analysis.title : '企业 AI 落地：几份案例的研究素材', 80),
    lead: { text: lead, kind: 'source', sources: sources.map(s => s.id) },
    sections: sources.flatMap(sectionFor),
    takeaways: sources.map(s => ({ text: short(s.analysis.lessons[0] || s.analysis.summary, 180), sources: [s.id] })),
    caveats: ['这是程序整理的素材稿，尚未完成公众号文章写作。',
      '研究卡不等于独立事实核查；发布前核对原文、阶段与效果数字。',
      ...(input.spec.angle ? ['所选写作角度尚未展开，请人工补充或使用 AI 写作。'] : [])],
  }, input);
}
function task(input) {
  return { name: 'fde_editorial', schema: EDITORIAL_SCHEMA,
    instructions: `${INSTRUCTION}\n\n已审核的个人写作规则：\n${JSON.stringify(EDITORIAL_PROFILE)}`,
    input: { sources: input.sources, spec: input.spec }, label: '不可信研究资料与写作角度 JSON',
    validate: raw => validateEditorial(raw, input) };
}
export function estimateEditorialReservation(config, input) {
  return estimateStructuredReservation(modelConfig(config), task(input));
}
export async function runEditorial(config, input, deps = {}) {
  return runStructured(modelConfig(config), task(input), deps);
}
