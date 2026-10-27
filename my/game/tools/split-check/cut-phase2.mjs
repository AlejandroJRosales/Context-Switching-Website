// PHASE 2 CUT: src/9-main.js (phase 1) -> src/1-config.js + src/2-core.js + the rest left in src/9-main.js.
//   node cut-phase2.mjs <projectDir>
// Statements move whole (with the comment and blank lines above them) by placement.json, in their original order.
// The phase's required edits are applied to the AST, not retyped:
//   - loop: `let last`, `let rafId`, `let sceneDirty` become fields of a core `loop` object; every reference to them
//     becomes loop.<name> (scope-resolved, so locals named `last` are untouched); core's wake schedules loop.frame,
//     which main registers first thing (`loop.frame = frame`).
//   - angles: Animal's static wrapAngle/turnToward move to core as functions over a core TWO_PI; Animal.TWO_PI aliases it.
//   - growth scale: AnimalRenderer's `this.MIN_SCALE = 0.25` becomes config's GROWTH_MIN_SCALE, read at every former
//     MIN_SCALE site.
// Then every top-level declaration of files 1 and 2 is exported and each file imports exactly the lower-file names it
// uses. Line endings are kept as found.
import fs from 'node:fs';
import path from 'node:path';
import * as acorn from 'acorn';
import * as walk from 'acorn-walk';
import * as eslintScope from 'eslint-scope';
import { declNames } from './lib/source.mjs';

const root = process.argv[2];
if (!root) { console.error('usage: node cut-phase2.mjs <projectDir>'); process.exit(2); }
const SRC = path.join(root, 'src');
const MAIN = path.join(SRC, '9-main.js');
const PLACEMENT = path.join(path.dirname(new URL(import.meta.url).pathname), 'placement.json');
const PARSE = { ecmaVersion: 'latest', sourceType: 'module', locations: true, ranges: true };
const LOOP_FIELDS = ['last', 'rafId', 'sceneDirty'];        // original declaration order
const FILES = { 1: '1-config.js', 2: '2-core.js', 9: '9-main.js' };
const WRAP = 118;                                           // import list line width

const text = fs.readFileSync(MAIN, 'utf8');
const eol = text.includes('\r\n') ? '\r\n' : '\n';
const CR = eol === '\r\n' ? '\r' : '';
const placement = JSON.parse(fs.readFileSync(PLACEMENT, 'utf8'));
const fileNum = f => Number(String(f).match(/(\d)-/)[1]);

// PHASE 1 LAYOUT: header comment, then the script; html line = module line + offset (from the first import)
const ast0 = acorn.parse(text, PARSE);
const lines = text.split('\n');
const HTML_FIRST_SCRIPT_LINE = 1404;
const offset = HTML_FIRST_SCRIPT_LINE - ast0.body[0].loc.start.line;
const destOf = new Map();
for (const p of Object.values(placement.identifiers)) destOf.set(p.lines[0], fileNum(p.file));
for (const p of placement.statements) destOf.set(p.lines[0], fileNum(p.file));
const header9 = lines.slice(0, ast0.body[0].loc.start.line - 1);

// BLOCKS: each statement with the lines above it back to the previous statement
const out = { 1: [], 2: [], 9: [] };
ast0.body.forEach((n, i) => {
  const from = i === 0 ? n.loc.start.line : ast0.body[i - 1].loc.end.line + 1;
  const block = lines.slice(from - 1, n.loc.end.line);
  const f = n.type === 'ImportDeclaration' ? 9 : destOf.get(n.loc.start.line + offset);
  if (f === undefined) throw new Error(`no placement for module line ${n.loc.start.line} (${declNames(n).join(',')})`);
  out[f === 1 || f === 2 ? f : 9].push(...block);
});
const tail = lines.slice(ast0.body[ast0.body.length - 1].loc.end.line);   // after the last statement
let src = { 1: out[1].join('\n'), 2: out[2].join('\n'), 9: out[9].join('\n') };

