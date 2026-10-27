// 6-worlds.js: WORLDS. What the providers build and the providers themselves.
// Owns: city construction (elevation and terrain draping, buildings with shells, doors, roofs and the facade material,
// ground layers, trees, barriers, props, signs, streets with curbs, markings, parking and lamps, cityWater, waterClip,
// indoorClip, lampLight, places, foodBoxes with its sight grid), the wilderness (WildTerrain, HeightGrid, WildWater,
// cabins and shelters, pebbles, groves), groundMatch, and the providers CityWorld, WildernessWorld, IntroWorld with
// INTRO_SCENE.
// May import: 1-config.js to 5-collision.js and three. No sim, render or main: what it once called upward (isOpen,
// the food-box cull, the intro's renderers, the sky clock) now lives below it or is handed in.
// Config blocks it reads: buildings, layers, roads, signs, trees, food boxes, streets and lamps, coast, cabins, mix,
// groves, wild floating depth.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import {
  METERS_PER_LVL, HEAD_CLEAR, EYE_HEIGHT, GRID_CELL, WALL_T, WALL_T_MIN, DOOR_W, DOOR_MIN_W, DOOR_H, PIER, PIER_MIN,
  FRAME_W, FLOOR_Y, CEIL_GAP, ENTRANCE_REACH, ROAD_NEAR, ROAD_FAR, ROAD_CELL, ELEV_STEP, ELEV_MARGIN, LAYER_BIAS,
  LAYER_Y, ROAD_WIDTH, PATH_KINDS, ROAD_COLOR, PATH_COLOR, AREA_COLOR, MIX_GREEN_PULL, MIX_EDGE_FADE, MIX_GREEN_KINDS,
  BARRIER, WALL_MATERIAL_COLOR, ROOF_MATERIAL_COLOR, ROOF_SHAPE, SIGN_COLS, SIGN_CELL_W, SIGN_CELL_H, SIGN_MAX,
  PLACE_KINDS, BUILDING_CHUNK_M, TERRAIN_CELL_M, TREE_TRUNK_TOP_R, TREE_TRUNK_BASE_R, TREE_TRUNK_SOLID_R, SIGN_FONT,
  NPC_CITY_PEOPLE_WEIGHT, NPC_WILD_PEOPLE_WEIGHT, NPC_DEER_POPULATION, NPC_PLANT_POPULATION, PLANT_REGROW_P,
  PLANT_SPOT_TRIES, DEER_GREEN_SHARE, DEER_AREAS, NPC_UNIT, WATER_SIGHT_CELL, WATER_CELL, FOOD_BOX_KINDS,
  FOOD_BOX_SIZE, FOOD_BOX_REACH, FOOD_BOX_HEIGHT, FOOD_BOX_SLOTS, FOOD_BOX_OUTDOOR_CHANCE, INDOOR_CELL, CURB_PIECE,
  CURB_KINDS, MARK_KINDS, MARK_MAJOR, MARK_MIN_WIDTH, MARK_W, MARK_DASH, MARK_GAP, MARK_Y, MARK_JUNCTION_CLEAR,
  MARK_WHITE, MARK_YELLOW, LANE_W, PARKING_KINDS, PARK_MIN_HALF, PARK_GAP, PARK_CURB_GAP, PARK_P, PARK_CLEAR,
  PARKED_COLORS, LAMP_SPACING, LAMP_H, LAMP_ARM, LAMP_CURB_IN, LAMP_NEAR, LAMP_DOOR_CLEAR, LAMP_POLE_R,
  LAMP_ROAD_REACH, LAMP_REACH, LAMP_MAP_CELL, LAMP_GAIN, CONFIG, DEFAULT_SEED, WILD_FLOAT_DEPTH, COAST_SEA, COAST_LAND,
  COAST_WOBBLE, OCEAN_DEPTH, OCEAN_REACH, CABIN_SCALE, CABIN_M, WILD_GROVES, MIX_BLEND, MIX_RING_MIN, MIX_RING_MAX,
  MIX_PARK_SHARE, MIX_SINK, CAR_SCALE, CAR_LEN, CAR_WID, CAR_TOP, CAR_WHEELBASE, CAR_TRACK, CAR_WHEEL_R
} from './1-config.js';
import {
  ringArea, bounds, dedupeRing, orientRing, offsetRing, gridOf, hash01, seededRandom, cellKey, pointInRing,
  closestOnRing, wrapAngle, SpatialGrid, tools, invalidate
} from './2-core.js';
import {
  renderer, scene, camera, ground, cssColor, rgb, newBuf, pushTri, pushQuad, bufGeom, tint, nonIndexed, UP, ribbon,
  areaGeom, cellCull, box, cyl, perf, parseLength, heightOf, minHeightOf, signLabel
} from './3-gfx-io.js';
import {
  providers
} from './4-provider.js';
import {
  pointInShell, collision, buildGrid, resetObstacles, addSolids, cover, shellAt, buildShellRaster, isOpen
} from './5-collision.js';

// The measured square's half size the green land cover fades over (loadPlace sets it).
export const groundMatch = {
  half: 0
};

// Per vertex after draping: green toward wild grass (full at the edge), then paintSlope's rock blend, like the wild mesh.
export function matchWildGround(g, green) {
  const p = g.attributes.position.array, n = g.attributes.normal.array, c = g.attributes.color.array;
  const gr = wildTerrain.grassColor, r = wildTerrain.rockColor;
  const half = groundMatch.half || 1;
  for (let i = 0; i < n.length; i += 3) {
    if (green) {
      const d = Math.min(1, Math.max(Math.abs(p[i]), Math.abs(p[i + 2])) / half);
      let e = Math.max(0, Math.min(1, (d - (1 - MIX_EDGE_FADE)) / MIX_EDGE_FADE));
      e = e * e * (3 - 2 * e);
      const k = MIX_GREEN_PULL + (1 - MIX_GREEN_PULL) * e;
      c[i] += (gr.r - c[i]) * k;
      c[i + 1] += (gr.g - c[i + 1]) * k;
      c[i + 2] += (gr.b - c[i + 2]) * k;
    }
    const t = Math.max(0, Math.min(1, (0.12 - Math.abs(n[i + 2])) / (0.12 - 0.84)));
    c[i] += (r.r - c[i]) * t;
    c[i + 1] += (r.g - c[i + 1]) * t;
    c[i + 2] += (r.b - c[i + 2]) * t;
  }
  g.attributes.color.needsUpdate = true;
}

export const layers = [];

export function wallColorOf(tags) {
  return cssColor(tags['building:colour'])
    ?? cssColor(tags.colour)
    ?? WALL_MATERIAL_COLOR[tags['building:material']]
    ?? WALL_MATERIAL_COLOR[tags['building:facade:material']]
    ?? null;
}

export function roofColorOf(tags) {
  return cssColor(tags['roof:colour'])
    ?? ROOF_MATERIAL_COLOR[tags['roof:material']]
    ?? null;
}

// A pole's solid (lamp posts, tree trunks): a square of half side r around (x, z), from just under base up to top.
export function poleSolid(x, z, r, base, top) {
  const pts = [[x - r, z - r], [x + r, z - r], [x + r, z + r], [x - r, z + r]];
  return { pts, ...bounds(pts), base: base - 0.05, top, tags: null };
}

// ROOFS

// Oriented box around a footprint, long axis on the longest edge.
export function obbOf(pts) {
  let bi = 0, bl = -1;
  for (let i = 0; i < pts.length; i++) {
    const j = (i + 1) % pts.length;
    const d = Math.hypot(pts[j][0] - pts[i][0], pts[j][1] - pts[i][1]);
    if (d > bl) { bl = d; bi = i; }
  }
  if (bl <= 0) return null;
  const j = (bi + 1) % pts.length;
  let ux = (pts[j][0] - pts[bi][0]) / bl, uz = (pts[j][1] - pts[bi][1]) / bl;
  let vx = -uz, vz = ux;

  let minU = Infinity, maxU = -Infinity, minV = Infinity, maxV = -Infinity;
  for (const [x, z] of pts) {
    const a = x * ux + z * uz, b = x * vx + z * vz;
    if (a < minU) minU = a; if (a > maxU) maxU = a;
    if (b < minV) minV = b; if (b > maxV) maxV = b;
  }
  let hu = (maxU - minU) / 2, hv = (maxV - minV) / 2;
  const cu = (minU + maxU) / 2, cv = (minV + maxV) / 2;
  const cx = cu * ux + cv * vx, cz = cu * uz + cv * vz;

  if (hv > hu) {
    const tx = ux, tz = uz;
    ux = vx; uz = vz; vx = -tx; vz = -tz;
    const t = hu; hu = hv; hv = t;
  }
  if (hu < 0.5 || hv < 0.5) return null;
  return { cx, cz, ux, uz, vx, vz, hu, hv, area: 4 * hu * hv };
}

export function roofOf(b, o, wallTop, top, shape, c) {
  const p = (du, dv, y) => [o.cx + o.ux * du + o.vx * dv, y, o.cz + o.uz * du + o.vz * dv];

  const A = p(-o.hu, -o.hv, wallTop);
  const B = p(o.hu, -o.hv, wallTop);
  const C = p(o.hu, o.hv, wallTop);
  const D = p(-o.hu, o.hv, wallTop);

  if (shape === 'pyramidal') {
    const apex = p(0, 0, top);
    pushTri(b, A, B, apex, c, [0, 1, 0]);
    pushTri(b, B, C, apex, c, [0, 1, 0]);
    pushTri(b, C, D, apex, c, [0, 1, 0]);
    pushTri(b, D, A, apex, c, [0, 1, 0]);
    return;
  }

  if (shape === 'skillion') {
    const Chi = p(o.hu, o.hv, top), Dhi = p(-o.hu, o.hv, top);
    pushQuad(b, A, B, Chi, Dhi, c, [0, 1, 0]);
    pushTri(b, B, C, Chi, c, [o.ux, 0, o.uz]);
    pushTri(b, A, Dhi, D, c, [-o.ux, 0, -o.uz]);
    pushQuad(b, C, D, Dhi, Chi, c, [o.vx, 0, o.vz]);
    return;
  }

  const inset = shape === 'hipped' ? Math.min(o.hv, o.hu * 0.9) : 0;
  const R0 = p(-o.hu + inset, 0, top);
  const R1 = p(o.hu - inset, 0, top);

  pushQuad(b, A, B, R1, R0, c, [0, 1, 0]);
  pushQuad(b, C, D, R0, R1, c, [0, 1, 0]);
  pushTri(b, B, C, R1, c, [o.ux, 0, o.uz]);
  pushTri(b, D, A, R0, c, [-o.ux, 0, -o.uz]);
}

// BUILD

export function clearLayers() {
  invalidate();
  for (const m of layers) {
    scene.remove(m);
    // instance buffers live on the mesh; three frees them only on mesh dispose
    if (m.isInstancedMesh) m.dispose();
    if (m.geometry) m.geometry.dispose();
    if (m.material) {
      if (m.material.map) m.material.map.dispose();
      if (m.material.normalMap) m.material.normalMap.dispose();
      if (m.material.clearcoatNormalMap) m.material.clearcoatNormalMap.dispose();
      m.material.dispose();   // building chunks share one material: disposing it again is a no-op
    }
  }
  layers.length = 0;
}

export function addLayer(geoms, material) {
  if (!geoms.length) return null;
  let merged;
  try {
    merged = mergeGeometries(geoms, false);
  } catch (e) {
    merged = null;
  }
  for (const g of geoms) g.dispose();
  if (!merged) return null;
  merged.computeBoundingSphere();
  const mesh = new THREE.Mesh(merged, material);
  scene.add(mesh);
  layers.push(mesh);
  invalidate();
  return mesh;
}

export function litMaterial(bias) {
  const m = new THREE.MeshLambertMaterial({ vertexColors: true });
  if (bias) {
    m.polygonOffset = true;
    m.polygonOffsetFactor = -bias;
    m.polygonOffsetUnits = -bias;
  }
  return m;
}

export function wallRing(pts) {
  let R = offsetRing(pts, WALL_T);
  while (!R.ok && R.t * 0.5 >= WALL_T_MIN) R = offsetRing(pts, R.t * 0.5);
  return R;
}

export function alongEdge(R, i, d) {
  const e = R.E[i], p = R.pts[i];
  return [p[0] + e.ux * d, p[1] + e.uz * d];
}

export function innerAt(R, i, d) {
  const e = R.E[i], qi = R.inner[i], qj = R.inner[(i + 1) % R.pts.length];
  const s = (d - e.a0) / (e.L + e.a1 - e.a0);
  return [qi[0] + (qj[0] - qi[0]) * s, qi[1] + (qj[1] - qi[1]) * s];
}

export function capOf(outer, holes) {
  const v2 = r => r.map(p => new THREE.Vector2(p[0], p[1]));
  let tris;
  try { tris = THREE.ShapeUtils.triangulateShape(v2(outer), holes.map(v2)); } catch (e) { return null; }
  if (!tris || !tris.length) return null;
  return { verts: outer.concat(...holes), tris };
}

export function pushCap(b, cap, y, c, ref) {
  const v = cap.verts;
  for (const [i, j, k] of cap.tris) {
    pushTri(b, [v[i][0], y, v[i][1]], [v[j][0], y, v[j][1]], [v[k][0], y, v[k][1]], c, ref);
  }
}

export function vquad(b, a, c, y0, y1, col, ref) {
  if (y1 - y0 < 1e-3 || Math.hypot(c[0] - a[0], c[1] - a[1]) < 1e-3) return;
  pushQuad(b, [a[0], y0, a[1]], [c[0], y0, c[1]], [c[0], y1, c[1]], [a[0], y1, a[1]], col, ref);
}

export function pushSolid(solids, pts, base, top) {
  solids.push({ pts, ...bounds(pts), base, top, tags: null });
}

// Road and path segments, bucketed once per city. Paths weigh less, so a door prefers a front footway.
export function roadIndex(roads) {
  const segs = [];
  for (const r of roads || []) {
    const half = (r.width ?? ROAD_WIDTH[r.kind]) / 2;
    const wgt = PATH_KINDS.has(r.kind) ? 0.75 : 1;
    for (let i = 0; i < r.pts.length - 1; i++) {
      const [x0, z0] = r.pts[i], [x1, z1] = r.pts[i + 1];
      segs.push({
        x0, z0, x1, z1, half, wgt,
        minX: Math.min(x0, x1), maxX: Math.max(x0, x1), minZ: Math.min(z0, z1), maxZ: Math.max(z0, z1)
      });
    }
  }
  return { segs, grid: gridOf(segs, ROAD_CELL) };
}

// Weighted distance to the nearest road edge within maxR, and the point measured to; null if none.
export function nearestRoad(idx, x, z, maxR) {
  let best = Infinity, bx = 0, bz = 0;
  const cx0 = Math.floor((x - maxR) / ROAD_CELL), cx1 = Math.floor((x + maxR) / ROAD_CELL);
  const cz0 = Math.floor((z - maxR) / ROAD_CELL), cz1 = Math.floor((z + maxR) / ROAD_CELL);
  for (let cx = cx0; cx <= cx1; cx++) {
    for (let cz = cz0; cz <= cz1; cz++) {
      const bucket = idx.grid.get(cellKey(cx, cz));
      if (!bucket) continue;
      for (const k of bucket) {
        const s = idx.segs[k];
        const dx = s.x1 - s.x0, dz = s.z1 - s.z0;
        const l2 = dx * dx + dz * dz;
        let t = l2 > 0 ? ((x - s.x0) * dx + (z - s.z0) * dz) / l2 : 0;
        t = t < 0 ? 0 : t > 1 ? 1 : t;
        const px = s.x0 + dx * t, pz = s.z0 + dz * t;
        const raw = Math.hypot(x - px, z - pz);
        if (raw > maxR + s.half) continue;
        const d = Math.max(0, raw - s.half) * s.wgt;
        if (d < best) { best = d; bx = px; bz = pz; }
      }
    }
  }
  return best < Infinity ? { d: best, x: bx, z: bz } : null;
}

export function pointIndex(list) {
  const items = list.map(p => ({ ...p, minX: p.x, maxX: p.x, minZ: p.z, maxZ: p.z }));
  return { items, grid: gridOf(items, ROAD_CELL) };
}

export function blockedAt(self, x, z) {
  const bucket = collision.shellGrid.get(cellKey(Math.floor(x / GRID_CELL), Math.floor(z / GRID_CELL)));
  if (!bucket) return false;
  for (const idx of bucket) {
    if (idx === self.index) continue;
    const s = collision.shells[idx];
    if (x < s.minX || x > s.maxX || z < s.minZ || z > s.maxZ) continue;
    if (pointInShell(s, x, z)) return true;
  }
  return false;
}

// Where on edge i a doorway can be centred, and its width, clear of the mitred corners.
export function doorSpan(R, i) {
  const e = R.E[i];
  const lo0 = Math.max(e.a0, 0), hi0 = e.L + Math.min(e.a1, 0);
  const span = hi0 - lo0;
  if (span < DOOR_MIN_W) return null;
  let w = Math.min(DOOR_W, span - 2 * PIER_MIN);
  if (w < DOOR_MIN_W) w = Math.min(DOOR_W, span);
  const pier = Math.min(PIER, (span - w) / 2);
  return { lo: lo0 + pier + w / 2, hi: hi0 - pier - w / 2, w };
}

export function probeOut(R, i, d, off) {
  const e = R.E[i], p = alongEdge(R, i, d);
  return [p[0] - e.nx * off, p[1] - e.nz * off];
}

// Door stages 2-4: nearest close road, else facing the nearest road, else the longest wall.
export function pickByRoads(cands, s, roads) {
  let best = null, bestD = Infinity;
  for (const k of cands) {
    const r = nearestRoad(roads, k.probe[0], k.probe[1], ROAD_NEAR);
    if (r && r.d < bestD) { bestD = r.d; best = k; }
  }
  if (best) return best;

  const far = nearestRoad(roads, (s.minX + s.maxX) / 2, (s.minZ + s.maxZ) / 2, ROAD_FAR);
  if (far) {
    for (const k of cands) {
      const d = Math.hypot(k.probe[0] - far.x, k.probe[1] - far.z);
      if (d < bestD) { bestD = d; best = k; }
    }
    return best;
  }

  for (const k of cands) if (k.len > -bestD) { bestD = -k.len; best = k; }
  return best;
}

// A door is { edge, d0, d1 } on one edge, or a run of whole edges { run, first, last } when all are too short.
export function chooseDoor(s, R, roads, ents) {
  const cands = [];
  for (let i = 0; i < R.pts.length; i++) {
    const sp = doorSpan(R, i);
    if (!sp) continue;
    const c = (sp.lo + sp.hi) / 2;
    cands.push({ i, lo: sp.lo, hi: sp.hi, w: sp.w, c, len: R.E[i].L, probe: probeOut(R, i, c, 1.0) });
  }
  const open = cands.filter(k => { const p = probeOut(R, k.i, k.c, 0.5); return !blockedAt(s, p[0], p[1]); });
  const pool = open.length ? open : cands;
  const make = (k, c) => {
    c = Math.min(Math.max(c, k.lo), k.hi);
    return { edge: k.i, d0: c - k.w / 2, d1: c + k.w / 2 };
  };

  if (pool.length) {
    // 1. a mapped entrance on (or right against) one of the usable walls
    let best = null, bestS = Infinity, bestC = 0;
    const cx0 = Math.floor((s.minX - ENTRANCE_REACH) / ROAD_CELL), cx1 = Math.floor((s.maxX + ENTRANCE_REACH) / ROAD_CELL);
    const cz0 = Math.floor((s.minZ - ENTRANCE_REACH) / ROAD_CELL), cz1 = Math.floor((s.maxZ + ENTRANCE_REACH) / ROAD_CELL);
    for (let cx = cx0; cx <= cx1; cx++) {
      for (let cz = cz0; cz <= cz1; cz++) {
        const bucket = ents.grid.get(cellKey(cx, cz));
        if (!bucket) continue;
        for (const idx of bucket) {
          const en = ents.items[idx];
          for (const k of pool) {
            const e = R.E[k.i], p = R.pts[k.i];
            let t = (en.x - p[0]) * e.ux + (en.z - p[1]) * e.uz;
            t = t < 0 ? 0 : t > e.L ? e.L : t;
            const d = Math.hypot(en.x - (p[0] + e.ux * t), en.z - (p[1] + e.uz * t));
            if (d > ENTRANCE_REACH) continue;
            const score = d - (en.main ? 10 : 0);
            if (score < bestS) { bestS = score; best = k; bestC = t; }
          }
        }
      }
    }
    if (best) return make(best, bestC);

    // 2-4. roads, then geometry
    const k = pickByRoads(pool, s, roads);
    return make(k, k.c);
  }

  // No wall fits a door: open a run of edges from the road-preferred one.
  const n = R.pts.length;
  const all = [];
  for (let i = 0; i < n; i++) all.push({ i, len: R.E[i].L, probe: probeOut(R, i, R.E[i].L / 2, 1.0) });
  const start = pickByRoads(all, s, roads).i;
  const run = new Set([start]);
  let len = R.E[start].L, last = start;
  while (len < DOOR_W && run.size < n - 2) {
    last = (last + 1) % n;
    run.add(last);
    len += R.E[last].L;
  }
  return { run, first: start, last };
}

// Doorway centred under a sign on edge i; null if the wall is too short or it would open into a neighbour.
export function signDoor(s, i) {
  const R = s.R, sp = doorSpan(R, i);
  if (!sp) return null;
  const c = Math.min(Math.max(R.E[i].L / 2, sp.lo), sp.hi);
  const p = probeOut(R, i, c, 0.5);
  if (blockedAt(s, p[0], p[1])) return null;
  return { edge: i, d0: c - sp.w / 2, d1: c + sp.w / 2 };
}

// WALL PIECES

export function wallPiece(ctx, o0, o1, i0, i1, y0, y1, out, inn) {
  vquad(ctx.buf, o0, o1, y0, y1, ctx.wc, out);
  vquad(ctx.buf, i0, i1, y0, y1, ctx.iw, inn);
  pushSolid(ctx.solids, [o0, o1, i1, i0], y0, y1);
}

// Wall over an opening, door head to eaves; its bottom FRAME_W is the frame head.
export function lintelPiece(ctx, o0, o1, i0, i1, doorTop, wallTop, out, inn) {
  if (wallTop - doorTop < 1e-3) return;
  const frameTop = Math.min(doorTop + FRAME_W, wallTop);
  vquad(ctx.buf, o0, o1, doorTop, frameTop, ctx.trim, out);
  vquad(ctx.buf, o0, o1, frameTop, wallTop, ctx.wc, out);
  vquad(ctx.buf, i0, i1, doorTop, wallTop, ctx.iw, inn);
  pushQuad(ctx.buf, [o0[0], doorTop, o0[1]], [o1[0], doorTop, o1[1]],
    [i1[0], doorTop, i1[1]], [i0[0], doorTop, i0[1]], ctx.trim, [0, -1, 0]);
  pushSolid(ctx.solids, [o0, o1, i1, i0], doorTop, wallTop);
}

// Foundation on sloping ground, lowest ground up to the floor (outer face and collider only).
export function ringPlinth(ctx, R, foot, floor) {
  const n = R.pts.length;
  for (let i = 0; i < n; i++) {
    const e = R.E[i], j = (i + 1) % n;
    const p0 = R.pts[i], p1 = R.pts[j], q0 = R.inner[i], q1 = R.inner[j];
    vquad(ctx.buf, p0, p1, foot, floor, ctx.wc, [-e.nx, 0, -e.nz]);
    pushSolid(ctx.solids, [p0, p1, q1, q0], foot, floor);
  }
}

