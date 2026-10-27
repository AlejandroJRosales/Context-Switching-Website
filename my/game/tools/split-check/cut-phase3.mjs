// PHASE 3 CUT: src/3-gfx-io.js and src/4-provider.js out of src/9-main.js (lib/cut.mjs), with the phase's edits:
//   - providers: `let activeWorld` becomes `providers.active` and perf.terrainVersion becomes `providers.version`, on an
//     object file 4 owns; every reference follows (scope-resolved). perf loses its terrainVersion field.
//   - fetchBuildings drops its `onNote = say` default (its only caller passes onNote), so io does not reach main.
//   - 3-gfx-io.js is laid out as its gfx half, then its io half, each in original order; neither half references the
//     other (checked when the half sets are built: a cross reference stops the cut).
//   - the canvas append (game.html 1761) stays in main, at its original place among main's statements (placement.json).
//   node cut-phase3.mjs <projectDir>
import { cut, analyze, applyEdits, refsTo, members, lineStart, lineEnd } from './lib/cut.mjs';
import { declNames } from './lib/source.mjs';

const root = process.argv[2];
if (!root) { console.error('usage: node cut-phase3.mjs <projectDir>'); process.exit(2); }
const IO = new Set(['placeKindOf', 'geocode', 'overpassTry', 'overpassHedged', 'fetchBuildings', 'cityFileFor', 'fetchCityFile',
  'parseLength', 'heightOf', 'minHeightOf', 'makeProjector', 'geometriesOf', 'closedGeom', 'buildingPolysOf', 'cleanPts',
  'areaKindOf', 'featuresFrom', 'centreOf', 'prettify', 'signLabel', 'fetchTerrain', 'tileOf', 'loadImage']);

const headers = {
  3: [
    '// 3-gfx-io.js: GFX and IO, two halves that do not import each other.',
    '// GFX half owns: the saved Graphics choice, renderer, scene, camera, rig, view pose, lights (hemi, sun, moon) and the',
    '// shadow setup with three\'s shadow-chunk edge fade (patched before any material compiles), the flat ground plane, the',
    '// high-graphics MSAA pass, the colour and buffer helpers (rgb, cssColor, pushTri, pushQuad, bufGeom, tint, ribbon,',
    '// areaGeom, box, cyl), the ground-cell splitters and cellCull, and perf (Graphics-low flag, LOD distances, instance',
    '// uploads, setText).',
    '// IO half owns: Nominatim geocoding, hedged Overpass requests, the hosted city files, Terrarium elevation tiles, and',
    '// the OSM parsers (featuresFrom and its helpers).',
    '// May import: 1-config.js, 2-core.js, three. Config blocks it reads: graphics, shadows, network, terrain, layers,',
    '// places, city files.',
    ''],
  4: [
    '// 4-provider.js: PROVIDER. The active world provider slot and the ground and water queries every layer asks of it.',
    '// Owns: providers ({ active, version }), _surf, groundAt, isWaterAt, baseAt, surfaceY, surfaceFor.',
    '// May import: 1-config.js, 2-core.js. Set by main (the loads, teardown); read by collision, worlds, sim and render.',
    '//',
    '// PROVIDER CONTRACT (CityWorld, WildernessWorld, IntroWorld; what the engine and the other layers read):',
    '//   kind ("city" | "wilderness" | "intro"), bounds { minX, maxX, minZ, maxZ }, wraps (torus wrap vs clamp at the edge),',
    '//   flags: shadows, companion (the cat comes along), rays ("off" | "single" | ...), hud (false hides the HUD), city',
    '//   (the CityWorld inside, or null), seed; cabins (wilderness), playerStart.',
    '//   heightAt(x, z) ground height; isWater(x, z); surface(x, z, out) fills out.base (footing: floor, water surface or',
    '//   ground), out.dip (bed below the base, negative in water) and out.float (swim depth); waterSources() [x, z, y]',
    '//   points; population() [{ type, count, src }] where src.spawnPoint(type) gives [x, z] or null; regrow(ecosystem)',
    '//   each tick; teardown() frees what the provider itself built; drive(ecosystem, dt), optional, replaces the sim.',
    '//   providers.version: bump it whenever heights under existing entities change, so surfaceFor\'s memo refreshes.',
    '']
};

