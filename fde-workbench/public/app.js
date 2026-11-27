'use strict';

// Private, same-origin interface. Access credentials are never stored in browser storage.
const $ = id => document.getElementById(id);
const state = {
  authenticated: false, overview: null, view: 'library', items: [], total: 0,
  offset: 0, limit: 50, filters: { q: '', status: '', editorialStatus: '' },
  listRequest: 0, detailRequest: 0, currentArticle: null, noteDirty: false,
  drafts: new Map(), queueing: new Set(), refreshing: false, toastTimer: null, searchTimer: null,
  collection: null, sourceRequest: 0, startingCollection: false,
};
const STATUS = { candidate: '待分析', queued: '排队中', analyzing: '分析中', analyzed: '已分析', skipped: '已跳过', failed: '分析未完成', needs_body: '待补正文' };
const EDITORIAL = { new: '待整理', organized: '已整理', shortlisted: '已选题', drafting: '写作中', published: '已发布', archived: '已归档' };
const CATEGORY = { case: '落地案例', architecture: '工程方案', tutorial: '实操教程', delivery: '交付方法', roi: '成本效果', retrospective: '项目复盘' };
const STAGE = { proposal: '方案阶段', demo: '演示阶段', pilot: '试点阶段', production: '生产使用', not_disclosed: '阶段未披露' };
const ERROR_MESSAGES = {
  unauthorized: '登录已过期，请重新输入访问口令。', unauthenticated: '请先输入访问口令。',
  invalid_token: '访问口令不正确，请核对部署时设置的口令。', forbidden: '这次操作未获允许，请刷新页面后重试。',
  origin: '请求来源校验未通过，请从研究台的正式地址重新打开。', invalid_origin: '请求来源校验未通过，请从研究台的正式地址重新打开。',
  rate_limit: '操作过于频繁，请稍等片刻再试。', rate_limited: '操作过于频繁，请稍等片刻再试。',
  needs_body: '正文不足。请补充原文正文，再加入分析队列。', disabled: '分析尚未启用，请检查部署配置。',
  analysis_disabled: '分析尚未启用，请检查部署配置。',
  retry_confirmation: '之前的请求可能已消耗额度。请确认用量后，再决定是否重试。',
  not_found: '没有找到这条资料，请刷新后重试。', busy: '相关任务正在处理，请稍后再试。',
  storage_limit: '资料数量已达上限，请先导出并整理旧资料。',
  source_unverified: '这个来源暂不支持自动采集，请打开来源后手动收录。',
  not_candidate: '资料未通过本地相关性规则，未调用模型。你仍可阅读、补充正文和保存笔记。',
  invalid_notes: '笔记最多 10000 个字符，请缩短后保存。',
  too_large: '提交的内容过长，请保留与研究相关的正文后再试。',
  invalid_auto_limit: '请输入 1–50 之间的整数。',
  invalid_config: '运行配置不完整，请检查部署设置后再试。',
  timeout: '连接超时。操作可能仍在处理，请刷新状态后再决定是否重试。',
  network: '暂时无法连接研究台，请检查网络后重试。',
};

function node(tag, attrs = {}, ...children) {
  const result = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (value === undefined || value === null || value === false) continue;
    if (key === 'class') result.className = value;
    else if (key === 'text') result.textContent = value;
    else if (key.startsWith('on') && typeof value === 'function') result.addEventListener(key.slice(2).toLowerCase(), value);
    else if (key === 'checked' || key === 'disabled' || key === 'hidden') result[key] = Boolean(value);
    else result.setAttribute(key, String(value));
  }
  for (const child of children.flat(Infinity)) {
    if (child !== null && child !== undefined && child !== false) result.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
  return result;
}
function icon(name) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('class', 'icon'); svg.setAttribute('aria-hidden', 'true');
  const use = document.createElementNS('http://www.w3.org/2000/svg', 'use');
  use.setAttribute('href', `#i-${name}`); svg.append(use); return svg;
}
function action(label, handler, options = {}) {
  return node('button', { type: 'button', class: `button ${options.class || ''}`.trim(), disabled: options.disabled, onClick: handler, ...(options.title ? { title: options.title } : {}) }, options.icon ? icon(options.icon) : null, label);
}
function text(value, fallback = '') { return typeof value === 'string' && value.trim() ? value.trim() : fallback; }
function short(value, size = 220) { const s = text(value); return s.length > size ? `${s.slice(0, size)}…` : s; }
function items(value) { return Array.isArray(value) ? value : []; }
function number(value) { return Number.isFinite(Number(value)) && value !== null ? Number(value) : null; }
function count(value) { const n = number(value); return n === null ? '—' : n.toLocaleString('zh-CN'); }
function money(value) { const n = number(value); return n === null ? '未统计' : `$${n.toFixed(3)}`; }
function language(value) { return ({ zh: '中文', 'zh-CN': '中文', en: '英文', ja: '日文' })[value] || '语种未注明'; }
function date(value, withTime = false) {
  if (!value) return '原文未注明日期';
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value.replaceAll('-', '.');
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return '原文未注明日期';
  return new Intl.DateTimeFormat('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit', ...(withTime ? { hour: '2-digit', minute: '2-digit', hour12: false } : {}) }).format(parsed);
}
function safeURL(value) {
  try { const u = new URL(value); return ['https:', 'http:'].includes(u.protocol) && !u.username && !u.password ? u.href : null; }
  catch { return null; }
}
function externalLink(label, url, className = 'source-link') {
  const href = safeURL(url);
  return href ? node('a', { href, class: className, target: '_blank', rel: 'noopener noreferrer', referrerpolicy: 'no-referrer' }, label, icon('external')) : null;
}
function badge(label, style = '') { return node('span', { class: `badge ${style}`.trim(), text: label }); }
function statusBadge(status) {
  const style = status === 'analyzed' ? 'success' : status === 'failed' ? 'error' : ['needs_body', 'queued', 'analyzing'].includes(status) ? 'warning' : '';
  return badge(STATUS[status] || '待整理', style);
}
function message(error, fallback = '操作未完成，请稍后重试。') {
  if (ERROR_MESSAGES[error?.code]) return ERROR_MESSAGES[error.code];
  const supplied = error?.message;
  if (typeof supplied === 'string' && /[\u4e00-\u9fff]/.test(supplied) && supplied.length <= 240 && !/\b(?:stack|SQL|sqlite|ENOENT|ECONN|Error:)|\/(?:workspace|home|usr|var)\/|\b[A-Z][A-Z0-9_]{2,}_[A-Z0-9_]+\b/.test(supplied)) return supplied;
  if (error?.status === 403) return ERROR_MESSAGES.forbidden;
  if (error?.status === 429) return ERROR_MESSAGES.rate_limit;
  return fallback;
}
function toast(value) {
  clearTimeout(state.toastTimer);
  const surface = $('import-dialog').open ? $('import-dialog') : $('detail-dialog').open ? $('detail-dialog') : document.body;
  if ($('toast').parentNode !== surface) surface.append($('toast'));
  $('toast').textContent = value; $('toast').hidden = false;
  state.toastTimer = setTimeout(() => { $('toast').hidden = true; }, 5000);
}
function showWorkspaceError(error) { $('workspace-error-text').textContent = message(error); $('workspace-error').hidden = false; }
function clearWorkspaceError() { $('workspace-error').hidden = true; }
function showFormError(id, error, fallback) { $(id).textContent = message(error, fallback); $(id).hidden = false; }
function busyButton(button, busy, label) {
  if (!button) return;
  if (busy) { button.dataset.previousLabel = button.textContent; button.disabled = true; if (label) button.textContent = label; }
  else { button.disabled = false; if (label) button.textContent = label; else if (button.dataset.previousLabel) button.textContent = button.dataset.previousLabel; }
}
class ApiError extends Error {
  constructor(status, code, msg) { super(msg || ''); this.status = status; this.code = code || ''; }
}
async function api(path, options = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeout || 25000);
  try {
    const response = await fetch(path, {
      method: options.method || 'GET', credentials: 'same-origin', cache: 'no-store', signal: controller.signal,
      ...(options.body !== undefined ? { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(options.body) } : {}),
    });
    if (!response.ok) {
      let data; try { data = await response.json(); } catch { data = {}; }
      if (response.status === 401 && options.handleAuth !== false) expireSession();
      throw new ApiError(response.status, data?.error?.code, data?.error?.message);
    }
    if (options.blob) return response.blob();
    return response.status === 204 ? {} : await response.json();
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(0, error?.name === 'AbortError' ? 'timeout' : 'network');
  } finally { clearTimeout(timeout); }
}

