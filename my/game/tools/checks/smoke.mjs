// SMOKE: load a page from a local static server in headless Chromium and read the game's own Debug readout.
//   node smoke.mjs <rootDir> <page.html> [--three <dir containing three/build and three/examples>] [--wild] [--low] [--walk] [--survivor] [--fast]
// Steps: the intro scene (readout), then with --wild a City-off wilderness load (Start), Observer, Go (readout again).
// Prints script errors (page errors and console errors) and the readout's shader line. Exit 1 on any script error or a
// failed shader program. --three serves https://unpkg.com/three@0.160.0/... from a local copy, for machines that cannot
// reach unpkg (the page itself is not changed).
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'playwright');
const args = process.argv.slice(2);
const [rootDir, pagePath] = args;
const threeDir = args.includes('--three') ? args[args.indexOf('--three') + 1] : null;
const wild = args.includes('--wild');
const low = args.includes('--low');   // start on Graphics low (the saved choice the game reads at startup)
const walk = args.includes('--walk');   // after Go: walk, jump and sprint on the keyboard (player collision and footing)
const survivor = args.includes('--survivor');
const fast = args.includes('--fast');   // Custom size: smallest map, fewest people; shorter waits and walk   // choose Survivor instead of Observer (game.update and the avatar run)
if (!rootDir || !pagePath) { console.error('usage: node smoke.mjs <rootDir> <page.html> [--three <dir>] [--wild]'); process.exit(2); }

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png' };
const THREE_URL = 'https://unpkg.com/three@0.160.0/';
const READOUT_WAIT_MS = fast ? 1200 : 2500;
const INTRO_WAIT_MS = fast ? 3000 : 6000;
const LOAD_TIMEOUT_MS = 240000;

const server = http.createServer((req, res) => {
  const file = path.join(path.resolve(rootDir), decodeURIComponent(new URL(req.url, 'http://x').pathname));
  if (!file.startsWith(path.resolve(rootDir)) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}/`;

const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
// fast: a small viewport, so software rendering costs ~7x fewer pixels per frame
const page = await browser.newPage({ viewport: fast ? { width: 480, height: 300 } : { width: 1280, height: 800 } });
if (low) await page.addInitScript(() => { try { localStorage.setItem('graphics', 'low'); } catch (e) { } });
const errors = [];
page.on('crash', () => errors.push('renderer process crashed'));
page.on('pageerror', e => errors.push('pageerror: ' + e.message));
page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
page.on('requestfailed', r => errors.push(`request failed: ${r.url()} (${r.failure() && r.failure().errorText})`));
if (threeDir) await page.route(THREE_URL + '**', route => {
  const rel = route.request().url().slice(THREE_URL.length);
  const file = path.join(threeDir, rel);
  if (!fs.existsSync(file)) return route.fulfill({ status: 404 });
  route.fulfill({ status: 200, contentType: 'text/javascript', body: fs.readFileSync(file) });
});

// the readout refreshes only while the settings sheet is open; the test opens it directly
async function readout(label) {
  await page.evaluate(() => {
    document.getElementById('settings').classList.add('on');
    const info = document.getElementById('debuginfo');
    if (info.hidden) document.getElementById('debug').click();
  });
  await page.waitForTimeout(READOUT_WAIT_MS);
  const text = await page.evaluate(() => document.getElementById('debuginfo').value);
  await page.evaluate(() => { document.getElementById('debug').click(); document.getElementById('settings').classList.remove('on'); });
  const pick = re => (text.split('\n').find(l => re.test(l)) || '(none)').trim();
  console.log(`[${label}] ${pick(/^Graphics:/)}`);
  // the mode in play: Survivor turns the needs panel on and names the new-world button 'New game'
  const mode = await page.evaluate(() => ({ needs: document.getElementById('needs').classList.contains('on'), button: document.getElementById('neweco').textContent }));
  console.log(`[${label}] Mode: needs panel ${mode.needs ? 'on' : 'off'}, button "${mode.button}"`);
  console.log(`[${label}] ${pick(/^Shaders:/)}`);
  console.log(`[${label}] ${pick(/^People:/)}`);
  console.log(`[${label}] ${pick(/^Main render:/)}`);
  const se = text.slice(text.indexOf('Script errors:'));
  console.log(`[${label}] ${se.split('\n').join(' | ')}`);
  return { text, failed: /FAILED program/.test(text) || /\b[1-9]\d* failed to link/.test(text), scriptErrors: !/Script errors: none/.test(text) };
}

let bad = false;
await page.goto(base + pagePath);
await page.waitForTimeout(INTRO_WAIT_MS);
// fast: one readout, at the last stage (each readout waits on the page's long software-rendered frames)
let r;
if (!fast || !wild) { r = await readout('intro'); bad ||= r.failed || r.scriptErrors; }

if (wild) {
  const t0 = Date.now();
  if (fast) await page.evaluate(() => {   // the world size the Custom row sets: map level 1, the people slider's minimum
    document.querySelector('.sizebtn[data-size="custom"]').click();
    const size = document.getElementById('size'), people = document.getElementById('people');
    size.value = size.min; people.value = people.min;
  });
  await page.evaluate(() => document.getElementById('startgo').click());
  await page.waitForFunction(() => { const c = document.getElementById('choose'); return c && getComputedStyle(c).display !== 'none' && c.offsetParent !== null; }, null, { timeout: LOAD_TIMEOUT_MS });
  console.log(`[wild] choice shown after ${((Date.now() - t0) / 1000).toFixed(1)} s`);
  await page.evaluate(mode => { document.getElementById(mode).click(); document.getElementById('chooseGo').click(); }, survivor ? 'chooseGame' : 'chooseObs');
  await page.waitForTimeout(INTRO_WAIT_MS);
  if (!fast || !walk) { r = await readout('wild'); bad ||= r.failed || r.scriptErrors; }
  if (walk) {
    const hold = async (keys, ms) => { for (const k of keys) await page.keyboard.down(k); await page.waitForTimeout(ms); for (const k of keys) await page.keyboard.up(k); };
    const k = fast ? 0.4 : 1;
    await hold(['KeyW'], 3000 * k);
    await hold(['KeyW', 'Space'], 600);
    await hold(['ShiftLeft', 'KeyW', 'KeyA'], 3000 * k);
    await hold(['KeyS', 'KeyD'], 2000 * k);
    r = await readout('walk');
    bad ||= r.failed || r.scriptErrors;
  }
}

console.log(`\n# Script errors seen by the browser: ${errors.length}`);
for (const e of errors) console.log('  ' + e);
await browser.close();
server.close();
process.exit(bad || errors.length ? 1 : 0);
