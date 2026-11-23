import test from 'node:test';
import assert from 'node:assert/strict';
import { parseHTML, DOMParser } from 'linkedom';
import { renderEditorial } from '../src/editorial-render.mjs';
import { buildZip, prepareEditorialPackage } from '../public/editorial-assets.js';
import { EDITORIAL_PROFILE, validateEditorial } from '../src/editorial.mjs';

function draft() {
  return {
    id: 'fixture-draft', revision: 2, fingerprint: 'fixture-fingerprint', status: 'ready', spec: { mode: 'model', profileVersion: 'fixture-style', promptHash: 'fixture-prompt' },
    sources: [{ id: 1, articleId: 'fixture-article', title: '虚构测试资料', sourceName: '测试来源', publishedAt: '2026-01-01', url: 'https://example.com/test?a=1&b=2', bodyHash: 'fixture-hash', analysisKey: 'fixture-analysis' }],
    result: {
      title: '先把业务确认留在流程里',
      lead: { text: '测试案例保留了人工确认。', kind: 'source', sources: [1] },
      sections: [{ heading: '落地时先想清楚', paragraphs: [
        { text: '上线范围是部分业务。', kind: 'source', sources: [1] },
        { text: '这提醒我们关注审核边界。', kind: 'interpretation', sources: [1] },
        { text: '可以先准备自己的验收清单。', kind: 'suggestion', sources: [] },
      ] }],
      takeaways: [{ text: '保留人工确认步骤。', sources: [1] }],
      caveats: ['原文没有给出完整成本数据。'],
    },
  };
}

test('editorial views preserve the same sourced article and only illustrated view adds local assets', () => {
  const source = draft(), before = JSON.stringify(source);
  const text = renderEditorial(source), images = renderEditorial(source, { variant: 'illustrated', theme: 'ink' });
  assert.equal(text.plainText, images.plainText);
  assert.equal(text.manifest.contentHash, images.manifest.contentHash);
  assert.equal(text.assets.length, 0);
  assert.equal(parseHTML(text.html).document.querySelectorAll('img').length, 0);
  assert.equal(images.assets.length, 2);
  assert.deepEqual([...parseHTML(images.html).document.querySelectorAll('img')].map((img) => img.getAttribute('src')), ['images/cover.png', 'images/point-1.png']);
  assert.ok([...parseHTML(images.previewHtml).document.querySelectorAll('img')].every((img) => img.getAttribute('src').startsWith('data:image/svg+xml;base64,')));
  assert.match(text.plainText, /编辑判断：这提醒我们关注审核边界。 \[1\]/);
  assert.match(text.plainText, /实践建议：可以先准备自己的验收清单。/);
  assert.match(text.plainText, /https:\/\/example.com\/test\?a=1&b=2/);
  assert.equal(JSON.stringify(source), before);
});

test('draft content is escaped as text, with no scripts, external images, active links, or raw SVG input', () => {
  const source = draft();
  source.result.title = '<script>alert("x")</script>';
  source.result.lead.text = '<img src="https://tracking.invalid/x" onerror="alert(1)">';
  source.result.takeaways[0].text = 'A & B <svg onload="alert(1)">';
  source.sources[0].url = 'javascript:alert(1)';
  const output = renderEditorial(source, { variant: 'illustrated' });
  const { document } = parseHTML(output.previewHtml);
  assert.equal(document.querySelector('script, iframe, a, style'), null);
  assert.equal(document.querySelector('h1').textContent, source.result.title);
  assert.equal(document.querySelector('[onerror], [onload]'), null);
  assert.ok([...document.querySelectorAll('img')].every((img) => img.src.startsWith('data:')));
  assert.equal(output.manifest.sources[0].url, '');
  for (const asset of output.assets) {
    const xml = new DOMParser().parseFromString(asset.svg, 'image/svg+xml');
    assert.equal(xml.querySelector('script, image, foreignObject'), null);
    assert.equal(xml.querySelector('[onerror], [onload]'), null);
    assert.ok([...xml.querySelectorAll('*')].every((node) => ['svg', 'rect', 'text'].includes(node.localName)));
  }
  assert.ok(new DOMParser().parseFromString(output.assets[1].svg, 'image/svg+xml').documentElement.textContent.includes(source.result.takeaways[0].text));
});

test('long CJK and identifier text survives card wrapping without ellipsis or clipping the final line', () => {
  const source = draft();
  source.result.title = '所有业务边界都应保留在正式验收说明中'.repeat(4);
  const text = '中文要点包含完整限制，'.repeat(13) + 'VeryLongIdentifierWithoutSpaces123456789😀最后一句。';
  source.result.takeaways[0].text = text;
  const output = renderEditorial(source, { variant: 'illustrated' });
  for (const [index, original] of [[0, source.result.title], [1, text]]) {
    const asset = output.assets[index];
    const xml = new DOMParser().parseFromString(asset.svg, 'image/svg+xml');
    const content = [...xml.querySelectorAll('text')].map((node) => node.textContent).join('');
    assert.ok(content.includes(original), 'all source graphemes are retained across lines');
    assert.ok([...xml.querySelectorAll('text')].every((node) => Number(node.getAttribute('y')) < asset.height - 15));
    assert.ok(!content.includes('…'));
  }
});

