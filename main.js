// 网页收藏 / RSS 订阅插件
// 输入网址：可「收藏网页」或「读取 RSS」，把内容存成笔记。
export default {
  activate(context) {
    const STYLE = `
.wc-root { font-family: inherit; color: inherit; padding: 4px 2px; display: grid; gap: 14px; }
.wc-row { display: flex; gap: 8px; }
.wc-input, .wc-select {
  box-sizing: border-box; min-width: 0; padding: 9px 11px; border-radius: 7px;
  border: 1px solid color-mix(in srgb, currentColor 18%, transparent);
  background: transparent; color: inherit; font: inherit; font-size: 13px;
}
.wc-input { flex: 1; }
.wc-input:focus, .wc-select:focus { outline: 2px solid #3f7d5c; outline-offset: 1px; }
.wc-btn {
  padding: 9px 14px; border-radius: 7px; border: 1px solid color-mix(in srgb, currentColor 18%, transparent);
  background: transparent; color: inherit; font: inherit; font-size: 13px; cursor: pointer; white-space: nowrap;
}
.wc-btn:hover { background: color-mix(in srgb, currentColor 6%, transparent); }
.wc-btn.primary { background: #3f7d5c; border-color: #3f7d5c; color: #ffffff; }
.wc-btn.primary:hover { background: #366b4f; }
.wc-hint { font-size: 12px; color: color-mix(in srgb, currentColor 50%, transparent); }
.wc-item { padding: 10px 2px; border-bottom: 1px solid color-mix(in srgb, currentColor 8%, transparent); }
.wc-item .t { font-size: 14px; }
.wc-item .d { font-size: 12px; color: color-mix(in srgb, currentColor 50%, transparent); margin: 3px 0 8px; line-height: 1.5; }
.wc-msg { font-size: 13px; color: color-mix(in srgb, currentColor 60%, transparent); padding: 10px 2px; line-height: 1.6; }
`;

    function stripHtml(s) {
      if (!s) return "";
      return s
        .replace(/<[^>]+>/g, " ")
        .replace(/&nbsp;/g, " ")
        .replace(/&amp;/g, "&")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/&rsquo;|&lsquo;/g, "'")
        .replace(/&ldquo;|&rdquo;/g, '"')
        .replace(/\s+/g, " ")
        .trim();
    }

    function textOf(el) {
      return el && el.textContent ? el.textContent.trim() : "";
    }

    async function getNotebooks() {
      const list = await context.notebooks.list();
      return list.length ? list : null;
    }

    async function saveNote(title, link, description, notebookId) {
      const lines = [];
      if (title) lines.push("# " + title);
      if (link) lines.push("> 来源：" + link);
      lines.push("");
      lines.push(description || "");
      const md = lines.join("\n").trim();
      await context.notes.create({
        notebookId,
        title: title || "未命名收藏",
        contentMarkdown: md,
        tags: ["收藏"],
      });
    }

    async function clipPage(url, notebookId) {
      const res = await context.network.fetch(url, { transport: "public" });
      if (!res.ok) throw new Error("抓取失败（HTTP " + res.status + "）");
      const html = await res.text();
      const doc = new DOMParser().parseFromString(html, "text/html");
      const title = textOf(doc.querySelector("title")) || url;
      const metaDesc = doc.querySelector('meta[name="description"]') ||
        doc.querySelector('meta[property="og:description"]');
      const description = metaDesc ? metaDesc.getAttribute("content") || "" : "";
      await saveNote(title, url, stripHtml(description), notebookId);
      return title;
    }

    function parseFeed(xml) {
      const doc = new DOMParser().parseFromString(xml, "text/xml");
      if (doc.querySelector("parsererror")) throw new Error("这不是有效的 RSS/XML 内容");
      const items = [];
      doc.querySelectorAll("item").forEach((node) => {
        items.push({
          title: textOf(node.querySelector("title")),
          link: textOf(node.querySelector("link")),
          description: stripHtml(textOf(node.querySelector("description"))),
        });
      });
      if (items.length === 0) {
        doc.querySelectorAll("entry").forEach((node) => {
          const linkEl = node.querySelector("link");
          items.push({
            title: textOf(node.querySelector("title")),
            link: linkEl ? linkEl.getAttribute("href") || "" : "",
            description: stripHtml(textOf(node.querySelector("summary") || node.querySelector("content"))),
          });
        });
      }
      return items.filter((i) => i.title);
    }

    const disposePanel = context.ui.panels.register({
      id: "web-clipper-panel",
      title: "网页收藏",
      purpose: "dashboard",
      presentation: "dialog",
      mount(container, { shell }) {
        shell.set({
          header: {
            title: "网页收藏",
            description: "收藏网页，或订阅 RSS 把文章存成笔记",
          },
        });

        const style = document.createElement("style");
        style.textContent = STYLE;
        const root = document.createElement("div");
        root.className = "wc-root";
        root.append(style);
        container.append(root);

        // 输入区
        const urlRow = document.createElement("div");
        urlRow.className = "wc-row";
        const input = document.createElement("input");
        input.className = "wc-input";
        input.type = "url";
        input.placeholder = "粘贴网页或 RSS 地址（需 https）";
        urlRow.append(input);
        root.append(urlRow);

        const btnRow = document.createElement("div");
        btnRow.className = "wc-row";
        const clipBtn = document.createElement("button");
        clipBtn.className = "wc-btn primary";
        clipBtn.textContent = "收藏网页";
        const rssBtn = document.createElement("button");
        rssBtn.className = "wc-btn";
        rssBtn.textContent = "读取 RSS";
        btnRow.append(clipBtn, rssBtn);
        root.append(btnRow);

        const nbRow = document.createElement("div");
        nbRow.className = "wc-row";
        const nbSelect = document.createElement("select");
        nbSelect.className = "wc-select";
        nbSelect.style.flex = "1";
        nbRow.append(nbSelect);
        root.append(nbRow);

        const hint = document.createElement("div");
        hint.className = "wc-hint";
        hint.textContent = "收藏到所选笔记本，标签自动加「收藏」。";
        root.append(hint);

        const result = document.createElement("div");
        root.append(result);

        async function initNotebooks() {
          try {
            const nbs = await getNotebooks();
            if (!nbs) {
              const opt = document.createElement("option");
              opt.textContent = "没有可用笔记本";
              opt.disabled = true;
              nbSelect.append(opt);
              return;
            }
            for (const nb of nbs) {
              const opt = document.createElement("option");
              opt.value = nb.id;
              opt.textContent = nb.name || "未命名";
              nbSelect.append(opt);
            }
          } catch (e) {
            hint.textContent = "读取笔记本失败：" + (e && e.message ? e.message : e);
          }
        }

        function msg(text) {
          result.replaceChildren();
          const el = document.createElement("div");
          el.className = "wc-msg";
          el.textContent = text;
          result.append(el);
        }

        async function currentNotebook() {
          if (nbSelect.value) return nbSelect.value;
          const nbs = await getNotebooks();
          return nbs && nbs[0] ? nbs[0].id : null;
        }

        clipBtn.onclick = async () => {
          const url = input.value.trim();
          if (!/^https:\/\//i.test(url)) {
            msg("仅支持 https 地址，请检查链接。");
            return;
          }
          clipBtn.disabled = true;
          clipBtn.textContent = "收藏中…";
          try {
            const notebookId = await currentNotebook();
            if (!notebookId) throw new Error("没有可用笔记本");
            const title = await clipPage(url, notebookId);
            msg("已收藏：《" + title + "》");
          } catch (e) {
            msg("收藏失败：" + (e && e.message ? e.message : e));
          } finally {
            clipBtn.disabled = false;
            clipBtn.textContent = "收藏网页";
          }
        };

        rssBtn.onclick = async () => {
          const url = input.value.trim();
          if (!/^https:\/\//i.test(url)) {
            msg("仅支持 https 地址，请检查链接。");
            return;
          }
          rssBtn.disabled = true;
          rssBtn.textContent = "读取中…";
          result.replaceChildren();
          try {
            const res = await context.network.fetch(url, { transport: "public" });
            if (!res.ok) throw new Error("读取失败（HTTP " + res.status + "）");
            const xml = await res.text();
            const items = parseFeed(xml);
            if (items.length === 0) {
              msg("没有解析到文章条目。");
              return;
            }
            const title = document.createElement("div");
            title.className = "wc-hint";
            title.textContent = "共 " + items.length + " 条，点击「收藏」存入笔记：";
            result.append(title);
            for (const item of items.slice(0, 30)) {
              const box = document.createElement("div");
              box.className = "wc-item";
              const t = document.createElement("div");
              t.className = "t";
              t.textContent = item.title;
              const d = document.createElement("div");
              d.className = "d";
              d.textContent = item.description || item.link || "";
              const save = document.createElement("button");
              save.className = "wc-btn";
              save.textContent = "收藏";
              save.onclick = async () => {
                try {
                  const notebookId = await currentNotebook();
                  if (!notebookId) throw new Error("没有可用笔记本");
                  await saveNote(item.title, item.link, item.description, notebookId);
                  save.textContent = "已收藏";
                  save.disabled = true;
                  context.ui.showNotice("已收藏：" + item.title);
                } catch (e) {
                  context.ui.showNotice("收藏失败：" + (e && e.message ? e.message : e));
                }
              };
              box.append(t, d, save);
              result.append(box);
            }
          } catch (e) {
            msg("读取 RSS 失败：" + (e && e.message ? e.message : e));
          } finally {
            rssBtn.disabled = false;
            rssBtn.textContent = "读取 RSS";
          }
        };

        initNotebooks();
        return () => root.remove();
      },
    });

    const disposeCmd = context.commands.register({
      id: "open-web-clipper",
      title: "网页收藏",
      listed: true,
      async run() {
        await context.ui.panels.open("web-clipper-panel");
      },
    });

    return () => {
      disposeCmd();
      disposePanel();
    };
  },
};
