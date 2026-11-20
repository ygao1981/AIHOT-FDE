import { mkdirSync, writeFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { loadConfig, readSources, AppError } from '../src/config.mjs';
import { Store } from '../src/store.mjs';
import { toMarkdown } from '../src/analysis.mjs';

let store;
try{
  const config=loadConfig(),command=process.argv[2];
  if(!statSync(resolve(config.dataDir,'research.sqlite'),{throwIfNoEntry:false})?.isFile())
    throw new AppError('database_not_found','没有找到资料库，请核对 FDE_DATA_DIR 和运行方式；首次使用请先正常启动研究台。管理命令不会创建空库。');
  store=new Store(config.dataDir,readSources());
  if(command==='status')console.log(JSON.stringify(store.overview(config),null,2));
  else if(command==='pause'){store.setSetting('analysis_pause','已手动暂停。');console.log('已暂停新分析。');}
  else if(command==='resume'){store.setSetting('analysis_pause',null);console.log('已解除暂停；失败任务仍需人工确认重试。');}
  else if(command==='backup'){
    const directory=resolve(config.dataDir,'backups');mkdirSync(directory,{recursive:true,mode:0o700});
    const path=resolve(directory,`research-${new Date().toISOString().replace(/[:.]/g,'-')}.sqlite`);
    await store.backupTo(path);console.log(`数据库备份已完成：${path}`);
  }else if(command==='export'){
    const directory=resolve(config.dataDir,'exports');mkdirSync(directory,{recursive:true,mode:0o700});
    const path=resolve(directory,`fde-research-${new Date().toISOString().replace(/[:.]/g,'-')}.md`);
    const rows=store.exportRows();writeFileSync(path,rows.map(a=>toMarkdown(a.analysis,a)+(a.personalNotes?`\n\n## 我的笔记\n\n${a.personalNotes}\n`:'')).join('\n\n---\n\n'),{mode:0o600,flag:'wx'});
    console.log(`已导出 ${rows.length} 篇研究笔记：${path}`);
  }else throw new AppError('invalid_command','使用 status、pause、resume、backup 或 export。');
}catch(error){console.error(error instanceof AppError?error.message:'操作未能完成，请核对路径权限和运行状态。');process.exitCode=1;}
finally{store?.close();}