test('material template is visibly marked, and unfinished/unsupported views cannot be exported', () => {
  const source = draft(); source.spec.mode = 'template';
  const output = renderEditorial(source);
  assert.match(output.plainText, /素材整理稿/);
  assert.match(output.html, /素材整理稿/);
  assert.throws(() => renderEditorial({ ...source, status: 'unknown' }), (error) => error.code === 'editorial_not_ready');
  assert.throws(() => renderEditorial(source, { theme: '<script>' }), (error) => error.code === 'invalid_editorial_view');
});

test('ZIP contains real UTF-8 file records, accurate CRC, binary bytes, and central directory offsets', () => {
  const data = new Uint8Array([0, 1, 128, 255]);
  const zip = buildZip([{ name: '正文.txt', data: '123456789' }, { name: 'images/cover.png', data }]);
  const view = new DataView(zip.buffer), decoder = new TextDecoder();
  let offset = 0;
  const offsets = [];
  for (const expected of [{ name: '正文.txt', bytes: new TextEncoder().encode('123456789') }, { name: 'images/cover.png', bytes: data }]) {
    offsets.push(offset);
    assert.equal(view.getUint32(offset, true), 0x04034B50);
    assert.equal(view.getUint16(offset + 6, true), 0x0800);
    const size = view.getUint32(offset + 18, true), nameLength = view.getUint16(offset + 26, true);
    assert.equal(decoder.decode(zip.subarray(offset + 30, offset + 30 + nameLength)), expected.name);
    assert.deepEqual(zip.subarray(offset + 30 + nameLength, offset + 30 + nameLength + size), expected.bytes);
    if (offset === 0) assert.equal(view.getUint32(14, true), 0xCBF43926);
    offset += 30 + nameLength + size;
  }
  const directoryStart = offset;
  for (const localOffset of offsets) {
    assert.equal(view.getUint32(offset, true), 0x02014B50);
    assert.equal(view.getUint32(offset + 42, true), localOffset);
    offset += 46 + view.getUint16(offset + 28, true);
  }
  assert.equal(view.getUint32(offset, true), 0x06054B50);
  assert.equal(view.getUint16(offset + 10, true), 2);
  assert.equal(view.getUint32(offset + 16, true), directoryStart);
  assert.equal(offset + 22, zip.length);
});

test('ZIP rejects traversal, absolute paths, duplicate files and oversized payloads', () => {
  for (const name of ['../x', '/x', 'a/../../x', 'C:\\x', 'a//b', 'a\\b', 'a\u0000b']) assert.throws(() => buildZip([{ name, data: '' }]));
  assert.throws(() => buildZip([{ name: 'x', data: '' }, { name: 'x', data: '' }]));
  assert.throws(() => buildZip([{ name: 'x', data: new Uint8Array(16 * 1024 * 1024 + 1) }]));
});

test('paired package preserves both renderings and version provenance, and rejects mixed revisions', () => {
  const source = draft(), text = renderEditorial(source), images = renderEditorial(source, { variant: 'illustrated' });
  const { entries, assets, manifest } = prepareEditorialPackage(text, images);
  const files = Object.fromEntries(entries.map((entry) => [entry.name, entry.data]));
  assert.equal(files['wechat-text.html'], text.html);
  assert.equal(files['wechat-illustrated.html'], images.html);
  assert.equal(files['article.txt'], text.plainText);
  assert.equal(assets.length, images.assets.length);
  assert.deepEqual(manifest.availableVariants, ['text', 'illustrated']);
  assert.equal(manifest.brand, EDITORIAL_PROFILE.brand);
  assert.equal(manifest.fingerprint, source.fingerprint);
  assert.equal(manifest.profileVersion, source.spec.profileVersion);
  assert.equal(manifest.promptHash, source.spec.promptHash);
  assert.equal(manifest.sources[0].analysisKey, source.sources[0].analysisKey);
  assert.throws(() => prepareEditorialPackage(text, renderEditorial({ ...source, revision: 3 }, { variant: 'illustrated' })), /版本不一致/);
  assert.throws(() => prepareEditorialPackage(text, renderEditorial(source, { variant: 'illustrated', theme: 'ink' })), /版本不一致/);
});

test('legal newline-heavy cards stay within raster limits without dropping their words', () => {
  const source = draft();
  source.result.title = '题\n'.repeat(39) + '题';
  source.result.takeaways[0].text = '字\n'.repeat(89) + '字';
  source.result = validateEditorial(source.result, source);
  const output = renderEditorial(source, { variant: 'illustrated' });
  for (const [index, value] of [[0, source.result.title], [1, source.result.takeaways[0].text]]) {
    const asset = output.assets[index];
    assert.ok(asset.height <= 4000);
    const xml = new DOMParser().parseFromString(asset.svg, 'image/svg+xml');
    const text = [...xml.querySelectorAll('text')].map((node) => node.textContent).join('');
    assert.ok(text.replace(/\s+/gu, '').includes(value.replace(/\s+/gu, '')));
  }
  assert.ok(output.plainText.includes(source.result.takeaways[0].text));
});