function preserveNotes() {
  if (state.currentArticle && $('personal-notes')) {
    const draft = $('personal-notes').value;
    if (draft !== (state.currentArticle.personalNotes || '')) state.drafts.set(state.currentArticle.id, draft);
    else state.drafts.delete(state.currentArticle.id);
  }
}
function syncDialogState() {
  document.body.classList.toggle('modal-open', $('detail-dialog').open || $('import-dialog').open);
  const surface = $('import-dialog').open ? $('import-dialog') : $('detail-dialog').open ? $('detail-dialog') : document.body;
  if ($('toast').parentNode !== surface) surface.append($('toast'));
}
function showLogin(errorText = '') {
  $('startup').hidden = true; $('workspace').hidden = true; $('login-screen').hidden = false;
  $('login-error').hidden = !errorText; $('login-error').textContent = errorText;
  if (!$('detail-dialog').open && !$('import-dialog').open) $('login-token').focus();
}
function expireSession() {
  preserveNotes(); state.authenticated = false; state.overview = null; state.listRequest++; state.detailRequest++;
  state.collection = null; state.sourceRequest++; $('collection-fields').disabled = true; renderCollectionActivity();
  resetDiscovery();
  resetDaily();
  for (const id of ['detail-dialog', 'import-dialog']) if ($(id).open) $(id).close();
  syncDialogState(); showLogin('登录已过期，请重新输入访问口令。未保存的笔记暂留在当前页面，请不要关闭页面。');
}
async function startWorkspace(overview) {
  state.authenticated = true; state.overview = overview;
  $('startup').hidden = true; $('login-screen').hidden = true; $('workspace').hidden = false;
  $('login-token').value = ''; $('login-token').type = 'password'; $('show-token').textContent = '显示'; $('show-token').setAttribute('aria-pressed', 'false');
  renderOverview(); await switchView(location.hash.slice(1), false);
}
async function loadOverview({ quiet = false } = {}) {
  const overview = await api('/api/overview');
  if (!state.authenticated) return;
  state.overview = overview; renderOverview();
  if (state.view === 'usage') renderUsage();
  if (!quiet) clearWorkspaceError();
}
function renderOverview() {
  const { stats = {}, config = {}, paused } = state.overview || {};
  for (const key of ['total', 'candidate', 'analyzed', 'shortlisted']) $(`stat-${key}`).textContent = count(stats[key]);
  $('export-all').disabled = !(number(stats.analyzed) > 0);
  $('export-all').title = number(stats.analyzed) > 0 ? '导出已有分析且未归档的研究资料。' : '完成资料分析后可导出研究结果。';
  const analysisText = !config.analysisEnabled ? '模型分析已关闭。启用后可在待分析资料上点击「AI 分析」。' : config.autoAnalyze ? '自动分析已启用，最多按「用量」设置的次数处理新资料。也可点击「AI 分析」手动处理单篇。' : '手动分析已启用。点击「AI 分析」处理这篇资料，由你决定何时使用账号额度。';
  $('analysis-mode').textContent = analysisText;
  $('pause-banner').hidden = !paused;
  $('pause-reason').textContent = paused ? message({ message: paused }, '请检查用量和运行状态，再恢复分析。') : '';
  const collectionMode = config.collectEnabled ? '定时采集已开启。' : '定时采集已关闭，可以手动检查信源更新。';
  const modelMode = config.autoAnalyze && config.analysisEnabled ? '符合条件的新资料可能触发自动分析。' : '自动分析已关闭，采集不会调用模型。';
  $('collection-notice').firstElementChild.textContent = `${collectionMode}${modelMode}`;
}
async function switchView(view, updateHash = true) {
  const views = ['today', 'library', 'discovery', 'sources', 'usage'];
  const current = views.includes(view) ? view : 'today';
  state.view = current;
  if (updateHash && location.hash !== `#${current}`) history.replaceState(null, '', `#${current}`);
  for (const name of views) {
    $(`view-${name}`).hidden = name !== current;
    $(`tab-${name}`).setAttribute('aria-selected', String(name === current));
    $(`tab-${name}`).tabIndex = name === current ? 0 : -1;
  }
  if (!state.authenticated) return;
  try {
    if (current === 'library') await loadArticles();
    else if (current === 'discovery') await openDiscovery();
    else if (current === 'today') await loadDaily();
    else if (current === 'sources') await loadSources();
    else { renderUsage(); await loadOverview(); }
  } catch (error) { if (state.authenticated) showWorkspaceError(error); }
}
function loading(label) { return node('div', { class: 'loading-state', role: 'status' }, node('span', { class: 'spinner' }), label); }
function emptyState(title, description, button) {
  return node('div', { class: 'empty-state' }, icon('library'), node('h2', { text: title }), node('p', { text: description }), button);
}
function hasFilters() { return Object.values(state.filters).some(Boolean); }
async function loadArticles({ quiet = false } = {}) {
  const request = ++state.listRequest;
  const list = $('article-list'); list.setAttribute('aria-busy', 'true');
  if (!quiet) list.replaceChildren(loading('正在读取研究资料…'));
  const params = new URLSearchParams({ limit: String(state.limit), offset: String(state.offset) });
  for (const [key, value] of Object.entries(state.filters)) if (value) params.set(key, value);
  try {
    const result = await api(`/api/articles?${params}`);
    if (request !== state.listRequest || !state.authenticated) return;
    state.items = items(result.items); state.total = number(result.total) || 0;
    if (state.offset && state.offset >= state.total) { state.offset = Math.max(0, Math.ceil(state.total / state.limit) * state.limit - state.limit); return loadArticles({ quiet }); }
    renderArticles();
  } catch (error) {
    if (request !== state.listRequest || !state.authenticated) return;
    if (!quiet) {
      list.replaceChildren(emptyState('资料暂时没有加载出来', message(error), action('重新加载', () => loadArticles(), { class: 'small' })));
      $('result-count').textContent = '读取未完成'; $('pagination').hidden = true;
    }
  } finally { if (request === state.listRequest) list.setAttribute('aria-busy', 'false'); }
}
function renderArticles() {
  const list = $('article-list');
  $('result-count').textContent = hasFilters() ? `找到 ${count(state.total)} 篇资料` : `共 ${count(state.total)} 篇资料`;
  if (!state.items.length) {
    list.replaceChildren(hasFilters()
      ? emptyState('暂时没有符合条件的资料', '试试其他关键词，或清除筛选查看全部资料。', action('清除筛选', resetFilters))
      : emptyState('从一篇值得研究的资料开始', '导入案例、教程或项目复盘，留下原文链接。后续可以补充正文、核对证据，再整理自己的选题。', action('导入第一篇资料', () => openImport(), { class: 'primary', icon: 'plus' })));
  } else list.replaceChildren(...state.items.map(articleCard));
  $('pagination').hidden = state.total <= state.limit;
  $('page-label').textContent = `${state.offset + 1}–${Math.min(state.offset + state.limit, state.total)} / ${count(state.total)} 篇`;
  $('previous-page').disabled = state.offset === 0; $('next-page').disabled = state.offset + state.limit >= state.total;
}
function articleCard(article) {
  const a = article.analysis;
  const meta = node('div', { class: 'article-meta' },
    node('span', { text: text(article.sourceName, '手动收录') }),
    node('span', { text: language(article.language) }),
    node('span', { text: date(article.publishedAt) }),
    a ? badge(CATEGORY[a.category] || '研究资料', 'outline') : null);
  const main = node('div', {}, meta,
    node('button', { type: 'button', class: 'article-title', onClick: () => openDetail(article.id) }, text(a?.title, text(article.title, '未命名资料'))),
    node('p', { class: 'article-summary', text: short(a?.summary || article.bodyExcerpt) || '正文尚未完整收录。打开原文阅读，或补充正文后再分析。' }));
  if (a?.problem) main.append(node('p', { class: 'article-focus' }, node('b', { text: '业务问题' }), node('span', { text: short(a.problem, 150) })));
  const side = node('div', { class: 'article-side' }, statusBadge(article.status), badge(EDITORIAL[article.editorialStatus] || '待整理', article.editorialStatus === 'new' ? 'outline' : 'editorial'), article.personalNotes ? node('span', { class: 'note-indicator', text: '已有个人笔记' }) : null);
  const buttons = node('div', { class: 'article-actions' }, action(a ? '查看研究' : '查看资料', () => openDetail(article.id), { class: 'small', icon: 'arrow' }));
  if (!a) buttons.append(queueButton(article));
  if (state.filters.editorialStatus === 'new') {
    if (article.status === 'analyzed' && a?.relevance === 'relevant') {
      buttons.append(node('a', { href: `/editorial.html?article=${encodeURIComponent(article.id)}`, class: 'button small' }, '整理素材'));
    }
    buttons.append(action('标为已整理', event => updateEditorial(event.currentTarget, article, 'organized'), { class: 'small' }));
  }
  const originalLink = externalLink('阅读原文', article.url); if (originalLink) buttons.append(originalLink);
  return node('article', { class: 'article-card' }, main, side, buttons);
}
function isAutomaticQueue(article) {
  return article.status === 'queued' && ['auto', 'legacy'].includes(article.queueOrigin);
}
function queueButton(article) {
  if (article.status === 'needs_body') return action('补充正文', () => openImport(article), { class: 'small' });
  if (article.status === 'skipped') return action('已被规则过滤', () => {}, { class: 'small', disabled: true, title: '未调用模型。可补充相关正文，或继续阅读和记录笔记。' });
  const automatic = isAutomaticQueue(article);
  const pending = article.status === 'analyzing' || (article.status === 'queued' && !automatic) || state.queueing.has(article.id);
  const enabled = Boolean(state.overview?.config?.analysisEnabled);
  const label = pending ? (article.status === 'analyzing' ? '正在分析' : '已加入队列') : automatic ? '改为手动分析' : article.analysis ? '重新分析' : article.status === 'failed' ? '确认后重试' : 'AI 分析';
  const primary = enabled && !pending && (article.status === 'candidate' || automatic);
  return action(label, event => queueArticle(article, event.currentTarget), { class: primary ? 'primary small' : 'small', disabled: pending || !enabled, title: !enabled ? '模型分析已关闭。' : undefined });
}
async function queueArticle(article, button, forceRetry = false) {
  const retry = forceRetry || Boolean(article.analysis) || article.status === 'failed';
  if (retry && !window.confirm('重新分析可能再次消耗模型额度，已有结果会在新分析完成后更新。请先核对当前用量。确定要加入重试队列吗？')) return;
  if (state.queueing.has(article.id)) return;
  state.queueing.add(article.id); busyButton(button, true, '正在安排…');
  let confirmRetry = false;
  try {
    const result = await api(`/api/articles/${encodeURIComponent(article.id)}/queue`, { method: 'POST', body: retry ? { acceptExtraUsage: true } : {} });
    toast(result.cached ? '已复用已有研究结果，没有发起新的模型请求。' : result.queued ? (state.overview?.paused ? '已加入手动队列。模型任务已暂停，恢复后才会处理。' : '已加入手动分析队列。结果会自动更新。') : '资料状态已更新。');
    await loadOverview({ quiet: true }); await loadArticles({ quiet: true });
    if (state.currentArticle?.id === article.id && $('detail-dialog').open) await refreshDetail();
  } catch (error) {
    if (error.code === 'retry_confirmation' && !retry) {
      confirmRetry = true;
    } else if (state.authenticated) toast(message(error));
  } finally { state.queueing.delete(article.id); if (button?.isConnected) busyButton(button, false); }
  if (confirmRetry) return queueArticle(article, button, true);
}
function resetFilters() {
  $('filter-form').reset(); state.filters = { q: '', status: '', editorialStatus: '' }; state.offset = 0;
  clearTimeout(state.searchTimer); return loadArticles();
}
function applyFilters() {
  clearTimeout(state.searchTimer);
  state.filters = { q: $('search').value.trim(), status: $('filter-status').value, editorialStatus: $('filter-editorial').value };
  state.offset = 0; return loadArticles();
}

