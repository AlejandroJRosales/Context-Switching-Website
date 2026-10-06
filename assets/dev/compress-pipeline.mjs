#!/usr/bin/env node
// compress-pipeline: shell split -> GLSL pass -> terser -> css/html squeeze -> verify
import fs from 'node:fs';
import zlib from 'node:zlib';
import { minify } from 'terser';
import * as acorn from 'acorn';
import * as walk from 'acorn-walk';

let parseGLSL = null;
try { ({ parser: { parse: parseGLSL } } = await import('@shaderfrog/glsl-parser')); } catch {}
if (!parseGLSL) try { ({ parse: parseGLSL } = await import('@shaderfrog/glsl-parser/parser/parser.js')); } catch {}

// ---------- args ----------
const argv = process.argv.slice(2);
const flag = f => argv.includes(f);
const oi = argv.indexOf('-o');
const input = argv.find((a, i) => !a.startsWith('-') && argv[i - 1] !== '-o');
if (!input) { console.error('usage: compress-pipeline <in.html> [-o out.html] [--glsl-rename] [--no-glsl] [--no-html] [--quiet]'); process.exit(2); }
const output = oi >= 0 ? argv[oi + 1] : input.replace(/\.html?$/, '') + '.min.html';
const OPT = { rename: flag('--glsl-rename'), glsl: !flag('--no-glsl'), html: !flag('--no-html'), quiet: flag('--quiet') };
const log = (...a) => OPT.quiet || console.log(...a);
const fail = m => { console.error('VERIFY FAIL: ' + m); process.exit(1); };

const TERSER = {
  module: true,
  compress: { passes: 3, toplevel: true, unsafe: true, unsafe_math: true, pure_getters: true, booleans_as_integers: false },
  mangle: { toplevel: true },
  output: { quote_style: 1 },
  parse: {},
  rename: {},
};

const src = fs.readFileSync(input, 'utf8').replace(/\r\n?/g, '\n');

