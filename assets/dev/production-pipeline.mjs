#!/usr/bin/env node
// production-pipeline: compress-pipeline plus code protection, for single-file HTML/WebGL games.
// Stages: shell split -> GLSL pass -> domain-lock inject -> terser -> obfuscate -> css/html squeeze -> license header -> verify
//
//   node production-pipeline.mjs game.html --domains "example.com" [-o out.html] [--license file.txt]
//        [--no-obfuscate] [--no-domain-lock] [--glsl-rename] [--no-glsl] [--no-html] [--quiet]
//
// deps: terser acorn acorn-walk javascript-obfuscator (+ optional @shaderfrog/glsl-parser for shader parse checks)
import fs from 'node:fs';
import zlib from 'node:zlib';
import { minify } from 'terser';
import * as acorn from 'acorn';
import * as walk from 'acorn-walk';

let parseGLSL = null;
try { ({ parse: parseGLSL } = await import('@shaderfrog/glsl-parser/parser/parser.js')); } catch { }
if (!parseGLSL) try { ({ parser: { parse: parseGLSL } } = await import('@shaderfrog/glsl-parser')); } catch { }

// ---------- args ----------
const argv = process.argv.slice(2);
const flag = f => argv.includes(f);
const val = f => { const i = argv.indexOf(f); return i >= 0 ? argv[i + 1] : undefined; };
const VALUED = new Set(['-o', '--domains', '--license']);
const input = argv.find((a, i) => !a.startsWith('-') && !VALUED.has(argv[i - 1]));
const USAGE = 'usage: production-pipeline <in.html> --domains "a.com,b.com" [-o out.html] [--license file.txt]\n' +
  '       [--no-obfuscate] [--no-domain-lock] [--glsl-rename] [--no-glsl] [--no-html] [--quiet]';
if (!input) { console.error(USAGE); process.exit(2); }
const OPT = {
  output: val('-o') ?? input.replace(/\.html?$/, '') + '.prod.html',
  domains: (val('--domains') ?? '').split(',').map(d => d.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/[/:].*$/, '').replace(/\.$/, '')).filter(Boolean),
  license: val('--license'),
  obfuscate: !flag('--no-obfuscate'),
  lock: !flag('--no-domain-lock'),
  rename: flag('--glsl-rename'),
  glsl: !flag('--no-glsl'),
  html: !flag('--no-html'),
  quiet: flag('--quiet'),
};
if (OPT.lock && !OPT.domains.length) { console.error('--domains is required unless --no-domain-lock\n' + USAGE); process.exit(2); }
const log = (...a) => OPT.quiet || console.log(...a);
const fail = m => { console.error('VERIFY FAIL: ' + m); process.exit(1); };
const kb = n => (n / 1024).toFixed(1) + ' KB';
const gz = s => zlib.gzipSync(Buffer.from(s), { level: 9 }).length;

const TERSER = {
  module: true,
  compress: { passes: 3, toplevel: true, unsafe: true, unsafe_math: true, pure_getters: true, booleans_as_integers: true },
  mangle: { toplevel: true },
  output: { quote_style: 1 },
  parse: {},
  rename: {},
};

// Tuned for a per-frame game loop: everything that slows hot code or rewrites Three.js option / uniform objects is off;
// the encoded string array is the protection that stays on.
const OBFUSCATOR = {
  compact: true,
  target: 'browser',
  sourceType: 'module',
  controlFlowFlattening: false,
  deadCodeInjection: false,
  debugProtection: false,
  selfDefending: false,
  numbersToExpressions: false,
  transformObjectKeys: false,
  simplify: true,
  splitStrings: false,
  unicodeEscapeSequence: false,
  renameGlobals: false,
  identifierNamesGenerator: 'mangled',
  stringArray: true,
  stringArrayEncoding: ['base64'],
  stringArrayThreshold: 0.75,
  stringArrayRotate: true,
  stringArrayShuffle: true,
  stringArrayIndexShift: true,
  stringArrayWrappersCount: 1,
  stringArrayCallsTransform: false,
};

const src = fs.readFileSync(input, 'utf8').replace(/\r\n?/g, '\n');
const title = (src.match(/<title>([^<]*)<\/title>/i) || [])[1]?.trim() || 'This software';

