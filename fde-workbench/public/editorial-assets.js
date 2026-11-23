const encoder = new TextEncoder();
const MAX_FILE_BYTES = 16 * 1024 * 1024;
const MAX_PACKAGE_BYTES = 64 * 1024 * 1024;

const crcTable = new Uint32Array(256);
for (let index = 0; index < 256; index++) {
  let value = index;
  for (let bit = 0; bit < 8; bit++) value = value & 1 ? 0xEDB88320 ^ (value >>> 1) : value >>> 1;
  crcTable[index] = value >>> 0;
}
function crc32(bytes) {
  let value = 0xFFFFFFFF;
  for (const byte of bytes) value = crcTable[(value ^ byte) & 255] ^ (value >>> 8);
  return (value ^ 0xFFFFFFFF) >>> 0;
}
function toBytes(value) {
  if (typeof value === 'string') return encoder.encode(value);
  if (value instanceof Uint8Array) return value;
  if (value instanceof ArrayBuffer) return new Uint8Array(value);
  throw new Error('稿件包包含不能识别的文件内容。');
}
function safeFilename(name) {
  return typeof name === 'string' && name.length > 0 && name.length <= 240
    && !/[\\:\u0000-\u001F\u007F]/.test(name) && !name.startsWith('/')
    && name.split('/').every((part) => part !== '' && part !== '.' && part !== '..');
}

/** Dependency-free ZIP store encoding. All files remain local to the browser. */
export function buildZip(entries) {
  if (!Array.isArray(entries) || entries.length < 1 || entries.length > 64) throw new Error('稿件包的文件数量无效。');
  const names = new Set();
  let total = 0;
  const files = entries.map(({ name, data }) => {
    if (!safeFilename(name) || names.has(name)) throw new Error('稿件包包含重复或无效的文件名。');
    names.add(name);
    const bytes = toBytes(data), nameBytes = encoder.encode(name);
    if (bytes.byteLength > MAX_FILE_BYTES) throw new Error('单个文件过大，请减少配图尺寸后重试。');
    total += bytes.byteLength + nameBytes.length * 2 + 76;
    if (total + 22 > MAX_PACKAGE_BYTES) throw new Error('稿件包过大，请减少配图后重试。');
    return { bytes, nameBytes, crc: crc32(bytes), offset: 0 };
  });
  const localSize = files.reduce((sum, file) => sum + 30 + file.nameBytes.length + file.bytes.length, 0);
  const directorySize = files.reduce((sum, file) => sum + 46 + file.nameBytes.length, 0);
  const result = new Uint8Array(localSize + directorySize + 22);
  const view = new DataView(result.buffer);
  let offset = 0;
  for (const file of files) {
    file.offset = offset;
    view.setUint32(offset, 0x04034B50, true);
    view.setUint16(offset + 4, 20, true);
    view.setUint16(offset + 6, 0x0800, true); // UTF-8, stored without compression.
    view.setUint16(offset + 12, 0x0021, true); // Stable ZIP timestamp: 1980-01-01.
    view.setUint32(offset + 14, file.crc, true);
    view.setUint32(offset + 18, file.bytes.length, true);
    view.setUint32(offset + 22, file.bytes.length, true);
    view.setUint16(offset + 26, file.nameBytes.length, true);
    result.set(file.nameBytes, offset + 30);
    result.set(file.bytes, offset + 30 + file.nameBytes.length);
    offset += 30 + file.nameBytes.length + file.bytes.length;
  }
  for (const file of files) {
    view.setUint32(offset, 0x02014B50, true);
    view.setUint16(offset + 4, 20, true);
    view.setUint16(offset + 6, 20, true);
    view.setUint16(offset + 8, 0x0800, true);
    view.setUint16(offset + 14, 0x0021, true);
    view.setUint32(offset + 16, file.crc, true);
    view.setUint32(offset + 20, file.bytes.length, true);
    view.setUint32(offset + 24, file.bytes.length, true);
    view.setUint16(offset + 28, file.nameBytes.length, true);
    view.setUint32(offset + 42, file.offset, true);
    result.set(file.nameBytes, offset + 46);
    offset += 46 + file.nameBytes.length;
  }
  view.setUint32(offset, 0x06054B50, true);
  view.setUint16(offset + 8, files.length, true);
  view.setUint16(offset + 10, files.length, true);
  view.setUint32(offset + 12, directorySize, true);
  view.setUint32(offset + 16, localSize, true);
  return result;
}

