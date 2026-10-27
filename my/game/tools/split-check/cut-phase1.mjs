// PHASE 1 CUT: game.html -> index.html (shell: markup, CSS, importmap, one module script tag) + src/9-main.js.
//   node cut-phase1.mjs <game.html> <outDir>
// The module script's lines move verbatim. The <script> block's own indent (4 spaces) comes off every line except
// lines that start inside a template literal, so shader strings stay byte-identical. Line endings are kept as found.
import fs from 'node:fs';
import path from 'node:path';
import * as acorn from 'acorn';

const [htmlPath, outDir] = process.argv.slice(2);
if (!htmlPath || !outDir) { console.error('usage: node cut-phase1.mjs <game.html> <outDir>'); process.exit(2); }
const INDENT = '    ';
const OPEN_TAG = '<script type="module">';
const MAIN_SRC = 'src/9-main.js';

const html = fs.readFileSync(htmlPath, 'utf8');
const lines = html.split('\n');                           // each line keeps its '\r' when the file is CRLF
const eol = html.includes('\r\n') ? '\r\n' : '\n';
const openIdx = lines.findIndex(l => l.trim() === OPEN_TAG);
const closeIdx = lines.findIndex((l, i) => i > openIdx && l.trim() === '</script>');
if (openIdx < 0 || closeIdx < 0) throw new Error('module <script> block not found');

// template chunks of the script, as offsets into the script text
const scriptLines = lines.slice(openIdx + 1, closeIdx);
const script = scriptLines.join('\n');
const chunks = [];
acorn.parse(script, { ecmaVersion: 'latest', sourceType: 'module', onToken: t => { if (t.type.label === 'template') chunks.push([t.start, t.end]); } });
const insideTemplate = off => chunks.some(([a, b]) => a <= off && off < b);

let off = 0, kept = 0;
const moduleLines = scriptLines.map(l => {
  const start = off; off += l.length + 1;
  if (insideTemplate(start)) { kept++; return l; }
  if (l.startsWith(INDENT)) return l.slice(INDENT.length);
  if (l.trim() !== '') throw new Error(`script line ${openIdx + 2 + scriptLines.indexOf(l)} has less than the block indent`);
  return l;
});

const indent = lines[openIdx].slice(0, lines[openIdx].indexOf('<'));
const shell = [...lines.slice(0, openIdx), `${indent}<script type="module" src="${MAIN_SRC}"></script>` + (eol === '\r\n' ? '\r' : ''), ...lines.slice(closeIdx + 1)];

const HEADER = [
  '// 9-main.js: MAIN. Starts the game: loading steps, start screen, settings, debug readout, HUD, load functions,',
  '// teardownWorld, newEcosystem, loadIntroScene, the frame loop, wake, visibility, resize.',
  '// Owns: until the extraction phases, every top-level declaration of game.html\'s script (moved verbatim in phase 1).',
  '// May import: three (importmap) and src/1 to src/8. Its own config blocks move to 1-config.js in phase 2.',
  '//',
  '// MODULE MAP (imports point down only; files 1 to 8 declare, main starts):',
  '//   1-config.js        tunable tables and derived constants; pure data, no imports',
  '//   2-core.js          math, grids, ring geometry, solar math, the loop object (wake, invalidate)',
  '//   3-gfx-io.js        renderer, scene, buffer helpers, culling | Nominatim, Overpass, city files, terrain, parsers',
  '//   4-provider.js      the active world provider slot, ground and water queries, provider version',
  '//   5-collision.js     walls, shells, occupancy, cover, spawn checks, isOpen',
  '//   6-worlds.js        city and wilderness construction, providers (CityWorld, WildernessWorld, IntroWorld)',
  '//   7-sim.js           brains, Animal, Plant, Ecosystem, simSky',
  '//   8-render-player-game.js  renderers, human rig, sky, rain, graphics; player, input, car, cat, VR; game',
  '//   9-main.js          this file',
  '// Placement per identifier: tools/split-check/placement.json; plan and decisions: INVENTORY.md.',
  ''
].join(eol);

fs.mkdirSync(path.join(outDir, 'src'), { recursive: true });
fs.writeFileSync(path.join(outDir, 'index.html'), shell.join('\n'));
fs.writeFileSync(path.join(outDir, MAIN_SRC), HEADER + moduleLines.join('\n') + '\n');
console.log(`index.html: ${shell.length} lines; ${MAIN_SRC}: ${moduleLines.length} script lines (${kept} inside template literals kept as is)`);
