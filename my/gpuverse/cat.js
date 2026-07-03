// cat.js: a single first-person COMPANION (black cat, "Nibbler") for gpuverse.
//
// Unlike creatures/plants/rain, the cat is NOT a GPU-simulated population: it's exactly one
// object whose state lives on the CPU and follows the player. So it deliberately does NOT
// touch the compute pipeline or the entity buffers — there is no per-entity parallelism to
// exploit for N=1. It is host-side bookkeeping (a follow state machine) plus one small
// per-frame uniform write (a model matrix + tint) and one non-instanced draw recorded into
// the renderer's existing main pass, after creatures.
//
// The mesh is baked ONCE on construction in gpuverse style: mesh.js-style tube segments +
// spheres, interleaved pos+normal, u32 index — the SAME vertex layout the creature pipeline
// consumes (arrayStride 24: loc0 float32x3 pos, loc1 float32x3 nrm), so it reuses the exact
// creature lighting conventions (Sky ambient + sun wrap + moon fill + fog). No shadow map.
//
// Ground follows the SAME baked heightfield the player samples (bilinear, passed in via
// setTerrain), NOT a re-evaluated noise: WGSL fp32 and JS fp64 diverge as world coords grow,
// which is what buries walkers. Sampling the identical grid the identical way => the cat
// stands on exactly the rendered terrain, same as player.js.

import { mul } from "./mat.js";
import { SKY_PARAMS_STRUCT, FOG_FN } from "./sky.js";

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const mixf = (a, b, t) => a + (b - a) * t;

// ---------------------------------------------------------------------------
// Bilinear heightfield sample — identical to player.js sampleHeight so the cat
// and the player agree on the ground exactly.
// tp: { heights:Float32Array(gridN*gridN), gridN, worldMin:[x,z], worldMax:[x,z] }
// ---------------------------------------------------------------------------
function sampleHeight(tp, wx, wz) {
  if (!tp || !tp.heights) return 0;
  const g = tp.gridN;
  const spanX = tp.worldMax[0] - tp.worldMin[0];
  const spanZ = tp.worldMax[1] - tp.worldMin[1];
  let fx = (wx - tp.worldMin[0]) / spanX * (g - 1);
  let fz = (wz - tp.worldMin[1]) / spanZ * (g - 1);
  fx = clamp(fx, 0, g - 1);
  fz = clamp(fz, 0, g - 1);
  const x0 = Math.floor(fx), z0 = Math.floor(fz);
  const x1 = Math.min(x0 + 1, g - 1), z1 = Math.min(z0 + 1, g - 1);
  const tx = fx - x0, tz = fz - z0;
  const h = tp.heights;
  const h00 = h[z0 * g + x0], h10 = h[z0 * g + x1];
  const h01 = h[z1 * g + x0], h11 = h[z1 * g + x1];
  return mixf(mixf(h00, h10, tx), mixf(h01, h11, tx), tz);
}

// ===========================================================================
// MESH BAKE (pure JS, mesh.js style) — one black cat in local space:
//   +X = forward (nose), +Y = up, +Z = right. Feet at local y=0 so placement
//   at the terrain height puts paws on the ground with no fudge factor.
// Ported proportions from the Three.js createCatMesh: long low body, head with
// cone ears, glowing eye tint (baked as vertex tint, not a light), legs, tail.
// ===========================================================================
const CROSS = (a, b) => [a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0]];
const NORM  = (a) => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0]/l, a[1]/l, a[2]/l]; };