// ---------- 1. split shell ----------
const parts = [];   // { kind: 'html' | 'css' | 'js' | 'json' | 'raw', text, open, close }
{
  const re = /(<script\b[^>]*>)([\s\S]*?)(<\/script>)|(<style\b[^>]*>)([\s\S]*?)(<\/style>)/gi;
  let last = 0, m;
  while ((m = re.exec(src))) {
    parts.push({ kind: 'html', text: src.slice(last, m.index) });
    if (m[1]) {
      const type = (m[1].match(/type\s*=\s*["']?([^"'\s>]+)/i) || [])[1] || 'text/javascript';
      const kind = /\bsrc\s*=/.test(m[1]) ? 'raw'
        : type === 'importmap' || /json/.test(type) ? 'json'
          : /^(module|text\/javascript|application\/javascript)$/.test(type) ? 'js' : 'raw';
      parts.push({ kind, text: m[2], open: m[1], close: m[3], module: type === 'module' });
    } else {
      parts.push({ kind: 'css', text: m[5], open: m[4], close: m[6] });
    }
    last = re.lastIndex;
  }
  parts.push({ kind: 'html', text: src.slice(last) });
}
const jsParts = parts.filter(p => p.kind === 'js');
if (!jsParts.length) fail('no inline script found');
const main = jsParts.find(p => p.module) || jsParts[jsParts.length - 1];
log(`split      ${jsParts.length} script(s), ${parts.filter(p => p.kind === 'css').length} style(s); protecting the ${main.module ? 'module' : 'last'} script`);

// ---------- 2. GLSL pass ----------
const GLSL_MARK = /\b(gl_Position|gl_FragColor|gl_FragCoord|void\s+main\s*\(|precision\s+(high|medium|low)p)\b|#include\s*<|^\s*(uniform|varying|attribute|in|out)\s+(lowp\s+|mediump\s+|highp\s+)?(float|int|bool|[biu]?vec[234]|mat[234]|sampler2D|samplerCube)\b/m;
const NOT_GLSL = /<\/?(?:html|head|body|div|span|p|a|b|i|em|strong|br|hr|button|label|input|select|option|form|section|header|footer|nav|main|article|h[1-6]|ul|ol|li|table|tr|td|th|img|svg|canvas|style|script)\b[^>]*>/i;
const OPS = '+-*/<>=!&|^%';
const PUNCT = /[{}()[\];,=+\-*/<>!&|^%?:.~]/;

function squeeze(line) {
  let t = line.replace(/\s+/g, ' ').trim();
  // drop a space next to punctuation unless both sides are operator characters (a - -b, a + +b, x < =)
  t = t.replace(/(\S) (?=(\S))/g, (all, l, r) =>
    (PUNCT.test(l) || PUNCT.test(r)) && !(OPS.includes(l) && OPS.includes(r)) ? l : all);
  // 1.0 -> 1.   0.5 -> .5
  t = t.replace(/(?<![\w.])(\d*\.\d*?[1-9])0+(?![\d\w])/g, '$1')
    .replace(/(?<![\w.])(\d+)\.0+(?![\d\w])/g, '$1.').replace(/(?<![\w.])0\.(\d)/g, '.$1');
  return t;
}
const directiveSqueeze = l => l.trim().replace(/[ \t]+/g, ' ');

// Minify one quasi. `afterExpr` / `beforeExpr`: an interpolation touches its start / end, so the line structure at
// that edge is kept exactly (a directive split by ${} must not swallow or join the next line).
function minQuasi(raw, afterExpr, beforeExpr) {
  let t = raw.replace(/\/\*[\s\S]*?\*\//g, m => m.includes('\n') ? '\n' : ' ').replace(/\/\/[^\n]*/g, '');
  const lines = t.split('\n');
  let head = null, tail = null;
  if (afterExpr) head = lines.shift();
  if (beforeExpr && lines.length) tail = lines.pop();
  const out = [];
  let buf = '';
  for (const line of lines) {
    const tr = line.trim();
    if (!tr) continue;
    if (tr.startsWith('#')) { if (buf) { out.push(squeeze(buf)); buf = ''; } out.push(directiveSqueeze(tr)); }
    else buf += (buf ? ' ' : '') + tr;
  }
  if (buf) out.push(squeeze(buf));
  let body = out.join('\n');
  // an edge segment keeps one space where it touches the interpolation (`${type} name` must not become `${type}name`)
  const edge = (s, lead) => {
    if (s == null) return null;
    const core = s.trim().startsWith('#') ? directiveSqueeze(s) : squeeze(s);
    if (!core) return /\s/.test(s) ? ' ' : '';
    return lead ? (/^\s/.test(s) ? ' ' : '') + core : core + (/\s$/.test(s) ? ' ' : '');
  };
  if (afterExpr && beforeExpr && !raw.includes('\n')) {
    const core = squeeze(raw);
    if (!core) return /\s/.test(raw) ? ' ' : '';
    return (/^\s/.test(raw) ? ' ' : '') + core + (/\s$/.test(raw) ? ' ' : '');
  }
  const h = edge(head, true), tl = edge(tail, false);
  const pieces = [];
  if (h != null) pieces.push(h);
  if (body || (h != null && tl != null)) pieces.push(body);
  if (tl != null) pieces.push(tl);
  return pieces.join('\n');
}

// GLSL tokens, for before/after equivalence (floats compared by value, directives by squeezed text)
function glslTokens(s) {
  s = s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\/\/[^\n]*/g, '');
  const re = /#[^\n]*|(?:\d+\.\d*|\.\d+)(?:[eE][+-]?\d+)?|\d+(?:[eE][+-]?\d+)?|[A-Za-z_]\w*|\+\+|--|&&|\|\||<<=?|>>=?|[+\-*/<>=!&|^%]=|@@|\S/g;
  const out = [];
  for (const m of s.matchAll(re)) {
    let t = m[0];
    if (t[0] === '#') t = t.replace(/\s+/g, ' ').trim();
    else if (/^[\d.]/.test(t)) t = String(parseFloat(t)) + (/[.eE]/.test(t) ? 'f' : '');
    out.push(t);
  }
  return out;
}
const sameTokens = (a, b) => a.length === b.length && a.every((t, i) => t === b[i]);

function findShaders(code, useCooked) {
  const ast = acorn.parse(code, { ecmaVersion: 'latest', sourceType: 'module' });
  const found = [];
  walk.full(ast, n => {
    if (n.type === 'TemplateLiteral') {
      const qs = n.quasis.map(q => useCooked ? q.value.cooked : q.value.raw);
      const joined = qs.join('');
      if (GLSL_MARK.test(joined) && !NOT_GLSL.test(joined)) found.push({ node: n, qs, exprs: n.expressions.length });
    } else if (n.type === 'Literal' && typeof n.value === 'string' && n.value.length > 40) {
      if (GLSL_MARK.test(n.value) && !NOT_GLSL.test(n.value)) found.push({ node: n, qs: [n.value], exprs: 0 });
    }
  });
  return found;
}

let js = main.text;
const shaderReport = { before: [], count: 0, saved: 0 };
if (OPT.glsl) {
  const shaders = findShaders(js, false).filter(s => s.node.type === 'TemplateLiteral');
  const edits = [];
  for (const sh of shaders) {
    const n = sh.node;
    shaderReport.before.push({ tokens: glslTokens(n.quasis.map(q => q.value.cooked).join('\n@@\n')), exprs: n.expressions.length, text: n.quasis.map(q => q.value.cooked) });
    n.quasis.forEach((q, i) => {
      const raw = q.value.raw;
      const min = minQuasi(raw, i > 0, i < n.quasis.length - 1);
      edits.push({ start: q.start, end: q.end, text: min });
      shaderReport.saved += raw.length - min.length;
    });
  }
  edits.sort((a, b) => b.start - a.start);
  for (const e of edits) js = js.slice(0, e.start) + e.text + js.slice(e.end);
  shaderReport.count = shaders.length;
  if (OPT.rename) log('glsl       --glsl-rename: not applied (uniform/attribute names are looked up from JS strings)');
  log(`glsl       ${shaders.length} shader literal(s), ${kb(shaderReport.saved)} saved`);
  // GLSL-level equivalence straight after the pass
  const after = findShaders(js, false).filter(s => s.node.type === 'TemplateLiteral');
  if (after.length !== shaders.length) fail(`shader count ${shaders.length} -> ${after.length} after the GLSL pass`);
  after.forEach((s, i) => {
    const t = glslTokens(s.node.quasis.map(q => q.value.cooked).join('\n@@\n'));
    if (!sameTokens(shaderReport.before[i].tokens, t)) fail(`shader ${i}: token stream changed in the GLSL pass`);
  });
}

// ---------- 3. domain lock ----------
if (OPT.lock) {
  const list = JSON.stringify(OPT.domains);
  const notice = `${title} is licensed to run only on ${OPT.domains.join(', ')}.`;
  const guard = `
{
  const __h = String(location.hostname || '').toLowerCase().replace(/\\.$/, '');
  const __ok = ${list}.some(d => __h === d || __h.endsWith('.' + d)) ||
    __h === 'localhost' || /^127\\./.test(__h) || __h === '::1' || __h === '[::1]';
  if (!__ok) {
    document.documentElement.innerHTML = '<body style="margin:0;display:grid;place-items:center;height:100vh;background:#111;color:#ddd;font:15px system-ui,sans-serif">' + ${JSON.stringify(notice)} + '</body>';
    throw new Error('unauthorized host');
  }
}
`;
  // after the import declarations, before any other code, inside the module so terser folds it in
  const ast = acorn.parse(js, { ecmaVersion: 'latest', sourceType: 'module' });
  let at = 0;
  for (const n of ast.body) { if (n.type === 'ImportDeclaration') at = n.end; else break; }
  js = js.slice(0, at) + guard + js.slice(at);
  log(`lock       ${OPT.domains.join(', ')} (+ subdomains, localhost)`);
}

// ---------- 4. terser ----------
// booleans_as_integers turns `mesh.visible = false` into `mesh.visible = 0`, but Three.js tests these flags strictly
// (`object.visible === false`, `material.transparent === true`, `material.vertexColors === true`, ...), so with Three.js
// it hides nothing, sorts no transparency and drops vertex colours. It stays on for everything else.
if (/\bfrom\s*['"]three(?:\/|['"])/.test(js) && TERSER.compress.booleans_as_integers) {
  TERSER.compress.booleans_as_integers = false;
  log('terser     booleans_as_integers off: Three.js compares its flags with === true / === false');
}
const beforeMin = js;
const t0 = await minify(js, TERSER);
if (!t0.code) fail('terser produced no code');
const terserJs = t0.code;
log(`terser     ${kb(main.text.length)} -> ${kb(terserJs.length)}`);

// ---------- verify (pre-obfuscation JS: shader, GL-name and domain checks) ----------
{
  try { acorn.parse(terserJs, { ecmaVersion: 'latest', sourceType: 'module' }); }
  catch (e) { fail('terser output does not parse: ' + e.message); }

  if (OPT.glsl) {
    const outShaders = findShaders(terserJs, true).map(s => ({ tokens: glslTokens(s.qs.join('\n@@\n')), exprs: s.exprs, qs: s.qs, used: false }));
    shaderReport.before.forEach((sh, i) => {
      const o = outShaders.find(c => !c.used && sameTokens(sh.tokens, c.tokens));
      if (!o && process.env.DBG) for (const c of outShaders) { const k = sh.tokens.findIndex((t, j) => t !== c.tokens[j]); console.error(k, sh.tokens.slice(Math.max(0, k - 5), k + 5).join(' '), ' || ', c.tokens.slice(Math.max(0, k - 5), k + 5).join(' ')); }
      if (!o) fail(`shader ${i}: no shader in the terser output with an identical token stream`);
      o.used = true;
      if (o.exprs !== sh.exprs) fail(`shader ${i}: interpolation count ${sh.exprs} -> ${o.exprs}`);
      sh.out = o.qs;
    });
    // declared GL names still present in the shader text and in the JS that looks them up
    const names = new Set();
    for (const sh of shaderReport.before) {
      for (const m of sh.text.join('\n').matchAll(/\b(?:uniform|attribute|in)\s+(?:lowp\s+|mediump\s+|highp\s+)?\w+\s+([\w\s,[\]]+);/g)) {
        for (const nm of m[1].split(',')) { const k = nm.trim().replace(/\[.*$/, ''); if (k) names.add(k); }
      }
    }
    const count = (s, w) => (s.match(new RegExp('\\b' + w + '\\b', 'g')) || []).length;
    for (const nm of names) {
      const a = count(beforeMin, nm), b = count(terserJs, nm);
      if (b < Math.min(a, 2)) fail(`GL name "${nm}" lost (${a} -> ${b} occurrences)`);
    }
    // real GLSL parse where the shader is a whole translation unit
    let parsed = 0, skipped = 0;
    if (parseGLSL) {
      const mute = f => { const w = console.warn, l = console.log; console.warn = console.log = () => { }; try { return f(); } finally { console.warn = w; console.log = l; } };
      const prep = s => s.replace(/^\s*#include\s*<[^>]*>.*$/gm, '');
      for (const sh of shaderReport.before) {
        let ok = true;
        try { mute(() => parseGLSL(prep(sh.text.join('0')))); } catch { ok = false; }
        if (!ok) { skipped++; continue; }
        try { mute(() => parseGLSL(prep(sh.out.join('0')))); parsed++; }
        catch (e) { fail('a shader parsed before and not after: ' + e.message.split('\n')[0]); }
      }
    }
    log(`verify     ${shaderReport.before.length} shader(s) token-identical, ${names.size} GL name(s) kept` +
      (parseGLSL ? `, ${parsed} parsed (${skipped} fragments skipped)` : ', GLSL parser absent'));
  }
  if (OPT.lock) {
    for (const d of OPT.domains) if (!terserJs.includes(JSON.stringify(d).slice(1, -1))) fail(`domain "${d}" missing from the lock`);
    if (!terserJs.includes('unauthorized host')) fail('domain lock missing after terser');
  }
}

// ---------- 5. obfuscate ----------
let finalJs = terserJs;
if (OPT.obfuscate) {
  const { default: JavaScriptObfuscator } = await import('javascript-obfuscator');
  finalJs = JavaScriptObfuscator.obfuscate(terserJs, OBFUSCATOR).getObfuscatedCode();
  log(`obfuscate  ${kb(terserJs.length)} -> ${kb(finalJs.length)} (string array, base64)`);
}

// ---------- 6. license header ----------
let banner = '';
{
  const year = new Date().getFullYear();
  const text = OPT.license ? fs.readFileSync(OPT.license, 'utf8').trim()
    : `${title}\nCopyright (c) ${year} Alejandro Rosales. All rights reserved.\n` +
    `No part of this software may be copied, modified, reverse engineered, or redistributed without written permission.`;
  banner = '/*!\n' + text.replace(/\*\//g, '* /').split('\n').map(l => ' * ' + l).join('\n') + '\n */\n';
}
finalJs = banner + finalJs;

// ---------- 7. css / html squeeze ----------
const squeezeCss = s => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\s+/g, ' ')
  .replace(/\s*([{};:,>])\s*/g, '$1').replace(/;}/g, '}').trim();
const squeezeHtml = s => s.replace(/<!--(?!\[if)[\s\S]*?-->/g, '').replace(/\s+/g, ' ');
for (const p of parts) {
  if (p === main) p.text = finalJs;
  else if (p.kind === 'js') { const r = await minify(p.text, { ...TERSER, module: false, compress: { ...TERSER.compress, toplevel: false }, mangle: {} }); p.text = r.code ?? p.text; }
  else if (p.kind === 'json') { try { p.text = JSON.stringify(JSON.parse(p.text)); } catch { } }
  else if (p.kind === 'css' && OPT.html) p.text = squeezeCss(p.text);
  else if (p.kind === 'html' && OPT.html) p.text = squeezeHtml(p.text);
}
const out = parts.map(p => (p.open ?? '') + p.text + (p.close ?? '')).join('').trim() + '\n';

// ---------- verify (final) ----------
{
  const m = out.match(/<script type="module">([\s\S]*?)<\/script>/i) || out.match(/<script>([\s\S]*?)<\/script>(?![\s\S]*<script>)/i);
  const finalMain = main.module ? out.slice(out.indexOf(main.open) + main.open.length, out.indexOf(main.close, out.indexOf(main.open))) : m[1];
  try { acorn.parse(finalMain, { ecmaVersion: 'latest', sourceType: main.module ? 'module' : 'script' }); }
  catch (e) { fail('final script does not parse: ' + e.message); }
  if (!finalMain.startsWith('/*!')) fail('license header not at the top of the script');
  if (finalMain.includes('</script')) fail('final script contains a closing script tag');
}

fs.writeFileSync(OPT.output, out);
log(`done       ${kb(src.length)} -> ${kb(out.length)} raw, ${kb(gz(src))} -> ${kb(gz(out))} gzip  =>  ${OPT.output}`);