// Walls for one ring; `doors` is at most one door per edge or a single run, null for courtyards.
export function ringWalls(ctx, R, doors, base, wallTop, doorTop) {
  const n = R.pts.length;
  const frameTop = Math.min(doorTop + FRAME_W, wallTop);
  const run = doors && doors.length && doors[0].run ? doors[0] : null;
  const byEdge = new Map();
  if (doors && !run) for (const d of doors) byEdge.set(d.edge, d);

  for (let i = 0; i < n; i++) {
    const e = R.E[i], j = (i + 1) % n;
    const p0 = R.pts[i], p1 = R.pts[j], q0 = R.inner[i], q1 = R.inner[j];
    const out = [-e.nx, 0, -e.nz], inn = [e.nx, 0, e.nz];

    if (run && run.run.has(i)) {
      lintelPiece(ctx, p0, p1, q0, q1, doorTop, wallTop, out, inn);
      continue;
    }
    const door = byEdge.get(i);
    if (!door) {
      wallPiece(ctx, p0, p1, q0, q1, base, wallTop, out, inn);
      continue;
    }

    // door edge: pier | opening | pier, lintel above
    const { d0, d1 } = door;
    const D0 = alongEdge(R, i, d0), D1 = alongEdge(R, i, d1);
    const X0 = innerAt(R, i, d0), X1 = innerAt(R, i, d1);
    const fl = Math.min(FRAME_W, d0), fr = Math.min(FRAME_W, e.L - d1);

    if (d0 > 1e-3) {
      const P = alongEdge(R, i, d0 - fl);
      vquad(ctx.buf, p0, P, base, wallTop, ctx.wc, out);
      vquad(ctx.buf, P, D0, base, frameTop, ctx.trim, out);
      vquad(ctx.buf, P, D0, frameTop, wallTop, ctx.wc, out);
      vquad(ctx.buf, q0, X0, base, wallTop, ctx.iw, inn);
      pushSolid(ctx.solids, [p0, D0, X0, q0], base, wallTop);
    }
    if (e.L - d1 > 1e-3) {
      const P = alongEdge(R, i, d1 + fr);
      vquad(ctx.buf, D1, P, base, frameTop, ctx.trim, out);
      vquad(ctx.buf, D1, P, frameTop, wallTop, ctx.wc, out);
      vquad(ctx.buf, P, p1, base, wallTop, ctx.wc, out);
      vquad(ctx.buf, X1, q1, base, wallTop, ctx.iw, inn);
      pushSolid(ctx.solids, [D1, p1, q1, X1], base, wallTop);
    }
    // jambs: the wall's cut faces, also closing a neighbour at a corner
    vquad(ctx.buf, D0, X0, base, doorTop, ctx.trim, [e.ux, 0, e.uz]);
    vquad(ctx.buf, D1, X1, base, doorTop, ctx.trim, [-e.ux, 0, -e.uz]);
    lintelPiece(ctx, D0, D1, X0, X1, doorTop, wallTop, out, inn);
  }

  if (run) {
    const ef = R.E[run.first], el = R.E[run.last];
    const s = run.first, t = (run.last + 1) % n;
    vquad(ctx.buf, R.pts[s], R.inner[s], base, doorTop, ctx.trim, [ef.ux, 0, ef.uz]);
    vquad(ctx.buf, R.pts[t], R.inner[t], base, doorTop, ctx.trim, [-el.ux, 0, -el.uz]);
  }
}

// BUILD

// FACADE: procedural windows, lit windows, ground-floor band, rooftop clutter.

// x = fraction of upper windows lit, y = fraction of shopfront bays lit.
export const facadeLit = { value: new THREE.Vector2(0, 0) };

// Lambert material with the window pattern patched into its shader.
export function facadeMaterial() {
  const m = new THREE.MeshLambertMaterial({ vertexColors: true });
  m.extensions = { derivatives: true };
  m.onBeforeCompile = sh => {
    sh.uniforms.uFacadeLit = facadeLit;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>
            attribute vec3 win;
            varying vec3 vWin;
            varying vec3 vFacadePos;
            varying vec3 vFacadeNrm;`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
            vWin = win;
            vFacadePos = (modelMatrix * vec4(transformed, 1.0)).xyz;
            vFacadeNrm = normal;`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
            uniform vec2 uFacadeLit;
            varying vec3 vWin;
            varying vec3 vFacadePos;
            varying vec3 vFacadeNrm;
            float facadeHash(vec3 p) {
              p = fract(p * vec3(0.1031, 0.1030, 0.0973));
              p += dot(p, p.yzx + 33.33);
              return fract((p.x + p.y) * p.z);
            }
            // 1 inside [lo, hi], with edges softened by the pixel footprint e
            float facadeBox(float x, float lo, float hi, float e) {
              return smoothstep(lo - e, lo + e, x) * (1.0 - smoothstep(hi - e, hi + e, x));
            }`)
      .replace('#include <color_fragment>', `#include <color_fragment>
            vec3 facadeGlow = vec3(0.0);
            {
              // snapped: interpolation noise on the seed made borderline windows speckle
              float seed = floor(vWin.z * 1024.0 + 0.5) / 1024.0;
              float h = vFacadePos.y - vWin.x;
              float wallH = vWin.y - vWin.x;
              if (seed > 0.0 && h > 0.0 && h < wallH) {
                float r1 = fract(seed * 7.13), r2 = fract(seed * 13.7), r3 = fract(seed * 29.3);
                vec2 along = normalize(vec2(-vFacadeNrm.z, vFacadeNrm.x));
                float u = dot(vFacadePos.xz, along) + seed * 37.0;
                float tall = smoothstep(30.0, 60.0, wallH);
                // ground-floor band only on buildings tall enough to have one
                float gf = wallH > 7.0 ? 4.2 + r1 * 0.8 : 0.0;
                vec3 glassCol = mix(vec3(0.030, 0.040, 0.055), vec3(0.060, 0.095, 0.130), r3);
                float glass = 0.0, lit = 0.0, cover = 0.0, litAvg = 0.0, cell = 0.0, fw = 0.0;

                if (h < gf) {
                  // shopfront: wide glazing between piers, kick plate below, fascia above
                  float bayW = 3.0 + r2 * 1.5;
                  float fx = u / bayW;
                  float ex = fwidth(fx);
                  fw = ex;
                  cell = floor(fx);
                  glass = facadeBox(fract(fx), 0.06, 0.94, ex) * facadeBox(h, 0.45, gf - 0.75, fwidth(h));
                  cover = 0.88 * (gf - 1.2) / gf;
                  float fascia = smoothstep(gf - 0.75, gf - 0.70, h);
                  diffuseColor.rgb *= mix(0.72, 0.50, fascia);
                  lit = step(facadeHash(vec3(cell, 91.0, seed * 51.0)) + 0.0001, uFacadeLit.y);
                  litAvg = uFacadeLit.y;
                } else {
                  float floorH = 3.0 + r2 * 0.8;
                  float bayW = mix(2.2 + r1 * 1.6, 1.5 + r3 * 0.9, tall);
                  float fx = u / bayW, fy = (h - gf) / floorH;
                  float ex = fwidth(fx), ey = fwidth(fy);
                  fw = max(ex, ey);
                  float col = floor(fx), row = floor(fy);
                  // tall towers read as curtain wall, low buildings as punched windows
                  float x0 = mix(0.22, 0.05, tall), y0 = mix(0.30, 0.10, tall), y1 = mix(0.80, 0.93, tall);
                  // no window on a partial top storey
                  float whole = step(floorH * 0.85, wallH - gf - row * floorH);
                  glass = facadeBox(fract(fx), x0, 1.0 - x0, ex) * facadeBox(fract(fy), y0, y1, ey) * whole;
                  cover = (1.0 - 2.0 * x0) * (y1 - y0);
                  cell = col + row * 57.0;
                  lit = step(facadeHash(vec3(col, row, seed * 51.0)) + 0.0001, uFacadeLit.x);
                  litAvg = uFacadeLit.x;
                }

                // far away the grid is finer than a pixel: fade to its average to stop shimmer
                float detail = 1.0 - smoothstep(0.35, 0.9, fw);
                float g = mix(cover, glass, detail);
                float l = mix(cover * litAvg, glass * lit, detail);
                diffuseColor.rgb = mix(diffuseColor.rgb, glassCol, g);
                float tone = facadeHash(vec3(cell, seed * 17.0, 3.0));
                vec3 lamp = mix(vec3(1.0, 0.74, 0.42), vec3(0.78, 0.88, 1.0), step(0.86, tone));
                facadeGlow = lamp * l * (0.45 + 0.55 * fract(tone * 9.7));
              }
            }`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
            totalEmissiveRadiance += facadeGlow;`);
  };
  return m;
}

// Box on a roof, turned to the axis (ux, uz); four sides and a top.
export function pushBox(b, cx, cz, ux, uz, hw, hd, y0, y1, c) {
  const vx = -uz, vz = ux;
  const k = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([a, d]) =>
    [cx + ux * hw * a + vx * hd * d, cz + uz * hw * a + vz * hd * d]);
  for (let i = 0; i < 4; i++) {
    const p = k[i], q = k[(i + 1) % 4];
    const mx = (p[0] + q[0]) / 2 - cx, mz = (p[1] + q[1]) / 2 - cz;
    pushQuad(b, [p[0], y0, p[1]], [q[0], y0, q[1]], [q[0], y1, q[1]], [p[0], y1, p[1]], c, [mx, 0, mz]);
  }
  pushQuad(b, [k[0][0], y1, k[0][1]], [k[1][0], y1, k[1][1]], [k[2][0], y1, k[2][1]], [k[3][0], y1, k[3][1]], c, [0, 1, 0]);
}

// Upright prism with `sides` faces, used for water tanks.
export function pushPrism(b, cx, cz, r, y0, y1, sides, c) {
  for (let i = 0; i < sides; i++) {
    const a0 = i / sides * Math.PI * 2, a1 = (i + 1) / sides * Math.PI * 2;
    const p = [cx + Math.cos(a0) * r, cz + Math.sin(a0) * r], q = [cx + Math.cos(a1) * r, cz + Math.sin(a1) * r];
    pushQuad(b, [p[0], y0, p[1]], [q[0], y0, q[1]], [q[0], y1, q[1]], [p[0], y1, p[1]], c,
      [Math.cos((a0 + a1) / 2), 0, Math.sin((a0 + a1) / 2)]);
    pushTri(b, [cx, y1, cz], [p[0], y1, p[1]], [q[0], y1, q[1]], c, [0, 1, 0]);
  }
}

// Parapet and rooftop plant for a flat-roofed shell. Visual only: no colliders.
export function roofDetail(b, s, R, wc) {
  const wallH = s.top - s.base;
  if (wallH < 6) return;
  const y = s.top, n = R.pts.length;

  // parapet: outer face continues the wall, inner face and coping are darker
  const ph = wallH > 30 ? 0.9 : 0.5;
  const pc = [wc[0] * 0.8, wc[1] * 0.8, wc[2] * 0.8];
  for (let i = 0; i < n; i++) {
    const e = R.E[i], j = (i + 1) % n;
    const p0 = R.pts[i], p1 = R.pts[j], q0 = R.inner[i], q1 = R.inner[j];
    vquad(b, p0, p1, y, y + ph, wc, [-e.nx, 0, -e.nz]);
    vquad(b, q0, q1, y, y + ph, pc, [e.nx, 0, e.nz]);
    pushQuad(b, [p0[0], y + ph, p0[1]], [p1[0], y + ph, p1[1]], [q1[0], y + ph, q1[1]], [q0[0], y + ph, q0[1]], pc, [0, 1, 0]);
  }

  const area = Math.abs(ringArea(s.pts));
  if (area < 80) return;
  const rnd = seededRandom(s.index + 1);
  // align everything to the longest wall
  let long = R.E[0];
  for (const e of R.E) if (e.L > long.L) long = e;
  const ux = long.ux, uz = long.uz, vx = -uz, vz = ux;
  const placed = [];

  // Random spot whose padded footprint is on the roof and clear of earlier pieces.
  const place = (hw, hd) => {
    const pw = hw + 0.9, pd = hd + 0.9, r = Math.hypot(hw, hd);
    for (let t = 0; t < 14; t++) {
      const x = s.minX + rnd() * (s.maxX - s.minX), z = s.minZ + rnd() * (s.maxZ - s.minZ);
      let ok = pointInShell(s, x, z);
      for (let a = -1; a <= 1 && ok; a += 2) for (let d = -1; d <= 1 && ok; d += 2) {
        ok = pointInShell(s, x + ux * pw * a + vx * pd * d, z + uz * pw * a + vz * pd * d);
      }
      for (const q of placed) if (ok && Math.hypot(x - q[0], z - q[1]) < r + q[2] + 0.4) ok = false;
      if (ok) { placed.push([x, z, r]); return [x, z]; }
    }
    return null;
  };
  const box = (hw, hd, h, c) => {
    const p = place(hw, hd);
    if (p) pushBox(b, p[0], p[1], ux, uz, hw, hd, y, y + h, c);
  };
  const shade = k => [wc[0] * k, wc[1] * k, wc[2] * k];
  // each piece survives one time in four: 75 percent less clutter
  const keep = () => rnd() < 0.25;

  if (wallH > 45 && keep()) {
    // mechanical penthouse and a mast on towers
    box(3 + rnd() * 3, 2.5 + rnd() * 2, 3.5 + rnd() * 2, shade(0.7));
    const p = place(0.5, 0.5);
    if (p) pushBox(b, p[0], p[1], ux, uz, 0.12, 0.12, y, y + 8 + rnd() * 12, [0.03, 0.03, 0.035]);
  }
  // stair bulkhead
  if (wallH > 12 && area > 150 && keep()) box(1.6, 2.3, 2.8, shade(0.75));
  // water tank on some mid-rise roofs
  if (wallH > 14 && wallH <= 45 && rnd() < 0.3 && keep()) {
    const p = place(1.5, 1.5);
    if (p) {
      pushBox(b, p[0], p[1], ux, uz, 1.0, 1.0, y, y + 1.3, [0.04, 0.04, 0.045]);
      pushPrism(b, p[0], p[1], 1.4, y + 1.3, y + 4.0, 8, [0.13, 0.075, 0.04]);
    }
  }
  // air handlers, more on bigger roofs
  const units = Math.min(7, 1 + Math.floor(area / 300));
  for (let i = 0; i < units; i++) {
    if (!keep()) continue;
    const k = 0.12 + rnd() * 0.16;
    box(0.7 + rnd() * 1.3, 0.6 + rnd() * 0.9, 0.8 + rnd() * 1.3, [k, k, k * 1.04]);
  }
}

export function buildCity(features) {
  clearLayers();

  // BUILDING CHUNKS: one facade mesh per BUILDING_CHUNK_M cell, so view and shadow culling skip whole cells.
  const chunks = new Map();
  const chunkOf = sh => {
    const k = Math.floor((sh.minX + sh.maxX) / 2 / BUILDING_CHUNK_M) + ',' +
      Math.floor((sh.minZ + sh.maxZ) / 2 / BUILDING_CHUNK_M);
    let c = chunks.get(k);
    if (!c) {
      c = { buf: newBuf(), roofBuf: newBuf() };
      c.buf.win = []; c.roofBuf.win = [];
      chunks.set(k, c);
    }
    return c;
  };
  const floorBuf = newBuf();
  const list = [];
  let skipped = 0;

  // Pass 1: every shell record, so door placement can check neighbours.
  for (const ring of features.buildings) {
    const outer = orientRing(dedupeRing(ring.pts), true);
    if (outer.length < 3) { skipped++; continue; }
    const foot = Math.abs(ringArea(outer));
    if (foot < 4) { skipped++; continue; }

    const tags = ring.tags || {};
    const top = heightOf(tags);
    const base = Math.min(minHeightOf(tags), top - 0.5);
    if (!(top - base > 0.5)) { skipped++; continue; }

    // A pitched roof starts at the eaves; the walls stop there.
    let roofShape = ROOF_SHAPE[tags['roof:shape']] || null;
    let obb = null, wallTop = top;
    if (roofShape) {
      obb = obbOf(outer);
      // use the oriented box only when its area is close to the footprint's
      if (!obb || foot / obb.area < 0.72) roofShape = null;
    }
    if (roofShape) {
      let rh = parseLength(tags['roof:height'])
        ?? (parseLength(tags['roof:levels']) ?? 0) * METERS_PER_LVL;
      if (!rh) rh = Math.min(Math.max(obb.hv * 0.55, 1.2), 7);
      rh = Math.min(rh, (top - base) - 1.0);
      if (rh >= 0.6) wallTop = top - rh; else roofShape = null;
    }

    const holes = (ring.holes || [])
      .map(h => orientRing(dedupeRing(h), false))
      .filter(h => h.length >= 3 && Math.abs(ringArea(h)) >= 1);
    const cap = capOf(outer, holes);
    if (!cap) { skipped++; continue; }   // self-intersecting ring; earcut gave up

    // Floor at the highest ground under the footprint so terrain never shows through; plinth down to the lowest.
    const [gLo, gHi] = elevation.span(outer);
    const raised = base > 0.05;
    const b0 = base + gHi;

    list.push({
      pts: outer, holes, ...bounds(outer), cap,
      base: b0, top: wallTop + gHi, ceil: wallTop + gHi - CEIL_GAP, floor: b0,
      ground: gHi, foot: raised ? b0 : gLo, raised,
      roofTop: top + gHi, roofShape, obb, tags, doors: [], doorTop: 0, throat: null, throats: [],
      R: null, signDoors: null, index: list.length
    });
  }
  collision.shells = list;
  collision.shellGrid = gridOf(list, GRID_CELL);
  buildShellRaster(list);

  for (const s of list) {
    const wallH = s.top - s.base;
    let doorH = Math.min(DOOR_H, wallH - 0.3);
    if (doorH < EYE_HEIGHT + HEAD_CLEAR + 0.25) doorH = wallH;
    s.doorTop = s.base + doorH;
    s.R = wallRing(s.pts);
  }

  // Signs first: each placed sign puts one doorway on the wall under it.
  const signs = [];
  for (const q of collectSigns(list, features.pois)) {
    if (signs.length >= SIGN_MAX) break;
    const w = q.w, door = signDoor(w, q.edge.i);
    const sg = placeSign(q.edge, q.text, q.kind, w.top, door ? w.doorTop + 0.12 : 0, w.ground);
    if (!sg || !fitSign(sg, signs, w.top)) continue;
    signs.push(sg);
    if (door) {
      if (!w.signDoors) w.signDoors = new Map();
      if (!w.signDoors.has(door.edge)) w.signDoors.set(door.edge, door);
    }
  }

  // Pass 2: geometry and colliders.
  const roads = roadIndex(features.roads);
  const ents = pointIndex(features.entrances);
  const iw = rgb(0xe4ded2), floorC = rgb(0x8f7358), ceilC = rgb(0xf1eee8), trim = rgb(0x4e3d30);
  const solids = [];
  indoorClip.begin(list);

  for (const s of list) {
    const { buf, roofBuf } = chunkOf(s);
    const tags = s.tags;
    const named = wallColorOf(tags);
    let wc;
    if (named != null) {
      const c = rgb(named), k = 0.9 + Math.random() * 0.12;
      wc = [c[0] * k, c[1] * k, c[2] * k];
    } else {
      const t = 0.72 + Math.random() * 0.24;
      wc = [0.80 * t, 0.78 * t, 0.74 * t];
    }

    // FACADE: faces pushed with this exact colour array become window walls.
    buf.winCol = wc;
    buf.winData = [s.base, s.top, 0.05 + 0.95 * hash01(s.index)];

    const R = s.R;
    const doors = s.signDoors ? [...s.signDoors.values()] : [];
    const main = chooseDoor(s, R, roads, ents);
    // one door per wall: a sign's doorway already opens the main door's wall
    if (main.run || !doors.some(d => d.edge === main.edge)) doors.unshift(main);
    s.doors = doors;
    // doorway axes, outer face to inner face, for the NPC occupancy grid
    for (const d of doors) {
      if (d.run) continue;
      const m = (d.d0 + d.d1) / 2;
      const o = alongEdge(R, d.edge, m), q = innerAt(R, d.edge, m);
      s.throats.push([o[0], o[1], q[0], q[1]]);
    }
    s.throat = s.throats[0] || null;

    const ctx = { buf, solids, wc, iw, trim };
    ringWalls(ctx, R, doors, s.base, s.top, s.doorTop);
    const HR = s.holes.map(wallRing);
    for (const h of HR) ringWalls(ctx, h, null, s.base, s.top, s.doorTop);
    if (s.base - s.foot > 0.01) {
      ringPlinth(ctx, R, s.foot, s.base);
      for (const h of HR) ringPlinth(ctx, h, s.foot, s.base);
    }
    s.R = null; s.signDoors = null;

    pushCap(buf, s.cap, s.top, wc, [0, 1, 0]);
    pushCap(buf, s.cap, s.ceil, ceilC, [0, -1, 0]);
    // floor inside the walls (inner outline), so its depth bias never reaches the outer face
    const floorCap = capOf(R.inner, HR.map(h => h.inner)) || s.cap;
    // ground layers are cut away inside the walls, so the floor needs no depth bias
    indoorClip.fill([R.inner, ...HR.map(h => h.inner)]);
    pushCap(floorBuf, floorCap, s.base + FLOOR_Y, floorC, [0, 1, 0]);
    if (s.raised) pushCap(buf, s.cap, s.base, wc, [0, -1, 0]);
    // FACADE: parapet and rooftop plant on flat roofs only.
    if (!s.roofShape) roofDetail(buf, s, R, wc);

    if (s.roofShape) {
      const rcHex = roofColorOf(tags);
      const rc = rcHex != null ? rgb(rcHex) : [wc[0] * 0.72, wc[1] * 0.70, wc[2] * 0.68];
      roofOf(roofBuf, s.obb, s.top, s.roofTop, s.roofShape, rc);
    }
  }

  indoorClip.finish();
  const count = list.length;
  // one facade material shared by every chunk (one program, one set of uniforms)
  const facade = facadeMaterial();
  for (const c of chunks.values()) {
    const mesh = addLayer([bufGeom(c.buf), bufGeom(c.roofBuf)].filter(Boolean), facade);
    if (mesh) mesh.castShadow = mesh.receiveShadow = true;
  }
  const fg = bufGeom(floorBuf);
  const floorMesh = fg ? addLayer([fg], litMaterial()) : null;
  if (floorMesh) floorMesh.receiveShadow = true;

  buildGround(features);
  const trunkSolids = buildTrees(features.trees);
  const barrierBoxes = buildBarriers(features.barriers);
  buildGrid(solids.concat(barrierBoxes, trunkSolids));
  // building walls and tree trunks block NPC sight; fences, hedges and garden walls do not
  cover.add(solids.concat(trunkSolids));
  buildSigns(signs);
  return { count, skipped };
}