async function openDetail(id) {
  if (state.currentArticle?.id !== id && !canLeaveDetail()) return;
  preserveNotes(); state.currentArticle = null; state.noteDirty = false;
  const request = ++state.detailRequest;
  $('detail-content').replaceChildren(node('h1', { id: 'detail-title', class: 'sr-only', text: '正在读取资料' }), loading('正在读取资料…'));
  if (!$('detail-dialog').open) $('detail-dialog').showModal(); syncDialogState();
  try {
    const article = await api(`/api/articles/${encodeURIComponent(id)}`);
    if (request !== state.detailRequest || !$('detail-dialog').open || !state.authenticated) return;
    state.currentArticle = article; renderDetail();
  } catch (error) {
    if (request !== state.detailRequest || !state.authenticated) return;
    $('detail-content').replaceChildren(node('h1', { id: 'detail-title', class: 'sr-only', text: '读取未完成' }), emptyState('资料暂时无法打开', message(error), action('重新读取', () => openDetail(id))));
  }
}
async function refreshDetail() {
  if (!state.currentArticle || !$('detail-dialog').open) return;
  const id = state.currentArticle.id; preserveNotes();
  const request = ++state.detailRequest;
  const article = await api(`/api/articles/${encodeURIComponent(id)}`);
  if (request !== state.detailRequest || !state.authenticated || !state.currentArticle || state.currentArticle.id !== id || !$('detail-dialog').open) return;
  state.currentArticle = article; renderDetail();
}
function canLeaveDetail() {
  if (!state.noteDirty) return true;
  return window.confirm('个人笔记还没有保存。关闭后草稿仅暂留在当前页面，刷新或退出会丢失。确定关闭吗？');
}
function closeDetail() {
  if (!canLeaveDetail()) return;
  preserveNotes(); state.detailRequest++; $('detail-dialog').close(); syncDialogState();
}
function section(title, children, className = '') {
  return node('section', { class: `detail-section ${className}`.trim() }, node('h2', { text: title }), children);
}
function detailList(values, fallback) {
  const valid = items(values).filter(v => typeof v === 'string' && v.trim());
  return valid.length ? node('ul', { class: 'detail-list' }, valid.map(v => node('li', { text: v }))) : node('p', { text: fallback });
}
function translationPanel(article) {
  const panel = node('details', { class: 'body-details' }, node('summary', { text: '查看中文译文' }));
  const content = node('div', { 'aria-live': 'polite' });
  panel.append(content);
  const path = `/api/articles/${encodeURIComponent(article.id)}/translation`;
  let loading = false;
  async function update(options) {
    if (loading || !panel.open || !panel.isConnected) return;
    loading = true;
    try {
      const translated = await api(path, options);
      if (!panel.isConnected || !panel.open) return;
      if (translated.status === 'completed' && translated.result) {
        content.replaceChildren(node('h3', { text: translated.result.title }),
          node('p', { class: 'form-hint', text: article.bodyKind === 'feed_excerpt' ? '译文仅覆盖已收录的订阅摘要。全文请查原文。' : '译文对应研究台已收录的正文。引用请核对英文原文。' }),
          node('pre', { text: translated.result.body }));
        return;
      }
      if (translated.status === 'running') {
        content.replaceChildren(node('p', { text: '正在翻译。结果保存后会自动显示。' }));
        setTimeout(() => update(), 2000);
        return;
      }
      const retry = translated.status === 'unknown' || translated.status === 'failed';
      const enabled = Boolean(state.overview?.config?.analysisEnabled);
      content.replaceChildren(node('p', { class: 'form-hint', text: retry ? '上次翻译结果不明确。请先核对用量。' : enabled ? '手动翻译会记入模型用量。' : '模型已关闭。启用模型后可手动翻译。' }),
        action(retry ? '确认后重新翻译' : 'AI 翻译成中文', event => {
          if (retry && !window.confirm('上次翻译可能已消耗额度。确认发起一次新翻译吗？')) return;
          busyButton(event.currentTarget, true, '正在安排…');
          void update({ method: 'POST', body: retry ? { acceptExtraUsage: true } : {} });
        }, { class: 'small', disabled: !enabled }));
    } catch (error) {
      if (!panel.isConnected || !panel.open || !state.authenticated) return;
      content.replaceChildren(node('p', { role: 'status', text: message(error) }), action('查看翻译状态', () => update(), { class: 'small' }));
    } finally {
      loading = false;
    }
  }
  panel.addEventListener('toggle', () => { if (panel.open && !loading) void update(); });
  return panel;
}
function renderDetail() {
  const article = state.currentArticle; if (!article) return;
  const a = article.analysis;
  const heading = node('header', { class: 'detail-heading' },
    node('div', { class: 'article-meta' }, statusBadge(article.status), a ? badge(CATEGORY[a.category] || '研究资料', 'outline') : null, a ? badge(STAGE[a.stage] || '阶段未披露', a.stage === 'production' ? 'success' : 'outline') : null),
    node('h1', { id: 'detail-title', text: text(a?.title, text(article.title, '未命名资料')) }),
    node('p', { text: `${text(article.sourceName, '手动收录')} · ${language(article.language)} · ${date(article.publishedAt)}` }),
    node('div', { class: 'detail-actions' }, externalLink('阅读原文', article.url, 'button small'), action('导出 Markdown', event => exportResearch(article.id, event.currentTarget), { class: 'small', icon: 'download', disabled: !a, title: !a ? '完成分析后可导出研究结果。' : undefined }), queueButton(article), a?.relevance === 'relevant' && article.status === 'analyzed' && article.editorialStatus !== 'archived' ? node('a', { href: `/editorial.html?article=${encodeURIComponent(article.id)}`, class: 'button small' }, '写公众号') : null, article.status !== 'needs_body' ? action('补充正文', () => openImport(article), { class: 'small text-button' }) : null));
  const select = node('select', { id: 'detail-editorial', onChange: event => updateEditorial(event.currentTarget) }, Object.entries(EDITORIAL).map(([value, label]) => node('option', { value, text: label })));
  select.value = article.editorialStatus || 'new';
  const editorial = node('div', { class: 'detail-status' }, node('div', { class: 'select-field' }, node('label', { for: 'detail-editorial', text: '选题进度' }), select),
    node('p', { class: 'form-hint', text: '待整理的资料还需核对原文和归纳要点。完成后可标为已整理，再决定是否列入选题。' }));
  const content = [heading, editorial];
  if (a) {
    if (a.relevance !== 'relevant') content.push(node('div', { class: 'notice warning' }, node('p', { text: a.relevance === 'unrelated' ? '本次分析认为资料与研究方向关联较弱。请阅读原文后自行决定是否保留。' : '本次分析未能确认资料与研究方向的关联。请核对原文后再使用。' })));
    content.push(node('div', { class: 'detail-summary' }, node('p', { text: text(a.summary, '原文未披露足够信息。') })));
    content.push(node('dl', { class: 'research-fields' }, [['业务问题', a.problem], ['实施方案', a.solution], ['成效与结果', a.outcome]].map(([label, value]) => node('div', { class: 'research-field' }, node('dt', { text: label }), node('dd', { text: text(value, '原文未披露。') })))));
    if (a.stageEvidence) content.push(node('details', { class: 'stage-evidence' }, node('summary', { text: `阶段判断依据：${STAGE[a.stage] || '阶段未披露'}（需结合原文核对）` }), node('blockquote', { text: a.stageEvidence })));
    content.push(section('可以借鉴的经验', detailList(a.lessons, '当前资料未提供足够的可复用经验。')));
    content.push(section('适用条件与待核实事项', detailList(a.limitations, '分析未列出补充事项，仍需核对原文背景与条件。')));
    const evidence = items(a.evidence);
    content.push(section('原文证据', [node('p', { class: 'section-note', text: '引文来自已收录正文。厂商自述与第三方证实须在原文中进一步区分。' }), evidence.length ? evidence.map(e => node('div', { class: 'quote-card' }, node('blockquote', { text: text(e.quote) }), node('p', { text: `分析对应要点：${text(e.claim, '请结合上下文阅读。')}` }))) : node('p', { text: '本次分析没有提供可核对的引文，请自行阅读原文。' })]));
    const ideas = items(a.ideas);
    content.push(section('选题建议', [node('p', { class: 'section-note', text: '以下是编辑建议，属于待展开的写作方向。请核对事实后再使用。' }), ideas.length ? ideas.map(idea => node('article', { class: 'idea-card' }, node('h3', { text: text(idea.title, '待定选题') }), node('p', { text: text(idea.angle) }))) : node('p', { text: '本次没有生成选题建议。你可以在个人笔记中记录自己的判断。' })], 'idea-panel'));
  } else {
    const explanation = article.status === 'needs_body' ? '当前正文不足。可以打开原文阅读，再通过“补充正文”粘贴材料。' : article.status === 'failed' ? '上次分析未完成，可能已产生用量。请核对用量与账号状态，再决定是否重试。' : ['queued', 'analyzing'].includes(article.status) ? '资料已在分析流程中。页面会自动更新，处理期间你仍可阅读原文和记录笔记。' : article.status === 'skipped' ? '本地规则未把这篇资料列为相关材料，没有调用模型。你仍可阅读、记录笔记，或补充与 AI 落地有关的原文。' : '还没有模型研究结果。可以先阅读原文、记录笔记，再决定是否加入分析队列。';
    content.push(node('div', { class: 'notice subtle' }, node('p', { text: explanation })));
  }
  const savedNotes = article.personalNotes || '';
  const draft = state.drafts.has(article.id) ? state.drafts.get(article.id) : savedNotes;
  state.noteDirty = draft !== savedNotes;
  const notes = node('textarea', { id: 'personal-notes', class: 'notes-editor', rows: '7', maxlength: '10000', placeholder: '记录你的判断：哪些经验能迁移到自己的项目？还需要核对什么？准备从哪个角度写？', onInput: event => {
    state.noteDirty = event.currentTarget.value !== (state.currentArticle?.personalNotes || '');
    if (state.noteDirty) state.drafts.set(article.id, event.currentTarget.value); else state.drafts.delete(article.id);
    $('notes-state').textContent = state.noteDirty ? '有未保存的修改' : '已与保存内容一致';
    $('save-notes').disabled = !state.noteDirty;
  } });
  notes.value = draft;
  content.push(section('个人笔记', [node('label', { for: 'personal-notes', class: 'sr-only', text: '个人笔记内容' }), notes,
    node('div', { class: 'notes-actions' }, node('span', { id: 'notes-state', class: 'notes-state', role: 'status', text: state.noteDirty ? '草稿尚未保存' : savedNotes ? '已保存' : '最多 10000 个字符' }), node('button', { id: 'save-notes', type: 'button', class: 'button small primary', disabled: !state.noteDirty, onClick: saveNotes }, '保存笔记'))]));
  const body = text(article.body, text(article.bodyExcerpt));
  if (article.canTranslate) content.push(translationPanel(article));
  content.push(node('details', { class: 'body-details' }, node('summary', { text: '查看已收录正文' }), body ? node('pre', { text: body }) : node('p', { class: 'form-hint', text: '尚未收录正文，请阅读原文或补充正文。' })));
  $('detail-content').replaceChildren(...content);
}
async function updateEditorial(control, article = state.currentArticle, value = control.value) {
  if (!article) return;
  const previous = article.editorialStatus; control.disabled = true;
  try {
    const response = await api(`/api/articles/${encodeURIComponent(article.id)}`, { method: 'PATCH', body: { editorialStatus: value } });
    if (state.currentArticle?.id === article.id) state.currentArticle.editorialStatus = response.editorialStatus || value;
    toast(value === 'organized' ? '已标为已整理。' : '选题进度已保存。'); await loadOverview({ quiet: true }); await loadArticles({ quiet: true });
  } catch (error) { if (control.tagName === 'SELECT') control.value = previous; if (state.authenticated) toast(message(error)); }
  finally { if (control.isConnected) control.disabled = false; }
}
async function saveNotes() {
  const article = state.currentArticle; if (!article) return;
  const value = $('personal-notes').value, button = $('save-notes'); busyButton(button, true, '正在保存…');
  try {
    await api(`/api/articles/${encodeURIComponent(article.id)}`, { method: 'PATCH', body: { personalNotes: value } });
    if (state.currentArticle?.id === article.id) {
      state.currentArticle.personalNotes = value;
      const current = $('personal-notes')?.value;
      state.noteDirty = current !== undefined && current !== value;
      if (state.noteDirty) state.drafts.set(article.id, current); else state.drafts.delete(article.id);
      if ($('notes-state')) $('notes-state').textContent = state.noteDirty ? '已保存提交内容，另有新修改' : '笔记已保存';
    }
    toast('个人笔记已保存。'); await loadArticles({ quiet: true });
  } catch (error) { if (state.authenticated) toast(message(error)); }
  finally { if (button?.isConnected) { busyButton(button, false, '保存笔记'); button.disabled = !state.noteDirty; } }
}

