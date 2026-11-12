import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
const files = {
  '/': [new URL('./harness.html', import.meta.url), 'text/html; charset=utf-8'],
  '/harness.js': [new URL('./harness.js', import.meta.url), 'text/javascript; charset=utf-8'],
  '/fixtures.js': [new URL('./fixtures.js', import.meta.url), 'text/javascript; charset=utf-8'],
  '/main.js': [new URL('../main.js', import.meta.url), 'text/javascript; charset=utf-8'],
};
createServer(async (request, response) => {
  const target = files[new URL(request.url, 'http://127.0.0.1').pathname];
  if (!target) { response.writeHead(404); response.end(); return; }
  response.writeHead(200, { 'Content-Type': target[1], 'Cache-Control': 'no-store' });
  response.end(await readFile(target[0]));
}).listen(4181, '127.0.0.1');