function edits(texts, eol) {
  // file 4: the providers object replaces `let activeWorld`; refs and perf.terrainVersion follow
  {
    const s = texts[4], { ast, mod } = analyze(s), e = [];
    const decl = ast.body.find(n => n.type === 'VariableDeclaration' && declNames(n)[0] === 'activeWorld');
    e.push({ start: decl.start, end: decl.end, text: 'const providers = { active: null, version: 0 };' });
    const own = new Set(decl.declarations.map(d => d.id.start));
    for (const id of refsTo(mod, 'activeWorld')) if (!own.has(id.start)) e.push({ start: id.start, end: id.end, text: 'providers.active' });
    for (const n of members(ast, 'perf', 'terrainVersion')) e.push({ start: n.start, end: n.end, text: 'providers.version' });
    texts[4] = applyEdits(s, e);
  }
  // file 9: references to activeWorld and perf.terrainVersion
  {
    const s = texts[9], { ast, mod } = analyze(s), e = [];
    for (const id of refsTo(mod, 'activeWorld')) e.push({ start: id.start, end: id.end, text: 'providers.active' });
    for (const n of members(ast, 'perf', 'terrainVersion')) e.push({ start: n.start, end: n.end, text: 'providers.version' });
    texts[9] = applyEdits(s, e);
  }
  // file 3: perf loses terrainVersion; fetchBuildings' default; gfx half then io half
  {
    let s = texts[3];
    let { ast } = analyze(s);
    const e = [];
    const perf = ast.body.find(n => declNames(n)[0] === 'perf');
    const tv = perf.declarations[0].init.properties.find(p => p.key.name === 'terrainVersion');
    e.push({ start: lineStart(s, tv.start), end: lineEnd(s, tv.end), text: '' });
    const fb = ast.body.find(n => n.type === 'FunctionDeclaration' && n.id.name === 'fetchBuildings');
    const p = fb.params.find(q => q.type === 'AssignmentPattern' && q.left.name === 'onNote');
    e.push({ start: p.start, end: p.end, text: 'onNote' });
    s = applyEdits(s, e);
    // halves: blocks (statement plus the lines above it) sorted stably into gfx, then io
    ({ ast } = analyze(s));
    const lines = s.split('\n');
    const firstLine = ast.body[0].loc.start.line;
    let headEnd = 0; while (headEnd < lines.length && /^\/\//.test(lines[headEnd])) headEnd++;
    const head = lines.slice(0, headEnd), pre = [];   // the first statement's leading lines start right after the header
    const gfx = [], io = [];
    const names = new Map();
    ast.body.forEach((n, i) => {
      const from = i === 0 ? headEnd + 1 : ast.body[i - 1].loc.end.line + 1;
      const block = lines.slice(from - 1, n.loc.end.line);
      const isIo = declNames(n).some(x => IO.has(x));
      (isIo ? io : gfx).push(...block);
      for (const x of declNames(n)) names.set(x, isIo);
    });
    // neither half may reference the other
    const { mod } = analyze(s);
    for (const v of mod.variables) {
      if (!names.has(v.name)) continue;
      for (const r of v.references) {
        const n = ast.body.find(b => b.start <= r.identifier.start && r.identifier.start < b.end);
        const owner = declNames(n).find(x => names.has(x));
        if (owner !== undefined && names.get(owner) !== names.get(v.name)) throw new Error(`half crossing: ${owner} -> ${v.name}`);
        if (owner === undefined && names.get(v.name)) throw new Error(`gfx statement at ${n.loc.start.line} uses io ${v.name}`);
      }
    }
    const CR = eol === '\r\n' ? '\r' : '';
    const tail = lines.slice(ast.body[ast.body.length - 1].loc.end.line);
    texts[3] = [...head, CR, ...pre,
      `// GFX HALF${CR}`, ...gfx.map(l => l), CR,
      `// IO HALF (no gfx references)${CR}`, ...io, ...tail].join('\n');
  }
}

const { moved } = cut({ root, take: [3, 4], headers, edits });
console.log('moved statements', moved);