function openImport(article, {fromLead = false} = {}) {
  $('import-error').hidden = true;
  if (article) {
    $('import-url').value = article.url || ''; $('import-heading').value = article.title || ''; $('import-body').value = '';
    $('import-title').textContent = fromLead ? '收录工程原文' : '补充原文正文';
  } else {
    $('import-title').textContent = '导入资料';
  }
  $('import-dialog').querySelector('.dialog-footer > p').textContent = '先保存资料，分析由你手动安排。';
  if (!$('import-dialog').open) $('import-dialog').showModal(); syncDialogState();
  (article && !fromLead ? $('import-body') : $('import-url')).focus();
}
function closeImport() { $('import-dialog').close(); syncDialogState(); }
async function submitImport(event) {
  event.preventDefault(); $('import-error').hidden = true;
  const url = $('import-url').value.trim(), title = $('import-heading').value.trim(), body = $('import-body').value.trim();
  if (!safeURL(url)) { showFormError('import-error', { message: '请输入有效的 HTTP 或 HTTPS 原文链接。' }); return; }
  busyButton($('import-submit'), true, '正在保存…');
  try {
    const result = await api('/api/import', { method: 'POST', body: { url, ...(title ? { title } : {}), ...(body ? { body } : {}) }, timeout: 45000 });
    $('import-form').reset(); closeImport();
    toast(result.created === false ? '资料已在研究库中；如提交了新正文，相关内容已更新。' : '资料已保存到研究库。');
    await loadOverview({ quiet: true });
    state.offset = 0; await loadArticles({ quiet: true });
    if (state.view === 'discovery') await loadLeads();
    const imported = result.article || result.item || result;
    if ($('detail-dialog').open && state.currentArticle?.url === url) await refreshDetail();
    else if (imported?.id && state.view === 'library') await openDetail(imported.id);
  } catch (error) { if (state.authenticated) showFormError('import-error', error, '资料未保存，请稍后重试。'); }
  finally { busyButton($('import-submit'), false, '保存资料'); }
}

