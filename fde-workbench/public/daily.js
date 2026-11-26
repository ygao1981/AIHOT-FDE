'use strict';

const dailyUI={request:0,day:'',current:null,profile:null,subscriptions:null};
const feedbackLabels={
  follow:'值得继续关注',proposal:'可用于企业方案',wechat:'适合公众号选题',practical:'有实际工程价值',
  theory:'偏理论，暂不关注',promo:'营销或课程推广',duplicate:'重复内容',unrelated:'与研究方向无关',
};
const countLabels={newLeads:'新发现线索',published:'当日发布资料',older:'发现的历史资料',pending:'待深入研究',analyzed:'已完成 AI 分析',shortlisted:'公众号候选'};
const subscriptionLabels={ok:'检查完成',progress:'还有分页待检查',failed:'本次检查失败',limited:'上游接口限流',saturated:'当前时间段结果过多'};

function resetDaily(){
  dailyUI.request++;
  Object.assign(dailyUI,{day:'',current:null,profile:null,subscriptions:null});
  for(const id of ['daily-sections','daily-counts','preference-fields','preference-learned','subscription-list'])$(id).replaceChildren();
  for(const id of ['daily-report','daily-runtime','preference-result','subscription-status'])$(id).textContent='';
  $('research-preferences').open=false;
  $('topic-subscriptions').open=false;
}

async function loadDaily(day=dailyUI.day){
  const request=++dailyUI.request;
  $('daily-report').textContent='正在读取简报…';
  try {
    const report=await api('/api/daily'+(day?'?day='+encodeURIComponent(day):''));
    if(!state.authenticated||request!==dailyUI.request)return;
    dailyUI.current=report;dailyUI.day=report.day;
    $('daily-day').value=report.day;
    $('daily-day').max=report.today;
    $('daily-today').disabled=report.day===report.today;
    $('daily-export').href='/api/daily/export?day='+encodeURIComponent(report.day);
    $('daily-heading-note').textContent=report.day===report.today?'查看今天的发现、研究进度和原文。':`${report.day} 的发现与发布记录。研究进度显示当前状态。`;
    $('daily-counts').replaceChildren(...Object.entries(countLabels).map(([key,label])=>
      node('div',{},node('dt',{text:label}),node('dd',{text:count(report.counts[key])}))));
    $('daily-runtime').textContent=`${report.runtime.collecting?'定时采集已开启':'定时采集已关闭'}。自动分析${report.runtime.automaticAnalysis?'已开启':'已关闭'}，滚动 24 小时剩余 ${report.runtime.remaining} / ${report.runtime.limit} 次。`;
    $('daily-report').textContent=report.sections.some(group=>group.count)?'已按现有工程线索和研究偏好排序。':'所选日期没有新增资料或线索。';
    $('daily-sections').replaceChildren(...report.sections.map(dailySection));
  } catch(error){if(state.authenticated&&request===dailyUI.request)$('daily-report').textContent=message(error);}
}

function dailySection(group){
  return node('section',{class:'daily-section'},
    node('header',{},node('h2',{text:group.label}),node('span',{text:`${count(group.count)} 项`})),
    ...group.items.map(dailyEntry),group.count?null:node('p',{text:'本日暂无新增。'}),
    group.count>group.items.length?node('p',{text:`已显示 ${group.items.length} 项，可在研究库或线索池查看更多。`}):null);
}

