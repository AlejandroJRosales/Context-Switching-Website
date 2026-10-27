// PHASE 4 CUT: src/5-collision.js out of src/9-main.js (lib/cut.mjs), with the phase's edit:
//   - collision: the module-level lets wallGrid, gridWalls, shellGrid, shells, solidStamp, stampNo, obstacleThroats become
//     fields of `collision`, owned by file 5; every reference in every file becomes collision.<name>. buildCity (still in
//     main) reassigns shells and shellGrid, so they need the owner; the rest follow so the collision state has one home.
//     Resets keep assigning new arrays and maps (rain's roof cache compares `shells` by identity).
//   node cut-phase4.mjs <projectDir>
import { cut, ownerObject } from './lib/cut.mjs';

const root = process.argv[2];
if (!root) { console.error('usage: node cut-phase4.mjs <projectDir>'); process.exit(2); }
const FIELDS = ['wallGrid', 'gridWalls', 'shellGrid', 'shells', 'solidStamp', 'stampNo', 'obstacleThroats'];

const headers = {
  5: [
    '// 5-collision.js: COLLISION. Walls, shells, occupancy, cover and spawn checks over what the providers built.',
    '// Owns: collision (wallGrid/gridWalls: solids pushed against and stood on; shellGrid/shells: building footprints',
    '// for roofs and floors; solidStamp/stampNo: per-query visit marks; obstacleThroats: doorway lanes), the shell',
    '// raster (shellRas, shellAt, shellAtExact, buildShellRaster, pointInShell, nearShell), buildGrid, addSolids,',
    '// resetObstacles, resolveCollisions, moveAndCollide, supportAt, ceilingAt, solidOverlap, cover, occ, and the spawn',
    '// checks (spawnOk, streetSpawn, outdoorSpawn).',
    '// May import: 1-config.js, 2-core.js, 4-provider.js. Config blocks it reads: player, collision grid, shells, NPC',
    '// radius and height, occupancy, cover, spawn.',
    '']
};

function edits(texts, eol) {
  ownerObject(texts, eol, {
    file: 5, object: 'collision', fields: FIELDS,
    comment: ['The collision state: rebuilt per world by buildGrid, addSolids, buildCity and resetObstacles.'],
    notes: { gridWalls: 'solids; wallGrid buckets index into it', shells: 'building footprints; shellGrid buckets index into it',
      stampNo: 'solidStamp[i] === stampNo: solid i already visited this query', obstacleThroats: 'doorways occ carves open (cabin throats, from placeCabins)' }
  });
}

const { moved } = cut({ root, take: [5], headers, edits });
console.log('moved statements', moved);
