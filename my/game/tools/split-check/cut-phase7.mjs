// PHASE 7 CUT: src/8-render-player-game.js out of src/9-main.js (lib/cut.mjs); what stays is 9-main.js. Edits:
//   - binds (Q5): file 8's listener registrations become bind functions, one per run of them between main's own side
//     effects; main calls each where the run's last statement stood, so every listener registers in its original order.
//     The four listeners that need main (runNew, the pointer-lock pair, Escape) stay in main at their places.
//   - owners: play { active, locked } (main sets them, input reads them), skyChoice { time, sky } (the settings chips set
//     the Observer presets), touchKnob { dx, dy, dirty } (frame draws the knob), rainClock { drawn } (frame stamps it).
//   - resets (Q7): cat, car and labels get the reset() teardownWorld calls; disposeRain and skyFade.reset already are.
//   - vr.start drives the XR loop with loop.frame (main's frame, registered in core) instead of importing it from main.
//     That is the only VR change; the populate hook stays skipped, as asked.
//   node cut-phase7.mjs <projectDir> [--record]   (--record writes the new names and moved statements into placement.json)
import fs from 'node:fs';
import path from 'node:path';
import * as acorn from 'acorn';
import { cut, destinations, analyze, applyEdits, ownerObject, addMember, lineStart, lineEnd } from './lib/cut.mjs';
import { loadHtmlModule, declNames, lineOf, signature, unwrap } from './lib/source.mjs';

const root = process.argv[2];
if (!root) { console.error('usage: node cut-phase7.mjs <projectDir> [--record]'); process.exit(2); }
const PLACEMENT = path.join(path.dirname(new URL(import.meta.url).pathname), 'placement.json');
const TO_MAIN = [13343, 13863, 13869, 13895];   // listeners that use main's functions and elements
const RUNS = [
  ['bindInventory', 13335, 13342, 'inventory slot keys and taps, the craft slot (game.useSlot, game.craft)'],
  ['bindKeys', 13854, 13861, 'pointer type, held keys'],
  ['bindMouseLook', 13877, 13877, 'mouse look while the pointer is locked'],
  ['bindTouch', 13946, 14098, 'touch stick and look, tap buttons, climb and fly'],
  ['bindCar', 14547, 14674, 'pedals, jump and attack taps, the car and action buttons, E']
];

// PLACEMENT for this phase: the four listeners to main, the bind functions to 8
const placement = JSON.parse(fs.readFileSync(PLACEMENT, 'utf8'));
for (const s of placement.statements) if (TO_MAIN.includes(s.lines[0])) s.file = 'src/9-main.js';
placement.added = Object.assign(placement.added || {}, Object.fromEntries(RUNS.map(r => [r[0], 'src/8-render-player-game.js'])));
const tmpPlacement = PLACEMENT + '.phase7.tmp';