// EDITS: offset edits on one file's text, applied back to front
function applyEdits(s, edits) {
  edits.sort((a, b) => b.start - a.start);
  for (let i = 1; i < edits.length; i++) if (edits[i].end > edits[i - 1].start) throw new Error('overlapping edits');
  for (const e of edits) s = s.slice(0, e.start) + e.text + s.slice(e.end);
  return s;
}
const lineStart = (s, pos) => s.lastIndexOf('\n', pos - 1) + 1;
const lineEnd = (s, pos) => { const k = s.indexOf('\n', pos); return k < 0 ? s.length : k + 1; };
const analyze = s => { const ast = acorn.parse(s, PARSE); const sm = eslintScope.analyze(ast, { ecmaVersion: 2022, sourceType: 'module' }); return { ast, mod: sm.scopes.find(x => x.type === 'module') }; };

// references to a module-level name: declared here, or free here (declared in another file)
function refsTo(mod, name) {
  const v = mod.variables.find(x => x.name === name);
  const declared = v ? v.references.map(r => r.identifier) : [];
  const free = mod.through.filter(r => r.identifier.name === name).map(r => r.identifier);
  return [...declared, ...free];
}

// the original static methods' text, for moving them into core
let angleSrc = null, minScaleValue = null;

// 9-main: loop refs, Animal statics, MIN_SCALE, Animal.TWO_PI alias
{
  const s = src[9], { ast, mod } = analyze(s), edits = [];
  for (const f of LOOP_FIELDS) for (const id of refsTo(mod, f)) edits.push({ start: id.start, end: id.end, text: `loop.${f}` });
  walk.full(ast, n => {
    if (n.type === 'MemberExpression' && !n.computed && n.object.type === 'Identifier' && n.object.name === 'Animal' &&
      (n.property.name === 'wrapAngle' || n.property.name === 'turnToward')) edits.push({ start: n.start, end: n.end, text: n.property.name });
  });
  const animal = ast.body.find(n => n.type === 'ClassDeclaration' && n.id.name === 'Animal');
  const statics = animal.body.body.filter(m => m.type === 'MethodDefinition' && m.static && ['wrapAngle', 'turnToward'].includes(m.key.name));
  if (statics.length !== 2) throw new Error('Animal statics not found');
  angleSrc = statics.map(m => s.slice(lineStart(s, m.start), lineEnd(s, m.end)));
  for (const m of statics) {
    let end = lineEnd(s, m.end);
    if (/^[ \t]*\r?\n/.test(s.slice(end, lineEnd(s, end)))) end = lineEnd(s, end);   // and the blank line after it
    const start = lineStart(s, m.start);
    // the statics move whole, so edits inside them (their own Animal.wrapAngle) are dropped
    for (let k = edits.length - 1; k >= 0; k--) if (edits[k].start >= start && edits[k].end <= end) edits.splice(k, 1);
    edits.push({ start, end, text: '' });
  }
  const two = animal.body.body.find(m => m.type === 'PropertyDefinition' && m.static && m.key.name === 'TWO_PI');
  edits.push({ start: two.value.start, end: two.value.end, text: 'TWO_PI' });
  walk.full(ast, n => {
    if (n.type === 'ExpressionStatement' && n.expression.type === 'AssignmentExpression' && n.expression.left.type === 'MemberExpression' &&
      n.expression.left.property.name === 'MIN_SCALE') {
      minScaleValue = s.slice(n.expression.right.start, n.expression.right.end);
      edits.push({ start: lineStart(s, n.start), end: lineEnd(s, n.end), text: '' });
      n.expression.left._skip = true;
    }
  });
  walk.full(ast, n => {
    if (n.type === 'MemberExpression' && !n.computed && n.property.name === 'MIN_SCALE' && !n._skip) edits.push({ start: n.start, end: n.end, text: 'GROWTH_MIN_SCALE' });
  });
  if (minScaleValue === null) throw new Error('MIN_SCALE assignment not found');
  src[9] = applyEdits(s, edits);
}

