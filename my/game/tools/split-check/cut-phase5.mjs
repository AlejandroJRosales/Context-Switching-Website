// PHASE 5 CUT: src/6-worlds.js out of src/9-main.js (lib/cut.mjs), with the phase's edits (decisions Q4, Q7, Q8):
//   - isOpen: NpcWorld's method becomes collision's isOpen(x, z) over collision.openBounds, which initialize copies from
//     the provider's bounds where it sets minX..maxZ today; every caller (providers, Animal, spawn) calls it directly.
//   - food boxes: foodBoxes owns its sight grid (foodBoxes.sight, built by buildSight at the same point of initialize);
//     its view cull (render) moves out as foodBoxView, a render-layer object (placed in 8) that reads foodBoxes' data.
//   - intro: IntroWorld.drive only moves walkers; frame draws them right after the step (the same two renderer calls,
//     after drive's tick, as before). The borrowed sky hour goes back through the clock loadIntroScene hands it.
//   - owners: groundMatchHalf -> groundMatch.half; shelters -> shelters.list with shelters.reset() (a new array, as
//     rain's roof cache compares identity).
//   - resets: cityWater, streets, elevation, occ, cover, wildWater, pebbles and the ground plane get the reset()
//     entry teardownWorld now calls (each does what teardownWorld did to it); provider teardowns are unchanged.
//   node cut-phase5.mjs <projectDir>
import { cut, analyze, applyEdits, refsTo, members, ownerObject, addMember, lineStart, lineEnd } from './lib/cut.mjs';
import { declNames } from './lib/source.mjs';

const root = process.argv[2];
if (!root) { console.error('usage: node cut-phase5.mjs <projectDir>'); process.exit(2); }

const headers = {
  6: [
    '// 6-worlds.js: WORLDS. What the providers build and the providers themselves.',
    '// Owns: city construction (elevation and terrain draping, buildings with shells, doors, roofs and the facade material,',
    '// ground layers, trees, barriers, props, signs, streets with curbs, markings, parking and lamps, cityWater, waterClip,',
    '// indoorClip, lampLight, places, foodBoxes with its sight grid), the wilderness (WildTerrain, HeightGrid, WildWater,',
    '// cabins and shelters, pebbles, groves), groundMatch, and the providers CityWorld, WildernessWorld, IntroWorld with',
    '// INTRO_SCENE.',
    '// May import: 1-config.js to 5-collision.js and three. No sim, render or main: what it once called upward (isOpen,',
    '// the food-box cull, the intro\'s renderers, the sky clock) now lives below it or is handed in.',
    '// Config blocks it reads: buildings, layers, roads, signs, trees, food boxes, streets and lamps, coast, cabins, mix,',
    '// groves, wild floating depth.',
    '']
};

// a statement inside `fnName` (top-level function) or `Cls.method`: its first node matching test
function findIn(ast, owner, test) {
  let root = null;
  const [cls, meth] = owner.split('.');
  for (const n of ast.body) {
    if (!meth && n.type === 'FunctionDeclaration' && n.id.name === cls) root = n;
    if (meth && n.type === 'ClassDeclaration' && n.id.name === cls) root = n.body.body.find(m => m.key && m.key.name === meth);
    if (meth && n.type === 'VariableDeclaration') for (const d of n.declarations) if (d.id.name === cls && d.init && d.init.properties) root = d.init.properties.find(p => p.key && p.key.name === meth);
  }
  if (!root) throw new Error(`${owner} not found`);
  const hits = [];
  (function visit(n) {
    if (!n || typeof n.type !== 'string') return;
    if (test(n)) hits.push(n);
    for (const k in n) { if (k === 'loc' || k === 'range') continue; const c = n[k]; if (Array.isArray(c)) c.forEach(visit); else if (c && typeof c.type === 'string') visit(c); }
  })(root);
  return hits;
}
const src = (s, n) => s.slice(n.start, n.end);
const isMember = (n, obj, prop) => n.type === 'MemberExpression' && !n.computed && n.property.name === prop &&
  (obj === 'this' ? n.object.type === 'ThisExpression' : (n.object.type === 'Identifier' && n.object.name === obj));
