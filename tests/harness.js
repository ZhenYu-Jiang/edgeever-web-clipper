import plugin from '/main.js';
import { ARTICLE, FEED, ATOM } from '/fixtures.js';
if (location.search.includes('dark')) document.body.classList.add('dark');
const host = window.host = {
  created: [], createAttempts: 0, requests: [], notices: [], opened: [],
  failSave: false, failNotebooks: false, saveDelay: 0, notebookDelay: 0,
  uploads: [], edits: [], existing: [], failUpload: false, failEdit: false, externalEdit: false,
  notebooks: [{ id: 'n1', name: '收集箱' }, { id: 'n2', name: '阅读笔记' }],
  responses: {
    'https://example.com/posts/article': { body: ARTICLE },
    'https://example.com/feed': { body: FEED, type: 'application/rss+xml' },
    'https://example.com/atom': { body: ATOM, type: 'application/atom+xml' },
    'https://example.com/summary': { body: '<title>动态网页</title><meta name="description" content="网站简介"><div id="app"></div>' },
    'https://example.com/images/article.png': { bytes: Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j7ioAAAAASUVORK5CYII='),c=>c.charCodeAt(0)), type: 'image/png' },
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
  resources: { async upload(noteId,file) {
    if(host.failUpload)throw Error('Upload failed');
    host.uploads.push({noteId,name:file.name,type:file.type,size:file.size});return {url:'/api/v1/resources/image-'+host.uploads.length+'/file'};
  } },
  notes: { async create(input) {
    host.createAttempts++;
    if (host.saveDelay) await pause(host.saveDelay);
    if (host.failSave) throw new Error('Offline');
    host.created.push(structuredClone(input));
    return { id: 'note-' + host.created.length, ...input };
  },
    async queryContent() { return { notes: structuredClone(host.existing), totalCount: host.existing.length }; },
    async get(id) { const note=host.created[Number(id.slice(5))-1];return {id,...structuredClone(note),revision:host.edits.length+1,contentHash:'hash-'+host.edits.length,contentMarkdown:note.contentMarkdown+(host.externalEdit?'\n用户新修改':'')}; },
    async editMarkdown(id,input) {
      if(host.failEdit)throw Error('Revision conflict');
      if(input.expectedRevision!==host.edits.length+1 || input.expectedContentHash!=='hash-'+host.edits.length)throw Error('Invalid revision guard');
      const note=host.created[Number(id.slice(5))-1];
      for(const edit of [...input.edits].reverse())note.contentMarkdown=note.contentMarkdown.slice(0,edit.from)+edit.insert+note.contentMarkdown.slice(edit.to);
      host.edits.push(input);return this.get(id);
    },
  },
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
