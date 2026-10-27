// 5-collision.js: COLLISION. Walls, shells, occupancy, cover and spawn checks over what the providers built.
// Owns: collision (wallGrid/gridWalls: solids pushed against and stood on; shellGrid/shells: building footprints
// for roofs and floors; solidStamp/stampNo: per-query visit marks; obstacleThroats: doorway lanes), the shell
// raster (shellRas, shellAt, shellAtExact, buildShellRaster, pointInShell, nearShell), buildGrid, addSolids,
// resetObstacles, resolveCollisions, moveAndCollide, supportAt, ceilingAt, solidOverlap, cover, occ, and the spawn
// checks (spawnOk, streetSpawn, outdoorSpawn).
// May import: 1-config.js, 2-core.js, 4-provider.js. Config blocks it reads: player, collision grid, shells, NPC
// radius and height, occupancy, cover, spawn.
import {
  HEAD_CLEAR, EYE_HEIGHT, PLAYER_RADIUS, GRID_CELL, LAND_EPS, SUBSTEP, STEP_UP, PATH_KINDS, SHELL_CELL,
  SHELL_MAX_CELLS, SHELL_OUT, SHELL_AMBIG, SHELL_EPS, NPC_RADIUS, NPC_COLLIDE_H, OCC_CELL, OCC_INV, OCC_CARVE_KEEP,
  COVER_CELL, OCC_TILE_BITS, OCC_TILE_MASK, OCC_TILE_WORDS, SPAWN_CLEAR, STREET_STEP
} from './1-config.js';
import {
  gridOf, cellKey, pointInRing, closestOnRing
} from './2-core.js';
import {
  groundAt, isWaterAt, baseAt
} from './4-provider.js';

export function pointInShell(s, x, z) {
  if (!pointInRing(s.pts, x, z)) return false;
  for (const h of s.holes) if (pointInRing(h, x, z)) return false;
  return true;
}

// COLLISION: grid/gridWalls are solids pushed against and stood on; shellGrid/shells are footprints for roofs and floors.

// The collision state: rebuilt per world by buildGrid, addSolids, buildCity and resetObstacles.
export const collision = {
  wallGrid: new Map(),
  gridWalls: [],   // solids; wallGrid buckets index into it
  shellGrid: new Map(),
  shells: [],   // building footprints; shellGrid buckets index into it
  solidStamp: new Uint32Array(0),
  stampNo: 0,   // solidStamp[i] === stampNo: solid i already visited this query
  obstacleThroats: [],   // doorways occ carves open (cabin throats, from placeCabins)
  openBounds: { minX: 0, maxX: 0, minZ: 0, maxZ: 0 }   // the ecosystem's bounds, for isOpen (set by initialize)
};
export const shellRas = { cells: null, x0: 0, z0: 0, cols: 0, rows: 0, cell: SHELL_CELL, inv: 1 / SHELL_CELL };

export function buildGrid(solids) {
  collision.gridWalls = solids;
  collision.wallGrid = gridOf(solids, GRID_CELL);
  collision.solidStamp = new Uint32Array(solids.length);
  collision.stampNo = 0;
}

// OBSTACLE INDEX: one grid of every provider's solids and doorway lanes, for collisions and the NPC occupancy grid.

export function resetObstacles() {
  collision.obstacleThroats = [];
  collision.wallGrid = new Map(); collision.gridWalls = [];
  collision.shellGrid = new Map(); collision.shells = [];
  shellRas.cells = null; shellRas.cols = 0; shellRas.rows = 0;
  collision.solidStamp = new Uint32Array(0); collision.stampNo = 0;
}

export function addSolids(list) {
  if (!list.length) return;
  const first = collision.gridWalls.length;
  collision.gridWalls = collision.gridWalls.concat(list);
  for (let i = 0; i < list.length; i++) {
    const w = list[i];
    const x0 = Math.floor(w.minX / GRID_CELL), x1 = Math.floor(w.maxX / GRID_CELL);
    const z0 = Math.floor(w.minZ / GRID_CELL), z1 = Math.floor(w.maxZ / GRID_CELL);
    for (let cx = x0; cx <= x1; cx++) {
      for (let cz = z0; cz <= z1; cz++) {
        const k = cellKey(cx, cz);
        let bucket = collision.wallGrid.get(k);
        if (!bucket) collision.wallGrid.set(k, bucket = []);
        bucket.push(first + i);
      }
    }
  }
  collision.solidStamp = new Uint32Array(collision.gridWalls.length);
  collision.stampNo = 0;
}

