// 3-gfx-io.js: GFX and IO, two halves that do not import each other.
// GFX half owns: the saved Graphics choice, renderer, scene, camera, rig, view pose, lights (hemi, sun, moon) and the
// shadow setup with three's shadow-chunk edge fade (patched before any material compiles), the flat ground plane, the
// high-graphics MSAA pass, the colour and buffer helpers (rgb, cssColor, pushTri, pushQuad, bufGeom, tint, ribbon,
// areaGeom, box, cyl), the ground-cell splitters and cellCull, and perf (Graphics-low flag, LOD distances, instance
// uploads, setText).
// IO half owns: Nominatim geocoding, hedged Overpass requests, the hosted city files, Terrarium elevation tiles, and
// the OSM parsers (featuresFrom and its helpers).
// May import: 1-config.js, 2-core.js, three. Config blocks it reads: graphics, shadows, network, terrain, layers,
// places, city files.
import * as THREE from 'three';
import {
  DEFAULT_LEVELS, METERS_PER_LVL, OVERPASS_TIMEOUT_MS, OVERPASS_QUERY_TIMEOUT, OVERPASS_HEDGE_MS,
  OVERPASS_MAX_PARALLEL, OVERPASS_MIRRORS, NOMINATIM_URL, TERRAIN_URL, TERRAIN_MAX_Z, TERRAIN_MIN_Z, TERRAIN_TILE_PX,
  TERRAIN_MAX_TILES, TERRAIN_TIMEOUT_MS, TERRAIN_SPIKE_M, TERRAIN_SPIKE_FRAC, ELEV_STEP, ELEV_MARGIN, ROAD_WIDTH,
  AREA_COLOR, WATERWAY_WIDTH, BARRIER, TREE_ROW_SPACING, LANDUSE_RE, LEISURE_RE, BARRIER_RE, PLACE_KEYS, PLACE_OF,
  PLACE_RE, LOW_PIXEL_RATIO, HIGH_FOG_FAR, LOW_FOG_FAR, FOG_NEAR, HIGH_CAMERA_FAR, LOW_CAMERA_FAR, LOW_NPC_LOD_DIST,
  LOW_FAR_STAT_DIST, MSAA_SAMPLES_WANTED, GRAPHICS_KEY, HEMI_DAY, SHADOW_BOX_HALF, SHADOW_EDGE_FADE, SHADOW_MAP_MAX,
  SHADOW_DEPTH, SHADOW_BIAS_M, GROUND_CELL_M, SHADOW_SOFTNESS, CITY_FILE_DIR, CITY_FILES, HIGH_NPC_LOD_DIST,
  HIGH_FAR_STAT_DIST
} from './1-config.js';
import {
  fmt, ringArea, pointInRing
} from './2-core.js';

// GFX HALF
export function savedGraphics() {
  try { const v = localStorage.getItem(GRAPHICS_KEY); return v === 'high' || v === 'low' ? v : null; }
  catch (e) { return null; }
}
export const startGraphics = savedGraphics();
// high graphics unless the player last chose low
export const startLowPower = startGraphics === 'low';
export const renderer = new THREE.WebGLRenderer({ antialias: false });
renderer.setPixelRatio(Math.min(devicePixelRatio, startLowPower ? LOW_PIXEL_RATIO : 2));
renderer.setSize(innerWidth, innerHeight);
// Skip three's shader log checks (~0.5 s of load); a shader that fails to compile no longer logs why.
renderer.debug.checkShaderErrors = false;
renderer.xr.enabled = true;
renderer.shadowMap.enabled = false;          // Graphics: high turns sun shadows on over wild terrain
// PCF (not PCF soft): three's soft variant ignores shadow.radius; this one widens its taps by it (SHADOW_SOFTNESS)
renderer.shadowMap.type = THREE.PCFShadowMap;
export const MSAA_SAMPLES = Math.min(MSAA_SAMPLES_WANTED, renderer.capabilities.maxSamples || 4);

export const scene = new THREE.Scene();
scene.background = new THREE.Color(0x9fb4c8);
scene.fog = new THREE.Fog(0x9fb4c8, FOG_NEAR, startLowPower ? LOW_FOG_FAR : HIGH_FOG_FAR);

// near stays inside PLAYER_RADIUS; 0.1 would starve depth precision for the ground layers
export const camera = new THREE.PerspectiveCamera(72, innerWidth / innerHeight, 0.25,
  startLowPower ? LOW_CAMERA_FAR : HIGH_CAMERA_FAR);
// VR moves this rig; out of VR it stays at the origin, so camera.position is the world position.
export const rig = new THREE.Group();
rig.add(camera);
scene.add(rig);
// Where the eye is in the world this frame (the headset's pose inside the rig while in VR).
export const viewPos = new THREE.Vector3();
export const viewQuat = new THREE.Quaternion();
export const hemi = new THREE.HemisphereLight(0xbdd3e6, 0x4a4640, HEMI_DAY);
scene.add(hemi);
export const sun = new THREE.DirectionalLight(0xfff2dd, 1.6);
sun.position.set(-0.5, 1, 0.4).multiplyScalar(100);
scene.add(sun);
scene.add(sun.target);
export const shadowMapSize = Math.min(SHADOW_MAP_MAX, renderer.capabilities.maxTextureSize);
sun.shadow.mapSize.set(shadowMapSize, shadowMapSize);
sun.shadow.camera.left = sun.shadow.camera.bottom = -SHADOW_BOX_HALF;
sun.shadow.camera.right = sun.shadow.camera.top = SHADOW_BOX_HALF;
sun.shadow.camera.near = 1;
sun.shadow.camera.far = SHADOW_DEPTH;
sun.shadow.bias = -SHADOW_BIAS_M / (SHADOW_DEPTH - 1);
sun.shadow.radius = SHADOW_SOFTNESS;
sun.shadow.autoUpdate = false;
// the edge fade, in three's shared shadow lookup (patched before any material compiles)
{
  const chunk = THREE.ShaderChunk.shadowmap_pars_fragment;
  const at = 'return shadow;';
  if (chunk.split(at).length === 2) {
    THREE.ShaderChunk.shadowmap_pars_fragment = chunk.replace(at,
      `vec2 shadowEdge = min( shadowCoord.xy, 1.0 - shadowCoord.xy );
          shadow = mix( 1.0, shadow, smoothstep( 0.0, ${SHADOW_EDGE_FADE.toFixed(4)}, min( shadowEdge.x, shadowEdge.y ) ) );
          ${at}`);
  } else console.warn('Shadow edge fade not applied: three\'s shadow chunk changed');
}
// Night key light: fixed low direction after sunset; always present (0 by day) so shaders never recompile; follows the moon.
export const MOON_FALLBACK = new THREE.Vector3(Math.sin(0.35), Math.tan(35 * Math.PI / 180), -Math.cos(0.35)).normalize();
export const moon = new THREE.DirectionalLight(0xaebfe0, 0);
moon.position.copy(MOON_FALLBACK).multiplyScalar(100);
scene.add(moon);

