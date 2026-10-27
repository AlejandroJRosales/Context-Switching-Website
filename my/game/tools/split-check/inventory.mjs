// INVENTORY: the phase 0 analyses of game.html against a placement (placement.json), rerunnable when a placement changes.
//   node inventory.mjs <game.html> <placement.json>
// Reports: statements with no file, upward references (EVAL marks ones that run while the module evaluates), bindings
// reassigned from another file, eval-time reads of a higher file or a later declaration (class TDZ), and whether
// statements that construct three objects keep their original order (three sorts opaque draws by material id).
// Upward references and writes in the original are expected (the required edits cut them in the modules), so they are
// informational; exit code 1 only when a statement has no file.
import fs from 'node:fs';
import * as eslintScope from 'eslint-scope';
import * as walk from 'acorn-walk';
import { loadHtmlModule, declNames, lineOf } from './lib/source.mjs';

const [htmlPath, placementPath] = process.argv.slice(2);
if (!htmlPath || !placementPath) { console.error('usage: node inventory.mjs <game.html> <placement.json>'); process.exit(2); }
const S = loadHtmlModule(htmlPath);
const { ast } = S;
const placement = JSON.parse(fs.readFileSync(placementPath, 'utf8'));
const fileNum = f => Number(String(f).match(/(\d)-/)[1]);

// statement index -> file number (0: imports, repeated per module)
const byStartLine = new Map();
for (const [, p] of Object.entries(placement.identifiers)) byStartLine.set(p.lines[0], fileNum(p.file));
for (const p of placement.statements) byStartLine.set(p.lines[0], fileNum(p.file));
const fileOf = ast.body.map(n => n.type === 'ImportDeclaration' ? 0 : (byStartLine.get(lineOf(S, n)) ?? -1));
const lab = i => `${lineOf(S, ast.body[i])}:${declNames(ast.body[i]).join(',') || '(stmt)'}`;
let failed = false;

// SCOPE: every reference that resolves to a module-scope binding
const sm = eslintScope.analyze(ast, { ecmaVersion: 2022, sourceType: 'module' });
const mod = sm.scopes.find(s => s.type === 'module');
const starts = ast.body.map(n => n.start);
const stmtAt = pos => { let lo = 0, hi = starts.length - 1; while (lo < hi) { const m = (lo + hi + 1) >> 1; if (starts[m] <= pos) lo = m; else hi = m - 1; } return lo; };
const declIdx = new Map(); ast.body.forEach((n, i) => declNames(n).forEach(nm => declIdx.set(nm, i)));
const deferred = s => { for (let c = s; c && c !== mod; c = c.upper) if (c.type === 'function' || c.type === 'class-field-initializer') return true; return false; };
const refs = ast.body.map(() => ({}));   // per statement: name -> { r, w, eval }
const modRef = new Map();                // identifier start -> module binding name
for (const v of mod.variables) for (const r of v.references) {
  modRef.set(r.identifier.start, v.name);
  const e = refs[stmtAt(r.identifier.start)][v.name] ||= { r: 0, w: 0, eval: 0 };
  if (r.isWrite()) e.w++; if (r.isRead()) e.r++; if (!deferred(r.from)) e.eval++;
}

// 1. UNPLACED
const unplaced = ast.body.map((n, i) => i).filter(i => fileOf[i] < 0);
console.log(`\n# Unplaced statements: ${unplaced.length}`);
for (const i of unplaced) console.log('  ' + lab(i));
if (unplaced.length) failed = true;

// 2. UPWARD REFERENCES
console.log('\n# Upward references (file -> higher file)');
let upward = 0;
ast.body.forEach((n, i) => {
  const f = fileOf[i]; if (f <= 0) return;
  for (const [nm, e] of Object.entries(refs[i])) {
    const di = declIdx.get(nm); if (di === undefined || di === i) continue;
    const tf = fileOf[di]; if (tf > f) { upward++; console.log(`  ${f}->${tf}  ${lab(i)}  ${nm}${e.eval ? ' [EVAL]' : ''}${e.w ? ' [WRITE]' : ''}`); }
  }
});
console.log(`  total ${upward}`);

