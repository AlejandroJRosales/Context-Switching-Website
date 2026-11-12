// LISTENERS: every event listener on window, document and the canvas once the intro has loaded, in registration order,
// with each handler's first source line. Diff two pages' outputs to check the listener order survived a change.
//   node listeners.mjs <rootDir> <page.html> <out.txt> [--three <local three dir>]
// The output normalizes play.active/play.locked to active/locked (the phase 7 owner) and trailing whitespace.
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path'; import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'playwright');
const args = process.argv.slice(2);
const [root, pagePath, out] = args;
const threeDir = args.includes('--three') ? args[args.indexOf('--three') + 1] : null;
if (!root || !pagePath || !out) { console.error('usage: node listeners.mjs <rootDir> <page.html> <out.txt> [--three <dir>]'); process.exit(2); }
const TYPES = { '.html': 'text/html', '.js': 'text/javascript' };
const server = http.createServer((req, res) => { const f = path.join(path.resolve(root), decodeURIComponent(new URL(req.url, 'http://x').pathname)); if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end(); } res.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(res); });
await new Promise(r => server.listen(0, '127.0.0.1', r));
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage();
await page.addInitScript(() => { try { localStorage.setItem('graphics', 'low'); } catch (e) { } });
if (threeDir) await page.route('https://unpkg.com/three@0.160.0/**', route => route.fulfill({ status: 200, contentType: 'text/javascript', body: fs.readFileSync(path.join(threeDir, route.request().url().slice('https://unpkg.com/three@0.160.0/'.length))) }));
const cdp = await page.context().newCDPSession(page);
const starts = new Map();   // scriptId -> { line, col } where an inline script starts in its page
cdp.on('Debugger.scriptParsed', e => starts.set(e.scriptId, { line: e.startLine, col: e.startColumn }));
await cdp.send('Debugger.enable');
await page.goto(`http://127.0.0.1:${server.address().port}/${pagePath}`);
await page.waitForTimeout(6000);
const lines = [];
const scripts = new Map();
for (const expr of ['window', 'document', "document.querySelector('canvas')"]) {
  const { result } = await cdp.send('Runtime.evaluate', { expression: expr });
  const { listeners } = await cdp.send('DOMDebugger.getEventListeners', { objectId: result.objectId, objectGroup: 'listeners' });
  for (const l of listeners) {
    // the handler's own source, from its script and position (the handler object is not always returned)
    let src = '';
    if (l.scriptId) {
      if (!scripts.has(l.scriptId)) scripts.set(l.scriptId, (await cdp.send('Debugger.getScriptSource', { scriptId: l.scriptId })).scriptSource.split('\n'));
      const ls = scripts.get(l.scriptId), st = starts.get(l.scriptId) || { line: 0, col: 0 };
      const li = l.lineNumber - st.line, col = li === 0 ? l.columnNumber - st.col : l.columnNumber;
      src = (ls[li] || '').slice(col);
    }
    lines.push(`${expr} ${l.type}${l.useCapture ? ' capture' : ''}${l.passive ? ' passive' : ''} :: ${src.replace(/play\.(active|locked)/g, '$1').replace(/\s+/g, ' ').trim().slice(0, 100)}`);
  }
}
fs.writeFileSync(out, lines.join('\n') + '\n');
console.log(pagePath, lines.length, 'listeners');
await browser.close(); server.close();