// Push a circle out of overlapping solids (callers substep so thin walls are not skipped); returns whether it pushed.
export function resolveCollisions(pos, r = PLAYER_RADIUS,
  feetY = pos.y - EYE_HEIGHT, headY = pos.y + HEAD_CLEAR, stepUp = 0) {
  let pushed = false;

  for (let pass = 0; pass < 4; pass++) {
    let moved = false;
    // solids are filed under every cell they touch, so only the circle's own cells (1 to 4) matter
    const cx0 = Math.floor((pos.x - r) / GRID_CELL), cx1 = Math.floor((pos.x + r) / GRID_CELL);
    const cz0 = Math.floor((pos.z - r) / GRID_CELL), cz1 = Math.floor((pos.z + r) / GRID_CELL);
    if (++collision.stampNo >= 0xffffffff) { collision.solidStamp.fill(0); collision.stampNo = 1; }

    for (let gx = cx0; gx <= cx1; gx++) {
      for (let gz = cz0; gz <= cz1; gz++) {
        const bucket = collision.wallGrid.get(cellKey(gx, gz));
        if (!bucket) continue;

        for (const idx of bucket) {
          if (collision.solidStamp[idx] === collision.stampNo) continue;
          collision.solidStamp[idx] = collision.stampNo;
          const w = collision.gridWalls[idx];
          // skip pieces the column is fully above or below, or can step onto
          if (feetY + stepUp >= w.top - LAND_EPS || headY <= w.base) continue;
          if (pos.x < w.minX - r || pos.x > w.maxX + r || pos.z < w.minZ - r || pos.z > w.maxZ + r) continue;

          // the crossing test only runs inside the piece's box; most hits are decided by distance
          const inside = pos.x >= w.minX && pos.x <= w.maxX && pos.z >= w.minZ && pos.z <= w.maxZ &&
            pointInRing(w.pts, pos.x, pos.z);
          const c = closestOnRing(w.pts, pos.x, pos.z);

          if (inside) {
            let dx = c.x - pos.x, dz = c.z - pos.z;
            const len = Math.hypot(dx, dz) || 1;
            pos.x = c.x + (dx / len) * r;
            pos.z = c.z + (dz / len) * r;
            moved = true;
          } else if (c.d < r) {
            let dx = pos.x - c.x, dz = pos.z - c.z;
            const len = Math.hypot(dx, dz) || 1;
            pos.x = c.x + (dx / len) * r;
            pos.z = c.z + (dz / len) * r;
            moved = true;
          }
        }
      }
    }
    if (!moved) break;
    pushed = true;
  }
  return pushed;
}

// Horizontal move with collision in steps of at most SUBSTEP; `stepUp` walks onto low ledges.
export function moveAndCollide(pos, dx, dz, stepUp = 0) {
  const n = Math.max(1, Math.ceil(Math.hypot(dx, dz) / SUBSTEP));
  for (let k = 0; k < n; k++) {
    pos.x += dx / n;
    pos.z += dz / n;
    resolveCollisions(pos, PLAYER_RADIUS, pos.y - EYE_HEIGHT, pos.y + HEAD_CLEAR, stepUp);
  }
}

// Highest surface the feet pass down through (or the terrain); only ones they started above count.
export function supportAt(x, z, fromFeet, toFeet, stepUp = 0) {
  let best = groundAt(x, z);
  const cx = Math.floor(x / GRID_CELL), cz = Math.floor(z / GRID_CELL);
  const ok = y => y > best && y <= fromFeet + LAND_EPS + stepUp && y >= toFeet;

  for (let ox = -1; ox <= 1; ox++) {
    for (let oz = -1; oz <= 1; oz++) {
      const key = cellKey(cx + ox, cz + oz);

      const bucket = collision.wallGrid.get(key);
      if (bucket) {
        for (const idx of bucket) {
          const w = collision.gridWalls[idx];
          if (!ok(w.top)) continue;
          if (x < w.minX || x > w.maxX || z < w.minZ || z > w.maxZ) continue;
          if (pointInRing(w.pts, x, z)) best = w.top;
        }
      }

      const sb = collision.shellGrid.get(key);
      if (sb) {
        for (const idx of sb) {
          const w = collision.shells[idx];
          const roof = ok(w.top), floor = ok(w.floor);
          if (!roof && !floor) continue;
          if (x < w.minX || x > w.maxX || z < w.minZ || z > w.maxZ) continue;
          if (!pointInShell(w, x, z)) continue;
          if (roof) best = w.top;
          else best = w.floor;
        }
      }
    }
  }
  return best;
}

