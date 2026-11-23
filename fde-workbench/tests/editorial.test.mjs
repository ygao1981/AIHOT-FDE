import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { body, analysis } from './helpers.mjs';
import { prepareEditorial, editorialFingerprint, validateEditorial, templateEditorial, runEditorial, estimateEditorialReservation } from '../src/editorial.mjs';

const config = { provider: 'api', model: 'fixture-model', reasoning: 'low', maxInputChars: 16000,
  maxOutputTokens: 2500, editorialMaxOutputTokens: 4500, timeoutMs: 3000,
  inputPrice: 0.1, outputPrice: 0.4, apiKey: 'fixture-not-a-real-key' };
function article(id = 'a') {
  return { id, title: '虚构的企业 AI 试验资料', url: `https://example.org/${id}`, sourceName: '虚构测试资料',
    body: body + ' PRIVATE_FULL_TEXT_MARKER', bodyHash: `body-${id}`, analysisKey: `analysis-${id}`,
    status: 'analyzed', editorialStatus: 'shortlisted', personalNotes: 'PRIVATE_NOTE_MARKER', analysis: analysis() };
}
const input = (spec = {}, c = config) => prepareEditorial([article()], spec, c);

test('editorial input reuses verified research and excludes full article bodies and private notes', () => {
  const value = input();
  assert.equal(value.sources[0].analysis.evidence[0].quote, '系统已在生产环境运行');
  assert.equal(value.sources[0].bodyHash, 'body-a');
  assert.equal(value.spec.profileVersion, 'banlixing-v1');
  assert.ok(!JSON.stringify(value).includes('PRIVATE_'));
  for (const change of [{ status: 'failed' }, { editorialStatus: 'archived' }, { analysisKey: '' },
    { analysis: analysis(), body: '引文已不存在' }, { analysis: { ...analysis(), evidence: [] } },
    { analysis: { ...analysis(), relevance: 'unrelated' } }]) {
    assert.throws(() => prepareEditorial([{ ...article(), ...change }], {}, config), /资料|引文/);
  }
  assert.throws(() => prepareEditorial([article(), article()], {}, config), /不同/);
  assert.throws(() => prepareEditorial([article()], { angle: '字'.repeat(801) }, config), /800/);
  assert.throws(() => prepareEditorial([article()], {}, { ...config, maxInputChars: 1 }), /上限/);
});

test('writing cache follows evidence and intent while formatting, secrets and prices are irrelevant', () => {
  const value = input();
  for (const override of [{ model: 'different' }, { provider: 'codex' }, { reasoning: 'high' },
    { timeoutMs: 2000 }, { editorialMaxOutputTokens: 5000 }, { maxInputChars: 8000 }]) {
    assert.notEqual(editorialFingerprint(value.sources, value.spec, { ...config, ...override }), value.fingerprint);
  }
  assert.equal(input({}, { ...config, theme: 'ink', apiKey: 'changed', inputPrice: 8 }).fingerprint, value.fingerprint);
  assert.notEqual(input({ angle: '交付边界' }).fingerprint, value.fingerprint);
  assert.notEqual(input({ format: 'brief' }).fingerprint, value.fingerprint);
  const revised = article(); revised.analysis.solution = '变更后的实施方法。';
  assert.notEqual(prepareEditorial([revised], {}, config).fingerprint, value.fingerprint);
  assert.equal(input({ mode: 'template' }, { ...config, provider: 'off' }).fingerprint,
    input({ mode: 'template' }, { ...config, model: 'another' }).fingerprint);
});

test('material drafts stay local and source references are checked without pretending to fact-check prose', () => {
  const value = input({ mode: 'template' }, { provider: 'off' });
  const draft = templateEditorial(value);
  assert.match(draft.caveats.join(' '), /素材稿|事实核查/);
  assert.equal(draft.sections[0].paragraphs[0].sources[0], 1);
  for (const mutate of [
    d => { d.lead.sources = []; }, d => { d.lead.sources = [2]; }, d => { d.sections = []; },
    d => { d.sections[0].paragraphs[0].extra = 'raw html'; },
    d => { d.takeaways[0].sources = [1, 1]; }, d => { d.title = '字'.repeat(81); },
  ]) {
    const copy = structuredClone(draft); mutate(copy);
    assert.throws(() => validateEditorial(copy, value), e => e.code === 'invalid_editorial' && e.status === 400);
  }
});

