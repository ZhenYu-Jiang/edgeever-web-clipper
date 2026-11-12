import plugin from '/main.js';
import { ARTICLE, FEED, ATOM } from '/fixtures.js';
if (location.search.includes('dark')) document.body.classList.add('dark');
const host = window.host = {
  created: [], createAttempts: 0, requests: [], notices: [], opened: [],
  failSave: false, failNotebooks: false, saveDelay: 0, notebookDelay: 0,
  notebooks: [{ id: 'n1', name: '收集箱' }, { id: 'n2', name: '阅读笔记' }],
  responses: {
    'https://example.com/posts/article': { body: ARTICLE },
    'https://example.com/feed': { body: FEED, type: 'application/rss+xml' },
    'https://example.com/atom': { body: ATOM, type: 'application/atom+xml' },
    'https://example.com/summary': { body: '<title>动态网页</title><meta name="description" content="网站简介"><div id="app"></div>' },
  },
};
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
let panel, command, cleanup;
const context = {
  notebooks: { async list() { if (host.notebookDelay) await pause(host.notebookDelay); if (host.failNotebooks) throw new Error('Offline'); return structuredClone(host.notebooks); } },
  network: { async fetch(url, options) {
    host.requests.push({ url, transport: options.transport, method: options.method });
    const entry = host.responses[url];
    if (!entry) throw new Error('No fixture for this URL');
    if (entry.delay) await pause(entry.delay); // Intentionally ignores abort to verify stale-response protection.
    if (entry.error) throw new Error(entry.error);
    return new Response(entry.bytes ? new Uint8Array(entry.bytes) : entry.body || '', { status: entry.status || 200, headers: { 'content-type': entry.type || 'text/html; charset=utf-8', ...(entry.headers || {}) } });
  } },
  notes: { async create(input) {
    host.createAttempts++;
    if (host.saveDelay) await pause(host.saveDelay);
    if (host.failSave) throw new Error('Offline');
    host.created.push(structuredClone(input));
    return { id: 'note-' + host.created.length, ...input };
  } },
  ui: {
    showNotice(message) { host.notices.push(message); },
    async openNote(id) { host.opened.push(id); },
    panels: {
      register(value) { panel = value; return () => {}; },
      async open() {
        cleanup?.(); cleanup = panel.mount(document.getElementById('container'), { shell: { set({ header }) {
          document.getElementById('title').textContent = header.title;
          document.getElementById('description').textContent = header.description;
        } } });
      },
    },
  },
  commands: { register(value) { command = value; return () => {}; } },
};
const deactivate = plugin.activate(context);
host.close = () => { cleanup?.(); cleanup = undefined; };
host.deactivate = () => { host.close(); deactivate(); };
await command.run();
