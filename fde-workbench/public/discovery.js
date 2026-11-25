'use strict';

const discoveryUI = { catalog: null, channel: 'hn', result: null, submitted: null, busy: false, offset: 0, leadRequest: 0 };
const discoveryLabels = { story: 'Hacker News', post: 'X 帖子', repository: 'GitHub 仓库', issue: 'GitHub Issue',
  pull: 'GitHub PR', release: 'GitHub Release', doc: 'GitHub 文档更新', discussion: 'GitHub Discussion' };
const discoveryRanks = ['低优先级', '待核对', '工程相关', '含工程细节'];

function fillOptions(select, options) {
  for (const [value, label] of options) select.append(node('option', { value, text: label }));
}
async function openDiscovery() {
  if (!discoveryUI.catalog) {
    const catalog = await api('/api/discovery/catalog');
    if (!state.authenticated || discoveryUI.catalog) return;
    discoveryUI.catalog = catalog;
    for (const id of ['hn-topic', 'x-topic']) {
      fillOptions($(id), catalog.topics.map(topic => [topic.id, topic.label]));
      $(id).value = catalog.topics[0].id;
    }
    fillOptions($('x-author'), catalog.authors.map(author => [author.handle, author.name]));
    fillOptions($('github-repo'), catalog.repositories.map(repo => [repo.repo, repo.label]));
    $('github-repo').value = catalog.repositories[0].repo;
    $('x-authors').replaceChildren(...catalog.authors.map(author => node('li', {},
      externalLink(author.name, `https://x.com/${author.handle}`), node('span', { text: author.focus }))));
    $('github-hint').textContent = catalog.githubDiscussions
      ? '从公开仓库读取活动。短时间内检查相同条件会复用前一次结果。'
      : '公开仓库可直接检查。讨论区可在 GitHub 原生页面查看。';
    useTopic('hn');
    useTopic('x');
    showGithubLinks();
  }
  await loadLeads();
}
function useTopic(channel) {
  const topic = discoveryUI.catalog?.topics.find(entry => entry.id === $(`${channel}-topic`).value);
  if (topic) $(`${channel}-query`).value = topic[channel];
  if (channel === 'x') updateXSearch();
}
function updateXSearch() {
  const terms = [$('x-query').value.trim(), $('x-author').value ? `from:${$('x-author').value}` : ''].filter(Boolean);
  $('x-open-search').href = terms.length ? 'https://x.com/search?' + new URLSearchParams({ q: terms.join(' '), f: 'live' }) : 'https://x.com/search-advanced';
}
function showGithubLinks() {
  const repo = discoveryUI.catalog?.repositories.find(entry => entry.repo === $('github-repo').value);
  $('github-links').replaceChildren(...(repo ? [
    externalLink('打开仓库', 'https://github.com/' + repo.repo),
    externalLink('打开讨论区', 'https://github.com/' + repo.repo + '/discussions'),
  ] : []));
  $('github-watch').checked = Boolean(repo?.watching);
  $('github-watch').disabled = !repo;
  $('github-watch-status').textContent = repo?.watching
    ? (state.overview?.config?.collectEnabled ? (repo.checkedAt ? `上次定时检查 ${date(repo.checkedAt,true)}` : '等待首次定时检查。') : '已加入跟踪。定时采集当前关闭，可手动检查。')
    : '开启定时采集后，已跟踪仓库约每 12 小时检查一次，工程更新保存到线索池。';
}
async function saveGithubWatch() {
  const repo = discoveryUI.catalog?.repositories.find(entry => entry.repo === $('github-repo').value);
  if (!repo) return;
  const input = $('github-watch'), enabled = input.checked;
  input.disabled = true;
  try {
    await api('/api/discovery/watch', { method:'POST', body:{ repo:repo.repo, enabled } });
    if (state.authenticated) repo.watching = enabled;
  } catch (error) { if (state.authenticated) toast(message(error)); }
  finally { if (state.authenticated) showGithubLinks(); }
}
function setDiscoveryChannel(channel) {
  discoveryUI.channel = channel;
  for (const button of document.querySelectorAll('[data-discovery]')) {
    const selected = button.dataset.discovery === channel;
    button.setAttribute('aria-pressed', String(selected));
    $(`discovery-${button.dataset.discovery}`).hidden = !selected;
  }
  renderDiscoveryResults();
}
function resetDiscovery() {
  discoveryUI.leadRequest++;
  discoveryUI.offset = 0;
  discoveryUI.result = null;
  discoveryUI.submitted = null;
  $('lead-list').replaceChildren();
  $('lead-report').textContent = '';
  $('lead-pages').hidden = true;
  $('x-feedback').textContent = '';
  $('x-save').reset();
  renderDiscoveryResults();
}
function mentionMeta(item) {
  const pointsLabel = item.kind === 'repository' ? '星标' : item.channel === 'hn' ? '积分' : '互动';
  const metrics = item.kind === 'repository' ? [`${pointsLabel} ${item.points == null ? '未知' : count(item.points)}`] : [
    `${pointsLabel} ${item.points == null ? '未知' : count(item.points)}`,
    `评论 ${item.comments == null ? '未知' : count(item.comments)}`,
  ];
  const when = item.activityAt ? `更新 ${date(item.activityAt)}` : item.publishedAt ? date(item.publishedAt) : '日期未知';
  return [discoveryLabels[item.kind], when, ...metrics].join(' · ');
}
function renderDiscoveryResults() {
  const result = discoveryUI.result, visible = result && discoveryUI.channel === result.channel;
  $('discovery-results').hidden = !visible;
  if (!visible) {
    $('discovery-list').replaceChildren();
    $('discovery-warnings').replaceChildren();
    return;
  }
  $('discovery-report').textContent = result.message || (result.items.length
    ? `本页 ${count(result.items.length)} 条${result.total != null ? `，搜索共匹配 ${count(result.total)} 条` : ''}`
    : '没有找到符合条件的更新。可以扩大日期范围或更换关键词。');
  $('discovery-warnings').replaceChildren(...items(result.warnings).map(warning => node('li', { text: warning })));
  $('discovery-warnings').hidden = !items(result.warnings).length;
  $('save-discovery-batch').hidden = !result.items.some(item => item.priority > 0);
  $('discovery-list').replaceChildren(...result.items.map(entry => {
    const label = entry.saved ? '已保存' : '保存线索';
    const detail = node('div', { class: 'discovery-entry-main' },
      node('p', { class: 'discovery-meta', text: mentionMeta(entry) }),
      node('h3', { text: entry.title }), entry.excerpt ? node('p', { class: 'discovery-excerpt', text: short(entry.excerpt, 260) }) : null,
      node('div', { class: 'discovery-actions' }, externalLink('查看来源', entry.url),
        entry.relatedUrl && entry.relatedUrl !== entry.url ? externalLink('打开原文', entry.relatedUrl) : null));
    return node('article', { class: 'discovery-entry' },detail,node('div', { class: 'discovery-entry-side' },
      badge(discoveryRanks[entry.priority], entry.priority >= 2 ? 'success' : 'outline'),
      action(label, event => saveSearchLeads(event.currentTarget, [entry.url]), { class:'small', disabled: entry.saved })));
  }));
  $('discovery-pages').hidden = result.channel !== 'hn' || !(result.page || result.hasMore);
  $('discovery-page-label').textContent = `第 ${(result.page ?? 0) + 1} 页`;
  $('discovery-prev').disabled = !result.page;
  $('discovery-next').disabled = !result.hasMore;
}
async function runDiscovery(channel, params, button) {
  if (discoveryUI.busy) return;
  discoveryUI.busy = true;
  busyButton(button, true, channel === 'hn' ? '正在搜索…' : '正在检查…');
  discoveryUI.result = { channel, items: [], message: channel === 'hn' ? '正在搜索 Hacker News…' : '正在读取仓库活动…' };
  renderDiscoveryResults();
  try {
    const result = await api(`/api/discovery/${channel}?${params}`, { timeout: channel === 'github' ? 135000 : 18000 });
    if (state.authenticated) discoveryUI.result = { ...result, channel };
  } catch (error) {
    if (state.authenticated) discoveryUI.result = { channel, items: [], message: message(error) };
  } finally {
    discoveryUI.busy = false;
    busyButton(button, false);
    if (state.authenticated) renderDiscoveryResults();
  }
}
function searchHn(event) {
  event.preventDefault();
  const params = new URLSearchParams();
  for (const [key, id] of [['q','hn-query'],['points','hn-points'],['comments','hn-comments'],['from','hn-from'],['to','hn-to'],['sort','hn-sort']])
    if ($(id).value) params.set(key, $(id).value);
  discoveryUI.submitted = params;
  return runDiscovery('hn', params, $('hn-submit'));
}
function changeHnPage(change) {
  const params = new URLSearchParams(discoveryUI.submitted);
  params.set('page', Number(discoveryUI.result?.page ?? 0) + change);
  return runDiscovery('hn', params, $(change > 0 ? 'discovery-next' : 'discovery-prev'));
}
async function saveSearchLeads(button, urls) {
  const result = discoveryUI.result;
  if (!result?.snapshot) return;
  busyButton(button, true, '正在保存…');
  try {
    const saved = await api('/api/discovery/leads', { method:'POST', body:{ snapshot: result.snapshot, urls } });
    if (!state.authenticated) return;
    for (const entry of result.items) if (urls ? urls.includes(entry.url) : entry.priority > 0) entry.saved = true;
    toast(leadFeedback(saved));
    await loadLeads({ reset:true });
  } catch (error) {
    if (state.authenticated) toast(message(error));
  } finally {
    busyButton(button, false);
    if (state.authenticated && discoveryUI.result === result) renderDiscoveryResults();
  }
}
function leadFeedback({ added, duplicates, linked }) {
  return `新增 ${count(added)} 条线索，更新 ${count(duplicates)} 条已有记录${linked ? `，${count(linked)} 条与既有原文归为一组` : ''}。`;
}
async function saveXPost(event) {
  event.preventDefault();
  const feedback = $('x-feedback'), button = $('x-submit');
  feedback.textContent = '';
  busyButton(button, true, '正在保存…');
  try {
    const result = await api('/api/discovery/leads', { method:'POST', body:{ url:$('x-post').value, relatedUrl:$('x-original').value, excerpt:$('x-excerpt').value } });
    if (!state.authenticated) return;
    $('x-save').reset();
    feedback.textContent = leadFeedback(result);
    await loadLeads({ reset:true });
  } catch (error) { if (state.authenticated) feedback.textContent = message(error); }
  finally { busyButton(button, false); }
}
function linkOriginal(entry) {
  const edit = node('details', { class:'lead-link-editor' }, node('summary', { text:entry.relatedUrl ? '修改关联' : '关联原文' }));
  const input = node('input', { type:'url', required:true, maxLength:4096, value:entry.relatedUrl || '', placeholder:'https://…', 'aria-label':'工程原文链接' });
  const status = node('p', { class:'form-hint', role:'status' });
  const submit = node('button', { type:'submit', class:'button small', text:'保存关联' });
  const form = node('form', { class:'form-field', onSubmit: async event => {
    event.preventDefault();
    busyButton(submit, true, '正在保存…');
    try {
      await api('/api/discovery/link', { method:'POST', body:{ url:entry.url, relatedUrl:input.value.trim() } });
      if (state.authenticated) { toast('已保存原文关联。'); await loadLeads({reset:true}); }
    } catch (error) { if (state.authenticated) status.textContent = message(error); }
    finally { busyButton(submit, false); }
  } }, input, submit, status);
  edit.append(form);
  return edit;
}
function leadGroup(group) {
  const first = group.mentions[0];
  const original = group.relatedUrl;
  const references = group.mentions.map(entry => node('li', {}, externalLink(entry.title, entry.url),
    node('p', { class:'discovery-meta', text:mentionMeta(entry) }),
    entry.excerpt ? node('p', { class:'discovery-excerpt', text:entry.excerpt }) : null,
    entry.kind === 'repository' ? null : linkOriginal(entry)));
  const evidence = original ? externalLink('打开关联原文', original) : node('span', { class:'discovery-meta', text:'待找原文' });
  const archive = group.article ? action('查看研究库资料', () => openDetail(group.article.id), {class:'small'}) :
    original ? action('收录工程原文', () => openImport({url:original}, {fromLead:true}), {class:'small'}) : null;
  const details = node('details', { class:'lead-mentions' }, node('summary', { text:`查看 ${group.mentionCount} 条来源` }),
    node('ul', {}, ...references), group.mentionCount > references.length ? node('p',{class:'form-hint',text:'此处显示前 20 条来源。'}) : null);
  return node('article', { class:'discovery-entry lead-entry' }, node('div', { class:'discovery-entry-main' },
    node('h3', { text:group.article?.title || first.title }),
    node('div', { class:'discovery-actions' }, evidence, archive), details),
    badge(discoveryRanks[group.priority], group.priority >= 2 ? 'success' : 'outline'));
}
async function loadLeads({reset=false}={}) {
  if (reset) discoveryUI.offset = 0;
  const offset = discoveryUI.offset, request = ++discoveryUI.leadRequest;
  $('lead-report').textContent = '正在读取已保存线索…';
  try {
    const result = await api(`/api/discovery/leads?offset=${offset}`);
    if (!state.authenticated || request !== discoveryUI.leadRequest) return;
    const rows = items(result.items);
    $('lead-list').replaceChildren(...rows.map(leadGroup));
    $('lead-report').textContent = rows.length ? `本页 ${count(rows.length)} 组线索。同一原文的讨论归为一组。` : '还没有保存线索。先搜索工程主题，或粘贴一条 X 帖子。';
    $('lead-pages').hidden = !offset && !result.hasMore;
    $('lead-page-label').textContent = `第 ${offset / 24 + 1} 页`;
    $('lead-prev').disabled = !offset;
    $('lead-next').disabled = !result.hasMore;
  } catch (error) { if (state.authenticated && request === discoveryUI.leadRequest) $('lead-report').textContent = message(error); }
}
function wireDiscovery() {
  for (const button of document.querySelectorAll('[data-discovery]'))
    button.addEventListener('click', () => setDiscoveryChannel(button.dataset.discovery));
  $('hn-topic').addEventListener('change', () => useTopic('hn'));
  $('x-topic').addEventListener('change', () => useTopic('x'));
  $('x-author').addEventListener('change', updateXSearch);
  $('x-query').addEventListener('input', updateXSearch);
  $('github-repo').addEventListener('change', showGithubLinks);
  $('github-watch').addEventListener('change', saveGithubWatch);
  $('discovery-hn').addEventListener('submit', searchHn);
  $('discovery-github').addEventListener('submit', event => {
    event.preventDefault();
    const params = new URLSearchParams({ repo:$('github-repo').value, days:$('github-days').value, kind:$('github-kind').value });
    runDiscovery('github', params, $('github-submit'));
  });
  $('x-save').addEventListener('submit', saveXPost);
  $('discovery-prev').addEventListener('click', () => changeHnPage(-1));
  $('discovery-next').addEventListener('click', () => changeHnPage(1));
  $('save-discovery-batch').addEventListener('click', event => saveSearchLeads(event.currentTarget));
  $('show-lead-pool').addEventListener('click', () => $('lead-pool').focus());
  $('refresh-leads').addEventListener('click', () => loadLeads());
  $('lead-prev').addEventListener('click', () => { discoveryUI.offset = Math.max(0, discoveryUI.offset - 24); loadLeads(); });
  $('lead-next').addEventListener('click', () => { discoveryUI.offset += 24; loadLeads(); });
}
