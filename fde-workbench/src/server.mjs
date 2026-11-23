import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { resolve } from 'node:path';
import { AppError, ROOT } from './config.mjs';
import { importArticle } from './collect.mjs';
import { toMarkdown } from './analysis.mjs';
import { EDITORIAL_PROFILE, validateEditorial } from './editorial.mjs';
import { canTranslate } from './translation.mjs';
import { renderEditorial } from './editorial-render.mjs';

function equal(a,b) { const x=Buffer.from(a||''),y=Buffer.from(b||'');return x.length===y.length&&timingSafeEqual(x,y); }
function send(res,status,data) {res.writeHead(status,{'Content-Type':'application/json; charset=utf-8'});res.end(JSON.stringify(data));}
async function readJson(req) {
  if(!/^application\/json(?:;|$)/i.test(req.headers['content-type']||''))throw new AppError('invalid_content_type','请使用页面中的操作提交内容。',415);
  const chunks=[];let size=0;
  for await(const chunk of req){size+=chunk.length;if(size>1024*1024)throw new AppError('request_too_large','提交内容过大，请缩短正文。',413);chunks.push(chunk);}
  const text=Buffer.concat(chunks).toString('utf8');
  try{const value=JSON.parse(text||'{}');if(!value||typeof value!=='object'||Array.isArray(value))throw new Error();return value;}
  catch{throw new AppError('invalid_json','提交内容格式不正确，请重新尝试。');}
}
export function createApp(store,worker,config,{importer=importArticle}={}) {
  if(config.accessToken.length<32)throw new AppError('missing_access_token','请先运行 npm run init，配置至少 32 字符的登录口令。');
  const allowedHosts=new Set([new URL(config.baseUrl).host,`127.0.0.1:${config.port}`,`localhost:${config.port}`,`[::1]:${config.port}`]);
  const sign=s=>createHmac('sha256',config.accessToken).update(s).digest('hex');
  const loginFailures=new Map(),secure=new URL(config.baseUrl).protocol==='https:';
  let importing=false;
  function authenticated(req) {
    const auth=req.headers.authorization;
    if(auth?.startsWith('Bearer ')&&equal(auth.slice(7),config.accessToken))return true;
    const cookie=/(?:^|;\s*)fde_session=([^;]+)/.exec(req.headers.cookie||'')?.[1];if(!cookie)return false;
    const [expiry,nonce,signature]=cookie.split('.');
    return Number(expiry)>Date.now()&&Number(expiry)<Date.now()+13*3600000&&!!nonce&&equal(sign(`${expiry}.${nonce}`),signature);
  }
  const server=createServer(async(req,res)=>{
    res.setHeader('Cache-Control','no-store');
    res.setHeader('X-Content-Type-Options','nosniff');
    res.setHeader('Referrer-Policy','no-referrer');
    res.setHeader('X-Frame-Options','DENY');
    res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; frame-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");
    try{
      if(!allowedHosts.has(req.headers.host))throw new AppError('invalid_host','访问地址不匹配，请检查运行配置。',403);
      const url=new URL(req.url,config.baseUrl),path=url.pathname,method=req.method;
      if(!['GET','POST','PATCH'].includes(method))throw new AppError('method_not_allowed','此操作不受支持。',405);
      if(method!=='GET') {
        const origin=req.headers.origin;
        const bearer=req.headers.authorization?.startsWith('Bearer ');
        if(!bearer && (!origin||!allowedHosts.has(new URL(origin).host)||!['http:','https:'].includes(new URL(origin).protocol)))
          throw new AppError('invalid_origin','请求来源不匹配，请从本站页面操作。',403);
      }
      if(path==='/api/health'&&method==='GET')return send(res,200,{ok:true,version:'2.2.0'});
      const assets={'/':'index.html','/index.html':'index.html','/app.js':'app.js','/style.css':'style.css',
        '/editorial.html':'editorial.html','/editorial.js':'editorial.js','/editorial.css':'editorial.css','/editorial-assets.js':'editorial-assets.js',
        '/guide.html':'guide.html','/guide.css':'guide.css'};
      if(assets[path]&&method==='GET') {
        const data=await readFile(resolve(ROOT,'public',assets[path]));
        res.writeHead(200,{'Content-Type':path.endsWith('.js')?'text/javascript; charset=utf-8':path.endsWith('.css')?'text/css; charset=utf-8':'text/html; charset=utf-8'});return res.end(data);
      }
      if(path==='/api/login'&&method==='POST') {
        const ip=req.socket.remoteAddress||'local',recent=loginFailures.get(ip);
        if(recent&&recent.count>=10&&Date.now()-recent.at<600000)throw new AppError('login_limited','尝试次数过多，请 10 分钟后重试。',429);
        const body=await readJson(req);
        if(typeof body.token!=='string'||!equal(body.token,config.accessToken)) {
          const validRecent=recent&&Date.now()-recent.at<600000?recent:null;
          if(loginFailures.size>1000)loginFailures.clear();
          loginFailures.set(ip,{count:(validRecent?.count||0)+1,at:validRecent?.at||Date.now()});
          throw new AppError('invalid_login','口令不正确，请检查本机或服务器的配置文件。',401);
        }
        loginFailures.delete(ip);const value=`${Date.now()+12*3600000}.${randomBytes(16).toString('hex')}`;
        res.setHeader('Set-Cookie',`fde_session=${value}.${sign(value)}; HttpOnly; SameSite=Strict; Path=/; Max-Age=43200${secure?'; Secure':''}`);
        return send(res,200,{ok:true});
      }
      if(!authenticated(req))throw new AppError('login_required','请先登录个人研究台。',401);
      if(path==='/api/logout'&&method==='POST'){res.setHeader('Set-Cookie','fde_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0');return send(res,200,{ok:true});}
      if(path==='/api/overview'&&method==='GET')return send(res,200,store.overview(config));
      if(path==='/api/editorial'&&method==='GET')return send(res,200,{items:store.listEditorial(),profile:EDITORIAL_PROFILE});
      if(path==='/api/editorial'&&method==='POST') {
        const result=await worker.createEditorial(await readJson(req));
        if(result.draft.status==='queued')void worker.wake();
        return send(res,result.draft.status==='queued'?202:200,result);
      }
      const draftMatch=/^\/api\/editorial\/([a-z0-9-]+)(?:\/(retry|render|preview))?$/.exec(path);
      if(draftMatch) {
        const [,id,action]=draftMatch,draft=store.getEditorial(id);
        if(!draft)throw new AppError('not_found','没有找到这份公众号草稿。',404);
        if(!action&&method==='GET')return send(res,200,{draft});
        if(!action&&method==='PATCH') {
          const body=await readJson(req);
          if(!Number.isSafeInteger(body.revision)||body.revision<1)throw new AppError('invalid_revision','草稿版本无效，请重新打开草稿后保存。');
          const result=validateEditorial(body.result,draft);
          return send(res,200,{draft:store.editEditorial(id,result,body.revision)});
        }
        if(action==='retry'&&method==='POST') {
          const body=await readJson(req);
          if(body.acceptExtraUsage!==true)throw new AppError('retry_confirmation','上次写作可能已消耗额度，请确认用量后再重试。',409);
          const result=await worker.retryEditorial(id);
          if(result.draft.status==='queued')void worker.wake();
          return send(res,202,result);
        }
        if(['render','preview'].includes(action)&&method==='GET') {
          const variant=url.searchParams.get('variant')||'text',theme=url.searchParams.get('theme')||'paper';
          if(!['text','illustrated'].includes(variant)||!['paper','ink'].includes(theme))throw new AppError('invalid_layout','请选择页面提供的版式和主题。');
          if(draft.status!=='ready'||!draft.result)throw new AppError('draft_not_ready','草稿还未完成，请等待处理结果。',409);
          const rendered=renderEditorial(draft,{variant,theme});
          if(action==='render')return send(res,200,rendered);
          // Only this inert, authenticated document permits generated inline styles.
          res.setHeader('X-Frame-Options','SAMEORIGIN');
          res.setHeader('Content-Security-Policy',"default-src 'none'; img-src data:; style-src 'unsafe-inline'; script-src 'none'; connect-src 'none'; frame-ancestors 'self'; base-uri 'none'; form-action 'none'; sandbox");
          res.writeHead(200,{'Content-Type':'text/html; charset=utf-8'});return res.end(rendered.previewHtml);
        }
      }
      if(path==='/api/articles'&&method==='GET')return send(res,200,store.listArticles(Object.fromEntries(url.searchParams)));
      if(path==='/api/sources'&&method==='GET')return send(res,200,{items:store.sources()});
      const sourceMatch=/^\/api\/sources\/([a-z0-9-]+)$/.exec(path);
      if(sourceMatch&&method==='POST') {const body=await readJson(req);if(typeof body.enabled!=='boolean')throw new AppError('invalid_value','请选择是否启用采集。');store.setSource(sourceMatch[1],body.enabled);return send(res,200,{ok:true});}
      const articleMatch=/^\/api\/articles\/([a-z0-9-]+)(?:\/(queue|translation))?$/.exec(path);
      if(articleMatch) {
        const [,id,action]=articleMatch;
        if(action==='queue'&&method==='POST'){const body=await readJson(req);const result=worker.enqueue(id,body.acceptExtraUsage===true);void worker.wake();return send(res,202,result);}
        if(action==='translation'&&method==='GET')return send(res,200,worker.translationStatus(id));
        if(action==='translation'&&method==='POST'){
          const body=await readJson(req),result=worker.translate(id,body.acceptExtraUsage===true);
          return send(res,result.status==='running'?202:200,result);
        }
        if(!action&&method==='GET'){const a=store.getArticle(id);if(!a)throw new AppError('not_found','没有找到这篇资料。',404);return send(res,200,{...a,canTranslate:canTranslate(a)});}
        if(!action&&method==='PATCH')return send(res,200,store.editArticle(id,await readJson(req)));
      }
      if(path==='/api/import'&&method==='POST') {
        if(importing)throw new AppError('import_busy','已有资料正在收录，请稍后再试。',409);
        const body=await readJson(req);importing=true;
        try{return send(res,200,await importer(store,body,config));}finally{importing=false;}
      }
      if(path==='/api/collect'&&method==='POST') {
        await readJson(req);
        if(!config.collectEnabled)throw new AppError('collection_disabled','采集尚未开启，请先在运行环境中开启。',409);
        if(worker.collecting)throw new AppError('collection_busy','采集正在进行，请稍候。',409);
        // Honor source intervals even when the user presses the button repeatedly.
        void worker.collect().catch(()=>{});return send(res,202,{ok:true,message:'已检查到期信源，采集结果请稍后刷新查看。'});
      }
      if(path==='/api/control'&&method==='POST') {
        const body=await readJson(req);
        if(!['pause','resume'].includes(body.action))throw new AppError('invalid_action','请选择暂停或恢复。');
        store.setSetting('analysis_pause',body.action==='pause'?'已手动暂停。':null);
        if(body.action==='resume'){worker.refill();void worker.wake();}
        return send(res,200,{ok:true});
      }
      const exportMatch=/^\/api\/export(?:\/([a-z0-9-]+))?$/.exec(path);
      if(exportMatch&&method==='GET') {
        const rows=exportMatch[1]?[store.getArticle(exportMatch[1])].filter(Boolean):store.exportRows();
        if(!rows.length||rows.some(a=>!a.analysis))throw new AppError('nothing_to_export','暂无可导出的研究结果。',404);
        const markdown=rows.map(a=>toMarkdown(a.analysis,a)+(a.personalNotes?`\n\n## 我的笔记\n\n${a.personalNotes}\n`: '')).join('\n\n---\n\n');
        res.writeHead(200,{'Content-Type':'text/markdown; charset=utf-8','Content-Disposition':`attachment; filename="fde-research${exportMatch[1]?'-'+exportMatch[1]:''}.md"`});return res.end(markdown);
      }
      throw new AppError('not_found','没有找到这个页面或操作。',404);
    }catch(error){
      const known=error instanceof AppError;
      if(!res.headersSent)send(res,known?error.status:500,{error:{code:known?error.code:'internal_error',message:known?error.message:'操作未完成，请检查运行状态后重试。'}});
      else res.end();
    }
  });
  server.requestTimeout=30000;server.headersTimeout=15000;
  return server;
}