// Roads, paths, water and land cover, one mesh per layer for its own depth bias.
export function buildGround(features) {
  const areaGeoms = [], greenGeoms = [], waterGeoms = [];
  const roadBuf = newBuf(), pathBuf = newBuf(), waterBuf = newBuf();

  for (const a of features.areas) {
    const hex = AREA_COLOR[a.kind];
    const wet = a.kind === 'water' || a.kind === 'basin' || a.kind === 'reservoir';
    const g = areaGeom(a.pts, wet ? LAYER_Y.water : LAYER_Y.area, rgb(hex));
    if (g) (wet ? waterGeoms : MIX_GREEN_KINDS.has(a.kind) ? greenGeoms : areaGeoms).push(g);
  }

  const waterC = rgb(AREA_COLOR.water);
  for (const w of features.waterways) ribbon(waterBuf, w.pts, w.width, LAYER_Y.water, waterC);
  const wg = bufGeom(waterBuf);
  if (wg) waterGeoms.push(wg);

  const roadC = rgb(ROAD_COLOR), pathC = rgb(PATH_COLOR);
  for (const r of features.roads) {
    const isPath = PATH_KINDS.has(r.kind);
    const width = r.width ?? ROAD_WIDTH[r.kind];
    if (isPath) ribbon(pathBuf, r.pts, width, LAYER_Y.path, pathC);
    else ribbon(roadBuf, r.pts, width, LAYER_Y.road, roadC);
  }
  let rg = bufGeom(roadBuf), pg = bufGeom(pathBuf);

  // flat layers follow the ground; with no terrain they stay as built
  const lay = gs => elevation.active ? gs.map(drape).filter(Boolean) : gs;
  const areas = lay(areaGeoms), greens = lay(greenGeoms);
  for (const g of areas) matchWildGround(g, false);
  for (const g of greens) matchWildGround(g, true);
  const areaMesh = addLayer(areas.concat(greens), indoorClip.apply(lampLight.apply(waterClip.apply(litMaterial(LAYER_BIAS.area)))));
  // the wild ground takes shadows, so land cover must too or it reads lighter than the grass around it
  if (areaMesh) cellCull(areaMesh, true).receiveShadow = true;
  // the wild water's surface (reflective, moving, see-through, both faces), UVs in metres for its normal maps
  wildWater.cityMaps = null;
  const waterMesh = addLayer(lay(waterGeoms), wildWater.cityMaterial(LAYER_BIAS.water));
  if (waterMesh) {
    const p = waterMesh.geometry.attributes.position, uv = new Float32Array(p.count * 2);
    for (let i = 0; i < p.count; i++) { uv[i * 2] = p.getX(i); uv[i * 2 + 1] = -p.getZ(i); }
    waterMesh.geometry.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    waterMesh.renderOrder = 1;
  }
  // roads and paths take the buildings' and animals' shadows like the ground under them
  const roadMesh = rg ? addLayer(lay([rg]), indoorClip.apply(lampLight.apply(litMaterial(LAYER_BIAS.road)))) : null;
  if (roadMesh) cellCull(roadMesh).receiveShadow = true;
  const pathMesh = pg ? addLayer(lay([pg]), indoorClip.apply(lampLight.apply(litMaterial(LAYER_BIAS.path)))) : null;
  if (pathMesh) cellCull(pathMesh).receiveShadow = true;
}

// `at` gives the ground height and `add` takes each mesh; the defaults are the city's (its ground, its layers).
// Returns the trunk solids; the caller files them with the obstacle index and cover.
export function buildTrees(trees, at = (x, z) => elevation.at(x, z), add = obj => { scene.add(obj); layers.push(obj); }) {
  const solids = [];
  if (!trees.length) return solids;

  const trunkG = new THREE.CylinderGeometry(TREE_TRUNK_TOP_R, TREE_TRUNK_BASE_R, 1, 6);
  trunkG.translate(0, 0.5, 0);
  const crownG = new THREE.IcosahedronGeometry(1, 0);
  const trunk = new THREE.InstancedMesh(trunkG, new THREE.MeshLambertMaterial({ color: 0x6b5136 }), trees.length);
  const crown = new THREE.InstancedMesh(crownG, new THREE.MeshLambertMaterial({ color: 0xffffff }), trees.length);

  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  const pos = new THREE.Vector3();
  const scl = new THREE.Vector3();
  const c = new THREE.Color();

  for (let i = 0; i < trees.length; i++) {
    const t = trees[i];
    const tags = t.tags || null;
    const h = Math.min(Math.max(parseLength(tags && tags.height) ?? (4.5 + Math.random() * 4), 2), 30);
    const crownR = Math.min(Math.max((parseLength(tags && tags.diameter_crown) ?? h * 0.55) / 2, 0.6), h * 0.45);
    const trunkH = h - crownR * 1.5;

    e.set(0, Math.random() * Math.PI * 2, 0);
    q.setFromEuler(e);

    const gy = at(t.x, t.z);
    pos.set(t.x, gy, t.z);
    scl.set(1, Math.max(trunkH, 0.5), 1);
    trunk.setMatrixAt(i, m.compose(pos, q, scl));

    pos.set(t.x, gy + Math.max(trunkH, 0.5) + crownR * 0.55, t.z);
    scl.set(crownR, crownR * 1.15, crownR);
    crown.setMatrixAt(i, m.compose(pos, q, scl));
    crown.setColorAt(i, c.setHSL(0.24 + Math.random() * 0.07, 0.42, 0.20 + Math.random() * 0.09));
    solids.push(poleSolid(t.x, t.z, TREE_TRUNK_SOLID_R, gy, gy + Math.max(trunkH, 0.5) + crownR * 1.7));
  }

  trunk.instanceMatrix.needsUpdate = true;
  crown.instanceMatrix.needsUpdate = true;
  if (crown.instanceColor) crown.instanceColor.needsUpdate = true;
  trunk.frustumCulled = false;
  crown.frustumCulled = false;
  add(trunk);
  add(crown);
  invalidate();
  return solids;
}

// Walls, fences and hedges; each segment is also a thin collision footprint.
export function buildBarriers(list) {
  const geoms = [], boxes = [];

  for (const b of list) {
    const spec = BARRIER[b.kind];
    const h = Math.min(Math.max(b.height ?? spec.h, 0.4), 12);
    const c = rgb(spec.color);

    for (let i = 0; i < b.pts.length - 1; i++) {
      const [ax, az] = b.pts[i], [bx, bz] = b.pts[i + 1];
      // on terrain, long runs step down the slope in ELEV_STEP * 2 pieces
      const run = Math.hypot(bx - ax, bz - az);
      const parts = elevation.active ? Math.max(1, Math.ceil(run / (ELEV_STEP * 2))) : 1;
      for (let k = 0; k < parts; k++) {
        const x0 = ax + (bx - ax) * k / parts, z0 = az + (bz - az) * k / parts;
        const x1 = ax + (bx - ax) * (k + 1) / parts, z1 = az + (bz - az) * (k + 1) / parts;
        const dx = x1 - x0, dz = z1 - z0;
        const len = Math.hypot(dx, dz);
        if (len < 0.2) continue;

        const g0 = elevation.at(x0, z0), g1 = elevation.at(x1, z1);
        const base = Math.min(g0, g1), top = (g0 + g1) / 2 + h;

        const g = new THREE.BoxGeometry(len, top - base, spec.t);
        g.deleteAttribute('uv');
        g.rotateY(Math.atan2(-dz, dx));
        g.translate((x0 + x1) / 2, (base + top) / 2, (z0 + z1) / 2);
        geoms.push(tint(nonIndexed(g), c));

        const t = Math.max(spec.t, 0.25) / 2;
        const nx = -dz / len * t, nz = dx / len * t;
        const pts = [[x0 + nx, z0 + nz], [x1 + nx, z1 + nz], [x1 - nx, z1 - nz], [x0 - nx, z0 - nz]];
        boxes.push({ pts, ...bounds(pts), base, top, tags: null });
      }
    }
  }

  addLayer(geoms, litMaterial());
  return boxes;
}

export function buildProps(list) {
  const geoms = [];

  const wood = rgb(0x9b7648), iron = rgb(0x4d5157), hydrant = rgb(0xc0392b);

  // street lamps are built by streets.build
  for (const p of list) {
    const gy = elevation.at(p.x, p.z);
    if (p.kind === 'bench') {
      const yaw = Math.random() * Math.PI * 2;
      const s = Math.sin(yaw), co = Math.cos(yaw);
      geoms.push(box(1.7, 0.09, 0.5, p.x, gy + 0.46, p.z, yaw, wood));
      geoms.push(box(1.7, 0.38, 0.07, p.x - s * 0.21, gy + 0.68, p.z - co * 0.21, yaw, wood));
      geoms.push(box(0.07, 0.44, 0.44, p.x + co * 0.72, gy + 0.22, p.z - s * 0.72, yaw, iron));
      geoms.push(box(0.07, 0.44, 0.44, p.x - co * 0.72, gy + 0.22, p.z + s * 0.72, yaw, iron));
    } else if (p.kind === 'hydrant') {
      geoms.push(cyl(0.13, 0.16, 0.62, p.x, gy, p.z, hydrant));
      geoms.push(cyl(0.09, 0.13, 0.12, p.x, gy + 0.62, p.z, hydrant));
    }
  }

  addLayer(geoms, litMaterial());
}

// ELEVATION: one height grid per city every ELEV_STEP m; elevation.at(x, z) is 0 without terrain.
export const elevation = {
  active: false, half: 0, step: ELEV_STEP, n: 0, data: null, min: 0, max: 0,

  set(g) {
    if (!g) { this.clear(); return; }
    Object.assign(this, g);
    this.active = true;
  },
  reset() { this.clear(); },   // teardownWorld's entry
  clear() {
    this.active = false; this.data = null; this.n = 0; this.min = 0; this.max = 0;
  },

  at(x, z) {
    if (!this.active) return 0;
    const n = this.n, last = n - 1;
    let fx = (x + this.half) / this.step, fz = (z + this.half) / this.step;
    fx = fx < 0 ? 0 : fx > last ? last : fx;
    fz = fz < 0 ? 0 : fz > last ? last : fz;
    const i = Math.min(Math.floor(fx), last - 1), j = Math.min(Math.floor(fz), last - 1);
    const tx = fx - i, tz = fz - j, d = this.data, k = j * n + i;
    const a = d[k] + (d[k + 1] - d[k]) * tx;
    const b = d[k + n] + (d[k + n + 1] - d[k + n]) * tx;
    return a + (b - a) * tz;
  },

  // Lowest and highest ground under a footprint, from corners plus interior samples.
  span(pts) {
    if (!this.active) return [0, 0];
    let lo = Infinity, hi = -Infinity;
    const take = h => { if (h < lo) lo = h; if (h > hi) hi = h; };
    for (const [x, z] of pts) take(this.at(x, z));
    const b = bounds(pts), st = this.step;
    for (let z = b.minZ + st / 2; z < b.maxZ; z += st) {
      for (let x = b.minX + st / 2; x < b.maxX; x += st) {
        if (pointInRing(pts, x, z)) take(this.at(x, z));
      }
    }
    return [lo, hi];
  }
};

// Split edges longer than ELEV_STEP (longest-edge midpoints, so no cracks), drop triangles off the grid, lift to the ground.
export function drape(g) {
  const P = g.attributes.position.array, C = g.attributes.color.array;
  const E2 = ELEV_STEP * ELEV_STEP;
  const L = elevation.half + ELEV_STEP;
  let pos = new Float32Array(Math.max(1024, P.length * 2)), col = new Float32Array(pos.length), n = 0;
  // Depth-first stack of triangles, 18 numbers each (3 corners of x, y, z, r, g, b).
  const DEPTH = 96, S = new Float64Array(18 * DEPTH);

  for (let t = 0; t < P.length; t += 9) {
    for (let k = 0; k < 3; k++) {
      for (let c = 0; c < 3; c++) { S[k * 6 + c] = P[t + k * 3 + c]; S[k * 6 + 3 + c] = C[t + k * 3 + c]; }
    }
    let sp = 1;
    while (sp > 0) {
      const o = --sp * 18;
      const ax = S[o], az = S[o + 2], bx = S[o + 6], bz = S[o + 8], cx = S[o + 12], cz = S[o + 14];
      if ((ax < -L && bx < -L && cx < -L) || (ax > L && bx > L && cx > L) ||
        (az < -L && bz < -L && cz < -L) || (az > L && bz > L && cz > L)) continue;
      const ab = (ax - bx) ** 2 + (az - bz) ** 2;
      const bc = (bx - cx) ** 2 + (bz - cz) ** 2;
      const ca = (cx - ax) ** 2 + (cz - az) ** 2;
      const m = Math.max(ab, bc, ca);
      if (m <= E2 || sp + 2 > DEPTH) {
        if (n + 9 > pos.length) {
          const p2 = new Float32Array(pos.length * 2), c2 = new Float32Array(pos.length * 2);
          p2.set(pos); c2.set(col); pos = p2; col = c2;
        }
        for (let k = 0; k < 3; k++) {
          const v = o + k * 6, x = S[v], z = S[v + 2];
          pos[n] = x; pos[n + 1] = S[v + 1] + elevation.at(x, z); pos[n + 2] = z;
          col[n] = S[v + 3]; col[n + 1] = S[v + 4]; col[n + 2] = S[v + 5];
          n += 3;
        }
        continue;
      }
      // Split the longest edge i-j at its midpoint q; both halves keep the parent's winding.
      const i = m === ab ? 0 : m === bc ? 1 : 2, j = (i + 1) % 3;
      const o2 = o + 18;
      for (let c = 0; c < 18; c++) S[o2 + c] = S[o + c];
      for (let c = 0; c < 6; c++) {
        const q = (S[o + i * 6 + c] + S[o + j * 6 + c]) / 2;
        S[o + j * 6 + c] = q;
        S[o2 + i * 6 + c] = q;
      }
      sp += 2;
    }
  }
  g.dispose();
  if (!n) return null;
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos.slice(0, n), 3));
  out.setAttribute('color', new THREE.BufferAttribute(col.slice(0, n), 3));
  out.computeVertexNormals();
  return out;
}

// Grid mesh over [-half, half] at ELEV_STEP, lifted onto the terrain; flat terrain gives one quad.
export function terrainGrid(westX, eastX, northZ, southZ, y) {
  const segX = elevation.active ? Math.max(1, Math.round((eastX - westX) / ELEV_STEP)) : 1;
  const segZ = elevation.active ? Math.max(1, Math.round((southZ - northZ) / ELEV_STEP)) : 1;
  const g = new THREE.PlaneGeometry(eastX - westX, southZ - northZ, segX, segZ);
  g.rotateX(-Math.PI / 2);
  g.translate((westX + eastX) / 2, y, (northZ + southZ) / 2);
  if (elevation.active) {
    const a = g.attributes.position;
    for (let i = 0; i < a.count; i++) a.setY(i, y + elevation.at(a.getX(i), a.getZ(i)));
    g.computeVertexNormals();
  }
  return g;
}

// Plain ground over the area plus margin, drawn by ground cell; `paint(geometry)` gives the slope-painted material and forces the base when flat.
export function buildTerrainBase(radius, paint = null) {
  ground.position.y = elevation.active ? elevation.min - 0.3 : 0;
  if (!elevation.active && !paint) return;
  const h = elevation.active ? Math.min(radius + ELEV_MARGIN, elevation.half) : radius;
  const g = terrainGrid(-h, h, -h, h, -0.02);
  const mesh = cellCull(new THREE.Mesh(g, lampLight.apply(waterClip.apply(paint ? paint(g) : new THREE.MeshLambertMaterial({ color: 0x5c5f57 })))), false, TERRAIN_CELL_M);
  mesh.receiveShadow = true;
  scene.add(mesh);
  layers.push(mesh);
  invalidate();
}

// SIGNAGE

// Outward normal and midpoint of a footprint edge (winding checked against the ring).
export function edgeOutward(pts, i) {
  const j = (i + 1) % pts.length;
  const [x0, z0] = pts[i], [x1, z1] = pts[j];
  const len = Math.hypot(x1 - x0, z1 - z0);
  if (len < 1e-4) return null;
  let nx = (z1 - z0) / len, nz = -(x1 - x0) / len;
  const mx = (x0 + x1) / 2, mz = (z0 + z1) / 2;
  if (pointInRing(pts, mx + nx * 0.2, mz + nz * 0.2)) { nx = -nx; nz = -nz; }
  return { i, mx, mz, nx, nz, len };
}

export function longestEdge(pts) {
  let bi = -1, bl = 0;
  for (let i = 0; i < pts.length; i++) {
    const j = (i + 1) % pts.length;
    const d = Math.hypot(pts[j][0] - pts[i][0], pts[j][1] - pts[i][1]);
    if (d > bl) { bl = d; bi = i; }
  }
  return bi < 0 ? null : edgeOutward(pts, bi);
}

export function edgeNearest(pts, x, z) {
  let bi = -1, best = Infinity;
  for (let i = 0; i < pts.length; i++) {
    const j = (i + 1) % pts.length;
    const [xi, zi] = pts[i], [xj, zj] = pts[j];
    const dx = xj - xi, dz = zj - zi;
    const l2 = dx * dx + dz * dz;
    let t = l2 > 0 ? ((x - xi) * dx + (z - zi) * dz) / l2 : 0;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    const px = xi + dx * t, pz = zi + dz * t;
    const d = (x - px) * (x - px) + (z - pz) * (z - pz);
    if (d < best) { best = d; bi = i; }
  }
  return bi < 0 ? null : edgeOutward(pts, bi);
}

// `lift`: lowest the sign may hang (above a doorway); `ground`: level heights are measured from.
export function placeSign(edge, text, kind, eaves, lift, ground = 0) {
  if (!edge || !text) return null;
  const h = kind === 'number' ? 0.3 : 0.55;
  let y = ground + (kind === 'number'
    ? Math.min(2.1, eaves - ground - 0.25)
    : Math.min(3.1, eaves - ground - 0.45));
  if (lift && y - h / 2 < lift) {
    y = lift + h / 2;
    if (y + h / 2 > eaves - 0.05) return null;
  }
  if (y - h / 2 < ground + 0.3) return null;
  if (edge.len < (kind === 'number' ? 0.8 : 1.6)) return null;
  return {
    x: edge.mx + edge.nx * 0.07, y, z: edge.mz + edge.nz * 0.07,
    nx: edge.nx, nz: edge.nz, h, text: String(text), kind
  };
}

// Sign requests { w, edge, text, kind }: names on the longest wall, POIs on their building's wall.
export function collectSigns(walls, pois) {
  const names = [], numbers = [];

  for (const w of walls) {
    const tags = w.tags;
    const label = signLabel(tags);
    const edge = longestEdge(w.pts);
    if (!edge) continue;
    if (label) names.push({ w, edge, text: label, kind: 'name' });
    if (tags['addr:housenumber']) numbers.push({ w, edge, text: tags['addr:housenumber'], kind: 'number' });
  }

  // Candidates from the shell grid; sorting keeps ties and the early break identical to a full scan.
  const REACH = 15;
  const cand = [];
  const mark = new Uint32Array(walls.length);
  let stamp = 0;
  for (const p of pois || []) {
    let hit = null, best = Infinity;
    stamp++;
    cand.length = 0;
    const cx0 = Math.floor((p.x - REACH) / GRID_CELL), cx1 = Math.floor((p.x + REACH) / GRID_CELL);
    const cz0 = Math.floor((p.z - REACH) / GRID_CELL), cz1 = Math.floor((p.z + REACH) / GRID_CELL);
    for (let cx = cx0; cx <= cx1; cx++) {
      for (let cz = cz0; cz <= cz1; cz++) {
        const bucket = collision.shellGrid.get(cellKey(cx, cz));
        if (!bucket) continue;
        for (const idx of bucket) {
          if (mark[idx] === stamp) continue;
          mark[idx] = stamp;
          cand.push(idx);
        }
      }
    }
    cand.sort((a, b) => a - b);
    for (const idx of cand) {
      const w = walls[idx];
      if (p.x < w.minX - REACH || p.x > w.maxX + REACH ||
        p.z < w.minZ - REACH || p.z > w.maxZ + REACH) continue;
      const inside = pointInShell(w, p.x, p.z);
      const c = closestOnRing(w.pts, p.x, p.z);
      const d = inside ? 0 : c.d;
      if (d < best) { best = d; hit = w; }
      if (inside) break;
    }
    if (!hit) continue;
    const edge = edgeNearest(hit.pts, p.x, p.z);
    if (edge) names.push({ w: hit, edge, text: p.label, kind: 'name' });
  }

  return names.concat(numbers);
}

// Text as drawn in its atlas cell (font size, clipped text, width), measured once at placement.
export const signMeasure = document.createElement('canvas').getContext('2d');
export function signMetrics(text, kind) {
  const PAD = 10, maxW = SIGN_CELL_W - PAD * 2;
  let size = kind === 'number' ? 30 : 26;
  signMeasure.font = `${size}px ${SIGN_FONT}`;
  let w = signMeasure.measureText(text).width;
  if (w > maxW) {
    size = Math.max(13, Math.floor(size * maxW / w));
    signMeasure.font = `${size}px ${SIGN_FONT}`;
    w = signMeasure.measureText(text).width;
    while (w > maxW && text.length > 2) {
      text = text.slice(0, -2) + '\u2026';
      w = signMeasure.measureText(text).width;
    }
  }
  return { text, size, used: Math.min(SIGN_CELL_W, Math.ceil(w + PAD * 2)) };
}

export function signsOverlap(a, b) {
  if (a.nx * b.nx + a.nz * b.nz < 0.9) return false;
  const dx = b.x - a.x, dz = b.z - a.z;
  if (Math.abs(dx * a.nx + dz * a.nz) > 0.3) return false;
  const along = Math.abs(dx * a.nz - dz * a.nx);
  if (along >= a.hw + b.hw + 0.05) return false;
  return Math.abs(b.y - a.y) < (a.h + b.h) / 2 + 0.04;
}

// Place a sign above any already on the wall; false if it runs out of wall or the label is already there.
export function fitSign(sg, placed, eaves) {
  sg.m = signMetrics(sg.text, sg.kind);
  sg.hw = sg.h * (sg.m.used / SIGN_CELL_H) / 2;
  for (let guard = 0; guard < 16; guard++) {
    const hit = placed.find(o => signsOverlap(o, sg));
    if (!hit) return true;
    if (hit.text === sg.text) return false;
    sg.y = hit.y + (hit.h + sg.h) / 2 + 0.08;
    if (sg.y + sg.h / 2 > eaves - 0.05) return false;
  }
  return false;
}

// All labels share one atlas canvas, so a city's signs are one mesh.
export function buildSigns(signs) {
  if (!signs.length) return;

  const rows = Math.ceil(signs.length / SIGN_COLS);
  const cv = document.createElement('canvas');
  cv.width = SIGN_COLS * SIGN_CELL_W;
  cv.height = rows * SIGN_CELL_H;
  const ctx = cv.getContext('2d');
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';

  const buf = { pos: [], uv: [] };
  const PAD = 10;

  for (let i = 0; i < signs.length; i++) {
    const s = signs[i];
    const ox = (i % SIGN_COLS) * SIGN_CELL_W;
    const oy = ((i / SIGN_COLS) | 0) * SIGN_CELL_H;

    const { text, size, used } = s.m;
    ctx.font = `${size}px ${SIGN_FONT}`;
    ctx.fillStyle = s.kind === 'number' ? '#e8e4dc' : '#1b1f27';
    ctx.fillRect(ox, oy, used, SIGN_CELL_H);
    ctx.fillStyle = s.kind === 'number' ? '#20242c' : '#e8e4dc';
    ctx.fillText(text, ox + PAD, oy + SIGN_CELL_H / 2);

    const u0 = ox / cv.width, u1 = (ox + used) / cv.width;
    const v1 = 1 - oy / cv.height, v0 = 1 - (oy + SIGN_CELL_H) / cv.height;

    const rx = s.nz, rz = -s.nx;
    const hw = s.hw, hh = s.h / 2;
    const bl = [s.x - rx * hw, s.y - hh, s.z - rz * hw];
    const br = [s.x + rx * hw, s.y - hh, s.z + rz * hw];
    const tr = [s.x + rx * hw, s.y + hh, s.z + rz * hw];
    const tl = [s.x - rx * hw, s.y + hh, s.z - rz * hw];

    buf.pos.push(...bl, ...br, ...tr, ...bl, ...tr, ...tl);
    buf.uv.push(u0, v0, u1, v0, u1, v1, u0, v0, u1, v1, u0, v1);
  }

  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(buf.pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(buf.uv, 2));
  g.computeVertexNormals();
  g.computeBoundingSphere();

  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = renderer.capabilities.getMaxAnisotropy();

  const mesh = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ map: tex }));
  scene.add(mesh);
  layers.push(mesh);
  invalidate();
}

