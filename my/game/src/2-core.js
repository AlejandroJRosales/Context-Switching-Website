// 2-core.js: CORE. Math and spatial helpers every layer shares, plus the frame loop's state.
// Owns: fmt, hash01, seededRandom, cellKey, gridOf, ring geometry (ringArea, bounds, dedupeRing, orientRing,
// offsetRing, pointInRing, closestOnRing), fightEase/fightClamp01, TWO_PI/wrapAngle/turnToward, MathTools (and its
// instance tools), SpatialGrid, ContactGrid, solarVector, moonVector, and `loop` with wake() and invalidate().
// May import: 1-config.js. No three, no DOM building; wake() runs loop.frame, which 9-main registers.
import {
  MITER_MAX
} from './1-config.js';

export const fmt = n => n.toLocaleString('en-US');

export function ringArea(pts) {
  let a = 0;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    a += (pts[j][0] * pts[i][1]) - (pts[i][0] * pts[j][1]);
  }
  return a / 2;
}

export function bounds(pts) {
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (const [x, z] of pts) {
    if (x < minX) minX = x; if (x > maxX) maxX = x;
    if (z < minZ) minZ = z; if (z > maxZ) maxZ = z;
  }
  return { minX, maxX, minZ, maxZ };
}

// BUILDING SHELLS: thick walls (also collision rings), doorway, floor, ceiling/roof; edge left normals point into the wall.

export function dedupeRing(pts) {
  const out = [];
  for (const p of pts) {
    const q = out[out.length - 1];
    if (!q || Math.hypot(p[0] - q[0], p[1] - q[1]) > 0.02) out.push(p);
  }
  while (out.length > 2) {
    const a = out[0], b = out[out.length - 1];
    if (Math.hypot(a[0] - b[0], a[1] - b[1]) > 0.02) break;
    out.pop();
  }
  return out;
}

export function orientRing(pts, positive) {
  return (ringArea(pts) > 0) === positive ? pts : pts.slice().reverse();
}

// Mitred inner outline of a wall of thickness t; an edge whose inner side reverses is unusable.
export function offsetRing(pts, t) {
  const n = pts.length, E = new Array(n), inner = new Array(n);
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const dx = pts[j][0] - pts[i][0], dz = pts[j][1] - pts[i][1];
    const L = Math.hypot(dx, dz);
    E[i] = { i, L, ux: dx / L, uz: dz / L, nx: -dz / L, nz: dx / L, a0: 0, a1: 0 };
  }
  for (let i = 0; i < n; i++) {
    const e0 = E[(i - 1 + n) % n], e1 = E[i];
    const d = 1 + e0.nx * e1.nx + e0.nz * e1.nz;
    let mx, mz;
    if (d < 0.05) { mx = e1.nx * t; mz = e1.nz * t; }   // edge doubles back on itself
    else { mx = (e0.nx + e1.nx) / d * t; mz = (e0.nz + e1.nz) / d * t; }
    const ml = Math.hypot(mx, mz), cap = MITER_MAX * t;
    if (ml > cap) { mx *= cap / ml; mz *= cap / ml; }
    inner[i] = [pts[i][0] + mx, pts[i][1] + mz];
  }
  let ok = true;
  for (let i = 0; i < n; i++) {
    const e = E[i], j = (i + 1) % n;
    e.a0 = (inner[i][0] - pts[i][0]) * e.ux + (inner[i][1] - pts[i][1]) * e.uz;
    e.a1 = (inner[j][0] - pts[j][0]) * e.ux + (inner[j][1] - pts[j][1]) * e.uz;
    if (e.L + e.a1 - e.a0 < 0.02) ok = false;
  }
  return { pts, inner, E, t, ok };
}

// DOOR PLACEMENT