function verifySvg(asset) {
  if (!Number.isInteger(asset.width) || !Number.isInteger(asset.height) || asset.width < 1 || asset.width > 1600
    || asset.height < 1 || asset.height > 4000 || typeof asset.svg !== 'string' || asset.svg.length > 100000
    || /<!DOCTYPE|<!ENTITY|<\?/i.test(asset.svg)) throw new Error('配图参数无效，请重新生成预览。');
  const document = new DOMParser().parseFromString(asset.svg, 'image/svg+xml');
  if (document.querySelector('parsererror') || document.documentElement.localName !== 'svg') throw new Error('配图格式无效。');
  const nodes = [...document.querySelectorAll('*')];
  if (nodes.length > 512) throw new Error('配图内容过大。');
  const numeric = new Set(['x', 'y', 'width', 'height', 'rx', 'font-size', 'font-weight']);
  for (const node of nodes) {
    if (!['svg', 'rect', 'text'].includes(node.localName) || node.namespaceURI !== 'http://www.w3.org/2000/svg')
      throw new Error('配图包含不支持的内容。');
    for (const attribute of node.attributes) {
      const { name, value } = attribute;
      if (numeric.has(name) && /^\d+(?:\.\d+)?$/.test(value) && Number(value) <= 5000) continue;
      if (name === 'fill' && /^#[0-9a-f]{6}$/i.test(value)) continue;
      if (name === 'font-family' && value === "'Noto Sans CJK SC', 'Microsoft YaHei', 'PingFang SC', sans-serif") continue;
      if (name === 'xmlns' && value === 'http://www.w3.org/2000/svg') continue;
      if (name === 'viewBox' && value === `0 0 ${asset.width} ${asset.height}`) continue;
      throw new Error('配图包含不支持的属性。');
    }
  }
  if (document.documentElement.getAttribute('width') !== String(asset.width)
    || document.documentElement.getAttribute('height') !== String(asset.height)) throw new Error('配图尺寸不一致。');
}

/** Only the fixed local SVG vocabulary is accepted; no remote image can be loaded. */
export async function rasterizeEditorialAsset(asset) {
  verifySvg(asset);
  await document.fonts?.ready;
  const image = new Image();
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => { image.src = ''; reject(new Error('本地配图转换超时，请重试下载。')); }, 15000);
    image.onload = () => { clearTimeout(timer); resolve(); };
    image.onerror = () => { clearTimeout(timer); reject(new Error('本地配图转换失败，请重试下载。')); };
    image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(asset.svg)}`;
  });
  const canvas = document.createElement('canvas');
  canvas.width = asset.width; canvas.height = asset.height;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('浏览器无法生成图片，请使用当前版本的 Edge 或 Chrome。');
  context.drawImage(image, 0, 0, asset.width, asset.height);
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
  canvas.width = 1; canvas.height = 1;
  if (!blob || blob.type !== 'image/png') throw new Error('PNG 图片生成失败，请重试下载。');
  return new Uint8Array(await blob.arrayBuffer());
}

function verifyRendered(rendered) {
  if (!rendered || !['text', 'illustrated'].includes(rendered.manifest?.variant) || !Array.isArray(rendered.assets)
    || rendered.assets.length > 4 || typeof rendered.html !== 'string' || typeof rendered.fragment !== 'string'
    || typeof rendered.plainText !== 'string' || typeof rendered.markdown !== 'string') throw new Error('请先保存草稿并更新预览。');
  if (rendered.manifest.variant === 'text' && rendered.assets.length) throw new Error('纯文字版不应包含配图。');
}

export function prepareEditorialPackage(rendered, companion) {
  verifyRendered(rendered);
  if (companion) {
    verifyRendered(companion);
    if (companion.manifest.variant === rendered.manifest.variant
      || ['draftId', 'revision', 'contentHash', 'fingerprint', 'theme'].some((key) => companion.manifest[key] !== rendered.manifest[key]))
      throw new Error('两种排版对应的草稿版本不一致，请更新预览后重新下载。');
  }
  const views = [rendered, ...(companion ? [companion] : [])];
  const illustrated = views.find((view) => view.manifest.variant === 'illustrated');
  const assets = illustrated?.assets ?? [];
  const manifest = { ...rendered.manifest, availableVariants: views.map((view) => view.manifest.variant),
    assets: illustrated?.manifest.assets ?? [],
    ...(companion ? { htmlFiles: { text: 'wechat-text.html', illustrated: 'wechat-illustrated.html' } } : {}),
  };
  const entries = [
    { name: 'article.txt', data: rendered.plainText },
    { name: 'article.md', data: illustrated?.markdown ?? rendered.markdown },
    { name: 'wechat.html', data: rendered.html },
    { name: 'manifest.json', data: JSON.stringify(manifest, null, 2) },
    { name: 'README.txt', data: [
      `${rendered.manifest.brand || '公众号草稿'} · 公众号草稿包`, '',
      '这是本地待审核草稿，没有上传或发布到微信公众号。',
      'article.txt 是纯文字内容；article.md 可继续编辑；wechat.html 是带内联样式的排版稿。',
      ...(companion ? ['wechat-text.html 是纯文字排版；wechat-illustrated.html 是同一篇正文的图文排版。wechat.html 保留当前选择的版本。'] : []),
      '请先核对事实、指标、部署阶段和来源，补充自己的真实判断。',
      assets.length ? '图文版：images 中是本机生成的 PNG。将正文复制到公众号编辑器后，需要逐张上传 PNG 并替换相应图片位置。不要依赖本地文件地址、SVG 或 data URL 自动保留。' : '纯文字版：在研究台点击“复制纯文字排版”，粘贴到公众号编辑器；也可打开 wechat.html 选中正文复制。',
      '要点卡是编辑整理的示意内容，不是原文配图或真实系统架构。',
      '正式发布前，请用公众号手机预览核对排版、图片、引用和长链接。',
      'manifest.json 记录来源与稿件版本，供自己追溯；它不需要放入公众号正文。',
    ].join('\n') },
  ];
  if (companion) for (const view of views) entries.push({ name: `wechat-${view.manifest.variant}.html`, data: view.html });
  return { entries, assets, manifest };
}

export async function downloadEditorialPackage(rendered, companion) {
  const { entries, assets } = prepareEditorialPackage(rendered, companion);
  for (const asset of assets) {
    if (!/^images\/(?:cover|point-[1-3])\.png$/.test(asset.filename)) throw new Error('配图文件名无效。');
    entries.push({ name: asset.filename, data: await rasterizeEditorialAsset(asset) });
  }
  const zip = buildZip(entries);
  const blob = new Blob([zip], { type: 'application/zip' });
  const url = URL.createObjectURL(blob);
  const title = Array.from(String(rendered.title || '公众号草稿').replace(/[\\/:*?"<>|\u0000-\u001F]/g, '_')).slice(0,70).join('');
  const filename = `${title}-${companion ? '双版本' : rendered.manifest.variant === 'illustrated' ? '图文版' : '纯文字版'}.zip`;
  const link = document.createElement('a');
  link.href = url; link.download = filename;
  document.body.append(link); link.click(); link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return { filename, files: entries.length, bytes: zip.length };
}

export async function copyEditorialText(rendered) {
  verifyRendered(rendered);
  if (rendered.manifest.variant !== 'text') throw new Error('复制排版请使用纯文字版；图文版请下载稿件包并上传 PNG。');
  if (navigator.clipboard?.write && typeof ClipboardItem === 'function') {
    try {
      await navigator.clipboard.write([new ClipboardItem({
        'text/html': new Blob([rendered.fragment], { type: 'text/html' }),
        'text/plain': new Blob([rendered.plainText], { type: 'text/plain' }),
      })]);
      return { format: 'html' };
    } catch { /* Local clipboard fallback preserves both supported formats. */ }
  }
  const staging = document.createElement('textarea');
  staging.value = rendered.plainText;
  staging.readOnly = true;
  staging.setAttribute('aria-label', '待复制的公众号正文');
  const previousFocus = document.activeElement;
  document.body.append(staging); staging.select();
  let withFormatting = false, copied = false;
  const onCopy = (event) => {
    if (!event.clipboardData) return;
    event.clipboardData.setData('text/html', rendered.fragment);
    event.clipboardData.setData('text/plain', rendered.plainText);
    event.preventDefault(); withFormatting = true;
  };
  document.addEventListener('copy', onCopy);
  try { copied = document.execCommand('copy'); } catch { copied = false; }
  finally { document.removeEventListener('copy', onCopy); staging.remove(); previousFocus?.focus?.(); }
  if (copied) return { format: withFormatting ? 'html' : 'text' };
  throw new Error('浏览器未允许复制。请下载稿件包，打开 wechat.html 后选中正文复制。');
}
