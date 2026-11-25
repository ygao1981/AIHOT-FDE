import { resolve, dirname, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const MAX_AUTO_DAILY_LIMIT = 50;
export class AppError extends Error {
  constructor(code, message, status = 400) { super(message); this.code = code; this.status = status; }
}
export function readSourceProxyUrl(value = '', key = 'FDE_SOURCE_PROXY_URL') {
  const input = value.trim();
  if (!input) return '';
  const endpoint = /^http:\/\/(127\.0\.0\.1|\[::1\]):([1-9]\d{0,4})\/?$/.exec(input);
  if (!endpoint || Number(endpoint[2]) > 65535)
    throw new AppError('invalid_config', `${key} 需要填写本机回环 HTTP 代理及实际端口。`);
  return 'http://' + endpoint[1] + ':' + endpoint[2];
}
export function readSourceProxyConfig(env) {
  const sourceProxyUrl=readSourceProxyUrl(env.FDE_SOURCE_PROXY_URL);
  const sourceProxyFallbackUrls=(env.FDE_SOURCE_PROXY_FALLBACK_URLS||'').split(',')
    .map(url=>readSourceProxyUrl(url,'FDE_SOURCE_PROXY_FALLBACK_URLS')).filter(Boolean);
  return {sourceProxyUrl,sourceProxyFallbackUrls:[...new Set(sourceProxyFallbackUrls)].filter(url=>url!==sourceProxyUrl)};
}
function number(env, key, fallback, min, max, integer = true) {
  const raw = env[key];
  const n = raw === undefined || raw === '' ? fallback : Number(raw);
  if (!Number.isFinite(n) || n < min || n > max || (integer && !Number.isInteger(n)))
    throw new AppError('invalid_config', `${key} 的值无效，请检查 .env。`);
  return n;
}
export function loadConfig(env = process.env) {
  const provider = env.FDE_MODEL_PROVIDER || 'off';
  if (!['off', 'api', 'codex'].includes(provider)) throw new AppError('invalid_config', '模型接入方式只能是 off、api 或 codex。');
  const port = number(env, 'FDE_PORT', 3210, 1, 65535);
  const baseUrl = new URL(env.FDE_BASE_URL || `http://127.0.0.1:${port}`);
  if (!['http:', 'https:'].includes(baseUrl.protocol) || baseUrl.username || baseUrl.password || baseUrl.pathname !== '/' || baseUrl.search || baseUrl.hash)
    throw new AppError('invalid_config', '访问地址需要是完整的 HTTP 或 HTTPS 根地址。');
  const config = {
    host: env.FDE_HOST || '127.0.0.1', port, baseUrl: baseUrl.origin,
    dataDir: resolve(ROOT, env.FDE_DATA_DIR || '.data'), accessToken: env.FDE_ACCESS_TOKEN || '',
    ...readSourceProxyConfig(env),
    githubDiscussionsToken: env.FDE_GITHUB_DISCUSSIONS_TOKEN || '',
    collectEnabled: env.FDE_COLLECT_ENABLED === 'true', analysisEnabled: env.FDE_ANALYSIS_ENABLED === 'true',
    autoAnalyze: env.FDE_AUTO_ANALYZE === 'true', provider,
    dailyLimit: number(env, 'FDE_DAILY_LIMIT', 5, 1, MAX_AUTO_DAILY_LIMIT),
    monthlyBudgetUsd: number(env, 'FDE_MONTHLY_BUDGET_USD', 10, 0.01, 10000, false),
    maxInputChars: number(env, 'FDE_MAX_INPUT_CHARS', 16000, 2000, 32000),
    maxOutputTokens: number(env, 'FDE_MAX_OUTPUT_TOKENS', 2500, 512, 8000),
    editorialMaxOutputTokens: number(env, 'FDE_EDITORIAL_MAX_OUTPUT_TOKENS', 4500, 1000, 8000),
    timeoutMs: number(env, 'FDE_MODEL_TIMEOUT_MS', 180000, 1000, 300000),
    reasoning: env.FDE_REASONING || 'low',
    model: provider === 'codex' ? env.FDE_CODEX_MODEL || '' : env.FDE_API_MODEL || 'gpt-6.2-sol',
    apiKey: env.OPENAI_API_KEY || '',
    inputPrice: number(env, 'FDE_API_INPUT_PRICE', 2, 0, 1000, false),
    outputPrice: number(env, 'FDE_API_OUTPUT_PRICE', 10, 0, 1000, false),
    codexBin: env.FDE_CODEX_BIN || '', codexHome: env.FDE_CODEX_HOME || '',
    rawRetentionDays: number(env, 'FDE_RAW_RETENTION_DAYS', 60, 7, 3650),
    maxArticles: number(env, 'FDE_MAX_ARTICLES', 10000, 10, 100000),
  };
  if (!['low', 'medium', 'high'].includes(config.reasoning)) throw new AppError('invalid_config', '推理强度只能是 low、medium 或 high。');
  if (config.analysisEnabled && provider === 'off') throw new AppError('invalid_config', '请先明确选择模型接入方式，再开启分析。');
  if (config.analysisEnabled && provider === 'api' && !config.apiKey) throw new AppError('missing_api_key', 'API 模式缺少密钥，请在服务器 .env 中设置。');
  if (config.analysisEnabled && provider === 'api' && (!config.inputPrice || !config.outputPrice)) throw new AppError('invalid_config', 'API 预算需要填写大于零的输入和输出单价。');
  if (config.analysisEnabled && provider === 'codex' && (!isAbsolute(config.codexBin) || !isAbsolute(config.codexHome)))
    throw new AppError('invalid_config', 'Codex 模式需要填写 CLI 和专用登录目录的绝对路径。');
  return config;
}
export function readSources(path = resolve(ROOT, 'config/sources.json')) {
  const list = JSON.parse(readFileSync(path, 'utf8'));
  if (!Array.isArray(list)) throw new AppError('invalid_sources', '信源目录需要是数组。');
  const ids = new Set();
  for (const s of list) {
    if (!/^[a-z0-9][a-z0-9-]{1,70}$/.test(s.id) || ids.has(s.id) || !s.name || !['rss', 'html_list', 'manual'].includes(s.kind))
      throw new AppError('invalid_sources', '信源标识、名称或类型无效。');
    ids.add(s.id);
    const url = new URL(s.url || s.homepage);
    if (url.protocol !== 'https:' || url.username || url.password) throw new AppError('invalid_sources', '信源需要无凭据的 HTTPS 地址。');
    if (s.kind === 'html_list' && !s.linkSelector) throw new AppError('invalid_sources', `信源 ${s.name} 缺少文章链接规则。`);
    if (s.linkPattern) new RegExp(s.linkPattern);
    if (s.enabled && s.kind === 'manual') throw new AppError('invalid_sources', '人工入口不能启用自动采集。');
  }
  return list;
}
