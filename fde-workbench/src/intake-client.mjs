// Small HTTP boundary for external scripts. The running research app owns SQLite and model policy.
export const MAX_INTAKE_BYTES = 1024 * 1024;
const REQUEST_TIMEOUT_MS = 30000;
const ARTICLE_ID = /^[a-z0-9][a-z0-9-]{0,99}$/;
const STATUSES = new Set(['candidate', 'needs_body', 'skipped', 'queued', 'analyzing', 'analyzed', 'failed']);
const SERVER_ERRORS = {
  login_required: '研究台拒绝了口令，请核对 FDE_ACCESS_TOKEN。',
  analysis_disabled: '资料已收录，但研究台尚未开启分析。',
  not_found: '研究台没有找到这篇资料。',
  needs_body: '正文不足，请补充正文后在研究台中选择分析。',
  not_candidate: '这篇资料没有通过本地分析规则。',
  busy: '这篇资料正在分析，请查询状态。',
  import_busy: '研究台正在收录其他资料，请稍后人工确认。',
  retry_confirmation: '已有失败或结果未知的尝试，请在研究台核对用量后确认重试。',
  invalid_url: '资料地址无效，请使用不含账号密码的公开网页地址。',
  blocked_url: '研究台拒绝了资料地址，请使用公开网页地址。',
  request_too_large: '提交内容过大，请缩短正文。',
};

export class IntakeError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = 'IntakeError';
    this.code = code;
    Object.assign(this, details);
  }
}

function clientConfig(config) {
  let url;
  try { url = new URL(config.baseUrl); } catch { throw new IntakeError('invalid_config', '请配置完整的 FDE_BASE_URL 根地址。'); }
  const loopback = ['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname);
  if ((url.protocol !== 'https:' && !(url.protocol === 'http:' && loopback)) ||
      url.username || url.password || url.pathname !== '/' || url.search || url.hash)
    throw new IntakeError('unsafe_endpoint', '研究台地址只允许 HTTPS 或本机回环 HTTP 根地址，不能包含凭据。');
  if (typeof config.accessToken !== 'string' || config.accessToken.length < 32 || config.accessToken.length > 4096 || /[^\x21-\x7e]/.test(config.accessToken))
    throw new IntakeError('invalid_token', '请在环境变量或 .env 中配置至少 32 字符的 FDE_ACCESS_TOKEN，不要通过命令参数传入口令。');
  return { baseUrl: url.origin, accessToken: config.accessToken };
}

export function loadIntakeConfig(env = process.env) {
  // A client needs only an endpoint and its credential, not the server's model settings.
  const port = env.FDE_PORT || '3210';
  if (!env.FDE_BASE_URL && (!/^\d+$/.test(port) || Number(port) < 1 || Number(port) > 65535))
    throw new IntakeError('invalid_config', 'FDE_PORT 需要是有效端口。');
  return clientConfig({ baseUrl: env.FDE_BASE_URL || `http://127.0.0.1:${port}`, accessToken: env.FDE_ACCESS_TOKEN });
}

function materialBody(material) {
  if (!material || typeof material !== 'object' || Array.isArray(material) ||
      Object.keys(material).some(key => !['url', 'title', 'body'].includes(key)) ||
      typeof material.url !== 'string' || !material.url.trim() ||
      (material.title !== undefined && typeof material.title !== 'string') ||
      (material.body !== undefined && typeof material.body !== 'string'))
    throw new IntakeError('invalid_material', '资料 JSON 需要 url 字符串，可选 title 和 body 字符串。');
  let url;
  try { url = new URL(material.url); } catch { throw new IntakeError('invalid_material', '资料 url 需要是完整的公开网页地址。'); }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password)
    throw new IntakeError('invalid_material', '资料 url 只允许不含账号密码的 HTTP 或 HTTPS 网页地址。');
  const body = JSON.stringify({ url: material.url, title: material.title, body: material.body });
  if (Buffer.byteLength(body) > MAX_INTAKE_BYTES)
    throw new IntakeError('input_too_large', '资料 JSON 不能超过 1 MiB，请缩短正文。');
  return body;
}

