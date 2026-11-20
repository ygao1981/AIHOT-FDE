import os from 'node:os';
import { statfsSync, readFileSync, existsSync } from 'node:fs';
import { dirname } from 'node:path';
import { loadConfig, AppError } from '../src/config.mjs';
import { inspectCodex } from '../src/analysis.mjs';

export function preflight(config) {
  let diskPath=config.dataDir;while(!existsSync(diskPath)&&dirname(diskPath)!==diskPath)diskPath=dirname(diskPath);
  const disk=statfsSync(diskPath),freeDisk=Number(disk.bavail)*Number(disk.bsize);
  let availableMemory=os.freemem();
  try{const n=/^MemAvailable:\s+(\d+) kB$/m.exec(readFileSync('/proc/meminfo','utf8'));if(n)availableMemory=Number(n[1])*1024;}catch{}
  try{const max=readFileSync('/sys/fs/cgroup/memory.max','utf8').trim(),current=Number(readFileSync('/sys/fs/cgroup/memory.current','utf8'));if(max!=='max'&&Number.isFinite(Number(max)))availableMemory=Math.min(availableMemory,Math.max(0,Number(max)-current));}catch{}
  const gib=n=>Math.round(n/1024**3*100)/100;
  const [nodeMajor,nodeMinor,nodePatch]=process.versions.node.split('.').map(Number);
  const issues=[];
  if(nodeMajor!==24||nodeMinor<22||(nodeMinor===22&&nodePatch<1))issues.push('需要 Node.js 24.22.1 或更新的 24.x 版本。');
  if(freeDisk<2*1024**3)issues.push('资料目录所在磁盘可用空间不足 2 GiB，建议先清理或在本机试用。');
  const ramNeeded=(config.provider==='codex'?1024:768)*1024**2;
  if(availableMemory<ramNeeded)issues.push(`可用内存低于试运行建议值 ${config.provider==='codex'?'1 GiB':'768 MiB'}。`);
  if(config.accessToken.length<32)issues.push('尚未配置足够长度的登录口令，请运行 npm run init。');
  return {checkedAt:new Date().toISOString(),platform:os.platform(),architecture:os.arch(),node:process.version,
    cpuThreads:os.availableParallelism(),availableMemoryGiB:gib(availableMemory),availableDiskGiB:gib(freeDisk),diskPath,
    recommendation:issues.length?'resolve_before_trial':'eligible_for_small_trial',issues,
    note:'这是当前执行机器的只读预检，不是其他 VPS 的实测，也不保证运行峰值。',
    configuration:{provider:config.provider,collection:config.collectEnabled,analysis:config.analysisEnabled,autoAnalyze:config.autoAnalyze,dailyLimit:config.dailyLimit,monthlyBudgetUsd:config.monthlyBudgetUsd}};
}
try{
  const config=loadConfig(),report=preflight(config);
  if(process.argv.includes('--codex')) {
    report.codex=await inspectCodex(config);
    if(!report.codex.supported||!report.codex.authenticated)report.issues.push('Codex 参数或账号登录尚未就绪，请按部署文档核对。');
  }
  report.recommendation=report.issues.length?'resolve_before_trial':'eligible_for_small_trial';
  console.log(JSON.stringify(report,null,2));if(report.issues.length)process.exitCode=2;
}
catch(error){console.error(error instanceof AppError?error.message:'预检未完成，请检查配置和路径权限。');process.exitCode=1;}