// Grocery stores, hospitals and the rest; `entry` is the building's doorway, a reachable point.
export const places = {
  list: [],                      // { x, z, kind, name, building, entry }
  byKind: {},

  build(features) {
    this.list.length = 0;
    this.byKind = {};
    for (const kind of Object.keys(PLACE_KINDS)) this.byKind[kind] = [];
    const seen = new Set();
    for (const p of features.places) {
      const building = shellAt(p.x, p.z);
      // one entry per kind per building: a node and its outline often both map it
      if (building >= 0) {
        const key = `${p.kind}:${building}`;
        if (seen.has(key)) continue;
        seen.add(key);
      }
      const t = building >= 0 ? collision.shells[building].throat : null;
      const entry = t ? [t[0], t[1]] : null;
      this.list.push({ x: p.x, z: p.z, kind: p.kind, name: p.name || null, building, entry });
      this.byKind[p.kind].push(entry || [p.x, p.z]);
    }
  }
};

export const foodBoxes = {
  list: [],                      // crates: { position: { x, y, z }, kind, spot, slot, i, _k }; spot is null outdoors
  spots: [],                     // one per place: { kind, slots: [[x, y, z]], used: [crate or null] }
  mesh: null,
  city: null,                    // the CityWorld, for outdoor points
  dirty: false,                  // a crate moved since the last render
  sight: null,                   // the crates for vision and contact queries (buildSight, per world)
  _shown: [],          // crate indexes drawn last render (foodBoxView)

  // After places.build and buildSidewalks: needs the shells, floors and sidewalks.
  build(city) {
    this.clear();
    this.city = city;
    const perShell = new Map();
    for (const p of places.list) {
      if (!FOOD_BOX_KINDS[p.kind]) continue;
      const slots = [];
      const add = (x, z) => {
        const i = shellAt(x, z);
        const floor = i >= 0 && !collision.shells[i].raised ? collision.shells[i].floor + FLOOR_Y : elevation.at(x, z);
        slots.push([x, floor + FOOD_BOX_SIZE / 2, z]);
      };
      const s = p.building >= 0 ? collision.shells[p.building] : null;
      const t = s ? s.throat : null;
      if (t) {
        // just inside the door, alternating sides, so the doorway stays clear
        const n0 = perShell.get(p.building) || 0;
        perShell.set(p.building, n0 + FOOD_BOX_SLOTS);
        const dx = t[2] - t[0], dz = t[3] - t[1], L = Math.hypot(dx, dz) || 1;
        const ux = dx / L, uz = dz / L;
        for (let k = 0; k < FOOD_BOX_SLOTS; k++) {
          const n = n0 + k;
          const side = (n % 2 ? -1 : 1) * (1.2 + Math.floor(n / 2) * 0.9);
          const bx = t[2] + ux * 1.4 - uz * side, bz = t[3] + uz * 1.4 + ux * side;
          if (pointInShell(s, bx, bz)) add(bx, bz);
        }
        if (!slots.length && pointInShell(s, t[2] + ux * 0.9, t[3] + uz * 0.9)) add(t[2] + ux * 0.9, t[3] + uz * 0.9);
      }
      // no usable doorway: a short row at the mapped point
      if (!slots.length) {
        for (let k = 0; k < FOOD_BOX_SLOTS; k++) add(p.x + (k % 2 ? -1 : 1) * Math.ceil(k / 2) * 0.9, p.z);
      }
      const spot = { kind: p.kind, slots, used: new Array(slots.length).fill(null) };
      this.spots.push(spot);
      const crate = { position: { x: 0, y: 0, z: 0 }, kind: p.kind, spot: null, slot: 0, i: this.list.length, _k: -1 };
      if (!this.putOutdoors(crate)) this.put(crate, spot, 0);
      this.list.push(crate);
    }
    this.draw();
  },

  // A dry point in the city that is not inside a building, mostly along sidewalks; null if none turns up.
  outdoorPoint() {
    const c = this.city, b = c.bounds;
    for (let k = 0; k < 20; k++) {
      const q = c.segs.length && Math.random() < 0.8 ? c.sidewalkPoint() : c.anyPoint();
      if (q[0] < b.minX || q[0] > b.maxX || q[1] < b.minZ || q[1] > b.maxZ) continue;
      if (shellAt(q[0], q[1]) >= 0 || c.isWater(q[0], q[1])) continue;
      return q;
    }
    return null;
  },

  // Rolls the outdoor chance; true when the crate was set down outdoors.
  putOutdoors(crate) {
    if (Math.random() >= FOOD_BOX_OUTDOOR_CHANCE) return false;
    const q = this.outdoorPoint();
    if (!q) return false;
    crate.position.x = q[0]; crate.position.y = elevation.at(q[0], q[1]) + FOOD_BOX_SIZE / 2; crate.position.z = q[1];
    crate.spot = null; crate.slot = 0; crate.kind = 'outdoor';
    return true;
  },

  put(crate, spot, slot) {
    const q = spot.slots[slot];
    crate.position.x = q[0]; crate.position.y = q[1]; crate.position.z = q[2];
    crate.spot = spot; crate.slot = slot; crate.kind = spot.kind;
    spot.used[slot] = crate;
  },

  // One instanced mesh, kept in `layers` so clearLayers frees it with the city.
  draw() {
    if (!this.list.length) return;
    const g = new THREE.BoxGeometry(FOOD_BOX_SIZE, FOOD_BOX_SIZE, FOOD_BOX_SIZE);
    const m = new THREE.MeshLambertMaterial({ color: 0x7a5230 });
    const mesh = new THREE.InstancedMesh(g, m, this.list.length);
    // culled per crate in render(), like the animals, so three's whole-mesh test is off
    mesh.frustumCulled = false;
    mesh.count = 0;
    scene.add(mesh);
    layers.push(mesh);
    this.mesh = mesh;
    this._shown.length = 0;
    this.dirty = true;
  },

  // The crates' sight grid over the ecosystem's span (initialize builds it once the provider is known).
  buildSight(spanX, spanZ) {
    this.sight = new SpatialGrid(spanX, spanZ, WATER_SIGHT_CELL);
    for (const b of this.list) b._k = this.sight.insert(b);
  },

  // The crate (x, z) at height y is touching, or null; `out` is a scratch array.
  touching(out, x, y, z) {
    const grid = this.sight;
    if (!grid || !this.list.length) return null;
    const n = grid.queryInto(out, x, z, FOOD_BOX_REACH);
    for (let i = 0; i < n; i++) {
      const q = out[i].position;
      if (Math.abs(q.y - y) > FOOD_BOX_HEIGHT) continue;
      if (tools.distSq(x, z, q.x, q.z) < FOOD_BOX_REACH * FOOD_BOX_REACH) return out[i];
    }
    return null;
  },

  // Eaten: move the crate outdoors (by chance) or to a free slot at a different place, picked at random.
  eat(crate) {
    const from = crate.spot, fromSlot = crate.slot;
    const grid = this.sight;
    if (grid && crate._k >= 0) grid.remove(crate, crate._k);
    if (this.putOutdoors(crate)) {
      if (from) from.used[fromSlot] = null;
    } else {
      const n = this.spots.length, start = Math.floor(Math.random() * n);
      let to = null, slot = -1;
      for (let j = 0; j < n && !to; j++) {
        const sp = this.spots[(start + j) % n];
        if (sp === from) continue;
        const k = sp.used.indexOf(null);
        if (k >= 0) { to = sp; slot = k; }
      }
      // nowhere else to go (a single place): the crate stays put
      if (to) {
        if (from) from.used[fromSlot] = null;
        this.put(crate, to, slot);
      }
    }
    if (grid) crate._k = grid.insert(crate);
    this.dirty = true;
  },

  clear() { this.list.length = 0; this.spots.length = 0; this.mesh = null; this.city = null; }
};

// WATER CLIP: ground fragments over painted water are discarded (shore cells kept), so ground never pokes through it.
export const waterClip = {
  WET_MIN: 2,                    // shore distance (half cells) above which the ground is cut away
  dry: null, tex: null,
  uniforms: { uWetMap: { value: null }, uWetRect: { value: new THREE.Vector4(0, 0, 0, 0) } },

  reset() {
    if (this.tex) { this.tex.dispose(); this.tex = null; }
    if (!this.dry) {
      this.dry = new THREE.DataTexture(new Uint8Array([0]), 1, 1, THREE.RedFormat);
      this.dry.needsUpdate = true;
    }
    this.uniforms.uWetMap.value = this.dry;
    this.uniforms.uWetRect.value.set(0, 0, 0, 0);
  },

  // from cityWater once its shore distances are built
  set(w) {
    this.reset();
    if (!w.cols || !w.rows) return;
    const data = new Uint8Array(w.cols * w.rows);
    let any = false;
    for (let i = 0; i < data.length; i++) if (w.dist[i] > this.WET_MIN) { data[i] = 255; any = true; }
    if (!any) return;
    const tex = new THREE.DataTexture(data, w.cols, w.rows, THREE.RedFormat);
    tex.unpackAlignment = 1;
    tex.minFilter = tex.magFilter = THREE.NearestFilter;
    tex.needsUpdate = true;
    this.tex = tex;
    this.uniforms.uWetMap.value = tex;
    this.uniforms.uWetRect.value.set(w.x0, w.z0, 1 / (w.cols * WATER_CELL), 1 / (w.rows * WATER_CELL));
  },

  // Adds the discard to a built-in material, keeping any onBeforeCompile it already has.
  apply(mat) {
    if (!this.uniforms.uWetMap.value) this.reset();
    const prev = mat.onBeforeCompile;
    const u = this.uniforms;
    mat.onBeforeCompile = (sh, r) => {
      prev.call(mat, sh, r);
      sh.uniforms.uWetMap = u.uWetMap;
      sh.uniforms.uWetRect = u.uWetRect;
      sh.vertexShader = 'varying vec2 vWetXZ;\n' + sh.vertexShader.replace('#include <begin_vertex>',
        '#include <begin_vertex>\n  vWetXZ = (modelMatrix * vec4(transformed, 1.0)).xz;');
      sh.fragmentShader = 'uniform sampler2D uWetMap;\nuniform vec4 uWetRect;\nvarying vec2 vWetXZ;\n' +
        sh.fragmentShader.replace('#include <map_fragment>', `#include <map_fragment>
  {
    vec2 wuv = (vWetXZ - uWetRect.xy) * uWetRect.zw;
    if (wuv.x > 0.0 && wuv.y > 0.0 && wuv.x < 1.0 && wuv.y < 1.0 && texture2D(uWetMap, wuv).r > 0.5) discard;
  }`);
    };
    mat.customProgramCacheKey = () => 'wetclip|' + prev.toString();
    return mat;
  }
};
export const indoorClip = {
  empty: null, tex: null, data: null, x0: 0, z0: 0, cols: 0, rows: 0, cell: INDOOR_CELL,
  uniforms: { uIndoorMap: { value: null }, uIndoorRect: { value: new THREE.Vector4(0, 0, 0, 0) } },

  reset() {
    if (this.tex) { this.tex.dispose(); this.tex = null; }
    if (!this.empty) {
      this.empty = new THREE.DataTexture(new Uint8Array([0]), 1, 1, THREE.RedFormat);
      this.empty.needsUpdate = true;
    }
    this.data = null; this.cols = this.rows = 0;
    this.uniforms.uIndoorMap.value = this.empty;
    this.uniforms.uIndoorRect.value.set(0, 0, 0, 0);
  },

  // a mask over every building's bounds, coarsened if needed to fit the GPU's texture limit
  begin(list) {
    this.reset();
    if (!list.length) return;
    let minX = Infinity, minZ = Infinity, maxX = -Infinity, maxZ = -Infinity;
    for (const s of list) {
      if (s.minX < minX) minX = s.minX; if (s.maxX > maxX) maxX = s.maxX;
      if (s.minZ < minZ) minZ = s.minZ; if (s.maxZ > maxZ) maxZ = s.maxZ;
    }
    const lim = renderer.capabilities.maxTextureSize;
    const cell = Math.max(INDOOR_CELL, (maxX - minX + 2) / lim, (maxZ - minZ + 2) / lim);
    this.cell = cell;
    this.x0 = minX - 1; this.z0 = minZ - 1;
    this.cols = Math.min(lim, Math.ceil((maxX - minX + 2) / cell));
    this.rows = Math.min(lim, Math.ceil((maxZ - minZ + 2) / cell));
    this.data = new Uint8Array(this.cols * this.rows);
  },

  // even-odd scanline fill of one building's inner outline and its courtyard outlines
  fill(rings) {
    if (!this.data) return;
    let zMin = Infinity, zMax = -Infinity;
    for (const p of rings[0]) { if (p[1] < zMin) zMin = p[1]; if (p[1] > zMax) zMax = p[1]; }
    const cell = this.cell, cols = this.cols;
    const r0 = Math.max(0, Math.floor((zMin - this.z0) / cell));
    const r1 = Math.min(this.rows - 1, Math.floor((zMax - this.z0) / cell));
    const xs = [];
    for (let r = r0; r <= r1; r++) {
      const zc = this.z0 + (r + 0.5) * cell;
      xs.length = 0;
      for (const pts of rings) {
        for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
          const xi = pts[i][0], zi = pts[i][1], xj = pts[j][0], zj = pts[j][1];
          if ((zi > zc) !== (zj > zc)) xs.push(xi + (zc - zi) * (xj - xi) / (zj - zi));
        }
      }
      xs.sort((a, b) => a - b);
      const row = r * cols;
      for (let k = 0; k + 1 < xs.length; k += 2) {
        const c0 = Math.max(0, Math.ceil((xs[k] - this.x0) / cell - 0.5));
        const c1 = Math.min(cols - 1, Math.floor((xs[k + 1] - this.x0) / cell - 0.5));
        for (let c = c0; c <= c1; c++) this.data[row + c] = 255;
      }
    }
  },

  finish() {
    if (!this.data) return;
    const tex = new THREE.DataTexture(this.data, this.cols, this.rows, THREE.RedFormat);
    tex.unpackAlignment = 1;
    tex.minFilter = tex.magFilter = THREE.NearestFilter;
    tex.needsUpdate = true;
    this.tex = tex;
    this.uniforms.uIndoorMap.value = tex;
    this.uniforms.uIndoorRect.value.set(this.x0, this.z0, 1 / (this.cols * this.cell), 1 / (this.rows * this.cell));
    this.data = null;
  },

  // Adds the discard to a built-in material, keeping any onBeforeCompile it already has.
  apply(mat) {
    if (!this.uniforms.uIndoorMap.value) this.reset();
    const prev = mat.onBeforeCompile, prevKey = mat.customProgramCacheKey;
    const u = this.uniforms;
    mat.onBeforeCompile = (sh, r) => {
      prev.call(mat, sh, r);
      sh.uniforms.uIndoorMap = u.uIndoorMap;
      sh.uniforms.uIndoorRect = u.uIndoorRect;
      sh.vertexShader = 'varying vec2 vIndoorXZ;\n' + sh.vertexShader.replace('#include <begin_vertex>',
        '#include <begin_vertex>\n  vIndoorXZ = (modelMatrix * vec4(transformed, 1.0)).xz;');
      sh.fragmentShader = 'uniform sampler2D uIndoorMap;\nuniform vec4 uIndoorRect;\nvarying vec2 vIndoorXZ;\n' +
        sh.fragmentShader.replace('#include <map_fragment>', `#include <map_fragment>
  {
    vec2 iuv = (vIndoorXZ - uIndoorRect.xy) * uIndoorRect.zw;
    if (iuv.x > 0.0 && iuv.y > 0.0 && iuv.x < 1.0 && iuv.y < 1.0 && texture2D(uIndoorMap, iuv).r > 0.5) discard;
  }`);
    };
    mat.customProgramCacheKey = () => prevKey.call(mat) + '|indoor';
    return mat;
  }
};

// Painted water in a 1 m mask with roads stamped dry (bridges); its bed deepens from the shore up to MAX_DEPTH.
export const cityWater = {
  MAX_DEPTH: 4,                  // metres of water at the deepest
  SHORE_SLOPE: 0.35,
  BED_SINK: 0.05,
  BED_STEP: 2,                   // metres between bed mesh vertices
  BED_MAX_TRIS: 300000,
  BED_COLOR: 0x4b5a48,
  locations: [],
  mask: new Uint8Array(0), x0: 0, z0: 0, cols: 0, rows: 0,
  // Chamfer distance to shore in half cells (0 = dry), from water before roads were stamped, so beds run under bridges.
  dist: new Uint8Array(0),

  reset() { this.clear(); },   // teardownWorld's entry
  clear() {
    this.mask = new Uint8Array(0); this.dist = new Uint8Array(0); this.cols = this.rows = 0; this.locations = [];
  },

  wetAt(x, z) {
    const c = Math.floor((x - this.x0) / WATER_CELL);
    const r = Math.floor((z - this.z0) / WATER_CELL);
    if (c < 0 || r < 0 || c >= this.cols || r >= this.rows) return false;
    return this.mask[r * this.cols + c] === 1;
  },

  // depth of one cell centre; dry cells and cells off the grid are 0
  cellDepth(c, r) {
    if (c < 0 || r < 0 || c >= this.cols || r >= this.rows) return 0;
    const v = this.dist[r * this.cols + c];
    return v ? Math.min(this.MAX_DEPTH, (v * 0.5 - 0.5) * this.SHORE_SLOPE) : 0;
  },

  // depth of the bed under the surface, bilinear between cell centres (ignores bridges)
  bedDepthAt(x, z) {
    if (!this.dist.length) return 0;
    const fx = (x - this.x0) / WATER_CELL - 0.5, fz = (z - this.z0) / WATER_CELL - 0.5;
    const c = Math.floor(fx), r = Math.floor(fz), tx = fx - c, tz = fz - r;
    const a = this.cellDepth(c, r), b = this.cellDepth(c + 1, r);
    const d = this.cellDepth(c, r + 1), e = this.cellDepth(c + 1, r + 1);
    const top = a + (b - a) * tx, bot = d + (e - d) * tx;
    return top + (bot - top) * tz;
  },

  // water depth at a point: 0 on land and on bridges
  depthAt(x, z) { return this.wetAt(x, z) ? this.bedDepthAt(x, z) : 0; },

  build(features, minX, minZ, maxX, maxZ) {
    this.x0 = minX; this.z0 = minZ;
    this.cols = Math.ceil((maxX - minX) / WATER_CELL);
    this.rows = Math.ceil((maxZ - minZ) / WATER_CELL);
    this.mask = new Uint8Array(this.cols * this.rows);

    for (const a of features.areas) {
      if (a.kind === 'water' || a.kind === 'basin' || a.kind === 'reservoir') this.fillRing(a.pts);
    }
    for (const w of features.waterways) this.stampLine(w.pts, w.width / 2, 1);
    this.buildDist();
    for (const r of features.roads) this.stampLine(r.pts, (r.width ?? ROAD_WIDTH[r.kind]) / 2, 0);

    // perception targets: coarse, capped sample of wet cells
    const pts = [];
    const every = 10;
    for (let r = every >> 1; r < this.rows; r += every) {
      for (let c = every >> 1; c < this.cols; c += every) {
        if (this.mask[r * this.cols + c]) {
          const x = this.x0 + (c + 0.5) * WATER_CELL, z = this.z0 + (r + 0.5) * WATER_CELL;
          pts.push([x, z, elevation.at(x, z)]);
        }
      }
    }
    const cap = 400;
    const stride = Math.max(1, Math.ceil(pts.length / cap));
    this.locations = stride === 1 ? pts : pts.filter((_, i) => i % stride === 0);
  },

  // Two-pass chamfer distance (2 straight, 3 diagonal) to the nearest dry cell; off-grid is dry, so water shoals at edges.
  buildDist() {
    const cols = this.cols, rows = this.rows, m = this.mask;
    const d = this.dist = new Uint8Array(cols * rows);
    for (let i = 0; i < d.length; i++) d[i] = m[i] ? 255 : 0;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const i = r * cols + c;
        if (!d[i]) continue;
        const up = r > 0, lf = c > 0, rt = c < cols - 1;
        let v = d[i];
        v = Math.min(v, (lf ? d[i - 1] : 0) + 2, (up ? d[i - cols] : 0) + 2,
          (up && lf ? d[i - cols - 1] : 0) + 3, (up && rt ? d[i - cols + 1] : 0) + 3);
        d[i] = v;
      }
    }
    for (let r = rows - 1; r >= 0; r--) {
      for (let c = cols - 1; c >= 0; c--) {
        const i = r * cols + c;
        if (!d[i]) continue;
        const dn = r < rows - 1, lf = c > 0, rt = c < cols - 1;
        let v = d[i];
        v = Math.min(v, (rt ? d[i + 1] : 0) + 2, (dn ? d[i + cols] : 0) + 2,
          (dn && rt ? d[i + cols + 1] : 0) + 3, (dn && lf ? d[i + cols - 1] : 0) + 3);
        d[i] = v;
      }
    }
  },

  // LEVEL WATER: each mapped water body and the ground under it go to mid height, banks eased to BANK_SLOPE; on a copy.
  BANK_SLOPE: 0.5,
  LEVEL_MARGIN: 1.5,             // metres past a wet cell's centre that must also be level (cell size, outline)
  levelGround(features, h) {
    if (!elevation.active || !elevation.data) return 0;
    const wm = Object.create(this);
    wm.x0 = -h; wm.z0 = -h;
    wm.cols = wm.rows = Math.ceil(2 * h / WATER_CELL);
    wm.mask = new Uint8Array(wm.cols * wm.rows);
    for (const a of features.areas) {
      if (a.kind === 'water' || a.kind === 'basin' || a.kind === 'reservoir') wm.fillRing(a.pts);
    }

    // height nodes whose grid squares the water (plus margin) touches
    const n = elevation.n, st = elevation.step, half = elevation.half, last = n - 1, M = this.LEVEL_MARGIN;
    const flat = new Uint8Array(n * n);
    const node = v => { const i = Math.floor((v + half) / st); return i < 0 ? 0 : i > last ? last : i; };
    let any = false;
    for (let r = 0; r < wm.rows; r++) {
      const row = r * wm.cols, z = wm.z0 + (r + 0.5) * WATER_CELL;
      const j0 = node(z - M), j1 = Math.min(last, node(z + M) + 1);
      for (let c = 0; c < wm.cols; c++) {
        if (!wm.mask[row + c]) continue;
        const x = wm.x0 + (c + 0.5) * WATER_CELL;
        const i0 = node(x - M), i1 = Math.min(last, node(x + M) + 1);
        for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) flat[j * n + i] = 1;
        any = true;
      }
    }
    if (!any) return 0;

    const data = elevation.data = elevation.data.slice();
    const NX = [-1, 1, 0, 0, -1, 1, -1, 1], NZ = [0, 0, -1, 1, -1, -1, 1, 1];
    // one level per connected body: midway between its lowest and highest node
    const queue = [];
    let bodies = 0;
    for (let k0 = 0; k0 < flat.length; k0++) {
      if (flat[k0] !== 1) continue;
      const members = [k0];
      flat[k0] = 2;
      let low = data[k0], high = data[k0];
      for (let q = 0; q < members.length; q++) {
        const k = members[q], i = k % n, j = (k - i) / n;
        if (data[k] < low) low = data[k];
        if (data[k] > high) high = data[k];
        for (let d = 0; d < 8; d++) {
          const a = i + NX[d], b = j + NZ[d];
          if (a < 0 || b < 0 || a > last || b > last) continue;
          const m = b * n + a;
          if (flat[m] === 1) { flat[m] = 2; members.push(m); }
        }
      }
      const level = (low + high) / 2;
      for (const k of members) { data[k] = level; queue.push(k); }
      bodies++;
    }

    // Banks: one pass down and one up, moving any node steeper than BANK_SLOPE above (then below) a moved neighbour.
    for (const sign of [1, -1]) {
      const work = queue.slice();
      for (let q = 0; q < work.length; q++) {
        const k = work[q], i = k % n, j = (k - i) / n;
        for (let d = 0; d < 8; d++) {
          const a = i + NX[d], b = j + NZ[d];
          if (a < 0 || b < 0 || a > last || b > last) continue;
          const m = b * n + a;
          if (flat[m]) continue;
          const lim = data[k] + sign * st * (d < 4 ? 1 : Math.SQRT2) * this.BANK_SLOPE;
          if ((data[m] - lim) * sign > 1e-4) { data[m] = lim; work.push(m); }
        }
      }
    }

    let min = Infinity, max = -Infinity;
    for (let k = 0; k < data.length; k++) { if (data[k] < min) min = data[k]; if (data[k] > max) max = data[k]; }
    elevation.min = min; elevation.max = max;
    return bodies;
  },

  // The bed under painted water: one mesh over every wet BED_STEP cell, shore at ground; returns { geometry, minY } or null.
  bedGeometry() {
    const d = this.dist, cols = this.cols, rows = this.rows;
    if (!d.length) return null;
    let c0 = Infinity, c1 = -1, r0 = Infinity, r1 = -1, wetCells = 0;
    for (let r = 0; r < rows; r++) {
      const row = r * cols;
      for (let c = 0; c < cols; c++) {
        if (!d[row + c]) continue;
        wetCells++;
        if (c < c0) c0 = c; if (c > c1) c1 = c;
        if (r < r0) r0 = r; if (r > r1) r1 = r;
      }
    }
    if (c1 < 0) return null;

    // coarser over very large water, so the bed stays near BED_MAX_TRIS triangles
    const s = Math.max(this.BED_STEP, Math.sqrt(2 * wetCells * WATER_CELL * WATER_CELL / this.BED_MAX_TRIS));
    const xa = this.x0 + c0 * WATER_CELL - s, za = this.z0 + r0 * WATER_CELL - s;
    const nx = Math.ceil((this.x0 + (c1 + 1) * WATER_CELL + s - xa) / s);
    const nz = Math.ceil((this.z0 + (r1 + 1) * WATER_CELL + s - za) / s);
    const wet = (x, z) => {
      const c = Math.floor((x - this.x0) / WATER_CELL), r = Math.floor((z - this.z0) / WATER_CELL);
      return c >= 0 && r >= 0 && c < cols && r < rows && d[r * cols + c] > 0;
    };

    const vid = new Int32Array((nx + 1) * (nz + 1)).fill(-1);
    const pos = [], idx = [];
    let minY = Infinity;
    const vert = (i, j) => {
      const k = j * (nx + 1) + i;
      if (vid[k] < 0) {
        const x = xa + i * s, z = za + j * s;
        const y = elevation.at(x, z) - this.BED_SINK - this.bedDepthAt(x, z);
        if (y < minY) minY = y;
        vid[k] = pos.length / 3;
        pos.push(x, y, z);
      }
      return vid[k];
    };
    for (let j = 0; j < nz; j++) {
      for (let i = 0; i < nx; i++) {
        const x = xa + i * s, z = za + j * s, h = s / 2;
        if (!(wet(x + h, z + h) || wet(x + 0.25, z + 0.25) || wet(x + s - 0.25, z + 0.25) ||
          wet(x + 0.25, z + s - 0.25) || wet(x + s - 0.25, z + s - 0.25))) continue;
        const a = vert(i, j), b = vert(i + 1, j), c = vert(i + 1, j + 1), e = vert(i, j + 1);
        idx.push(a, e, c, a, c, b);
      }
    }
    if (!idx.length) return null;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pos), 3));
    g.setIndex(new THREE.BufferAttribute(new Uint32Array(idx), 1));
    g.computeVertexNormals();
    g.computeBoundingSphere();
    return { geometry: g, minY };
  },

  fillRing(pts) {
    let zMin = Infinity, zMax = -Infinity;
    for (const p of pts) { if (p[1] < zMin) zMin = p[1]; if (p[1] > zMax) zMax = p[1]; }
    const r0 = Math.max(0, Math.floor((zMin - this.z0) / WATER_CELL));
    const r1 = Math.min(this.rows - 1, Math.floor((zMax - this.z0) / WATER_CELL));
    const xs = [];
    for (let r = r0; r <= r1; r++) {
      const zc = this.z0 + (r + 0.5) * WATER_CELL;
      xs.length = 0;
      for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
        const [xi, zi] = pts[i], [xj, zj] = pts[j];
        if ((zi > zc) !== (zj > zc)) xs.push(xi + (zc - zi) * (xj - xi) / (zj - zi));
      }
      xs.sort((a, b) => a - b);
      const row = r * this.cols;
      for (let k = 0; k + 1 < xs.length; k += 2) {
        const c0 = Math.max(0, Math.ceil((xs[k] - this.x0) / WATER_CELL - 0.5));
        const c1 = Math.min(this.cols - 1, Math.floor((xs[k + 1] - this.x0) / WATER_CELL - 0.5));
        for (let c = c0; c <= c1; c++) this.mask[row + c] = 1;
      }
    }
  },

  stampLine(pts, half, v) {
    for (let i = 0; i < pts.length - 1; i++) {
      const [x0, z0] = pts[i], [x1, z1] = pts[i + 1];
      const dx = x1 - x0, dz = z1 - z0, l2 = dx * dx + dz * dz;
      const c0 = Math.max(0, Math.floor((Math.min(x0, x1) - half - this.x0) / WATER_CELL));
      const c1 = Math.min(this.cols - 1, Math.floor((Math.max(x0, x1) + half - this.x0) / WATER_CELL));
      const r0 = Math.max(0, Math.floor((Math.min(z0, z1) - half - this.z0) / WATER_CELL));
      const r1 = Math.min(this.rows - 1, Math.floor((Math.max(z0, z1) + half - this.z0) / WATER_CELL));
      for (let r = r0; r <= r1; r++) {
        const zc = this.z0 + (r + 0.5) * WATER_CELL;
        for (let c = c0; c <= c1; c++) {
          const xc = this.x0 + (c + 0.5) * WATER_CELL;
          let t = l2 > 0 ? ((xc - x0) * dx + (zc - z0) * dz) / l2 : 0;
          t = t < 0 ? 0 : t > 1 ? 1 : t;
          const ex = xc - (x0 + dx * t), ez = zc - (z0 + dz * t);
          if (ex * ex + ez * ez <= half * half) this.mask[r * this.cols + c] = v;
        }
      }
    }
  }
};
export const LAMP_COLOR = new THREE.Color(0xffc98a);

