import { readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { ROOT, readSources, loadConfig } from '../src/config.mjs';

const files=[];
for(const dir of ['src','scripts','public','tests','qa'])for(const name of readdirSync(resolve(ROOT,dir)))if(/\.(mjs|js)$/.test(name))files.push(resolve(ROOT,dir,name));
let failed=false;
for(const file of files){const r=spawnSync(process.execPath,['--check',file],{encoding:'utf8'});if(r.status!==0){console.error(r.stderr);failed=true;}}
readSources();loadConfig({});
if(failed)process.exitCode=1;else console.log(`语法检查通过：${files.length} 个文件；配置和信源目录有效。`);