const one = (list, what) => { if (list.length !== 1) throw new Error(`${what}: expected 1, found ${list.length}`); return list[0]; };

function edits(texts, eol) {
  // ISOPEN: method out of NpcWorld (main) into collision (5), callers call it directly
  {
    let s = texts[9], { ast } = analyze(s);
    const cls = ast.body.find(n => n.type === 'ClassDeclaration' && n.id.name === 'NpcWorld');
    const m = cls.body.body.find(x => x.key && x.key.name === 'isOpen');
    const mStart = lineStart(s, m.start);
    let mEnd = lineEnd(s, m.end);
    if (/^[ \t]*\r?\n/.test(s.slice(mEnd, lineEnd(s, mEnd)))) mEnd = lineEnd(s, mEnd);
    // the function text: the method, dedented to the top level, `this.minX..maxZ` over collision.openBounds
    const ind = s.slice(mStart, m.start);
    const bodyEdits = [];
    for (const k of ['minX', 'maxX', 'minZ', 'maxZ']) for (const n of members(m, 'this', k)) bodyEdits.push({ start: n.start - mStart, end: n.end - mStart, text: `b.${k}` });
    let fn = applyEdits(s.slice(mStart, lineEnd(s, m.end)), bodyEdits);
    fn = fn.split('\n').map(l => l.startsWith(ind) ? l.slice(ind.length) : l).join('\n');
    const open = fn.indexOf('{') + 1;
    fn = `// OPEN SPOT (the ecosystem's former isOpen): inside the open bounds less 1 m, dry, outside buildings and the${eol}` +
      `// occupancy grid, and clear of solids at NPC size. initialize sets collision.openBounds from the provider.${eol}` +
      'function ' + fn.slice(0, open) + `${eol}  const b = collision.openBounds;` + fn.slice(open);
    const e = [{ start: mStart, end: mEnd, text: '' }];
    // callers in main: world.isOpen(...) and this.isOpen(...) inside NpcWorld
    for (const n of members(ast, 'world', 'isOpen')) e.push({ start: n.start, end: n.end, text: 'isOpen' });
    for (const n of members(cls, 'this', 'isOpen')) if (n.start < m.start || n.start > m.end) e.push({ start: n.start, end: n.end, text: 'isOpen' });
    // initialize: copy the bounds where minX..maxZ are set
    const maxZ = one(findIn(ast, 'NpcWorld.initialize', n => n.type === 'ExpressionStatement' && n.expression.type === 'AssignmentExpression' &&
      isMember(n.expression.left, 'this', 'maxZ')), 'initialize this.maxZ');
    const lineInd = s.slice(lineStart(s, maxZ.start), s.slice(lineStart(s, maxZ.start)).search(/\S/) + lineStart(s, maxZ.start));
    e.push({ start: lineEnd(s, maxZ.end), end: lineEnd(s, maxZ.end), text: `${lineInd}collision.openBounds = { minX: b.minX, maxX: b.maxX, minZ: b.minZ, maxZ: b.maxZ };${eol}` });
    texts[9] = applyEdits(s, e);
    // providers in 6
    s = texts[6]; ({ ast } = analyze(s));
    texts[6] = applyEdits(s, members(ast, 'world', 'isOpen').map(n => ({ start: n.start, end: n.end, text: 'isOpen' })));
    // collision: openBounds field, isOpen at the end
    s = texts[5]; ({ ast } = analyze(s));
    const col = ast.body.find(n => declNames(n)[0] === 'collision').declaration.declarations[0].init;
    const last = col.properties[col.properties.length - 1];
    const lastLineEnd = lineEnd(s, last.end);
    const lastLine = s.slice(lineStart(s, last.start), lastLineEnd);
    const withComma = lastLine.replace(src(s, last), src(s, last) + ',');
    texts[5] = s.slice(0, lineStart(s, last.start)) + withComma +
      `  openBounds: { minX: 0, maxX: 0, minZ: 0, maxZ: 0 }   // the ecosystem's bounds, for isOpen (set by initialize)${eol}` +
      s.slice(lastLineEnd).replace(/\s*$/, '') + `${eol}${eol}${fn.replace(/\s*$/, '')}${eol}`;
  }

  // FOOD BOXES: own sight grid; the view cull moves out to foodBoxView (main now, file 8 in phase 7)
  {
    let s = texts[6], { ast } = analyze(s);
    const fbDecl = ast.body.find(n => declNames(n)[0] === 'foodBoxes');
    const props = fbDecl.declarations[0].init.properties;
    const prop = k => props.find(p => p.key && p.key.name === k);
    const e = [];
    // `_shown: [], _now: [],` keeps _shown; `_m` goes to the view
    const shown = prop('_shown'), now = prop('_now'), mm = prop('_m');
    e.push({ start: shown.end, end: now.end, text: '' });                              // drop ", _now: []"; its comma closes _shown
    const shownLineEnd = lineEnd(s, now.end), shownComment = s.slice(now.end, shownLineEnd).indexOf('// crate indexes drawn last render and this one');
    if (shownComment < 0) throw new Error('_shown comment');
    e.push({ start: now.end + shownComment, end: now.end + shownComment + '// crate indexes drawn last render and this one'.length, text: '// crate indexes drawn last render (foodBoxView)' });
    e.push({ start: lineStart(s, mm.start), end: lineEnd(s, mm.end), text: '' });
    // sight field before _shown's line, buildSight before touching
    const ind = s.slice(lineStart(s, shown.start), shown.start);
    e.push({ start: lineStart(s, shown.start), end: lineStart(s, shown.start), text: `${ind}sight: null,                   // the crates for vision and contact queries (buildSight, per world)${eol}` });
    const touching = prop('touching');
    // its leading comment line belongs to touching; insert before that comment
    const tLine = lineStart(s, touching.start);
    const prevLineStart = lineStart(s, tLine - 1);
    const at = /^\s*\/\//.test(s.slice(prevLineStart, tLine)) ? prevLineStart : tLine;
    e.push({ start: at, end: at, text:
      `${ind}// The crates' sight grid over the ecosystem's span (initialize builds it once the provider is known).${eol}` +
      `${ind}buildSight(spanX, spanZ) {${eol}${ind}  this.sight = new SpatialGrid(spanX, spanZ, WATER_SIGHT_CELL);${eol}` +
      `${ind}  for (const b of this.list) b._k = this.sight.insert(b);${eol}${ind}},${eol}${eol}` });
    for (const n of members(ast, 'world', 'foodSight')) e.push({ start: n.start, end: n.end, text: 'this.sight' });
    // render() and its leading comment out
    const render = prop('render');
    const rStart = lineStart(s, render.start);
    let cStart = rStart;
    while (/^\s*\/\//.test(s.slice(lineStart(s, cStart - 1), cStart))) cStart = lineStart(s, cStart - 1);
    let rEnd = lineEnd(s, render.end);
    if (/^[ \t]*\r?\n/.test(s.slice(rEnd, lineEnd(s, rEnd)))) rEnd = lineEnd(s, rEnd);
    const rText = s.slice(cStart, lineEnd(s, render.end));
    e.push({ start: cStart, end: rEnd, text: '' });
    texts[6] = applyEdits(s, e);
    // the view: render's text with foodBoxes' data fields addressed on foodBoxes
    const local = applyEdits(rText, ['mesh', '_shown', 'dirty', 'list'].flatMap(k => members(render, 'this', k))
      .map(n => ({ start: n.start - cStart, end: n.end - cStart, text: `foodBoxes.${n.property.name}` })));
    const dedent = local.split('\n').map(l => l.startsWith(ind) ? '  ' + l.slice(ind.length) : l).join('\n');
    const view = `${eol}// FOOD BOX VIEW (render layer): foodBoxes' per-crate view cull and instance writes; foodBoxes keeps the data.${eol}` +
      `const foodBoxView = {${eol}  _now: [], _m: new THREE.Matrix4(),   // crate indexes on screen this render; scratch matrix${eol}${eol}` +
      dedent.replace(/\s*$/, '') + `${eol}};${eol}${eol}`;
    // main: NpcWorld drops foodSight, builds the crates' grid through foodBoxes, renders through foodBoxView;
    // Animal reads foodBoxes.sight
    s = texts[9]; ({ ast } = analyze(s));
    const m9 = [];
    const ctorSight = one(findIn(ast, 'NpcWorld.constructor', n => n.type === 'ExpressionStatement' && n.expression.type === 'AssignmentExpression' && isMember(n.expression.left, 'this', 'foodSight')), 'ctor foodSight');
    let cs = lineStart(s, ctorSight.start);
    if (/Food boxes, for vision/.test(s.slice(lineStart(s, cs - 1), cs))) cs = lineStart(s, cs - 1);
    m9.push({ start: cs, end: lineEnd(s, ctorSight.end), text: '' });
    const initSight = findIn(ast, 'NpcWorld.initialize', n => (n.type === 'ExpressionStatement' && n.expression.type === 'AssignmentExpression' && isMember(n.expression.left, 'this', 'foodSight')) ||
      (n.type === 'ForOfStatement' && /foodSight/.test(src(s, n))));
    if (initSight.length !== 2) throw new Error('initialize foodSight lines');
    const iInd = s.slice(lineStart(s, initSight[0].start), initSight[0].start);
    m9.push({ start: lineStart(s, initSight[0].start), end: lineEnd(s, initSight[1].end), text: `${iInd}foodBoxes.buildSight(spanX, spanZ);${eol}` });
    for (const n of members(ast, 'world', 'foodSight')) m9.push({ start: n.start, end: n.end, text: 'foodBoxes.sight' });
    for (const n of members(ast, 'foodBoxes', 'render')) m9.push({ start: n.start, end: n.end, text: 'foodBoxView.render' });
    // the view goes after PlantRenderer, with the other renderers
    const pr = ast.body.find(n => n.type === 'ClassDeclaration' && n.id.name === 'PlantRenderer');
    m9.push({ start: lineEnd(s, pr.end), end: lineEnd(s, pr.end), text: view });
    texts[9] = applyEdits(s, m9);
  }

  // INTRO: drive only moves walkers; frame draws them; the clock is handed in
  {
    let s = texts[6], { ast } = analyze(s);
    const draws = findIn(ast, 'IntroWorld.drive', n => n.type === 'ExpressionStatement' && n.expression.type === 'CallExpression' &&
      n.expression.callee.type === 'MemberExpression' && ['animalRenderer', 'blobShadows'].includes(n.expression.callee.object.name));
    if (draws.length !== 2) throw new Error('drive renderer calls');
    const e = draws.map(n => ({ start: lineStart(s, n.start), end: lineEnd(s, n.end), text: '' }));
    for (const n of findIn(ast, 'IntroWorld.teardown', n => isMember(n, 'simSky', 'hour'))) e.push({ start: n.start, end: n.end, text: 'this.clock.hour' });
    texts[6] = applyEdits(s, e);
    s = texts[9]; ({ ast } = analyze(s));
    const e9 = [];
    const prev = one(findIn(ast, 'loadIntroScene', n => n.type === 'ExpressionStatement' && n.expression.type === 'AssignmentExpression' && isMember(n.expression.left, 'iw', 'prevHour')), 'iw.prevHour');
    const pInd = s.slice(lineStart(s, prev.start), prev.start);
    e9.push({ start: lineEnd(s, prev.end), end: lineEnd(s, prev.end), text: `${pInd}iw.clock = simSky;   // the clock whose hour teardown gives back${eol}` });
    const step = one(findIn(ast, 'frame', n => n.type === 'ExpressionStatement' && n.expression.type === 'AssignmentExpression' &&
      n.expression.left.type === 'Identifier' && n.expression.left.name === 'npcDue'), 'npcDue = step');
    const sInd = s.slice(lineStart(s, step.start), step.start);
    e9.push({ start: lineEnd(s, step.end), end: lineEnd(s, step.end), text:
      `${sInd}// a provider that drives its own walkers (the intro) only moves them; they are drawn here, after its tick${eol}` +
      `${sInd}if (npcDue && providers.active && providers.active.drive) { animalRenderer.update(world.animals, npcElapsed); blobShadows.update(world.animals); }${eol}` });
    texts[9] = applyEdits(s, e9);
  }

  // OWNERS in 6
  ownerObject(texts, eol, { file: 6, object: 'groundMatch', fields: ['groundMatchHalf'], rename: { groundMatchHalf: 'half' },
    comment: ['The measured square\'s half size the green land cover fades over (loadPlace sets it).'] });
  ownerObject(texts, eol, { file: 6, object: 'shelters', fields: ['shelters'], rename: { shelters: 'list' },
    comment: ['Cabin shelter rectangles (interiors), for rain roofs and cabinAt; reset assigns a new list (rain compares identity).'],
    extra: ['reset() { this.list = []; }'] });

  // RESETS: the entry teardownWorld calls; each does what teardownWorld did to that system
  addMember(texts, 6, 'cityWater', 'clear', 'reset() { this.clear(); },   // teardownWorld\'s entry');
  addMember(texts, 6, 'streets', 'clear', 'reset() { this.clear(); },   // teardownWorld\'s entry');
  addMember(texts, 6, 'elevation', 'clear', 'reset() { this.clear(); },   // teardownWorld\'s entry');
  addMember(texts, 5, 'occ', 'clear', 'reset() { this.clear(); },   // teardownWorld\'s entry');
  addMember(texts, 5, 'cover', 'clear', 'reset() { this.clear(); },   // teardownWorld\'s entry');
  addMember(texts, 6, 'WildWater', 'dispose', 'reset() { this.dispose(); }   // teardownWorld\'s entry');
  addMember(texts, 6, 'PebbleRenderer', 'dispose', 'reset() { this.dispose(); }   // teardownWorld\'s entry');
  {
    const s = texts[3], { ast } = analyze(s);
    const add = ast.body.filter(n => n.type === 'ExpressionStatement' && /^scene\.add\(ground\)/.test(src(s, n)));
    const at = lineEnd(s, one(add, 'scene.add(ground)').end);
    texts[3] = s.slice(0, at) + `// teardownWorld's entry: the flat ground plane back as it starts (a city load hides it or drops it under water)${eol}` +
      `function resetGroundPlane() { ground.visible = true; ground.position.y = 0; }${eol}` + s.slice(at);
  }
  {
    const s = texts[9], { ast } = analyze(s);
    const td = ast.body.find(n => n.type === 'FunctionDeclaration' && n.id.name === 'teardownWorld');
    const e = [];
    const call = (obj, meth) => td.body.body.filter(n => n.type === 'ExpressionStatement' && n.expression.type === 'CallExpression' && isMember(n.expression.callee, obj, meth));
    for (const [obj, meth] of [['occ', 'clear'], ['cityWater', 'clear'], ['streets', 'clear'], ['cover', 'clear'], ['elevation', 'clear'], ['wildWater', 'dispose'], ['pebbles', 'dispose']]) {
      const n = one(call(obj, meth), `teardownWorld ${obj}.${meth}`);
      e.push({ start: n.expression.callee.property.start, end: n.expression.callee.property.end, text: 'reset' });
    }
    const sh = one(td.body.body.filter(n => n.type === 'ExpressionStatement' && /^shelters\.list = \[\]/.test(src(s, n))), 'teardownWorld shelters');
    e.push({ start: sh.start, end: sh.end, text: 'shelters.reset();' });
    const gl = td.body.body.filter(n => /^ground\.(visible = true|position\.y = 0);$/.test(src(s, n)));
    if (gl.length !== 2) throw new Error('teardownWorld ground lines');
    e.push({ start: gl[0].start, end: gl[0].end, text: 'resetGroundPlane();' });
    e.push({ start: lineStart(s, gl[1].start), end: lineEnd(s, gl[1].end), text: '' });
    texts[9] = applyEdits(s, e);
  }
}

const { moved } = cut({ root, take: [6], headers, edits });
console.log('moved statements', moved);