// Vehicle-road segments with their road's id, for "is this point on another road" questions.
export function vehicleRoadIndex(roads) {
  const segs = [];
  let reach = 0;
  for (let id = 0; id < roads.length; id++) {
    const r = roads[id];
    if (PATH_KINDS.has(r.kind)) continue;
    const half = (r.width ?? ROAD_WIDTH[r.kind]) / 2;
    if (half > reach) reach = half;
    for (let i = 0; i < r.pts.length - 1; i++) {
      const [x0, z0] = r.pts[i], [x1, z1] = r.pts[i + 1];
      segs.push({
        x0, z0, x1, z1, half, id,
        minX: Math.min(x0, x1), maxX: Math.max(x0, x1), minZ: Math.min(z0, z1), maxZ: Math.max(z0, z1)
      });
    }
  }
  return { segs, grid: gridOf(segs, ROAD_CELL), reach };
}

// Signed distance from (x, z) to the nearest carriageway edge of a road other than `skip` (negative inside),
// looking within maxR of an edge; Infinity if none. The centreline point measured to is left in roadGapAt.
export const roadGapAt = { x: 0, z: 0 };
export function roadGap(idx, x, z, maxR, skip = -1) {
  let best = Infinity;
  const r = maxR + idx.reach;
  const cx0 = Math.floor((x - r) / ROAD_CELL), cx1 = Math.floor((x + r) / ROAD_CELL);
  const cz0 = Math.floor((z - r) / ROAD_CELL), cz1 = Math.floor((z + r) / ROAD_CELL);
  for (let cx = cx0; cx <= cx1; cx++) {
    for (let cz = cz0; cz <= cz1; cz++) {
      const bucket = idx.grid.get(cellKey(cx, cz));
      if (!bucket) continue;
      for (const k of bucket) {
        const s = idx.segs[k];
        if (s.id === skip) continue;
        const dx = s.x1 - s.x0, dz = s.z1 - s.z0, l2 = dx * dx + dz * dz;
        let t = l2 > 0 ? ((x - s.x0) * dx + (z - s.z0) * dz) / l2 : 0;
        t = t < 0 ? 0 : t > 1 ? 1 : t;
        const px = s.x0 + dx * t, pz = s.z0 + dz * t;
        const g = Math.hypot(x - px, z - pz) - s.half;
        if (g <= maxR && g < best) { best = g; roadGapAt.x = px; roadGapAt.z = pz; }
      }
    }
  }
  return best;
}