export const ground = new THREE.Mesh(
  new THREE.PlaneGeometry(4000, 4000),
  new THREE.MeshLambertMaterial({ color: 0x5c5f57 })
);
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;   // the flat city's ground when there is no terrain
scene.add(ground);
// teardownWorld's entry: the flat ground plane back as it starts (a city load hides it or drops it under water)
export function resetGroundPlane() { ground.visible = true; ground.position.y = 0; }

// HIGH-GRAPHICS MSAA: draw into a multisampled target, then a tone-mapping full-screen pass; low and VR draw directly.
export const msaa = {
  target: null, qScene: null, qCam: null, quad: null, _size: new THREE.Vector2(),

  ensure() {
    renderer.getDrawingBufferSize(this._size);
    const w = Math.max(1, this._size.x), h = Math.max(1, this._size.y);
    if (this.target === null) {
      const ext = renderer.extensions;
      const half = ext.has('EXT_color_buffer_float') || ext.has('EXT_color_buffer_half_float');
      this.target = new THREE.WebGLRenderTarget(w, h, {
        samples: MSAA_SAMPLES, type: half ? THREE.HalfFloatType : THREE.UnsignedByteType
      });
      if (!half) this.target.texture.colorSpace = THREE.SRGBColorSpace;
      if (this.quad === null) {
        const mat = new THREE.ShaderMaterial({
          uniforms: { tDiffuse: { value: null } },
          vertexShader: `varying vec2 vUv;
void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`,
          fragmentShader: `uniform sampler2D tDiffuse;
varying vec2 vUv;
void main() {
  gl_FragColor = texture2D(tDiffuse, vUv);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`,
          depthTest: false, depthWrite: false
        });
        this.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), mat);
        this.quad.frustumCulled = false;
        this.qScene = new THREE.Scene();
        this.qScene.add(this.quad);
        this.qCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
      }
      this.quad.material.uniforms.tDiffuse.value = this.target.texture;
    } else if (this.target.width !== w || this.target.height !== h) this.target.setSize(w, h);
    return this.target;
  },

  render() {
    renderer.setRenderTarget(this.ensure());
    renderer.render(scene, camera);
    renderer.setRenderTarget(null);
    renderer.render(this.qScene, this.qCam);
  },

  // free the GPU memory while Graphics is low
  dispose() {
    if (this.target === null) return;
    this.target.dispose();
    this.target = null;
  }
};

export const _col = new THREE.Color();

