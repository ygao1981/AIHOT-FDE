import { canonicalUrl } from './fetch.mjs';
import { AppError } from './config.mjs';

export function isXUrl(value) {
  return /^(?:(?:www|mobile)\.)?(?:x\.com|twitter\.com)$/.test(new URL(value).hostname);
}

export function xPostUrl(value) {
  const url=new URL(canonicalUrl(value));
  const match=/^\/(?:[a-z0-9_]+|i\/web)\/status\/(\d{5,25})(?:\/(?:photo|video)\/\d+)?\/?$/i.exec(url.pathname);
  if(!isXUrl(url.href)||!match)throw new AppError('invalid_x_link','请粘贴一条 X 帖子的完整链接。');
  return `https://x.com/i/status/${match[1]}`;
}

export function researchKey(value) {
  const url=new URL(canonicalUrl(value));
  if(isXUrl(url.href)) {
    try{return xPostUrl(url.href);}catch{/* A profile is separate from a post. */}
  }
  if(url.hostname==='news.ycombinator.com'&&url.pathname==='/item'&&/^\d+$/.test(url.searchParams.get('id')||''))
    return `https://news.ycombinator.com/item?id=${url.searchParams.get('id')}`;
  if(url.hostname==='github.com') {
    const match=/^\/([^/]+)\/([^/]+)\/(?:issues|pull)\/(\d+)\/?$/.exec(url.pathname);
    if(match)return `https://github.com/${match[1].toLowerCase()}/${match[2].toLowerCase()}/issue-or-pull/${match[3]}`;
  }
  // Display and requests retain the source URL and its scheme.
  const path=url.pathname.replace(/\/+$/,'')||'/';
  return `${url.host}${path}${url.search}`;
}
