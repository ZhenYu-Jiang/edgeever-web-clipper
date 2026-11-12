const paragraph = '一份可靠的阅读笔记应该保留文章的论证过程，而不是只有一句网站简介。先理解问题，再记录例子和细节，最后整理自己的结论。保存后的内容应当方便重新阅读，并且能够回到原文核对上下文。';
export const ARTICLE = `<!doctype html><html><head><title>如何保存一篇完整文章</title><meta name="description" content="这是只有一句话的摘要。"></head><body>
<nav>导航广告不应出现在正文</nav><article><h1>如何保存一篇完整文章</h1>
${Array.from({ length: 6 }, (_, i) => `<p>第 ${i + 1} 节：${paragraph.repeat(2)}</p>`).join('')}
<h2>保留文章结构</h2><p>阅读 <a href="../guide">进一步说明</a>，注意 <strong>关键步骤</strong> 和 <em>原始语气</em>。</p>
<ul><li>先读完整内容</li><li>再保存重点</li></ul><blockquote>不要把摘要当成全文。</blockquote>
<table><thead><tr><th>类型</th><th>用途</th></tr></thead><tbody><tr><td>正文</td><td>重新阅读</td></tr></tbody></table>
<pre><code class="language-js">const answer = 42;\nconsole.log(answer);</code></pre>
<p><img data-src="/images/article.png" src="data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///w==" alt="文章示意图" onerror="window.injected=1"></p>
<p><a href="javascript:alert(1)">危险链接</a></p><script>window.injected=1</script>
<p>文章末尾校验标记：所有章节都应保存，不要截断最后一段。</p></article><footer>页脚推广不要收藏</footer></body></html>`;
export const FEED = `<?xml version="1.0"?><rss version="2.0" xmlns:content="http://purl.org/rss/1.0/modules/content/"><channel><title>阅读订阅</title>
<item><title>完整文章</title><link>https://example.com/posts/article</link><description>一句摘要</description><content:encoded><![CDATA[<p>订阅源提供的正文内容。</p><h2>第二节</h2><p>这是更完整的订阅正文。</p>]]></content:encoded></item>
<item><title>只有摘要</title><link>https://example.com/summary</link><description><![CDATA[<p>这只是摘要。</p>]]></description></item>
</channel></rss>`;
export const ATOM = `<?xml version="1.0"?><feed xmlns="http://www.w3.org/2005/Atom" xml:base="https://example.com/posts/">
<entry><title>Atom 文章</title><link rel="self" href="https://example.com/api/entry"/><link rel="alternate" href="article"/><summary type="text">摘要 &lt;b&gt;原样文本&lt;/b&gt;</summary></entry>
</feed>`;