function dailyEntry(entry){
  const when=entry.dateKind==='published'?`当日发布 ${date(entry.publishedAt)}`:
    entry.dateKind==='historical'?`历史资料，原文 ${date(entry.publishedAt)}`:
      entry.publishedAt?`原文 ${date(entry.publishedAt)}`:'原文日期未知';
  const details=node('details',{},node('summary',{text:'排序依据与出处'}),
    node('ul',{class:'discovery-meta'},...[entry.checkBasis,...entry.reasons,
      ...(entry.recommendation.length?['匹配你的方向 '+entry.recommendation.join('、')]:[]),
      ...(entry.explore?['来自其他信源的探索推荐']:[])].map(line=>node('li',{text:line}))),
    ...entry.mentions.map(mention=>node('p',{class:'discovery-meta'},
      externalLink(mention.platform+(mention.author?` / ${mention.author}`:''),mention.url),' ',
      `${mention.kind==='repository'?'星标':mention.platform==='Hacker News'?'积分':'互动'} ${mention.points??'未知'}，评论 ${mention.comments??'未知'}`,
      mention.publishedAt?`，讨论或活动日期 ${date(mention.publishedAt)}`:'',
      `，观察于 ${date(mention.observedAt,true)}${mention.signal?'，'+mention.signal:''}`)));
  const actions=node('div',{class:'discovery-actions'},
    externalLink(entry.original?'查看原文':'查看讨论',entry.original||entry.mentions[0]?.url),
    entry.articleId?action(entry.checkBasis==='已有研究卡'?'查看研究卡':'查看资料',()=>openDetail(entry.articleId),{class:'small'}):null,
    entry.queueable?action('加入待分析',async event=>{
      await queueArticle({id:entry.articleId,status:entry.status},event.currentTarget);
      if(state.view==='today')await loadDaily();
    },{class:'small',disabled:!state.overview?.config?.analysisEnabled,title:state.overview?.config?.analysisEnabled?'人工安排一次分析':'模型分析当前关闭'}):null);
  const shortlist=entry.articleId?
    (['new','organized'].includes(entry.editorialStatus)?action('加入公众号选题',async event=>{
      await updateEditorial(event.currentTarget,{id:entry.articleId,editorialStatus:entry.editorialStatus},'shortlisted');
      if(state.view==='today')await loadDaily();
    },{class:'small'}):entry.editorialStatus==='shortlisted'?node('span',{class:'discovery-meta',text:'已列入公众号选题'}):null):
    feedbackButton(entry,'wechat','加入公众号选题','已列入公众号选题');
  const feedback=node('div',{class:'discovery-actions'},
    feedbackButton(entry,'follow','收藏','已收藏'),feedbackButton(entry,'proposal','方案素材','已标为方案素材'),
    shortlist);
  const moreLabels=['practical','theory','promo','duplicate','unrelated'];
  if(entry.articleId)moreLabels.unshift('wechat');
  const more=node('details',{},node('summary',{text:'更多反馈'}),
    node('div',{class:'discovery-actions'},...moreLabels.map(label=>feedbackButton(entry,label))));
  return node('article',{class:'daily-entry'},
    node('p',{class:'discovery-meta',text:`${entry.source}，${when}`}),
    node('h3',{text:entry.title}),
    node('p',{class:'discovery-meta',text:[entry.checkBasis,STATUS[entry.status],STAGE[entry.stage]].filter(Boolean).join('，')}),
    entry.summary?node('p',{class:'discovery-excerpt',text:short(entry.summary,175)}):null,actions,details,feedback,more);
}

function feedbackButton(entry,label,caption=feedbackLabels[label],activeCaption=caption) {
  const enabled=entry.labels.includes(label);
  return node('button',{type:'button',class:'button small',text:enabled?activeCaption:caption,'aria-pressed':String(enabled),
    onClick:async event=>{
      const button=event.currentTarget;
      busyButton(button,true,'正在保存…');
      try {
        await api('/api/research/feedback',{method:'POST',body:{type:entry.type,id:entry.id,label,enabled:!enabled}});
        if(state.authenticated){
          toast(enabled?'已撤销反馈。':'已保存反馈。');
          await loadDaily();
          if($('research-preferences').open)await loadProfile();
          const next=[...$('daily-sections').querySelectorAll('button')].find(item=>item.dataset.feedback===button.dataset.feedback);
          const details=next?.closest('details');
          if(details)details.open=true;
          next?.focus();
        }
      }catch(error){if(state.authenticated)toast(message(error));}
      finally {busyButton(button,false);}
    },'data-feedback':entry.id+' '+label});
}

async function loadProfile(){
  try {
    const profile=await api('/api/research/preferences');
    if(!state.authenticated)return;
    dailyUI.profile=profile;
    $('preference-fields').replaceChildren(...profile.preferences.map(entry=>{
      const field=(label,id,attrs)=>node('div',{class:'form-field'},node('label',{for:id,text:label}),node('input',{id,required:true,...attrs}));
      return node('div',{class:'preference-row'},
        field('研究方向','pref-label-'+entry.id,{value:entry.label,maxLength:40}),
        field('关键词（逗号分隔）','pref-words-'+entry.id,{value:entry.words,maxLength:250}),
        field('权重','pref-weight-'+entry.id,{type:'number',value:entry.weight,min:-3,max:5,step:1}));
    }));
    const name={topics:'主题',sources:'信源',authors:'作者'};
    const learned=Object.entries(profile.learned).flatMap(([key,values])=>values.length?[node('p',{class:'preference-learned',text:
      `${name[key]}反馈调整 ${values.map(row=>{
        const title=key==='topics'?profile.preferences.find(p=>p.id===row.name)?.label||row.name:row.name;
        return title+' '+(row.adjustment>0?'+':'')+Number(row.adjustment.toFixed(1));
      }).join('、')}`})]:[]);
    $('preference-learned').replaceChildren(...(learned.length?learned:[node('p',{class:'preference-learned',text:'最近 90 天暂无推荐反馈。'})]));
    $('preferences-save').disabled=false;
    $('preferences-reset').disabled=false;
  }catch(error){if(state.authenticated)$('preference-result').textContent=message(error);}
}

