import { build } from 'esbuild';
import { readFile, writeFile } from 'node:fs/promises';

const packages = ['@mozilla/readability', 'dompurify', 'turndown', 'turndown-plugin-gfm'];
const notices = [];
for (const name of packages) {
  const root = new URL(`../node_modules/${name}/`, import.meta.url);
  const metadata = JSON.parse(await readFile(new URL('package.json', root), 'utf8'));
  let license;
  for (const file of ['LICENSE', 'LICENSE.md', 'LICENSE.txt']) {
    try { license = await readFile(new URL(file, root), 'utf8'); break; } catch {}
  }
  if (!license) throw new Error(`Missing license for ${name}`);
  notices.push(`${name} ${metadata.version}\n${license.replace(/\r\n?/g, '\n').trim()}`);
}
const notice = notices.join('\n\n------------------------------\n\n') + '\n';
await writeFile(new URL('../THIRD_PARTY_NOTICES.txt', import.meta.url), notice);
await build({
  entryPoints: ['src/main.js'], outfile: 'main.js', bundle: true, format: 'esm',
  platform: 'browser', target: 'es2020', charset: 'utf8', legalComments: 'eof',
  banner: { js: '/*! Bundled dependency licenses\n' + notice.replaceAll('*/', '* /') + '*/' },
});