export function gridOf(items, cell) {
  const g = new Map();
  for (let i = 0; i < items.length; i++) {
    const w = items[i];
    const x0 = Math.floor(w.minX / cell), x1 = Math.floor(w.maxX / cell);
    const z0 = Math.floor(w.minZ / cell), z1 = Math.floor(w.maxZ / cell);
    for (let cx = x0; cx <= x1; cx++) {
      for (let cz = z0; cz <= z1; cz++) {
        const k = cellKey(cx, cz);
        let bucket = g.get(k);
        if (!bucket) g.set(k, bucket = []);
        bucket.push(i);
      }
    }
  }
  return g;
}

export function hash01(i) {
  const v = Math.sin(i * 12.9898 + 78.233) * 43758.5453;
  return v - Math.floor(v);
}

// Small seeded generator so each building's roof layout is stable between loads.
export function seededRandom(seed) {
  let a = (seed * 2654435761) >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Integer cell key, no string; unique while |cx|, |cz| < 8192.
export function cellKey(cx, cz) { return (cx + 8192) * 16384 + (cz + 8192); }

export function pointInRing(pts, x, z) {
  let inside = false;
  // indexed reads, not destructuring: this runs in the per-tick footing and wall tests
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const pi = pts[i], pj = pts[j];
    const xi = pi[0], zi = pi[1], xj = pj[0], zj = pj[1];
    if ((zi > z) !== (zj > z) && x < (xj - xi) * (z - zi) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}

export const near = { x: 0, z: 0, d: 0 };
export function closestOnRing(pts, x, z) {
  let best = Infinity, bx = x, bz = z;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const pi = pts[i], pj = pts[j];
    const xi = pi[0], zi = pi[1], xj = pj[0], zj = pj[1];
    const dx = xi - xj, dz = zi - zj;
    const len2 = dx * dx + dz * dz;
    let t = len2 > 0 ? ((x - xj) * dx + (z - zj) * dz) / len2 : 0;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    const px = xj + dx * t, pz = zj + dz * t;
    const d = (x - px) * (x - px) + (z - pz) * (z - pz);
    if (d < best) { best = d; bx = px; bz = pz; }
  }
  near.x = bx; near.z = bz; near.d = Math.sqrt(best);
  return near;
}
export const fightEase = x => x * x * (3 - 2 * x);
export const fightClamp01 = x => x < 0 ? 0 : x > 1 ? 1 : x;

// ANGLES (Animal's former statics): headings live in [0, TWO_PI); turnToward steps by at most maxStep.
export const TWO_PI = Math.PI * 2;

export function wrapAngle(a) {
  a %= TWO_PI;
  return a < 0 ? a + TWO_PI : a;
}

export function turnToward(from, to, maxStep) {
  let d = (to - from) % TWO_PI;
  if (d > Math.PI) d -= TWO_PI;
  else if (d < -Math.PI) d += TWO_PI;
  if (d > maxStep) d = maxStep; else if (d < -maxStep) d = -maxStep;
  return wrapAngle(from + d);
}

// SHARED HELPERS

export class MathTools {
  distSq(x1, y1, x2, y2) {
    return (x2 - x1) ** 2 + (y2 - y1) ** 2;
  }

  clamp(value, minimum, maximum) {
    return Math.max(Math.min(value, maximum), minimum);
  }

  wrap(value, size) {
    return ((value % size) + size) % size;
  }

  random(min = 0, max = 1) {
    return Math.random() * (max - min) + min;
  }
}

export class SpatialGrid {
  constructor(worldW, worldH, cellSize) {
    this.cellSize = cellSize;
    this.cols = Math.ceil(worldW / cellSize);
    this.rows = Math.ceil(worldH / cellSize);
    // Flat array of buckets, made on first insert and only emptied on rebuild: lookups are indexes, rebuilds allocate nothing.
    this.cells = null;
    // One bit per cell, set while its bucket holds anything, so queryInto skips empty cells without reading `cells`.
    this.filled = null;
    this.rb = { cx0: 0, cx1: 0, cy0: 0, cy1: 0, ccx: 0, ccy: 0, K: 0, edge: 0, W: 0 };
    this.nearD2 = Infinity;
  }

  _key(cx, cy) { return cy * this.cols + cx; }

  _cell(x, z) {
    const cx = Math.floor(x / this.cellSize) % this.cols;
    const cy = Math.floor(z / this.cellSize) % this.rows;
    return this._key((cx + this.cols) % this.cols, (cy + this.rows) % this.rows);
  }

  _alloc() {
    this.cells = new Array(this.cols * this.rows).fill(null);
    this.filled = new Int32Array((this.cols * this.rows + 31) >>> 5);
  }

  insert(entity) {
    if (this.cells === null) this._alloc();
    const k = this._cell(entity.position.x, entity.position.z);
    let bucket = this.cells[k];
    if (bucket === null) bucket = this.cells[k] = [];
    bucket.push(entity);
    this.filled[k >>> 5] |= 1 << (k & 31);
    return k;
  }

  // Append to bucket k (for a grid kept up to date by moves; insert() computes k itself).
  place(entity, k) {
    if (this.cells === null) this._alloc();
    let bucket = this.cells[k];
    if (bucket === null) bucket = this.cells[k] = [];
    bucket.push(entity);
    this.filled[k >>> 5] |= 1 << (k & 31);
  }

  remove(entity, k) {
    const bucket = this.cells === null ? null : this.cells[k];
    if (!bucket) return;
    const i = bucket.indexOf(entity);
    if (i < 0) return;
    bucket.splice(i, 1);
    if (bucket.length === 0) this.filled[k >>> 5] &= ~(1 << (k & 31));
  }

  ringBox(x, z, r) {
    const cs = this.cellSize, b = this.rb;
    b.cx0 = Math.floor((x - r) / cs); b.cx1 = Math.floor((x + r) / cs);
    b.cy0 = Math.floor((z - r) / cs); b.cy1 = Math.floor((z + r) / cs);
    b.ccx = Math.floor(x / cs); b.ccy = Math.floor(z / cs);
    b.K = Math.max(b.ccx - b.cx0, b.cx1 - b.ccx, b.ccy - b.cy0, b.cy1 - b.ccy);
    b.edge = Math.min(x - b.ccx * cs, (b.ccx + 1) * cs - x, z - b.ccy * cs, (b.ccy + 1) * cs - z);
    b.W = b.cx1 - b.cx0 + 1;
    return b;
  }

  ringFloor(k) { return (k - 1) * this.cellSize + this.rb.edge - 1e-6; }

  nearest(x, z, r, maxD2, live, beat = Infinity) {
    this.nearD2 = beat;
    const cells = this.cells;
    if (cells === null) return null;
    const cols = this.cols, rows = this.rows;
    const { cx0, cx1, cy0, cy1, ccx, ccy, K, W } = this.ringBox(x, z, r);
    let best = null, bestD2 = beat, bestKey = -1;
    const early = W <= cols && cy1 - cy0 < rows;
    for (let k = 0; k <= K; k++) {
      if (k > 0 && early) {
        const L = this.ringFloor(k);
        if (L > 0 && (L * L > maxD2 || bestD2 < L * L)) break;
      }
      const j0 = Math.max(cy0, ccy - k), j1 = Math.min(cy1, ccy + k);
      for (let j = j0; j <= j1; j++) {
        const row = (((j % rows) + rows) % rows) * cols;
        const full = j === ccy - k || j === ccy + k;
        const step = full ? 1 : 2 * k;
        const iEnd = Math.min(cx1, ccx + k);
        for (let i = full ? Math.max(cx0, ccx - k) : ccx - k; i <= iEnd; i += step) {
          if (i < cx0) continue;
          const bucket = cells[row + ((i % cols) + cols) % cols];
          if (bucket === null) continue;
          const base = ((j - cy0) * W + (i - cx0)) * 1048576;
          for (let b = 0; b < bucket.length; b++) {
            const it = bucket[b];
            if (live && !it.alive) continue;
            const p = it.position, dx = p.x - x, dz = p.z - z, d2 = dx * dx + dz * dz;
            if (d2 > maxD2 || d2 > bestD2) continue;
            if (d2 < bestD2 || base + b > bestKey) { best = it; bestD2 = d2; bestKey = base + b; }
          }
        }
      }
    }
    this.nearD2 = bestD2;
    return best;
  }

  queryInto(out, x, z, r) {
    const cells = this.cells;
    if (cells === null) return 0;
    let n = 0;
    const cs = this.cellSize, cols = this.cols, rows = this.rows, filled = this.filled;
    const cx0 = Math.floor((x - r) / cs), cx1 = Math.floor((x + r) / cs);
    const cy0 = Math.floor((z - r) / cs), cy1 = Math.floor((z + r) / cs);
    for (let cy = cy0; cy <= cy1; cy++) {
      const row = (((cy % rows) + rows) % rows) * cols;
      for (let cx = cx0; cx <= cx1; cx++) {
        const k = row + ((cx % cols) + cols) % cols;
        if ((filled[k >>> 5] & (1 << (k & 31))) === 0) continue;
        const bucket = cells[k];
        for (let i = 0; i < bucket.length; i++) out[n++] = bucket[i];
      }
    }
    return n;
  }
}

// CONTACT GRID: animals counting-sorted into small hashed cells for hunt/mate queries; collisions only add candidates.
export class ContactGrid {
  constructor(cellSize, bits = 16) {
    this.cellSize = cellSize;
    this.inv = 1 / cellSize;
    this.mask = (1 << bits) - 1;
    this.start = new Int32Array(this.mask + 2);
    this.cursor = new Int32Array(this.mask + 1);
    this.cellOf = new Int32Array(1024);
    this.items = [];
    this.hs = new Int32Array(64);
  }

  hash(cx, cz) { return (Math.imul(cx, 73856093) ^ Math.imul(cz, 19349663)) & this.mask; }

  rebuild(list) {
    const n = list.length, start = this.start, cursor = this.cursor, inv = this.inv;
    if (this.cellOf.length < n) this.cellOf = new Int32Array(n * 2);
    const cellOf = this.cellOf;
    start.fill(0);
    let m = 0;
    for (let i = 0; i < n; i++) {
      const a = list[i];
      if (!a.alive) { cellOf[i] = -1; continue; }
      const h = this.hash(Math.floor(a.position.x * inv), Math.floor(a.position.z * inv));
      cellOf[i] = h; start[h + 1]++; m++;
    }
    const M = this.mask + 1;
    for (let h = 0; h < M; h++) { start[h + 1] += start[h]; cursor[h] = start[h]; }
    const items = this.items;
    items.length = m;
    for (let i = 0; i < n; i++) {
      const h = cellOf[i];
      if (h >= 0) items[cursor[h]++] = list[i];
    }
  }

  // Distinct hashes of the cells covering (x, z) +- r into this.hs; returns how many.
  cellsFor(x, z, r) {
    const inv = this.inv;
    const cx0 = Math.floor((x - r) * inv), cx1 = Math.floor((x + r) * inv);
    const cz0 = Math.floor((z - r) * inv), cz1 = Math.floor((z + r) * inv);
    if ((cx1 - cx0 + 1) * (cz1 - cz0 + 1) > this.hs.length) this.hs = new Int32Array((cx1 - cx0 + 1) * (cz1 - cz0 + 1) * 2);
    const hs = this.hs;
    let nh = 0;
    for (let cz = cz0; cz <= cz1; cz++) {
      for (let cx = cx0; cx <= cx1; cx++) {
        const h = this.hash(cx, cz);
        let dup = false;
        for (let q = 0; q < nh; q++) if (hs[q] === h) { dup = true; break; }
        if (!dup) hs[nh++] = h;
      }
    }
    return nh;
  }
}

export const tools = new MathTools();

// The loop runs only while the image can change (input, airborne, pose or scene change), else sleeps.
// The frame loop's state: last frame time (-1 asleep), the pending rAF id (0 none), whether the scene changed since
// the last draw, and the frame function main registers (wake schedules it).
export const loop = { last: -1, rafId: 0, sceneDirty: true, frame: null };

export function wake() {
  if (document.hidden) return;
  if (!loop.rafId) loop.rafId = requestAnimationFrame(loop.frame);
}

// call after adding, removing, or re-texturing anything
export function invalidate() {
  loop.sceneDirty = true;
  wake();
}

// SKY

// Sun position (NOAA low precision, ~0.1 degree) from the true UTC instant: east/north/up and altitude in degrees.
export function solarVector(lat, lon, date) {
  const R = Math.PI / 180;
  const d = date.getTime() / 86400000 - 10957.5;      // days since J2000.0

  const L = (280.460 + 0.9856474 * d) * R;            // mean longitude
  const g = (357.528 + 0.9856003 * d) * R;            // mean anomaly
  const lam = L + 1.915 * R * Math.sin(g) + 0.020 * R * Math.sin(2 * g);
  const eps = (23.439 - 0.0000004 * d) * R;           // obliquity

  const dec = Math.asin(Math.sin(eps) * Math.sin(lam));
  const ra = Math.atan2(Math.cos(eps) * Math.sin(lam), Math.cos(lam));

  const gmst = 18.697374558 + 24.06570982441908 * d;
  const lst = (gmst * 15 + lon) * R;
  const H = lst - ra;

  const phi = lat * R;
  const up = Math.sin(dec) * Math.sin(phi) + Math.cos(dec) * Math.cos(H) * Math.cos(phi);
  const north = Math.sin(dec) * Math.cos(phi) - Math.cos(dec) * Math.cos(H) * Math.sin(phi);
  const east = -Math.cos(dec) * Math.sin(H);

  return { east, north, up, altDeg: Math.asin(up) / R };
}

// Moon position, as solarVector: low-precision lunar series (~0.3 degree) plus topocentric parallax.
export function moonVector(lat, lon, date) {
  const R = Math.PI / 180;
  const d = date.getTime() / 86400000 - 10957.5;
  const T = d / 36525;
  const S = x => Math.sin(x * R);

  const lam = (218.32 + 481267.881 * T
    + 6.29 * S(135.0 + 477198.87 * T) - 1.27 * S(259.3 - 413335.36 * T)
    + 0.66 * S(235.7 + 890534.22 * T) + 0.21 * S(269.9 + 954397.74 * T)
    - 0.19 * S(357.5 + 35999.05 * T) - 0.11 * S(186.5 + 966404.03 * T)) * R;
  const bet = (5.13 * S(93.3 + 483202.02 * T) + 0.28 * S(228.2 + 960400.89 * T)
    - 0.28 * S(318.3 + 6003.15 * T) - 0.17 * S(217.6 - 407332.21 * T)) * R;
  const eps = (23.439 - 0.013 * T) * R;

  const x = Math.cos(bet) * Math.cos(lam);
  const y = Math.cos(eps) * Math.cos(bet) * Math.sin(lam) - Math.sin(eps) * Math.sin(bet);
  const z = Math.sin(eps) * Math.cos(bet) * Math.sin(lam) + Math.cos(eps) * Math.sin(bet);
  const ra = Math.atan2(y, x), dec = Math.asin(z);

  const gmst = 18.697374558 + 24.06570982441908 * d;
  const H = (gmst * 15 + lon) * R - ra;
  const phi = lat * R;
  let up = Math.sin(dec) * Math.sin(phi) + Math.cos(dec) * Math.cos(H) * Math.cos(phi);
  let north = Math.sin(dec) * Math.cos(phi) - Math.cos(dec) * Math.cos(H) * Math.sin(phi);
  let east = -Math.cos(dec) * Math.sin(H);

  // parallax: seen from the surface the moon sits lower by ~0.95 deg * cos(alt)
  const alt = Math.asin(up) - 0.95 * R * Math.cos(Math.asin(up));
  const h = Math.hypot(east, north) || 1, ch = Math.cos(alt);
  east = east / h * ch; north = north / h * ch; up = Math.sin(alt);

  return { east, north, up, altDeg: alt / R };
}