// A generalized cylinder along centerFn(t)->[x,y,z], radiusFn(t)->r. Appends into
// pos[]/tris[] from vbase; returns the new vertex count. (Same construction as mesh.js.)
function addTube(pos, tris, vbase, { rings, segs, centerFn, radiusFn }) {
  for (let r = 0; r < rings; r++) {
    const t = rings === 1 ? 0 : r / (rings - 1);
    const c = centerFn(t);
    const rad = radiusFn(t);
    const t0 = Math.max(0, t - 1e-3), t1 = Math.min(1, t + 1e-3);
    const a = centerFn(t0), b = centerFn(t1);
    let tang = [b[0]-a[0], b[1]-a[1], b[2]-a[2]];
    const tl = Math.hypot(...tang) || 1; tang = [tang[0]/tl, tang[1]/tl, tang[2]/tl];
    const up = Math.abs(tang[1]) > 0.9 ? [1, 0, 0] : [0, 1, 0];
    const u = NORM(CROSS(up, tang));
    const v = NORM(CROSS(tang, u));
    for (let s = 0; s < segs; s++) {
      const ang = (s / segs) * Math.PI * 2;
      const cosA = Math.cos(ang), sinA = Math.sin(ang);
      pos.push(
        c[0] + (u[0]*cosA + v[0]*sinA) * rad,
        c[1] + (u[1]*cosA + v[1]*sinA) * rad,
        c[2] + (u[2]*cosA + v[2]*sinA) * rad,
      );
    }
  }
  for (let r = 0; r < rings - 1; r++) {
    for (let s = 0; s < segs; s++) {
      const s1 = (s + 1) % segs;
      const a = vbase + r*segs + s,     b = vbase + r*segs + s1;
      const c = vbase + (r+1)*segs + s, d = vbase + (r+1)*segs + s1;
      tris.push(a, c, b,  b, c, d);
    }
  }
  return vbase + rings * segs;
}

// A UV sphere centered at ctr with per-axis scale (sx,sy,sz). Appends; returns new count.
function addSphere(pos, tris, vbase, ctr, rad, scl = [1, 1, 1], stacks = 8, slices = 10) {
  const start = vbase;
  for (let i = 0; i <= stacks; i++) {
    const v = i / stacks, phi = v * Math.PI;
    const sy = Math.cos(phi), sr = Math.sin(phi);
    for (let j = 0; j <= slices; j++) {
      const u = j / slices, th = u * Math.PI * 2;
      pos.push(
        ctr[0] + Math.cos(th) * sr * rad * scl[0],
        ctr[1] + sy * rad * scl[1],
        ctr[2] + Math.sin(th) * sr * rad * scl[2],
      );
      vbase++;
    }
  }
  const rowV = slices + 1;
  for (let i = 0; i < stacks; i++) {
    for (let j = 0; j < slices; j++) {
      const a = start + i*rowV + j,     b = a + 1;
      const c = start + (i+1)*rowV + j, d = c + 1;
      tris.push(a, c, b,  b, c, d);
    }
  }
  return vbase;
}

// A cone (for ears): apex up, base ring at ctr. Appends; returns new count.
function addCone(pos, tris, vbase, ctr, rad, height, segs = 6) {
  const apexIdx = vbase;
  pos.push(ctr[0], ctr[1] + height, ctr[2]); vbase++;
  const ringStart = vbase;
  for (let s = 0; s < segs; s++) {
    const ang = (s / segs) * Math.PI * 2;
    pos.push(ctr[0] + Math.cos(ang) * rad, ctr[1], ctr[2] + Math.sin(ang) * rad);
    vbase++;
  }
  for (let s = 0; s < segs; s++) {
    const s1 = (s + 1) % segs;
    tris.push(apexIdx, ringStart + s, ringStart + s1);
  }
  return vbase;
}