test('one writing request uses the existing restricted API transport and records real returned usage', async () => {
  const value = input({ angle: '解释权限和验收，不扩大原文结论。' }), draft = templateEditorial(value);
  let calls = 0, sent;
  const response = await runEditorial(config, value, { fetch: async (url, options) => {
    calls++; assert.equal(url, 'https://api.openai.com/v1/responses'); sent = JSON.parse(options.body);
    return new Response(JSON.stringify({ status: 'completed', model: config.model,
      output: [{ type: 'message', role: 'assistant', content: [{ type: 'output_text', text: JSON.stringify(draft) }] }],
      usage: { input_tokens: 1200, output_tokens: 500 } }), { headers: { 'content-type': 'application/json' } });
  } });
  assert.equal(calls, 1); assert.equal(sent.text.format.name, 'fde_editorial');
  assert.equal(sent.max_output_tokens, 4500); assert.deepEqual(sent.tools, []);
  assert.equal(sent.tool_choice, 'none'); assert.equal(sent.store, false);
  assert.ok(sent.instructions.includes('不编造')); assert.ok(!JSON.stringify(sent).includes('PRIVATE_'));
  assert.equal(response.usage.inputTokens, 1200); assert.equal(response.usage.outputTokens, 500);
  assert.ok(response.costUsd > 0);
  const reservation = estimateEditorialReservation(config, value);
  assert.ok(reservation > (4500 * config.outputPrice / 1e6));
  assert.equal(estimateEditorialReservation({ ...config, provider: 'codex' }, value), null);
});

test('invalid writing references keep consumed usage and are never silently repaired or retried', async () => {
  let calls = 0; const value = input(), bad = templateEditorial(value); bad.lead.sources = [3];
  await assert.rejects(runEditorial(config, value, { fetch: async () => {
    calls++;
    return new Response(JSON.stringify({ status: 'completed', output: [{ type: 'message', role: 'assistant',
      content: [{ type: 'output_text', text: JSON.stringify(bad) }] }], usage: { input_tokens: 300, output_tokens: 40 } }));
  } }), error => error.code === 'invalid_result' && error.mayHaveConsumed && error.usage.inputTokens === 300);
  assert.equal(calls, 1);
});

async function fakeCli(t, value, tool = false) {
  const dir = await mkdtemp(join(tmpdir(), 'fde-editorial-cli-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const pkg = join(dir, 'node_modules', '@openai', 'codex'), home = join(dir, 'auth'), inspection = join(dir, 'inspect.json');
  await mkdir(join(pkg, 'bin'), { recursive: true }); await mkdir(home);
  await writeFile(join(pkg, 'package.json'), JSON.stringify({ name: '@openai/codex', type: 'module', bin: { codex: 'bin/codex.js' } }));
  const entry = join(pkg, 'bin', 'codex.js');
  await writeFile(entry, `#!${process.execPath}\nimport {readFile,writeFile} from 'node:fs/promises';
const args=process.argv.slice(2);let input='';for await(const chunk of process.stdin)input+=chunk;
await writeFile(${JSON.stringify(inspection)},JSON.stringify({args,input,schema:JSON.parse(await readFile(args[args.indexOf('--output-schema')+1],'utf8'))}));
await writeFile(args[args.indexOf('--output-last-message')+1],${JSON.stringify(JSON.stringify(templateEditorial(value)))});
console.log(JSON.stringify({type:'item.completed',item:{type:${JSON.stringify(tool ? 'command_execution' : 'error')}}}));
console.log(JSON.stringify({type:'turn.completed',usage:{input_tokens:100,output_tokens:80}}));`, { mode: 0o700 });
  let binary = entry;
  if (process.platform === 'win32') { binary = join(dir, 'codex.cmd'); await writeFile(binary, '@exit /b 91\r\n'); }
  return { inspection, config: { ...config, provider: 'codex', codexBin: binary, codexHome: home } };
}

test('writing uses the same isolated CLI schema, nonterminal notices and tool rejection', async t => {
  const value = input(); const fake = await fakeCli(t, value);
  const result = await runEditorial(fake.config, value);
  assert.equal(result.costUsd, null); assert.equal(result.usage.outputTokens, 80);
  const inspect = JSON.parse(await readFile(fake.inspection, 'utf8'));
  assert.equal(inspect.schema.properties.title.maxLength, 80);
  assert.ok(inspect.args.includes('--ignore-user-config'));
  assert.equal(inspect.args[inspect.args.indexOf('--sandbox') + 1], 'read-only');
  assert.ok(inspect.args.includes('features.image_generation=false'));
  assert.ok(!inspect.input.includes('PRIVATE_'));
  const malicious = await fakeCli(t, value, true);
  await assert.rejects(runEditorial(malicious.config, value), e => e.code === 'unexpected_tool' && e.mayHaveConsumed);
});
