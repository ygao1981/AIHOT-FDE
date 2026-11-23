import { downloadEditorialPackage, copyEditorialText } from '/editorial-assets.js';

const $ = id => document.getElementById(id);
const STATUS = { queued: '等待写作', writing: '正在写作', ready: '已生成草稿', unknown: '写作未完成', blocked: '配置已变化' };
const state = {
  authenticated: false, overview: null, selected: new Map(), articles: [], total: 0, offset: 0,
  sourceRequest: 0, drafts: [], current: null, edit: null, dirty: false, editEpoch: 0,
  request: 0, creating: false, saving: false, refreshing: false, toastTimer: null,
};
function node(tag, attrs = {}, ...children) {
  const element = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (value === undefined || value === null || value === false || key === 'value') continue;
    if (key === 'text') element.textContent = value;
    else if (key === 'class') element.className = value;
    else if (key.startsWith('on') && typeof value === 'function') element.addEventListener(key.slice(2).toLowerCase(), value);
    else if (['checked','disabled','hidden'].includes(key)) element[key] = !!value;
    else element.setAttribute(key, String(value));
  }
  for (const child of children.flat(Infinity)) if (child !== null && child !== undefined && child !== false) element.append(child instanceof Node ? child : document.createTextNode(String(child)));
  if ('value' in attrs) element.value = attrs.value;
  return element;
}
function button(label, callback, options = {}) { return node('button', { type: 'button', class: 'button small', onClick: callback, ...options }, label); }
function clone(value) { return JSON.parse(JSON.stringify(value)); }
function title(draft) { return draft.result?.title || draft.spec?.angle || draft.sources?.[0]?.title || '待生成的公众号草稿'; }
function date(value) { const d = new Date(value); return Number.isNaN(d.getTime()) ? '' : new Intl.DateTimeFormat('zh-CN',{month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false}).format(d); }
function safeURL(value) { try { const u = new URL(value); return ['http:','https:'].includes(u.protocol) && !u.username && !u.password ? u.href : null; } catch { return null; } }
function message(error) {
  if (error?.status === 401) return '登录已过期。请重新输入访问口令；未保存内容暂留在当前页面。';
  if (error?.code === 'revision_conflict') return '另一页面已保存这份草稿。你的修改仍保留，请先核对新版本，再决定如何保存。';
  if (error?.code === 'network') return '暂时无法连接研究台。操作可能仍在处理，请刷新状态，不要反复提交。';
  const value = String(error?.message || '');
  return /[\u4e00-\u9fff]/.test(value) && value.length <= 350 && !/\b(?:SQL|sqlite|ENOENT|ECONN|Error:)|\/(?:workspace|home|usr|var)\//.test(value) ? value : '操作未完成，请检查运行状态后重试。';
}
function showError(error) { $('workspace-error-text').textContent = message(error); $('workspace-error').hidden = false; }
function clearError() { $('workspace-error').hidden = true; }
function toast(text) { clearTimeout(state.toastTimer); $('toast').textContent = text; $('toast').hidden = false; state.toastTimer = setTimeout(() => { $('toast').hidden = true; }, 5000); }
function showLogin(error = '') {
  state.authenticated = false; $('startup').hidden = true; $('editorial-workspace').hidden = true; $('login-screen').hidden = false;
  $('login-error').textContent = error; $('login-error').hidden = !error;
}
async function api(path, options = {}) {
  const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 25000);
  try {
    const response = await fetch(path, { method: options.method || 'GET', credentials: 'same-origin', cache: 'no-store', signal: controller.signal,
      ...(options.body !== undefined ? { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(options.body) } : {}) });
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      const error = Object.assign(new Error(data.error?.message || ''), { status: response.status, code: data.error?.code });
      if (response.status === 401 && path !== '/api/login') showLogin(message(error));
      throw error;
    }
    return response.json();
  } catch (error) { if (error.status) throw error; throw Object.assign(new Error(''), { code: 'network' }); }
  finally { clearTimeout(timer); }
}
function updateBudget() {
  const { usage = {}, config = {}, paused } = state.overview || {};
  $('budget-count').textContent = `滚动 24 小时已用 ${usage.attempts24h ?? '—'} / ${config.dailyLimit ?? '—'} 次模型任务`;
  const breakdown = Number.isFinite(usage.analysisAttempts24h) ? `研究分析 ${usage.analysisAttempts24h} 次，公众号写作 ${usage.editorialAttempts24h ?? 0} 次。` : '';
  $('budget-detail').textContent = `${breakdown}失败与未知回执同样计入。切换版式和导出不增加次数。`;
  $('pause-notice').hidden = !paused;
  $('pause-text').textContent = paused ? `模型任务已暂停。${message({ message: paused })} 素材稿、编辑和导出仍可使用。` : '';
  updateActions();
}
function updateActions() {
  const config = state.overview?.config || {}, ready = state.current?.status === 'ready' && !!state.current?.result;
  const available = state.selected.size > 0 && state.selected.size <= 3 && !state.creating && !state.saving;
  $('create-template').disabled = !available;
  $('create-model').disabled = !available || !config.analysisEnabled || config.provider === 'off';
  $('create-model').title = !config.analysisEnabled || config.provider === 'off' ? '模型尚未启用。你仍可整理不消耗额度的素材稿。' : '同一素材、角度和写作配置命中缓存时，不重复调用模型。达到上限后等待。';
  $('save-draft').disabled = !ready || !state.dirty || state.saving;
  $('reload-draft').disabled = state.saving;
  $('copy-draft').disabled = !ready || state.dirty || state.saving;
  $('download-draft').disabled = !ready || state.dirty || state.saving;
  $('edit-state').textContent = state.saving ? '正在保存…' : state.dirty ? '有未保存修改' : '已保存';
  $('edit-state').classList.toggle('editing-dirty', state.dirty);
}
function markDirty() { state.dirty = true; state.editEpoch++; updateActions(); }
function renderSelection() {
  $('selected-sources').replaceChildren(...[...state.selected.values()].map(a => node('div', { class: 'selected-source' }, node('span',{text:a.analysis?.title || a.title}), button('移除', () => { state.selected.delete(a.id); renderSelection(); renderSources(); }))));
  updateActions();
}
function renderSources() {
  const eligible = state.articles.filter(a => a.analysis?.relevance === 'relevant' && a.editorialStatus !== 'archived');
  $('source-choices').replaceChildren(...(eligible.length ? eligible.map(a => {
    const input = node('input',{type:'checkbox',checked:state.selected.has(a.id),'aria-label':`选择 ${a.title}`,onChange:event=>{
      if(event.currentTarget.checked && state.selected.size >= 3){event.currentTarget.checked=false;toast('每份草稿最多使用 3 篇资料，请先移除一篇。');return;}
      if(event.currentTarget.checked)state.selected.set(a.id,a);else state.selected.delete(a.id);
      renderSelection();
    }});
    return node('label',{class:'source-choice'},input,node('span',{},node('strong',{text:a.analysis.title || a.title}),node('small',{text:`${a.sourceName || '人工收录'} · ${a.publishedAt ? String(a.publishedAt).slice(0,10) : '原文未注明日期'}`})));
  }) : [node('p',{class:'source-list-empty',text:'本页没有可用素材。请选择已分析、与 FDE 相关且未归档的资料。'})]));
  $('source-choices').setAttribute('aria-busy','false');
  $('source-count').textContent = state.total ? `第 ${Math.floor(state.offset / 30) + 1} 页` : '暂无资料';
  $('source-prev').disabled = state.offset === 0; $('source-next').disabled = state.offset + 30 >= state.total;
}
async function loadSources() {
  const request = ++state.sourceRequest;
  $('source-choices').setAttribute('aria-busy','true');
  const params = new URLSearchParams({status:'analyzed',q:$('source-search').value,limit:'30',offset:String(state.offset)});
  const response = await api(`/api/articles?${params}`);
  if (request !== state.sourceRequest || !state.authenticated) return;
  state.articles = response.items || []; state.total = response.total || 0; renderSources();
}
function renderDraftList() {
  $('draft-count').textContent = String(state.drafts.length);
  $('draft-list').replaceChildren(...(state.drafts.length ? state.drafts.map(draft => button('',()=>openDraft(draft.id).catch(showError),{class:'draft-entry','aria-pressed':String(draft.id===state.current?.id)})) : [node('p',{class:'draft-list-empty',text:'草稿会保存在本机，重启后可以继续编辑。'})]));
  for (const [index, entry] of [...$('draft-list').querySelectorAll('.draft-entry')].entries()) {
    const draft = state.drafts[index];
    entry.append(node('strong',{text:title(draft)}),node('small',{text:`${STATUS[draft.status] || '待检查'} · ${draft.spec?.mode === 'template' ? '素材稿' : 'AI 草稿'} · ${date(draft.updatedAt)}`}));
  }
}
function allowDiscard() {
  if (state.saving) { toast('正在保存，请稍候再切换草稿。'); return false; }
  return !state.dirty || window.confirm('这份草稿还有未保存修改。确定放弃这些修改并继续吗？');
}
function sourceReferences(value) {
  return node('fieldset',{class:'source-references'},node('legend',{text:'对应来源（事实段与要点必选）'}),state.current.sources.map(source => node('label',{},node('input',{type:'checkbox',checked:value.sources.includes(source.id),onChange:event=>{
    value.sources = event.currentTarget.checked ? [...new Set([...value.sources,source.id])].sort((a,b)=>a-b) : value.sources.filter(id=>id!==source.id);markDirty();
  }}),`来源 ${source.id}`)));
}
function textField(label, value, update, {max=800,rows=3,id} = {}) {
  const input = node(rows ? 'textarea' : 'input',{value,rows:rows||undefined,maxlength:max,id,type:rows?undefined:'text',onInput:event=>{update(event.currentTarget.value);markDirty();}});
  const textLabel = node('label',{},label,input);
  return node('div',{class:'form-field'},textLabel);
}
function paragraphEditor(paragraph,label,remove) {
  return node('div',{class:'paragraph-editor'},textField(label,paragraph.text,value=>{paragraph.text=value;}),node('div',{class:'paragraph-meta'},node('label',{},node('span',{class:'sr-only',text:`${label}内容类型`}),node('select',{value:paragraph.kind,onChange:event=>{paragraph.kind=event.currentTarget.value;markDirty();}},node('option',{value:'source',text:'来自原文'}),node('option',{value:'interpretation',text:'我的解读'}),node('option',{value:'suggestion',text:'行动建议'}))),remove ? button('删除这段',remove) : null),sourceReferences(paragraph));
}
function renderEditor() {
  const result = state.edit;
  if (!result) { $('editor-fields').replaceChildren(); return; }
  const fields = [textField('文章标题',result.title,value=>{result.title=value;},{max:80,rows:0,id:'edit-title'}),paragraphEditor(result.lead,'开篇')];
  result.sections.forEach((section,index)=>{
    const entry=node('section',{class:'section-editor'},node('div',{class:'panel-heading'},node('h3',{text:`正文 ${index+1}`}),button('删除小节',()=>{result.sections.splice(index,1);markDirty();renderEditor();},{disabled:result.sections.length<=1})),textField('小节标题',section.heading,value=>{section.heading=value;},{max:80,rows:0}),section.paragraphs.map((p,pIndex)=>paragraphEditor(p,`第 ${pIndex+1} 段`,section.paragraphs.length>1?()=>{section.paragraphs.splice(pIndex,1);markDirty();renderEditor();}:null)),button('添加一段',()=>{section.paragraphs.push({text:'',kind:'interpretation',sources:[]});markDirty();renderEditor();},{disabled:section.paragraphs.length>=5}));
    fields.push(entry);
  });
  fields.push(button('添加小节',()=>{result.sections.push({heading:'',paragraphs:[{text:'',kind:'interpretation',sources:[]}]});markDirty();renderEditor();},{class:'button small editor-add',disabled:result.sections.length>=8}));
  fields.push(node('section',{class:'section-editor'},node('h3',{text:'读者可以带走的要点'}),result.takeaways.map((point,index)=>node('div',{class:'paragraph-editor'},textField(`要点 ${index+1}`,point.text,value=>{point.text=value;},{max:180,rows:2}),sourceReferences(point),result.takeaways.length>1?button('删除要点',()=>{result.takeaways.splice(index,1);markDirty();renderEditor();}):null)),button('添加要点',()=>{result.takeaways.push({text:'',sources:[]});markDirty();renderEditor();},{disabled:result.takeaways.length>=3})));
  fields.push(textField('适用条件与待核实事项（每行一条，每条 300 字内，最多 6 条）',result.caveats.join('\n'),value=>{result.caveats=value.split('\n').map(x=>x.trim()).filter(Boolean);},{max:1800,rows:4,id:'edit-caveats'}));
  $('editor-fields').replaceChildren(...fields); updateActions();
}
function renderEvidence(draft) {
  $('draft-evidence').replaceChildren(...draft.sources.map(source=>{
    const href=safeURL(source.url);
    return node('article',{class:'evidence-source'},node('strong',{text:`来源 ${source.id} · ${source.title}`}),href?node('p',{},node('a',{href,target:'_blank',rel:'noopener noreferrer',referrerpolicy:'no-referrer',text:'阅读原文'})):null,node('p',{text:`${source.sourceName || '人工收录'} · ${source.publishedAt ? String(source.publishedAt).slice(0,10) : '原文未注明日期'}`}),source.analysis?.evidence?.map(e=>node('blockquote',{text:e.quote})),source.analysis?.limitations?.length?node('p',{text:`原研究限制：${source.analysis.limitations.join('；')}`}):null);
  }));
}
function updateDraftHeader() {
  const draft=state.current;if(!draft)return;
  $('draft-empty').hidden=true;$('active-draft').hidden=false;
  $('draft-heading-title').textContent=title(draft);$('draft-status').textContent=STATUS[draft.status]||'待检查';
  $('draft-status').className=`badge ${draft.status==='ready'?'success':['unknown','blocked'].includes(draft.status)?'error':'warning'}`;
  $('draft-meta').textContent=`${draft.spec.mode==='template'?'素材整理稿 · 未调用模型':'AI 写作草稿'} · ${draft.sources.length} 篇素材 · 保存版本 ${draft.revision} · ${date(draft.updatedAt)}`;
  let notice='';
  if(draft.status==='queued')notice='已保存写作任务。它会在串行队列中处理；暂停或达到滚动上限时继续等待。请勿重复提交。';
  else if(draft.status==='writing')notice='正在写作。你可以离开页面；任务和结果保存在研究台。';
  else if(draft.status==='unknown')notice='上次写作未能确认完成，可能已经消耗额度。回执已保留，不会自动重试。请检查用量与运行状态后再决定。';
  else if(draft.status==='blocked')notice='写作配置已变化，本任务没有调用模型。请以当前配置重新创建草稿，原记录会保留。';
  else if(draft.staleSources)notice='来源资料已变化。此稿仍保留创建时的研究快照，请核对原文后决定是否重新生成。';
  else if(draft.spec.mode==='template')notice='这是一份从研究卡整理的素材稿，供你继续写作。请补充自己的论述与判断后再用于公众号。';
  $('draft-notice').hidden=!notice;$('draft-notice-text').textContent=notice;
  $('retry-draft').hidden=draft.status!=='unknown';$('retry-draft').disabled=!state.overview?.config?.analysisEnabled||state.overview?.config?.provider==='off';
  $('draft-content').hidden=draft.status!=='ready'||!draft.result;
  updateActions();
}
function updatePreview() {
  if(state.current?.status!=='ready')return;
  const params=new URLSearchParams({variant:$('preview-variant').value,theme:$('preview-theme').value,revision:String(state.current.revision)});
  $('draft-preview').src=`/api/editorial/${encodeURIComponent(state.current.id)}/preview?${params}`;
}
function acceptDraft(draft,{keepEdit=false}={}) {
  state.current=draft;
  if(!keepEdit){state.edit=draft.result?clone(draft.result):null;state.dirty=false;renderEditor();}
  updateDraftHeader();renderEvidence(draft);renderDraftList();updatePreview();
}
async function openDraft(id,{force=false}={}) {
  if(!force&&!allowDiscard())return;
  const request=++state.request,epoch=state.editEpoch,response=await api(`/api/editorial/${encodeURIComponent(id)}`);
  if(request!==state.request||!state.authenticated)return;
  if(state.editEpoch!==epoch){toast('你在加载期间继续编辑了正文。当前修改已保留，请保存后再切换。');return;}
  clearError();acceptDraft(response.draft);history.replaceState(null,'',`/editorial.html?draft=${encodeURIComponent(id)}`);
}
async function refresh({sources=false}={}) {
  if(state.refreshing||!state.authenticated)return;
  state.refreshing=true;
  try {
    const [overview,library]=await Promise.all([api('/api/overview'),api('/api/editorial')]);
    if(!state.authenticated)return;
    state.overview=overview;state.drafts=library.items||[];$('editorial-brand').textContent=library.profile?.brand||'半理性半烟火';
    updateBudget();renderDraftList();
    const current=state.current;
    if(current&&!state.saving){
      const response=await api(`/api/editorial/${encodeURIComponent(current.id)}`);
      if(state.current!==current||!state.authenticated||state.saving)return;
      const latest=response.draft;
      if(state.dirty){
        if(latest.revision!==current.revision){$('edit-state').textContent='另一页面有更新；本页修改已保留';}
      }else if(latest.revision!==current.revision||latest.status!==current.status||latest.staleSources!==current.staleSources){acceptDraft(latest);}
    }
    if(sources)await loadSources();
  } finally {state.refreshing=false;}
}
async function createDraft(mode) {
  if(state.creating||!state.selected.size||!allowDiscard())return;
  state.creating=true;updateActions();clearError();
  const request=++state.request,epoch=state.editEpoch;
  try {
    const response=await api('/api/editorial',{method:'POST',body:{articleIds:[...state.selected.keys()],angle:$('draft-angle').value,format:$('draft-format').value,mode}});
    if(request===state.request&&epoch===state.editEpoch&&state.authenticated){
      acceptDraft(response.draft);history.replaceState(null,'',`/editorial.html?draft=${encodeURIComponent(response.draft.id)}`);
      toast(response.cached?'已打开已有草稿，没有新增模型请求。':mode==='template'?'已整理素材稿，没有调用模型。':'已保存写作任务。两种版式共用这次写作结果。');
    }else toast('草稿已保存，可从草稿列表打开。你当前正在编辑的内容已保留。');
    await refresh();
  } catch(error){showError(error);} finally{state.creating=false;updateActions();}
}
async function saveDraft(event) {
  event?.preventDefault();if(!state.dirty||state.saving||!state.current)return;
  const id=state.current.id,revision=state.current.revision,epoch=state.editEpoch,result=clone(state.edit);
  state.saving=true;updateActions();clearError();
  try {
    const response=await api(`/api/editorial/${encodeURIComponent(id)}`,{method:'PATCH',body:{revision,result}});
    if(state.current?.id!==id)return;
    acceptDraft(response.draft,{keepEdit:state.editEpoch!==epoch});
    toast(state.dirty?'已保存提交时的版本。刚输入的新修改仍在编辑区，请继续保存。':'正文已保存，两个版本的预览已更新。');
  }catch(error){showError(error);}finally{state.saving=false;updateActions();}
}
async function retryDraft() {
  if(!state.current||state.current.status!=='unknown')return;
  if(!window.confirm('上次写作可能已经消耗额度。重试会增加一次模型任务，并与研究分析共用上限。确认已核对用量并重试吗？'))return;
  const id=state.current.id,request=++state.request,epoch=state.editEpoch;
  $('retry-draft').disabled=true;
  try{const response=await api(`/api/editorial/${encodeURIComponent(id)}/retry`,{method:'POST',body:{acceptExtraUsage:true}});if(request===state.request&&epoch===state.editEpoch&&state.authenticated)acceptDraft(response.draft);toast('已重新排队，原失败回执保留。当前编辑不会被替换。');await refresh();}
  catch(error){showError(error);}finally{updateDraftHeader();}
}
async function rendered(variant=$('preview-variant').value) {
  if(!state.current?.result||state.dirty)throw new Error('请先保存正文，再复制或导出。');
  return api(`/api/editorial/${encodeURIComponent(state.current.id)}/render?${new URLSearchParams({variant,theme:$('preview-theme').value})}`);
}
async function exportDraft() {
  $('download-draft').disabled=true;
  try {const variant=$('preview-variant').value;const [selected,companion]=await Promise.all([rendered(variant),rendered(variant==='text'?'illustrated':'text')]);const result=await downloadEditorialPackage(selected,companion);toast(`已下载两版素材包${result?.files ? `，包含 ${result.files} 个文件` : ''}。图片请在公众号编辑器上传并核对。`);}
  catch(error){showError(error);}finally{updateActions();}
}
async function copyDraft() {
  $('copy-draft').disabled=true;
  try {const result=await copyEditorialText(await rendered('text'));toast(result?.format==='text'?'已复制纯文本（未带样式）。可下载素材包获取排版文件。':'已复制文字版。粘贴到公众号后请核对格式与来源。');}
  catch(error){showError(error);}finally{updateActions();}
}
async function boot() {
  try {
    state.overview=await api('/api/overview');state.authenticated=true;
    $('startup').hidden=true;$('login-screen').hidden=true;$('editorial-workspace').hidden=false;
    $('login-token').value='';updateBudget();await refresh({sources:true});
    if(state.current)return;
    const params=new URLSearchParams(location.search),articleId=params.get('article'),draftId=params.get('draft');
    if(articleId){const article=await api(`/api/articles/${encodeURIComponent(articleId)}`);if(article.status==='analyzed'&&article.analysis?.relevance==='relevant'&&article.editorialStatus!=='archived'){state.selected.set(article.id,article);renderSelection();renderSources();}else toast('这篇资料暂不能作为写作素材，请选择已分析的相关资料。');}
    if(draftId)await openDraft(draftId,{force:true});
  }catch(error){if(error.status===401)showLogin();else{$('startup').hidden=true;showError(error);$('editorial-workspace').hidden=false;}}
}
$('login-form').addEventListener('submit',async event=>{event.preventDefault();$('login-submit').disabled=true;try{await api('/api/login',{method:'POST',body:{token:$('login-token').value}});await boot();}catch(error){$('login-error').textContent=error.status===401?'访问口令不正确，请核对研究台配置。':message(error);$('login-error').hidden=false;}finally{$('login-submit').disabled=false;}});
$('source-search-form').addEventListener('submit',event=>{event.preventDefault();state.offset=0;loadSources().catch(showError);});
$('source-prev').addEventListener('click',()=>{state.offset=Math.max(0,state.offset-30);loadSources().catch(showError);});
$('source-next').addEventListener('click',()=>{state.offset+=30;loadSources().catch(showError);});
$('create-model').addEventListener('click',()=>createDraft('model'));
$('create-template').addEventListener('click',()=>createDraft('template'));
$('draft-edit-form').addEventListener('submit',saveDraft);
$('reload-draft').addEventListener('click',()=>state.current&&openDraft(state.current.id).catch(showError));
$('retry-draft').addEventListener('click',retryDraft);
$('preview-variant').addEventListener('change',updatePreview);$('preview-theme').addEventListener('change',updatePreview);
$('download-draft').addEventListener('click',exportDraft);$('copy-draft').addEventListener('click',copyDraft);
$('refresh-all').addEventListener('click',()=>{clearError();refresh({sources:true}).catch(showError);});
window.addEventListener('beforeunload',event=>{if(state.dirty){event.preventDefault();event.returnValue='';}});
setInterval(()=>{if(state.authenticated&&!document.hidden)refresh().catch(showError);},8000);
await boot();
