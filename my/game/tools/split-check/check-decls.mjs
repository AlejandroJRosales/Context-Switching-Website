// DECLS: every top-level declaration of the original game.html exists in exactly one module with the same code, and every
// other top-level statement of the original still appears somewhere (at the top level or moved into a bind/init body).
//   node check-decls.mjs <game.html> <srcDir> [edits.json ...]   (every phase's edits file so far, e.g. edits/*.json)
//   node check-decls.mjs --base <previous srcDir> - <srcDir> edits/phaseN.json   (this phase's changes only)
// Code is compared as token streams (whitespace and comments ignored); comments are compared separately, and a template
// literal whose text differs only in leading whitespace (a dedent) is reported as whitespace-only.
// edits.json lists what the phase is allowed to change:
//   { "changed": [names], "removed": [names], "added": [names], "statementsChanged": [original start lines],
//     "renamed": { "oldName": "newName" }, "commentsChanged": [names] }
// A rename is applied to the original's identifier tokens before comparing, so a pure rename counts as unchanged.
// Exit 1 on: a declaration missing, in more than one module, or changed without being listed; a statement not found
// without being listed; a new declaration not listed under "added"; comments changed inside a declaration that is not
// listed under "changed" or "commentsChanged". Listed items that turn out unchanged are reported.
import fs from 'node:fs';
import * as acorn from 'acorn';
import { loadHtmlModule, loadModules, unwrap, declNames, isDecl, lineOf, signature, commentsIn } from './lib/source.mjs';

const argv = process.argv.slice(2);
// --base <dir>: compare against a previous phase's src modules instead of game.html, so the edits file must list exactly
// what this phase changed (with game.html every phase's edits accumulate, and a second change to a listed name passes)
const baseAt = argv.indexOf('--base');
const baseDir = baseAt >= 0 ? argv.splice(baseAt, 2)[1] : null;
const [htmlPath, srcDir, ...editsPaths] = argv;
if (!htmlPath || !srcDir) { console.error('usage: node check-decls.mjs <game.html> <srcDir> [edits.json ...]'); process.exit(2); }
// the phases' edits accumulate (every phase is checked against the original), so all given files are merged
const edits = { changed: [], removed: [], added: [], statementsChanged: [], renamed: {}, commentsChanged: [] };
for (const p of editsPaths) {
  const e = JSON.parse(fs.readFileSync(p, 'utf8'));
  for (const k of ['changed', 'removed', 'added', 'statementsChanged', 'commentsChanged']) edits[k].push(...(e[k] || []));
  Object.assign(edits.renamed, e.renamed || {});
}
// the original as one parsed source: game.html's module script, or the base modules concatenated (one statement list)
function loadBase(dir) {
  const ms = loadModules(dir);
  const texts = ms.map(m => m.src.replace(/^\s*import[\s\S]*?from\s*['"][^'"]+['"];?/gm, m0 => m0.replace(/[^\n]/g, '')));   // imports blanked, lines kept
  const text = texts.join('\n');
  // concatenated line -> "file:line" in the base module, so statements are named where they are
  const starts = []; let at = 1;
  ms.forEach((m, k) => { starts.push([at, m.name]); at += texts[k].split('\n').length; });
  baseLine = l => { let i = starts.length - 1; while (i > 0 && starts[i][0] > l) i--; return `${starts[i][1]}:${l - starts[i][0] + 1}`; };
  const tokens = [], comments = [];
  const ast = acorn.parse(text, { ecmaVersion: 'latest', sourceType: 'module', locations: true, ranges: true, onToken: tokens, onComment: comments });
  ast.body = ast.body.map(n => unwrap(n));
  return { file: dir, src: text, lineOffset: 0, ast, tokens, comments };
}
let baseLine = null;
const O = baseDir ? loadBase(baseDir) : loadHtmlModule(htmlPath);
const mods = loadModules(srcDir);
const errors = [], report = { changed: [], whitespace: [], comments: [], listedUnchanged: [] };

// a statement's code range without its `export` wrapper
const rangeOf = n => { const u = unwrap(n); return [u.start, u.end]; };
const key = names => names.join(',');