async function saveProfile(reset){
  if(!dailyUI.profile)return;
  const data=reset?{reset:true}:{preferences:dailyUI.profile.preferences.map(({id})=>({id,label:$('pref-label-'+id).value,
    words:$('pref-words-'+id).value,weight:$('pref-weight-'+id).valueAsNumber}))};
  const button=$(reset?'preferences-reset':'preferences-save');
  busyButton(button,true,'正在保存…');
  try{
    await api('/api/research/preferences',{method:'POST',body:data});
    if(state.authenticated){$('preference-result').textContent=reset?'已恢复默认权重。':'已保存研究偏好。';await loadProfile();await loadDaily();}
  }catch(error){if(state.authenticated)$('preference-result').textContent=message(error);}
  finally{busyButton(button,false);}
}

function selectSubscription(){
  const topic=dailyUI.subscriptions?.items.find(entry=>entry.id===$('subscription-topic').value);
  if(!topic)return;
  $('subscription-keyword').value=topic.keyword;
  $('subscription-hours').value=topic.hours;
  $('subscription-enabled').checked=topic.enabled;
  $('subscription-run').disabled=!topic.enabled||topic.running;
}

function showSubscriptions(response){
  dailyUI.subscriptions=response;
  const prior=$('subscription-topic').value;
  $('subscription-topic').replaceChildren();
  fillOptions($('subscription-topic'),response.items.map(topic=>[topic.id,topic.label]));
  $('subscription-topic').value=prior||response.items[0]?.id||'';
  selectSubscription();
  $('subscription-status').textContent=response.scheduled?'定时采集已开启。启用的主题会按设定间隔更新。':'定时采集已关闭。仍可手动检查已启用的主题。';
  $('subscription-list').replaceChildren(...response.items.map(topic=>{
    const outcome=topic.running?'正在检查':topic.enabled?(subscriptionLabels[topic.last?.status]||'等待首次检查'):'已停用';
    return node('div',{},node('h3',{text:topic.label}),
      node('p',{class:'discovery-meta',text:outcome+(topic.checkedAt?`，最近成功 ${date(topic.checkedAt,true)}`:'')}),
      topic.last?node('p',{class:'discovery-meta',text:`上轮获取 ${count(topic.last.raw)} 条，符合规则 ${count(topic.last.matched)} 条，新增 ${count(topic.last.added)} 条`}):null,
      topic.progress?node('p',{class:'discovery-meta',text:`待续第 ${topic.progress.page} 页`}):null,
      topic.enabled&&topic.nextAt?node('p',{class:'discovery-meta',text:`下次检查 ${date(topic.nextAt,true)}`}):null);
  }));
}

async function loadSubscriptions(){
  try{const response=await api('/api/discovery/subscriptions');if(state.authenticated)showSubscriptions(response);}
  catch(error){if(state.authenticated)$('subscription-status').textContent=message(error);}
}

async function changeSubscription(run){
  const id=$('subscription-topic').value;
  const body=run?{id,run:true}:{id,keyword:$('subscription-keyword').value,
    hours:$('subscription-hours').valueAsNumber,enabled:$('subscription-enabled').checked};
  const button=$(run?'subscription-run':'subscription-save');
  busyButton(button,true,run?'正在检查…':'正在保存…');
  try {
    const response=await api('/api/discovery/subscriptions',{method:'POST',body});
    if(state.authenticated){
      showSubscriptions(response);
      if(!run)toast('已保存主题订阅。');
      if(run)await loadLeads({reset:true});
    }
  }catch(error){if(state.authenticated)toast(message(error));}
  finally{busyButton(button,false);if(run)selectSubscription();}
}

function wireDaily(){
  $('daily-day').addEventListener('change',()=>loadDaily($('daily-day').value));
  $('daily-today').addEventListener('click',()=>loadDaily(''));
  $('daily-discovery').addEventListener('click',async()=>{
    await switchView('discovery');
    $('topic-subscriptions').open=true;
    $('topic-subscriptions').querySelector('summary').focus();
  });
  $('research-preferences').addEventListener('toggle',()=>{if($('research-preferences').open)loadProfile();});
  $('preference-form').addEventListener('submit',event=>{event.preventDefault();saveProfile(false);});
  $('preferences-reset').addEventListener('click',()=>saveProfile(true));
  $('topic-subscriptions').addEventListener('toggle',()=>{if($('topic-subscriptions').open)loadSubscriptions();});
  $('subscription-topic').addEventListener('change',selectSubscription);
  $('subscription-form').addEventListener('submit',event=>{event.preventDefault();changeSubscription(false);});
  $('subscription-run').addEventListener('click',()=>changeSubscription(true));
}
