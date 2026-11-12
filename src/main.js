import { contentFromPlain, extractArticle, fetchText, normalizeUrl, noteInput, parseFeed, previewFragment } from './extract.js';
import { STYLE } from './styles.js';

function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}
function button(text, handler, primary = false) {
  const node = element('button', 'wc-btn' + (primary ? ' primary' : ''), text);
  node.type = 'button'; node.onclick = handler; return node;
}

export default {
  activate(context) {
    const cleanupPanels = new Set();
    const disposePanel = context.ui.panels.register({
      id: 'web-clipper-panel', title: '网页收藏', purpose: 'workflow', presentation: 'dialog',
      mount(container, { shell }) {
        shell.set({ header: { title: '网页收藏', description: '提取正文，确认内容，再存进笔记本' } });
        let mounted = true, requestId = 0, controller = null, busy = false, saving = false;
        let draft = null, notebooksReady = false, notebookRequest = 0;
        const root = element('div', 'wc-root');
        root.append(element('style', '', STYLE));
        const urlLabel = element('label', 'wc-label', '网页或 RSS 地址');
        const input = element('input', 'wc-input');
        input.type = 'text'; input.inputMode = 'url'; input.placeholder = '粘贴文章链接，例如 https://example.com/article';
        urlLabel.append(input);
        const actions = element('div', 'wc-row');
        const extract = button('提取正文', () => load('article'), true);
        const rss = button('读取 RSS', () => load('feed'));
        const cancel = button('取消读取', () => { cancelRequest(); status('已取消读取。'); }); cancel.hidden = true;
        const bookmark = button('仅收藏链接', () => {
          try {
            const url = normalizeUrl(input.value);
            const old = draft?.url === url ? draft : null;
            cancelRequest();
            showDraft({ kind: 'bookmark', title: old?.title || url, url, ...contentFromPlain(old?.summary || '', url), warning: '将只保存链接和可用摘要，不包含网页正文。' });
            status('这是链接收藏。需要正文时请先提取，或手动粘贴。');
          } catch (error) { status(error.message, true); }
        });
        actions.append(extract, rss, bookmark, cancel);
        const notebookRow = element('div', 'wc-row');
        notebookRow.append(element('span', 'wc-hint', '保存到'));
        const notebooks = element('select', 'wc-select'); notebooks.setAttribute('aria-label', '保存到笔记本');
        const refresh = button('刷新笔记本', loadNotebooks);
        notebookRow.append(notebooks, refresh);
        const message = element('div', 'wc-status', '粘贴链接后先提取，检查正文预览，再保存。');
        message.setAttribute('role', 'status'); message.setAttribute('aria-live', 'polite');
        const content = element('div', 'wc-content');
        const display = element('div');
        const empty = element('p', 'wc-hint', '支持公开文章页；登录后内容和部分动态网页可使用下方“粘贴正文”。');
        display.append(empty);
        const manual = element('details', 'wc-manual');
        manual.append(element('summary', '', '抓取不完整？粘贴正文'));
        const pasted = element('textarea', 'wc-textarea');
        pasted.setAttribute('aria-label', '粘贴正文'); pasted.placeholder = '从原网页复制正文并粘贴到这里，内容不会发送给第三方。';
        const usePasted = button('用粘贴内容生成预览', () => {
          try {
            const url = normalizeUrl(input.value);
            if (!pasted.value.trim()) throw new Error('请先粘贴正文。');
            if (new TextEncoder().encode(pasted.value).byteLength > 2_000_000) throw new Error('粘贴内容过大，请分成多篇笔记保存。');
            const title = draft?.url === url ? titleInput.value || draft.title : url;
            cancelRequest();
            showDraft({ kind: 'manual', title, url, ...contentFromPlain(pasted.value, url), warning: '以下是你粘贴的正文，请核对后保存。' });
            status('粘贴的正文已准备好。'); manual.open = false;
          } catch (error) { status(error.message, true); }
        });
        manual.append(pasted, usePasted);
        content.append(display, manual);
        const footer = element('div', 'wc-footer');
        const footerHint = element('span', 'wc-hint', '预览不会自动创建笔记');
        const footerActions = element('div', 'wc-row');
        const openSaved = button('打开笔记', async () => {
          try { await context.ui.openNote(draft.savedId); }
          catch { status('笔记已保存，但暂时无法打开；可以到所选笔记本查找。', true); }
        }); openSaved.hidden = true;
        const save = button('保存正文', saveDraft, true);
        footerActions.append(openSaved, save); footer.append(footerHint, footerActions);
        root.append(urlLabel, actions, notebookRow, message, content, footer); container.append(root);
        let titleInput = null;

        function status(text, error = false) {
          if (!mounted) return;
          message.textContent = text; message.dataset.error = String(error);
        }
        function sync() {
          if (!mounted) return;
          extract.disabled = busy || saving; rss.disabled = busy || saving; bookmark.disabled = saving;
          cancel.hidden = !busy; input.disabled = saving; notebooks.disabled = saving || !notebooksReady;
          refresh.disabled = saving; usePasted.disabled = saving;
          save.disabled = busy || saving || !draft || !notebooksReady || !notebooks.value || Boolean(draft.saved) || draft.kind === 'unavailable';
          save.textContent = saving ? '保存中…' : draft?.saved ? '已保存' : draft?.kind === 'bookmark' ? '保存链接与摘要' : draft?.kind === 'feed-summary' ? '保存订阅摘要' : '保存正文';
          openSaved.hidden = !draft?.savedId;
          footerHint.textContent = draft?.saved ? '已创建笔记，本次预览不会重复保存' : '确认内容后再保存，自动添加「收藏」标签';
          if (titleInput) titleInput.disabled = saving || Boolean(draft?.saved);
        }
        function cancelRequest() {
          requestId++; controller?.abort(); controller = null; busy = false; sync();
        }
        input.oninput = () => {
          cancelRequest(); draft = null; titleInput = null; display.replaceChildren(empty);
          status('链接已更改，请重新提取正文。'); sync();
        };
        input.onkeydown = (event) => { if (event.key === 'Enter' && !busy && !saving) { event.preventDefault(); void load('article'); } };
        notebooks.onchange = sync;

        async function loadNotebooks() {
          const id = ++notebookRequest;
          const previous = notebooks.value;
          notebooksReady = false; notebooks.replaceChildren(element('option', '', '正在读取笔记本…')); sync();
          try {
            const list = await context.notebooks.list();
            if (!mounted || id !== notebookRequest) return;
            notebooks.replaceChildren();
            for (const nb of list) {
              const option = element('option', '', nb.name || '未命名笔记本'); option.value = nb.id; notebooks.append(option);
            }
            notebooksReady = list.length > 0;
            if (list.some((nb) => nb.id === previous)) notebooks.value = previous;
            if (!notebooksReady) { notebooks.append(element('option', '', '请先创建一个笔记本')); status('没有可用笔记本。你仍可提取预览，创建笔记本后点击刷新。', true); }
          } catch { if (mounted && id === notebookRequest) { notebooks.replaceChildren(element('option', '', '读取失败，请刷新')); status('读取笔记本失败，请点击“刷新笔记本”重试。', true); } }
          finally { if (id === notebookRequest) sync(); }
        }

        function showDraft(value) {
          if (!mounted) return;
          draft = value; display.replaceChildren();
          const wrapper = element('section', 'wc-draft');
          const titleLabel = element('label', 'wc-label', '笔记标题');
          titleInput = element('input', 'wc-input'); titleInput.value = value.title; titleInput.maxLength = 500; titleLabel.append(titleInput);
          const info = element('p', 'wc-hint', `${value.characters} 字 · ${value.images} 张图片 · ${new URL(value.url).hostname}`);
          const preview = element('article', 'wc-preview'); preview.setAttribute('aria-label', '正文预览');
          preview.append(previewFragment(value.html));
          wrapper.append(titleLabel, info);
          if (value.warning) wrapper.append(element('p', 'wc-hint', value.warning));
          if (value.images) wrapper.append(element('p', 'wc-hint', '图片保存为原站链接，预览仅显示占位；不包含离线图片副本。'));
          if (value.characters) wrapper.append(preview);
          display.append(wrapper); content.scrollTop = 0; sync();
        }

        async function load(kind, address = input.value) {
          if (saving) return;
          let url;
          try { url = normalizeUrl(address); } catch (error) { status(error.message, true); return; }
          cancelRequest(); input.value = url; draft = null; titleInput = null; display.replaceChildren();
          const id = requestId;
          const requestController = new AbortController(); controller = requestController; const signal = requestController.signal;
          let timedOut = false;
          const timeout = setTimeout(() => { timedOut = true; requestController.abort(); }, 25_000);
          const aborted = new Promise((_, reject) => signal.addEventListener('abort', () => reject(new Error('ABORTED')), { once: true }));
          busy = true; status(kind === 'feed' ? '正在读取订阅…' : '正在提取正文…'); sync();
          try {
            const result = await Promise.race([fetchText(context, url, signal), aborted]);
            if (!mounted || id !== requestId) return;
            input.value = result.url;
            if (kind === 'feed') {
              const items = parseFeed(result.body, result.url);
              if (!items.length) throw new Error('没有找到 RSS/Atom 文章条目。');
              renderFeed(items); status(`共 ${items.length} 篇，显示前 ${Math.min(items.length, 50)} 篇。提取全文后再保存。`);
            } else {
              const value = extractArticle(result.body, result.url);
              if (value.kind === 'bookmark') {
                showDraft({ ...value, kind: 'unavailable' });
                status(value.warning, true);
              } else { showDraft(value); status(`已提取 ${value.characters} 字，请核对正文后保存。`); }
            }
          } catch (error) {
            if (!mounted || id !== requestId) return;
            const reason = timedOut ? '读取超时。可重试，或从原网页复制正文后粘贴。'
              : /size|limit|too large/i.test(error.message || '') ? '页面超出抓取大小限制，请复制正文后粘贴。'
                : error.message === 'ABORTED' ? '已取消读取。' : error.message || '无法读取网页，请重试或手动粘贴正文。';
            status(reason, true);
          } finally {
            clearTimeout(timeout);
            if (mounted && id === requestId) { busy = false; controller = null; sync(); }
          }
        }

        function renderFeed(items) {
          display.replaceChildren();
          for (const item of items.slice(0, 50)) {
            const row = element('section', 'wc-feed-item');
            row.append(element('p', 'wc-feed-title', item.title), element('p', 'wc-hint', `${item.kind === 'feed-content' ? '订阅正文' : '订阅摘要'} · ${item.characters} 字`));
            const buttons = element('div', 'wc-row');
            const full = button('提取全文', () => load('article', item.url), true);
            full.disabled = !item.url.startsWith('https:');
            if (full.disabled) full.title = '此条目没有可抓取的 HTTPS 文章链接';
            const inspect = button('预览订阅内容', () => {
              cancelRequest();
              const url = item.url || input.value;
              input.value = url;
              showDraft({ ...item, url, warning: '这是订阅源提供的内容，可能不是原网页全篇。需要完整文章时请点击“提取正文”。' });
              status(item.kind === 'feed-summary' ? '当前预览是订阅摘要，保存时会注明。' : '请核对订阅提供的正文。');
            });
            buttons.append(full, inspect); row.append(buttons); display.append(row);
          }
        }

        async function saveDraft() {
          if (save.disabled || !draft || saving) return;
          const target = draft;
          const payload = noteInput(target, titleInput.value, notebooks.value);
          saving = true; sync(); status('正在保存笔记…');
          try {
            const note = await context.notes.create(payload);
            target.saved = true; target.savedId = note?.id || null;
            status('已保存到所选笔记本。');
            context.ui.showNotice('已收藏：' + payload.title);
          } catch { status('保存未完成，预览内容已保留。请检查网络及笔记本；如果连接中断，先确认笔记本中是否已经生成笔记再重试。', true); }
          finally { saving = false; sync(); }
        }
        sync(); void loadNotebooks();
        const cleanup = () => { mounted = false; requestId++; controller?.abort(); cleanupPanels.delete(cleanup); root.remove(); };
        cleanupPanels.add(cleanup); return cleanup;
      },
    });
    const disposeCommand = context.commands.register({ id: 'open-web-clipper', title: '网页收藏', listed: true,
      async run() { await context.ui.panels.open('web-clipper-panel'); } });
    return () => { for (const cleanup of [...cleanupPanels]) cleanup(); disposeCommand(); disposePanel(); };
  },
};