// Lowest overhead surface the head passes up through, or Infinity.
export function ceilingAt(x, z, fromHead, toHead) {
  let best = Infinity;
  const g = groundAt(x, z);
  const cx = Math.floor(x / GRID_CELL), cz = Math.floor(z / GRID_CELL);
  const ok = y => y < best && y >= fromHead - LAND_EPS && y < toHead;

  for (let ox = -1; ox <= 1; ox++) {
    for (let oz = -1; oz <= 1; oz++) {
      const key = cellKey(cx + ox, cz + oz);

      const bucket = collision.wallGrid.get(key);
      if (bucket) {
        for (const idx of bucket) {
          const w = collision.gridWalls[idx];
          if (w.base <= g + 0.05 || !ok(w.base)) continue;
          if (x < w.minX || x > w.maxX || z < w.minZ || z > w.maxZ) continue;
          if (pointInRing(w.pts, x, z)) best = w.base;
        }
      }

      const sb = collision.shellGrid.get(key);
      if (sb) {
        for (const idx of sb) {
          const w = collision.shells[idx];
          const ceil = ok(w.ceil), under = w.raised && ok(w.base);
          if (!ceil && !under) continue;
          if (x < w.minX || x > w.maxX || z < w.minZ || z > w.maxZ) continue;
          if (!pointInShell(w, x, z)) continue;
          if (under) best = w.base;
          else best = w.ceil;
        }
      }
    }
  }
  return best;
}

