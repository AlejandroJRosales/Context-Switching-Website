// SOURCE: loading the src/N-name.js modules, plus the shared AST helpers.
import fs from 'node:fs';
import path from 'node:path';
import * as acorn from 'acorn';

export const PARSE = { ecmaVersion: 'latest', sourceType: 'module', locations: true, ranges: true };

// One parsed source: text, AST, tokens and comments (positions are into `src`).
function parseWithTokens(src) {
  const tokens = [], comments = [];
  const ast = acorn.parse(src, { ...PARSE, onToken: tokens, onComment: comments });
  return { ast, tokens, comments };
}

// Layer rank of src/N-name.js or src/Nx-name.js: the digit, then the sub-letter (1 < 1b < 2, 7a < 7b).
const MODULE_FILE = /^(\d)([a-z]?)-.*\.js$/;
const rankOf = f => { const [, n, sub] = f.match(MODULE_FILE); return Number(n) + (sub ? (sub.charCodeAt(0) - 96) / 30 : 0); };

// src modules, sorted by their layer rank.
export function loadModules(srcDir) {
  return fs.readdirSync(srcDir).filter(f => MODULE_FILE.test(f)).sort((a, b) => rankOf(a) - rankOf(b)).map(f => {
    const file = path.join(srcDir, f), src = fs.readFileSync(file, 'utf8');
    return { file, name: f, num: rankOf(f), src, ...parseWithTokens(src) };
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