// PRE-PASS on 9-main.js: each run's statements into one bind function (at the run's first statement), and the call after
// its last statement
{
  const file = path.join(root, 'src', '9-main.js');
  const s = fs.readFileSync(file, 'utf8');
  const eol = s.includes('\r\n') ? '\r\n' : '\n';
  const O = loadHtmlModule(path.join(root, 'game.html'));
  const lineOfSig = new Map();
  for (const n of O.ast.body) if (!declNames(n).length) lineOfSig.set(signature(O, n.start, n.end).sig, lineOf(O, n));
  const m = { src: s, lineOffset: 0, tokens: [], comments: [] };
  m.ast = acorn.parse(s, { ecmaVersion: 'latest', sourceType: 'module', locations: true, ranges: true, onToken: m.tokens, onComment: m.comments });
  const templates = m.tokens.filter(t => t.type.label === 'template').map(t => [t.start, t.end]);
  const inTemplate = off => templates.some(([a, b]) => a <= off && off < b);
  const dest = destinations(root, placement);
  const body = m.ast.body;
  const edits = [];
  const spanOf = n => { let a = lineStart(s, n.start); while (a > 0 && /^\s*\/\//.test(s.slice(lineStart(s, a - 1), a))) a = lineStart(s, a - 1); return { start: a, end: lineEnd(s, n.end) }; };
  for (const [name, from, to, what] of RUNS) {
    const run = [];
    let lastMainEffect = null;
    body.forEach((n, i) => {
      if (declNames(n).length || n.type === 'ImportDeclaration') return;
      const ol = lineOfSig.get(signature(m, n.start, n.end).sig);
      if (ol !== undefined && ol >= from && ol <= to && dest(m, n) === 8) run.push(n);
      else if (run.length && dest(m, n) === 9 && ol !== undefined && ol > from && ol < to) lastMainEffect = n;
    });
    if (!run.length) throw new Error(`${name}: no statements`);
    if (lastMainEffect) throw new Error(`${name}: main statement inside the run at ${lastMainEffect.loc.start.line}`);
    // the function: the statements with their comment lines, indented one level (template literal lines kept as is)
    const parts = run.map(n => {
      const sp = spanOf(n);
      let out = '', off = sp.start;
      for (const line of s.slice(sp.start, sp.end).split(/(?<=\n)/)) {
        out += (inTemplate(off) || /^\s*$/.test(line) ? line : '  ' + line);
        off += line.length;
      }
      return { sp, out };
    });
    const fn = `// ${name.toUpperCase().replace('BIND', 'BIND ')}: ${what}; main calls it in the original listener order.${eol}` +
      `function ${name}() {${eol}${parts.map(p => p.out).join('')}}${eol}`;
    parts.forEach((p, k) => edits.push({ ...p.sp, text: k === 0 ? fn : '' }));
    const last = run[run.length - 1];
    edits.push({ start: lineEnd(s, last.end), end: lineEnd(s, last.end), text: `${name}();   // its listeners, in their original place among main's${eol}` });
  }
  fs.writeFileSync(file, applyEdits(s, edits));
}

const headers = {
  8: [
    '// 8-render-player-game.js: RENDER, PLAYER and GAME. What draws the world and what the player drives.',
    '// Render owns: the NPC frustum and npcOnScreen, the human rig (geometry, atlas, materials, PS2-era shaders), the',
    '// billboards, AnimalRenderer, PlantRenderer, foodBoxView, BlobShadows, HealthBars with the brain view, StatLabelSystem',
    '// (labels), VisionRaySystem, the sky (bodies, colours, fade, updateSky, the Observer presets in skyChoice), rain and',
    '// graphics.',
    '// Player owns: player, keys, play { active, locked }, stance, touch (touchKnob), fly and climb, swimming, playerStep,',
    '// movementHeld, the car and chase camera, the cat and petting, pov and VR.',
    '// Game owns: SURVIVOR_ACTIONS, SURVIVOR_FIELD_ACTIONS, cabinAt and game (Survivor rules, inventory, the run summary).',
    '// Binds: bindInventory, bindKeys, bindMouseLook, bindTouch, bindCar register this file\'s listeners; 9-main calls',
    '// them in the original listener order. Construction (meshes, canvases) runs at load.',
    '// May import: 1-config.js to 7-sim.js and three. It registers into the sim (avatar, afterContacts, plantView) only',
    '// through statements in 9-main.',
    '']
};

const one = (list, what) => { if (list.length !== 1) throw new Error(`${what}: expected 1, found ${list.length}`); return list[0]; };
const src = (s, n) => s.slice(n.start, n.end);

function edits(texts, eol) {
  // OWNERS in 8
  ownerObject(texts, eol, { file: 8, object: 'play', fields: ['active', 'locked'],
    comment: ['In play: the panel closed and input accepted (active), and the pointer locked to the canvas (locked); main sets both.'] });
  ownerObject(texts, eol, { file: 8, object: 'skyChoice', fields: ['timePreset', 'skyPreset'], rename: { timePreset: 'time', skyPreset: 'sky' },
    comment: ['The Observer presets the settings chips pick (\'Game\': the game\'s own clock and weather).'] });
  ownerObject(texts, eol, { file: 8, object: 'touchKnob', fields: ['knobDx', 'knobDy', 'knobDirty'], rename: { knobDx: 'dx', knobDy: 'dy', knobDirty: 'dirty' },
    comment: ['The touch stick\'s knob offset (px) and whether frame still has to draw it.'] });
  ownerObject(texts, eol, { file: 8, object: 'rainClock', fields: ['rainDrawn'], rename: { rainDrawn: 'drawn' },
    comment: ['When rain was last drawn (frame stamps it; rainAnimating paces the idle redraw from it).'] });
  // VR: the XR loop runs main's frame through the core loop slot
  {
    const s = texts[8], { ast } = analyze(s);
    let vr = null;
    for (const n of ast.body) if (n.type === 'VariableDeclaration') for (const d of n.declarations) if (d.id.name === 'vr') vr = d.init;
    const calls = [];
    (function visit(n) { if (!n || typeof n.type !== 'string') return; if (n.type === 'CallExpression' && n.callee.type === 'Identifier' && n.callee.name === 'frame') calls.push(n.callee);
      for (const k in n) { if (k === 'loc' || k === 'range') continue; const c = n[k]; if (Array.isArray(c)) c.forEach(visit); else if (c && typeof c.type === 'string') visit(c); } })(vr);
    texts[8] = applyEdits(s, [{ start: one(calls, 'vr frame()').start, end: calls[0].end, text: 'loop.frame' }]);
  }
  // RESETS: cat, car, labels
  addMember(texts, 8, 'CatCompanion', 'place', 'reset() { this.place(false); }   // teardownWorld\'s entry');
  addMember(texts, 8, 'car', 'placed', 'reset() { setPlayerInCar(false); this.placed = false; this.mesh.visible = false; this.speed = this.steer = this.spin = 0; },   // teardownWorld\'s entry');
  addMember(texts, 8, 'StatLabelSystem', 'bind', 'reset() { this.locked = this.current = null; }   // teardownWorld\'s entry');
  {
    const s = texts[9], { ast } = analyze(s);
    const td = ast.body.map(unwrap).find(n => n.type === 'FunctionDeclaration' && n.id.name === 'teardownWorld').body.body;
    const e = [];
    const at = re => one(td.filter(n => re.test(src(s, n))), String(re));
    const cat = at(/^cat\.place\(false\);$/);
    e.push({ start: cat.start, end: cat.end, text: 'cat.reset();' });
    const car0 = at(/^setPlayerInCar\(false\);$/), car3 = at(/^car\.speed = car\.steer = car\.spin = 0;$/);
    const i0 = td.indexOf(car0), i3 = td.indexOf(car3);
    if (i3 - i0 !== 3 || !/^car\.placed = false;$/.test(src(s, td[i0 + 1])) || !/^car\.mesh\.visible = false;$/.test(src(s, td[i0 + 2]))) throw new Error('teardownWorld car statements');
    e.push({ start: car0.start, end: car3.end, text: 'car.reset();' });
    const lab = at(/^labels\.locked = labels\.current = null;$/);
    e.push({ start: lab.start, end: lab.end, text: 'labels.reset();' });
    texts[9] = applyEdits(s, e);
  }
  // MAIN's header: what it owns now
  texts[9] = texts[9]
    .replace('// Owns: until phases 3 to 7 extract them, everything not in 1-config.js or 2-core.js (moved verbatim).',
      '// Owns: the DOM of the panel, card and settings, the loading steps and say, the start screen and mode choice, the\n// settings chips, the debug readout, the HUD (refreshHud), fullscreen, the load functions (loadPlace, loadWilderness,\n// finishLoad, populate, clearEcosystem, teardownWorld, newEcosystem, loadIntroScene), the frame loop (frame,\n// drawEcosystem), visibility and resize, and the start sequence at the end (binds in the original listener order).'.replace(/\n/g, eol));
}

// the engine reads placement.json; give it this phase's placement for the run, then restore or record
fs.copyFileSync(PLACEMENT, tmpPlacement);
fs.writeFileSync(PLACEMENT, JSON.stringify(placement, null, 1));
try {
  const { moved } = cut({ root, take: [8], headers, edits });
  console.log('moved statements', moved);
} finally {
  if (process.argv.includes('--record')) {
    placement.changes = (placement.changes || []).concat([`phase 7: statements ${TO_MAIN.join(', ')} (listeners using main) 8 -> 9; ${RUNS.map(r => r[0]).join(', ')} new in 8`]);
    fs.writeFileSync(PLACEMENT, JSON.stringify(placement, null, 1));
    fs.unlinkSync(tmpPlacement);
  } else fs.renameSync(tmpPlacement, PLACEMENT);
}