// 2-core: loop object for the three lets, refs, wake's frame, the angle functions before MathTools
{
  const s = src[2], { ast, mod } = analyze(s), edits = [];
  const lets = ast.body.filter(n => n.type === 'VariableDeclaration' && n.kind === 'let' && LOOP_FIELDS.includes(declNames(n)[0]));
  if (lets.length !== 3) throw new Error('loop lets not found in core');
  const init = Object.fromEntries(lets.map(n => [declNames(n)[0], s.slice(n.declarations[0].init.start, n.declarations[0].init.end)]));
  const fields = LOOP_FIELDS.map(f => `${f}: ${init[f]}`).join(', ');
  lets.forEach((n, k) => edits.push({ start: lineStart(s, n.start), end: lineEnd(s, n.end), text: k === 0 ?
    `// The frame loop's state: last frame time (-1 asleep), the pending rAF id (0 none), whether the scene changed since${eol}` +
    `// the last draw, and the frame function main registers (wake schedules it).${eol}` +
    `const loop = { ${fields}, frame: null };${eol}` : '' }));
  const lw = new Set(lets.flatMap(n => n.declarations.map(d => d.id.start)));
  for (const f of LOOP_FIELDS) for (const id of refsTo(mod, f)) if (!lw.has(id.start)) edits.push({ start: id.start, end: id.end, text: `loop.${f}` });
  for (const id of refsTo(mod, 'frame')) edits.push({ start: id.start, end: id.end, text: 'loop.frame' });
  // angles: the statics, as functions over TWO_PI, dedented to the top level
  const fns = angleSrc.map(m => {
    const ind = m.match(/^[ \t]*/)[0];
    return m.split('\n').map(l => l.startsWith(ind) ? l.slice(ind.length) : l).join('\n')
      .replace(/^static /, 'function ').replace(/Animal\.TWO_PI/g, 'TWO_PI').replace(/Animal\.wrapAngle/g, 'wrapAngle');
  });
  const mt = ast.body.findIndex(n => n.type === 'ClassDeclaration' && n.id.name === 'MathTools');
  const at = mt > 0 ? lineEnd(s, ast.body[mt - 1].end) : lineStart(s, ast.body[mt].start);
  edits.push({ start: at, end: at, text: `${CR}\n// ANGLES (Animal's former statics): headings live in [0, TWO_PI); turnToward steps by at most maxStep.${eol}` +
    `const TWO_PI = Math.PI * 2;${eol}${eol}${fns.join(eol)}` });
  src[2] = applyEdits(s, edits);
}

// 1-config: GROWTH_MIN_SCALE after NPC_MATURITY_TICKS
{
  const s = src[1], { ast } = analyze(s);
  const mat = ast.body.find(n => declNames(n).includes('NPC_MATURITY_TICKS'));
  const at = lineEnd(s, mat.end);
  src[1] = s.slice(0, at) + `const GROWTH_MIN_SCALE = ${minScaleValue};   // body scale at birth; drawn size and bodyHeightM grow from it to 1 over NPC_MATURITY_TICKS${eol}` + s.slice(at);
}

// EXPORTS: every top-level declaration of files 1 and 2
for (const f of [1, 2]) {
  const s = src[f], { ast } = analyze(s);
  src[f] = applyEdits(s, ast.body.filter(n => declNames(n).length).map(n => ({ start: n.start, end: n.start, text: 'export ' })));
}
const exportsOf = {};
for (const f of [1, 2]) exportsOf[f] = new Set(analyze(src[f]).ast.body.flatMap(n => n.type === 'ExportNamedDeclaration' ? declNames(n.declaration) : []));

// IMPORTS: the lower-file names each file uses
function importBlock(f) {
  const { mod } = analyze(src[f]);
  const free = new Set(mod.through.map(r => r.identifier.name));
  const blocks = [];
  for (const g of [1, 2]) {
    if (g >= f) continue;
    const names = [...exportsOf[g]].filter(n => free.has(n));
    if (!names.length) continue;
    const rows = []; let row = '';
    for (const n of names) { const add = row ? `${row}, ${n}` : `  ${n}`; if (add.length > WRAP) { rows.push(row + ','); row = `  ${n}`; } else row = add; }
    rows.push(row);
    blocks.push(`import {${eol}${rows.join(eol)}${eol}} from './${FILES[g]}';`);
  }
  return blocks.join(eol);
}