// Build the cat. Returns interleaved pos+nrm (float32x6) + u32 index + a per-vertex tint
// buffer (float32x3) so the eyes/nose glow without a separate light. The tint stream is a
// third vertex buffer (arrayStride 12) — the cat pipeline has its own layout, so it doesn't
// need to match the creature pipeline's per-instance streams.
export function buildCatMesh() {
  const pos = [];   // flat xyz
  const tris = [];  // flat index triples
  // vertex ranges tagged with a tint so eyes/nose read as emissive-ish without a real light.
  const tintRanges = []; // {start,end,color}
  let vb = 0;
  const SEG = 10;

  const black = [0.07, 0.07, 0.08];
  const eyeGlow = [0.55, 0.95, 0.05]; // yellow-green, matches the Three.js eye emissive
  const pink = [0.95, 0.55, 0.55];

  const tag = (start, end, color) => tintRanges.push({ start, end, color });

  // Body: long low tube along X (tail x=-9 .. chest x=+9), fattest mid-body. Local units
  // roughly follow the Three.js proportions (which used ~5-unit sphere radii at 0.85 scale);
  // here we keep them in the same ballpark so the world scale param lands similarly.
  let s0 = vb;
  vb = addTube(pos, tris, vb, {
    rings: 11, segs: SEG,
    centerFn: (t) => [-9 + t * 18, 5 + Math.sin(t * Math.PI) * 0.6, 0],
    radiusFn: (t) => 3.0 + Math.sin(t * Math.PI) * 1.4,
  });
  tag(s0, vb, black);

  // Head: sphere forward and up from the chest.
  s0 = vb; vb = addSphere(pos, tris, vb, [10.5, 8.0, 0], 4.3, [1, 1, 1], 8, 10); tag(s0, vb, black);

  // Ears: two cones atop the head.
  s0 = vb; vb = addCone(pos, tris, vb, [ 8.6, 11.0,  2.4], 1.5, 3.5, 5); tag(s0, vb, black);
  s0 = vb; vb = addCone(pos, tris, vb, [ 8.6, 11.0, -2.4], 1.5, 3.5, 5); tag(s0, vb, black);

  // Eyes: small glowing spheres on the face (tinted, no light).
  s0 = vb; vb = addSphere(pos, tris, vb, [13.5, 8.6,  1.7], 1.1, [1,1,1], 6, 8); tag(s0, vb, eyeGlow);
  s0 = vb; vb = addSphere(pos, tris, vb, [13.5, 8.6, -1.7], 1.1, [1,1,1], 6, 8); tag(s0, vb, eyeGlow);

  // Nose: tiny pink sphere at the tip.
  s0 = vb; vb = addSphere(pos, tris, vb, [14.2, 7.6, 0], 0.6, [1,1,1], 5, 6); tag(s0, vb, pink);

  // Legs: 4 tapered tubes hanging down (-Y) at front/back X and left/right Z.
  const legDefs = [[6.0, 3.2], [6.0, -3.2], [-5.0, 3.2], [-5.0, -3.2]];
  for (const [lx, lz] of legDefs) {
    s0 = vb;
    vb = addTube(pos, tris, vb, {
      rings: 4, segs: 6,
      centerFn: (t) => [lx, 4.5 - t * 4.5, lz],
      radiusFn: (t) => 1.2 * (1 - t * 0.2),
    });
    tag(s0, vb, black);
  }

  // Tail: tapered tube trailing back (-X) and rising, curving at the tip (t*t), matching the
  // Three.js "stiff upright, curving backward" pose baked into the rest position.
  s0 = vb;
  vb = addTube(pos, tris, vb, {
    rings: 8, segs: 6,
    centerFn: (t) => [-9 - t * 3.0, 5 + t * 9.0, -1 - t * t * 4.0],
    radiusFn: (t) => 1.0 * (1 - t * 0.5),
  });
  tag(s0, vb, black);

  // smooth normals
  const vCount = pos.length / 3;
  const nrm = new Float32Array(pos.length);
  for (let i = 0; i < tris.length; i += 3) {
    const ia = tris[i]*3, ib = tris[i+1]*3, ic = tris[i+2]*3;
    const e1 = [pos[ib]-pos[ia], pos[ib+1]-pos[ia+1], pos[ib+2]-pos[ia+2]];
    const e2 = [pos[ic]-pos[ia], pos[ic+1]-pos[ia+1], pos[ic+2]-pos[ia+2]];
    const fn = CROSS(e1, e2);
    for (const idx of [ia, ib, ic]) { nrm[idx]+=fn[0]; nrm[idx+1]+=fn[1]; nrm[idx+2]+=fn[2]; }
  }
  for (let i = 0; i < nrm.length; i += 3) {
    const l = Math.hypot(nrm[i], nrm[i+1], nrm[i+2]) || 1;
    nrm[i]/=l; nrm[i+1]/=l; nrm[i+2]/=l;
  }

  // interleave pos+nrm (float32x6)
  const vertexData = new Float32Array(vCount * 6);
  for (let i = 0; i < vCount; i++) {
    vertexData[i*6]   = pos[i*3];
    vertexData[i*6+1] = pos[i*3+1];
    vertexData[i*6+2] = pos[i*3+2];
    vertexData[i*6+3] = nrm[i*3];
    vertexData[i*6+4] = nrm[i*3+1];
    vertexData[i*6+5] = nrm[i*3+2];
  }
  // per-vertex tint (float32x3), default black then painted per tagged range
  const tintData = new Float32Array(vCount * 3);
  for (let i = 0; i < vCount; i++) { tintData[i*3]=black[0]; tintData[i*3+1]=black[1]; tintData[i*3+2]=black[2]; }
  for (const { start, end, color } of tintRanges) {
    for (let i = start; i < end; i++) { tintData[i*3]=color[0]; tintData[i*3+1]=color[1]; tintData[i*3+2]=color[2]; }
  }

  return {
    vertexData, tintData,
    indexData: new Uint32Array(tris),
    vertexCount: vCount, indexCount: tris.length,
  };
}

