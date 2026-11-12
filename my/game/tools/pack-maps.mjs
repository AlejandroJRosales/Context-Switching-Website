// PACK MAPS: rewrite hosted Overpass JSON city files as compact JSON without the fields the game never reads.
//   node tools/pack-maps.mjs <inDir> [outDir]   (outDir defaults to inDir, rewriting in place)
// Dropped: whitespace, and each element's `nodes` (OSM node-id list; featuresFrom reads `geometry`, never ids).
// Kept unchanged: every other field, including `bounds` (centreOf), `tags` and the osm3s ODbL attribution.
// A fresh Overpass download (`out geom`) can be packed again with this; restore `nodes` by re-downloading if needed.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert';

const DROPPED_FIELDS = ['nodes'];
const [inDir, outDir = inDir] = process.argv.slice(2);
if (!inDir) { console.error('usage: node tools/pack-maps.mjs <inDir> [outDir]'); process.exit(2); }

const strip = el => Object.fromEntries(Object.entries(el).filter(([k]) => !DROPPED_FIELDS.includes(k)));

fs.mkdirSync(outDir, { recursive: true });
for (const f of fs.readdirSync(inDir).filter(f => f.endsWith('.json'))) {
  const text = fs.readFileSync(path.join(inDir, f), 'utf8');
  const json = JSON.parse(text);
  assert(Array.isArray(json.elements), `${f}: not Overpass JSON (no elements array)`);
  const packed = { ...json, elements: json.elements.map(strip) };
  const out = JSON.stringify(packed);
  // the packed file must parse back to the input minus the dropped fields, element for element
  assert.deepStrictEqual(JSON.parse(out), packed);
  fs.writeFileSync(path.join(outDir, f), out);
  const before = Buffer.byteLength(text), after = Buffer.byteLength(out);
  console.log(`${f}: ${json.elements.length} elements, ${before} -> ${after} bytes (${(100 * (1 - after / before)).toFixed(1)}% smaller)`);
}
