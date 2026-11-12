import { Readability } from '@mozilla/readability';
import TurndownService from 'turndown';
import { gfm } from 'turndown-plugin-gfm';
import DOMPurify from 'dompurify';

export const MAX_BYTES = 2_000_000; // Matches EdgeEver's public-network transport limit.
const FORBIDDEN = ['script', 'style', 'link', 'iframe', 'object', 'embed', 'form', 'input', 'button', 'video', 'audio', 'source', 'svg', 'math'];
const SANITIZE = { USE_PROFILES: { html: true }, FORBID_TAGS: FORBIDDEN, FORBID_ATTR: ['style', 'srcset', 'id', 'name'] };
const converter = new TurndownService({ headingStyle: 'atx', bulletListMarker: '-', codeBlockStyle: 'fenced' });
converter.use(gfm);
// GFM keeps non-heading tables as HTML by default. Keep their text in Markdown instead.
converter.addRule('plain-table', {
  filter: (node) => node.nodeName === 'TABLE' && !node.querySelector('th'),
  replacement: (_content, node) => '\n\n' + [...node.rows].map((row) => [...row.cells].map((cell) => converter.turndown(cell.innerHTML)).join(' · ')).join('\n\n') + '\n\n',
});
const text = (node) => node?.textContent?.trim() || '';
const size = (value) => Array.from(value.replace(/\s/g, '')).length;

export function normalizeUrl(value) {
  let input = value.trim();
  if (!input) throw new Error('请先粘贴网页或 RSS 地址。');
  if (!/^[a-z][a-z\d+.-]*:/i.test(input)) input = 'https://' + input;
  let url;
  try { url = new URL(input); } catch { throw new Error('链接格式不正确，请粘贴完整网址。'); }
  if (url.protocol !== 'https:' || (url.port && url.port !== '443') || url.username || url.password) {
    throw new Error('请使用不含账号密码的 HTTPS 链接（默认 443 端口）。');
  }
  url.hash = '';
  return url.href;
}

function safeUrl(value, base, image = false) {
  if (!value) return '';
  try {
    const url = new URL(value, base);
    if (!['https:', 'http:', ...(image ? [] : ['mailto:'])].includes(url.protocol) || url.username || url.password) return '';
    return url.href;
  } catch { return ''; }
}

function prepare(html, url) {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const base = safeUrl(doc.querySelector('base[href]')?.getAttribute('href'), url) || url;
  doc.querySelectorAll('base').forEach((node) => node.remove());
  const baseElement = doc.createElement('base');
  baseElement.href = base;
  doc.head.prepend(baseElement);
  doc.querySelectorAll([...FORBIDDEN, 'noscript', 'nav', 'footer', 'aside', '[hidden]', '[aria-hidden="true"]'].join(',')).forEach((node) => node.remove());
  for (const anchor of doc.querySelectorAll('a')) {
    const href = safeUrl(anchor.getAttribute('href'), base);
    if (href) anchor.setAttribute('href', href); else anchor.removeAttribute('href');
  }
  for (const image of doc.querySelectorAll('img')) {
    const candidates = ['data-src', 'data-original', 'data-lazy-src', 'src'].map((name) => image.getAttribute(name));
    const srcset = image.getAttribute('data-srcset') || image.getAttribute('srcset') || '';
    candidates.push(...srcset.split(',').reverse().map((part) => part.trim().split(/\s+/)[0]));
    const src = candidates.map((value) => safeUrl(value, base, true)).find(Boolean);
    if (!src || image.getAttribute('width') === '1' || image.getAttribute('height') === '1') { image.remove(); continue; }
    image.setAttribute('src', src);
    for (const attr of [...image.attributes]) if (!['src', 'alt', 'title'].includes(attr.name)) image.removeAttribute(attr.name);
  }
  return doc;
}