// ===========================================================================
// SHADER — creature-style lighting (Sky ambient + sun wrap + moon fill + fog),
// no shadow sampling. A single model matrix + eyeBoost uniform; per-vertex tint.
// ===========================================================================
export const CAT_RENDER = SKY_PARAMS_STRUCT + FOG_FN + /* wgsl */`
struct Camera { viewProj : mat4x4<f32>, eye : vec3<f32>, _p : f32, invViewProj : mat4x4<f32> };
struct CatDraw {
  model    : mat4x4<f32>,   // local -> world (includes yaw rotation, scale, translate)
  normalM  : mat4x4<f32>,   // upper-3x3 for normals (rotation only; uniform scale so reuse)
  eyeBoost : f32,           // extra self-emission multiplier for the glowing tint parts
  _p0 : f32, _p1 : f32, _p2 : f32,
};
@group(0) @binding(0) var<uniform> CAM : Camera;
@group(0) @binding(1) var<uniform> CD  : CatDraw;
@group(0) @binding(2) var<uniform> SKY : SkyParams;
@group(0) @binding(3) var<uniform> FOG : FogParams;

struct VsOut {
  @builtin(position) clip : vec4<f32>,
  @location(0) nrm : vec3<f32>,
  @location(1) tint : vec3<f32>,
  @location(2) worldPos : vec3<f32>,
  @location(3) glow : f32,   // how "eye-like" this vertex is (green tint => self-emits)
};

@vertex
fn vs(@location(0) vPos : vec3<f32>,
      @location(1) vNrm : vec3<f32>,
      @location(2) vTint : vec3<f32>) -> VsOut {
  let wp = CD.model * vec4<f32>(vPos, 1.0);
  let wn = (CD.normalM * vec4<f32>(vNrm, 0.0)).xyz;
  var out : VsOut;
  out.worldPos = wp.xyz;
  out.clip = CAM.viewProj * wp;
  out.nrm = wn;
  out.tint = vTint;
  // treat the green channel dominance as the "eye glow" marker (eyes are yellow-green).
  out.glow = clamp((vTint.g - vTint.r * 0.5 - vTint.b) * 2.0, 0.0, 1.0);
  return out;
}

@fragment
fn fs(in : VsOut) -> @location(0) vec4<f32> {
  let nrm = normalize(in.nrm);
  let lightDir = normalize(SKY.sunDir);
  let ndl = max(dot(nrm, lightDir), 0.0);
  let wrap = ndl * 0.85 + 0.15;                 // soft wrap so the dark side isn't flat
  let mdl = max(dot(nrm, normalize(SKY.moonDir)), 0.0);
  let moon = SKY.moonColor * (mdl * 0.85 + 0.15) * SKY.moonVisible * 0.12;
  var lit = in.tint * (SKY.ambient + SKY.sunColor * wrap + moon);
  // eyes self-emit a little so they read at night, scaled by the host eyeBoost.
  lit = lit + in.tint * in.glow * CD.eyeBoost;
  let foggy = applyFog(lit, in.worldPos, CAM.eye, FOG);
  return vec4<f32>(foggy, 1.0);
}
`;