function renderCollectionActivity() {
  const collection = state.collection, button = $('collect-now');
  const busy = state.startingCollection || collection?.collecting;
  const atLimit = collection && collection.addedToday >= collection.dailyLimit;
  const enabled = collection?.items.some(source => source.enabled);
  button.disabled = !enabled || !!busy || !!atLimit;
  button.title = atLimit ? '今天已达到采集上限。' : collection && !enabled ? '请先启用一个信源。' : '';
  $('collect-now-label').textContent = busy ? '正在检查…' : '检查信源更新';
  $('collection-summary').textContent = collection ?
    `今天已从信源新增 ${count(collection.addedToday)} 篇，上限 ${count(collection.dailyLimit)} 篇。${atLimit ? '今天已达到上限。' : ''}` : '正在读取采集进度…';
}
async function loadSources({ quiet = false } = {}) {
  const request = ++state.sourceRequest, target = $('source-list');
  if (!quiet) { target.setAttribute('aria-busy', 'true'); target.replaceChildren(loading('正在读取信源…')); }
  try {
    const response = await api('/api/sources'); if (!state.authenticated || request !== state.sourceRequest) return;
    const sources = items(response.items);
    state.collection = { ...response, items: sources };
    for (const [id, setting] of [['collection-days', response.lookbackDays], ['collection-limit', response.dailyLimit]]) {
      const input = $(id), value = String(setting);
      if (input.value === input.defaultValue) input.value = value;
      input.defaultValue = value;
    }
    $('collection-fields').disabled = false; renderCollectionActivity();
    $('sources-count').textContent = `${count(sources.length)} 个来源，${count(sources.filter(s => s.enabled).length)} 个已启用`;
    target.replaceChildren(...(sources.length ? sources.map(sourceCard) : [emptyState('还没有配置来源', '可以先手动导入资料，再按研究方向配置固定信源。', action('导入资料', () => openImport()))]));
  } catch (error) { if (!quiet && state.authenticated && request === state.sourceRequest) target.replaceChildren(emptyState('信源暂时没有加载出来', message(error), action('重新加载', loadSources))); }
  finally { if (request === state.sourceRequest) target.setAttribute('aria-busy', 'false'); }
}
function sourceCard(source) {
  const manual = source.kind === 'manual' || ['disabled', 'watch'].includes(source.disposition);
  const checkbox = node('input', { type: 'checkbox', role: 'switch', checked: Boolean(source.enabled), disabled: manual, 'aria-label': `${source.enabled ? '停用' : '启用'} ${text(source.name, '此来源')} 的自动检查`, onChange: event => toggleSource(source, event.currentTarget) });
  const header = node('div', { class: 'source-card-header' }, node('h2', { text: text(source.name, '资料来源') }), manual ? badge('人工阅读', 'outline') : node('label', { class: 'switch-label' }, checkbox, node('span', { text: '自动检查' })));
  const description = Array.isArray(source.description) ? source.description.join('；') : text(source.description, text(source.notes, '请打开来源，判断是否适合当前研究方向。'));
  const meta = node('div', { class: 'source-meta' }, badge(language(source.language), 'outline'), source.region ? badge(source.region, 'outline') : null, !manual ? badge(source.enabled ? '已启用' : '已停用', source.enabled ? 'success' : '') : null);
  const checked = manual ? '可阅读后手动导入' : source.lastCheckedAt ? `上次检查 ${date(source.lastCheckedAt, true)} · 新增 ${count(source.lastCount)} 篇` : '尚未检查';
  const references=items(source.references);
  const readings=references.length?node('details',{class:'source-readings'},node('summary',{text:'重点资料'}),
    node('ul',{},...references.map(ref=>node('li',{},externalLink(ref.title,ref.url),
      ref.readable?node('button',{type:'button',class:'button small','aria-label':'收录 '+ref.title,text:'收录',
        onClick:()=>openImport({url:ref.url},{fromLead:true})}):null)))):null;
  return node('article', { class: 'source-card' }, header, meta, node('p', { class: 'source-description', text: description }), source.lastError ? node('p', { class: 'source-error', text: '上次检查未完成。可以稍后重试，或打开来源手动收录。' }) : null, readings, node('div', { class: 'source-footer' }, node('span', { text: checked }), externalLink('打开来源', source.homepage || source.url)));
}
async function toggleSource(source, input) {
  const enabled = input.checked; input.disabled = true;
  try { await api(`/api/sources/${encodeURIComponent(source.id)}`, { method: 'POST', body: { enabled } }); toast(enabled ? '已启用该来源的自动检查。' : '已停用该来源，已有资料保留。'); await loadSources(); }
  catch (error) { input.checked = !enabled; if (state.authenticated) toast(message(error)); }
  finally { if (input.isConnected) input.disabled = false; }
}
async function collectNow() {
  state.startingCollection = true; renderCollectionActivity();
  try { const result = await api('/api/collect', { method: 'POST', body: {} }); toast(result.message); }
  catch (error) { if (state.authenticated) toast(message(error)); }
  finally { if (state.authenticated) await loadSources({ quiet: true }); state.startingCollection = false; renderCollectionActivity(); }
}
async function saveCollectionSettings(event) {
  event.preventDefault();
  const button = $('save-collection'), feedback = $('collection-feedback');
  const body = { lookbackDays: $('collection-days').valueAsNumber, dailyLimit: $('collection-limit').valueAsNumber };
  busyButton(button, true, '正在保存…'); feedback.hidden = true;
  try {
    await api('/api/sources/settings', { method: 'POST', body });
    feedback.className = ''; feedback.textContent = '采集设置已保存。';
    await loadSources({ quiet: true });
  } catch (error) { feedback.className = 'form-error'; feedback.textContent = message(error); }
  finally { feedback.hidden = !state.authenticated; busyButton(button, false); }
}