function contentFromHtml(html, url) {
  const doc = prepare(html, url);
  for (const node of doc.querySelectorAll('[class]')) {
    const language = ['PRE', 'CODE'].includes(node.tagName) ? [...node.classList].find((name) => /^language-[a-z0-9_-]+$/i.test(name)) : null;
    if (language) node.className = language; else node.removeAttribute('class');
  }
  const clean = DOMPurify.sanitize(doc.body.innerHTML, SANITIZE);
  // An inert document avoids loading source images while preparing the preview.
  const holder = new DOMParser().parseFromString(clean, 'text/html').body;
  return { html: clean, markdown: converter.turndown(holder).trim(), characters: size(text(holder)), images: holder.querySelectorAll('img').length };
}

export function extractArticle(html, url) {
  const doc = prepare(html, url);
  const title = doc.querySelector('meta[property="og:title"]')?.getAttribute('content') || text(doc.querySelector('title')) || url;
  const summary = doc.querySelector('meta[name="description"],meta[property="og:description"]')?.getAttribute('content') || '';
  let article = null;
  try { article = new Readability(doc.cloneNode(true), { charThreshold: 120, maxElemsToParse: 20_000, keepClasses: true }).parse(); }
  catch { /* Semantic article fallback below still gives the user an explicit preview. */ }
  let content = article?.content ? contentFromHtml(article.content, url) : null;
  if (!content || content.characters < 120) {
    const candidates = [...doc.querySelectorAll('article,main,[role="main"],[itemprop="articleBody"]')]
      .filter((node) => size(text(node)) >= 40).sort((a, b) => size(text(b)) - size(text(a)));
    if (candidates.length) content = contentFromHtml(candidates[0].innerHTML, url);
  }
  // Do not pass a short login shell or meta description off as an extracted article.
  if (!content || content.characters < 40 || (content.characters < 120 && !doc.querySelector('article,main,[role="main"],[itemprop="articleBody"]'))) {
    return { kind: 'bookmark', title, url, summary, ...contentFromPlain(summary, url), warning: '没有提取到可用正文。页面可能需要登录、依赖动态加载，或不是文章页。可粘贴正文，或明确选择仅保存链接与摘要。' };
  }
  return { kind: 'article', title: article?.title || title, url, summary, ...content,
    warning: content.characters < 200 ? '提取的正文较短，保存前请核对是否完整。' : '' };
}

export function contentFromPlain(value, url) {
  const holder = document.createElement('div');
  for (const paragraph of value.split(/\n\s*\n/)) {
    const element = document.createElement('p');
    const lines = paragraph.split('\n');
    lines.forEach((line, i) => { if (i) element.append(document.createElement('br')); element.append(document.createTextNode(line)); });
    holder.append(element);
  }
  return contentFromHtml(holder.innerHTML, url);
}

export function previewFragment(html) {
  const inert = new DOMParser().parseFromString(html, 'text/html').body;
  // Preview does not load remote images. Their original URLs stay in the saved Markdown.
  for (const image of inert.querySelectorAll('img')) {
    const placeholder = inert.ownerDocument.createElement('span');
    placeholder.className = 'wc-image-placeholder';
    placeholder.textContent = '▧ 图片：' + (image.getAttribute('alt') || '原网页图片');
    image.replaceWith(placeholder);
  }
  const fragment = DOMPurify.sanitize(inert.innerHTML, { ...SANITIZE, RETURN_DOM_FRAGMENT: true });
  for (const anchor of fragment.querySelectorAll('a')) { anchor.target = '_blank'; anchor.rel = 'noopener noreferrer'; }
  return fragment;
}

export function noteInput(draft, title, notebookId) {
  const warning = draft.kind === 'bookmark' ? '> 收藏类型：仅链接与摘要，未提取正文。\n\n'
    : draft.kind === 'feed-summary' ? '> 收藏类型：RSS/Atom 提供的摘要，并非原网页全文。\n\n' : '';
  return {
    notebookId, title: title.trim() || draft.title || '网页收藏', tags: ['收藏'],
    contentMarkdown: `> 来源：<${draft.url}>\n\n${warning}${draft.markdown}`.trim(),
  };
}