// LAMP LIGHT: a ground light map (sum of every lamp's falloff) that lit ground materials add, scaled by night.
export const lampLight = {
  dark: null, tex: null,
  uniforms: {
    uLampMap: { value: null }, uLampRect: { value: new THREE.Vector4(0, 0, 0, 0) },
    uLampGlow: { value: 0 }, uLampColor: { value: LAMP_COLOR.clone().multiplyScalar(LAMP_GAIN) }
  },

  reset() {
    if (this.tex) { this.tex.dispose(); this.tex = null; }
    if (!this.dark) {
      this.dark = new THREE.DataTexture(new Uint8Array([0]), 1, 1, THREE.RedFormat);
      this.dark.needsUpdate = true;
    }
    this.uniforms.uLampMap.value = this.dark;
    this.uniforms.uLampRect.value.set(0, 0, 0, 0);
  },

  // heads: [[x, z], ...]; the map covers [-h, h] square
  build(heads, h) {
    this.reset();
    if (!heads.length) return;
    const cell = LAMP_MAP_CELL, n = Math.ceil(2 * h / cell), x0 = -h, z0 = -h;
    const acc = new Float32Array(n * n), R = LAMP_REACH;
    for (const [hx, hz] of heads) {
      const c0 = Math.max(0, Math.floor((hx - R - x0) / cell)), c1 = Math.min(n - 1, Math.floor((hx + R - x0) / cell));
      const r0 = Math.max(0, Math.floor((hz - R - z0) / cell)), r1 = Math.min(n - 1, Math.floor((hz + R - z0) / cell));
      for (let r = r0; r <= r1; r++) {
        const z = z0 + (r + 0.5) * cell;
        for (let c = c0; c <= c1; c++) {
          const x = x0 + (c + 0.5) * cell;
          const q = 1 - ((x - hx) ** 2 + (z - hz) ** 2) / (R * R);
          if (q > 0) acc[r * n + c] += q * q;
        }
      }
    }
    const data = new Uint8Array(n * n);
    for (let i = 0; i < data.length; i++) data[i] = Math.round(Math.min(1, acc[i]) * 255);
    const tex = new THREE.DataTexture(data, n, n, THREE.RedFormat);
    tex.unpackAlignment = 1;
    tex.minFilter = tex.magFilter = THREE.LinearFilter;
    tex.needsUpdate = true;
    this.tex = tex;
    this.uniforms.uLampMap.value = tex;
    this.uniforms.uLampRect.value.set(x0, z0, 1 / (n * cell), 1 / (n * cell));
  },

  // Adds lamp light to a built-in lit material, keeping any onBeforeCompile it already has (waterClip's).
  apply(mat) {
    if (!this.uniforms.uLampMap.value) this.reset();
    const prev = mat.onBeforeCompile, prevKey = mat.customProgramCacheKey;
    const u = this.uniforms;
    mat.onBeforeCompile = (sh, r) => {
      prev.call(mat, sh, r);
      sh.uniforms.uLampMap = u.uLampMap;
      sh.uniforms.uLampRect = u.uLampRect;
      sh.uniforms.uLampGlow = u.uLampGlow;
      sh.uniforms.uLampColor = u.uLampColor;
      sh.vertexShader = 'varying vec2 vLampXZ;\n' + sh.vertexShader.replace('#include <begin_vertex>',
        '#include <begin_vertex>\n  vLampXZ = (modelMatrix * vec4(transformed, 1.0)).xz;');
      sh.fragmentShader = 'uniform sampler2D uLampMap;\nuniform vec4 uLampRect;\nuniform float uLampGlow;\n' +
        'uniform vec3 uLampColor;\nvarying vec2 vLampXZ;\n' +
        sh.fragmentShader.replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
  if (uLampGlow > 0.0) {
    vec2 luv = (vLampXZ - uLampRect.xy) * uLampRect.zw;
    if (luv.x > 0.0 && luv.y > 0.0 && luv.x < 1.0 && luv.y < 1.0)
      totalEmissiveRadiance += diffuseColor.rgb * uLampColor * (uLampGlow * texture2D(uLampMap, luv).r);
  }`);
    };
    mat.customProgramCacheKey = () => prevKey.call(mat) + '|lamplit';
    return mat;
  }
};

// Halo sprite texture for lamp heads at night.
export function haloTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.25, 'rgba(255,255,255,0.55)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}

// One parked-car body, sized like the player's car; paint parts are white so the instance colour paints them.
export let parkedCarGeom = null;
export function parkedCarGeometry() {
  if (parkedCarGeom) return parkedCarGeom;
  const S = CAR_SCALE, LEN = CAR_LEN / S, WID = CAR_WID / S, WB = CAR_WHEELBASE / S;
  const TRACK = CAR_TRACK / S, WR = CAR_WHEEL_R / S;
  const paint = [1, 1, 1], glass = [0.05, 0.06, 0.07], trim = [0.08, 0.08, 0.09], tyre = [0.03, 0.03, 0.03];
  const parts = [
    box(WID, 0.62, LEN, 0, 0.62, 0, 0, paint),
    box(WID - 0.2, 0.5, 2.2, 0, 1.18, 0.25, 0, glass),
    box(WID - 0.24, 0.05, 2.0, 0, 1.44, 0.25, 0, paint),
    box(WID + 0.02, 0.18, 0.12, 0, 0.42, -LEN / 2, 0, trim),
    box(WID + 0.02, 0.18, 0.12, 0, 0.42, LEN / 2, 0, trim)
  ];
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    const w = new THREE.CylinderGeometry(WR, WR, 0.24, 10);
    w.deleteAttribute('uv');
    w.rotateZ(Math.PI / 2);
    w.translate(sx * TRACK / 2, WR, sz * WB / 2);
    parts.push(tint(nonIndexed(w), tyre));
  }
  parkedCarGeom = mergeGeometries(parts, false);
  for (const g of parts) g.dispose();
  parkedCarGeom.scale(S, S, S);
  return parkedCarGeom;
}

export const streets = {
  half: 0, headMat: null, halo: null,

  reset() { this.clear(); },   // teardownWorld's entry
  clear() {
    this.half = 0;
    this.headMat = null; this.halo = null;
  },

  // Inside the measured square by at least `margin`; past it the ground is the wilderness, not elevation.at
  // (which clamps to the edge), so OSM ways running out of the city would carry street objects into the air.
  inSquare(x, z, margin) {
    const m = this.half - margin;
    return Math.abs(x) <= m && Math.abs(z) <= m;
  },

  // Night factor 0..1 from the sky: ground light, head glow and halos.
  setGlow(g) {
    lampLight.uniforms.uLampGlow.value = g;
    if (this.headMat) this.headMat.emissive.copy(LAMP_COLOR).multiplyScalar(1.4 * g);
    if (this.halo) {
      this.halo.material.opacity = 0.85 * g;
      this.halo.visible = g > 0.02;
    }
  },

  // After cityWater and the shells exist; `h` is the measured square's half-size. Adds solids, layers and cover.
  build(features, h, props) {
    const roads = features.roads;
    this.half = h;
    const vidx = vehicleRoadIndex(roads);

    // doorways, so lamps keep clear of them
    const doors = new Map();
    const doorKey = (x, z) => cellKey(Math.floor(x / LAMP_DOOR_CLEAR), Math.floor(z / LAMP_DOOR_CLEAR));
    for (const s of collision.shells) for (const t of s.throats) {
      const k = doorKey(t[0], t[1]);
      let b = doors.get(k);
      if (!b) doors.set(k, b = []);
      b.push(t[0], t[1]);
    }
    const nearDoor = (x, z) => {
      const cx = Math.floor(x / LAMP_DOOR_CLEAR), cz = Math.floor(z / LAMP_DOOR_CLEAR);
      for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) {
        const b = doors.get(cellKey(cx + i, cz + j));
        if (b) for (let k = 0; k < b.length; k += 2) if (Math.hypot(b[k] - x, b[k + 1] - z) < LAMP_DOOR_CLEAR) return true;
      }
      return false;
    };

    // lamps: mapped ones first, then generated ones that keep LAMP_NEAR from every lamp
    const lamps = [];   // { x, z, ax, az, arm }
    const lampCells = new Map();
    const lampKey = (x, z) => cellKey(Math.floor(x / LAMP_NEAR), Math.floor(z / LAMP_NEAR));
    const nearLamp = (x, z) => {
      const cx = Math.floor(x / LAMP_NEAR), cz = Math.floor(z / LAMP_NEAR);
      for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) {
        const b = lampCells.get(cellKey(cx + i, cz + j));
        if (b) for (const l of b) if (Math.hypot(l.x - x, l.z - z) < LAMP_NEAR) return true;
      }
      return false;
    };
    const addLamp = l => {
      lamps.push(l);
      const k = lampKey(l.x, l.z);
      let b = lampCells.get(k);
      if (!b) lampCells.set(k, b = []);
      b.push(l);
    };
    for (const p of props) {
      if (p.kind !== 'lamp' || !this.inSquare(p.x, p.z, 1)) continue;
      const gap = roadGap(vidx, p.x, p.z, LAMP_ROAD_REACH);
      let ax = 0, az = 0, arm = 0;
      if (gap < Infinity && gap > 0.3) {
        const dx = roadGapAt.x - p.x, dz = roadGapAt.z - p.z, d = Math.hypot(dx, dz);
        if (d > 1e-6) { ax = dx / d; az = dz / d; arm = LAMP_ARM; }
      }
      addLamp({ x: p.x, z: p.z, ax, az, arm });
    }

    const open = (x, z) => this.inSquare(x, z, 1) && roadGap(vidx, x, z, 0) >= 0 && shellAt(x, z) < 0 && !cityWater.wetAt(x, z);

    const cars = [];   // { x, z, yaw }

    // each edge of a curb road, in CURB_PIECE pieces: a piece is clear when its edge points are off other roads,
    // buildings and water; runs of clear pieces take parked cars, and a lamp stands every LAMP_SPACING on one
    for (let id = 0; id < roads.length; id++) {
      const r = roads[id];
      if (!CURB_KINDS.has(r.kind)) continue;
      const half = (r.width ?? ROAD_WIDTH[r.kind]) / 2;
      const parks = PARKING_KINDS.has(r.kind) && half >= PARK_MIN_HALF;

      for (const s of [1, -1]) {
        let dist = 0, lampNext = s > 0 ? LAMP_SPACING / 2 : LAMP_SPACING;

        for (let i = 0; i < r.pts.length - 1; i++) {
          const [x0, z0] = r.pts[i], [x1, z1] = r.pts[i + 1];
          const len = Math.hypot(x1 - x0, z1 - z0);
          if (len < 0.05) continue;
          const ux = (x1 - x0) / len, uz = (z1 - z0) / len;
          const nx = -uz * s, nz = ux * s;
          const n = Math.ceil(len / CURB_PIECE), step = len / n;
          const edge = half + 0.03;
          let runStart = -1;
          const endRun = k => {
            if (parks && runStart >= 0) this.parkRun(cars, vidx, id, r, s, x0, z0, ux, uz, nx, nz, half,
              runStart * step, k * step);
            runStart = -1;
          };

          for (let k = 0; k < n; k++) {
            const ta = k * step, tb = ta + step;
            const clear = open(x0 + ux * ta + nx * edge, z0 + uz * ta + nz * edge) &&
              open(x0 + ux * tb + nx * edge, z0 + uz * tb + nz * edge);
            if (!clear) {
              endRun(k);
              dist += step;
              continue;
            }
            if (runStart < 0) runStart = k;

            // a lamp every LAMP_SPACING just off the road edge, its arm over the road
            if (dist + step / 2 >= lampNext) {
              const t = ta + step / 2, off = half + LAMP_CURB_IN;
              const px = x0 + ux * t + nx * off, pz = z0 + uz * t + nz * off;
              const room = open(px, pz) && open(px + nx * LAMP_CURB_IN, pz + nz * LAMP_CURB_IN);
              if (room && !nearLamp(px, pz) && !nearDoor(px, pz)) addLamp({ x: px, z: pz, ax: -nx, az: -nz, arm: LAMP_ARM });
              while (lampNext <= dist + step) lampNext += LAMP_SPACING;
            }
            dist += step;
          }
          endRun(n);
        }
      }
    }

    this.buildMarkings(roads, vidx);
    const carSolids = this.buildCars(cars);
    const lampSolids = this.buildLamps(lamps, h);
    const solids = carSolids.concat(lampSolids);
    addSolids(solids);
    cover.add(solids);
    return { cars: cars.length, lamps: lamps.length };
  },

  // Parked cars along one curb run [tA, tB] of a segment, evenly spaced slots, each taken with chance PARK_P.
  parkRun(cars, vidx, id, r, s, x0, z0, ux, uz, nx, nz, half, tA, tB) {
    const L = CAR_LEN + PARK_GAP;
    const slots = Math.floor((tB - tA) / L);
    if (slots < 1) return;
    const pad = ((tB - tA) - slots * L) / 2;
    const off = half - CAR_WID / 2 - PARK_CURB_GAP;
    // right-side cars face the way the road runs; left-side cars face back unless the road is one-way
    const fx = s > 0 || r.oneway ? ux : -ux, fz = s > 0 || r.oneway ? uz : -uz;
    const yaw = Math.atan2(-fx, -fz);
    for (let j = 0; j < slots; j++) {
      if (Math.random() >= PARK_P) continue;
      const t = tA + pad + (j + 0.5) * L;
      const x = x0 + ux * t + nx * off, z = z0 + uz * t + nz * off;
      if (!this.inSquare(x, z, CAR_LEN) || cityWater.wetAt(x, z) || shellAt(x, z) >= 0) continue;
      if (roadGap(vidx, x, z, PARK_CLEAR, id) < PARK_CLEAR) continue;
      cars.push({ x, z, yaw });
    }
  },

  // One instanced mesh of parked cars settled on the road; returns their solids.
  buildCars(cars) {
    const solids = [];
    if (!cars.length) return solids;
    const mesh = new THREE.InstancedMesh(parkedCarGeometry(), new THREE.MeshLambertMaterial({ vertexColors: true }), cars.length);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(0, 0, 0, 'YXZ');
    const p = new THREE.Vector3(), one = new THREE.Vector3(1, 1, 1), col = new THREE.Color();
    const hl = CAR_LEN / 2, hw = CAR_WID / 2;
    for (let i = 0; i < cars.length; i++) {
      const c = cars[i];
      const fx = -Math.sin(c.yaw), fz = -Math.cos(c.yaw), rx = Math.cos(c.yaw), rz = -Math.sin(c.yaw);
      const hf = elevation.at(c.x + fx * hl, c.z + fz * hl), hr = elevation.at(c.x - fx * hl, c.z - fz * hl);
      const y = (hf + hr) / 2;
      e.set(Math.atan2(hf - hr, CAR_LEN), c.yaw, 0);
      q.setFromEuler(e);
      mesh.setMatrixAt(i, m.compose(p.set(c.x, y, c.z), q, one));
      mesh.setColorAt(i, col.setHex(PARKED_COLORS[Math.floor(Math.random() * PARKED_COLORS.length)]));
      const pts = [
        [c.x + fx * hl + rx * hw, c.z + fz * hl + rz * hw], [c.x + fx * hl - rx * hw, c.z + fz * hl - rz * hw],
        [c.x - fx * hl - rx * hw, c.z - fz * hl - rz * hw], [c.x - fx * hl + rx * hw, c.z - fz * hl + rz * hw]
      ];
      solids.push({ pts, ...bounds(pts), base: Math.min(hf, hr) - 0.05, top: Math.max(hf, hr) + CAR_TOP, tags: null });
    }
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.computeBoundingSphere();
    mesh.castShadow = mesh.receiveShadow = true;
    scene.add(mesh);
    layers.push(mesh);
    invalidate();
    return solids;
  },

  // Poles and arms in one lit mesh, heads in one mesh whose glow follows the night, halos as points;
  // the ground light map from the head positions. Returns the pole solids.
  buildLamps(lamps, h) {
    const solids = [];
    if (!lamps.length) { lampLight.build([], h); return solids; }
    const post = rgb(0x50545c), headC = rgb(0xf5ead0);
    const poleGeoms = [], headGeoms = [], heads = [], halo = [];
    for (const l of lamps) {
      const base = elevation.at(l.x, l.z);
      const topY = base + LAMP_H;
      poleGeoms.push(cyl(0.07, 0.11, LAMP_H, l.x, base, l.z, post));
      const hx = l.x + l.ax * l.arm, hz = l.z + l.az * l.arm;
      const yaw = Math.atan2(-l.az, l.ax);
      if (l.arm > 0) {
        poleGeoms.push(box(l.arm, 0.08, 0.08, (l.x + hx) / 2, topY - 0.05, (l.z + hz) / 2, yaw, post));
      }
      headGeoms.push(box(0.7, 0.14, 0.32, hx, topY - 0.14, hz, yaw, headC));
      heads.push([hx, hz]);
      halo.push(hx, topY - 0.28, hz);
      solids.push(poleSolid(l.x, l.z, LAMP_POLE_R, base, topY));
    }
    const poles = addLayer(poleGeoms, litMaterial());
    if (poles) poles.castShadow = poles.receiveShadow = true;
    this.headMat = new THREE.MeshLambertMaterial({ color: 0xf5ead0, emissive: 0x000000 });
    addLayer(headGeoms, this.headMat);

    const hg = new THREE.BufferGeometry();
    hg.setAttribute('position', new THREE.Float32BufferAttribute(halo, 3));
    hg.computeBoundingSphere();
    const pm = new THREE.PointsMaterial({
      size: 1.6, map: haloTexture(), color: LAMP_COLOR, transparent: true, opacity: 0,
      depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: true
    });
    this.halo = new THREE.Points(hg, pm);
    this.halo.visible = false;
    scene.add(this.halo);
    layers.push(this.halo);

    lampLight.build(heads, h);
    this.setGlow(lampLight.uniforms.uLampGlow.value);
    return solids;
  },

  // Centre lines, lane lines and edge lines, stopped where another road crosses; draped like the road.
  buildMarkings(roads, vidx) {
    const buf = newBuf();
    const white = rgb(MARK_WHITE), yellow = rgb(MARK_YELLOW);
    const line = (r, id, off, c, dashed) => {
      const hw = MARK_W / 2;
      let D0 = 0;
      const P = MARK_DASH + MARK_GAP;
      for (let i = 0; i < r.pts.length - 1; i++) {
        const [x0, z0] = r.pts[i], [x1, z1] = r.pts[i + 1];
        const len = Math.hypot(x1 - x0, z1 - z0);
        if (len < 0.05) continue;
        const ux = (x1 - x0) / len, uz = (z1 - z0) / len, nx = -uz, nz = ux;
        const emit = (t0, t1) => {
          if (t1 - t0 < 0.2) return;
          const tm = (t0 + t1) / 2;
          const mx = x0 + ux * tm + nx * off, mz = z0 + uz * tm + nz * off;
          if (!this.inSquare(mx, mz, MARK_DASH) || roadGap(vidx, mx, mz, MARK_JUNCTION_CLEAR, id) < MARK_JUNCTION_CLEAR) return;
          const p = (t, o) => [x0 + ux * t + nx * o, MARK_Y, z0 + uz * t + nz * o];
          pushQuad(buf, p(t0, off - hw), p(t1, off - hw), p(t1, off + hw), p(t0, off + hw), c, UP);
        };
        if (dashed) {
          for (let k = Math.floor(D0 / P); k * P < D0 + len; k++) {
            const a = Math.max(k * P, D0), b = Math.min(k * P + MARK_DASH, D0 + len);
            if (b > a) emit(a - D0, b - D0);
          }
        } else {
          const n = Math.max(1, Math.ceil(len / MARK_DASH));
          for (let k = 0; k < n; k++) emit(k * len / n, (k + 1) * len / n);
        }
        D0 += len;
      }
    };

    for (let id = 0; id < roads.length; id++) {
      const r = roads[id];
      if (!MARK_KINDS.has(r.kind)) continue;
      const width = r.width ?? ROAD_WIDTH[r.kind];
      if (width < MARK_MIN_WIDTH) continue;
      const half = width / 2;
      if (r.oneway) {
        const lanes = Math.max(1, r.lanes || Math.round(width / LANE_W));
        for (let k = 1; k < lanes; k++) line(r, id, -half + k * width / lanes, white, true);
      } else {
        const lanes = Math.max(2, r.lanes || 2 * Math.max(1, Math.round(half / LANE_W)));
        if (MARK_MAJOR.has(r.kind)) { line(r, id, -0.1, yellow, false); line(r, id, 0.1, yellow, false); }
        else line(r, id, 0, yellow, true);
        const per = Math.floor(lanes / 2);
        for (let k = 1; k < per; k++) {
          line(r, id, k * half / per, white, true);
          line(r, id, -k * half / per, white, true);
        }
      }
      if (!PARKING_KINDS.has(r.kind) && width >= 9) {
        line(r, id, half - 0.3, white, false);
        line(r, id, -(half - 0.3), white, false);
      }
    }

    const mg = bufGeom(buf);
    if (!mg) return;
    const geoms = elevation.active ? [drape(mg)].filter(Boolean) : [mg];
    const mesh = addLayer(geoms, indoorClip.apply(lampLight.apply(litMaterial(LAYER_BIAS.mark))));
    if (mesh) mesh.receiveShadow = true;
  }
};

export class WildTerrain {
  constructor() {
    this.params = {
      amplitude: 260,
      baseScale: 20,
      noiseSpan: 6.0,
      biomeSpan: 2.2,
      mountainThreshold: 0.55,
      mountainBlend: 0.15,
      mountainGain: 7.0,
      ridgeSharp: 1.0,
      ridgeScale: 1.6,
      ridgeOctaves: 4,
      ridgeGain: 0.4,
      ridgeAdd: 0.0,
      waterCoverage: 0.3,
      waterLevelOverride: null,
      lakeDepthBoost: 7,
      lakeDepthFalloff: 0.10,
    };
    this.seed = { ox: 0, oz: 0, seed: 1337, f: 0 };
    this.grassColor = new THREE.Color(0x2d5016);
    this.rockColor = new THREE.Color(0x6e6e6e);
    this.lakeRef = null;
  }

  amplitude() {
    return this.params.amplitude * (CONFIG.scale / this.params.baseScale);
  }

  // FNV-1a: turns the seed text into a 32-bit integer, so leading zeros and arbitrary length both survive.
  seedToInt(str) {
    let h = 2166136261 >>> 0;
    const s = String(str);
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 16777619) >>> 0;
    }
    return h >>> 0;
  }

  // mulberry32
  makeRNG(seedInt) {
    let a = seedInt >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  initSeed(seedText) {
    const rng = this.makeRNG(this.seedToInt(seedText || DEFAULT_SEED));
    this.seed.ox = rng() * 1000;
    this.seed.oz = rng() * 1000;
    this.seed.seed = (rng() * 0x7fffffff) | 0;
    this.seed.f = rng() * 100;
    this.lakeRef = null;
  }

  hash2(ix, iz) {
    let h = (Math.imul(ix, 374761393) + Math.imul(iz, 668265263)
      + Math.imul(this.seed.seed, 1274126177)) | 0;
    h = (h ^ (h >>> 13)) | 0;
    h = Math.imul(h, 1274126177) | 0;
    h = (h ^ (h >>> 16)) >>> 0;
    return h / 4294967295;
  }

  valueNoise(x, z) {
    const ix = Math.floor(x), iz = Math.floor(z);
    const fx = x - ix, fz = z - iz;
    const ux = fx * fx * fx * (fx * (fx * 6 - 15) + 10);
    const uz = fz * fz * fz * (fz * (fz * 6 - 15) + 10);
    const n00 = this.hash2(ix, iz);
    const n10 = this.hash2(ix + 1, iz);
    const n01 = this.hash2(ix, iz + 1);
    const n11 = this.hash2(ix + 1, iz + 1);
    const nx0 = n00 + (n10 - n00) * ux;
    const nx1 = n01 + (n11 - n01) * ux;
    return nx0 + (nx1 - nx0) * uz;
  }

  fbm(x, z, octaves, lacunarity, gain) {
    let amp = 1, freq = 1, sum = 0, norm = 0;
    for (let o = 0; o < octaves; o++) {
      sum += amp * this.valueNoise(x * freq, z * freq);
      norm += amp;
      amp *= gain;
      freq *= lacunarity;
    }
    return sum / norm;
  }

  ridged(x, z, octaves, lacunarity, gain) {
    let amp = 1, freq = 1, sum = 0, norm = 0;
    for (let o = 0; o < octaves; o++) {
      const n = this.valueNoise(x * freq, z * freq);
      const r = 1 - Math.abs(n * 2 - 1);
      sum += r * r * (3 - 2 * r) * amp;
      norm += amp;
      amp *= gain;
      freq *= lacunarity;
    }
    return sum / norm;
  }

  smoothstep(e0, e1, x) {
    const t = Math.max(0, Math.min(1, (x - e0) / (e1 - e0)));
    return t * t * (3 - 2 * t);
  }

  // Arena units in, Arena units out; the Arena's world spans [0, worldWidth] x [0, worldHeight] (the noise runs past it).
  baseHeightAt(wx, wz) {
    const T = this.params;
    const s = this.seed.f;
    const u = wx / CONFIG.worldWidth;
    const v = wz / CONFIG.worldHeight;

    const bx = u * T.noiseSpan + s;
    const bz = v * T.noiseSpan + s * 1.7;

    const plains = this.fbm(bx, bz, 5, 2.03, 0.5);

    const mask = this.fbm(u * T.biomeSpan + s * 3.1, v * T.biomeSpan - s * 1.9, 5, 2.03, 0.5);
    const mtn = this.smoothstep(T.mountainThreshold, T.mountainThreshold + T.mountainBlend, mask);

    let h01 = plains;
    if (mtn > 0) {
      const ridged = this.ridged(bx * T.ridgeScale + 33.0, bz * T.ridgeScale - 21.0, T.ridgeOctaves, 2.13, T.ridgeGain);
      const peaks = Math.pow(Math.max(ridged, 1e-4), T.ridgeSharp);
      h01 = plains + (Math.max(plains, peaks) - plains) * mtn;
      if (T.ridgeAdd > 0) h01 += peaks * mtn * T.ridgeAdd;
    }
    const lift = mtn * T.mountainGain;
    return CONFIG.groundY + h01 * this.amplitude() * (1 + lift);
  }

  lakeCarve(h) {
    const ref = this.lakeRef;
    if (ref === null) return h;
    const boost = this.params.lakeDepthBoost;
    if (boost <= 0) return h;
    const d = ref - h;
    if (d <= 0) return h;
    const soft = Math.max(1e-3, this.params.lakeDepthFalloff * this.amplitude());
    return h - boost * (d * d) / (d + soft);
  }

  heightAt(wx, wz) {
    return this.lakeCarve(this.baseHeightAt(wx, wz));
  }

  // Metres, centred: the Arena's world centre sits at the origin.
  arenaX(x) { return x / NPC_UNIT + CONFIG.worldWidth / 2; }
  arenaZ(z) { return z / NPC_UNIT + CONFIG.worldHeight / 2; }
  baseMetresAt(x, z) { return this.baseHeightAt(this.arenaX(x), this.arenaZ(z)) * NPC_UNIT; }
  metresAt(x, z) { return this.heightAt(this.arenaX(x), this.arenaZ(z)) * NPC_UNIT; }

  // The Arena's water.computeLevel: uncarved height under `waterCoverage` of samples in a region; `skip` drops points.
  computeLevel(b, skip = null) {
    if (this.params.waterLevelOverride !== null) return this.params.waterLevelOverride * NPC_UNIT;
    const N = 96;
    const samples = [];
    for (let iz = 0; iz < N; iz++) {
      const z = b.minZ + (iz / (N - 1)) * (b.maxZ - b.minZ);
      for (let ix = 0; ix < N; ix++) {
        const x = b.minX + (ix / (N - 1)) * (b.maxX - b.minX);
        if (skip && skip(x, z)) continue;
        samples.push(this.baseMetresAt(x, z));
      }
    }
    samples.sort((a, c) => a - c);
    const cov = Math.max(0, Math.min(1, this.params.waterCoverage));
    return samples[Math.floor(cov * (samples.length - 1))];
  }
}

// HEIGHT GRID: heights at every mesh vertex; `at` is bilinear, so footing matches the drawn ground closely.
export class HeightGrid {
  constructor(x0, z0, step, nx, nz) {
    this.x0 = x0; this.z0 = z0; this.step = step; this.nx = nx; this.nz = nz;
    this.data = new Float32Array(nx * nz);
  }

  fill(fn) {
    const { x0, z0, step, nx, nz, data } = this;
    for (let j = 0; j < nz; j++) {
      const z = z0 + j * step;
      for (let i = 0; i < nx; i++) data[j * nx + i] = fn(x0 + i * step, z);
    }
  }

  at(x, z) {
    const lx = this.nx - 1, lz = this.nz - 1;
    let fx = (x - this.x0) / this.step, fz = (z - this.z0) / this.step;
    fx = fx < 0 ? 0 : fx > lx ? lx : fx;
    fz = fz < 0 ? 0 : fz > lz ? lz : fz;
    const i = Math.min(Math.floor(fx), lx - 1), j = Math.min(Math.floor(fz), lz - 1);
    const tx = fx - i, tz = fz - j, d = this.data, k = j * this.nx + i;
    const a = d[k] + (d[k + 1] - d[k]) * tx;
    const b = d[k + this.nx] + (d[k + this.nx + 1] - d[k + this.nx]) * tx;
    return a + (b - a) * tz;
  }
}

// The Arena's paintBySlope: reads the normal's world z, so rock shows on north- and south-facing slopes, as it drew it.
export function paintSlope(geometry) {
  const normals = geometry.getAttribute('normal').array;
  const count = normals.length / 3;
  let colorAttr = geometry.getAttribute('color');
  if (!colorAttr) {
    colorAttr = new THREE.BufferAttribute(new Float32Array(count * 3), 3);
    geometry.setAttribute('color', colorAttr);
  }
  const colors = colorAttr.array;
  const g = wildTerrain.grassColor, r = wildTerrain.rockColor;
  const ROCK_START = 0.12;
  const ROCK_FULL = 0.84;
  for (let i = 0; i < count; i++) {
    const ny = Math.abs(normals[i * 3 + 2]);
    let t = (ROCK_START - ny) / (ROCK_START - ROCK_FULL);
    t = Math.max(0, Math.min(1, t));
    colors[i * 3] = g.r + (r.r - g.r) * t;
    colors[i * 3 + 1] = g.g + (r.g - g.g) * t;
    colors[i * 3 + 2] = g.b + (r.b - g.b) * t;
  }
  colorAttr.needsUpdate = true;
}

// Terrain mesh straight from a HeightGrid, drawn by ground cell. `skip(i, j)` drops a quad (inside the city); `sink(x, z)` lowers a vertex.
export function heightMesh(grid, skip = null, sink = null) {
  const { nx, nz, x0, z0, step, data } = grid;
  const pos = new Float32Array(nx * nz * 3);
  for (let j = 0, k = 0; j < nz; j++) {
    for (let i = 0; i < nx; i++, k++) {
      const x = x0 + i * step, z = z0 + j * step;
      pos[k * 3] = x; pos[k * 3 + 1] = data[k] - (sink ? sink(x, z) : 0); pos[k * 3 + 2] = z;
    }
  }
  const idx = [];
  for (let j = 0; j < nz - 1; j++) {
    for (let i = 0; i < nx - 1; i++) {
      if (skip && skip(i, j)) continue;
      const a = j * nx + i, b = a + 1, c = a + nx, d = c + 1;
      idx.push(a, c, b, b, c, d);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setIndex(nx * nz > 65535 ? new THREE.Uint32BufferAttribute(idx, 1) : new THREE.Uint16BufferAttribute(idx, 1));
  g.computeVertexNormals();
  paintSlope(g);
  g.computeBoundingSphere();
  const mesh = cellCull(new THREE.Mesh(g, new THREE.MeshLambertMaterial({ vertexColors: true })), false, TERRAIN_CELL_M);
  mesh.receiveShadow = true;
  return mesh;
}

// Shoreline points an animal can see water at (the Arena's water.deriveLocations), from a HeightGrid.
export function shoreline(grid, level, skip = null) {
  const out = [];
  const N = 128;
  const b = { minX: grid.x0, minZ: grid.z0, maxX: grid.x0 + (grid.nx - 1) * grid.step, maxZ: grid.z0 + (grid.nz - 1) * grid.step };
  const dx = (b.maxX - b.minX) / (N - 1), dz = (b.maxZ - b.minZ) / (N - 1);
  const h = new Float64Array(N * N);
  for (let iz = 0; iz < N; iz++) {
    for (let ix = 0; ix < N; ix++) h[iz * N + ix] = grid.at(b.minX + ix * dx, b.minZ + iz * dz);
  }
  const cand = [];
  for (let iz = 1; iz < N - 1; iz++) {
    for (let ix = 1; ix < N - 1; ix++) {
      if (h[iz * N + ix] >= level) continue;
      if (h[iz * N + ix - 1] < level && h[iz * N + ix + 1] < level &&
        h[(iz - 1) * N + ix] < level && h[(iz + 1) * N + ix] < level) continue;
      const x = b.minX + ix * dx, z = b.minZ + iz * dz;
      if (skip && skip(x, z)) continue;
      cand.push(x, z);
    }
  }
  const order = new Uint32Array(cand.length / 2);
  for (let i = 0; i < order.length; i++) order[i] = i;
  for (let i = order.length - 1; i > 0; i--) {
    const j = (Math.random() * (i + 1)) | 0;
    const t = order[i]; order[i] = order[j]; order[j] = t;
  }
  const minSep = Math.max(18 * NPC_UNIT, Math.min(b.maxX - b.minX, b.maxZ - b.minZ) * 0.035);
  const minSepSq = minSep * minSep;
  const MAX_POINTS = 160;
  for (let o = 0; o < order.length && out.length < MAX_POINTS; o++) {
    const wx = cand[order[o] * 2], wz = cand[order[o] * 2 + 1];
    let ok = true;
    for (let k = 0; k < out.length; k++) {
      const ddx = wx - out[k][0], ddz = wz - out[k][1];
      if (ddx * ddx + ddz * ddz < minSepSq) { ok = false; break; }
    }
    if (ok) out.push([wx, wz, level]);
  }
  return out;
}

// Everything the wild part of a world adds to the scene, disposed as one.
export const wildLayers = [];

export function addWildLayer(obj) {
  scene.add(obj);
  wildLayers.push(obj);
  invalidate();
  return obj;
}

export function clearWildLayers() {
  const mats = new Set();
  for (const o of wildLayers) {
    scene.remove(o);
    o.traverse(n => {
      if (n.isInstancedMesh) n.dispose();
      if (n.geometry) n.geometry.dispose();
      if (n.material) mats.add(n.material);
    });
  }
  for (const m of mats) m.dispose();
  wildLayers.length = 0;
  invalidate();
}

// Height `h` at (x, z) inside bounds `b`, lowered toward the sea floor near the edge; small worlds get a narrower coast.
export function coastHeight(x, z, h, b, level) {
  const k = Math.min(1, Math.min(b.maxX - b.minX, b.maxZ - b.minZ) / 500);
  const d = Math.min(x - b.minX, b.maxX - x, z - b.minZ, b.maxZ - z);
  const w = (wildTerrain.valueNoise(x / 90 + 3.7, z / 90 - 5.2) * 2 - 1) * COAST_WOBBLE * k;
  const t = wildTerrain.smoothstep(COAST_SEA * k, (COAST_SEA + COAST_LAND) * k, d + w);
  const floor = level - OCEAN_DEPTH;
  return floor + (h - floor) * t;
}

export class WildWater {
  constructor() {
    this.COLOR = 0x276376;
    this.ENV_INTENSITY = 2.0;
    this.TILE_A = 26 * NPC_UNIT;
    this.TILE_B = 11 * NPC_UNIT;
    this.FLOW_A = { x: 0.460, y: 0.270 };
    this.FLOW_B = { x: -0.280, y: -0.350 };
    this.NORMAL_SIZE = 256;
    this.NORMAL_CELLS = 8;
    this.NORMAL_STRENGTH = 6.0;
    this.DEPTH_OFFSET_FACTOR = 1.0;
    this.DEPTH_OFFSET_UNITS = 1.0;
    this.SEGMENTS = 64;
    this.plane = null;
    this.seabed = null;
    this.cityMaps = null;
    this.normalA = null;
    this.normalB = null;
    this.envMap = null;
  }

  buildNormalTexture(size, cells, strength) {
    const hash2 = (x, y) => {
      const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453123;
      return s - Math.floor(s);
    };
    const wrap = v => ((v % cells) + cells) % cells;
    const h = new Float32Array(size * size);
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const fx = (x / size) * cells, fy = (y / size) * cells;
        const ix = Math.floor(fx), iy = Math.floor(fy);
        const tx = fx - ix, ty = fy - iy;
        const ux = tx * tx * (3 - 2 * tx), uy = ty * ty * (3 - 2 * ty);
        const x0 = wrap(ix), x1 = wrap(ix + 1), y0 = wrap(iy), y1 = wrap(iy + 1);
        const a = hash2(x0, y0), b = hash2(x1, y0), c = hash2(x0, y1), d = hash2(x1, y1);
        const top = a + (b - a) * ux, bot = c + (d - c) * ux;
        h[y * size + x] = top + (bot - top) * uy;
      }
    }
    const at = (x, y) => h[((y % size) + size) % size * size + (((x % size) + size) % size)];
    const data = new Uint8Array(size * size * 4);
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const dx = (at(x + 1, y) - at(x - 1, y)) * 0.5 * strength;
        const dy = (at(x, y + 1) - at(x, y - 1)) * 0.5 * strength;
        const len = Math.hypot(dx, dy, 1);
        const o = (y * size + x) * 4;
        data[o] = Math.round(((-dx / len) * 0.5 + 0.5) * 255);
        data[o + 1] = Math.round(((-dy / len) * 0.5 + 0.5) * 255);
        data[o + 2] = Math.round(((1 / len) * 0.5 + 0.5) * 255);
        data[o + 3] = 255;
      }
    }
    const tex = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.magFilter = THREE.LinearFilter;
    tex.minFilter = THREE.LinearMipmapLinearFilter;
    tex.generateMipmaps = true;
    tex.anisotropy = renderer.capabilities.getMaxAnisotropy();
    tex.needsUpdate = true;
    return tex;
  }

  getEnvMap() {
    if (this.envMap) return this.envMap;
    const c = document.createElement('canvas');
    c.width = 16;
    c.height = 64;
    const ctx = c.getContext('2d');
    const sky = new THREE.Color(0x87CEEB);
    const grad = ctx.createLinearGradient(0, 0, 0, c.height);
    grad.addColorStop(0, '#' + sky.clone().offsetHSL(0, 0, 0.10).getHexString());
    grad.addColorStop(0.55, '#' + sky.getHexString());
    grad.addColorStop(1, '#' + scene.fog.color.getHexString());
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, c.width, c.height);
    const equirect = new THREE.CanvasTexture(c);
    equirect.mapping = THREE.EquirectangularReflectionMapping;
    equirect.colorSpace = THREE.SRGBColorSpace;
    const pmrem = new THREE.PMREMGenerator(renderer);
    this.envMap = pmrem.fromEquirectangular(equirect).texture;
    pmrem.dispose();
    equirect.dispose();
    return this.envMap;
  }

  // Surface over bounds `b` at `level`, minus the `hole` square (city water); sea runs OCEAN_REACH past bounds at OCEAN_DEPTH.
  ensureNormals() {
    if (this.normalA) return;
    this.normalA = this.buildNormalTexture(this.NORMAL_SIZE, this.NORMAL_CELLS, this.NORMAL_STRENGTH);
    this.normalB = this.normalA.clone();
    this.normalB.needsUpdate = true;
  }

  // The water look: physical surface, two scrolling normal maps, sky reflection, translucent, seen from both sides.
  surfaceMaterial(normalA, normalB, offsetFactor, offsetUnits) {
    return new THREE.MeshPhysicalMaterial({
      color: this.COLOR,
      roughness: 0.18,
      metalness: 0.0,
      normalMap: normalA,
      normalScale: new THREE.Vector2(0.50, 0.50),
      clearcoat: 1.0,
      clearcoatRoughness: 0.14,
      clearcoatNormalMap: normalB,
      clearcoatNormalScale: new THREE.Vector2(0.35, 0.35),
      envMap: this.getEnvMap(),
      envMapIntensity: this.ENV_INTENSITY,
      transparent: true,
      opacity: 0.90,
      depthWrite: false,
      side: THREE.DoubleSide,
      polygonOffset: true,
      polygonOffsetFactor: offsetFactor,
      polygonOffsetUnits: offsetUnits,
    });
  }

  // The same surface for city water: draped mesh, world-metre UVs, own normal maps, pulled toward the camera over the ground.
  cityMaterial(bias) {
    this.ensureNormals();
    const a = this.normalA.clone(), b = this.normalA.clone();
    a.needsUpdate = b.needsUpdate = true;
    a.repeat.set(1 / this.TILE_A, 1 / this.TILE_A);
    b.repeat.set(1 / this.TILE_B, 1 / this.TILE_B);
    this.cityMaps = [a, b];
    return this.surfaceMaterial(a, b, -bias, -bias);
  }

  createPlane(b, level, hole = 0) {
    this.dispose();
    const W = b.maxX - b.minX, D = b.maxZ - b.minZ;
    const piece = (x0, x1, z0, z1, seg) => {
      const g = new THREE.PlaneGeometry(x1 - x0, z1 - z0, seg, seg);
      g.rotateX(-Math.PI / 2);
      g.translate((x0 + x1) / 2, 0, (z0 + z1) / 2);
      return g;
    };
    let geometry;
    if (hole > 0) {
      geometry = mergeGeometries([
        piece(b.minX, b.maxX, b.minZ, -hole, 24), piece(b.minX, b.maxX, hole, b.maxZ, 24),
        piece(b.minX, -hole, -hole, hole, 16), piece(hole, b.maxX, -hole, hole, 16)
      ], false);
    } else {
      geometry = piece(b.minX, b.maxX, b.minZ, b.maxZ, this.SEGMENTS);
    }
    const R = OCEAN_REACH;
    const sea = () => [
      piece(b.minX - R, b.maxX + R, b.minZ - R, b.minZ, 8), piece(b.minX - R, b.maxX + R, b.maxZ, b.maxZ + R, 8),
      piece(b.minX - R, b.minX, b.minZ, b.maxZ, 8), piece(b.maxX, b.maxX + R, b.minZ, b.maxZ, 8)
    ];
    geometry = mergeGeometries([geometry, ...sea()], false);
    // UVs from world position, so both normal maps tile evenly across the pieces
    const p = geometry.attributes.position, uv = geometry.attributes.uv;
    for (let i = 0; i < p.count; i++) uv.setXY(i, (p.getX(i) - b.minX) / W, 1 - (p.getZ(i) - b.minZ) / D);
    uv.needsUpdate = true;

    this.ensureNormals();
    this.normalA.repeat.set(W / this.TILE_A, D / this.TILE_A);
    this.normalB.repeat.set(W / this.TILE_B, D / this.TILE_B);

    const material = this.surfaceMaterial(this.normalA, this.normalB, this.DEPTH_OFFSET_FACTOR, this.DEPTH_OFFSET_UNITS);
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.y = level;
    mesh.renderOrder = 1;
    mesh.frustumCulled = false;
    scene.add(mesh);
    this.plane = mesh;

    // the sea floor past the edge, meeting the terrain's own floor at the bounds
    const bed = new THREE.Mesh(mergeGeometries(sea(), false),
      new THREE.MeshLambertMaterial({ color: wildTerrain.grassColor }));
    bed.position.y = level - OCEAN_DEPTH;
    bed.frustumCulled = false;
    scene.add(bed);
    this.seabed = bed;
    invalidate();
    return mesh;
  }

  reset() { this.dispose(); }   // teardownWorld's entry
  dispose() {
    if (this.seabed) {
      scene.remove(this.seabed);
      this.seabed.geometry.dispose();
      this.seabed.material.dispose();
      this.seabed = null;
    }
    if (!this.plane) return;
    scene.remove(this.plane);
    this.plane.geometry.dispose();
    this.plane.material.dispose();
    this.plane = null;
  }

  update(timeSeconds) {
    if (this.cityMaps) {
      this.cityMaps[0].offset.set((this.FLOW_A.x * timeSeconds) % 1, (this.FLOW_A.y * timeSeconds) % 1);
      this.cityMaps[1].offset.set((this.FLOW_B.x * timeSeconds) % 1, (this.FLOW_B.y * timeSeconds) % 1);
    }
    if (!this.plane) return;
    const m = this.plane.material;
    m.normalMap.offset.set(
      (this.FLOW_A.x * timeSeconds) % 1,
      (this.FLOW_A.y * timeSeconds) % 1
    );
    m.clearcoatNormalMap.offset.set(
      (this.FLOW_B.x * timeSeconds) % 1,
      (this.FLOW_B.y * timeSeconds) % 1
    );
  }
}

export class Cabin extends THREE.Group {
  constructor({
    scale = 1,
    position = new THREE.Vector3(0, 0, 0),
    rotationY = 0
  } = {}) {
    super();
    this.position.copy(position);
    this._build();
    this.scale.set(scale, scale, scale);
    this.rotation.y = rotationY;
  }

  _build() {
    const M = {
      log: new THREE.MeshStandardMaterial({ color: 0xA0693A, roughness: 0.9 }),
      logDark: new THREE.MeshStandardMaterial({ color: 0x6B4226, roughness: 0.95 }),
      roof: new THREE.MeshStandardMaterial({ color: 0x3a2b1b, roughness: 0.92 }),
      stone: new THREE.MeshStandardMaterial({ color: 0x9a9080, roughness: 1 }),
    };

    const CW = 80;
    const CD = 60;
    const LR = 2.5;
    const LD = LR * 2;
    const WALL_H = 44;
    const FLOOR_Y = 2;
    const ROWS = Math.floor(WALL_H / LD);
    const DOOR_WIDTH = 18;
    const DOOR_HEIGHT = 42;

    const parts = new Map();
    const place = new THREE.Object3D();
    const put = (geo, mat, x, y, z, rx = 0, rz = 0) => {
      place.position.set(x, y, z);
      place.rotation.set(rx, 0, rz);
      place.updateMatrix();
      geo.applyMatrix4(place.matrix);
      if (!parts.has(mat)) parts.set(mat, []);
      parts.get(mat).push(geo);
    };

    const box = (w, h, d, mat, x = 0, y = 0, z = 0) => put(new THREE.BoxGeometry(w, h, d), mat, x, y, z);

    const hlog = (len, mat, x, y, z, axis) => put(new THREE.CylinderGeometry(LR, LR, len, 10), mat, x, y, z,
      axis === 'x' ? Math.PI / 2 : 0, axis === 'z' ? Math.PI / 2 : 0);

    box(CW + 8, FLOOR_Y, CD + 8, M.logDark, 0, FLOOR_Y / 2, 0);

    for (let i = 0; i < ROWS; i++) {
      const y = FLOOR_Y + i * LD + LR;
      const bottomOfLog = y - LR;

      if (bottomOfLog < FLOOR_Y + DOOR_HEIGHT) {
        const sideLength = (CW / 2 + LD) - DOOR_WIDTH / 2;
        hlog(sideLength, M.log, -(DOOR_WIDTH / 2) - sideLength / 2, y, CD / 2, 'z');
        hlog(sideLength, M.log, (DOOR_WIDTH / 2) + sideLength / 2, y, CD / 2, 'z');
      } else {
        hlog(CW + LD * 2, M.log, 0, y, CD / 2, 'z');
      }

      hlog(CW + LD * 2, M.log, 0, y, -CD / 2, 'z');
      hlog(CD, M.log, -CW / 2, y, 0, 'x');
      hlog(CD, M.log, CW / 2, y, 0, 'x');
    }

    const ROOF_BASE = FLOOR_Y + WALL_H - 4;
    const RIDGE_H = 34;
    const OVH = 8;

    [[-1], [1]].forEach(([sx]) => {
      const run = CW / 2 + OVH;
      const rise = RIDGE_H;
      const panelLen = Math.sqrt(run * run + rise * rise);
      const angle = Math.atan2(rise, run) * sx * -1;
      put(new THREE.BoxGeometry(panelLen, 3, CD + OVH * 2 + 4), M.roof, sx * run / 2, ROOF_BASE + rise / 2, 0, 0, angle);
    });

    const gableMat = new THREE.MeshStandardMaterial({ color: 0x3a2b1b, roughness: 0.92, side: THREE.DoubleSide });
    [-1, 1].forEach(sz => {
      const shape = new THREE.Shape();
      shape.moveTo(-(CW / 2 + OVH), 0);
      shape.lineTo((CW / 2 + OVH), 0);
      shape.lineTo(0, RIDGE_H);
      shape.lineTo(-(CW / 2 + OVH), 0);
      const geo = new THREE.ExtrudeGeometry(shape, { depth: LD * 2, bevelEnabled: false });
      put(geo, gableMat, 0, ROOF_BASE, sz * (CD / 2 + OVH + 2) - (sz * LD * 2));
    });

    const CHX = -18;
    const CHZ = -12;
    const CHW = 11;
    const CHD = 11;
    const topOfChimney = ROOF_BASE + RIDGE_H + 20;

    box(CHW, topOfChimney, CHD, M.stone, CHX, topOfChimney / 2, CHZ);
    box(CHW + 4, 2.5, CHD + 4, M.logDark, CHX, topOfChimney + 1.25, CHZ);

    for (const [mat, geos] of parts) {
      const mesh = new THREE.Mesh(mergeGeometries(geos, false), mat);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      this.add(mesh);
      for (const g of geos) g.dispose();
    }
  }
}

// Rain shelter rectangles (cabin roofs), rasterised into the rain's roof map beside the city's shells.
// Cabin shelter rectangles (interiors), for rain roofs and cabinAt; reset assigns a new list (rain compares identity).
export const shelters = {
  list: [],
  reset() { this.list = []; }
};

// The Arena's CabinSystem.buildColliders boxes, as obstacle-index solids plus the door lane and rain shelter.
export function cabinObstacles(cx, cz, s, rotationY, baseY) {
  const CW = 80 * s, CD = 60 * s;
  const LR = 2.5 * s;
  const WALL_H = 44 * s;
  const FLOOR_Y = 2 * s;
  const WALL_THICK = LR * 2;
  const DOOR_WIDTH = 18 * s;
  const DOOR_HEIGHT = 42 * s;

  const ROOF_BASE = FLOOR_Y + WALL_H - 4 * s;
  const RIDGE_H = 34 * s;
  const OVH = 8 * s;
  const roofTop = ROOF_BASE + RIDGE_H;

  const CHW = 11 * s, CHD = 11 * s;
  const CHX_local = -18 * s, CHZ_local = -12 * s;
  const chimneyTop = ROOF_BASE + RIDGE_H + 20 * s;

  const halfDoor = DOOR_WIDTH / 2;
  const frontLZ = CD / 2;
  const backLZ = -CD / 2;

  const by = baseY;
  const localBoxes = [
    { minX: -(CW / 2 + 4 * s), maxX: CW / 2 + 4 * s, minY: by, maxY: by + FLOOR_Y, minZ: -(CD / 2 + 4 * s), maxZ: CD / 2 + 4 * s, walkable: true },
    { minX: -CW / 2 - WALL_THICK, maxX: -halfDoor, minY: by + FLOOR_Y, maxY: by + FLOOR_Y + WALL_H, minZ: frontLZ - WALL_THICK, maxZ: frontLZ + WALL_THICK },
    { minX: halfDoor, maxX: CW / 2 + WALL_THICK, minY: by + FLOOR_Y, maxY: by + FLOOR_Y + WALL_H, minZ: frontLZ - WALL_THICK, maxZ: frontLZ + WALL_THICK },
    { minX: -halfDoor, maxX: halfDoor, minY: by + FLOOR_Y + DOOR_HEIGHT, maxY: by + FLOOR_Y + WALL_H, minZ: frontLZ - WALL_THICK, maxZ: frontLZ + WALL_THICK },
    { minX: -CW / 2 - WALL_THICK, maxX: CW / 2 + WALL_THICK, minY: by + FLOOR_Y, maxY: by + FLOOR_Y + WALL_H, minZ: backLZ - WALL_THICK, maxZ: backLZ + WALL_THICK },
    { minX: -CW / 2 - WALL_THICK, maxX: -CW / 2 + WALL_THICK, minY: by + FLOOR_Y, maxY: by + FLOOR_Y + WALL_H, minZ: backLZ - WALL_THICK, maxZ: frontLZ + WALL_THICK },
    { minX: CW / 2 - WALL_THICK, maxX: CW / 2 + WALL_THICK, minY: by + FLOOR_Y, maxY: by + FLOOR_Y + WALL_H, minZ: backLZ - WALL_THICK, maxZ: frontLZ + WALL_THICK },
    { minX: -(CW / 2 + OVH) - WALL_THICK, maxX: 0, minY: by + ROOF_BASE, maxY: by + roofTop + 5 * s, minZ: -(CD / 2 + OVH), maxZ: CD / 2 + OVH },
    { minX: 0, maxX: (CW / 2 + OVH) + WALL_THICK, minY: by + ROOF_BASE, maxY: by + roofTop + 5 * s, minZ: -(CD / 2 + OVH), maxZ: CD / 2 + OVH },
    { minX: CHX_local - CHW / 2, maxX: CHX_local + CHW / 2, minY: by + FLOOR_Y, maxY: by + chimneyTop + 5 * s, minZ: CHZ_local - CHD / 2, maxZ: CHZ_local + CHD / 2 },
  ];

  const cosR = Math.cos(rotationY), sinR = Math.sin(rotationY);
  const toWorld = (lx, lz) => [cx + lx * cosR + lz * sinR, cz - lx * sinR + lz * cosR];
  const solids = localBoxes.map(b => {
    const pts = [toWorld(b.minX, b.minZ), toWorld(b.maxX, b.minZ), toWorld(b.maxX, b.maxZ), toWorld(b.minX, b.maxZ)];
    return { pts, ...bounds(pts), base: b.minY, top: b.maxY, tags: null, walkable: !!b.walkable };
  });

  const shMaxX = (CW / 2 + OVH) + WALL_THICK;
  const shMaxZ = CD / 2 + OVH;
  const shelter = {
    cx, cz, cosR, sinR,
    minX: -shMaxX, maxX: shMaxX, minZ: -shMaxZ, maxZ: shMaxZ,
    topY: by + roofTop + 5 * s,
    reach: Math.hypot(shMaxX, shMaxZ),
    // the room inside the walls (cabinAt)
    inHalfX: CW / 2 - WALL_THICK, inHalfZ: CD / 2 - WALL_THICK,
    floorY: by + FLOOR_Y, ceilY: by + FLOOR_Y + WALL_H
  };
  const o = toWorld(0, frontLZ + WALL_THICK), q = toWorld(0, frontLZ - WALL_THICK);
  return { solids, shelter, throat: [o[0], o[1], q[0], q[1]] };
}

// The Arena's placement: `count` cabins on dry ground, the first at `first`; `pick()` draws a candidate [x, z].
export function placeCabins(count, first, firstYaw, pick, heightAt, level) {
  const scale = CABIN_SCALE * CABIN_M;
  const minSep = 300 * NPC_UNIT;
  const placed = [];
  for (let i = 0; i < count; i++) {
    let cx, cz, tries = 0;
    if (i === 0 && first) {
      [cx, cz] = first;
    } else {
      do {
        [cx, cz] = pick();
        tries++;
      } while (tries < 50 && (heightAt(cx, cz) < level + 4 * NPC_UNIT ||
        placed.some(c => Math.hypot(cx - c.x, cz - c.z) < minSep)));
    }
    const rotY = i === 0 ? firstYaw : (Math.floor(Math.random() * 4)) * (Math.PI / 2);
    const gy = heightAt(cx, cz);
    const c = new Cabin({ scale, position: new THREE.Vector3(cx, gy, cz), rotationY: rotY });
    addWildLayer(c);
    const ob = cabinObstacles(cx, cz, scale, rotY, gy);
    addSolids(ob.solids);
    cover.add(ob.solids.filter(w => !w.walkable));
    collision.obstacleThroats.push(ob.throat);
    shelters.list.push(ob.shelter);
    placed.push({ x: cx, z: cz, y: gy, yaw: rotY, floor: gy + 2 * scale });
  }
  return placed;
}

// PEBBLES: the Arena's scattered rocks, sizes in metres.
export class PebbleRenderer {
  constructor() {
    this.MAX_INSTANCES = 4000;
    this.GEOMETRIES = [
      new THREE.SphereGeometry(1, 6, 4),
      new THREE.SphereGeometry(1, 8, 5),
      new THREE.SphereGeometry(1, 10, 6),
    ];
    this.MATERIALS = [
      new THREE.MeshStandardMaterial({ color: 0x888070, roughness: 0.95, metalness: 0.0 }),
      new THREE.MeshStandardMaterial({ color: 0x706858, roughness: 0.92, metalness: 0.0 }),
      new THREE.MeshStandardMaterial({ color: 0x5a5248, roughness: 0.90, metalness: 0.05 }),
    ];
    this.data = [];
    this.meshes = null;

    this._pos = new THREE.Vector3();
    this._pquat = new THREE.Quaternion();
    this._pscale = new THREE.Vector3();
    this._pmat4 = new THREE.Matrix4();
    this._paxis = new THREE.Vector3(0, 1, 0);
  }

  init() {
    this.dispose();
    this.meshes = this.GEOMETRIES.map((geo, i) => {
      const mesh = new THREE.InstancedMesh(geo, this.MATERIALS[i], this.MAX_INSTANCES);
      mesh.receiveShadow = true;
      mesh.castShadow = true;
      mesh.frustumCulled = false;
      mesh.count = 0;
      scene.add(mesh);
      return mesh;
    });
  }

  reset() { this.dispose(); }   // teardownWorld's entry
  dispose() {
    if (!this.meshes) return;
    for (const mesh of this.meshes) { scene.remove(mesh); mesh.dispose(); }
    this.meshes = null;
    this.data = [];
  }

  // `pick()` draws a cluster centre [x, z] (or null); `heightAt` is the provider's ground.
  place(pick, heightAt) {
    this.data = [];
    const count = Math.floor(60 * Math.log1p(CONFIG.scale));
    for (let i = 0; i < count && this.data.length < this.MAX_INSTANCES; i++) {
      const c = pick();
      if (!c) continue;
      const [cx, cz] = c;
      const clusterSize = Math.random() < 0.6 ? Math.floor(Math.random() * 4) + 2 : 1;
      for (let j = 0; j < clusterSize && this.data.length < this.MAX_INSTANCES; j++) {
        const spread = clusterSize > 1 ? 30 * NPC_UNIT : 0;
        const px = cx + (Math.random() - 0.5) * spread;
        const pz = cz + (Math.random() - 0.5) * spread;
        const radius = (2 + Math.random() * 10) * NPC_UNIT;
        const squashY = 0.5 + Math.random() * 0.5;
        const rotY = Math.random() * Math.PI * 2;
        this.data.push({ x: px, z: pz, radius, squashY, rotY });
      }
    }
    this.update(heightAt);
  }

  update(heightAt) {
    if (!this.meshes) return;
    const counts = [0, 0, 0];
    for (const p of this.data) {
      const tier = p.radius < 5 * NPC_UNIT ? 0 : p.radius < 9 * NPC_UNIT ? 1 : 2;
      const idx = counts[tier];
      const groundY = heightAt(p.x, p.z);
      this._pos.set(p.x, groundY + p.radius * p.squashY * 0.5, p.z);
      this._pquat.setFromAxisAngle(this._paxis, p.rotY);
      this._pscale.set(p.radius, p.radius * p.squashY, p.radius);
      this._pmat4.compose(this._pos, this._pquat, this._pscale);
      this.meshes[tier].setMatrixAt(idx, this._pmat4);
      counts[tier]++;
    }
    for (let i = 0; i < 3; i++) perf.instances(this.meshes[i], counts[i]);
    invalidate();
  }
}

export const wildTerrain = new WildTerrain();
export const wildWater = new WildWater();
export const pebbles = new PebbleRenderer();
// WORLD PROVIDERS: bounds, wraps, heightAt, isWater, surface, waterSources, population, regrow; flags shadows/companion/rays.

// CITY: the OpenStreetMap / Terrarium city; buildCity makes the geometry, this adds NPC data and answers queries.
export class CityWorld {
  constructor(features, radius, opts, habitat = null) {
    this.kind = 'city';
    this.features = features;
    this.radius = radius;
    this.opts = opts;
    this.habitat = habitat;
    this.bounds = { minX: -radius, maxX: radius, minZ: -radius, maxZ: radius };
    this.wraps = false;
    this.shadows = true;
    this.companion = false;
    this.rays = 'off';
    this.city = this;
    this.greens = [];
    this.greenTotal = 0;
    this.roadIdx = null;
    this.segs = [];
    this.segTotal = 0;
  }

  build() {
    const f = this.features;
    // water over the whole measured square (the terrain base, which the wilderness world walks on past the radius); off it counts as dry
    const h = elevation.active ? Math.min(this.radius + ELEV_MARGIN, elevation.half) : this.radius;
    cityWater.build(f, -h, -h, h, h);
    waterClip.set(cityWater);
    this.buildWaterBed();
    places.build(f);
    this.buildGreens(f.areas);
    this.roadIdx = roadIndex(f.roads);
    this.buildSidewalks(f.roads);
    // markings, parked cars and lamps, then the benches and hydrants
    streets.build(f, h, f.props);
    buildProps(f.props);
    foodBoxes.build(this);
  }

  teardown() {
    streets.clear();
    cover.clear();
    cityWater.clear();
    places.list.length = 0;
    places.byKind = {};
    foodBoxes.clear();
  }

  // The drawn bed under the painted water (a layer, so clearLayers frees it); the far ground plane drops under it.
  buildWaterBed() {
    const bed = cityWater.bedGeometry();
    if (!bed) return;
    const mesh = new THREE.Mesh(bed.geometry, new THREE.MeshLambertMaterial({ color: cityWater.BED_COLOR }));
    scene.add(mesh);
    layers.push(mesh);
    if (elevation.active) ground.position.y = Math.min(ground.position.y, bed.minY - 0.3);
    invalidate();
  }

  // the bed under water, as the wild lakes; bridges (roads stamped dry) stay at the surface
  heightAt(x, z) { return elevation.at(x, z) - cityWater.depthAt(x, z); }
  isWater(x, z) { return cityWater.wetAt(x, z); }

  // Floor indoors, else ground; over water the surface with bed `dip` and float depth, so everyone swims alike.
  surface(x, z, out) {
    const i = shellAt(x, z);
    out.base = i >= 0 && !collision.shells[i].raised ? collision.shells[i].floor : elevation.at(x, z);
    out.dip = i >= 0 ? 0 : -cityWater.depthAt(x, z);
    out.float = WILD_FLOAT_DEPTH;
  }

  waterSources() { return cityWater.locations; }

  population(humans) {
    const o = this.opts;
    return [
      { type: 'plant', count: o.plants ? NPC_PLANT_POPULATION : 0, src: this },
      { type: 'human', count: o.people ? humans : 0, src: this },
      { type: 'deer', count: o.deer ? NPC_DEER_POPULATION : 0, src: this }
    ];
  }

  regrow(w) {
    if (this.opts.plants && Math.random() < PLANT_REGROW_P) w.spawnPlant(this);
  }

  // Spawn candidates (engine checks isOpen, spacing): people on sidewalks and open ground, deer on green areas, see plantSpot.
  spawnPoint(type) {
    if (type === 'plant') return this.plantSpot();
    if (type === 'human') {
      if (this.segs.length && Math.random() < 0.8) return this.sidewalkPoint();
      return this.anyPoint();
    }
    if (this.greens.length && Math.random() < DEER_GREEN_SHARE) return this.greenPoint();
    return this.anyPoint();
  }

  anyPoint() {
    const b = this.bounds;
    return [b.minX + Math.random() * (b.maxX - b.minX), b.minZ + Math.random() * (b.maxZ - b.minZ)];
  }

  buildSidewalks(roads) {
    const segs = [];
    let total = 0;
    for (const r of roads) {
      const half = (r.width ?? ROAD_WIDTH[r.kind]) / 2;
      const path = PATH_KINDS.has(r.kind);
      for (let i = 0; i < r.pts.length - 1; i++) {
        const [x0, z0] = r.pts[i], [x1, z1] = r.pts[i + 1];
        const len = Math.hypot(x1 - x0, z1 - z0);
        if (len < 1) continue;
        total += len;
        segs.push({ x0, z0, x1, z1, len, half, path, cum: total });
      }
    }
    this.segs = segs;
    this.segTotal = total;
  }

  // A sidewalk beside a street, or anywhere across a path.
  sidewalkPoint() {
    const segs = this.segs;
    const target = Math.random() * this.segTotal;
    let lo = 0, hi = segs.length - 1;
    while (lo < hi) { const mid = (lo + hi) >> 1; if (segs[mid].cum < target) lo = mid + 1; else hi = mid; }
    const s = segs[lo];
    const t = Math.random();
    const nx = -(s.z1 - s.z0) / s.len, nz = (s.x1 - s.x0) / s.len;
    const off = s.path
      ? (Math.random() * 2 - 1) * s.half * 0.6
      : (Math.random() < 0.5 ? -1 : 1) * (s.half + 1 + Math.random() * 2);
    return [s.x0 + (s.x1 - s.x0) * t + nx * off, s.z0 + (s.z1 - s.z0) * t + nz * off];
  }

  // Green land cover with bounds and cumulative (habitat-weighted) area, for picks weighted by size.
  buildGreens(areas) {
    this.greens = [];
    let total = 0;
    for (const ar of areas) {
      if (!DEER_AREAS.has(ar.kind)) continue;
      const size = Math.abs(ringArea(ar.pts));
      if (size < 25) continue;
      total += size * (this.habitat ? (this.habitat[ar.kind] ?? 1) : 1);
      this.greens.push({ pts: ar.pts, b: bounds(ar.pts), cum: total });
    }
    this.greenTotal = total;
  }

  // Random point in a green area picked by area; null if it lands outside the ring.
  greenPoint() {
    const greens = this.greens;
    const target = Math.random() * this.greenTotal;
    let lo = 0, hi = greens.length - 1;
    while (lo < hi) { const mid = (lo + hi) >> 1; if (greens[mid].cum < target) lo = mid + 1; else hi = mid; }
    const g = greens[lo], b = g.b;
    const x = b.minX + Math.random() * (b.maxX - b.minX);
    const z = b.minZ + Math.random() * (b.maxZ - b.minZ);
    return pointInRing(g.pts, x, z) ? [x, z] : null;
  }

  // City: where a plant can grow: green areas if any, else open ground; never road, indoors or water.
  plantSpot() {
    for (let k = 0; k < PLANT_SPOT_TRIES; k++) {
      let x, z;
      if (this.greens.length) {
        const p = this.greenPoint();
        if (!p) continue;
        [x, z] = p;
      } else {
        [x, z] = this.anyPoint();
      }
      if (!isOpen(x, z)) continue;
      const r = nearestRoad(this.roadIdx, x, z, 0);
      if (r && r.d === 0) continue;
      return [x, z];
    }
    return null;
  }
}
export let wildGroveList = null;
export function wildGroves() {
  if (!wildGroveList) {
    wildGroveList = WILD_GROVES.split('|').map(g => {
      const v = g.split(' ').map(Number), pts = [];
      for (let i = 0; i + 1 < v.length; i += 2) pts.push([v[i] / 10, v[i + 1] / 10]);
      return pts;
    });
  }
  return wildGroveList;
}

export class WildernessWorld {
  constructor(city, seed, opts = city ? city.opts : null) {
    this.kind = 'wilderness';
    this.city = city;
    this.opts = opts;
    this.seed = seed;
    this.R = city ? city.radius : 0;
    this.h = !city ? 0 : elevation.active ? Math.min(this.R + ELEV_MARGIN, elevation.half) : this.R;
    const ring = Math.min(MIX_RING_MAX, Math.max(MIX_RING_MIN,
      0.6 * Math.max(CONFIG.worldWidth, CONFIG.worldHeight) * NPC_UNIT));
    this.step = Number.isInteger(this.h / 10) ? 10 : 5;
    const M = this.h + Math.ceil(ring / this.step) * this.step;
    this.bounds = { minX: -M, maxX: M, minZ: -M, maxZ: M };
    this.wraps = false;
    this.shadows = true;
    this.companion = true;
    this.rays = 'single';
    this.level = 0;
    this.offset = 0;
    this.edgeMean = 0;
    this.grid = null;
    this.locations = [];
    this.cabins = [];
    // the wilderness as a spawn source of its own (the city spawns its own people, deer and plants)
    this.wild = {
      spawnPoint: t => this.wildPoint(t)
    };
  }

  inside(x, z) { return this.city !== null && Math.abs(x) <= this.h && Math.abs(z) <= this.h; }
  inCity(x, z) { return this.city !== null && Math.abs(x) <= this.R && Math.abs(z) <= this.R; }

  // Height outside the measured square: the edge's height fades to its mean, then into the offset procedural ground.
  blend(x, z) {
    if (!this.city) return wildTerrain.metresAt(x, z) + this.offset;
    const h = this.h;
    const ex = Math.max(Math.abs(x) - h, 0), ez = Math.max(Math.abs(z) - h, 0);
    const d = Math.hypot(ex, ez);
    const cx = Math.max(-h, Math.min(h, x)), cz = Math.max(-h, Math.min(h, z));
    const edge = elevation.active ? elevation.at(cx, cz) : 0;
    if (d <= 0) return edge;
    const real = edge + (this.edgeMean - edge) * wildTerrain.smoothstep(0, MIX_BLEND * 0.6, d);
    const n = wildTerrain.valueNoise(x / 170 + 11.3, z / 170 - 7.1);
    const t = wildTerrain.smoothstep(0, MIX_BLEND, d * (0.6 + 0.8 * n));
    const proc = wildTerrain.metresAt(x, z) + this.offset;
    return real + (proc - real) * t;
  }

  // Level, offset and heights: procedural median lifted to the city edge's mean; lakes kept below the lowest edge point.
  terrainStep() {
    const b = this.bounds, h = this.h;
    wildTerrain.initSeed(this.seed);
    const outside = (x, z) => this.inside(x, z);
    const raw = wildTerrain.computeLevel(b, outside);
    wildTerrain.lakeRef = raw / NPC_UNIT;

    if (!this.city) {
      // no city to meet: the procedural land as generated, its own water level
      this.offset = 0;
      this.edgeMean = 0;
      this.level = raw;
    } else {
      let sum = 0, n = 0, lo = Infinity;
      for (let s = -h; s <= h; s += 5) {
        for (const [x, z] of [[s, -h], [s, h], [-h, s], [h, s]]) {
          const e = elevation.active ? elevation.at(x, z) : 0;
          sum += e; n++;
          if (e < lo) lo = e;
        }
      }
      this.edgeMean = sum / n;

      const samples = [];
      for (let iz = 0; iz < 64; iz++) {
        for (let ix = 0; ix < 64; ix++) {
          const x = b.minX + (ix + 0.5) / 64 * (b.maxX - b.minX), z = b.minZ + (iz + 0.5) / 64 * (b.maxZ - b.minZ);
          if (!this.inside(x, z)) samples.push(wildTerrain.metresAt(x, z));
        }
      }
      samples.sort((a, c) => a - c);
      const median = samples.length ? samples[samples.length >> 1] : 0;
      this.offset = this.edgeMean - median;
      this.level = Math.min(raw + this.offset, lo - 0.5);
    }

    const step = this.step;
    const nx = Math.round((b.maxX - b.minX) / step) + 1;
    this.grid = new HeightGrid(b.minX, b.minZ, step, nx, nx);
    this.grid.fill((x, z) => coastHeight(x, z, this.blend(x, z), b, this.level));

    // The wild mesh drops quads inside the city's terrain mesh and tucks a one-quad ring under it, so no crack opens.
    const inner = h - step + 1e-6;
    const skip = (i, j) => {
      const xa = b.minX + i * step, xb = xa + step, za = b.minZ + j * step, zb = za + step;
      return Math.max(Math.abs(xa), Math.abs(xb)) <= inner && Math.max(Math.abs(za), Math.abs(zb)) <= inner;
    };
    const sink = (x, z) => (Math.abs(x) < h - 1e-6 && Math.abs(z) < h - 1e-6) ? MIX_SINK : 0;
    addWildLayer(heightMesh(this.grid, skip, sink));
    ground.visible = false;
    providers.version++;
  }

  waterStep() {
    wildWater.createPlane(this.bounds, this.level, this.h);
    this.locations = shoreline(this.grid, this.level, (x, z) => this.inside(x, z));
  }

  cabinStep() {
    const b = this.bounds, h = this.h + 20;
    const count = Math.floor(Math.log(CONFIG.scale)) * 2;
    const pick = () => {
      for (let k = 0; k < 40; k++) {
        const x = b.minX + 20 + Math.random() * (b.maxX - b.minX - 40);
        const z = b.minZ + 20 + Math.random() * (b.maxZ - b.minZ - 40);
        if (Math.abs(x) > h || Math.abs(z) > h) return [x, z];
      }
      return [b.maxX - 30, b.maxZ - 30];
    };
    // the first cabin: the player's, just past the measured square, its door toward the city's centre
    const first = this.cabinSite();
    const firstYaw = first ? Math.atan2(-first[0], -first[1]) : 0;
    this.cabins = placeCabins(count, first, firstYaw, pick, (x, z) => this.heightAt(x, z), this.level);
    pebbles.init();
    pebbles.place(() => this.wildAnyPoint(), (x, z) => this.heightAt(x, z));
  }

  // WILD GROVES: each grove placed whole at a random spot and turn, off water, city, cabins and edges; tree count kept.
  treeStep() {
    const GROVE_TRIES = 60, TREE_TRIES = 40;
    const b = this.bounds, dry = this.level + 0.3, clear = 44 * CABIN_SCALE * CABIN_M;
    const ok = (x, z) => x > b.minX + 2 && x < b.maxX - 2 && z > b.minZ + 2 && z < b.maxZ - 2 &&
      !this.inside(x, z) && this.grid.at(x, z) > dry &&
      !this.cabins.some(c => Math.hypot(c.x - x, c.z - z) < clear);
    const anywhere = () => [b.minX + Math.random() * (b.maxX - b.minX), b.minZ + Math.random() * (b.maxZ - b.minZ)];

    const out = [];
    let placed = 0;
    for (const grove of wildGroves()) {
      let best = null;
      for (let k = 0; k < GROVE_TRIES && !(best && best.fit === grove.length); k++) {
        const [ax, az] = anywhere();
        const turn = Math.random() * Math.PI * 2, co = Math.cos(turn), si = Math.sin(turn);
        const pts = [];
        let fit = 0;
        for (const [dx, dz] of grove) {
          const x = ax + dx * co - dz * si, z = az + dx * si + dz * co, good = ok(x, z);
          if (good) fit++;
          pts.push(good ? [x, z] : null);
        }
        if (!best || fit > best.fit) best = { ax, az, pts, fit };
      }
      let reach = 15;
      for (const [dx, dz] of grove) reach = Math.max(reach, Math.hypot(dx, dz));
      let any = false;
      for (let p of best.pts) {
        for (let k = 0; !p && k < TREE_TRIES * 2; k++) {
          let x, z;
          if (k < TREE_TRIES) {
            const a = Math.random() * Math.PI * 2, r = Math.sqrt(Math.random()) * reach;
            x = best.ax + Math.cos(a) * r; z = best.az + Math.sin(a) * r;
          } else {
            [x, z] = anywhere();
          }
          if (ok(x, z)) p = [x, z];
        }
        if (p) { out.push({ x: p[0], z: p[1] }); any = true; }
      }
      if (any) placed++;
    }
    const trunkSolids = buildTrees(out, (x, z) => this.grid.at(x, z), addWildLayer);
    addSolids(trunkSolids);
    cover.add(trunkSolids);
    return [out.length, placed];
  }

  // Nearest dry, level spot outside the measured square: rings outward, flattest spot on the first ring with one.
  cabinSite() {
    const b = this.bounds, dry = this.level + 4 * NPC_UNIT;
    const reach = 44 * CABIN_SCALE * CABIN_M + CAR_WID + 4.5;
    const N = 72;
    for (let t = this.h + 25; t <= b.maxX - reach - 20; t += 10) {
      let best = null;
      for (let i = 0; i < N; i++) {
        const a = i / N * 2 * Math.PI;
        const dx = Math.sin(a), dz = Math.cos(a), k = t / Math.max(Math.abs(dx), Math.abs(dz));
        const x = dx * k, z = dz * k;
        let lo = Infinity, hi = -Infinity;
        for (let j = 0; j < 12; j++) {
          for (const r of [0, reach * 0.5, reach]) {
            const q = j / 12 * 2 * Math.PI, hh = this.heightAt(x + Math.cos(q) * r, z + Math.sin(q) * r);
            if (hh < lo) lo = hh;
            if (hh > hi) hi = hh;
          }
        }
        if (lo < dry) continue;
        const slope = hi - lo;
        if (slope < 0.8 && (!best || slope < best.slope)) best = { x, z, slope };
      }
      if (best) return [best.x, best.z];
    }
    return null;
  }

  // The player starts in the first cabin, facing out its door toward the city.
  playerStart() {
    const c = this.cabins[0];
    return { x: c.x, z: c.z, y: c.floor + 0.02, yaw: c.yaw + Math.PI };
  }

  teardown() {
    clearWildLayers();
    wildWater.dispose();
    pebbles.dispose();
    shelters.list = [];
    ground.visible = true;
    if (this.city) this.city.teardown();
  }

  heightAt(x, z) {
    return this.inside(x, z) ? this.city.heightAt(x, z) : this.grid.at(x, z);
  }

  isWater(x, z) {
    return this.inside(x, z) ? cityWater.wetAt(x, z) : this.grid.at(x, z) < this.level;
  }

  surface(x, z, out) {
    if (this.inside(x, z)) { this.city.surface(x, z, out); return; }
    const hh = this.grid.at(x, z);
    if (hh < this.level) { out.base = this.level; out.dip = hh - this.level; }
    else { out.base = hh; out.dip = 0; }
    out.float = WILD_FLOAT_DEPTH;
  }

  waterSources() { return this.city ? this.city.waterSources().concat(this.locations) : this.locations; }

  // Both ecosystems from their own spawn rules (city: people, deer, plants; wilderness: people, coyotes, deer, plants).
  population() {
    const o = this.opts, P = CONFIG.people;
    const wildHumans = this.city
      ? Math.round(P * NPC_WILD_PEOPLE_WEIGHT / (NPC_WILD_PEOPLE_WEIGHT + NPC_CITY_PEOPLE_WEIGHT)) : P;
    return (this.city ? this.city.population(P - wildHumans) : []).concat([
      { type: 'plant', count: o.plants ? CONFIG.initialPlants : 0, src: this.wild },
      { type: 'coyote', count: CONFIG.initialCoyotes, src: this.wild },
      { type: 'deer', count: CONFIG.initialDeer, src: this.wild },
      { type: 'human', count: o.people ? wildHumans : 0, src: this.wild }
    ]);
  }

  regrow(w) {
    if (this.city) this.city.regrow(w);
    if (this.opts.plants && Math.random() < CONFIG.probSpawnPlant) w.spawnPlant(this.wild);
  }

  // anywhere outside the city's mapped streets (the measured ring past it counts as wild)
  wildAnyPoint() {
    const b = this.bounds;
    for (let k = 0; k < 20; k++) {
      const x = b.minX + Math.random() * (b.maxX - b.minX), z = b.minZ + Math.random() * (b.maxZ - b.minZ);
      if (!this.inCity(x, z)) return [x, z];
    }
    return null;
  }

  // Wilderness spawns; some coyotes and deer start in the city's parks and woods (habitat inside the city).
  wildPoint(type) {
    if ((type === 'coyote' || type === 'deer') && this.city && this.city.greens.length && Math.random() < MIX_PARK_SHARE) return this.city.greenPoint();
    if (type !== 'plant') return this.wildAnyPoint();
    for (let k = 0; k < PLANT_SPOT_TRIES; k++) {
      const p = this.wildAnyPoint();
      if (p && isOpen(p[0], p[1])) return p;
    }
    return null;
  }
}
// INTRO SCENE: the intro screen's backdrop before any world loads: a preset street front (built by buildCity) and a
// few people and animals walking lanes across the view. Metres; the camera stands at the origin looking down -z.
// Each lane: depth range (z), walkers per species, and speed shares (of the species' Arena speed). A walker past
// the view's edge at its depth by offscreenM comes back in at the other edge.
export const INTRO_SCENE = {
  hour: 20,                     // the sky's hour: dusk, lit windows
  eye: { pitch: 0.12 },         // radians, looking slightly up at the facades
  offscreenM: 3,
  walkers: {
    human: { count: 6, z: [[-6.2, -5.0], [-17.2, -16.0]], speed: [0.8, 1.1] },   // the two sidewalks
    deer: { count: 2, z: [[-13.5, -8.5]], speed: [1.6, 2.0] },                  // across the road
    coyote: { count: 2, z: [[-13.5, -8.5]], speed: [1.8, 2.4] }
  },
  // footprints [x0, z0, x1, z1] with their floors; the row stands behind the far sidewalk
  buildings: [
    [-58, -19, -35, -44, 11], [-34, -19, -15, -40, 15], [-14, -20, 5, -42, 24],
    [6, -19, 22, -36, 9], [23, -19, 44, -45, 17], [45, -19, 66, -40, 12]
  ],
  road: { z: -11, kind: 'secondary', width: 9 },
  sidewalks: [{ z: -5.6, width: 2.4 }, { z: -16.6, width: 2.4 }],
  spanM: 80                     // half length of the road and sidewalks
};

// INTRO WORLD: the provider for the intro scene. It drives its walkers itself (drive, called from Ecosystem.step),
// so no brain, hunt or need runs; no HUD (hud: false).
export class IntroWorld {
  constructor() {
    this.kind = 'intro';
    this.bounds = { minX: -200, maxX: 200, minZ: -200, maxZ: 200 };
    this.wraps = false;
    this.shadows = true;
    this.companion = false;
    this.rays = 'off';
    this.city = null;
    this.hud = false;
    this.lanes = new Map();   // walker -> { z, dir, speedScale }
  }

  build() {
    const S = INTRO_SCENE, span = S.spanM;
    const line = z => [[-span, z], [span, z]];
    const features = {
      buildings: S.buildings.map(([x0, z0, x1, z1, levels]) => ({
        pts: [[x0, z0], [x1, z0], [x1, z1], [x0, z1]], tags: { building: 'yes', 'building:levels': String(levels) }
      })),
      roads: [{ pts: line(S.road.z), kind: S.road.kind, width: S.road.width, oneway: false, lanes: null }]
        .concat(S.sidewalks.map(s => ({ pts: line(s.z), kind: 'footway', width: s.width, oneway: false, lanes: null }))),
      areas: [], waterways: [], trees: [], barriers: [], pois: [], props: [], entrances: [], places: []
    };
    resetObstacles();
    buildCity(features);
  }

  // the sky hour the scene borrowed goes back (loadIntroScene sets INTRO_SCENE.hour)
  teardown() { if (this.prevHour !== undefined) this.clock.hour = this.prevHour; }

  heightAt() { return 0; }
  isWater() { return false; }
  surface(x, z, out) { out.base = 0; out.dip = 0; out.float = WILD_FLOAT_DEPTH; }
  waterSources() { return []; }
  regrow() { }

  population() {
    return Object.entries(INTRO_SCENE.walkers).map(([type, w]) => ({ type, count: w.count, src: this }));
  }

  // A start on one of the species' lanes, somewhere across the view.
  spawnPoint(type) {
    const w = INTRO_SCENE.walkers[type];
    if (!w) return null;
    const [za, zb] = w.z[Math.floor(Math.random() * w.z.length)];
    const z = za + Math.random() * (zb - za);
    const half = this.viewHalfWidth(-z);
    return [(Math.random() * 2 - 1) * half, z];
  }

  // Half the view's width at `depth` metres ahead of the camera.
  viewHalfWidth(depth) {
    return depth * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2) * camera.aspect;
  }

  // One tick of the walkers: each keeps its lane and direction at its own pace, and comes back at the far edge
  // once offscreenM past the near one.
  drive(w, dt) {
    const S = INTRO_SCENE;
    for (const a of w.animals) {
      let lane = this.lanes.get(a);
      if (!lane) {
        const sp = S.walkers[a.type].speed;
        lane = { z: a.position.z, dir: Math.random() < 0.5 ? -1 : 1, speedScale: sp[0] + Math.random() * (sp[1] - sp[0]) };
        this.lanes.set(a, lane);
      }
      a.heading = a.targetHeading = a.facingAngle = wrapAngle(Math.atan2(lane.dir, 0));
      a.moving = true;
      a.sprinting = false;
      a.speedScale = lane.speedScale;
      a.bumpScale = 1;
      a.move();
      a.position.z = lane.z;
      const edge = this.viewHalfWidth(-lane.z) + S.offscreenM;
      if (a.position.x * lane.dir > edge) a.position.x = -lane.dir * edge;
    }
    w.ticks++;
    return true;
  }
}
