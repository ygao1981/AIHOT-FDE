import { mkdirSync, readFileSync, writeFileSync, unlinkSync } from 'node:fs';
import { resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { loadConfig, readSources, AppError } from './config.mjs';
import { Store } from './store.mjs';
import { Worker } from './worker.mjs';
import { createApp } from './server.mjs';
import { closeFetcher } from './fetch.mjs';

export function acquireLock(dataDir) {
  mkdirSync(dataDir,{recursive:true,mode:0o700});
  const file=resolve(dataDir,'workbench.lock'),owner=randomUUID();
  try{writeFileSync(file,JSON.stringify({pid:process.pid,owner}),{flag:'wx',mode:0o600});}
  catch(error){
    if(error.code!=='EEXIST')throw error;
    // Do not race another restarting process by unlinking a lock based on an old PID read.
    throw new AppError('already_running','运行锁已存在。请先确认没有旧研究台进程，再按运维文档处理专用 workbench.lock。');
  }
  return ()=>{try{if(JSON.parse(readFileSync(file,'utf8')).owner===owner)unlinkSync(file);}catch{}};
}
export async function start(config=loadConfig()) {
  const release=acquireLock(config.dataDir);let store,server,worker;
  try{
    store=new Store(config.dataDir,readSources());store.recoverInterrupted();
    worker=new Worker(store,config);server=createApp(store,worker,config);
    await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(config.port,config.host,resolve);});
    worker.start();
    console.log(`FDE 研究台已启动：${config.baseUrl}。采集${config.collectEnabled?'已开启':'关闭'}，分析${config.analysisEnabled?'已开启':'关闭'}。`);
    let stopping=false;
    const stop=async()=>{if(stopping)return;stopping=true;await new Promise(r=>server.close(r));await worker.stop();await closeFetcher();store.close();release();};
    return {server,store,worker,stop};
  }catch(error){server?.close();store?.close();release();throw error;}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href) {
  try{const app=await start();for(const signal of ['SIGINT','SIGTERM'])process.once(signal,()=>{void app.stop().then(()=>process.exit(0));});}
  catch(error){console.error(error instanceof AppError?error.message:'启动失败，请检查配置、文件权限和端口占用。');process.exitCode=1;}
}
