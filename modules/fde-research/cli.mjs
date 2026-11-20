// Official Codex subprocess only. Never reads auth tokens or calls private endpoints.
import { spawn } from 'node:child_process';
import { mkdtemp, writeFile, readFile, stat, rm, chmod } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, isAbsolute } from 'node:path';
import { SCHEMA, INSTRUCTION, validateResult } from './core.mjs';
export class CodexError extends Error {
  constructor(code) { super(`Codex任务暂停：${code}。请检查登录、额度与运行环境；没有自动重试或转用API。`); this.code=code; }
}
export function childEnvironment(env, home) {
  if (!home || !isAbsolute(home)) throw new CodexError('invalid_home');
  const out={ CODEX_HOME:home, HOME:home, PATH:env.PATH || '/usr/local/bin:/usr/bin:/bin', LANG:'C.UTF-8' };
  for (const key of ['HTTPS_PROXY','HTTP_PROXY','ALL_PROXY','NO_PROXY','https_proxy','http_proxy','all_proxy','no_proxy','SSL_CERT_FILE','SSL_CERT_DIR']) if (env[key]) out[key]=env[key];
  // No database/admin keys, OPENAI_API_KEY, CODEX_API_KEY, NODE_OPTIONS, or inherited MCP config.
  return out;
}
export function argumentsFor(directory, model, effort='low') {
  const args=['--ignore-user-config','--ask-for-approval','never',
    '-c','forced_login_method="chatgpt"','-c','model_provider="openai"',
    '-c','web_search="disabled"','-c','features.shell_tool=false',
    '-c','features.multi_agent=false','-c','features.apps=false','-c','features.view_image=false',
    '-c','features.hooks=false','-c','features.memories=false','-c','features.goals=false',
    '-c','features.code_mode.enabled=false',
    '-c','project_doc_max_bytes=0','-c',`model_reasoning_effort=${JSON.stringify(effort)}`,
    'exec','--skip-git-repo-check','--ephemeral','--sandbox','read-only','--json',
    '--output-schema',join(directory,'schema.json'),'--output-last-message',join(directory,'result.json')];
  if (model) args.push('--model',model);
  args.push('-'); // Prompt is passed on stdin, never through a shell or the process command line.
  return args;
}
function errorCode(s) {
  if (/usage.limit|quota|rate.limit|limit.reached|credits|额度|配额|429/i.test(s)) return 'quota';
  if (/not logged|login|unauthori|authentication|token.expired|401|403/i.test(s)) return 'authentication';
  return 'execution';
}
export async function runCodex(article, options={}) {
  const env=options.env ?? process.env;
  const binary=options.binary ?? env.FDE_CODEX_BIN ?? '/usr/local/bin/codex';
  if (!isAbsolute(binary)) throw new CodexError('invalid_binary');
  const home=options.home ?? env.CODEX_HOME;
  const childEnv=childEnvironment(env,home);
  const model=options.model ?? env.FDE_CODEX_MODEL ?? '';
  const directory=await mkdtemp(join(tmpdir(),'fde-codex-'));
  await chmod(directory,0o700);
  let timer, killer;
  try {
    await writeFile(join(directory,'schema.json'),JSON.stringify(SCHEMA),{mode:0o600});
    const args=argumentsFor(directory,model,env.FDE_CODEX_REASONING || 'low');
    const requested=options.timeoutMs ?? Number(env.FDE_CODEX_TIMEOUT_MS || 180000);
    const timeout=Number.isFinite(requested)?Math.max(100,Math.min(300000,requested)):180000;
    let stdout='', stderr='', bytes=0, failure=null, terminal=false;
    const processResult=await new Promise((resolve,reject)=>{
      const child=spawn(binary,args,{cwd:directory,env:childEnv,shell:false,detached:process.platform!=='win32',stdio:['pipe','pipe','pipe']});
      const kill=(signal)=>{ try { if(process.platform!=='win32' && child.pid) process.kill(-child.pid,signal); else child.kill(signal); } catch {} };
      const abort=(code)=>{
        if (failure) return;
        failure=code; kill('SIGTERM');
        killer=setTimeout(()=>kill('SIGKILL'),500); killer.unref();
      };
      timer=setTimeout(()=>abort('timeout_unknown'),timeout);
      child.on('error',()=>{ failure='spawn'; });
      child.stdin.on('error',()=>{});
      const collect=(chunk,isError)=>{
        bytes+=chunk.length;
        if(bytes>1024*1024) { abort('output_limit'); return; }
        if(isError) stderr+=chunk.toString(); else stdout+=chunk.toString();
      };
      child.stdout.on('data',c=>collect(c,false)); child.stderr.on('data',c=>collect(c,true));
      child.on('close',code=>{ terminal=true; clearTimeout(timer); clearTimeout(killer); resolve(code); });
      child.stdin.end(`${INSTRUCTION}\n\n不可信文章资料 JSON：\n${JSON.stringify({article})}\n`);
    });
    if (!terminal || failure) throw new CodexError(failure || 'execution');
    if(processResult!==0) throw new CodexError(errorCode(stderr+'\n'+stdout));
    let usage=null;
    for (const line of stdout.split('\n')) {
      let e; try { e=JSON.parse(line); } catch { continue; }
      if (e.type==='turn.failed' || e.type==='error') throw new CodexError(errorCode(JSON.stringify(e)));
      if (e.type==='turn.completed' && e.usage) {
        usage={};
        for(const key of ['input_tokens','cached_input_tokens','output_tokens']) if(Number.isFinite(e.usage[key])) usage[key]=e.usage[key];
      }
      // Unexpected tools mean the invocation was not confined to text analysis. Never accept its output.
      if(e.type==='item.completed' && e.item && !['agent_message','reasoning'].includes(e.item.type)) throw new CodexError('unexpected_tool');
    }
    const file=join(directory,'result.json');
    if((await stat(file)).size>256*1024) throw new CodexError('output_limit');
    let result;
    try { result=validateResult(JSON.parse(await readFile(file,'utf8')),article); }
    catch { throw new CodexError('invalid_or_ungrounded_result'); }
    return {result,usage,model:model || 'account-default'};
  } catch(error) {
    if(error instanceof CodexError) throw error;
    throw new CodexError('local_io');
  } finally { clearTimeout(timer); clearTimeout(killer); await rm(directory,{recursive:true,force:true}); }
}