const HEADERS = {
  1: [
    '// 1-config.js: CONFIG. Every tunable table and derived constant: world size and city ladder, player and building',
    '// dimensions, Overpass/Nominatim/terrain endpoints and limits, OSM layer tables, graphics numbers, the NPC tables',
    '// (species, sizes, fight moves, pounces, ages), human rig and atlas numbers, food boxes, streets and lamps, coast,',
    '// cabins, cat, car and camera, Survivor (SURVIVOR_CONFIG with playerPlantFood), sky, rain, CITY_FILES and PICKS.',
    '// Owns: the values only; the three loops that fill PLACE_OF, PLACE_RE and NPC_TYPE_IDS derive tables from tables.',
    '// May import: nothing. Pure data; constants that construct three objects stay with their owners.',
    '// Config blocks, in order: world size, player, buildings, network, terrain, layers, places, loading steps, graphics,',
    '// shadows, city files, trees, signs, shells, NPC, human rig, billboards, plants, food boxes, streets, spawn, world,',
    '// coast, cabins, cat, camera, groves, mix, intro, blob shadows, Survivor, health bars, brain view, touch, car,',
    '// sky presets, debug probe, swim, NPC tick, sky, rain, picks.',
    ''],
  2: [
    '// 2-core.js: CORE. Math and spatial helpers every layer shares, plus the frame loop\'s state.',
    '// Owns: fmt, hash01, seededRandom, cellKey, gridOf, ring geometry (ringArea, bounds, dedupeRing, orientRing,',
    '// offsetRing, pointInRing, closestOnRing), fightEase/fightClamp01, TWO_PI/wrapAngle/turnToward, MathTools (and its',
    '// instance tools), SpatialGrid, ContactGrid, solarVector, moonVector, and `loop` with wake() and invalidate().',
    '// May import: 1-config.js. No three, no DOM building; wake() runs loop.frame, which 9-main registers.',
    ''],
  9: header9.map(l => l.replace(/\r$/, ''))
    .map(l => l.replace("// Owns: until the extraction phases, every top-level declaration of game.html's script (moved verbatim in phase 1).",
      '// Owns: until phases 3 to 7 extract them, everything not in 1-config.js or 2-core.js (moved verbatim).'))
    .map(l => l.replace('// May import: three (importmap) and src/1 to src/8. Its own config blocks move to 1-config.js in phase 2.',
      '// May import: three (importmap) and src/1 to src/8.'))
    .concat([''])
};
const head = f => HEADERS[f].join(eol);

// assemble: header, three imports (main), generated imports, main's loop.frame registration, the blocks
{
  const s9 = src[9], { ast } = analyze(s9);
  const lastImport = ast.body.filter(n => n.type === 'ImportDeclaration').pop();
  const cut = lineEnd(s9, lastImport.end);
  const reg = `${eol}// the core frame loop draws with this file's frame (wake() schedules loop.frame)${eol}loop.frame = frame;${eol}`;
  src[9] = s9.slice(0, cut) + reg + s9.slice(cut);
  src[9] = src[9].slice(0, cut) + importBlock(9) + eol + src[9].slice(cut);
}
const core = importBlock(2);
src[2] = (core ? core + eol + eol : '') + src[2];
// the last moved line still carries its '\r' on a CRLF file, so only '\n' closes it
const close = s => s + (s.endsWith('\r') ? '\n' : eol);
fs.writeFileSync(path.join(SRC, FILES[1]), head(1) + close(src[1]));
fs.writeFileSync(path.join(SRC, FILES[2]), head(2) + close(src[2]));
fs.writeFileSync(MAIN, head(9) + src[9] + (tail.length ? '\n' + tail.join('\n') : eol));
for (const f of [1, 2, 9]) console.log(`${FILES[f]}: ${fs.readFileSync(path.join(SRC, FILES[f]), 'utf8').split('\n').length} lines`);