// ===========================================================================
// FACTORY
// createCat(device, format, opts) -> {
//   update(dt, playerPos, playerYaw), draw(pass, sky), setTerrain(tp),
//   setEnabled(b), get enabled, get position, buffers
// }
// opts:
//   camBuf, skyBuf, fogBuf : renderer uniforms, reused read-only (from createRenderer)
//   terrain                : { heights, gridN, worldMin:[x,z], worldMax:[x,z] } or null
//   worldWidth, worldHeight: world span for toroidal wrap (defaults from terrain bounds)
//   scale                  : world size multiplier (default 0.35; local mesh is ~14 wide)
//   followDist, catchUpDist, backAwayDist : follow tuning (world units)
// ===========================================================================
export function createCat(device, format, {
  camBuf, skyBuf, fogBuf,
  terrain = null,
  worldWidth = null, worldHeight = null,
  scale = 0.35,
  followDist = 26,
  catchUpDist = 90,
  backAwayDist = 4,
  eyeHeight = 0.0,   // extra lift above terrain for the paws (0 = feet exactly on ground)
} = {}) {
  const mesh = buildCatMesh();

  const vtxBuf = device.createBuffer({ size: mesh.vertexData.byteLength, usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST });
  device.queue.writeBuffer(vtxBuf, 0, mesh.vertexData);
  const tintBuf = device.createBuffer({ size: mesh.tintData.byteLength, usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST });
  device.queue.writeBuffer(tintBuf, 0, mesh.tintData);
  const idxBuf = device.createBuffer({ size: mesh.indexData.byteLength, usage: GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST });
  device.queue.writeBuffer(idxBuf, 0, mesh.indexData);

  // CatDraw uniform: model(64) + normalM(64) + eyeBoost+pad(16) = 144 bytes.
  const cdBuf = device.createBuffer({ size: 144, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
  const cdScratch = new Float32Array(36);   // reused every frame, no per-frame allocation

  const bgl = device.createBindGroupLayout({ entries: [
    { binding: 0, visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT, buffer: { type: "uniform" } }, // Camera
    { binding: 1, visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT, buffer: { type: "uniform" } }, // CatDraw
    { binding: 2, visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT, buffer: { type: "uniform" } }, // Sky
    { binding: 3, visibility: GPUShaderStage.FRAGMENT,                         buffer: { type: "uniform" } }, // Fog
  ]});
  const bg = device.createBindGroup({ layout: bgl, entries: [
    { binding: 0, resource: { buffer: camBuf } },
    { binding: 1, resource: { buffer: cdBuf } },
    { binding: 2, resource: { buffer: skyBuf } },
    { binding: 3, resource: { buffer: fogBuf } },
  ]});
  const mod = device.createShaderModule({ code: CAT_RENDER });
  const pipe = device.createRenderPipeline({
    layout: device.createPipelineLayout({ bindGroupLayouts: [bgl] }),
    vertex: { module: mod, entryPoint: "vs", buffers: [
      { arrayStride: 24, stepMode: "vertex", attributes: [
        { shaderLocation: 0, offset: 0,  format: "float32x3" },   // pos
        { shaderLocation: 1, offset: 12, format: "float32x3" },   // nrm
      ]},
      { arrayStride: 12, stepMode: "vertex", attributes: [
        { shaderLocation: 2, offset: 0, format: "float32x3" },    // tint
      ]},
    ]},
    fragment: { module: mod, entryPoint: "fs", targets: [{ format }] },
    primitive: { topology: "triangle-list", cullMode: "none" },   // low-poly, keep both sides
    depthStencil: { format: "depth24plus", depthWriteEnabled: true, depthCompare: "less" },
  });

  // ---- world bounds for wrap ----
  let tp = terrain;
  function boundsFromTerrain() {
    if (tp && tp.worldMin && tp.worldMax) {
      return {
        minX: tp.worldMin[0], minZ: tp.worldMin[1],
        w: tp.worldMax[0] - tp.worldMin[0], h: tp.worldMax[1] - tp.worldMin[1],
      };
    }
    return { minX: 0, minZ: 0, w: worldWidth || 1, h: worldHeight || 1 };
  }

  // ---- follow state (ported from the Three.js updateCat) ----
  const state = {
    x: 0, y: 0, z: 0,
    yaw: 0,
    vy: 0,
    animTime: 0,
    speed: 0,
    placed: false,
  };
  function groundY(x, z) { return sampleHeight(tp, x, z); }

  function placeBehindPlayer(px, pz, pyaw) {
    state.x = px - Math.sin(pyaw) * followDist;
    state.z = pz - Math.cos(pyaw) * followDist;
    state.y = groundY(state.x, state.z) + eyeHeight;
    state.yaw = pyaw;
    state.vy = 0;
    state.placed = true;
  }

  function setTerrain(newTp) {
    tp = newTp;
    if (state.placed) state.y = groundY(state.x, state.z) + eyeHeight;
  }

  // shortest signed angular difference a->b in (-pi,pi]
  function angDelta(a, b) {
    let d = (b - a) % (Math.PI * 2);
    if (d > Math.PI) d -= Math.PI * 2;
    if (d < -Math.PI) d += Math.PI * 2;
    return d;
  }

  const GRAVITY = 260;   // matches player.js gravity scale

  // update(dt, playerPos, playerYaw): playerPos = {x,y,z} (or [x,y,z]); playerYaw in radians.
  function update(dt, playerPos, playerYaw) {
    if (!enabled) return;
    const px = Array.isArray(playerPos) ? playerPos[0] : playerPos.x;
    const pz = Array.isArray(playerPos) ? playerPos[2] : playerPos.z;

    if (!state.placed) placeBehindPlayer(px, pz, playerYaw || 0);

    state.animTime += dt;

    const dx = px - state.x, dz = pz - state.z;
    const distToPlayer = Math.hypot(dx, dz);
    let speed = 0;

    if (distToPlayer > catchUpDist) {
      // too far behind: recycle next to the player (like the rain pool bracketing the camera)
      placeBehindPlayer(px, pz, playerYaw || state.yaw);
    } else if (distToPlayer > followDist) {
      // chase: quantized heading gives a slightly stepped, less twitchy track (as in the port)
      speed = distToPlayer > followDist * 1.6 ? 80 : 25;
      const dxr = Math.round(dx / 2) * 2, dzr = Math.round(dz / 2) * 2;
      const target = Math.atan2(dxr, dzr);
      state.yaw += angDelta(state.yaw, target) * Math.min(1, dt * 6);
      state.x += Math.sin(state.yaw) * speed * dt;
      state.z += Math.cos(state.yaw) * speed * dt;
    } else if (distToPlayer < backAwayDist) {
      // too close: back away so it doesn't clip into the camera
      speed = 20;
      const target = Math.atan2(-dx, -dz);
      state.yaw += angDelta(state.yaw, target) * Math.min(1, dt * 5);
      state.x += Math.sin(state.yaw) * speed * dt;
      state.z += Math.cos(state.yaw) * speed * dt;
    } else {
      // idle: face the player, no wandering
      const face = Math.atan2(dx, dz);
      state.yaw += angDelta(state.yaw, face) * Math.min(1, dt * 2);
    }
    state.speed = speed;

    // gravity + ground clamp against the baked heightfield
    state.vy -= GRAVITY * dt;
    state.y += state.vy * dt;
    const floor = groundY(state.x, state.z) + eyeHeight;
    if (state.y <= floor) { state.y = floor; state.vy = 0; }

    // toroidal world wrap (matches gpuverse terrain domain)
    const B = boundsFromTerrain();
    state.x = ((state.x - B.minX) % B.w + B.w) % B.w + B.minX;
    state.z = ((state.z - B.minZ) % B.h + B.h) % B.h + B.minZ;
  }

  // Compose the model matrix (column-major, matching mat.js) = T * Ry * S, and its normal
  // matrix (rotation only — uniform scale, so no inverse-transpose needed). Written into the
  // reused scratch; one writeBuffer per frame.
  function writeDraw(sky) {
    const c = Math.cos(state.yaw), s = Math.sin(state.yaw);
    const sc = scale;
    // The follow logic sets yaw via atan2(dx,dz) and steps by (sin yaw, cos yaw), so the cat
    // TRAVELS along world (sin yaw, cos yaw) in XZ. The mesh nose is local +X, so we map
    // local +X -> world (sin,0,cos) to keep the body aligned with travel. Local +Z (right)
    // is then the perpendicular (cos,0,-sin). Column-major columns [c0|c1|c2|c3].
    const model = [
       s*sc, 0,   c*sc, 0,   // col0: local +X (nose) -> world (sin,0,cos) = travel dir
       0,    sc,  0,    0,   // col1: local +Y -> world up
      -c*sc, 0,   s*sc, 0,   // col2: local +Z (right) -> world (-cos,0,sin), right-handed
       state.x, state.y, state.z, 1,   // col3: translation
    ];
    const normalM = [
       s, 0,  c, 0,
       0, 1,  0, 0,
      -c, 0,  s, 0,
       0, 0,  0, 1,
    ];
    cdScratch.set(model, 0);
    cdScratch.set(normalM, 16);
    // brighter eye self-emission at night so the glow reads; fades out in daylight.
    const sunVis = sky?.sunVisible ?? 1;
    cdScratch[32] = mixf(0.9, 0.2, clamp(sunVis, 0, 1));
    cdScratch[33] = 0; cdScratch[34] = 0; cdScratch[35] = 0;
    device.queue.writeBuffer(cdBuf, 0, cdScratch);
  }

  let enabled = true;
  function setEnabled(v) { enabled = !!v; return enabled; }

  // record the draw into the caller's already-open main pass (after creatures, before water).
  function draw(pass, sky) {
    if (!enabled) return;
    writeDraw(sky);
    pass.setPipeline(pipe);
    pass.setBindGroup(0, bg);
    pass.setVertexBuffer(0, vtxBuf);
    pass.setVertexBuffer(1, tintBuf);
    pass.setIndexBuffer(idxBuf, "uint32");
    pass.drawIndexed(mesh.indexCount);
  }

  return {
    update, draw, setTerrain, setEnabled, placeBehindPlayer,
    get enabled() { return enabled; },
    get position() { return { x: state.x, y: state.y, z: state.z }; },
    get yaw() { return state.yaw; },
    buffers: { vtx: vtxBuf, tint: tintBuf, idx: idxBuf, draw: cdBuf },
    indexCount: mesh.indexCount,
  };
}