// COVER: solids that block NPC sight (building and cabin walls, parked cars, lamp posts), each a convex quad
// with a height range. Doorways are gaps between wall pieces, so NPCs see through open doors.
export const cover = {
  items: [], grid: new Map(), stamp: new Uint32Array(0), no: 0,
  // the grid's buckets laid out over the box of filed cells, so blocks() indexes an array instead of hashing a key per cell
  flat: [], fx0: 0, fz0: 0, fw: 0, fh: 0,

  reset() { this.clear(); },   // teardownWorld's entry
  clear() { this.items = []; this.grid = new Map(); this.stamp = new Uint32Array(0); this.no = 0; this.flat = []; this.fw = this.fh = 0; },

  // Appends `list` to the cover set, filing each piece in the grid cells its bounds touch.
  add(list) {
    if (!list.length) return;
    const first = this.items.length;
    for (const w of list) {
      let cx = 0, cz = 0;
      for (const p of w.pts) { cx += p[0]; cz += p[1]; }
      cx /= w.pts.length; cz /= w.pts.length;
      // outward edge normals: a point is inside when n . p <= c for every edge
      w.cnx = []; w.cnz = []; w.cc = [];
      for (let i = 0, j = w.pts.length - 1; i < w.pts.length; j = i++) {
        const a = w.pts[j], b = w.pts[i];
        let nx = b[1] - a[1], nz = a[0] - b[0];
        if (nx * (cx - a[0]) + nz * (cz - a[1]) > 0) { nx = -nx; nz = -nz; }
        w.cnx.push(nx); w.cnz.push(nz); w.cc.push(nx * a[0] + nz * a[1]);
      }
    }
    this.items = this.items.concat(list);
    for (let i = 0; i < list.length; i++) {
      const w = list[i];
      const x0 = Math.floor(w.minX / COVER_CELL), x1 = Math.floor(w.maxX / COVER_CELL);
      const z0 = Math.floor(w.minZ / COVER_CELL), z1 = Math.floor(w.maxZ / COVER_CELL);
      for (let cx = x0; cx <= x1; cx++) {
        for (let cz = z0; cz <= z1; cz++) {
          const k = cellKey(cx, cz);
          let bucket = this.grid.get(k);
          if (!bucket) this.grid.set(k, bucket = []);
          bucket.push(first + i);
        }
      }
    }
    this.stamp = new Uint32Array(this.items.length);
    this.no = 0;
    this.index();
  },

  // Rebuilds `flat` from the grid's keys (cellKey's layout).
  index() {
    let c0 = Infinity, c1 = -Infinity, r0 = Infinity, r1 = -Infinity;
    for (const k of this.grid.keys()) {
      const cx = Math.floor(k / 16384) - 8192, cz = k % 16384 - 8192;
      if (cx < c0) c0 = cx;
      if (cx > c1) c1 = cx;
      if (cz < r0) r0 = cz;
      if (cz > r1) r1 = cz;
    }
    if (c0 > c1) { this.flat = []; this.fw = this.fh = 0; return; }
    this.fx0 = c0; this.fz0 = r0; this.fw = c1 - c0 + 1; this.fh = r1 - r0 + 1;
    const flat = this.flat = new Array(this.fw * this.fh).fill(null);
    for (const [k, bucket] of this.grid) {
      const cx = Math.floor(k / 16384) - 8192, cz = k % 16384 - 8192;
      flat[(cz - r0) * this.fw + (cx - c0)] = bucket;
    }
  },

  // Does the sight line from a to b pass through any cover piece within its height range? Walks the grid cells
  // the line crosses (Amanatides-Woo) and clips the line against each piece filed there (Cyrus-Beck).
  blocks(ax, ay, az, bx, by, bz) {
    if (this.items.length === 0) return false;
    const C = COVER_CELL, dx = bx - ax, dz = bz - az, dy = by - ay;
    let cx = Math.floor(ax / C), cz = Math.floor(az / C);
    const ex = Math.floor(bx / C), ez = Math.floor(bz / C);
    const sx = dx > 0 ? 1 : -1, sz = dz > 0 ? 1 : -1;
    const tdx = dx !== 0 ? C / Math.abs(dx) : Infinity, tdz = dz !== 0 ? C / Math.abs(dz) : Infinity;
    let tmx = dx !== 0 ? (dx > 0 ? (cx + 1) * C - ax : ax - cx * C) / Math.abs(dx) : Infinity;
    let tmz = dz !== 0 ? (dz > 0 ? (cz + 1) * C - az : az - cz * C) / Math.abs(dz) : Infinity;
    if (++this.no >= 0xffffffff) { this.stamp.fill(0); this.no = 1; }
    const flat = this.flat, fx0 = this.fx0, fz0 = this.fz0, fw = this.fw, fh = this.fh;
    for (let guard = 0; guard < 1024; guard++) {
      const fc = cx - fx0, fr = cz - fz0;
      const bucket = fc >= 0 && fr >= 0 && fc < fw && fr < fh ? flat[fr * fw + fc] : null;
      if (bucket) {
        for (const k of bucket) {
          if (this.stamp[k] === this.no) continue;
          this.stamp[k] = this.no;
          const w = this.items[k];
          let t0 = 0, t1 = 1;
          for (let e = 0; e < w.cc.length && t0 <= t1; e++) {
            const num = w.cc[e] - (w.cnx[e] * ax + w.cnz[e] * az);
            const den = w.cnx[e] * dx + w.cnz[e] * dz;
            if (den === 0) { if (num < 0) t1 = -1; }
            else if (den > 0) { const t = num / den; if (t < t1) t1 = t; }
            else { const t = num / den; if (t > t0) t0 = t; }
          }
          if (t0 > t1) continue;
          const y0 = ay + dy * t0, y1 = ay + dy * t1;
          if (Math.min(y0, y1) < w.top && Math.max(y0, y1) > w.base) return true;
        }
      }
      if (cx === ex && cz === ez) break;
      if (Math.min(tmx, tmz) > 1) break;
      if (tmx < tmz) { tmx += tdx; cx += sx; } else { tmz += tdz; cz += sz; }
    }
    return false;
  }
};
export const occ = {
  tiles: new Map(),
  _lk: NaN, _lt: null,

  // flat index of the tiles over their bounding box, made at the end of build() (tiles are only created there)
  flat: null, fc0: 0, fr0: 0, fw: 0, fh: 0,

  // A cell with no tile is open; Animal.move keeps to the provider's bounds.
  blockedAt(x, z) {
    const c = Math.floor(x * OCC_INV), r = Math.floor(z * OCC_INV);
    let t;
    if (this.flat !== null) {
      const tc = (c >> OCC_TILE_BITS) - this.fc0, tr = (r >> OCC_TILE_BITS) - this.fr0;
      if (tc < 0 || tr < 0 || tc >= this.fw || tr >= this.fh) return false;
      t = this.flat[tr * this.fw + tc];
      if (t === null) return false;
    } else {
      t = this.tiles.get(cellKey(c >> OCC_TILE_BITS, r >> OCC_TILE_BITS));
      if (t === undefined) return false;
    }
    const i = ((r & OCC_TILE_MASK) << OCC_TILE_BITS) | (c & OCC_TILE_MASK);
    return ((t[i >>> 5] >>> (i & 31)) & 1) === 1;
  },

  reset() { this.clear(); },   // teardownWorld's entry
  clear() {
    this.tiles = new Map();
    this._lk = NaN; this._lt = null;
    this.flat = null;
  },

  index() {
    this.flat = null;
    if (this.tiles.size === 0) { this.fw = this.fh = 0; this.flat = []; return; }
    let c0 = Infinity, c1 = -Infinity, r0 = Infinity, r1 = -Infinity;
    for (const k of this.tiles.keys()) {
      const tc = Math.floor(k / 16384) - 8192, tr = k - (tc + 8192) * 16384 - 8192;
      if (tc < c0) c0 = tc; if (tc > c1) c1 = tc;
      if (tr < r0) r0 = tr; if (tr > r1) r1 = tr;
    }
    const fw = c1 - c0 + 1, fh = r1 - r0 + 1;
    const flat = new Array(fw * fh).fill(null);
    for (const [k, t] of this.tiles) {
      const tc = Math.floor(k / 16384) - 8192, tr = k - (tc + 8192) * 16384 - 8192;
      flat[(tr - r0) * fw + (tc - c0)] = t;
    }
    this.fc0 = c0; this.fr0 = r0; this.fw = fw; this.fh = fh;
    this.flat = flat;
  },

  build() {
    this.clear();
    for (const w of collision.gridWalls) {
      if (w.walkable) continue;
      const gp = groundAt((w.minX + w.maxX) / 2, (w.minZ + w.maxZ) / 2);
      if (w.top <= gp + LAND_EPS || w.base >= gp + NPC_COLLIDE_H) continue;
      const pts = w.pts;
      this.fillRing(pts);
      for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) this.stampSeg(pts[j], pts[i], NPC_RADIUS);
    }

    // doorway lanes (building throats, cabin doors), run a cell past the grown wall on both sides
    const ext = NPC_RADIUS + OCC_CELL;
    const lane = ([ox, oz, qx, qz]) => {
      const len = Math.hypot(qx - ox, qz - oz);
      if (len < 1e-6) return;
      const ux = (qx - ox) / len, uz = (qz - oz) / len;
      this.carve(ox - ux * ext, oz - uz * ext, qx + ux * ext, qz + uz * ext);
    };
    for (const s of collision.shells) for (const t of s.throats) lane(t);
    for (const t of collision.obstacleThroats) lane(t);
    this.index();
  },

  set(c, r) {
    const k = cellKey(c >> OCC_TILE_BITS, r >> OCC_TILE_BITS);
    let t;
    if (k === this._lk) t = this._lt;
    else {
      t = this.tiles.get(k);
      if (t === undefined) { this.tiles.set(k, t = new Uint32Array(OCC_TILE_WORDS)); this.flat = null; }
      this._lk = k; this._lt = t;
    }
    const i = ((r & OCC_TILE_MASK) << OCC_TILE_BITS) | (c & OCC_TILE_MASK);
    t[i >>> 5] |= 1 << (i & 31);
  },

  fillRing(pts) {
    let zMin = Infinity, zMax = -Infinity;
    for (const p of pts) { if (p[1] < zMin) zMin = p[1]; if (p[1] > zMax) zMax = p[1]; }
    const r0 = Math.floor(zMin * OCC_INV), r1 = Math.floor(zMax * OCC_INV);
    const xs = [];
    for (let r = r0; r <= r1; r++) {
      const zc = (r + 0.5) * OCC_CELL;
      xs.length = 0;
      for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
        const [xi, zi] = pts[i], [xj, zj] = pts[j];
        if ((zi > zc) !== (zj > zc)) xs.push(xi + (zc - zi) * (xj - xi) / (zj - zi));
      }
      xs.sort((a, b) => a - b);
      for (let k = 0; k + 1 < xs.length; k += 2) {
        const c0 = Math.ceil(xs[k] * OCC_INV - 0.5);
        const c1 = Math.floor(xs[k + 1] * OCC_INV - 0.5);
        for (let c = c0; c <= c1; c++) this.set(c, r);
      }
    }
  },

  stampSeg(a, b, half) {
    const [x0, z0] = a, [x1, z1] = b;
    const dx = x1 - x0, dz = z1 - z0, l2 = dx * dx + dz * dz, h2 = half * half;
    const c0 = Math.floor((Math.min(x0, x1) - half) * OCC_INV);
    const c1 = Math.floor((Math.max(x0, x1) + half) * OCC_INV);
    const r0 = Math.floor((Math.min(z0, z1) - half) * OCC_INV);
    const r1 = Math.floor((Math.max(z0, z1) + half) * OCC_INV);
    for (let r = r0; r <= r1; r++) {
      const zc = (r + 0.5) * OCC_CELL;
      for (let c = c0; c <= c1; c++) {
        const xc = (c + 0.5) * OCC_CELL;
        let t = l2 > 0 ? ((xc - x0) * dx + (zc - z0) * dz) / l2 : 0;
        t = t < 0 ? 0 : t > 1 ? 1 : t;
        const ex = xc - (x0 + dx * t), ez = zc - (z0 + dz * t);
        if (ex * ex + ez * ez < h2) this.set(c, r);
      }
    }
  },

  // Clear a 4-connected lane through a doorway so narrow doors stay passable; cells within OCC_CARVE_KEEP of a solid stay blocked.
  carve(ax, az, bx, bz) {
    const n = Math.max(1, Math.ceil(Math.hypot(bx - ax, bz - az) * OCC_INV * 4));
    let pc = 0, pr = 0;
    for (let k = 0; k <= n; k++) {
      const c = Math.floor((ax + (bx - ax) * k / n) * OCC_INV);
      const r = Math.floor((az + (bz - az) * k / n) * OCC_INV);
      if (k > 0) {
        if (c === pc && r === pr) continue;
        if (c !== pc && r !== pr) this.unblock(c, pr);
      }
      this.unblock(c, r);
      pc = c; pr = r;
    }
  },

  unblock(c, r) {
    const t = this.tiles.get(cellKey(c >> OCC_TILE_BITS, r >> OCC_TILE_BITS));
    if (t === undefined) return;
    const x = (c + 0.5) * OCC_CELL, z = (r + 0.5) * OCC_CELL;
    const f = baseAt(x, z) + STEP_UP;
    if (solidOverlap(x, z, OCC_CARVE_KEEP, f, f + NPC_COLLIDE_H)) return;
    const i = ((r & OCC_TILE_MASK) << OCC_TILE_BITS) | (c & OCC_TILE_MASK);
    t[i >>> 5] &= ~(1 << (i & 31));
  }
};