// OSM colours are free text: accept hex and CSS names only, so Color.setStyle never warns.
export function cssColor(raw) {
  if (raw == null) return null;
  const s = String(raw).trim().toLowerCase().replace(/\s+/g, '');
  if (/^#([0-9a-f]{3}|[0-9a-f]{6})$/.test(s)) return _col.setStyle(s).getHex();
  if (THREE.Color.NAMES[s] !== undefined) return THREE.Color.NAMES[s];
  return null;
}

// BUILD

// GEOMETRY HELPERS

// Table hexes are authored as displayed, so convert from sRGB like material colours.
export function rgb(hex) {
  _col.setHex(hex);
  return [_col.r, _col.g, _col.b];
}

export function newBuf() { return { pos: [], col: [] }; }
export const NO_WIN = [0, 0, 0];

// `ref` is the direction the face should point; winding is fixed to match.
export function pushTri(b, p0, p1, p2, c, ref) {
  const ax = p1[0] - p0[0], ay = p1[1] - p0[1], az = p1[2] - p0[2];
  const bx = p2[0] - p0[0], by = p2[1] - p0[1], bz = p2[2] - p0[2];
  const nx = ay * bz - az * by, ny = az * bx - ax * bz, nz = ax * by - ay * bx;
  const flip = (nx * ref[0] + ny * ref[1] + nz * ref[2]) < 0;
  const q1 = flip ? p2 : p1, q2 = flip ? p1 : p2;
  b.pos.push(p0[0], p0[1], p0[2], q1[0], q1[1], q1[2], q2[0], q2[1], q2[2]);
  b.col.push(c[0], c[1], c[2], c[0], c[1], c[2], c[0], c[1], c[2]);
  // FACADE: outer walls carry [baseY, topY, seed]; every other face gets zeros.
  if (b.win) {
    const w = c === b.winCol && ref[1] === 0 ? b.winData : NO_WIN;
    b.win.push(w[0], w[1], w[2], w[0], w[1], w[2], w[0], w[1], w[2]);
  }
}

export function pushQuad(b, p0, p1, p2, p3, c, ref) {
  pushTri(b, p0, p1, p2, c, ref);
  pushTri(b, p0, p2, p3, c, ref);
}

export function bufGeom(b) {
  if (!b.pos.length) return null;
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(b.pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(b.col, 3));
  if (b.win) g.setAttribute('win', new THREE.Float32BufferAttribute(b.win, 3));
  g.computeVertexNormals();
  return g;
}

export function tint(g, c) {
  const n = g.attributes.position.count;
  const arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { arr[i * 3] = c[0]; arr[i * 3 + 1] = c[1]; arr[i * 3 + 2] = c[2]; }
  g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  return g;
}

// mergeGeometries rejects mixed indexed/non-indexed input, so flatten all.
export function nonIndexed(g) {
  if (!g.index) return g;
  const flat = g.toNonIndexed();
  g.dispose();
  return flat;
}

export const UP = [0, 1, 0];

export function pushDisc(b, x, y, z, r, c) {
  const N = 6;
  for (let k = 0; k < N; k++) {
    const a0 = k / N * Math.PI * 2, a1 = (k + 1) / N * Math.PI * 2;
    pushTri(b, [x, y, z],
      [x + Math.cos(a0) * r, y, z + Math.sin(a0) * r],
      [x + Math.cos(a1) * r, y, z + Math.sin(a1) * r], c, UP);
  }
}

export function ribbon(b, pts, width, y, c) {
  const h = Math.max(width, 0.6) / 2;
  for (let i = 0; i < pts.length - 1; i++) {
    const [x0, z0] = pts[i], [x1, z1] = pts[i + 1];
    const dx = x1 - x0, dz = z1 - z0;
    const len = Math.hypot(dx, dz);
    if (len < 0.05) continue;
    const nx = -dz / len * h, nz = dx / len * h;
    pushQuad(b,
      [x0 + nx, y, z0 + nz], [x1 + nx, y, z1 + nz],
      [x1 - nx, y, z1 - nz], [x0 - nx, y, z0 - nz], c, UP);
    if (i > 0) pushDisc(b, x0, y, z0, h, c);
  }
}

export function areaGeom(pts, y, c) {
  const shape = new THREE.Shape();
  shape.moveTo(pts[0][0], -pts[0][1]);
  for (let i = 1; i < pts.length; i++) shape.lineTo(pts[i][0], -pts[i][1]);
  shape.closePath();
  let g;
  try { g = new THREE.ShapeGeometry(shape, 1); } catch (e) { return null; }
  if (!g.attributes.position || g.attributes.position.count < 3) { g.dispose(); return null; }
  g.rotateX(-Math.PI / 2);
  g.translate(0, y, 0);
  g.deleteAttribute('uv');
  return tint(nonIndexed(g), c);
}

// GROUND CELLS: a static mesh regrouped into square cells of `size` metres; each frame draws only the runs of cells in view.

// Non-indexed triangles by cell, kept in order inside each cell; `clip` cuts them at the cell lines, else each goes by its centre.
export function cellSplitFlat(g, clip, S) {
  const names = Object.keys(g.attributes);
  if (names.some(n => !(g.attributes[n].array instanceof Float32Array) || g.attributes[n].normalized)) return null;
  const src = names.map(n => g.attributes[n].array), size = names.map(n => g.attributes[n].itemSize);
  let K = 0, po = 0;
  names.forEach((n, a) => { if (n === 'position') po = K; K += size[a]; });
  const P = g.attributes.position.array, nTri = g.attributes.position.count / 3;
  // cells live on a dense grid over the mesh's extent; `cellOf` maps a grid square to its cell, made on first use
  let gx0 = Infinity, gz0 = Infinity, gx1 = -Infinity, gz1 = -Infinity;
  for (let i = 0; i < P.length; i += 3) {
    if (P[i] < gx0) gx0 = P[i]; if (P[i] > gx1) gx1 = P[i];
    if (P[i + 2] < gz0) gz0 = P[i + 2]; if (P[i + 2] > gz1) gz1 = P[i + 2];
  }
  const cx0g = Math.floor(gx0 / S), cz0g = Math.floor(gz0 / S), gw = Math.floor(gx1 / S) - cx0g + 1;
  const cellOf = new Int32Array(gw * (Math.floor(gz1 / S) - cz0g + 1)).fill(-1), cellX = [], cellZ = [], cellN = [];
  const cellAt = (cx, cz) => {
    const k = (cz - cz0g) * gw + cx - cx0g;
    if (cellOf[k] < 0) { cellOf[k] = cellN.length; cellX.push(cx); cellZ.push(cz); cellN.push(0); }
    return cellOf[k];
  };
  const rec = v => {
    const r = new Float64Array(K);
    for (let a = 0, o = 0; a < src.length; a++) for (let c = 0; c < size[a]; c++) r[o++] = src[a][v * size[a] + c];
    return r;
  };
  // the point where edge p-q crosses axis value c, always taken from its lower end so both cells get the same point
  const cut = (p, q, ax, c) => {
    if (p[po + ax] > q[po + ax]) { const t = p; p = q; q = t; }
    const t = (c - p[po + ax]) / (q[po + ax] - p[po + ax]), r = new Float64Array(K);
    for (let k = 0; k < K; k++) r[k] = p[k] + t * (q[k] - p[k]);
    r[po + ax] = c;
    return r;
  };
  // the part of a convex polygon on one side of the line where axis ax equals c (Sutherland-Hodgman)
  const keepSide = (poly, ax, c, above) => {
    const out = [];
    for (let i = 0; i < poly.length; i++) {
      const a = poly[i], b = poly[(i + 1) % poly.length];
      const ina = above ? a[po + ax] >= c : a[po + ax] <= c, inb = above ? b[po + ax] >= c : b[po + ax] <= c;
      if (ina) out.push(a);
      if (ina !== inb) out.push(cut(a, b, ax, c));
    }
    return out;
  };
  const triCell = new Int32Array(nTri), pieces = [];
  for (let t = 0; t < nTri; t++) {
    const o = t * 9;
    if (!clip) {
      const ci = cellAt(Math.floor((P[o] + P[o + 3] + P[o + 6]) / 3 / S), Math.floor((P[o + 2] + P[o + 5] + P[o + 8]) / 3 / S));
      triCell[t] = ci; cellN[ci] += 3; continue;
    }
    const minX = Math.min(P[o], P[o + 3], P[o + 6]), maxX = Math.max(P[o], P[o + 3], P[o + 6]);
    const minZ = Math.min(P[o + 2], P[o + 5], P[o + 8]), maxZ = Math.max(P[o + 2], P[o + 5], P[o + 8]);
    const cx0 = Math.floor(minX / S), cx1 = Math.max(cx0, Math.ceil(maxX / S) - 1);
    const cz0 = Math.floor(minZ / S), cz1 = Math.max(cz0, Math.ceil(maxZ / S) - 1);
    if (cx0 === cx1 && cz0 === cz1) { const ci = cellAt(cx0, cz0); triCell[t] = ci; cellN[ci] += 3; continue; }
    triCell[t] = -1;
    const tri = [rec(t * 3), rec(t * 3 + 1), rec(t * 3 + 2)], list = [];
    for (let cx = cx0; cx <= cx1; cx++) {
      let col = cx > cx0 ? keepSide(tri, 0, cx * S, true) : tri;
      if (cx < cx1) col = keepSide(col, 0, (cx + 1) * S, false);
      if (col.length < 3) continue;
      for (let cz = cz0; cz <= cz1; cz++) {
        let pc = cz > cz0 ? keepSide(col, 2, cz * S, true) : col;
        if (cz < cz1) pc = keepSide(pc, 2, (cz + 1) * S, false);
        if (pc.length < 3) continue;
        const ci = cellAt(cx, cz), fan = [];
        for (let i = 1; i < pc.length - 1; i++) fan.push(pc[0], pc[i], pc[i + 1]);
        cellN[ci] += fan.length;
        list.push(ci, fan);
      }
    }
    pieces.push(list);
  }
  // cells in row order: each one's first vertex, then where every whole triangle and every cut piece lands
  const n = cellN.length, order = cellN.map((_, i) => i).sort((a, b) => cellZ[a] - cellZ[b] || cellX[a] - cellX[b]);
  const cur = new Int32Array(n), cells = new Float64Array(n * 8);
  let total = 0;
  order.forEach((ci, k) => { cur[ci] = total; cells[k * 8] = total; cells[k * 8 + 1] = cellN[ci]; total += cellN[ci]; });
  const at = new Int32Array(nTri), cutAt = [];
  for (let t = 0, pk = 0; t < nTri; t++) {
    const ci = triCell[t];
    if (ci >= 0) { at[t] = cur[ci]; cur[ci] += 3; continue; }
    at[t] = -1;
    const list = pieces[pk++];
    for (let i = 0; i < list.length; i += 2) for (const r of list[i + 1]) cutAt.push(cur[list[i]]++, r);
  }
  const out = size.map(sz => new Float32Array(total * sz));
  for (let a = 0, ro = 0; a < src.length; ro += size[a], a++) {
    const from = src[a], to = out[a], sz = size[a], span = 3 * sz;
    for (let t = 0; t < nTri; t++) {
      if (at[t] < 0) continue;
      const f = t * span, d = at[t] * sz;
      for (let k = 0; k < span; k++) to[d + k] = from[f + k];
    }
    for (let i = 0; i < cutAt.length; i += 2) {
      const d = cutAt[i] * sz, r = cutAt[i + 1];
      for (let k = 0; k < sz; k++) to[d + k] = r[ro + k];
    }
  }
  // each cell's box from the positions it ended up with
  const pos = out[names.indexOf('position')];
  for (let k = 0; k < n; k++) {
    let x0 = Infinity, y0 = Infinity, z0 = Infinity, x1 = -Infinity, y1 = -Infinity, z1 = -Infinity;
    for (let v = cells[k * 8] * 3, e = v + cells[k * 8 + 1] * 3; v < e; v += 3) {
      const x = pos[v], y = pos[v + 1], z = pos[v + 2];
      if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; if (z < z0) z0 = z; if (z > z1) z1 = z;
    }
    cells[k * 8 + 2] = x0; cells[k * 8 + 3] = y0; cells[k * 8 + 4] = z0;
    cells[k * 8 + 5] = x1; cells[k * 8 + 6] = y1; cells[k * 8 + 7] = z1;
  }
  const geometry = new THREE.BufferGeometry();
  names.forEach((nm, a) => geometry.setAttribute(nm, new THREE.BufferAttribute(out[a], size[a])));
  return { geometry, cells };
}

// Indexed triangles regrouped by the cell of their centre, kept in their order inside each cell (for height meshes).
export function cellSplitIndexed(g, S) {
  const P = g.attributes.position.array, I = g.index.array, nTri = I.length / 3;
  const keyIdx = new Map(), cellX = [], cellZ = [], cellN = [], triCell = new Int32Array(nTri);
  for (let t = 0; t < nTri; t++) {
    const a = I[t * 3] * 3, b = I[t * 3 + 1] * 3, c = I[t * 3 + 2] * 3;
    const cx = Math.floor((P[a] + P[b] + P[c]) / 3 / S), cz = Math.floor((P[a + 2] + P[b + 2] + P[c + 2]) / 3 / S);
    const key = (cx + 32768) * 65536 + cz + 32768;
    let i = keyIdx.get(key);
    if (i === undefined) { i = cellN.length; keyIdx.set(key, i); cellX.push(cx); cellZ.push(cz); cellN.push(0); }
    triCell[t] = i;
    cellN[i] += 3;
  }
  const n = cellN.length, order = cellN.map((_, i) => i).sort((a, b) => cellZ[a] - cellZ[b] || cellX[a] - cellX[b]);
  const cur = new Int32Array(n), slot = new Int32Array(n), cells = new Float64Array(n * 8);
  let total = 0;
  order.forEach((ci, k) => {
    cur[ci] = total; slot[ci] = k * 8;
    cells.set([total, cellN[ci], Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity], k * 8);
    total += cellN[ci];
  });
  const J = new I.constructor(I.length);
  for (let t = 0; t < nTri; t++) {
    const ci = triCell[t], o = slot[ci];
    for (let k = 0; k < 3; k++) {
      const v = I[t * 3 + k], x = P[v * 3], y = P[v * 3 + 1], z = P[v * 3 + 2];
      J[cur[ci]++] = v;
      if (x < cells[o + 2]) cells[o + 2] = x; if (y < cells[o + 3]) cells[o + 3] = y; if (z < cells[o + 4]) cells[o + 4] = z;
      if (x > cells[o + 5]) cells[o + 5] = x; if (y > cells[o + 6]) cells[o + 6] = y; if (z > cells[o + 7]) cells[o + 7] = z;
    }
  }
  g.setIndex(new THREE.BufferAttribute(J, 1));
  return cells;
}

export const _cellFrustum = new THREE.Frustum(), _cellView = new THREE.Matrix4(), _cellBox = new THREE.Box3();

// Regroups the mesh by cell and hooks its draw: the first run of cells in view through three, the rest as plain GL draws.
// `clip` is for flat layers whose overlaps differ in colour, where the draw order must hold across cell lines too.
export function cellCull(mesh, clip = false, size = GROUND_CELL_M) {
  let g = mesh.geometry, cells;
  if (!g.boundingSphere) g.computeBoundingSphere();
  if (g.index) cells = cellSplitIndexed(g, size);
  else {
    const split = cellSplitFlat(g, clip, size);
    if (!split) return mesh;
    split.geometry.boundingSphere = g.boundingSphere.clone();
    g.dispose();
    mesh.geometry = g = split.geometry;
    cells = split.cells;
  }
  const n = cells.length / 8;
  if (n < 2) return mesh;
  const runs = [], idx = g.index;
  mesh.onBeforeRender = (renderer, scene, camera, geometry) => {
    _cellFrustum.setFromProjectionMatrix(_cellView.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse));
    runs.length = 0;
    for (let o = 0; o < cells.length; o += 8) {
      _cellBox.min.set(cells[o + 2], cells[o + 3], cells[o + 4]);
      _cellBox.max.set(cells[o + 5], cells[o + 6], cells[o + 7]);
      if (!_cellFrustum.intersectsBox(_cellBox)) continue;
      const s = cells[o], e = s + cells[o + 1];
      if (runs.length && runs[runs.length - 1] === s) runs[runs.length - 1] = e;
      else runs.push(s, e);
    }
    geometry.drawRange.start = runs.length ? runs[0] : 0;
    geometry.drawRange.count = runs.length ? runs[1] - runs[0] : 0;
  };
  mesh.onAfterRender = (renderer, scene, camera, geometry) => {
    if (runs.length > 2) {
      const gl = renderer.getContext();
      const type = idx ? (idx.array instanceof Uint32Array ? gl.UNSIGNED_INT : gl.UNSIGNED_SHORT) : 0;
      for (let r = 2; r < runs.length; r += 2) {
        const count = runs[r + 1] - runs[r];
        if (idx) gl.drawElements(gl.TRIANGLES, count, type, runs[r] * idx.array.BYTES_PER_ELEMENT);
        else gl.drawArrays(gl.TRIANGLES, runs[r], count);
        renderer.info.update(count, gl.TRIANGLES, 1);
      }
    }
    geometry.drawRange.start = 0;
    geometry.drawRange.count = Infinity;
  };
  return mesh;
}

