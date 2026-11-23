import { createHash } from 'node:crypto';
import { AppError } from './config.mjs';
import { EDITORIAL_PROFILE } from './editorial.mjs';

const BRAND = EDITORIAL_PROFILE.brand;
const FONT = "'Noto Sans CJK SC', 'Microsoft YaHei', 'PingFang SC', sans-serif";
const THEMES = {
  paper: { accent: '#B85B36', panel: '#F6F1E8', panelText: '#342E29', muted: '#77685C', line: '#E5DBCD' },
  ink: { accent: '#BE623C', panel: '#202B36', panelText: '#FFF9EF', muted: '#D5DCE2', line: '#46535E' },
};
const KIND_LABELS = { source: '', interpretation: '编辑判断', suggestion: '实践建议' };
const CLOSING_PUNCTUATION = new Set('。，、；：！？）》】」』〕〉”’…,.!?;:)]}');
const escape = (value) => String(value ?? '').toWellFormed().replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '')
  .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;');
const refs = (paragraph) => paragraph.sources?.length ? ` [${paragraph.sources.join('、')}]` : '';
const paragraphText = (paragraph) => `${KIND_LABELS[paragraph.kind] ? `${KIND_LABELS[paragraph.kind]}：` : ''}${paragraph.text}${refs(paragraph)}`;
const markdownText = (value) => String(value).replaceAll('\\', '\\\\').replace(/[\[\]`*_<>#!|]/g, '\\$&');

function sourceUrl(value) {
  try {
    const url = new URL(value);
    return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password ? url.href : '';
  } catch { return ''; }
}

function checkedResult(draft) {
  const value = draft?.result;
  if (!value || !['ready'].includes(draft.status ?? 'ready'))
    throw new AppError('editorial_not_ready', '这份草稿还没有完成，暂时不能排版。', 409);
  if (typeof value.title !== 'string' || value.title.length > 160 || !value.lead || !Array.isArray(value.sections)
    || !Array.isArray(value.takeaways) || !Array.isArray(value.caveats) || !Array.isArray(draft.sources))
    throw new AppError('invalid_editorial', '草稿内容不完整，请重新打开草稿后再试。');
  return value;
}

// Conservative character widths avoid depending on a server font or clipping text.
// Cards normalize whitespace only; the exported prose keeps its original breaks.
// No words or identifiers are shortened to make them fit.
function wrapText(value, width, fontSize) {
  const lines = [];
  const segmenter = new Intl.Segmenter('zh', { granularity: 'grapheme' });
  for (const paragraph of [String(value).replace(/\s+/gu, ' ').trim()]) {
    let line = '', used = 0;
    const segments = [...segmenter.segment(paragraph)].map(({ segment }) => {
      const units = /^\s+$/u.test(segment) ? 0.4 : /^[ilI.,:;'!|]$/.test(segment) ? 0.5
        : /^[MWmw@%#&]$/.test(segment) ? 1.15 : /^[A-Za-z0-9_-]$/.test(segment) ? 0.85 : 1.15;
      return { segment, width: units * fontSize };
    });
    for (let index = 0; index < segments.length; index++) {
      const { segment, width: next } = segments[index];
      let closingWidth = 0;
      for (let look = index + 1; look < segments.length && CLOSING_PUNCTUATION.has(segments[look].segment); look++)
        closingWidth += segments[look].width;
      // Keep closing punctuation with the preceding text, without exceeding the card width.
      const reserve = next + closingWidth <= width ? closingWidth : 0;
      if (line && used + next + reserve > width) { lines.push(line); line = ''; used = 0; }
      line += segment; used += next;
    }
    lines.push(line);
  }
  return lines;
}

function svgText(lines, { x = 72, y, size, color, weight = 400, lineHeight = Math.ceil(size * 1.5) }) {
  return lines.map((line, index) => `<text x="${x}" y="${y + index * lineHeight}" font-family="${escape(FONT)}" font-size="${size}" font-weight="${weight}" fill="${color}">${escape(line)}</text>`).join('');
}

function svgDocument(width, height, color, content) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><rect x="0" y="0" width="${width}" height="${height}" fill="${color}"/>${content}</svg>`;
}

function makeAssets(result, theme, sourceCount) {
  const width = 1080;
  const titleLines = wrapText(result.title, width - 160, 56);
  const coverHeight = Math.max(610, 335 + titleLines.length * 84);
  const coverCaption = '原创封面 · 根据所选资料编辑整理，非原文配图';
  const assets = [{
    id: 'cover', filename: 'images/cover.png', width, height: coverHeight, caption: coverCaption,
    svg: svgDocument(width, coverHeight, theme.panel,
      `<rect x="72" y="64" width="48" height="5" fill="${theme.accent}"/>`
      + svgText([BRAND], { y: 111, size: 25, color: theme.muted })
      + svgText(titleLines, { y: 215, size: 56, color: theme.panelText, weight: 700, lineHeight: 84 })
      + svgText([`企业 AI 落地研究 · 基于 ${sourceCount} 篇资料`, '资料中的经验，落到自己的判断里。'], { y: coverHeight - 106, size: 25, color: theme.muted, lineHeight: 42 })),
  }];
  result.takeaways.forEach((point, index) => {
    const lines = wrapText(point.text, width - 160, 38);
    const height = Math.max(380, 218 + lines.length * 58);
    const caption = `要点 ${index + 1} · 编辑整理${refs(point)}，非原文配图`;
    assets.push({
      id: `point-${index + 1}`, filename: `images/point-${index + 1}.png`, width, height, caption,
      svg: svgDocument(width, height, theme.panel,
        `<rect x="72" y="56" width="48" height="5" fill="${theme.accent}"/>`
        + svgText([`研究要点 / ${String(index + 1).padStart(2, '0')}`], { y: 103, size: 25, color: theme.muted })
        + svgText(lines, { y: 174, size: 38, color: theme.panelText, weight: 600, lineHeight: 58 })
        + svgText([`编辑整理${refs(point)} · ${BRAND}`], { y: height - 50, size: 23, color: theme.muted })),
    });
  });
  return assets;
}

function wrapDocument(title, fragment) {
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="referrer" content="no-referrer"><title>${escape(title)}</title></head><body style="margin:0;background:#FFFFFF;">${fragment}</body></html>`;
}

/** Format an already saved draft. This module has no model or network operations. */
export function renderEditorial(draft, { variant = 'text', theme = 'paper' } = {}) {
  if (!['text', 'illustrated'].includes(variant) || !Object.hasOwn(THEMES, theme))
    throw new AppError('invalid_editorial_view', '请选择纯文字版或图文版，以及现有的排版样式。');
  const result = checkedResult(draft);
  const colors = THEMES[theme];
  const sources = draft.sources.map((source) => ({
    id: source.id, title: String(source.title ?? ''), url: sourceUrl(source.url),
    sourceName: String(source.sourceName ?? ''), publishedAt: source.publishedAt ?? null,
    articleId: source.articleId, bodyHash: source.bodyHash, analysisKey: source.analysisKey,
  }));
  const templateNotice = draft.spec?.mode === 'template' ? '素材整理稿：按已有研究卡拼接，请补充自己的观点并核对事实。' : '';
  const closing = '本文根据公开资料整理。事实、效果数字和部署阶段，请对照文末来源核对。';
  const sourceLine = (source) => `[${source.id}] ${source.title}${source.sourceName ? ` · ${source.sourceName}` : ''}${source.publishedAt ? ` · ${source.publishedAt}` : ''}${source.url ? `\n${source.url}` : ''}`;
  const textBlocks = [result.title, ...(templateNotice ? [templateNotice] : []), paragraphText(result.lead)];
  const mdBlocks = [`# ${markdownText(result.title)}`, ...(templateNotice ? [`> ${markdownText(templateNotice)}`] : []), markdownText(paragraphText(result.lead))];
  for (const section of result.sections) {
    textBlocks.push(section.heading, ...section.paragraphs.map(paragraphText));
    mdBlocks.push(`## ${markdownText(section.heading)}`, ...section.paragraphs.map((paragraph) => markdownText(paragraphText(paragraph))));
  }
  if (result.takeaways.length) {
    textBlocks.push('带走的要点', ...result.takeaways.map((point, index) => `${index + 1}. ${point.text}${refs(point)}`));
    mdBlocks.push('## 带走的要点', result.takeaways.map((point, index) => `${index + 1}. ${markdownText(point.text + refs(point))}`).join('\n'));
  }
  if (result.caveats.length) {
    textBlocks.push('仍需留意', ...result.caveats.map((item) => `• ${item}`));
    mdBlocks.push('## 仍需留意', result.caveats.map((item) => `- ${markdownText(item)}`).join('\n'));
  }
  textBlocks.push('资料出处', ...sources.map(sourceLine), closing);
  mdBlocks.push('## 资料出处', ...sources.map((source) => markdownText(sourceLine(source))), markdownText(closing));
  const plainText = textBlocks.join('\n\n');
  const bodyMarkdown = mdBlocks.join('\n\n');
  const assets = variant === 'illustrated' ? makeAssets(result, colors, sources.length) : [];
  const bodyStyle = "max-width:677px;margin:0 auto;padding:28px 22px 40px;font-family:-apple-system,BlinkMacSystemFont,'Microsoft YaHei','PingFang SC',sans-serif;color:#302D29;font-size:16px;line-height:1.9;overflow-wrap:break-word;word-break:break-word;";
  const pStyle = 'margin:0 0 22px;line-height:1.9;text-align:left;';
  const heading = (value) => `<h2 style="margin:36px 0 20px;font-size:21px;font-weight:700;line-height:1.5;color:#302D29;border-left:3px solid ${colors.accent};padding-left:12px;">${escape(value)}</h2>`;
  const p = (paragraph) => `<p style="${pStyle}">${KIND_LABELS[paragraph.kind] ? `<span style="color:${colors.accent};font-weight:600;">${KIND_LABELS[paragraph.kind]}：</span>` : ''}${escape(paragraph.text).replaceAll('\n', '<br>')}${paragraph.sources?.length ? `<span style="font-size:12px;color:#7A6F65;">${escape(refs(paragraph))}</span>` : ''}</p>`;
  const image = (asset, preview) => `<figure style="margin:26px 0;">` +
    `<img src="${preview ? `data:image/svg+xml;base64,${Buffer.from(asset.svg).toString('base64')}` : asset.filename}" width="${asset.width}" height="${asset.height}" alt="${escape(asset.caption)}" style="display:block;width:100%;max-width:100%;height:auto;">` +
    `<figcaption style="margin:9px 0 0;font-size:12px;line-height:1.7;color:#7A6F65;text-align:center;">${escape(asset.caption)}</figcaption></figure>`;
  const buildFragment = (preview) => {
    const blocks = [
      `<p style="margin:0 0 15px;font-size:12px;color:${colors.accent};letter-spacing:1px;">${escape(BRAND)} · 企业 AI 落地研究</p>`,
      `<h1 style="margin:0 0 26px;font-size:28px;line-height:1.5;font-weight:700;color:#252321;">${escape(result.title)}</h1>`,
      ...(templateNotice ? [`<p style="padding:12px 15px;margin:0 0 24px;background:#FFF6DF;color:#745820;font-size:14px;line-height:1.8;">${escape(templateNotice)}</p>`] : []),
      ...(assets.length ? [image(assets[0], preview)] : []),
      `<section style="padding:20px 21px;margin:0 0 30px;background:${colors.panel};border-left:3px solid ${colors.accent};"><p style="margin:0;color:${colors.panelText};line-height:1.9;">${escape(paragraphText(result.lead)).replaceAll('\n', '<br>')}</p></section>`,
    ];
    for (const section of result.sections) blocks.push(heading(section.heading), ...section.paragraphs.map(p));
    if (result.takeaways.length) {
      blocks.push(heading('带走的要点'));
      result.takeaways.forEach((point, index) => {
        blocks.push(`<p style="${pStyle}"><strong style="color:${colors.accent};">${index + 1}.</strong> ${escape(point.text + refs(point))}</p>`);
        if (assets[index + 1]) blocks.push(image(assets[index + 1], preview));
      });
    }
    if (result.caveats.length) blocks.push(heading('仍需留意'), ...result.caveats.map((item) => `<p style="${pStyle}">• ${escape(item)}</p>`));
    blocks.push(heading('资料出处'), ...sources.map((source) => `<p style="margin:0 0 14px;color:#756D66;font-size:12px;line-height:1.8;word-break:break-all;">${escape(sourceLine(source)).replaceAll('\n', '<br>')}</p>`),
      `<p style="margin:26px 0 0;border-top:1px solid #E8E1D8;padding-top:16px;font-size:12px;color:#83766A;line-height:1.8;">${closing}</p>`);
    return `<section style="${bodyStyle}">${blocks.join('\n')}</section>`;
  };
  const fragment = buildFragment(false);
  const markdown = variant === 'illustrated'
    ? `${bodyMarkdown}\n\n## 配图\n\n${assets.map((asset) => `![${markdownText(asset.caption)}](${asset.filename})`).join('\n\n')}`
    : bodyMarkdown;
  const manifest = {
    version: 1, renderer: 'fde-editorial-1', brand: BRAND, draftId: draft.id ?? null,
    revision: draft.revision ?? 0, title: result.title, mode: draft.spec?.mode ?? 'model', variant, theme,
    fingerprint: draft.fingerprint ?? null, profileVersion: draft.spec?.profileVersion ?? null,
    promptHash: draft.spec?.promptHash ?? null,
    contentHash: createHash('sha256').update(JSON.stringify(result)).digest('hex'),
    sources, assets: assets.map(({ id, filename, width, height, caption }) => ({ id, filename, width, height, caption })),
    imagePolicy: '本地模板绘制的编辑要点卡，不是原文图片或真实系统架构；PNG 需在公众号编辑器中手动上传。',
    publication: '本地待审核草稿，未上传或发布到微信公众号。',
  };
  return { title: result.title, plainText, markdown, html: wrapDocument(result.title, fragment), fragment,
    previewHtml: wrapDocument(result.title, buildFragment(true)), assets, manifest };
}
