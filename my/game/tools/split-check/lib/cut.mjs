// CUT ENGINE: moves statements out of src/9-main.js into lower modules by placement.json, then exports every declaration
// of files 1 to 8 and rebuilds each module's imports from the names it uses. Phase scripts (cut-phase3.mjs, ...) call
// cut() with the files to extract, the new files' headers, and their AST edits. Statements move whole, with the comment
// and blank lines above them, in their current order; line endings are kept as found.
import fs from 'node:fs';
import path from 'node:path';
import * as acorn from 'acorn';
import * as eslintScope from 'eslint-scope';
import { loadHtmlModule, declNames, lineOf, signature, unwrap, FILE_NAMES } from './source.mjs';

export const PARSE = { ecmaVersion: 'latest', sourceType: 'module', locations: true, ranges: true };
const WRAP = 118;                       // import list line width
const THREE_IMPORTS = {                 // the original's three imports, added to a module that uses the name
  THREE: "import * as THREE from 'three';",
  mergeGeometries: "import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';"
};

// TEXT HELPERS (offsets into one module's text)
export const lineStart = (s, pos) => s.lastIndexOf('\n', pos - 1) + 1;
export const lineEnd = (s, pos) => { const k = s.indexOf('\n', pos); return k < 0 ? s.length : k + 1; };
export function analyze(s) {
  const ast = acorn.parse(s, PARSE);
  const sm = eslintScope.analyze(ast, { ecmaVersion: 2022, sourceType: 'module' });
  return { ast, mod: sm.scopes.find(x => x.type === 'module') };
}
export function applyEdits(s, edits) {
  edits = [...edits].sort((a, b) => b.start - a.start || b.end - a.end);
  for (let i = 1; i < edits.length; i++) if (edits[i].end > edits[i - 1].start) throw new Error(`overlapping edits at ${edits[i].start}`);
  for (const e of edits) s = s.slice(0, e.start) + e.text + s.slice(e.end);
  return s;
}
// identifiers that refer to the module-level `name`: declared in this file, or free here (imported or to be imported)
export function refsTo(mod, name) {
  const v = mod.variables.find(x => x.name === name);
  const declared = v ? v.references.map(r => r.identifier) : [];
  return [...declared, ...mod.through.filter(r => r.identifier.name === name).map(r => r.identifier)];
}
// every non-computed member access `obj.prop` with these names (obj an identifier or `this`)
export function members(ast, objName, prop) {
  const out = [];
  (function visit(n) {
    if (!n || typeof n.type !== 'string') return;
    if (n.type === 'MemberExpression' && !n.computed && n.property.name === prop &&
      ((objName === 'this' && n.object.type === 'ThisExpression') || (n.object.type === 'Identifier' && n.object.name === objName))) out.push(n);
    for (const k in n) { const c = n[k]; if (k === 'loc' || k === 'range') continue; if (Array.isArray(c)) c.forEach(visit); else if (c && typeof c.type === 'string') visit(c); }
  })(ast);
  return out;
}

const fileNum = f => Number(String(f).match(/(\d)-/)[1]);
const modPath = (root, n) => path.join(root, 'src', `${FILE_NAMES[n]}.js`);

// Where a 9-main statement belongs: by its declared names, else (a non-declaration) by matching the original statement.
export function destinations(root, placement) {
  const O = loadHtmlModule(path.join(root, 'game.html'));
  const bySig = new Map();
  for (const n of O.ast.body) if (!declNames(n).length) {
    const p = placement.statements.find(q => q.lines[0] === lineOf(O, n));
    if (p) bySig.set(signature(O, n.start, n.end).sig, fileNum(p.file));
  }
  const renamed = placement.renamed || {};
  const byName = new Map(Object.entries(placement.identifiers).map(([n, p]) => [renamed[n] || n, fileNum(p.file)]));
  for (const [n, f] of Object.entries(placement.added || {})) byName.set(n, fileNum(f));   // declarations new since phase 0
  return (m, n) => {
    if (n.type === 'ImportDeclaration') return 9;
    const names = declNames(n);
    if (names.length) {
      const fs_ = [...new Set(names.map(x => byName.get(x)).filter(x => x !== undefined))];
      if (fs_.length > 1) throw new Error(`${names.join(',')}: split across files ${fs_.join(',')}`);
      return fs_.length ? fs_[0] : 9;   // new declarations stay where they are
    }
    const f = bySig.get(signature(m, n.start, n.end).sig);
    return f === undefined ? 9 : f;     // an edited or new statement stays in main
  };
}