// CITY GEOMETRY QUERIES (NPC placement, on the player's grids)

// Does a circle (radius r, column feetY..headY) touch any solid? Read-only resolveCollisions.
export function solidOverlap(x, z, r, feetY, headY) {
  const cx0 = Math.floor((x - r) / GRID_CELL), cx1 = Math.floor((x + r) / GRID_CELL);
  const cz0 = Math.floor((z - r) / GRID_CELL), cz1 = Math.floor((z + r) / GRID_CELL);
  for (let gx = cx0; gx <= cx1; gx++) {
    for (let gz = cz0; gz <= cz1; gz++) {
      const bucket = collision.wallGrid.get(cellKey(gx, gz));
      if (!bucket) continue;
      for (const idx of bucket) {
        const w = collision.gridWalls[idx];
        if (feetY >= w.top - LAND_EPS || headY <= w.base) continue;
        if (x < w.minX - r || x > w.maxX + r || z < w.minZ - r || z > w.maxZ + r) continue;
        if (x >= w.minX && x <= w.maxX && z >= w.minZ && z <= w.maxZ &&
          pointInRing(w.pts, x, z)) return true;
        if (closestOnRing(w.pts, x, z).d < r) return true;
      }
    }
  }
  return false;
}

// Building index containing (x, z), or -1 outdoors; raster first, exact test on edge cells.
export function shellAt(x, z) {
  const R = shellRas;
  if (R.cells === null) return shellAtExact(x, z);
  const c = Math.floor((x - R.x0) * R.inv), r = Math.floor((z - R.z0) * R.inv);
  if (c >= 0 && r >= 0 && c < R.cols && r < R.rows) {
    const v = R.cells[r * R.cols + c];
    return v === SHELL_AMBIG ? shellAtExact(x, z) : v;
  }
  return -1;
}