function usageCard(title, value, hint, small = false) {
  return node('article', { class: 'usage-card' }, node('h2', { text: title }), node('strong', { class: `usage-value${small ? ' small-value' : ''}`, text: value }), node('p', { text: hint }));
}
function renderUsage() {
  const target = $('usage-content');
  if (!state.overview) { target.replaceChildren(loading('正在读取用量…')); return; }
  const { usage = {}, config = {}, paused } = state.overview;
  const costKnown = usage.costKnown === true;
  const mode = config.provider === 'api' ? 'API 模式' : config.provider === 'codex' ? '本机 Codex 模式' : '暂未接入模型';
  const cards = node('div', { class: 'usage-grid' },
    usageCard('过去 24 小时模型任务', `${count(usage.attempts24h)} 次`, '研究分析、公众号写作和翻译的总次数，包含失败和结果未知的尝试。'),
    usageCard('本月已记录输入 / 输出', `${count(usage.inputTokens)} / ${count(usage.outputTokens)}`, '单位为 token。未返回完整用量的请求，不代表没有消耗。', true),
    usageCard(costKnown ? '本月 API 估算费用' : '当前接入的费用', costKnown ? money(usage.monthCostUsd) : '金额未知', costKnown ? '单位为美元，按配置单价估算；不含 Codex 账号中无法折算的消耗。' : config.provider === 'codex' ? '本机工具不提供可可靠换算的美元账单。尝试次数不是费用。' : '尚未接入 API 费用统计。', true));
  $('auto-limit').defaultValue = String(config.dailyLimit ?? '');
  $('auto-limit-summary').textContent = `${config.autoAnalyze && config.analysisEnabled ? '自动分析已开启' : '自动分析已关闭'}。过去 24 小时已用 ${count(usage.autoAttempts24h)} 次，上限 ${count(config.dailyLimit)} 次。手动任务单独由你决定，统一记入总用量。`;
  const settings = [
    ['接入方式', mode], ['任务模型', config.provider === 'off' ? '未启用' : text(config.model, config.provider === 'codex' ? '使用账号默认模型' : '未设置')],
    ['定时采集', config.collectEnabled ? '已启用' : '未启用'], ['模型任务', config.analysisEnabled ? '已启用' : '未启用'],
    ['自动分析', config.autoAnalyze && config.analysisEnabled ? '已启用' : '未启用，手动选择'],
    ['当前处理', paused ? '已暂停' : config.analysisEnabled ? '按队列处理' : '等待启用分析'],
  ];
  const running = node('section', { class: 'panel' }, node('h2', { text: '当前运行方式' }), node('dl', { class: 'settings-list' }, settings.map(([label, value]) => node('div', {}, node('dt', { text: label }), node('dd', { text: value })))), node('div', { class: 'panel-actions' }, action(paused ? '恢复模型任务' : '暂停模型任务', event => controlAnalysis(paused ? 'resume' : 'pause', event.currentTarget), { disabled: !config.analysisEnabled, class: paused ? 'primary' : '' }), node('p', { text: '暂停阻止新任务启动，已发出的请求可能继续完成。' })));
  let budget;
  if (costKnown) {
    const spent = number(usage.monthCostUsd), reserved = number(usage.monthReservedUsd), cap = number(config.monthlyBudgetUsd);
    const used = spent === null || reserved === null ? null : spent + reserved;
    budget = node('section', { class: 'panel' }, node('h2', { text: '本月 API 预算' }), node('p', { text: '开始每次模型任务前会预留预算。结果不明确的请求会保留预留金额，避免把未知消耗算成零。' }), node('div', { class: 'budget-label' }, node('span', { text: '已估算 + 预留' }), node('strong', { text: `${money(used)} / ${money(cap)}` })), cap !== null && cap > 0 && used !== null ? node('progress', { value: Math.min(used, cap), max: cap, 'aria-label': '本月 API 预算使用情况', 'aria-valuetext': `已估算与预留合计 ${money(used)}，预算 ${money(cap)} 美元` }) : null, node('dl', { class: 'settings-list' }, node('div', {}, node('dt', { text: '已估算费用' }), node('dd', { text: `${money(spent)} USD` })), node('div', {}, node('dt', { text: '尚未结算的预留' }), node('dd', { text: `${money(reserved)} USD` }))), node('p', { text: `预算是本地保护线，不是服务商账单。本月 Codex 尝试 ${count(usage.cliAttemptsMonth)} 次，无法折算的消耗不包含在上述 API 金额内。最终费用请以服务商的用量页为准。` }));
  } else {
    budget = node('section', { class: 'panel' }, node('h2', { text: '怎样理解当前用量' }), node('p', { text: config.provider === 'codex' ? '当前通过本机 Codex 工具处理资料。研究台记录研究与写作的任务次数和工具返回的 token，用于观察处理规模；这些数字不能换算成可靠的美元费用。' : '当前模型未接入。你可以先收集资料、阅读原文和保存笔记，之后再决定使用哪种分析方式。' }), node('p', { text: config.provider === 'codex' ? '额度与费用请以你所用账号的实际规则为准。API 月预算不会约束本机工具的订阅额度。' : '启用 API 模式后，才会显示按配置单价计算的估算费用和月预算。' }), node('p', { text: `本月 Codex 模型任务 ${count(usage.cliAttemptsMonth)} 次；这些次数不代表美元金额。` }), (number(usage.monthCostUsd) > 0 || number(usage.monthReservedUsd) > 0) ? node('p', { text: `本月另有 API 估算费用 ${money(usage.monthCostUsd)} USD、预留 ${money(usage.monthReservedUsd)} USD，仅对应 API 请求，不含 Codex 消耗。` }) : null, node('p', { text: '重试可能重复消耗额度。出现失败或中断时，先查看账号用量，再决定是否重新分析。' }));
  }
  target.replaceChildren(cards, node('div', { class: 'usage-columns' }, running, budget), node('p', { class: 'usage-footnote', text: '本月统计按服务端 UTC 月份计算。采集只读取网页与订阅源；自动分析关闭时，点击检查信源不会调用分析模型。此处不包含 VPS、网络或其他第三方服务的费用。' }));
  target.setAttribute('aria-busy', 'false');
}
async function controlAnalysis(actionName, button) {
  busyButton(button, true, '正在更新…');
  try { await api('/api/control', { method: 'POST', body: { action: actionName } }); await loadOverview(); toast(actionName === 'pause' ? '已暂停启动新的研究分析和写作任务。' : '已恢复处理模型任务队列。'); }
  catch (error) { if (state.authenticated) toast(message(error)); }
  finally { if (button?.isConnected) busyButton(button, false); }
}
async function saveAutomaticLimit(event) {
  event.preventDefault();
  const input = $('auto-limit'), button = $('save-auto-limit'), feedback = $('auto-limit-state');
  const limit = Number(input.value);
  busyButton(button, true, '正在保存…');
  feedback.hidden = true;
  try {
    await api('/api/control', { method: 'POST', body: { action: 'set-auto-daily-limit', limit } });
    await loadOverview();
    feedback.className = '';
    feedback.textContent = '自动分析上限已保存。';
  } catch (error) {
    feedback.className = 'form-error';
    feedback.textContent = message(error);
  } finally {
    feedback.hidden = !state.authenticated;
    busyButton(button, false);
  }
}
async function exportResearch(id, button) {
  busyButton(button, true, '正在导出…');
  try {
    const blob = await api(id ? `/api/export/${encodeURIComponent(id)}` : '/api/export', { blob: true });
    const href = URL.createObjectURL(blob), anchor = node('a', { href, download: `${id ? 'FDE_研究笔记' : 'FDE_研究资料'}_${new Date().toISOString().slice(0, 10)}.md` });
    document.body.append(anchor); anchor.click(); anchor.remove(); setTimeout(() => URL.revokeObjectURL(href), 1000);
    toast('研究资料已导出为 Markdown 文件。');
  } catch (error) { if (state.authenticated) toast(message(error)); }
  finally { if (button?.isConnected) busyButton(button, false); }
}