// cut({ root, take: [3, 4], headers: { 3: [...lines] }, edits(texts, eol) })
export function cut({ root, take, headers, edits }) {
  const placement = JSON.parse(fs.readFileSync(path.join(path.dirname(new URL(import.meta.url).pathname), '..', 'placement.json'), 'utf8'));
  const mainFile = modPath(root, 9);
  const text = fs.readFileSync(mainFile, 'utf8');
  const eol = text.includes('\r\n') ? '\r\n' : '\n';
  const dest = destinations(root, placement);
  const m = { src: text, lineOffset: 0, tokens: [], comments: [] };
  m.ast = acorn.parse(text, { ...PARSE, onToken: m.tokens, onComment: m.comments });
  const lines = text.split('\n');
  const body = m.ast.body;

  // BLOCKS
  const out = Object.fromEntries([...take, 9].map(f => [f, []]));
  const moved = Object.fromEntries(take.map(f => [f, 0]));
  out[9].push(...lines.slice(0, body[0].loc.start.line - 1));     // main's header
  body.forEach((n, i) => {
    const from = i === 0 ? n.loc.start.line : body[i - 1].loc.end.line + 1;
    const block = lines.slice(from - 1, n.loc.end.line);
    const f = dest(m, n);
    if (take.includes(f)) { out[f].push(...block); moved[f]++; } else out[9].push(...block);
  });
  const tail = lines.slice(body[body.length - 1].loc.end.line);
  const texts = {};
  for (const f of [...take, 9]) texts[f] = out[f].join('\n');
  for (const f of take) texts[f] = headers[f].join(eol) + eol + texts[f].replace(/^(\r?\n)+/, '');
  // existing lower modules take part in the export and import passes
  for (let f = 1; f <= 8; f++) if (!take.includes(f) && fs.existsSync(modPath(root, f))) texts[f] = fs.readFileSync(modPath(root, f), 'utf8');

  // PHASE EDITS
  if (edits) edits(texts, eol);

  // EXPORTS: every top-level declaration of files 1 to 8
  for (const f of Object.keys(texts).map(Number).filter(f => f <= 8)) {
    const { ast } = analyze(texts[f]);
    const bare = ast.body.filter(n => ['VariableDeclaration', 'FunctionDeclaration', 'ClassDeclaration'].includes(n.type));
    texts[f] = applyEdits(texts[f], bare.map(n => ({ start: n.start, end: n.start, text: 'export ' })));
  }
  const exportsOf = {};
  for (const f of Object.keys(texts).map(Number).filter(f => f <= 8))
    exportsOf[f] = analyze(texts[f]).ast.body.flatMap(n => n.type === 'ExportNamedDeclaration' && n.declaration ? declNames(n.declaration) : []);

  // IMPORTS: drop the generated ones, then import exactly the lower-file names (and three names) each module uses
  for (const f of Object.keys(texts).map(Number)) {
    let s = texts[f];
    let { ast } = analyze(s);
    const rel = ast.body.filter(n => n.type === 'ImportDeclaration' && n.source.value.startsWith('./'));
    s = applyEdits(s, rel.map(n => ({ start: lineStart(s, n.start), end: lineEnd(s, n.end), text: '' })));
    ({ ast } = analyze(s));
    const { mod } = analyze(s);
    const free = new Set(mod.through.map(r => r.identifier.name));
    const blocks = [];
    const hasThree = new Set(ast.body.filter(n => n.type === 'ImportDeclaration').flatMap(n => n.specifiers.map(x => x.local.name)));
    for (const [nm, line] of Object.entries(THREE_IMPORTS)) if (free.has(nm) && !hasThree.has(nm)) blocks.push(line);
    for (let g = 1; g < f; g++) {
      const names = (exportsOf[g] || []).filter(n => free.has(n));
      if (!names.length) continue;
      const rows = []; let row = '';
      for (const n of names) { const add = row ? `${row}, ${n}` : `  ${n}`; if (add.length > WRAP) { rows.push(row + ','); row = `  ${n}`; } else row = add; }
      rows.push(row);
      blocks.push(`import {${eol}${rows.join(eol)}${eol}} from './${FILE_NAMES[g]}.js';`);
    }
    const imps = ast.body.filter(n => n.type === 'ImportDeclaration');
    // after the last import, else after the file's header comment (its leading run of // lines)
    let at = 0;
    if (imps.length) at = lineEnd(s, imps[imps.length - 1].end);
    else while (at < s.length && /^\/\//.test(s.slice(at, lineEnd(s, at)))) at = lineEnd(s, at);
    const blankNext = /^[ \t]*\r?\n/.test(s.slice(at, lineEnd(s, at)));   // keep one blank line between imports and code
    texts[f] = blocks.length ? s.slice(0, at) + blocks.join(eol) + eol + (imps.length || blankNext ? '' : eol) + s.slice(at) : s;
  }

  // WRITE (the last moved line still carries its '\r' on a CRLF file)
  const close = s => s + (s.endsWith('\r') ? '\n' : (s.endsWith('\n') ? '' : eol));
  for (const f of Object.keys(texts).map(Number)) {
    const s = f === 9 ? texts[9] + (tail.length ? '\n' + tail.join('\n') : eol) : close(texts[f]);
    fs.writeFileSync(modPath(root, f), s);
  }
  return { moved };
}

// OWNING OBJECT: module-level `let`s of one file become fields of one exported const object, declared where the first
// of them was (each field keeps its initializer text, in declaration order); every reference in every file becomes
// object.field (scope-resolved, so a local of the same name is untouched). `rename` maps a let to another field name;
// `extra` adds property lines (methods) after the fields. Used inside a phase's edits(texts, eol).
//   ownerObject(texts, eol, { file: 5, object: 'collision', fields: ['wallGrid', ...], comment: ['...'] })
export function ownerObject(texts, eol, { file, object, fields, comment = [], notes = {}, rename = {}, extra = [] }) {
  const fieldOf = f => rename[f] || f;
  // references first, in every file, while the lets still exist (the object may reuse a let's name)
  const refEdits = {};
  for (const f of Object.keys(texts).map(Number)) {
    const t = texts[f], { ast, mod } = analyze(t), r = [];
    const lets = f === file ? ast.body.filter(b => b.type === 'VariableDeclaration' && b.kind === 'let' && fields.includes(declNames(b)[0])) : [];
    const inLet = id => lets.some(n => n.start <= id.start && id.end <= n.end);
    for (const name of fields) for (const id of refsTo(mod, name)) if (!inLet(id)) r.push({ start: id.start, end: id.end, text: `${object}.${fieldOf(name)}` });
    refEdits[f] = r;
  }
  const s = texts[file], { ast } = analyze(s);
  // the let statements holding the fields; a statement may declare several (`let a = 0, b = 0;`), all of them fields
  const decls = {};
  const lets = [...new Set(fields.map(f => {
    const n = ast.body.find(b => b.type === 'VariableDeclaration' && b.kind === 'let' && declNames(b).includes(f));
    if (!n) throw new Error(`${object}: no top-level \`let ${f}\` in file ${file}`);
    if (!declNames(n).every(x => fields.includes(x))) throw new Error(`${object}: \`let ${declNames(n).join(', ')}\` mixes fields and others`);
    for (const d of n.declarations) decls[d.id.name] = d;
    return n;
  }))];
  const init = f => { const d = decls[f]; return d.init ? s.slice(d.init.start, d.init.end) : 'undefined'; };
  const first = lets.reduce((a, b) => (b.start < a.start ? b : a));
  const ind = '  ';
  const props = [...fields.map(f => `${fieldOf(f)}: ${init(f)}`), ...extra];
  const body = props.map((p, k) => { const f = fields[k]; return `${ind}${p}${k < props.length - 1 ? ',' : ''}${f && notes[f] ? '   // ' + notes[f] : ''}`; });
  const decl = [...comment.map(c => `// ${c}`), `const ${object} = {`, ...body, '};'].join(eol);
  for (const n of lets) refEdits[file].push({ start: lineStart(s, n.start), end: lineEnd(s, n.end), text: n === first ? decl + eol : '' });
  for (const f of Object.keys(texts).map(Number)) texts[f] = applyEdits(texts[f], refEdits[f]);
}

// METHOD BEFORE: insert a method line into an object literal (`const name = { ... }`) or a class (`class Name`), just
// before its member `before`, at that member's indentation. Used for the reset() entries.
export function addMember(texts, file, owner, before, line) {
  const s = texts[file], { ast } = analyze(s);
  let members = null;
  for (const n0 of ast.body) {
    const n = unwrap(n0);   // lower files are already exported
    if (n.type === 'ClassDeclaration' && n.id.name === owner) members = n.body.body;
    if (n.type === 'VariableDeclaration') for (const d of n.declarations) if (d.id.name === owner && d.init && d.init.type === 'ObjectExpression') members = d.init.properties;
  }
  if (!members) throw new Error(`${owner} not found in file ${file}`);
  const m = members.find(x => x.key && (x.key.name || x.key.value) === before);
  if (!m) throw new Error(`${owner}.${before} not found`);
  const at = lineStart(s, m.start), ind = s.slice(at, m.start);
  if (!/^[ \t]*$/.test(ind)) throw new Error(`${owner}.${before} does not start its line`);
  const eol = s.includes('\r\n') ? '\r\n' : '\n';
  texts[file] = s.slice(0, at) + ind + line + eol + s.slice(at);
}

// RENAME: a module-level binding (and, for a class, its inner class-scope name) renamed in every file: its declaration,
// every reference, and the free references in other files. Stops if the new name is already bound anywhere it lands.
export function renameBinding(texts, from, to) {
  for (const f of Object.keys(texts).map(Number)) {
    const s = texts[f], ast = acorn.parse(s, PARSE);
    const sm = eslintScope.analyze(ast, { ecmaVersion: 2022, sourceType: 'module' });
    const mod = sm.scopes.find(x => x.type === 'module');
    const ids = new Map();
    for (const sc of sm.scopes) {
      if (sc.type !== 'module' && sc.type !== 'class') continue;
      for (const v of sc.variables) {
        if (v.name !== from) continue;
        for (const id of v.identifiers) ids.set(id.start, id);
        for (const r of v.references) ids.set(r.identifier.start, r.identifier);
      }
    }
    for (const r of mod.through) if (r.identifier.name === from) ids.set(r.identifier.start, r.identifier);
    // the new name must not be taken in any scope that holds one of these identifiers
    for (const sc of sm.scopes) if (sc.variables.some(v => v.name === to) && [...ids.values()].some(id => sc.block.start <= id.start && id.end <= sc.block.end))
      throw new Error(`rename ${from} -> ${to}: '${to}' is already bound in a scope of file ${f}`);
    texts[f] = applyEdits(s, [...ids.values()].map(id => ({ start: id.start, end: id.end, text: to })));
  }
}

// LETS INTO AN OBJECT: module-level `let`s of one file become new fields of an existing `const obj = { ... }` (in the
// same or another file), inserted before its member `before`; every reference in every file becomes obj.field.
export function letsIntoObject(texts, eol, { file, objFile, object, fields, before, notes = {} }) {
  const refEdits = {};
  for (const f of Object.keys(texts).map(Number)) {
    const t = texts[f], { ast, mod } = analyze(t), r = [];
    const lets = f === file ? ast.body.filter(b => b.type === 'VariableDeclaration' && b.kind === 'let' && fields.includes(declNames(b)[0])) : [];
    const inLet = id => lets.some(n => n.start <= id.start && id.end <= n.end);
    for (const name of fields) for (const id of refsTo(mod, name)) if (!inLet(id)) r.push({ start: id.start, end: id.end, text: `${object}.${name}` });
    refEdits[f] = r;
  }
  const s = texts[file], { ast } = analyze(s);
  const inits = {};
  for (const name of fields) {
    const n = ast.body.find(b => b.type === 'VariableDeclaration' && b.kind === 'let' && b.declarations.length === 1 && declNames(b)[0] === name);
    if (!n) throw new Error(`no single \`let ${name}\` in file ${file}`);
    const d = n.declarations[0];
    inits[name] = d.init ? s.slice(d.init.start, d.init.end) : 'undefined';
    refEdits[file].push({ start: lineStart(s, n.start), end: lineEnd(s, n.end), text: '' });
  }
  for (const f of Object.keys(texts).map(Number)) texts[f] = applyEdits(texts[f], refEdits[f]);
  for (const name of fields) addMember(texts, objFile, object, before, `${name}: ${inits[name]},${notes[name] ? '   // ' + notes[name] : ''}`);
}