// Two passes: mark cells a ring edge touches AMBIG, then test one centre per run of other cells along each row.
export function buildShellRaster(list) {
  const R = shellRas;
  R.cells = null; R.cols = 0; R.rows = 0;
  if (!list.length) return;

  let minX = Infinity, minZ = Infinity, maxX = -Infinity, maxZ = -Infinity;
  for (const s of list) {
    if (s.minX < minX) minX = s.minX;
    if (s.maxX > maxX) maxX = s.maxX;
    if (s.minZ < minZ) minZ = s.minZ;
    if (s.maxZ > maxZ) maxZ = s.maxZ;
  }
  const area = (maxX - minX + 2) * (maxZ - minZ + 2);
  const cell = Math.max(SHELL_CELL, Math.sqrt(area / SHELL_MAX_CELLS));
  const inv = 1 / cell;
  const x0 = minX - cell, z0 = minZ - cell;
  const cols = Math.ceil((maxX - x0) * inv) + 2;
  const rows = Math.ceil((maxZ - z0) * inv) + 2;
  const cells = new (list.length < 32767 ? Int16Array : Int32Array)(cols * rows).fill(SHELL_OUT);
  const E = SHELL_EPS;

  // pass 1: segment vs (slightly grown) cell over its bounding cells
  const markEdge = (ax, az, bx, bz) => {
    const c0 = Math.max(0, Math.floor((Math.min(ax, bx) - E - x0) * inv));
    const c1 = Math.min(cols - 1, Math.floor((Math.max(ax, bx) + E - x0) * inv));
    const r0 = Math.max(0, Math.floor((Math.min(az, bz) - E - z0) * inv));
    const r1 = Math.min(rows - 1, Math.floor((Math.max(az, bz) + E - z0) * inv));
    const dx = bx - ax, dz = bz - az;
    for (let r = r0; r <= r1; r++) {
      const zlo = z0 + r * cell - E - az, zhi = zlo + cell + 2 * E;
      for (let c = c0; c <= c1; c++) {
        const xlo = x0 + c * cell - E - ax, xhi = xlo + cell + 2 * E;
        const s1 = dx * zlo - dz * xlo, s2 = dx * zlo - dz * xhi;
        const s3 = dx * zhi - dz * xlo, s4 = dx * zhi - dz * xhi;
        if ((s1 > 0 && s2 > 0 && s3 > 0 && s4 > 0) || (s1 < 0 && s2 < 0 && s3 < 0 && s4 < 0)) continue;
        cells[r * cols + c] = SHELL_AMBIG;
      }
    }
  };
  const markRing = pts => {
    for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
      markEdge(pts[j][0], pts[j][1], pts[i][0], pts[i][1]);
    }
  };
  for (const s of list) {
    markRing(s.pts);
    for (const h of s.holes) markRing(h);
  }

  // pass 2: inside one shell takes its index; inside a second, AMBIG
  for (let idx = 0; idx < list.length; idx++) {
    const s = list[idx];
    const c0 = Math.floor((s.minX - x0) * inv), c1 = Math.floor((s.maxX - x0) * inv);
    const r0 = Math.floor((s.minZ - z0) * inv), r1 = Math.floor((s.maxZ - z0) * inv);
    for (let r = r0; r <= r1; r++) {
      const zc = z0 + (r + 0.5) * cell;
      let inRun = false, inside = false;
      for (let c = c0; c <= c1; c++) {
        const k = r * cols + c, v = cells[k];
        if (v === SHELL_AMBIG) { inRun = false; continue; }
        if (!inRun) { inside = pointInShell(s, x0 + (c + 0.5) * cell, zc); inRun = true; }
        if (inside) cells[k] = v === SHELL_OUT ? idx : SHELL_AMBIG;
      }
    }
  }

  R.cells = cells; R.x0 = x0; R.z0 = z0; R.cols = cols; R.rows = rows;
  R.cell = cell; R.inv = inv;
}

