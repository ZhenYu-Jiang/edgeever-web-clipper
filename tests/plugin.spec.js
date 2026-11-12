import { test, expect } from '@playwright/test';
const articleUrl = 'https://example.com/posts/article';
async function open(page, query = '') {
  await page.goto('/' + query);
  await expect(page.getByRole('combobox', { name: '保存到笔记本' })).toBeEnabled();
}
async function extract(page, url = articleUrl) {
  await page.getByLabel('网页或 RSS 地址').fill(url);
  await page.getByRole('button', { name: '提取正文', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('已提取');
}

test('full article survives extraction and save, including tail and formatted content', async ({ page }) => {
  const external = [];
  page.on('request', (request) => { if (!request.url().startsWith('http://127.0.0.1:4181')) external.push(request.url()); });
  await page.route('https://**/*', (route) => route.abort());
  await open(page); await extract(page);
  await page.getByLabel('将图片保存为附件', { exact: false }).uncheck();
  expect(await page.evaluate(() => host.created)).toEqual([]);
  await expect(page.getByLabel('正文预览')).toContainText('文章末尾校验标记');
  await expect(page.getByLabel('正文预览')).not.toContainText('导航广告');
  await expect(page.getByLabel('正文预览')).not.toContainText('页脚推广');
  await expect(page.locator('.wc-preview img')).toHaveCount(0);
  await page.getByLabel('笔记标题').fill('我的完整阅读笔记');
  await page.getByRole('combobox').selectOption('n2');
  await page.getByRole('button', { name: '保存正文', exact: true }).click();
  await expect(page.getByRole('button', { name: '已保存', exact: true })).toBeDisabled();
  const saved = await page.evaluate(() => host.created[0]);
  expect(saved.title).toBe('我的完整阅读笔记'); expect(saved.notebookId).toBe('n2');
  expect(saved.contentMarkdown.length).toBeGreaterThan(1400);
  for (const part of ['文章末尾校验标记', '## 保留文章结构', '> 不要把摘要当成全文', 'const answer = 42;', 'https://example.com/guide', 'https://example.com/images/article.png', '| 类型 | 用途 |']) expect(saved.contentMarkdown).toContain(part);
  expect(saved.contentMarkdown).toMatch(/^-\s+先读完整内容$/m);
  expect(saved.contentMarkdown).toContain('```js');
  expect(saved.contentMarkdown).not.toContain('javascript:'); expect(saved.contentMarkdown).not.toContain('window.injected');
  expect(await page.evaluate(() => window.injected)).toBeUndefined();
  expect(external).toEqual([]);
  await page.getByRole('button', { name: '打开笔记' }).click();
  expect(await page.evaluate(() => host.opened)).toEqual(['note-1']);
  await page.screenshot({ path: 'test-results/web-clipper-desktop.png', fullPage: true });
});

test('empty dynamic page cannot silently save its meta description as full text', async ({ page }) => {
  await open(page);
  await page.getByLabel('网页或 RSS 地址').fill('https://example.com/summary');
  await page.getByRole('button', { name: '提取正文', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('没有提取到');
  await expect(page.getByRole('button', { name: '保存正文', exact: true })).toBeDisabled();
  expect(await page.evaluate(() => host.created)).toEqual([]);
  await page.getByRole('button', { name: '仅收藏链接' }).click();
  await page.getByRole('button', { name: '保存链接与摘要' }).click();
  await expect.poll(() => page.evaluate(() => host.created.length)).toBe(1);
  expect(await page.evaluate(() => host.created[0].contentMarkdown)).toContain('仅链接与摘要，未提取正文');
});

test('manual text fallback keeps complete text without interpreting HTML', async ({ page }) => {
  await open(page);
  await page.getByLabel('网页或 RSS 地址').fill('example.com/private-article');
  await page.getByText('抓取不完整？粘贴正文', { exact: true }).click();
  await page.getByLabel('粘贴正文', { exact: true }).fill('第一段完整正文。\n\n<script>doNotRun()</script> 是字面文字。\n最后一段也应该保留。');
  await page.getByRole('button', { name: '用粘贴内容生成预览' }).click();
  await expect(page.getByLabel('正文预览')).toContainText('<script>doNotRun()</script>');
  await page.getByRole('button', { name: '保存正文', exact: true }).click();
  await expect.poll(() => page.evaluate(() => host.created.length)).toBe(1);
  expect(await page.evaluate(() => host.created[0].contentMarkdown)).toContain('最后一段也应该保留');
});

test('RSS offers full-page extraction and clearly distinguishes feed summaries', async ({ page }) => {
  await open(page);
  await page.getByLabel('网页或 RSS 地址').fill('https://example.com/feed');
  await page.getByRole('button', { name: '读取 RSS' }).click();
  await expect(page.locator('.wc-feed-item')).toHaveCount(2);
  await expect(page.locator('.wc-feed-item').first()).toContainText('订阅正文');
  await page.locator('.wc-feed-item').first().getByRole('button', { name: '提取全文' }).click();
  await expect(page.getByLabel('正文预览')).toContainText('文章末尾校验标记');
  expect(await page.evaluate(() => host.created)).toEqual([]);
  await page.getByLabel('网页或 RSS 地址').fill('https://example.com/feed');
  await page.getByRole('button', { name: '读取 RSS' }).click();
  await page.locator('.wc-feed-item').nth(1).getByRole('button', { name: '预览订阅内容' }).click();
  await page.getByRole('button', { name: '保存订阅摘要' }).click();
  await expect.poll(() => page.evaluate(() => host.created.length)).toBe(1);
  expect(await page.evaluate(() => host.created[0].contentMarkdown)).toContain('并非原网页全文');
});

test('Atom alternate links resolve against xml:base instead of self API links', async ({ page }) => {
  await open(page);
  await page.getByLabel('网页或 RSS 地址').fill('https://example.com/atom');
  await page.getByRole('button', { name: '读取 RSS' }).click();
  await page.getByRole('button', { name: '提取全文' }).click();
  await expect(page.getByLabel('正文预览')).toContainText('文章末尾校验标记');
  expect(await page.evaluate(() => host.requests.at(-1).url)).toBe(articleUrl);
});

test('new input cancels old requests and late results never replace the new preview', async ({ page }) => {
  await open(page);
  await page.evaluate(() => { host.responses['https://example.com/slow'] = { ...host.responses['https://example.com/posts/article'], delay: 400 }; });
  await page.getByLabel('网页或 RSS 地址').fill('https://example.com/slow');
  await page.getByRole('button', { name: '提取正文', exact: true }).click();
  await page.getByLabel('网页或 RSS 地址').fill('https://example.com/summary');
  await page.getByRole('button', { name: '仅收藏链接' }).click();
  await page.waitForTimeout(500);
  await expect(page.getByLabel('笔记标题')).toHaveValue('https://example.com/summary');
  await expect(page.getByRole('button', { name: '保存链接与摘要' })).toBeEnabled();
});

test('save is guarded against double click; failure keeps draft for retry', async ({ page }) => {
  await open(page); await extract(page);
  await page.evaluate(() => { host.saveDelay = 150; host.failSave = true; });
  await page.getByRole('button', { name: '保存正文', exact: true }).click();
  await expect(page.getByRole('button', { name: '保存中…' })).toBeDisabled();
  await expect(page.getByRole('status')).toContainText('预览内容已保留');
  await expect(page.getByLabel('正文预览')).toContainText('文章末尾校验标记');
  await page.evaluate(() => { host.failSave = false; });
  await page.evaluate(() => { const save = [...document.querySelectorAll('button')].find((node) => node.textContent === '保存正文'); save.click(); save.click(); });
  await expect.poll(() => page.evaluate(() => host.created.length)).toBe(1);
  expect(await page.evaluate(() => host.createAttempts)).toBe(2);
});

test('no notebooks blocks saving but preview works and refresh recovers', async ({ page }) => {
  await open(page);
  await page.evaluate(() => { host.notebooks = []; });
  await page.getByRole('button', { name: '刷新笔记本' }).click();
  await expect(page.getByRole('status')).toContainText('没有可用笔记本');
  await extract(page);
  await expect(page.getByRole('button', { name: '保存正文', exact: true })).toBeDisabled();
  await page.evaluate(() => { host.notebooks = [{ id: 'new', name: '新建笔记本' }]; });
  await page.getByRole('button', { name: '刷新笔记本' }).click();
  await expect(page.getByRole('button', { name: '保存正文', exact: true })).toBeEnabled();
});

test('invalid URLs, HTTP failures and non-article files do not create notes', async ({ page }) => {
  await open(page);
  for (const url of ['javascript:alert(1)', 'http://example.com/', 'https://user:password@example.com/']) {
    await page.getByLabel('网页或 RSS 地址').fill(url);
    await page.getByRole('button', { name: '提取正文', exact: true }).click();
    await expect(page.getByRole('status')).toContainText('HTTPS');
  }
  expect(await page.evaluate(() => host.requests.length)).toBe(0);
  await page.evaluate(() => {
    host.responses['https://example.com/denied'] = { status: 403 };
    host.responses['https://example.com/file'] = { type: 'application/pdf', body: '%PDF' };
  });
  await page.getByLabel('网页或 RSS 地址').fill('https://example.com/denied');
  await page.getByRole('button', { name: '提取正文', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('HTTP 403');
  await page.getByLabel('网页或 RSS 地址').fill('https://example.com/file');
  await page.getByRole('button', { name: '提取正文', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('不是网页');
  expect(await page.evaluate(() => host.created)).toEqual([]);
});

test('redirects use the final URL for source and relative links', async ({ page }) => {
  await open(page);
  await page.evaluate(() => { host.responses['https://example.com/redirect'] = { status: 302, headers: { location: '/posts/article' } }; });
  await extract(page, 'https://example.com/redirect');
  await expect(page.getByLabel('网页或 RSS 地址')).toHaveValue(articleUrl);
  await page.getByRole('button', { name: '保存正文', exact: true }).click();
  await expect.poll(() => page.evaluate(() => host.created.length)).toBe(1);
  expect(await page.evaluate(() => host.created[0].contentMarkdown)).toContain(`来源：<${articleUrl}>`);
});

test('oversized responses fail explicitly and narrow dark layout remains usable', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 820 });
  await open(page, '?dark');
  await page.evaluate(() => { host.responses['https://example.com/large'] = { body: 'a'.repeat(2_000_001) }; });
  await page.getByLabel('网页或 RSS 地址').fill('https://example.com/large');
  await page.getByRole('button', { name: '提取正文', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('2 MB');
  await extract(page);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await expect(page.getByRole('button', { name: '保存正文', exact: true })).toBeInViewport();
  await page.screenshot({ path: 'test-results/web-clipper-mobile-dark.png', fullPage: true });
});

test('closing the panel aborts reads and leaves no late UI or note writes', async ({ page }) => {
  await open(page);
  const errors = []; page.on('pageerror', (error) => errors.push(error.message));
  await page.evaluate(() => { host.responses['https://example.com/posts/article'].delay = 300; });
  await page.getByLabel('网页或 RSS 地址').fill(articleUrl);
  await page.getByRole('button', { name: '提取正文', exact: true }).click();
  await page.evaluate(() => host.deactivate());
  await page.waitForTimeout(400);
  await expect(page.locator('.wc-root')).toHaveCount(0);
  expect(await page.evaluate(() => host.created)).toEqual([]); expect(errors).toEqual([]);
});

test('GBK text is decoded correctly instead of saving unreadable Chinese', async ({ page }) => {
  await open(page);
  await page.evaluate(() => {
    const prefix = [...new TextEncoder().encode('<title>GBK</title><article><p>')];
    const words = Array.from({ length: 60 }, () => [0xd6,0xd0,0xce,0xc4,0xd5,0xfd,0xce,0xc4]).flat();
    const suffix = [...new TextEncoder().encode('</p></article>')];
    host.responses['https://example.com/gbk'] = { bytes: [...prefix,...words,...suffix], type: 'text/html; charset=gbk' };
  });
  await extract(page, 'https://example.com/gbk');
  await expect(page.getByLabel('正文预览')).toContainText('中文正文中文正文');
  await page.getByRole('button', { name: '保存正文', exact: true }).click();
  await expect.poll(() => page.evaluate(() => host.created.length)).toBe(1);
  expect(await page.evaluate(() => host.created[0].contentMarkdown)).not.toContain('�');
});
