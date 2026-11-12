// GAME PAGE: serve a folder, open index.html in headless Chromium, load a City-off wilderness and start Observer or Survivor.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'playwright');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png' };
const THREE_URL = 'https://unpkg.com/three@0.160.0/';
const SETTLE_MS = 3000;   // after the page and after Go, as smoke.mjs's --fast waits
export const WAIT_LIMIT_MS = 180000;   // one test's wait; past it the test is reported as timed out

// Opens the game and loads the smallest wilderness; resolves once play has started. errors: script errors and crashes.
export async function openGame({ rootDir, pagePath = 'index.html', threeDir = null, low = true, survivor = false }) {
  const server = http.createServer((req, res) => {
    const file = path.join(path.resolve(rootDir), decodeURIComponent(new URL(req.url, 'http://x').pathname));
    if (!file.startsWith(path.resolve(rootDir)) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream' });
    fs.createReadStream(file).pipe(res);
  });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}/`;
  const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const page = await browser.newPage({ viewport: { width: 480, height: 300 } });
  if (low) await page.addInitScript(() => { try { localStorage.setItem('graphics', 'low'); } catch (e) { } });
  const errors = [];
  let crashed = null;
  const crash = new Promise(r => { crashed = r; });
  page.on('crash', () => { errors.push('renderer process crashed'); crashed(); });
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  if (threeDir) await page.route(THREE_URL + '**', route => {
    const file = path.join(threeDir, route.request().url().slice(THREE_URL.length));
    if (!fs.existsSync(file)) return route.fulfill({ status: 404 });
    route.fulfill({ status: 200, contentType: 'text/javascript', body: fs.readFileSync(file) });
  });
  await page.goto(base + pagePath);
  await page.waitForTimeout(SETTLE_MS);
  await page.evaluate(() => {
    document.querySelector('.sizebtn[data-size="custom"]').click();
    const size = document.getElementById('size'), people = document.getElementById('people');
    size.value = size.min; people.value = people.min;
    const city = document.querySelector('#more .switch[data-opt="city"]');
    if (city.classList.contains('on')) city.click();
    document.getElementById('go').click();
  });
  await page.waitForFunction(() => { const c = document.getElementById('choose'); return c && c.offsetParent !== null; }, null, { timeout: 0 });
  const loadText = await page.evaluate(() => document.getElementById('steps').textContent);
  await page.evaluate(mode => { document.getElementById(mode).click(); document.getElementById('chooseGo').click(); }, survivor ? 'chooseGame' : 'chooseObs');
  await page.waitForTimeout(SETTLE_MS);
  // until(fn, arg): polls fn in the page for up to WAIT_LIMIT_MS; rejects on time out or a renderer crash
  const until = (fn, arg) => Promise.race([
    page.waitForFunction(fn, arg, { timeout: WAIT_LIMIT_MS, polling: 200 }).then(h => h.jsonValue()),
    crash.then(() => { throw new Error('renderer process crashed'); })
  ]);
  const close = async () => { await browser.close(); server.close(); };
  return { page, errors, loadText, until, close };
}
