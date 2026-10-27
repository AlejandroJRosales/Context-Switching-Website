// PHASE 6 CUT: src/7-sim.js out of src/9-main.js (lib/cut.mjs), with the phase's edits (decisions Q1, Q2, Q3):
//   - step stops drawing: it returns before its tick advances; frame draws the tick (drawEcosystem, the same calls in
//     the same order) and then calls ecosystem.endTick(). The intro's drive path draws only its walkers, as before.
//   - clear and initialize stop drawing and stop resetting the player: main's clearEcosystem and populate do it around
//     them, in the order the inventory checked (E4). syncPopulation becomes populationChanged(), and main refreshes the
//     HUD on it.
//   - game.update runs from an after-contacts hook the game registers (same place in step); the player's avatar is an
//     agent the game registers on the ecosystem (Animal's three reads).
//   - plants report to the renderer through plantView (add, remove, touch, pending), which the plant renderer fills.
//   - simSky owns site and sunAltDeg (updateSky still computes the altitude, exact option); its sky redraw and HUD minute
//     run through hooks main fills.
//   - rename: world -> ecosystem, NpcWorld -> Ecosystem (scope-resolved; in comments: NpcWorld everywhere, the instance in
//     the three comments that name it, the section header).
//   - VR is skipped, as asked: vr.poll keeps calling ecosystem.initialize directly (renamed only).
//   node cut-phase6.mjs <projectDir> [--record]   (--record writes the renames and new names into placement.json)
import fs from 'node:fs';
import path from 'node:path';
import { cut, analyze, applyEdits, members, addMember, letsIntoObject, renameBinding, lineStart, lineEnd } from './lib/cut.mjs';
import { declNames, unwrap } from './lib/source.mjs';

const root = process.argv[2];
if (!root) { console.error('usage: node cut-phase6.mjs <projectDir>'); process.exit(2); }

const headers = {
  7: [
    '// 7-sim.js: SIM. The artificial life and the game clock: brains, entities, the ecosystem, the sky clock.',
    '// Owns: BrainFactory (brains), SpikingNetwork, maskLists, Entity, Animal (with the human look genetics: humanLook,',
    '// packHumanLook, inheritHumanLook; fight helpers startFightMove, humanFightAct, sampleFightKeys; humanMassKg,',
    '// personInfoKey, personInfoFields), Plant and plantView, Ecosystem (ecosystem), simSky (game clock and weather, the',
    '// site and the drawn sun altitude) with presetHour.',
    '// May import: 1-config.js to 6-worlds.js and three. It never calls the render, player, game or main layers: they',
    '// read its state, draw after step (then endTick), fill its hooks (afterContacts, avatar, plantView, simSky.onSkyStep',
    '// and onMinute) and wrap initialize and clear (populate, clearEcosystem).',
    '// Config blocks it reads: NPC, fight moves and pounces, species, sizes, brain, plants, food boxes, sky presets.',
    '']
};

// HELPERS over one text
const src = (s, n) => s.slice(n.start, n.end);
const walkAll = (root, test) => {
  const hits = [];
  (function visit(n) {
    if (!n || typeof n.type !== 'string') return;
    if (test(n)) hits.push(n);
    for (const k in n) { if (k === 'loc' || k === 'range') continue; const c = n[k]; if (Array.isArray(c)) c.forEach(visit); else if (c && typeof c.type === 'string') visit(c); }
  })(root);
  return hits;
};
const classOf = (ast, name) => ast.body.map(unwrap).find(n => n.type === 'ClassDeclaration' && n.id.name === name);
const methodOf = (cls, name) => cls.body.body.find(m => m.key && m.key.name === name && m.type === 'MethodDefinition');
const fnOf = (ast, name) => ast.body.map(unwrap).find(n => n.type === 'FunctionDeclaration' && n.id.name === name);
const objOf = (ast, name) => { for (const n of ast.body.map(unwrap)) if (n.type === 'VariableDeclaration') for (const d of n.declarations) if (d.id.name === name && d.init && d.init.type === 'ObjectExpression') return d.init; return null; };
const stmts = body => body.body;   // a BlockStatement's statements
const isCall = (n, obj, meth) => n.type === 'ExpressionStatement' && n.expression.type === 'CallExpression' && n.expression.callee.type === 'MemberExpression' &&
  !n.expression.callee.computed && n.expression.callee.property.name === meth &&
  (obj === 'this' ? n.expression.callee.object.type === 'ThisExpression' : n.expression.callee.object.type === 'Identifier' && n.expression.callee.object.name === obj);