// 3. CROSS-FILE REASSIGNMENT
console.log('\n# Bindings reassigned from another file (each needs an owning object)');
const writers = {};
ast.body.forEach((n, i) => {
  for (const [nm, e] of Object.entries(refs[i])) {
    if (!e.w) continue; const di = declIdx.get(nm); if (di === undefined || fileOf[di] === fileOf[i]) continue;
    (writers[nm] ||= { decl: di, by: [] }).by.push(`${lab(i)} (file ${fileOf[i]})`);
  }
});
for (const [nm, w] of Object.entries(writers)) console.log(`  ${nm} (decl ${lineOf(S, ast.body[w.decl])}, file ${fileOf[w.decl]}) <- ${w.by.join('; ')}`);

// 4. EVAL-TIME REACHABILITY: follow calls, `new`, X.m() and this.m() from each statement; callbacks are deferred,
// except arguments of synchronous array methods.
const SYNC = new Set(['forEach', 'map', 'filter', 'reduce', 'some', 'every', 'find', 'findIndex', 'sort', 'from', 'flatMap', 'replace']);
const isFn = n => n && (n.type === 'FunctionExpression' || n.type === 'ArrowFunctionExpression');
const units = new Map();
ast.body.forEach((n, i) => {
  units.set(`#${i}`, { nodes: [n], self: null, evalOnly: true });
  if (n.type === 'FunctionDeclaration') units.set(n.id.name, { nodes: [n.body, ...n.params], self: null });
  if (n.type === 'ClassDeclaration') {
    const c = n.id.name, ctor = [];
    for (const m of n.body.body) {
      const key = m.key && (m.key.name || m.key.value);
      if (m.type === 'MethodDefinition' && m.kind === 'constructor') ctor.push(m.value.body);
      else if (m.type === 'MethodDefinition') units.set(`${c}.${key}`, { nodes: [m.value.body], self: c });
      else if (m.type === 'PropertyDefinition' && m.value && !m.static) ctor.push(m.value);
    }
    units.set(`new ${c}`, { nodes: ctor, self: c, sup: n.superClass && n.superClass.name });
  }
  if (n.type === 'VariableDeclaration') for (const d of n.declarations) {
    if (d.id.type !== 'Identifier' || !d.init) continue;
    if (d.init.type === 'ObjectExpression') for (const p of d.init.properties) {
      if (p.type === 'Property' && (isFn(p.value) || p.method || p.kind === 'get')) units.set(`${d.id.name}.${p.key.name || p.key.value}`, { nodes: [p.value.body], self: d.id.name });
    }
    if (isFn(d.init)) units.set(d.id.name, { nodes: [d.init.body], self: null });
  }
});
function scan(u) {
  const reads = new Set(), calls = new Set();
  const visit = (node, top) => walk.recursive(node, null, {
    Function(f, st, c) { if (f === top || f._sync) c(f.body); },
    Identifier(id) { const nm = modRef.get(id.start); if (nm) reads.add(nm); },
    CallExpression(ce, st, c) {
      const cal = ce.callee;
      if (cal.type === 'Identifier') { const nm = modRef.get(cal.start); if (nm) calls.add(nm); }
      if (cal.type === 'MemberExpression' && !cal.computed) {
        const pn = cal.property.name;
        if (cal.object.type === 'Identifier') { const nm = modRef.get(cal.object.start); if (nm) calls.add(`${nm}.${pn}`); }
        if (cal.object.type === 'ThisExpression' && u.self) calls.add(`${u.self}.${pn}`);
        if (SYNC.has(pn)) for (const a of ce.arguments) if (isFn(a)) a._sync = true;
      }
      c(cal); for (const a of ce.arguments) c(a);
    },
    NewExpression(ne, st, c) {
      if (ne.callee.type === 'Identifier') { const nm = modRef.get(ne.callee.start); if (nm) calls.add(`new ${nm}`); }
      if (ne.callee.type === 'MemberExpression' && ne.callee.object.name === 'THREE') calls.add(`THREE.${ne.callee.property.name}`);
      c(ne.callee); for (const a of ne.arguments) c(a);
    },
    MemberExpression(me, st, c) { c(me.object); if (me.computed) c(me.property); },
    Property(p, st, c) { if (p.computed) c(p.key); c(p.value); },
    PropertyDefinition(p, st, c) { if (p.computed) c(p.key); if (p.value && p.static) c(p.value); },
    MethodDefinition(m, st, c) { if (m.computed) c(m.key); },
    StaticBlock(b, st, c) { for (const s of b.body) c(s); }
  });
  for (const n of u.nodes) {
    if (u.evalOnly && n.type === 'FunctionDeclaration') continue;            // a declaration runs nothing
    if (u.evalOnly && n.type === 'ClassDeclaration') {                        // extends, static fields, static blocks
      if (n.superClass) visit(n.superClass);
      for (const m of n.body.body) if ((m.type === 'PropertyDefinition' && m.static && m.value) || m.type === 'StaticBlock') visit(m.type === 'StaticBlock' ? m : m.value);
      continue;
    }
    visit(n, n);
  }
  if (u.sup) calls.add(`new ${u.sup}`);
  return { reads, calls };
}
const cache = new Map();
const get = k => { if (!cache.has(k)) { const u = units.get(k); cache.set(k, u ? scan(u) : null); } return cache.get(k); };
const closure = i => { const seen = new Set(), q = [[`#${i}`, []]], out = []; while (q.length) { const [k, path] = q.shift(); if (seen.has(k)) continue; seen.add(k); out.push([k, path]); const r = get(k); if (r) for (const c of r.calls) q.push([c, [...path, c]]); } return out; };