export function shellAtExact(x, z) {
  const bucket = collision.shellGrid.get(cellKey(Math.floor(x / GRID_CELL), Math.floor(z / GRID_CELL)));
  if (!bucket) return -1;
  for (const idx of bucket) {
    const s = collision.shells[idx];
    if (x < s.minX || x > s.maxX || z < s.minZ || z > s.maxZ) continue;
    if (pointInShell(s, x, z)) return idx;
  }
  return -1;
}

// Is (x, z) within m of a footprint outline? Catches doorways the solid test misses.
export function nearShell(x, z, m) {
  const cx0 = Math.floor((x - m) / GRID_CELL), cx1 = Math.floor((x + m) / GRID_CELL);
  const cz0 = Math.floor((z - m) / GRID_CELL), cz1 = Math.floor((z + m) / GRID_CELL);
  for (let gx = cx0; gx <= cx1; gx++) {
    for (let gz = cz0; gz <= cz1; gz++) {
      const bucket = collision.shellGrid.get(cellKey(gx, gz));
      if (!bucket) continue;
      for (const idx of bucket) {
        const s = collision.shells[idx];
        if (x < s.minX - m || x > s.maxX + m || z < s.minZ - m || z > s.maxZ + m) continue;
        if (closestOnRing(s.pts, x, z).d < m) return true;
      }
    }
  }
  return false;
}