$('login-form').addEventListener('submit', async event => {
  event.preventDefault(); $('login-error').hidden = true; busyButton($('login-submit'), true, '正在验证…');
  try {
    await api('/api/login', { method: 'POST', body: { token: $('login-token').value }, handleAuth: false });
    const overview = await api('/api/overview', { handleAuth: false });
    await startWorkspace(overview);
  } catch (error) {
    const loginMessage = error.status === 401 || error.status === 403 ? '访问口令未通过验证。请核对部署时设置的口令，并从研究台的正式地址重试。' : message(error, '暂时无法进入研究台，请稍后重试。');
    $('login-error').textContent = loginMessage; $('login-error').hidden = false; $('login-token').focus();
  } finally { busyButton($('login-submit'), false, '进入工作区'); }
});
$('show-token').addEventListener('click', () => { const visible = $('login-token').type === 'password'; $('login-token').type = visible ? 'text' : 'password'; $('show-token').textContent = visible ? '隐藏' : '显示'; $('show-token').setAttribute('aria-pressed', String(visible)); });
$('logout').addEventListener('click', async event => {
  preserveNotes();
  if (state.drafts.size && !window.confirm('还有未保存的个人笔记草稿。退出会清除当前页面中的草稿，确定退出吗？')) return;
  const button = event.currentTarget; busyButton(button, true, '正在退出…');
  try {
    await api('/api/logout', { method: 'POST', body: {} });
    state.authenticated = false; state.overview = null; state.items = []; state.currentArticle = null; state.noteDirty = false; state.drafts.clear(); state.listRequest++; state.detailRequest++;
    $('article-list').replaceChildren(); $('source-list').replaceChildren(); $('usage-content').replaceChildren(); $('detail-content').replaceChildren(); $('import-form').reset(); clearWorkspaceError();
    showLogin();
  } catch (error) { if (state.authenticated) toast(message(error)); }
  finally { busyButton(button, false, '退出'); }
});
document.querySelectorAll('.main-tabs [data-view]').forEach(tab => {
  tab.addEventListener('click', () => switchView(tab.dataset.view));
  tab.addEventListener('keydown', event => {
    const tabs = [...document.querySelectorAll('.main-tabs [data-view]')];
    let index = tabs.indexOf(tab);
    if (event.key === 'ArrowRight') index = (index + 1) % tabs.length;
    else if (event.key === 'ArrowLeft') index = (index - 1 + tabs.length) % tabs.length;
    else if (event.key === 'Home') index = 0;
    else if (event.key === 'End') index = tabs.length - 1;
    else return;
    event.preventDefault(); tabs[index].focus(); switchView(tabs[index].dataset.view);
  });
});
window.addEventListener('hashchange', () => { if (state.authenticated) switchView(location.hash.slice(1), false); });
$('filter-form').addEventListener('submit', event => { event.preventDefault(); applyFilters(); });
$('search').addEventListener('input', () => { clearTimeout(state.searchTimer); state.searchTimer = setTimeout(applyFilters, 350); });
for (const id of ['filter-editorial', 'filter-status']) $(id).addEventListener('change', applyFilters);
$('clear-filters').addEventListener('click', resetFilters);
$('previous-page').addEventListener('click', () => { state.offset = Math.max(0, state.offset - state.limit); loadArticles(); });
$('next-page').addEventListener('click', () => { state.offset += state.limit; loadArticles(); });
$('refresh-library').addEventListener('click', async event => {
  const button = event.currentTarget; busyButton(button, true, '正在刷新…');
  try { await loadOverview(); await loadArticles(); } catch (error) { if (state.authenticated) showWorkspaceError(error); }
  finally { busyButton(button, false, '刷新'); }
});
$('refresh-usage').addEventListener('click', async event => {
  const button = event.currentTarget; busyButton(button, true, '正在刷新…');
  try { await loadOverview(); } catch (error) { if (state.authenticated) showWorkspaceError(error); }
  finally { busyButton(button, false, '刷新用量'); }
});
$('auto-limit-form').addEventListener('submit', saveAutomaticLimit);
$('retry-workspace').addEventListener('click', async () => { try { await loadOverview(); await switchView(state.view, false); } catch (error) { if (state.authenticated) showWorkspaceError(error); } });
$('export-all').addEventListener('click', event => exportResearch(null, event.currentTarget));
$('open-import').addEventListener('click', () => openImport());
$('close-import').addEventListener('click', closeImport);
$('import-form').addEventListener('submit', submitImport);
$('close-detail').addEventListener('click', closeDetail);
$('detail-dialog').addEventListener('cancel', event => { event.preventDefault(); closeDetail(); });
$('detail-dialog').addEventListener('close', syncDialogState);
$('import-dialog').addEventListener('close', syncDialogState);
for (const id of ['detail-dialog', 'import-dialog']) $(id).addEventListener('click', event => {
  if (event.target !== $(id)) return;
  const rect = $(id).getBoundingClientRect();
  if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) id === 'detail-dialog' ? closeDetail() : closeImport();
});
$('collect-now').addEventListener('click', collectNow);
wireDiscovery();
wireDaily();
$('collection-form').addEventListener('submit', saveCollectionSettings);
$('resume-banner').addEventListener('click', event => controlAnalysis('resume', event.currentTarget));
window.addEventListener('beforeunload', event => { if (state.noteDirty || state.drafts.size) { event.preventDefault(); event.returnValue = ''; } });
setInterval(async () => {
  if (!state.authenticated || document.hidden || state.refreshing) return;
  state.refreshing = true;
  try {
    const pending = state.items.some(a => ['queued', 'analyzing'].includes(a.status));
    await loadOverview({ quiet: true });
    if (state.view === 'library' && (pending || number(state.overview?.stats?.queued) > 0)) await loadArticles({ quiet: true });
    if (state.view === 'sources' && state.collection?.collecting) await loadSources({ quiet: true });
    if ($('detail-dialog').open && state.currentArticle && ['queued', 'analyzing'].includes(state.currentArticle.status) && !state.noteDirty && !state.queueing.has(state.currentArticle.id)) await refreshDetail();
  } catch { /* A transient polling failure does not replace the user's work. Manual refresh remains available. */ }
  finally { state.refreshing = false; }
}, 12000);
(async function initialize() {
  try { const overview = await api('/api/overview', { handleAuth: false }); await startWorkspace(overview); }
  catch (error) { showLogin(error.status === 401 ? '' : message(error, '暂时无法连接研究台，请稍后重试。')); }
})();
