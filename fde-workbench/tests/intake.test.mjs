import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { spawn } from 'node:child_process';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { submitMaterial, getMaterialStatus, loadIntakeConfig, MAX_INTAKE_BYTES } from '../src/intake-client.mjs';

const token = 'fixture-intake-token-not-a-real-secret-12345';
const material = { url: 'https://example.com/fde-fixture', title: '虚构企业 AI 测试资料', body: '这是本地接口测试材料，不调用模型。' };
const article = { id: '00000000-0000-4000-8000-000000000001', status: 'candidate', analysis: null };
const json = (res, value, status = 200) => { res.writeHead(status, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(value)); };

async function app(t, handler) {
  const requests = [];
  const server = createServer(async (req, res) => {
    let body = '';
    for await (const chunk of req) body += chunk;
    const request = { path: req.url, method: req.method, auth: req.headers.authorization, body: body ? JSON.parse(body) : undefined };
    requests.push(request);
    handler(request, res);
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => new Promise(resolve => { server.close(resolve); server.closeAllConnections(); }));
  return { requests, config: { baseUrl: `http://127.0.0.1:${server.address().port}`, accessToken: token } };
}

test('default intake stores once; explicit analysis queues the returned ID without retry permission', async t => {
  const ctx = await app(t, (req, res) => json(res, req.path === '/api/import' ? { article, created: true } : { queued: true, cached: false }));
  assert.deepEqual(await submitMaterial(ctx.config, material), { imported: true, articleId: article.id, created: true, importStatus: 'candidate', stage: 'stored' });
  assert.equal(ctx.requests.length, 1);
  assert.deepEqual(ctx.requests[0], { path: '/api/import', method: 'POST', auth: `Bearer ${token}`, body: material });
  const result = await submitMaterial(ctx.config, material, { analyze: true });
  assert.equal(result.stage, 'queued');
  assert.equal(ctx.requests.length, 3);
  assert.equal(ctx.requests[2].path, `/api/articles/${article.id}/queue`);
  assert.deepEqual(ctx.requests[2].body, {});
});

test('queue refusal retains successful import and article ID, without exposing raw server messages', async t => {
  const ctx = await app(t, (req, res) => req.path === '/api/import'
    ? json(res, { article, created: false })
    : json(res, { error: { code: 'analysis_disabled', message: `secret ${token}` } }, 409));
  await assert.rejects(submitMaterial(ctx.config, material, { analyze: true }), error => {
    assert.equal(error.code, 'analysis_disabled');
    assert.equal(error.stage, 'queue');
    assert.equal(error.imported, true);
    assert.equal(error.articleId, article.id);
    assert.equal(error.created, false);
    assert.ok(!error.message.includes(token));
    return true;
  });
  assert.equal(ctx.requests.length, 2);
});

test('status only reads and cache response does not request another analysis', async t => {
  const ctx = await app(t, (req, res) => {
    if (req.method === 'GET') return json(res, { ...article, status: 'analyzed', analysis: { fixture: true }, body: 'private text' });
    if (req.path === '/api/import') return json(res, { article, created: false });
    return json(res, { queued: false, cached: true });
  });
  assert.deepEqual(await getMaterialStatus(ctx.config, article.id), { articleId: article.id, status: 'analyzed', analysisAvailable: true });
  assert.equal(ctx.requests.length, 1);
  assert.equal(ctx.requests[0].method, 'GET');
  assert.equal((await submitMaterial(ctx.config, material, { analyze: true })).stage, 'cached');
  assert.equal(ctx.requests.length, 3);
});

test('redirect never forwards credential to the destination', async t => {
  const target = await app(t, (req, res) => json(res, { article, created: true }));
  const source = await app(t, (req, res) => { res.writeHead(307, { Location: `${target.config.baseUrl}/api/import` }); res.end(); });
  await assert.rejects(submitMaterial(source.config, material), error => error.code === 'request_unconfirmed' && error.imported === null);
  assert.equal(source.requests.length, 1);
  assert.equal(target.requests.length, 0);
});

test('remote plaintext endpoints and oversized input are refused before sending credentials', async () => {
  let calls = 0;
  const fetchImpl = async () => { calls++; throw new Error(token); };
  for (const baseUrl of ['http://example.com', 'https://user:password@example.com', 'https://example.com/redirect?to=other'])
    await assert.rejects(submitMaterial({ baseUrl, accessToken: token }, material, { fetchImpl }), error => error.code === 'unsafe_endpoint' && error.imported === false);
  await assert.rejects(submitMaterial({ baseUrl: 'http://127.0.0.1:3210', accessToken: token }, { ...material, body: 'x'.repeat(MAX_INTAKE_BYTES) }, { fetchImpl }), error => error.code === 'input_too_large');
  assert.equal(calls, 0);
  assert.equal(loadIntakeConfig({ FDE_PORT: '3211', FDE_ACCESS_TOKEN: token }).baseUrl, 'http://127.0.0.1:3211');
});

test('unknown write outcome is never retried and oversized responses are bounded', async () => {
  const config = { baseUrl: 'http://127.0.0.1:3210', accessToken: token };
  let calls = 0;
  await assert.rejects(submitMaterial(config, material, { analyze: true, fetchImpl: async () => { calls++; throw new Error(`network ${token}`); } }), error => {
    assert.equal(error.code, 'request_unconfirmed');
    assert.equal(error.imported, null);
    assert.ok(!error.message.includes(token));
    return true;
  });
  assert.equal(calls, 1);
  let queueCalls = 0;
  await assert.rejects(submitMaterial(config, material, { analyze: true, fetchImpl: async () => {
    queueCalls++;
    if (queueCalls === 1) return Response.json({ article, created: true });
    throw new Error(`queue response lost ${token}`);
  } }), error => error.code === 'request_unconfirmed' && error.stage === 'queue' && error.imported === true && error.articleId === article.id);
  assert.equal(queueCalls, 2);
  for (const headers of [{}, { 'Content-Length': String(MAX_INTAKE_BYTES + 1) }]) {
    await assert.rejects(submitMaterial(config, material, { fetchImpl: async () => new Response('x'.repeat(MAX_INTAKE_BYTES + 1), { headers }) }), error => error.code === 'response_too_large');
  }
});

async function runCli(config, args, input) {
  const child = spawn(process.execPath, [fileURLToPath(new URL('../scripts/intake.mjs', import.meta.url)), ...args], {
    env: { ...process.env, FDE_BASE_URL: config.baseUrl, FDE_ACCESS_TOKEN: config.accessToken },
    stdio: ['pipe', 'pipe', 'pipe'], shell: false,
  });
  let stdout = '', stderr = '';
  child.stdout.on('data', chunk => { stdout += chunk; });
  child.stderr.on('data', chunk => { stderr += chunk; });
  child.stdin.end(input);
  const [code] = await once(child, 'close');
  return { code, stdout, stderr };
}

test('CLI accepts file and stdin, status is read only, failed queue returns a recoverable receipt', async t => {
  const ctx = await app(t, (req, res) => {
    if (req.method === 'GET') return json(res, article);
    if (req.path === '/api/import') return json(res, { article, created: false });
    return json(res, { error: { code: 'retry_confirmation', message: token } }, 409);
  });
  const directory = await mkdtemp(join(tmpdir(), 'fde-intake-test-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const path = join(directory, 'fixture.json');
  await writeFile(path, `\uFEFF${JSON.stringify(material)}`);
  const fromFile = await runCli(ctx.config, ['--file', path]);
  assert.equal(fromFile.code, 0);
  assert.equal(JSON.parse(fromFile.stdout).stage, 'stored');
  const fromStdin = await runCli(ctx.config, ['--file', '-', '--analyze'], JSON.stringify(material));
  assert.equal(fromStdin.code, 1);
  const error = JSON.parse(fromStdin.stderr);
  assert.equal(error.articleId, article.id);
  assert.equal(error.imported, true);
  assert.equal(error.stage, 'queue');
  assert.ok(!fromStdin.stderr.includes(token));
  const status = await runCli(ctx.config, ['--status', article.id]);
  assert.equal(status.code, 0);
  assert.equal(JSON.parse(status.stdout).status, 'candidate');
  assert.equal(ctx.requests.length, 4);
  const invalid = await runCli(ctx.config, ['--status', article.id, '--analyze']);
  assert.equal(invalid.code, 1);
  assert.equal(ctx.requests.length, 4);
});