console.log('\n# Eval-time reads of a higher file or a later declaration (class TDZ)');
const tdz = new Set();
ast.body.forEach((n, i) => {
  const f = fileOf[i]; if (f <= 0) return;
  for (const [k, path] of closure(i)) {
    const r = get(k); if (!r) continue;
    for (const nm of r.reads) {
      if (declNames(n).includes(nm)) continue;
      const di = declIdx.get(nm); if (di === undefined) continue;
      const tf = fileOf[di]; if (tf <= 0) continue;
      if (tf > f || (tf === f && di > i && ast.body[di].type !== 'FunctionDeclaration'))
        tdz.add(`  ${f}->${tf}${tf === f ? ' LATER' : ''}  ${lab(i)} reads ${nm} via ${path.join(' > ') || '(direct)'}`);
    }
  }
});
for (const t of tdz) console.log(t);
console.log(`  total ${tdz.size}`);

// 5. THREE CONSTRUCTION ORDER
console.log('\n# Statements that construct three objects or add to the scene: original order kept?');
const KIND = /Material$|^(Mesh|InstancedMesh|Points|LineSegments|Line|Sprite|Group|Object3D)$/;
const hits = [];
ast.body.forEach((n, i) => {
  if (fileOf[i] <= 0) return;
  let n3 = 0;
  for (const [k] of closure(i)) { if (k.startsWith('THREE.') ? KIND.test(k.slice(6)) : (k === 'scene.add' || k === 'rig.add')) n3++; }
  if (n3) hits.push(i);
});
const reordered = [...hits].sort((a, b) => fileOf[a] - fileOf[b] || a - b);
const moved = reordered.filter((h, k) => hits[k] !== h);
console.log(`  ${hits.length} constructing statements; ${moved.length ? 'ORDER CHANGED for ' + moved.map(lab).join(', ') : 'order unchanged'}`);

process.exit(failed ? 1 : 0);
