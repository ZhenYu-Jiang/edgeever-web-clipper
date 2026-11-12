import {test,expect} from '@playwright/test';
const url='https://example.com/posts/article',imageUrl='https://example.com/images/article.png';
async function prepare(page){await page.goto('/');await expect(page.getByRole('combobox')).toBeEnabled();await page.getByLabel('网页或 RSS 地址').fill(url);await page.getByRole('button',{name:'提取正文',exact:true}).click();await expect(page.getByRole('status')).toContainText('已提取');}
test('图片上传到新笔记附件并以修订保护写回正文',async({page})=>{
  await prepare(page);await page.getByRole('button',{name:'保存正文',exact:true}).click();await expect(page.getByRole('status')).toContainText('图片已保存为附件 1/1');
  const result=await page.evaluate(()=>({uploads:host.uploads,edits:host.edits,created:host.created}));
  expect(result.uploads).toHaveLength(1);expect(result.uploads[0]).toMatchObject({noteId:'note-1',name:'clipper-1.png',type:'image/png'});expect(result.uploads[0].size).toBeGreaterThan(60);expect(result.edits).toHaveLength(1);
  expect(result.created[0].contentMarkdown).toContain('/api/v1/resources/image-1/file');expect(result.created[0].contentMarkdown).not.toContain(imageUrl);
  expect(result.created[0].contentMarkdown).toContain('文章末尾校验标记');
});
test('图片失败保留原链接，重试不再创建笔记',async({page})=>{
  await prepare(page);await page.evaluate(()=>host.failUpload=true);await page.getByRole('button',{name:'保存正文',exact:true}).click();
  await expect(page.getByRole('status')).toContainText('图片已保存为附件 0/1');expect(await page.evaluate(()=>host.created[0].contentMarkdown)).toContain(imageUrl);
  await page.evaluate(()=>host.failUpload=false);await page.getByRole('button',{name:'重试保存图片'}).click();await expect(page.getByRole('status')).toContainText('图片已保存为附件 1/1');
  expect(await page.evaluate(()=>host.createAttempts)).toBe(1);
});
test('保存时笔记被修改，不覆盖用户新内容，重试复用已有附件',async({page})=>{
  await prepare(page);await page.evaluate(()=>host.externalEdit=true);await page.getByRole('button',{name:'保存正文',exact:true}).click();
  await expect(page.getByRole('status')).toContainText('未覆盖修改');expect(await page.evaluate(()=>host.edits.length)).toBe(0);
  await page.getByRole('button',{name:'重试保存图片'}).click();await expect(page.getByRole('status')).toContainText('未覆盖修改');expect(await page.evaluate(()=>host.uploads.length)).toBe(1);
});
test('同网址重复收藏提供打开已有和显式另存入口',async({page})=>{
  await prepare(page);await page.evaluate(url=>host.existing=[{id:'old',contentMarkdown:`> 来源：<${url}>\n\n以前的收藏`}],url);
  await page.getByRole('button',{name:'保存正文',exact:true}).click();await expect(page.getByRole('status')).toContainText('已收藏过');
  expect(await page.evaluate(()=>host.createAttempts)).toBe(0);await page.getByRole('button',{name:'打开已有收藏'}).click();expect(await page.evaluate(()=>host.opened)).toEqual(['old']);
  await page.getByRole('button',{name:'仍保存新副本'}).click();await expect(page.getByRole('status')).toContainText('图片已保存为附件 1/1');expect(await page.evaluate(()=>host.createAttempts)).toBe(1);
});
test('近似网址不误判为同一收藏',async({page})=>{
  await prepare(page);await page.evaluate(()=>host.existing=[{id:'old',contentMarkdown:'> 来源：<https://example.com/posts/article-two>\n'}]);
  await page.getByRole('button',{name:'保存正文',exact:true}).click();await expect(page.getByRole('status')).toContainText('图片已保存为附件 1/1');
});
test('伪装图片、超大图片和不安全跳转保留原链接',async({page})=>{
  await prepare(page);
  for(const kind of ['fake','large','redirect']){
    await page.evaluate(({imageUrl,kind})=>{host.responses[imageUrl]=kind==='fake'?{body:'<html>not an image</html>',type:'image/png'}:kind==='large'?{bytes:[137,80,78,71,...new Array(2_000_000).fill(0)],type:'image/png'}:{status:302,headers:{location:'http://example.com/image.png'}};},{imageUrl,kind});
    const retry=page.getByRole('button',{name:'重试保存图片'});
    if(await retry.isVisible())await retry.click();else await page.getByRole('button',{name:'保存正文',exact:true}).click();
    await expect(page.getByRole('status')).toContainText('图片已保存为附件 0/1');
  }
  expect(await page.evaluate(()=>host.uploads.length)).toBe(0);expect(await page.evaluate(()=>host.requests.some(r=>r.url.startsWith('http:')))).toBe(false);
});
test('停止慢图片下载后正文仍保存且迟到图片不会上传',async({page})=>{
  await prepare(page);await page.evaluate(imageUrl=>host.responses[imageUrl].delay=500,imageUrl);
  await page.getByRole('button',{name:'保存正文',exact:true}).click();await expect(page.getByRole('status')).toContainText('正在保存图片');
  await page.getByRole('button',{name:'停止下载图片'}).click();await expect(page.getByRole('status')).toContainText('图片已保存为附件 0/1');
  await page.waitForTimeout(550);expect(await page.evaluate(()=>host.uploads.length)).toBe(0);expect(await page.evaluate(()=>host.created.length)).toBe(1);
});