export function box(w, h, d, x, y, z, yaw, c) {
  const g = new THREE.BoxGeometry(w, h, d);
  g.deleteAttribute('uv');
  if (yaw) g.rotateY(yaw);
  g.translate(x, y, z);
  return tint(nonIndexed(g), c);
}

export function cyl(rt, rb, h, x, y, z, c) {
  const g = new THREE.CylinderGeometry(rt, rb, h, 6);
  g.deleteAttribute('uv');
  g.translate(x, y + h / 2, z);
  return tint(nonIndexed(g), c);
}

// SHARED ADAPTERS: the Arena's perf helper; below it, City-only data (places, painted water) its provider reads.

export const perf = {
  // set by graphics.apply: Graphics low, and the LOD distances that go with the setting
  lowPower: startLowPower,
  npcLodDist: startLowPower ? LOW_NPC_LOD_DIST : HIGH_NPC_LOD_DIST,
  farStatDist: startLowPower ? LOW_FAR_STAT_DIST : HIGH_FAR_STAT_DIST,
  // Upload the first n instances; on low only the changed span, merged with ranges still waiting for a draw.
  instances(mesh, n) {
    mesh.count = n;
    mesh.visible = n > 0;
    if (n === 0) return;
    const attr = mesh.instanceMatrix;
    if (!this.lowPower) {
      attr._sent = null;
      attr.clearUpdateRanges();
      attr.addUpdateRange(0, n * 16);
      attr.needsUpdate = true;
      return;
    }
    const a = attr.array, len = n * 16;
    let sent = attr._sent;
    if (!sent || sent.length !== a.length) sent = attr._sent = new Float32Array(a.length).fill(NaN);
    let lo = 0;
    while (lo < len && a[lo] === sent[lo]) lo++;
    if (lo === len) return;
    let hi = len - 1;
    while (hi > lo && a[hi] === sent[hi]) hi--;
    lo -= lo % 16;
    hi += 16 - (hi % 16);   // exclusive end, whole matrices
    sent.set(a.subarray(lo, hi), lo);
    const pending = attr.updateRanges;
    for (let i = 0; i < pending.length; i++) {
      const r = pending[i];
      if (r.start < lo) lo = r.start;
      if (r.start + r.count > hi) hi = r.start + r.count;
    }
    attr.clearUpdateRanges();
    attr.addUpdateRange(lo, hi - lo);
    attr.needsUpdate = true;
  },
  instanceColors(mesh, n) {
    const attr = mesh.instanceColor;
    if (!attr || n === 0) return;
    attr.clearUpdateRanges();
    attr.addUpdateRange(0, n * 3);
    attr.needsUpdate = true;
  },
  setText(el, str) {
    if (!el || el._lastTxt === str) return;
    el._lastTxt = str;
    el.textContent = str;
  }
};