// module declarations: name group -> [{ mod, node }]
const modDecls = new Map();
for (const m of mods) for (const n of m.ast.body) {
  if (!isDecl(n)) continue;
  const k = key(declNames(n));
  if (!modDecls.has(k)) modDecls.set(k, []);
  modDecls.get(k).push({ m, n });
}
// every module's whole-file token signature, for finding moved statements
const SEP = '\u0001';
// the original's signature with renamed identifiers swapped in (property names are tokens of the same type, so a
// rename also maps `.world`-style property tokens; there are none for the planned renames)
const RENAMED = new Map(Object.entries(edits.renamed));   // a Map, so names like toString never hit Object.prototype
const renameSig = sig => RENAMED.size ? sig.split(SEP).map(t => t.startsWith('name:') && RENAMED.has(t.slice(5)) ? 'name:' + RENAMED.get(t.slice(5)) : t).join(SEP) : sig;
const renameNames = names => names.map(nm => RENAMED.get(nm) || nm);
const modSig = mods.map(m => ({ m, sig: SEP + signature(m, 0, m.src.length).sig + SEP }));
const modTop = mods.map(m => ({ m, sigs: new Set(m.ast.body.filter(n => !isDecl(n)).map(n => signature(m, n.start, n.end).sig)) }));

const seen = new Set();
for (const n of O.ast.body) {
  if (n.type === 'ImportDeclaration') continue;
  const line = baseLine ? baseLine(n.loc.start.line) : lineOf(O, n);   // game.html line, or file:line in the base
  if (!isDecl(n)) {
    // a non-declaration statement: its tokens must appear in some module
    const s = renameSig(signature(O, n.start, n.end).sig);
    // a top-level match first (a short statement like `wake();` also occurs inside function bodies), else anywhere
    const top = modTop.filter(x => x.sigs.has(s)).map(x => x.m.name);
    const where = top.length ? top : modSig.filter(x => x.sig.includes(SEP + s + SEP)).map(x => x.m.name).slice(0, 1);
    const listed = edits.statementsChanged.includes(line);
    if (!where.length && !listed) errors.push(`statement at ${line} not found in any module: ${O.src.slice(n.start, n.end).split('\n')[0].trim().slice(0, 90)}`);
    if (where.length > 1) errors.push(`statement at ${line} found in ${where.join(', ')} (duplicated?)`);
    if (where.length && listed) report.listedUnchanged.push(`statement ${line}`);
    continue;
  }
  const names = declNames(n), k = key(renameNames(names));
  seen.add(k);
  const hits = modDecls.get(k) || [];
  const removed = names.every(nm => edits.removed.includes(nm));
  if (!hits.length) { if (!removed) errors.push(`${k} (line ${line}) is in no module`); continue; }
  if (removed) errors.push(`${k} is listed as removed but is in ${hits.map(h => h.m.name).join(', ')}`);
  if (hits.length > 1) { errors.push(`${k} is declared in ${hits.length} modules: ${hits.map(h => h.m.name).join(', ')}`); continue; }
  const { m, n: mn } = hits[0];
  const [oa, ob] = rangeOf(n), [ma, mb] = rangeOf(mn);
  const os = signature(O, oa, ob), ms = signature(m, ma, mb);
  os.sig = renameSig(os.sig);
  const listed = names.some(nm => edits.changed.includes(nm) || edits.changed.includes(RENAMED.get(nm)));   // old or new name
  if (os.sig !== ms.sig) {
    report.changed.push(`${k} (${m.name})${listed ? '' : '  NOT LISTED'}`);
    if (!listed) errors.push(`${k} changed in ${m.name} but is not listed in edits.changed`);
  } else {
    if (listed) report.listedUnchanged.push(k);
    if (os.rawTemplates.join('\0') !== ms.rawTemplates.join('\0')) report.whitespace.push(`${k} (${m.name})`);
  }
  const oc = commentsIn(O, n.start, n.end).join('\n'), mc = commentsIn(m, mn.start, mn.end).join('\n');
  const commentsListed = listed || names.some(nm => edits.commentsChanged.includes(nm) || edits.commentsChanged.includes(RENAMED.get(nm)));
  if (oc !== mc) {
    report.comments.push(`${k} (${m.name})${commentsListed ? '' : '  NOT LISTED'}`);
    if (!commentsListed) errors.push(`${k}: comments changed in ${m.name} but not listed in edits.commentsChanged`);
  }
}
// declarations that are new in the modules
for (const [k, hits] of modDecls) {
  if (seen.has(k)) continue;
  const listed = k.split(',').every(nm => edits.added.includes(nm));
  if (!listed) errors.push(`${k} is new in ${hits.map(h => h.m.name).join(', ')} but not listed in edits.added`);
}

const print = (title, list) => { console.log(`\n# ${title}: ${list.length}`); for (const x of list) console.log('  ' + x); };
console.log(`original: ${O.ast.body.length} top-level statements; modules: ${mods.map(m => m.name).join(', ')}`);
print('Changed declarations (code)', report.changed);
print('Comment changes inside declarations', report.comments);
print('Template literals changed only in leading whitespace', report.whitespace);
print('Listed in edits.json but unchanged', report.listedUnchanged);
print('Errors', errors);
process.exit(errors.length ? 1 : 0);
