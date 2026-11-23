import { createReadStream } from 'node:fs';
import { parseArgs } from 'node:util';
import { IntakeError, MAX_INTAKE_BYTES, loadIntakeConfig, submitMaterial, getMaterialStatus } from '../src/intake-client.mjs';

const HELP = `资料收录客户端（研究台须已启动）

npm run intake -- --file material.json          只收录，不请求模型分析
npm run intake -- --file -                     从标准输入读取 JSON
npm run intake -- --file material.json --analyze  收录后请求入队
npm run intake -- --status <article-id>         只查询状态

JSON 格式：{"url":"https://example.com/article","title":"可选标题","body":"可选正文"}
仅使用 FDE_BASE_URL / FDE_PORT 和 FDE_ACCESS_TOKEN 环境变量，或本目录 .env。
不接收口令参数；入队仍受研究台的开关、规则、暂停和预算限制。
失败不会自动重试。若输出 imported=true，请保留 articleId 并查询状态。`;

async function readInput(file) {
  const stream = file === '-' ? process.stdin : createReadStream(file);
  const chunks = [];
  let size = 0;
  try {
    for await (const chunk of stream) {
      size += chunk.byteLength;
      if (size > MAX_INTAKE_BYTES) throw new IntakeError('input_too_large', '资料 JSON 不能超过 1 MiB，请缩短正文。');
      chunks.push(chunk);
    }
  } catch (error) {
    if (error instanceof IntakeError) throw error;
    throw new IntakeError('input_unreadable', '无法读取资料，请检查文件位置和权限，或标准输入。');
  }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8').replace(/^\uFEFF/, '')); }
  catch { throw new IntakeError('invalid_json', '资料需要是 UTF-8 JSON 文件，请检查格式。'); }
}

try {
  let values;
  try { ({ values } = parseArgs({ options: { file: { type: 'string' }, analyze: { type: 'boolean', default: false }, status: { type: 'string' }, help: { type: 'boolean' } } })); }
  catch { throw new IntakeError('invalid_arguments', '命令参数无效，运行 npm run intake -- --help 查看用法。'); }
  if (values.help) console.log(HELP);
  else {
    if ((!values.file && !values.status) || (values.file && values.status) || (values.status && values.analyze))
      throw new IntakeError('invalid_arguments', '请选择 --file <文件|-> 或 --status <编号>；只有收录可以使用 --analyze。');
    const config = loadIntakeConfig();
    const result = values.status
      ? await getMaterialStatus(config, values.status)
      : await submitMaterial(config, await readInput(values.file), { analyze: values.analyze });
    console.log(JSON.stringify({ ok: true, ...result }));
  }
} catch (error) {
  const value = { ok: false, error: { code: error instanceof IntakeError ? error.code : 'client_error', message: error instanceof IntakeError ? error.message : '客户端未能完成，请检查输入和研究台状态。' } };
  if (error instanceof IntakeError) for (const key of ['stage', 'imported', 'articleId', 'created', 'importStatus', 'httpStatus']) if (error[key] !== undefined) value[key] = error[key];
  console.error(JSON.stringify(value));
  process.exitCode = 1;
}
