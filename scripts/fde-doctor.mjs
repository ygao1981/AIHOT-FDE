// Run in the worker container as the same user that will analyze articles. No model usage.
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { access } from 'node:fs/promises';
import { constants } from 'node:fs';
import { childEnvironment } from '../modules/fde-research/cli.mjs';
const run=promisify(execFile);const binary=process.env.FDE_CODEX_BIN||'/usr/local/bin/codex';
let ok=true;
function check(name,pass){console.log(`${pass?'通过':'未通过'}：${name}`);if(!pass)ok=false;}
check('通用模型API已关闭',process.env.MODEL_CALLS_ENABLED!=='true');
try {
 const env=childEnvironment(process.env,process.env.CODEX_HOME);
 await access(env.CODEX_HOME,constants.R_OK|constants.W_OK);
 check('独立Codex目录可读写',true);
 const version=await run(binary,['--version'],{env,timeout:10000});
 console.log('CLI版本：'+version.stdout.trim().slice(0,80));
 const help=await run(binary,['exec','--help'],{env,timeout:10000});
 check('CLI支持结构化输出和临时会话',['--output-schema','--output-last-message','--ephemeral','--skip-git-repo-check'].every(s=>help.stdout.includes(s)));
 const top=await run(binary,['--help'],{env,timeout:10000});
 check('CLI支持忽略用户配置',top.stdout.includes('--ignore-user-config'));
 const login=await run(binary,['--ignore-user-config','-c','forced_login_method="chatgpt"','login','status'],{env,timeout:15000});
 check('CLI已使用ChatGPT登录',/chatgpt/i.test(login.stdout+' '+login.stderr));
} catch {check('Codex运行及登录检查（核对安装路径、目录权限和设备码登录）',false);}
process.exitCode=ok?0:1;