// Nearest outdoor, dry spot the player fits, searching rings outward; falls back to (x, z).
export function spawnOk(px, pz) {
  const g = groundAt(px, pz);
  return shellAt(px, pz) < 0 && !isWaterAt(px, pz) &&
    !nearShell(px, pz, SPAWN_CLEAR) &&
    !solidOverlap(px, pz, PLAYER_RADIUS + 0.1, g, g + EYE_HEIGHT + HEAD_CLEAR);
}

// Nearest qualifying point on a vehicle street, or null.
export function streetSpawn(roads, x, z) {
  const cands = [];
  for (const r of roads || []) {
    if (PATH_KINDS.has(r.kind)) continue;
    for (let i = 0; i < r.pts.length - 1; i++) {
      const [x0, z0] = r.pts[i], [x1, z1] = r.pts[i + 1];
      const n = Math.max(1, Math.ceil(Math.hypot(x1 - x0, z1 - z0) / STREET_STEP));
      for (let k = 0; k <= n; k++) {
        const px = x0 + (x1 - x0) * k / n, pz = z0 + (z1 - z0) * k / n;
        cands.push({ px, pz, d: (px - x) ** 2 + (pz - z) ** 2 });
      }
    }
  }
  cands.sort((a, b) => a.d - b.d);
  for (const c of cands) if (spawnOk(c.px, c.pz)) return [c.px, c.pz];
  return null;
}

export function outdoorSpawn(x, z, maxR = 200) {
  const ok = spawnOk;
  if (ok(x, z)) return [x, z];
  for (let d = 0.5; d <= maxR; d += 0.5) {
    const n = Math.max(8, Math.ceil(2 * Math.PI * d / 0.5));
    for (let i = 0; i < n; i++) {
      const a = (i / n) * 2 * Math.PI;
      const px = x + Math.cos(a) * d, pz = z + Math.sin(a) * d;
      if (ok(px, pz)) return [px, pz];
    }
  }
  return [x, z];
}

// OPEN SPOT (the ecosystem's former isOpen): inside the open bounds less 1 m, dry, outside buildings and the
// occupancy grid, and clear of solids at NPC size. initialize sets collision.openBounds from the provider.
export function isOpen(x, z) {
  const b = collision.openBounds;
  const m = 1;
  if (x < b.minX + m || x > b.maxX - m || z < b.minZ + m || z > b.maxZ - m) return false;
  if (isWaterAt(x, z)) return false;
  if (shellAt(x, z) >= 0) return false;
  if (occ.blockedAt(x, z)) return false;
  const g = groundAt(x, z);
  return !solidOverlap(x, z, NPC_RADIUS + 0.15, g, g + NPC_COLLIDE_H);
}