async function readResponse(response) {
  if (Number(response.headers.get('content-length')) > MAX_INTAKE_BYTES) {
    await response.body?.cancel();
    throw new IntakeError('response_too_large', '研究台响应超过限制，请到页面核对结果。');
  }
  const chunks = [];
  let size = 0;
  if (response.body) {
    for await (const chunk of response.body) {
      size += chunk.byteLength;
      if (size > MAX_INTAKE_BYTES) throw new IntakeError('response_too_large', '研究台响应超过限制，请到页面核对结果。');
      chunks.push(chunk);
    }
  }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); }
  catch { throw new IntakeError('invalid_response', '研究台返回了无法识别的响应，请到页面核对结果。'); }
}

async function request(config, path, { body, fetchImpl }) {
  try {
    const response = await fetchImpl(`${config.baseUrl}${path}`, {
      method: body === undefined ? 'GET' : 'POST',
      headers: { Authorization: `Bearer ${config.accessToken}`, Accept: 'application/json', ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
      body,
      redirect: 'error',
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (response.redirected || (response.status >= 300 && response.status < 400)) {
      await response.body?.cancel();
      throw new IntakeError('redirect_refused', '研究台发生地址跳转，客户端已停止。请直接配置最终 HTTPS 地址。');
    }
    const value = await readResponse(response);
    if (!response.ok) {
      const code = Object.hasOwn(SERVER_ERRORS, value?.error?.code) ? value.error.code : 'server_refused';
      throw new IntakeError(code, SERVER_ERRORS[code] || '研究台拒绝了请求，请到页面核对配置与任务状态。', { httpStatus: response.status });
    }
    return value;
  } catch (error) {
    if (error instanceof IntakeError) throw error;
    // Never log raw fetch errors, response bodies, URLs or credentials. Do not retry ambiguous writes.
    throw new IntakeError('request_unconfirmed', '请求结果未确认，请先到研究台核对；客户端不会自动重试。');
  }
}

function articleSummary(article) {
  if (!article || !ARTICLE_ID.test(article.id) || !STATUSES.has(article.status))
    throw new IntakeError('invalid_response', '研究台没有返回有效资料状态，请到页面核对结果。');
  return { articleId: article.id, status: article.status, analysisAvailable: article.analysis != null };
}

export async function submitMaterial(config, material, { analyze = false, fetchImpl = fetch } = {}) {
  let imported;
  try {
    config = clientConfig(config);
    if (typeof analyze !== 'boolean') throw new IntakeError('invalid_option', 'analyze 需要是布尔值。');
    const body = materialBody(material);
    imported = await request(config, '/api/import', { body, fetchImpl });
    const summary = articleSummary(imported?.article);
    if (typeof imported.created !== 'boolean') throw new IntakeError('invalid_response', '研究台没有返回有效收录结果，请到页面核对结果。');
    const result = { imported: true, articleId: summary.articleId, created: imported.created, importStatus: summary.status, stage: 'stored' };
    if (!analyze) return result;
    try {
      const queue = await request(config, `/api/articles/${summary.articleId}/queue`, { body: '{}', fetchImpl });
      if (typeof queue?.queued !== 'boolean' || typeof queue.cached !== 'boolean' || queue.queued === queue.cached)
        throw new IntakeError('invalid_response', '入队结果无法确认，请查询资料状态；客户端不会自动重试。');
      return { ...result, stage: queue.cached ? 'cached' : 'queued', queued: queue.queued, cached: queue.cached };
    } catch (error) {
      Object.assign(error, result, { stage: 'queue' });
      throw error;
    }
  } catch (error) {
    if (!(error instanceof IntakeError)) throw new IntakeError('client_error', '收录客户端未能完成，请检查输入和研究台状态。', { stage: 'import', imported: null });
    if (!error.stage) {
      error.stage = 'import';
      error.imported = ['invalid_config', 'unsafe_endpoint', 'invalid_token', 'invalid_option', 'invalid_material', 'input_too_large'].includes(error.code) ? false : null;
    }
    throw error;
  }
}

export async function getMaterialStatus(config, articleId, { fetchImpl = fetch } = {}) {
  try {
    config = clientConfig(config);
    if (typeof articleId !== 'string' || !ARTICLE_ID.test(articleId)) throw new IntakeError('invalid_id', '请提供有效的资料编号。');
    const article = await request(config, `/api/articles/${articleId}`, { fetchImpl });
    const result = articleSummary(article);
    if (result.articleId !== articleId) throw new IntakeError('invalid_response', '研究台返回的资料编号不匹配。');
    return result;
  } catch (error) {
    if (error instanceof IntakeError) { error.stage = 'status'; throw error; }
    throw new IntakeError('client_error', '状态查询未能完成，请检查研究台状态。', { stage: 'status' });
  }
}
