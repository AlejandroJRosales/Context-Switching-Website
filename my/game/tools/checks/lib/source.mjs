// SOURCE: loading the src/N-name.js modules, plus the shared AST helpers.
import fs from 'node:fs';
import path from 'node:path';
import * as acorn from 'acorn';

export const PARSE = { ecmaVersion: 'latest', sourceType: 'module', locations: true, ranges: true };
export const FILE_NAMES = { 1: '1-config', 2: '2-core', 3: '3-gfx-io', 4: '4-provider', 5: '5-collision',
  6: '6-worlds', 7: '7-sim', 8: '8-render-player-game', 9: '9-main' };

// One parsed source: text, AST, tokens and comments (positions are into `src`).
function parseWithTokens(src) {
  const tokens = [], comments = [];
  const ast = acorn.parse(src, { ...PARSE, onToken: tokens, onComment: comments });
  return { ast, tokens, comments };
}

// src/N-name.js modules, sorted by their number.
export function loadModules(srcDir) {
  return fs.readdirSync(srcDir).filter(f => /^\d-.*\.js$/.test(f)).sort().map(f => {
    const file = path.join(srcDir, f), src = fs.readFileSync(file, 'utf8');
    return { file, name: f, num: Number(f[0]), src, ...parseWithTokens(src) };
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

