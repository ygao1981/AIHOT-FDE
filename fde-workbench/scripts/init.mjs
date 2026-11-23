import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { randomBytes } from 'node:crypto';
import { ROOT } from '../src/config.mjs';

const path=resolve(ROOT,'.env');
if(existsSync(path))console.log('配置文件已存在，未覆盖。请检查 .env 中的登录口令和运行开关。');
else {
  const sample=readFileSync(resolve(ROOT,'.env.example'),'utf8');
  writeFileSync(path,sample.replace(/^FDE_ACCESS_TOKEN=$/m,`FDE_ACCESS_TOKEN=${randomBytes(32).toString('hex')}`),{flag:'wx',mode:0o600});
  mkdirSync(resolve(ROOT,'.data'),{recursive:true,mode:0o700});
  console.log('已创建私有配置 .env，采集和模型均关闭。登录口令保存在 FDE_ACCESS_TOKEN；请在自己的终端查看，不要发送到聊天或提交 Git。');
}
