// SOURCE: loading the original game.html module script and the split modules, plus the shared AST helpers.
import fs from 'node:fs';
import path from 'node:path';
import * as acorn from 'acorn';

export const PARSE = { ecmaVersion: 'latest', sourceType: 'module', locations: true, ranges: true };
export const FILE_NAMES = { 1: '1-config', 2: '2-core', 3: '3-gfx-io', 4: '4-provider', 5: '5-collision',
  6: '6-worlds', 7: '7-sim', 8: '8-render-player-game', 9: '9-main' };

// One parsed source: text, AST, tokens and comments (positions are into `src`), and the html line offset.
function parseWithTokens(src) {
  const tokens = [], comments = [];
  const ast = acorn.parse(src, { ...PARSE, onToken: tokens, onComment: comments });
  return { ast, tokens, comments };
}

// The <script type="module"> block of game.html (or the shell's inline module, after the bundle phase).
export function loadHtmlModule(htmlPath) {
  const html = fs.readFileSync(htmlPath, 'utf8');
  const open = html.indexOf('<script type="module">');
  if (open < 0) throw new Error(`${htmlPath}: no <script type="module"> block`);
  const start = html.indexOf('\n', open) + 1;
  const end = html.indexOf('</script>', start);
  const src = html.slice(start, end);
  const lineOffset = html.slice(0, start).split('\n').length - 1;   // html line = src line + lineOffset
  return { file: htmlPath, src, lineOffset, ...parseWithTokens(src) };
}

// src/N-name.js modules, sorted by their number.
export function loadModules(srcDir) {
  return fs.readdirSync(srcDir).filter(f => /^\d-.*\.js$/.test(f)).sort().map(f => {
    const file = path.join(srcDir, f), src = fs.readFileSync(file, 'utf8');
    return { file, name: f, num: Number(f[0]), src, lineOffset: 0, ...parseWithTokens(src) };
  });
}

// A top-level statement with any `export` wrapper removed.
export const unwrap = n => (n.type === 'ExportNamedDeclaration' || n.type === 'ExportDefaultDeclaration') && n.declaration ? n.declaration : n;

export function declNames(node) {
  node = unwrap(node);
  const out = [];
  const pat = p => {
    if (!p) return;
    if (p.type === 'Identifier') out.push(p.name);
    else if (p.type === 'ObjectPattern') p.properties.forEach(q => pat(q.type === 'RestElement' ? q.argument : q.value));
    else if (p.type === 'ArrayPattern') p.elements.forEach(pat);
    else if (p.type === 'AssignmentPattern') pat(p.left);
    else if (p.type === 'RestElement') pat(p.argument);
  };
  if (node.type === 'VariableDeclaration') node.declarations.forEach(d => pat(d.id));
  else if ((node.type === 'FunctionDeclaration' || node.type === 'ClassDeclaration') && node.id) out.push(node.id.name);
  else if (node.type === 'ImportDeclaration') node.specifiers.forEach(s => out.push(s.local.name));
  return out;
}

export const isDecl = n => declNames(n).length > 0 && unwrap(n).type !== 'ImportDeclaration';
export const lineOf = (s, n) => n.loc.start.line + s.lineOffset;

// Token signature of [start, end): whitespace and comments ignored; a template chunk compares with each line's
// leading whitespace removed (a dedent changes the string's text, reported separately as whitespace-only).
export function signature(s, start, end) {
  const parts = [];
  let templateWs = false;
  for (const t of s.tokens) {
    if (t.start < start) continue;
    if (t.end > end) break;
    if (t.type.label === 'template') {
      const raw = s.src.slice(t.start, t.end), flat = raw.replace(/^[ \t]+/gm, '');
      if (raw !== flat) templateWs = true;
      parts.push('tpl:' + flat);
    } else parts.push(t.type.label + ':' + (t.value === undefined ? '' : String(t.value)));
  }
  return { sig: parts.join('\u0001'), templateWs, rawTemplates: s.tokens.filter(t => t.type.label === 'template' && t.start >= start && t.end <= end).map(t => s.src.slice(t.start, t.end)) };
}

// Comments inside [start, end), trimmed, in order.
export const commentsIn = (s, start, end) => s.comments.filter(c => c.start >= start && c.end <= end).map(c => c.value.trim());
