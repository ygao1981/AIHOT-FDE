// Optional browser acceptance, using only a fictional draft and local routes.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve, join, isAbsolute } from 'node:path';
import { pathToFileURL } from 'node:url';
import { renderEditorial } from '../src/editorial-render.mjs';

const parent = resolve(process.env.FDE_QA_OUTPUT_DIR || tmpdir());
mkdirSync(parent, { recursive: true });
const outputDir = mkdtempSync(join(parent, 'fde-editorial-assets-'));
const report = { status: 'running', modelCalls: 0, externalRequests: [], passed: [], outputDir,
  limitations: ['仅测试虚构资料，不代表微信公众号编辑器或用户 Windows 已验收。'] };
const source = { id: 'fictional-editorial', revision: 1, status: 'ready', spec: { mode: 'template' },
  sources: [{ id: 1, articleId: 'fictional-source', title: '界面测试资料：虚构的售后知识检索试点', sourceName: '虚构样例', url: 'https://example.org/fictional', publishedAt: '2026-01-01' }],
  result: { title: '先让员工找到原文，再讨论自动回答',
    lead: { text: '这是一份虚构的产品验收样例。试点里，业务人员先找到授权文档，再核对回答依据。', kind: 'source', sources: [1] },
    sections: [{ heading: '一次可追溯的回答，留下了什么', paragraphs: [
      { text: '虚构样例只覆盖小范围试点，没有生产上线或量化效果的证据。', kind: 'source', sources: [1] },
      { text: '从这个试点出发，可以先检查文档权限、原文定位和人工确认是否连得起来。', kind: 'interpretation', sources: [1] },
      { text: '把业务边界列入自己的验收清单，再讨论能否扩大使用范围。', kind: 'suggestion', sources: [] },
    ] }], takeaways: [{ text: '把原文、适用范围和人工确认放在同一次验收里。', sources: [1] }, { text: '只陈述资料已经披露的阶段与效果；缺少的数据保持为空，不用推测补齐。', sources: [1] }],
    caveats: ['样例仅用于界面验收，不能作为真实企业案例对外传播。'] },
};
const moduleSource = readFileSync(new URL('../public/editorial-assets.js', import.meta.url), 'utf8');
const rendered = renderEditorial(source, { variant: 'illustrated' });
const plain = renderEditorial(source);
const server = createServer((req, res) => {
  const url = new URL(req.url, 'http://fixture.invalid');
  res.setHeader('Content-Security-Policy', "default-src 'none'; script-src 'self'; img-src data:; style-src 'unsafe-inline'; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'");
  if (url.pathname === '/assets.js') { res.setHeader('Content-Type', 'text/javascript'); res.end(moduleSource); }
  else if (url.pathname === '/data') { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify({ rendered, plain })); }
  else if (url.pathname === '/preview') { res.setHeader('Content-Type', 'text/html; charset=utf-8'); res.end(renderEditorial(source, { variant: 'illustrated', theme: url.searchParams.get('theme') || 'paper' }).previewHtml); }
  else { res.setHeader('Content-Type', 'text/html; charset=utf-8'); res.end('<!doctype html><html lang="zh-CN"><title>本地配图验收</title><button id="download">下载</button><button id="copy">复制</button></html>'); }
});
let browser;
try {
  const modulePath = process.env.FDE_QA_PLAYWRIGHT_PATH;
  if (!modulePath || !isAbsolute(modulePath)) throw new Error('请按 qa/README.md 配置 FDE_QA_PLAYWRIGHT_PATH。');
  const { chromium } = await import(pathToFileURL(modulePath));
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  browser = await chromium.launch({ executablePath: process.env.FDE_QA_BROWSER_PATH || chromium.executablePath(), headless: true });
  const context = await browser.newContext({ acceptDownloads: true, viewport: { width: 1080, height: 900 }, locale: 'zh-CN' });
  await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin });
  await context.route('**/*', (route) => {
    const url = route.request().url();
    if (new URL(url).origin !== origin) { report.externalRequests.push(url); return route.abort(); }
    return route.continue();
  });
  const page = await context.newPage();
  const errors = []; page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(origin);
  await page.evaluate(async () => {
    const api = await import('/assets.js'), data = await (await fetch('/data')).json();
    window.fixtureData = data; window.fixtureApi = api;
    document.querySelector('#download').onclick = () => api.downloadEditorialPackage(data.rendered, data.plain);
    document.querySelector('#copy').onclick = () => api.copyEditorialText(data.plain);
  });
  const [download] = await Promise.all([page.waitForEvent('download'), page.locator('#download').click()]);
  const zipPath = join(outputDir, 'fictional-illustrated.zip'); await download.saveAs(zipPath);
  const bytes = readFileSync(zipPath); const files = new Map(); let offset = 0;
  while (bytes.readUInt32LE(offset) === 0x04034B50) {
    const length = bytes.readUInt32LE(offset + 18), nameLength = bytes.readUInt16LE(offset + 26), extraLength = bytes.readUInt16LE(offset + 28);
    const name = bytes.subarray(offset + 30, offset + 30 + nameLength).toString('utf8');
    const start = offset + 30 + nameLength + extraLength;
    files.set(name, bytes.subarray(start, start + length)); offset = start + length;
  }
  assert.equal(files.size, 10);
  assert.ok(files.has('wechat-text.html')); assert.ok(files.has('wechat-illustrated.html'));
  for (const asset of rendered.assets) {
    const png = files.get(asset.filename);
    assert.deepEqual([...png.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
    assert.equal(png.readUInt32BE(16), asset.width); assert.equal(png.readUInt32BE(20), asset.height);
    writeFileSync(join(outputDir, asset.filename.replace('images/', '')), png);
  }
  assert.equal(files.get('article.txt').toString('utf8'), plain.plainText);
  assert.equal(JSON.parse(files.get('manifest.json')).assets.length, 3);
  report.passed.push('实际 SVG→PNG、ZIP 下载、PNG 尺寸与正文一致');
  await page.locator('#copy').click();
  await page.waitForFunction(async () => (await navigator.clipboard.readText()).includes('先让员工找到原文'));
  const copied = await page.evaluate(async () => {
    const items = await navigator.clipboard.read();
    return { text: await navigator.clipboard.readText(), types: items.flatMap((item) => item.types) };
  });
  assert.equal(copied.text.replaceAll('\r\n','\n'), plain.plainText);
  assert.ok(copied.types.includes('text/html'));
  report.passed.push('剪贴板同时包含纯文本与带样式的 HTML');
  const blocked = await page.evaluate(async () => {
    const asset = window.fixtureData.rendered.assets[0]; let rejected = 0;
    for (const svg of [asset.svg.replace('</svg>', '<image href="https://tracking.invalid/x"/></svg>'), '<?xml-stylesheet href="https://tracking.invalid/x"?>' + asset.svg]) {
      try { await window.fixtureApi.rasterizeEditorialAsset({ ...asset, svg }); } catch { rejected++; }
    }
    return rejected;
  });
  assert.equal(blocked, 2); assert.deepEqual(report.externalRequests, []);
  report.passed.push('含远程资源与 XML 样式指令的伪造 SVG 在转换前拒绝');
  for (const theme of ['paper', 'ink']) {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`${origin}/preview?theme=${theme}`);
    await page.locator('img').last().waitFor();
    await page.waitForFunction(() => [...document.images].every((image) => image.complete && image.naturalWidth > 0));
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true);
    await page.screenshot({ path: join(outputDir, `${theme}-mobile.png`), fullPage: true });
  }
  assert.deepEqual(errors, []);
  report.passed.push('纸色、暗卡主题在 390px 手机宽度无横向溢出');
  report.status = 'passed';
} catch (error) { report.status = 'failed'; report.error = error.message; process.exitCode = 1; }
finally {
  await browser?.close();
  if (server.listening) await new Promise((resolve) => server.close(resolve));
  writeFileSync(join(outputDir, 'report.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
}