export function imageUrls(html) {
  const template = document.createElement('template'); template.innerHTML = html;
  return [...new Set([...template.content.querySelectorAll('img[src]')].map(image => image.getAttribute('src')))];
}

export function markdownWithImages(html, replacements) {
  const template = document.createElement('template'); template.innerHTML = html;
  for (const image of template.content.querySelectorAll('img[src]')) {
    const replacement = replacements.get(image.getAttribute('src'));
    if (replacement) image.setAttribute('src', replacement);
  }
  return converter.turndown(template.innerHTML).trim();
}

export function parseFeed(xml, feedUrl) {
  const doc = new DOMParser().parseFromString(xml, 'text/xml');
  if (doc.querySelector('parsererror')) throw new Error('这不是有效的 RSS/Atom 内容，请检查订阅链接。');
  const nodes = [...doc.getElementsByTagName('*')].filter((node) => ['item', 'entry'].includes(node.localName));
  const unique = new Set();
  return nodes.map((node) => {
    const children = [...node.children];
    const child = (name) => children.find((entry) => entry.localName === name);
    const links = children.filter((entry) => entry.localName === 'link');
    const alternate = links.find((link) => !link.getAttribute('rel') || link.getAttribute('rel') === 'alternate');
    const rawLink = alternate?.getAttribute('href') || text(alternate);
    const base = node.getAttribute('xml:base') || doc.documentElement.getAttribute('xml:base') || feedUrl;
    const link = safeUrl(rawLink, safeUrl(base, feedUrl) || feedUrl);
    const full = child('encoded') || child('content');
    const source = full || child('description') || child('summary');
    const raw = source?.getAttribute('type') === 'xhtml' ? source.innerHTML : text(source);
    const content = source?.getAttribute('type') === 'text'
      ? contentFromPlain(raw || '', link || feedUrl) : contentFromHtml(raw || '', link || feedUrl);
    return { title: text(child('title')) || link || '未命名文章', url: link, kind: full ? 'feed-content' : 'feed-summary', ...content };
  }).filter((item) => {
    const identity = item.url || item.title;
    if (unique.has(identity)) return false;
    unique.add(identity); return true;
  });
}

export async function fetchText(context, initialUrl, signal) {
  let url = normalizeUrl(initialUrl);
  for (let count = 0; count < 4; count++) {
    signal?.throwIfAborted();
    const response = await context.network.fetch(url, { transport: 'public', method: 'GET', signal });
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.get('location');
      if (!location) throw new Error('网页发生跳转，请粘贴浏览器跳转后的最终地址。');
      url = normalizeUrl(new URL(location, url).href); continue;
    }
    if (!response.ok) throw new Error(`网站返回 HTTP ${response.status}，暂时无法读取；可从原网页复制正文后粘贴。`);
    const contentType = (response.headers.get('content-type') || '').toLowerCase();
    if (contentType && !/text\/|(?:application\/(?:xhtml\+xml|(?:rss|atom)\+xml|xml))/.test(contentType)) {
      throw new Error('这个链接不是网页或订阅内容；PDF、图片和下载文件请使用附件导入。');
    }
    const bytes = await response.arrayBuffer();
    signal?.throwIfAborted();
    if (bytes.byteLength > MAX_BYTES) throw new Error('页面超过公开抓取的 2 MB 限制，请复制正文后粘贴。');
    const sample = new TextDecoder().decode(bytes.slice(0, 4096));
    const encoding = /charset\s*=\s*["']?([\w-]+)/i.exec(contentType)?.[1]
      || /<meta\s[^>]*charset\s*=\s*["']?([\w-]+)/i.exec(sample)?.[1] || 'utf-8';
    let body;
    try { body = new TextDecoder(encoding).decode(bytes); } catch { body = new TextDecoder().decode(bytes); }
    return { body, url };
  }
  throw new Error('网页跳转次数过多，请粘贴最终文章地址。');
}