const one = (list, what) => { if (list.length !== 1) throw new Error(`${what}: expected 1, found ${list.length}`); return list[0]; };
// whole lines of a statement, plus comment lines directly above it when `withComments`
function lineSpan(s, n, withComments) {
  let a = lineStart(s, n.start);
  if (withComments) while (a > 0 && /^\s*\/\//.test(s.slice(lineStart(s, a - 1), a))) a = lineStart(s, a - 1);
  return { start: a, end: lineEnd(s, n.end) };
}
const indentOf = (s, n) => s.slice(lineStart(s, n.start), n.start);
// text of statements (their whole lines) re-indented to `ind`, with this.X -> ecosystem.X
function moveOut(s, list, ind, withComments) {
  return list.map(n => {
    const sp = lineSpan(s, n, withComments), from = indentOf(s, n);
    let t = s.slice(sp.start, sp.end);
    const local = walkAll(n, x => x.type === 'ThisExpression').map(x => ({ start: x.start - sp.start, end: x.end - sp.start, text: 'world' }));
    t = applyEdits(t, local);
    return t.split('\n').map(l => l.startsWith(from) ? ind + l.slice(from.length) : l).join('\n');
  }).join('');
}

function edits(texts, eol) {
  const CR = eol === '\r\n' ? '\r' : '';
  const out = {};   // texts carried from the sim to main

  // SIM: NpcWorld (renamed at the end)
  {
    let s = texts[7], { ast } = analyze(s);
    const cls = classOf(ast, 'NpcWorld'), e = [];
    // constructor: the two hooks, after `this.night = false;`
    const ctor = methodOf(cls, 'constructor');
    const night = one(stmts(ctor.value.body).filter(n => /^this\.night = false;/.test(src(s, n))), 'ctor night');
    const ci = indentOf(s, night);
    e.push({ start: lineEnd(s, night.end), end: lineEnd(s, night.end), text:
      `${ci}this.afterContacts = [];   // fn(dt) run after each tick's contacts, before the dead are removed (the game registers)${eol}` +
      `${ci}this.avatar = null;        // the player's avatar, an external agent animals sense and hunt (the game registers)${eol}` });
    // clear(): renderers and the HUD move to main's clearEcosystem
    const clear = methodOf(cls, 'clear');
    const clearDraw = stmts(clear.value.body).filter(n => ['animalRenderer', 'blobShadows', 'plantRenderer', 'healthBars'].some(o => n.type === 'ExpressionStatement' && src(s, n).startsWith(o + '.')));
    const clearSync = one(stmts(clear.value.body).filter(n => isCall(n, 'this', 'syncPopulation')), 'clear sync');
    if (clearDraw.length !== 5) throw new Error('clear draws');
    out.clearDraw = moveOut(s, clearDraw, '  ', false);
    for (const n of [...clearDraw, clearSync]) e.push({ ...lineSpan(s, n, false), text: '' });
    // syncPopulation -> populationChanged
    const sync = methodOf(cls, 'syncPopulation');
    e.push({ start: sync.key.start, end: sync.key.end, text: 'populationChanged' });
    const ret = one(walkAll(sync, n => n.type === 'ReturnStatement' && !n.argument), 'sync return');
    e.push({ start: ret.start, end: ret.end, text: 'return false;' });
    const hud = one(stmts(sync.value.body).filter(n => /^refreshHud\(\);/.test(src(s, n))), 'sync refreshHud');
    e.push({ start: hud.start, end: hud.end, text: 'return true;' });
    e.push({ start: lineStart(s, sync.start), end: lineStart(s, sync.start), text: `${indentOf(s, sync)}// true once per population change; main refreshes the HUD on it${eol}` });
    // initialize: the player's reset and body, renderer init, instance writes and the HUD move to main's populate
    const init = methodOf(cls, 'initialize'), ib = stmts(init.value.body);
    const pick = (re, what) => one(ib.filter(n => re.test(src(s, n))), what);
    const gReset = pick(/^game\.reset\(\);/, 'game.reset'), newBody = pick(/^pov\.newBody\(\);/, 'pov.newBody');
    const aInit = pick(/^animalRenderer\.init\(\);/, 'animal init'), pInit = pick(/^plantRenderer\.init\(b\);/, 'plant init');
    const writes = ib.filter(n => /^(animalRenderer\.update\(this\.animals, 0\)|blobShadows\.update\(this\.animals\)|foodBoxView\.render\(\)|plantRenderer\.update\(this\.plants\));/.test(src(s, n)));
    if (writes.length !== 4) throw new Error('initialize writes');
    const iSync = one(ib.filter(n => isCall(n, 'this', 'syncPopulation')), 'init sync');
    out.initWrites = moveOut(s, writes, '  ', true);
    out.newBody = moveOut(s, [newBody], '  ', true);
    e.push({ ...lineSpan(s, gReset, false), text: '' }, { ...lineSpan(s, newBody, true), text: '' },
      { ...lineSpan(s, aInit, false), text: '' }, { ...lineSpan(s, pInit, false), text: '' }, { ...lineSpan(s, iSync, false), text: '' });
    for (const n of writes) e.push({ ...lineSpan(s, n, n === writes[0]), text: '' });
    // step: the after-contacts hook, plantView's pending gate, the draws out, endTick
    const step = methodOf(cls, 'step'), sb = stmts(step.value.body);
    const gUpd = one(sb.filter(n => /^game\.update\(dt\);/.test(src(s, n))), 'game.update');
    e.push({ start: gUpd.start, end: gUpd.end, text: 'for (const f of this.afterContacts) f(dt);' });
    for (const n of members(step, 'plantRenderer', 'pending')) e.push({ start: n.start, end: n.end, text: 'plantView.pending' });
    const regrow = one(sb.filter(n => /\.regrow\(this\);/.test(src(s, n))), 'regrow');
    const after = sb.slice(sb.indexOf(regrow) + 1);
    const tick = one(after.filter(n => /^this\.ticks\+\+;/.test(src(s, n))), 'ticks++');
    const draws = after.slice(0, after.indexOf(tick));
    const syncS = one(draws.filter(n => isCall(n, 'this', 'syncPopulation')), 'step sync');
    out.stepDraws = draws.map(n => n === syncS ? null : n);
    out.stepDrawText = draws.map(n => n === syncS ? `  if (world.populationChanged()) refreshHud();${eol}` : moveOut(s, [n], '  ', false)).join('');
    for (const n of draws) e.push({ ...lineSpan(s, n, false), text: '' });
    e.push({ ...lineSpan(s, tick, false), text: '' });
    e.push({ start: lineEnd(s, step.end), end: lineEnd(s, step.end), text:
      `${eol}${indentOf(s, step)}// The tick's clock advances once main has drawn it (the renderers read this tick's ticks and time).${eol}` +
      `${indentOf(s, step)}endTick() { this.ticks++; }${eol}` });
    texts[7] = applyEdits(s, e);
  }
  // SIM: Animal and Plant report through plantView and read the registered avatar; plantView before Plant
  {
    let s = texts[7], { ast } = analyze(s);
    const e = [];
    const animal = classOf(ast, 'Animal');
    for (const n of members(animal, 'game', 'avatar')) e.push({ start: n.start, end: n.end, text: 'world.avatar' });
    const plant = classOf(ast, 'Plant');
    for (const k of ['add', 'remove', 'touch']) for (const n of [...members(plant, 'plantRenderer', k), ...members(animal, 'plantRenderer', k)]) e.push({ start: n.start, end: n.end, text: `plantView.${k}` });
    const pStart = lineSpan(s, ast.body.map(unwrap).find(n => n === plant) && ast.body.find(n => unwrap(n) === plant), true).start;
    e.push({ start: pStart, end: pStart, text:
      `// PLANT VIEW: how plants reach their renderer without the sim calling it. The plant renderer fills add, remove and${eol}` +
      `// touch, and raises pending when a plant waits for a free slot (step then retries plant.update).${eol}` +
      `const plantView = { add: null, remove: null, touch: null, pending: false };${eol}${eol}` });
    texts[7] = applyEdits(s, e);
  }
  // SIM: simSky's hooks; site and sunAltDeg become its fields (updateSky still writes the altitude)
  {
    let s = texts[7], { ast } = analyze(s);
    const sky = objOf(ast, 'simSky'), upd = sky.properties.find(p => p.key.name === 'update');
    const e = [];
    e.push({ start: one(walkAll(upd, n => n.type === 'ExpressionStatement' && /^updateSky\(\);/.test(src(s, n))), 'sky updateSky').start,
      end: one(walkAll(upd, n => n.type === 'ExpressionStatement' && /^updateSky\(\);/.test(src(s, n))), 'sky updateSky').end, text: 'this.onSkyStep();' });
    const hudCall = one(walkAll(upd, n => n.type === 'CallExpression' && n.callee.type === 'Identifier' && n.callee.name === 'refreshHud'), 'sky refreshHud');
    e.push({ start: hudCall.start, end: hudCall.end, text: 'this.onMinute()' });
    texts[7] = applyEdits(s, e);
    addMember(texts, 7, 'simSky', 'on', 'onSkyStep: null, onMinute: null,   // the sky redraw and the HUD minute (main fills them)');
    letsIntoObject(texts, eol, { file: 9, objFile: 7, object: 'simSky', fields: ['site', 'sunAltDeg'], before: 'onSkyStep',
      notes: { site: 'where the world is on Earth { lat, lon, offset } (the loads set it)', sunAltDeg: 'the drawn sun\'s altitude (degrees), set by updateSky; night reads it' } });
  }
  // RENDER (still in main): PlantRenderer's pending flag lives on plantView
  {
    let s = texts[9], { ast } = analyze(s);
    const pr = classOf(ast, 'PlantRenderer'), e = [];
    const ctorPend = one(walkAll(methodOf(pr, 'constructor'), n => n.type === 'ExpressionStatement' && /^this\.pending = false;/.test(src(s, n))), 'pending init');
    e.push({ ...lineSpan(s, ctorPend, false), text: '' });
    for (const n of members(pr, 'this', 'pending')) if (n.start > ctorPend.end) e.push({ start: n.start, end: n.end, text: 'plantView.pending' });
    texts[9] = applyEdits(s, e);
  }
  // MAIN: helpers, frame, loads, registrations
  {
    let s = texts[9], { ast } = analyze(s);
    const e = [];
    const drawFn = `// One sim tick drawn: the renderers, labels, rays and HUD read the tick before endTick advances its clock (they ran${eol}` +
      `// at the end of step before).${eol}function drawEcosystem(dt) {${eol}${out.stepDrawText.replace(/\bdt\b/g, 'dt')}}${eol}${eol}`;
    const frame = fnOf(ast, 'frame');
    const fStart = lineSpan(s, ast.body.find(n => unwrap(n) === frame), true).start;
    e.push({ start: fStart, end: fStart, text: drawFn });
    // frame: after the step, draw then advance; the intro (drive) path draws only its walkers
    const driveIf = one(walkAll(frame, n => n.type === 'IfStatement' && /providers\.active\.drive/.test(src(s, n.test))), 'frame drive if');
    const dInd = indentOf(s, driveIf);
    e.push({ ...lineSpan(s, driveIf, true), text:
      `${dInd}// draw the tick, then advance its clock; a provider that drives its own walkers (the intro) has already ticked and${eol}` +
      `${dInd}// only moves them, so only they are drawn${eol}` +
      `${dInd}${src(s, driveIf)}${eol}${dInd}else if (npcDue) { drawEcosystem(npcElapsed); world.endTick(); }${eol}` });
    // populate and clearEcosystem, before teardownWorld
    const td = fnOf(ast, 'teardownWorld');
    const tdStart = lineSpan(s, ast.body.find(n => unwrap(n) === td), true).start;
    e.push({ start: tdStart, end: tdStart, text:
      `// A new population on \`provider\`: the player's state and body, the renderers ready before the first plant, the sim's${eol}` +
      `// own spawn, then its instance data and the HUD (the order initialize ran them in, renderer init moved ahead of it).${eol}` +
      `function populate(provider) {${eol}  game.reset();${eol}${out.newBody}  animalRenderer.init();${eol}  plantRenderer.init(provider.bounds);${eol}` +
      `  world.initialize(provider);${eol}${out.initWrites}  if (world.populationChanged()) refreshHud();${eol}}${eol}${eol}` +
      `// The ecosystem emptied, and its renderers and HUD with it (what clear drew before).${eol}` +
      `function clearEcosystem() {${eol}  world.clear();${eol}${out.clearDraw}  if (world.populationChanged()) refreshHud();${eol}}${eol}${eol}` });
    // loads: initialize -> populate, clear -> clearEcosystem (vr.poll is left alone)
    const vrObj = objOf(ast, 'vr');
    for (const n of members(ast, 'world', 'initialize')) {
      if (vrObj && n.start > vrObj.start && n.end < vrObj.end) continue;
      e.push({ start: n.start, end: n.end, text: 'populate' });
    }
    for (const n of walkAll(ast, x => x.type === 'CallExpression' && x.callee.type === 'MemberExpression' && x.callee.object.name === 'world' && x.callee.property.name === 'clear'))
      e.push({ start: n.start, end: n.end, text: 'clearEcosystem()' });
    // registrations: the plant view after the plant renderer exists, the game's hooks after the game exists, the sky
    // hooks next to loop.frame
    const pr = one(ast.body.filter(n => n.type === 'VariableDeclaration' && declNames(n)[0] === 'plantRenderer'), 'plantRenderer decl');
    e.push({ start: lineEnd(s, pr.end), end: lineEnd(s, pr.end), text:
      `// the sim's plants report to this renderer${eol}plantView.add = p => plantRenderer.add(p);${eol}plantView.remove = p => plantRenderer.remove(p);${eol}plantView.touch = p => plantRenderer.touch(p);${eol}` });
    const game = one(ast.body.filter(n => n.type === 'VariableDeclaration' && declNames(n)[0] === 'game'), 'game decl');
    e.push({ start: lineEnd(s, game.end), end: lineEnd(s, game.end), text:
      `${eol}// the game's hooks into the sim: Survivor rules after each tick's contacts; the avatar the animals sense and hunt${eol}` +
      `world.afterContacts.push(dt => game.update(dt));${eol}world.avatar = game.avatar;${eol}` });
    const reg = one(ast.body.filter(n => n.type === 'ExpressionStatement' && /^loop\.frame = frame;/.test(src(s, n))), 'loop.frame');
    e.push({ start: lineEnd(s, reg.end), end: lineEnd(s, reg.end), text:
      `// the sim's sky clock redraws the sky and the HUD minute through these${eol}simSky.onSkyStep = updateSky;${eol}simSky.onMinute = refreshHud;${eol}` });
    texts[9] = applyEdits(s, e);
  }

  // RENAME: world -> ecosystem, NpcWorld -> Ecosystem (code), then the comments
  renameBinding(texts, 'world', 'ecosystem');
  renameBinding(texts, 'NpcWorld', 'Ecosystem');
  const COMMENT_EDITS = [
    ['while world.time < fightUntil', 'while ecosystem.time < fightUntil'],
    ["the world's ticks restart with it", "the ecosystem's ticks restart with it"],
    ["The NPC world's view of the player", "The ecosystem's view of the player"],
    ['// NPC WORLD: ', '// ECOSYSTEM: ']
  ];
  for (const f of Object.keys(texts).map(Number)) {
    let s = texts[f];
    const { ast } = analyze(s);
    const cm = [];
    acornComments(s).forEach(c => {
      let t = s.slice(c.start, c.end), u = t.replace(/\bNpcWorld\b/g, 'Ecosystem');
      for (const [a, b] of COMMENT_EDITS) u = u.split(a).join(b);
      if (u !== t) cm.push({ start: c.start, end: c.end, text: u });
    });
    texts[f] = applyEdits(s, cm);
  }
}

import * as acorn from 'acorn';
function acornComments(s) { const c = []; acorn.parse(s, { ecmaVersion: 'latest', sourceType: 'module', onComment: (b, t, a, z) => c.push({ start: a, end: z }) }); return c; }

const { moved } = cut({ root, take: [7], headers, edits });
console.log('moved statements', moved);
// the placement now knows the renamed declarations
const pp = path.join(path.dirname(new URL(import.meta.url).pathname), 'placement.json');
const p = JSON.parse(fs.readFileSync(pp, 'utf8'));
if (process.argv.includes('--record') && (!p.renamed || p.renamed.world !== 'ecosystem')) {
  p.renamed = Object.assign(p.renamed || {}, { world: 'ecosystem', NpcWorld: 'Ecosystem' });
  p.added = Object.assign(p.added || {}, { plantView: 'src/7-sim.js', drawEcosystem: 'src/9-main.js', populate: 'src/9-main.js', clearEcosystem: 'src/9-main.js' });
  p.changes = (p.changes || []).concat(['phase 6: world -> ecosystem, NpcWorld -> Ecosystem (renamed); plantView new in 7; drawEcosystem, populate, clearEcosystem new in 9']);
  fs.writeFileSync(pp, JSON.stringify(p, null, 1));
}