// ---------- 1. split shell ----------
const parts = []; // {kind:'html'|'css'|'js'|'json'|'raw', text, open, close}
{
  const re = /(<script\b[^>]*>)([\s\S]*?)(<\/script>)|(<style\b[^>]*>)([\s\S]*?)(<\/style>)/gi;
  let last = 0, m;
  while ((m = re.exec(src))) {
    parts.push({ kind: 'html', text: src.slice(last, m.index) });
    if (m[1]) {
      const type = (m[1].match(/type\s*=\s*["']?([^"'\s>]+)/i) || [])[1] || 'text/javascript';
      const kind = type === 'importmap' || /json/.test(type) ? 'json'
        : /^(module|text\/javascript|application\/javascript)$/.test(type) ? 'js' : 'raw';
      parts.push({ kind, module: type === 'module', open: m[1], text: m[2], close: m[3] });
    } else parts.push({ kind: 'css', open: m[4], text: m[5], close: m[6] });
    last = re.lastIndex;
  }
  parts.push({ kind: 'html', text: src.slice(last) });
}

// ---------- GLSL helpers ----------
const MARKERS = [
  /\bvoid\s+main\s*\(/, /\bgl_(Position|FragColor|FragCoord|PointSize|FragData)\b/,
  /^\s*#\s*(include|define|ifdef|ifndef|endif|version|if|else|elif|extension|pragma)\b/m,
  /\b(uniform|varying|attribute|precision)\s+\w+\s+\w+/, /\b([biu]?vec[234]|mat[234]|sampler(2D|Cube|3D))\b/,
  /\b(smoothstep|texture2D|texture|mix|clamp|fract|normalize)\s*\(/,
];
const isGLSL = t => MARKERS.reduce((s, r) => s + r.test(t), 0) >= 2;

const stripComments = s => s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\/\/[^\n]*/g, '');
const shortFloats = s => s
  .replace(/(?<![\w.])(\d+)\.(\d*?)0+(?![\w.])/g, (_, a, b) => `${a}.${b}`)   // 1.0 -> 1.  0.50 -> 0.5
  .replace(/(?<![\w.])0\.(\d)/g, '.$1');                                        // 0.5 -> .5
const OPCH = '+-*/<>=!&|^%';
function squeezeLine(s) {
  // collapse whitespace; drop it next to punctuation unless both sides are operator chars (a - -b, a / *b, x < <y)
  s = s.replace(/\s+/g, ' ').trim();
  return s.replace(/ /g, (sp, i) => {
    const a = s[i - 1], b = s[i + 1];
    const wa = /[\w.$]/.test(a), wb = /[\w.$]/.test(b);
    if (wa && wb) return ' ';
    if (OPCH.includes(a) && OPCH.includes(b)) return ' ';
    return '';
  });
}
// Minify one template quasi. Preprocessor lines keep their own line; newline kept at ${} boundaries.
function minifyGLSLChunk(raw, atStart, atEnd) {
  const lines = stripComments(raw).split('\n');
  const out = []; let buf = [];
  const flush = () => { if (buf.length) { const t = squeezeLine(shortFloats(buf.join(' '))); if (t) out.push(t); buf = []; } };
  for (const ln of lines) {
    if (/^\s*#/.test(ln)) { flush(); out.push(ln.trim().replace(/\s+/g, ' ')); }
    else buf.push(ln);
  }
  flush();
  let s = out.join('\n');
  if (!atStart) s = '\n' + s;
  if (!atEnd) s = s + '\n';
  return s;
}
// token stream for equivalence checks (numbers normalised by value)
function glslTokens(s) {
  s = stripComments(s);
  const toks = [];
  const re = /\s*(#[^\n]*|\d*\.\d*(?:[eE][+-]?\d+)?[fF]?|\d+(?:[eE][+-]?\d+)?[uU]?|[A-Za-z_]\w*|<<=|>>=|\+\+|--|<<|>>|<=|>=|==|!=|&&|\|\||\^\^|[+\-*\/%]=|[&|^]=|\S)/gy;
  let m;
  while ((m = re.exec(s)) && m[1]) {
    let t = m[1];
    if (t[0] === '#') t = t.trim().replace(/\s+/g, ' ');
    else if (/^[\d.]/.test(t) && t !== '.') t = 'N' + parseFloat(t);
    toks.push(t);
  }
  return toks;
}

// ---------- 2. GLSL pass + 3. terser ----------
const report = { shaders: [], glNames: new Set() };
async function doJS(p) {
  let code = p.text;
  const origShaders = [];
  if (OPT.glsl) {
    const ast = acorn.parse(code, { ecmaVersion: 'latest', sourceType: p.module ? 'module' : 'script', allowHashBang: true });
    const edits = [];
    walk.full(ast, n => {
      if (n.type !== 'TemplateLiteral') return;
      const joined = n.quasis.map(q => q.value.raw).join('\n');
      if (!isGLSL(joined)) return;
      const before = n.quasis.map(q => q.value.raw);
      const after = before.map((r, i) => minifyGLSLChunk(r, i === 0, i === before.length - 1));
      for (const m of joined.matchAll(/\b(?:uniform|attribute|varying)\s+(?:(?:lowp|mediump|highp)\s+)?\w+\s+([\w\s,\[\]]+);/g))
        m[1].split(',').forEach(x => { const nm = x.trim().replace(/\[.*$/, ''); if (nm) report.glNames.add(nm); });
      origShaders.push({ before, after, exprs: n.expressions.length });
      n.quasis.forEach((q, i) => edits.push({ s: q.start, e: q.end, t: after[i] }));
    });
    edits.sort((a, b) => b.s - a.s).forEach(({ s, e, t }) => { code = code.slice(0, s) + t + code.slice(e); });
    report.shaders.push(...origShaders);
    if (OPT.rename) log('  note: --glsl-rename requested; not applied to Three.js-bound names (uniforms are keyed from JS objects)');
  }
  const r = await minify(code, { ...TERSER, module: p.module || TERSER.module });
  if (r.error) throw r.error;
  return r.code;
}

// ---------- 4. css / html squeeze ----------
const squeezeCSS = s => s
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/\s+/g, ' ')
  .replace(/\s*([{};,>])\s*/g, '$1')
  .replace(/:\s+/g, ':')
  .replace(/;}/g, '}')
  .replace(/(?<![\w.])0\.(\d)/g, '.$1')
  .trim();
const BLOCK = 'html|head|body|meta|title|link|style|script|div|p|h1|h2|h3|h4|h5|h6|ol|ul|li|details|summary|section|header|footer|main|nav|canvas|table|tr|td|th|tbody|thead|form|br|hr';
const blockRe = new RegExp(`^</?(${BLOCK})\\b`, 'i');
function squeezeHTML(s) {
  s = s.replace(/<!--(?!\[)[\s\S]*?-->/g, '');
  // whitespace runs containing a newline between tags: drop next to block tags, else keep one space
  s = s.replace(/(<[^>]+>)(\s*\n\s*)(?=(<[^>]+>))/g, (_, a, ws, b) =>
    blockRe.test(a) || blockRe.test(b) ? a : a + ' ');
  s = s.replace(/^\s+|\s+$/g, '').replace(/\n\s*/g, '\n');
  return s.replace(/\n(?=<)/g, '').replace(/>\n/g, '>');
}

// ---------- run ----------
const out = [];
for (const p of parts) {
  if (p.kind === 'js') out.push(p.open + await doJS(p) + p.close);
  else if (p.kind === 'json') out.push(p.open + JSON.stringify(JSON.parse(p.text)) + p.close);
  else if (p.kind === 'css') out.push(p.open + (OPT.html ? squeezeCSS(p.text) : p.text) + p.close);
  else if (p.kind === 'raw') out.push(p.open + p.text + p.close);
  else out.push(OPT.html ? squeezeHTML(p.text) : p.text);
}
let result = out.join('');
if (OPT.html) result = result.replace(/^\s+/, '');

// ---------- 5. verify ----------
const outParts = [...result.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)];
const jsOut = outParts.filter(m => /type=["']?module/.test(m[1]) || !/type=/.test(m[1]));
for (const m of jsOut) {
  try { acorn.parse(m[2], { ecmaVersion: 'latest', sourceType: /module/.test(m[1]) ? 'module' : 'script' }); }
  catch (e) { fail('output JS does not reparse: ' + e.message); }
}
const jsAll = jsOut.map(m => m[2]).join('\n');
for (const nm of report.glNames) if (!jsAll.includes(nm)) fail(`GL name "${nm}" missing from output`);
// Re-locate shader literals in the output and compare token streams
const outAst = acorn.parse(jsAll, { ecmaVersion: 'latest', sourceType: 'module' });
const outShaders = [];
walk.full(outAst, n => {
  if (n.type === 'TemplateLiteral' && isGLSL(n.quasis.map(q => q.value.raw).join('\n'))) outShaders.push(n);
  if (n.type === 'Literal' && typeof n.value === 'string' && isGLSL(n.value) ) outShaders.push({ str: n.value });
});
if (outShaders.length < report.shaders.length) fail(`shader count ${report.shaders.length} -> ${outShaders.length}`);
const eq = (a, b) => a.length === b.length && a.every((t, i) => t === b[i]);
let parsed = 0, parseSkipped = 0;
const _warn = console.warn, _log = console.log; const mute = f => { console.warn = console.log = () => {}; try { return f(); } finally { console.warn = _warn; console.log = _log; } };
const outQs = outShaders.map(o => ({ q: o.str !== undefined ? [o.str] : o.quasis.map(q => q.value.raw), exprs: o.str !== undefined ? 0 : o.expressions.length, used: false }));
report.shaders.forEach((sh, i) => {
  // terser may reorder or convert literals, so pair shaders by token stream rather than position
  const a = glslTokens(sh.before.join('\n@@\n'));
  const o = outQs.find(c => !c.used && eq(a, glslTokens(c.q.join('\n@@\n'))));
  if (!o && process.env.DBG) for (const c of outQs) { const b = glslTokens(c.q.join('\n@@\n')); const k = a.findIndex((t, j) => t !== b[j]); console.error(k, a.slice(Math.max(0,k-4),k+4).join(' '), ' || ', b.slice(Math.max(0,k-4),k+4).join(' ')); }
  if (!o) fail(`shader ${i}: no output shader with an identical token stream`);
  o.used = true;
  const outQ = o.q;
  if (o.exprs !== sh.exprs) fail(`shader ${i}: interpolation count ${sh.exprs} -> ${o.exprs}`);
  // Real GLSL parse (includes stripped; body-only chunks wrapped) before and after
  if (parseGLSL && sh.exprs === 0) {
    const prep = s => { s = s.replace(/^\s*#include[^\n]*$/gm, ''); return /\bvoid\s+main\s*\(/.test(s) ? s : `void main(){\n${s}\n}`; };
    let okB = true; try { mute(() => parseGLSL(prep(sh.before.join('')))); } catch { okB = false; }
    if (okB) { try { mute(() => parseGLSL(prep(outQ.join('')))); parsed++; } catch (e) { fail(`shader ${i}: parses before but not after: ${e.message}`); } }
    else parseSkipped++;
  }
});

fs.writeFileSync(output, result);
const kb = n => (n / 1024).toFixed(1) + ' KB';
const gz = s => zlib.gzipSync(Buffer.from(s), { level: 9 }).length;
const pct = (a, b) => Math.round(100 * (1 - b / a)) + '%';
const inB = Buffer.byteLength(src), outB = Buffer.byteLength(result);
log(`shaders: ${report.shaders.length} minified, ${parsed} GLSL-parsed before/after${parseSkipped ? `, ${parseSkipped} not parseable standalone` : ''}; ${report.glNames.size} GL names checked`);
log(`${input}: ${kb(inB)} -> ${kb(outB)} raw (${pct(inB, outB)}), ${kb(gz(src))} -> ${kb(gz(result))} gzip`);
log(`wrote ${output}`);