// IO HALF (no gfx references)

export function placeKindOf(tags) {
  for (const key of PLACE_KEYS) {
    const kind = tags[key] && PLACE_OF[`${key}=${tags[key]}`];
    if (kind) return kind;
  }
  return null;
}


export async function geocode(query) {
  const url = `${NOMINATIM_URL}?q=${encodeURIComponent(query)}&format=json&limit=1`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Geocoder returned ${res.status}.`);
  const hits = await res.json();
  if (!hits.length) throw new Error('No match for that address.');
  return {
    lat: parseFloat(hits[0].lat),
    lon: parseFloat(hits[0].lon),
    label: hits[0].display_name
  };
}

// One attempt on one mirror; a `fatal` error (bad query) ends the search, `cancel` aborts it when another mirror won.
export async function overpassTry(url, query, cancel) {
  const host = new URL(url).hostname;
  const ctrl = new AbortController();
  if (cancel) cancel.addEventListener('abort', () => ctrl.abort(), { once: true });
  const timer = setTimeout(() => ctrl.abort(), OVERPASS_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method: 'POST',
      body: 'data=' + encodeURIComponent(query),
      signal: ctrl.signal
    });
    if (res.status === 400) {
      throw Object.assign(new Error('Overpass rejected the query.'), { fatal: true });
    }
    if (!res.ok) throw new Error(`${host} returned ${res.status}`);
    return await res.json();
  } catch (err) {
    if (err.name === 'AbortError') {
      if (cancel && cancel.aborted) throw Object.assign(new Error(`${host} cancelled`), { cancelled: true });
      throw new Error(`${host} timed out`);
    }
    if (err instanceof TypeError) throw new Error(`${host} unreachable`);
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

// Each mirror once, in order; a slow one gets the next asked alongside it; first answer wins; rejects if all fail.
export function overpassHedged(q, radius, onNote, prevErr) {
  return new Promise((resolve, reject) => {
    const cancel = new AbortController();
    const hosts = OVERPASS_MIRRORS.map(u => new URL(u).hostname);
    let next = 0, running = 0, settled = false, lastErr = prevErr, hedge = 0;
    const slow = [];
    const end = () => { settled = true; clearTimeout(hedge); cancel.abort(); };

    const launch = why => {
      if (settled || next >= OVERPASS_MIRRORS.length) return;
      const k = next++;
      const host = hosts[k];
      if (why === 'hedge') onNote(`${slow.join(' and ')} has not answered in ${OVERPASS_HEDGE_MS / 1000} s. ` +
        `Also asking ${host} within ${radius} m…`, false);
      else onNote(lastErr
        ? `${lastErr.message}. Trying ${host} within ${radius} m…`
        : `Asking ${host} for everything within ${radius} m…`, !!lastErr);
      running++;
      slow.push(host);
      armHedge();
      overpassTry(OVERPASS_MIRRORS[k], q, cancel.signal).then(json => {
        if (settled) return;
        end();
        resolve(json);
      }, err => {
        running--;
        slow.splice(slow.indexOf(host), 1);
        if (settled) return;
        if (err.fatal) { end(); reject(err); return; }
        lastErr = err;
        if (next < OVERPASS_MIRRORS.length && running < OVERPASS_MAX_PARALLEL) launch('failed');
        else if (running === 0) { end(); reject(lastErr); }
      });
    };

    // the hedge clock restarts with every launch
    const armHedge = () => {
      clearTimeout(hedge);
      if (next >= OVERPASS_MIRRORS.length) return;
      hedge = setTimeout(() => {
        if (running < OVERPASS_MAX_PARALLEL) launch('hedge');
      }, OVERPASS_HEDGE_MS);
    };

    launch('first');
  });
}

// Every mirror at the widest radius, then shrink and repeat (covers 429 and 504).
export async function fetchBuildings(lat, lon, ladder, onNote) {
  let lastErr = null;

  for (const radius of ladder) {
    const dLat = radius / 110540;
    const dLon = radius / (111320 * Math.cos(lat * Math.PI / 180));
    const bbox = [lat - dLat, lon - dLon, lat + dLat, lon + dLon]
      .map(v => v.toFixed(6)).join(',');

    // One trip for every layer. `out geom` inlines way/member coordinates.
    const q = `[out:json][timeout:${OVERPASS_QUERY_TIMEOUT}];(` +
      `way["building"](${bbox});relation["building"](${bbox});` +
      `way["highway"](${bbox});` +
      `way["natural"="water"](${bbox});relation["natural"="water"](${bbox});` +
      `way["waterway"](${bbox});` +
      `way["landuse"~"^(${LANDUSE_RE})$"](${bbox});relation["landuse"~"^(${LANDUSE_RE})$"](${bbox});` +
      `way["leisure"~"^(${LEISURE_RE})$"](${bbox});relation["leisure"~"^(${LEISURE_RE})$"](${bbox});` +
      `way["natural"="wetland"](${bbox});way["natural"="scrub"](${bbox});way["natural"="sand"](${bbox});` +
      `way["natural"="tree_row"](${bbox});` +
      `way["barrier"~"^(${BARRIER_RE})$"](${bbox});` +
      `node["natural"="tree"](${bbox});` +
      `node["amenity"](${bbox});node["shop"](${bbox});node["healthcare"](${bbox});` +
      PLACE_KEYS.map(k => `way["${k}"~"^(${PLACE_RE[k]})$"](${bbox});` +
        `relation["${k}"~"^(${PLACE_RE[k]})$"](${bbox});`).join('') +
      `node["highway"="street_lamp"](${bbox});` +
      `node["emergency"="fire_hydrant"](${bbox});` +
      `node["entrance"](${bbox});` +
      `);out geom;`;

    try {
      // not kept: a dense response runs to hundreds of MB; load() keeps only the features
      const json = await overpassHedged(q, radius, onNote, lastErr);
      return { json, radius };
    } catch (err) {
      if (err.fatal) throw err;
      lastErr = err;
    }
  }

  const min = ladder[ladder.length - 1];
  throw new Error(
    `Every mirror failed, down to a ${min} m radius. Last: ${lastErr.message}.`
  );
}

// The suggested place a query names, by its query or by its label (what the address box shows after a load), or null.
export function cityFileFor(query) {
  const q = query.trim().toLowerCase();
  for (const [pick, entry] of Object.entries(CITY_FILES)) {
    if (pick.toLowerCase() === q || entry.label.toLowerCase() === q) return entry;
    if (entry.aliases && entry.aliases.some(a => a.toLowerCase() === q)) return entry;
  }
  return null;
}

// The file's Overpass JSON, or null when it is missing, unreachable or not map data (a host's "not found" page).
export async function fetchCityFile(file) {
  try {
    const res = await fetch(CITY_FILE_DIR + file);
    if (!res.ok) return null;
    const json = await res.json();
    return json && Array.isArray(json.elements) ? json : null;
  } catch (err) {
    return null;
  }
}

// PARSING

// "24", "24 m", "78'", "7'4\"", "23.5 metres" -> meters, or null
export function parseLength(raw) {
  if (raw == null) return null;
  const s = String(raw).trim();
  // feet, with an optional inches part: 78', 7'4", 7 ft 4 in
  const imp = s.match(/^([\d.]+)\s*(?:'|ft|feet)\s*(?:([\d.]+)\s*(?:"|''|in|inch(?:es)?)\s*)?$/i);
  if (imp) {
    const v = parseFloat(imp[1]) * 0.3048 + (imp[2] ? parseFloat(imp[2]) * 0.0254 : 0);
    return Number.isFinite(v) && v > 0 ? v : null;
  }
  const m = s.match(/^([\d.]+)/);
  if (!m) return null;
  const v = parseFloat(m[1]);
  return Number.isFinite(v) && v > 0 ? v : null;
}

export function heightOf(tags) {
  // these are ground-to-top already, so they win; est_height ranks above a levels guess
  const direct = parseLength(tags.height)
    ?? parseLength(tags['building:height'])
    ?? parseLength(tags.est_height);
  if (direct) return direct;
  const lv = parseLength(tags['building:levels']);
  if (lv) {
    // roof:height/roof:levels describe the roof alone, stacked on the walls
    const roof = parseLength(tags['roof:height'])
      ?? (parseLength(tags['roof:levels']) ?? 0) * METERS_PER_LVL;
    return lv * METERS_PER_LVL + roof;
  }
  return DEFAULT_LEVELS * METERS_PER_LVL;
}

export function minHeightOf(tags) {
  return parseLength(tags.min_height) ?? (parseLength(tags['building:min_level']) ?? 0) * METERS_PER_LVL;
}

// Local equirectangular projection about (lat0, lon0). Meters, y-up, -z north.
export function makeProjector(lat0, lon0) {
  const kx = 111320 * Math.cos(lat0 * Math.PI / 180);
  const kz = 110540;
  return (lat, lon) => [(lon - lon0) * kx, -(lat - lat0) * kz];
}

export function geometriesOf(el) {
  if (el.type === 'way' && el.geometry) return [el.geometry];
  if (el.type === 'relation' && el.members) {
    return el.members.filter(m => m.role === 'outer' && m.geometry).map(m => m.geometry);
  }
  return [];
}

export function closedGeom(g) {
  if (!g || g.length < 4) return false;
  const a = g[0], b = g[g.length - 1];
  return Math.abs(a.lat - b.lat) < 1e-9 && Math.abs(a.lon - b.lon) < 1e-9;
}

// Building polygons as { pts, holes? }; closed inner ways become courtyards, split ones are skipped.
export function buildingPolysOf(el, project) {
  const polys = geometriesOf(el)
    .map(g => ({ pts: cleanPts(g, project, true), holes: [] }))
    .filter(p => p.pts.length >= 3);
  if (el.type === 'relation' && el.members) {
    for (const m of el.members) {
      if (m.role !== 'inner' || !closedGeom(m.geometry)) continue;
      const h = cleanPts(m.geometry, project, true);
      if (h.length < 3) continue;
      const host = polys.find(p => pointInRing(p.pts, h[0][0], h[0][1]));
      if (host) host.holes.push(h);
    }
  }
  for (const p of polys) if (!p.holes.length) delete p.holes;
  return polys;
}

export function cleanPts(geom, project, closed) {
  const p = [];
  for (const n of geom) {
    const q = project(n.lat, n.lon);
    const last = p[p.length - 1];
    if (!last || Math.abs(last[0] - q[0]) > 1e-4 || Math.abs(last[1] - q[1]) > 1e-4) p.push(q);
  }
  if (closed && p.length > 2) {
    const a = p[0], b = p[p.length - 1];
    if (Math.abs(a[0] - b[0]) < 1e-4 && Math.abs(a[1] - b[1]) < 1e-4) p.pop();
  }
  return p;
}

export function areaKindOf(tags) {
  for (const key of ['leisure', 'landuse', 'natural', 'amenity']) {
    const v = tags[key];
    if (v && AREA_COLOR[v] != null) return v;
  }
  return null;
}

export function featuresFrom(json, project) {
  const f = {
    buildings: [], roads: [], areas: [], waterways: [],
    trees: [], barriers: [], pois: [], props: [], entrances: [], places: []
  };

  for (const el of json.elements || []) {
    const tags = el.tags || {};

    if (el.type === 'node') {
      const [x, z] = project(el.lat, el.lon);
      if (tags.entrance) f.entrances.push({ x, z, main: tags.entrance === 'main' });
      if (tags.natural === 'tree') { f.trees.push({ x, z, tags }); continue; }
      if (tags.highway === 'street_lamp') { f.props.push({ x, z, kind: 'lamp' }); continue; }
      if (tags.emergency === 'fire_hydrant') { f.props.push({ x, z, kind: 'hydrant' }); continue; }
      if (tags.amenity === 'bench') { f.props.push({ x, z, kind: 'bench' }); continue; }
      if (tags.amenity || tags.shop || tags.healthcare) {
        const label = signLabel(tags);
        if (label) f.pois.push({ x, z, label });
        const kind = placeKindOf(tags);
        if (kind) f.places.push({ x, z, kind, name: label });
      }
      continue;
    }

    // An outlined place sits at its bounds centre; a bare campus (no building) gets a POI sign.
    const pkind = placeKindOf(tags);
    if (pkind) {
      const c = centreOf(el, project);
      if (c) {
        const label = signLabel(tags);
        f.places.push({ x: c[0], z: c[1], kind: pkind, name: label });
        if (!tags.building && label) f.pois.push({ x: c[0], z: c[1], label });
      }
    }

    if (tags.building) {
      for (const p of buildingPolysOf(el, project)) {
        f.buildings.push(p.holes ? { pts: p.pts, holes: p.holes, tags } : { pts: p.pts, tags });
      }
      continue;
    }

    if (tags.highway && ROAD_WIDTH[tags.highway]) {
      const pts = cleanPts(el.geometry || [], project, false);
      if (pts.length >= 2) {
        f.roads.push({
          pts, kind: tags.highway, width: parseLength(tags.width),
          oneway: tags.oneway === 'yes' || tags.oneway === '1' || tags.oneway === '-1' || tags.oneway === 'true' ||
            tags.junction === 'roundabout',
          lanes: parseInt(tags.lanes, 10) || null
        });
      }
      continue;
    }

    if (tags.barrier && BARRIER[tags.barrier]) {
      const pts = cleanPts(el.geometry || [], project, false);
      if (pts.length >= 2) f.barriers.push({ pts, kind: tags.barrier, height: parseLength(tags.height) });
      continue;
    }

    if (tags.natural === 'tree_row') {
      const pts = cleanPts(el.geometry || [], project, false);
      if (pts.length >= 2) {
        let carry = 0;
        for (let i = 0; i < pts.length - 1; i++) {
          const [x0, z0] = pts[i], [x1, z1] = pts[i + 1];
          const seg = Math.hypot(x1 - x0, z1 - z0);
          if (seg < 1e-3) continue;
          for (let d = TREE_ROW_SPACING - carry; d < seg; d += TREE_ROW_SPACING) {
            const t = d / seg;
            f.trees.push({ x: x0 + (x1 - x0) * t, z: z0 + (z1 - z0) * t, tags });
          }
          carry = (carry + seg) % TREE_ROW_SPACING;
        }
      }
      continue;
    }

    if (tags.waterway && WATERWAY_WIDTH[tags.waterway]) {
      const pts = cleanPts(el.geometry || [], project, false);
      if (pts.length >= 2) {
        f.waterways.push({ pts, width: parseLength(tags.width) ?? WATERWAY_WIDTH[tags.waterway] });
      }
      continue;
    }

    const kind = areaKindOf(tags);
    if (kind) {
      for (const g of geometriesOf(el)) {
        const pts = cleanPts(g, project, true);
        if (pts.length >= 3) f.areas.push({ pts, kind });
      }
    }
  }

  // big areas first so a pitch inside a park still reads on top of it
  f.areas.sort((a, b) => Math.abs(ringArea(b.pts)) - Math.abs(ringArea(a.pts)));
  return f;
}

export function centreOf(el, project) {
  const b = el.bounds;
  if (b) return project((b.minlat + b.maxlat) / 2, (b.minlon + b.maxlon) / 2);
  const g = el.geometry;
  if (g && g.length) {
    let lat = 0, lon = 0;
    for (const p of g) { lat += p.lat; lon += p.lon; }
    return project(lat / g.length, lon / g.length);
  }
  return null;
}

export function prettify(v) {
  return String(v).replace(/_/g, ' ').replace(/^./, c => c.toUpperCase());
}

export function signLabel(tags) {
  if (tags.name) return tags.name;
  if (tags.brand) return tags.brand;
  if (tags.operator) return tags.operator;
  if (tags.shop && tags.shop !== 'yes') return prettify(tags.shop);
  if (tags.amenity && tags.amenity !== 'yes') return prettify(tags.amenity);
  return null;
}

// Tiles resampled into the grid; null if any is missing or looks tampered with, so the city stays flat.
export async function fetchTerrain(lat, lon, radius, onNote = () => { }) {
  const half = radius + ELEV_MARGIN;
  const kx = 111320 * Math.cos(lat * Math.PI / 180), kz = 110540;
  const dLat = half / kz, dLon = half / kx;

  let z = TERRAIN_MAX_Z, x0, x1, y0, y1;
  for (; ;) {
    const nw = tileOf(lat + dLat, lon - dLon, z);
    const se = tileOf(lat - dLat, lon + dLon, z);
    x0 = Math.floor(nw.x); x1 = Math.floor(se.x);
    y0 = Math.floor(nw.y); y1 = Math.floor(se.y);
    if ((x1 - x0 + 1) * (y1 - y0 + 1) <= TERRAIN_MAX_TILES) break;
    if (z <= TERRAIN_MIN_Z) { onNote('The area needs too many tiles.'); return null; }
    z--;
  }

  const cols = x1 - x0 + 1, rows = y1 - y0 + 1, P = TERRAIN_TILE_PX;
  const cv = document.createElement('canvas');
  cv.width = cols * P; cv.height = rows * P;
  const ctx = cv.getContext('2d', { willReadFrequently: true });

  let got = 0;
  const total = cols * rows;
  onNote(`Downloading ${total} height tiles at zoom ${z}…`);
  const jobs = [];
  for (let ty = y0; ty <= y1; ty++) {
    for (let tx = x0; tx <= x1; tx++) {
      jobs.push(loadImage(`${TERRAIN_URL}/${z}/${tx}/${ty}.png`, 0).then(img => {
        if (!img) return;
        ctx.drawImage(img, (tx - x0) * P, (ty - y0) * P, P, P);
        got++;
        onNote(`Downloaded ${got} of ${total} height tiles at zoom ${z}…`);
      }));
    }
  }
  await Promise.race([
    Promise.all(jobs),
    new Promise(done => setTimeout(done, TERRAIN_TIMEOUT_MS))
  ]);
  if (got < total) { onNote(`Only ${got} of ${total} height tiles arrived.`); return null; }
  onNote(`Decoding and checking ${total} tiles…`);

  let px;
  try { px = ctx.getImageData(0, 0, cv.width, cv.height).data; }
  catch (e) { onNote('The browser would not let the tile pixels be read.'); return null; }
  const W = cv.width, H = cv.height;
  const raw = new Float32Array(W * H);
  for (let i = 0, k = 0; i < raw.length; i++, k += 4) {
    raw[i] = px[k] * 256 + px[k + 1] + px[k + 2] / 256 - 32768;
  }

  // Canvas readback can be noised by fingerprinting protection; it shows as isolated spikes.
  let spikes = 0;
  for (let y = 1; y < H - 1; y++) {
    for (let x = 1; x < W - 1; x++) {
      const i = y * W + x;
      const a = raw[i - 1], b = raw[i + 1], c = raw[i - W], d = raw[i + W];
      const med = (a + b + c + d - Math.min(a, b, c, d) - Math.max(a, b, c, d)) / 2;
      if (Math.abs(raw[i] - med) > TERRAIN_SPIKE_M) spikes++;
    }
  }
  if (spikes > (W - 2) * (H - 2) * TERRAIN_SPIKE_FRAC) {
    console.warn(`Terrain rejected: ${spikes} spiked pixels (canvas readback may be noised).`);
    onNote(`Rejected: ${fmt(spikes)} corrupted pixels, likely browser privacy protection.`);
    return null;
  }

  // Resample through the inverse of makeProjector; sea level is the floor, so harbours stay at the waterline.
  const sample = (fx, fy) => {
    fx = Math.min(Math.max(fx, 0), W - 1.001);
    fy = Math.min(Math.max(fy, 0), H - 1.001);
    const i = Math.floor(fx), j = Math.floor(fy), tx = fx - i, ty = fy - j, k = j * W + i;
    const a = raw[k] + (raw[k + 1] - raw[k]) * tx;
    const b = raw[k + W] + (raw[k + W + 1] - raw[k + W]) * tx;
    return Math.max(0, a + (b - a) * ty);
  };
  const step = ELEV_STEP;
  const n = Math.ceil(2 * half / step) + 1;
  const data = new Float32Array(n * n);
  for (let j = 0; j < n; j++) {
    const la = lat - (-half + j * step) / kz;
    for (let i = 0; i < n; i++) {
      const t = tileOf(la, lon + (-half + i * step) / kx, z);
      data[j * n + i] = sample((t.x - x0) * P - 0.5, (t.y - y0) * P - 0.5);
    }
  }

  const t0 = tileOf(lat, lon, z);
  const origin = sample((t0.x - x0) * P - 0.5, (t0.y - y0) * P - 0.5);
  let min = Infinity, max = -Infinity;
  for (let i = 0; i < data.length; i++) {
    const h = data[i] - origin;
    data[i] = h;
    if (h < min) min = h;
    if (h > max) max = h;
  }
  return { half: (n - 1) * step / 2, step, n, data, min, max, z, tiles: total };
}

// TILE HELPERS

// Slippy-tile maths, used by the elevation tiles.
export function tileOf(lat, lon, z) {
  const n = 2 ** z;
  const rad = lat * Math.PI / 180;
  return {
    x: (lon + 180) / 360 * n,
    y: (1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2 * n
  };
}

// Resolves with the image or null, never rejects; crossOrigin keeps the pixels usable by WebGL.
export function loadImage(url, timeoutMs) {
  return new Promise(resolve => {
    const img = new Image();
    let settled = false;
    const finish = v => { if (!settled) { settled = true; resolve(v); } };
    img.crossOrigin = 'anonymous';
    img.onload = () => finish(img);
    img.onerror = () => finish(null);
    if (timeoutMs) setTimeout(() => finish(null), timeoutMs);
    img.src = url;
  });
}
