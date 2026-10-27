// LAYERS: the split's structural rules, on src/N-name.js.
//   node check-layers.mjs <srcDir> [game.html]
// Errors (exit 1):
//   - an import from a same- or higher-numbered module, or from a relative path that is not a src module
//   - an imported name the target module does not export
//   - a write to an imported binding (an `export let` another file reassigns; it would throw at runtime)
//   - a free name no module declares or imports and the original never used as a global (a missing import);
//     needs game.html for the original's globals
// Reports (no failure): `export let` bindings and who writes them; top-level statements in files 1 to 8 that are not
// declarations, imports or exports (the "files 1 to 8 declare; main starts" rule), with top-level listener
// registration, wake() and invalidate() calls marked.
import path from 'node:path';
import * as eslintScope from 'eslint-scope';
import { loadModules, loadHtmlModule, unwrap, declNames } from './lib/source.mjs';

const [srcDir, htmlPath] = process.argv.slice(2);
if (!srcDir) { console.error('usage: node check-layers.mjs <srcDir> [game.html]'); process.exit(2); }
const mods = loadModules(srcDir);
const byName = new Map(mods.map(m => [m.name, m]));
const errors = [], notes = [];
const BARE_OK = /^three(\/|$)/;   // three stays external through the importmap

// globals the original used (anything else unresolved in a module is a missing import)
let knownGlobals = null;
if (htmlPath) {
  const o = loadHtmlModule(htmlPath);
  const sm = eslintScope.analyze(o.ast, { ecmaVersion: 2022, sourceType: 'module' });
  knownGlobals = new Set(sm.scopes.find(s => s.type === 'module').through.map(r => r.identifier.name));
}

// exports per module
const exportsOf = new Map();
for (const m of mods) {
  const ex = new Map();   // name -> 'let' | 'const' | 'function' | 'class' | 'var'
  for (const n of m.ast.body) {
    if (n.type === 'ExportNamedDeclaration') {
      if (n.declaration) for (const nm of declNames(n)) ex.set(nm, n.declaration.kind || (n.declaration.type === 'ClassDeclaration' ? 'class' : 'function'));
      for (const s of n.specifiers || []) {
        if (n.source) errors.push(`${m.name}: re-export from '${n.source.value}' (keep imports pointing down without pass-throughs)`);
        const local = m.ast.body.map(unwrap).find(d => declNames(d).includes(s.local.name));
        ex.set(s.exported.name, local ? (local.kind || (local.type === 'ClassDeclaration' ? 'class' : 'function')) : '?');
      }
    }
    if (n.type === 'ExportDefaultDeclaration' || n.type === 'ExportAllDeclaration') errors.push(`${m.name}: ${n.type} (use named exports)`);
  }
  exportsOf.set(m.name, ex);
}

for (const m of mods) {
  const sm = eslintScope.analyze(m.ast, { ecmaVersion: 2022, sourceType: 'module' });
  const scope = sm.scopes.find(s => s.type === 'module');
  // imports
  for (const n of m.ast.body) {
    if (n.type !== 'ImportDeclaration') continue;
    const src = n.source.value;
    if (BARE_OK.test(src)) continue;
    const target = path.basename(src);
    const t = byName.get(target);
    if (!src.startsWith('./') || !t) { errors.push(`${m.name}: import from '${src}' is not a src module or three`); continue; }
    if (t.num >= m.num) errors.push(`${m.name}: imports from ${t.name} (same or higher layer)`);
    for (const s of n.specifiers) {
      if (s.type !== 'ImportSpecifier') { errors.push(`${m.name}: ${s.type} from ${t.name} (use named imports)`); continue; }
      if (!exportsOf.get(t.name).has(s.imported.name)) errors.push(`${m.name}: imports '${s.imported.name}' which ${t.name} does not export`);
    }
  }
  // writes to imported bindings
  for (const v of scope.variables) {
    if (!v.defs.some(d => d.type === 'ImportBinding')) continue;
    for (const r of v.references) if (r.isWrite()) errors.push(`${m.name}:${r.identifier.loc.start.line}: writes imported '${v.name}' (make it a field on an owning object)`);
  }
  // missing imports
  if (knownGlobals) {
    const free = new Map();
    for (const r of scope.through) { const nm = r.identifier.name; if (!knownGlobals.has(nm)) free.set(nm, (free.get(nm) || r.identifier.loc.start.line)); }
    for (const [nm, line] of free) errors.push(`${m.name}:${line}: '${nm}' is neither declared, imported nor a global the original used (missing import?)`);
  }
  // export let and its writers (only the owner may reassign)
  for (const [nm, kind] of exportsOf.get(m.name)) {
    if (kind !== 'let' && kind !== 'var') continue;
    const v = scope.variables.find(x => x.name === nm);
    const w = v ? v.references.filter(r => r.isWrite() && !r.init).length : 0;
    notes.push(`${m.name}: export ${kind} ${nm} (${w} writes in its own file)`);
  }
  // top-level non-declarations in files 1 to 8
  if (m.num <= 8) for (const n of m.ast.body) {
    const u = unwrap(n);
    if (u.type === 'ImportDeclaration' || declNames(u).length || n.type === 'ExportNamedDeclaration') continue;
    const text = m.src.slice(n.start, n.end).split('\n')[0].slice(0, 100);
    const flag = /addEventListener\(/.test(m.src.slice(n.start, n.end)) ? ' [LISTENER]' : /\b(wake|invalidate)\(/.test(m.src.slice(n.start, n.end)) ? ' [WAKE]' : '';
    notes.push(`${m.name}:${n.loc.start.line}: top-level statement${flag}: ${text}`);
  }
}

console.log(`modules: ${mods.map(m => m.name).join(', ') || '(none)'}`);
if (!knownGlobals) console.log('(no game.html given: missing-import check skipped)');
console.log(`\n# Errors: ${errors.length}`); for (const e of errors) console.log('  ' + e);
console.log(`\n# Notes: ${notes.length}`); for (const n of notes) console.log('  ' + n);
process.exit(errors.length ? 1 : 0);
