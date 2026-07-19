// world.js: WGSL shader sources for the whole world (terrain, shadows, creatures, water,
// plants, cat, movement, init) + the GPU uniform-grid neighbor search and its sensing pass.
// (merged: world_wgsl.js + grid.js)

import { SKY_PARAMS_STRUCT, FOG_FN } from "./sky.js";

export const HEIGHT_FN = /* wgsl */`
struct TerrainParams {
  worldMin : vec2<f32>,
  worldMax : vec2<f32>,
  gridN    : u32,
  amplitude: f32,
  seed     : f32,
  mountainThreshold : f32,
};

fn hash2(p : vec2<f32>) -> f32 {
  let h = dot(p, vec2<f32>(127.1, 311.7));
  return fract(sin(h) * 43758.5453123);
}

fn valueNoise(p : vec2<f32>) -> f32 {
  let i = floor(p);
  let f = fract(p);
  let u = f * f * (3.0 - 2.0 * f);
  let a = hash2(i + vec2<f32>(0.0, 0.0));
  let b = hash2(i + vec2<f32>(1.0, 0.0));
  let c = hash2(i + vec2<f32>(0.0, 1.0));
  let d = hash2(i + vec2<f32>(1.0, 1.0));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}

// Fractal value-noise sum, 5 octaves. Drives both plains terrain and the biome mask.
fn fractalNoise(p0 : vec2<f32>) -> f32 {
  var p = p0;
  var amp = 1.0;
  var sum = 0.0;
  var norm = 0.0;
  for (var o = 0u; o < 5u; o = o + 1u) {
    sum = sum + valueNoise(p) * amp;
    norm = norm + amp;
    p = p * 2.03;
    amp = amp * 0.5;
  }
  return sum / norm;
}

// Ridged noise: fold value-noise through 1-|2x-1| so valleys pinch into sharp ridges
// instead of smooth hills. Classic "ridged multifractal" terrain trick.
fn ridgedNoise(p0 : vec2<f32>) -> f32 {
  var p = p0;
  var amp = 1.0;
  var sum = 0.0;
  var norm = 0.0;
  for (var o = 0u; o < 5u; o = o + 1u) {
    let n = valueNoise(p);
    let ridge = 1.0 - abs(n * 2.0 - 1.0);
    sum = sum + ridge * ridge * amp;
    norm = norm + amp;
    p = p * 2.13;
    amp = amp * 0.5;
  }
  return sum / norm;
}

// Low-frequency mask deciding plains (0) vs mountains (1) across the world. Sampled
// at a much lower frequency than the height noise itself so biomes form large
// contiguous regions rather than flickering cell-to-cell.
fn biomeMask(uv : vec2<f32>, seed : f32) -> f32 {
  let p = uv * 2.2 + vec2<f32>(seed * 3.1, seed * -1.9);
  return fractalNoise(p);
}

// WORLD xz -> world height. Below mountainThreshold = pure plains; above it, ridged
// noise fades in and lifts the base height so peaks read as mountains.
fn heightAt(tp : TerrainParams, worldXZ : vec2<f32>) -> f32 {
  let span = tp.worldMax - tp.worldMin;
  let uv = (worldXZ - tp.worldMin) / span;
  let basePos = uv * 6.0 + vec2<f32>(tp.seed, tp.seed * 1.7);

  let plains = fractalNoise(basePos);
  let ridged = ridgedNoise(basePos * 1.6 + vec2<f32>(11.0, -7.0) * 3);

  let mask = biomeMask(uv, tp.seed);
  let mtnBlend = smoothstep(tp.mountainThreshold, tp.mountainThreshold + 0.15, mask);

  // mountains both blend in ridged detail AND push the base height up, so the
  // transition reads as rising terrain rather than just a texture change.
  let h01 = mix(plains, max(plains, ridged), mtnBlend);
  let lift = mtnBlend * 0.6;

  return h01 * tp.amplitude * (1.0 + lift);
}
`;

export const SHADOW_PARAMS_STRUCT = /* wgsl */`
struct ShadowParams {
  lightViewProj : mat4x4<f32>,
  texel    : f32,
  bias     : f32,
  pcfRadius: f32,   // tap radius in texels (2.0 => 5x5 kernel)
  strength : f32,
};
`;

// Sampling helper. Expects in scope: SHADOW (ShadowParams), shadowTex (texture_depth_2d),
// shadowSamp (sampler_comparison). Returns visibility in [0,1] (1 = fully lit).
// PCF kernel size is driven by pcfRadius: radius 2 -> 5x5 (25 taps), radius 1 -> 3x3.
export const SHADOW_FN = /* wgsl */`
fn sampleShadow(worldPosIn : vec3<f32>, normal : vec3<f32>, ndl : f32) -> f32 {
  // Normal offset: push the sample point off the surface along its normal before
  // projecting into light space
  let normalOffset = SHADOW.texel * 2.0 * (1.0 - ndl) * 40.0;
  let worldPos = worldPosIn + normal * normalOffset;
  let lp = SHADOW.lightViewProj * vec4<f32>(worldPos, 1.0);
  // ortho() has w==1, but divide anyway to stay correct if a perspective light is used later
  let proj = lp.xyz / lp.w;
  // XY: clip [-1,1] -> [0,1] UV, flip Y for texture space.
  let uvRaw = proj.xy * vec2<f32>(0.5, -0.5) + vec2<f32>(0.5, 0.5);
  // Z: ortho() already emits WebGPU-convention depth in [0,1], so compare directly (no remap).
  let depthRef = proj.z;

  let inside = f32(uvRaw.x >= 0.0 && uvRaw.x <= 1.0 &&
                   uvRaw.y >= 0.0 && uvRaw.y <= 1.0 && depthRef <= 1.0);
  let uv = clamp(uvRaw, vec2<f32>(0.0), vec2<f32>(1.0));

  // slope-scaled bias: steeper grazing angle (small ndl) needs more bias
  let slopeBias = SHADOW.bias * (1.0 + (1.0 - ndl) * 3.0);
  let cmp = depthRef - slopeBias;

  let r = i32(SHADOW.pcfRadius);
  var sum = 0.0;
  var taps = 0.0;
  for (var dy = -r; dy <= r; dy = dy + 1) {
    for (var dx = -r; dx <= r; dx = dx + 1) {
      let off = vec2<f32>(f32(dx), f32(dy)) * SHADOW.texel;
      sum = sum + textureSampleCompareLevel(shadowTex, shadowSamp, uv + off, cmp);
      taps = taps + 1.0;
    }
  }
  let vis = sum / taps;          // 1 = lit, 0 = in shadow
  // outside the frustum there's no shadow data -> treat as fully lit
  return mix(1.0, vis, inside);
}
`;

export const SHADOW_BAKE = HEIGHT_FN + SHADOW_PARAMS_STRUCT + /* wgsl */`
@group(0) @binding(0) var<uniform> SHADOW : ShadowParams;
@group(0) @binding(1) var<uniform> TP : TerrainParams;
@group(0) @binding(2) var<storage, read> heights : array<f32>;

@vertex
fn vs(@builtin(vertex_index) vid : u32) -> @builtin(position) vec4<f32> {
  let n = TP.gridN;
  let ix = i32(vid % n);
  let iz = i32(vid / n);
  let span = TP.worldMax - TP.worldMin;
  let u = vec2<f32>(f32(ix), f32(iz)) / f32(n - 1u);
  let worldXZ = TP.worldMin + u * span;
  let y = heights[u32(iz) * n + u32(ix)];
  let worldPos = vec3<f32>(worldXZ.x, y, worldXZ.y);
  return SHADOW.lightViewProj * vec4<f32>(worldPos, 1.0);
}
`;

export const TERRAIN_BAKE = HEIGHT_FN + /* wgsl */`
@group(0) @binding(0) var<uniform> TP : TerrainParams;
@group(0) @binding(1) var<storage, read_write> heights : array<f32>;

@compute @workgroup_size(8, 8)
fn main(@builtin(global_invocation_id) gid : vec3<u32>) {
  if (gid.x >= TP.gridN || gid.y >= TP.gridN) { return; }
  let span = TP.worldMax - TP.worldMin;
  let uv = vec2<f32>(f32(gid.x), f32(gid.y)) / f32(TP.gridN - 1u);
  let worldXZ = TP.worldMin + uv * span;
  heights[gid.y * TP.gridN + gid.x] = heightAt(TP, worldXZ);
}
`;

export const TERRAIN_RENDER = HEIGHT_FN + SKY_PARAMS_STRUCT + FOG_FN + SHADOW_PARAMS_STRUCT + SHADOW_FN + /* wgsl */`
struct Camera { viewProj : mat4x4<f32>, eye : vec3<f32>, _p : f32, invViewProj : mat4x4<f32> };
@group(0) @binding(0) var<uniform> CAM : Camera;
@group(0) @binding(1) var<uniform> TP  : TerrainParams;
@group(0) @binding(2) var<storage, read> heights : array<f32>;
@group(0) @binding(3) var<uniform> SKY : SkyParams;
@group(0) @binding(4) var<uniform> FOG : FogParams;
@group(0) @binding(5) var<uniform> SHADOW : ShadowParams;
@group(0) @binding(6) var shadowTex  : texture_depth_2d;
@group(0) @binding(7) var shadowSamp : sampler_comparison;

struct VsOut {
  @builtin(position) clip : vec4<f32>,
  @location(0) worldPos : vec3<f32>,
  @location(1) normal   : vec3<f32>,
};

fn hAt(ix : i32, iz : i32) -> f32 {
  let n = i32(TP.gridN);
  let cx = clamp(ix, 0, n - 1);
  let cz = clamp(iz, 0, n - 1);
  return heights[cz * n + cx];
}

@vertex
fn vs(@builtin(vertex_index) vid : u32) -> VsOut {
  let n = TP.gridN;
  let ix = i32(vid % n);
  let iz = i32(vid / n);
  let span = TP.worldMax - TP.worldMin;
  let u = vec2<f32>(f32(ix), f32(iz)) / f32(n - 1u);
  let worldXZ = TP.worldMin + u * span;
  let y = heights[u32(iz) * n + u32(ix)];

  let cell = span / f32(n - 1u);
  let dx = hAt(ix + 1, iz) - hAt(ix - 1, iz);
  let dz = hAt(ix, iz + 1) - hAt(ix, iz - 1);
  let nrm = normalize(vec3<f32>(-dx * cell.y, 2.0 * cell.x * cell.y, -dz * cell.x));

  var out : VsOut;
  out.worldPos = vec3<f32>(worldXZ.x, y, worldXZ.y);
  out.clip = CAM.viewProj * vec4<f32>(out.worldPos, 1.0);
  out.normal = nrm;
  return out;
}

@fragment
fn fs(in : VsOut) -> @location(0) vec4<f32> {
  let lightDir = normalize(SKY.sunDir);
  let ndl = max(dot(in.normal, lightDir), 0.0);
  let t = clamp(in.worldPos.y / TP.amplitude, 0.0, 1.0);
  let low  = vec3<f32>(0.18, 0.22, 0.16);
  let mid  = vec3<f32>(0.30, 0.34, 0.22);
  let high = vec3<f32>(0.55, 0.54, 0.48);
  var albedo = mix(low, mid, smoothstep(0.0, 0.5, t));
  albedo = mix(albedo, high, smoothstep(0.5, 1.0, t));
  // shadow attenuates ONLY the direct sun term; ambient (skylight) stays.
  // strength lets a fully-shadowed fragment keep a little sun rather than going flat.
  let vis = sampleShadow(in.worldPos, in.normal, ndl);
  let sunVis = mix(1.0 - SHADOW.strength, 1.0, vis);
  // moon: a dim, unshadowed diffuse fill, only meaningful at night via moonVisible.
  let mdl = max(dot(in.normal, normalize(SKY.moonDir)), 0.0);
  let moon = SKY.moonColor * mdl * SKY.moonVisible * 0.12;
  let lit = albedo * (SKY.ambient + SKY.sunColor * ndl * sunVis + moon);
  let foggy = applyFog(lit, in.worldPos, CAM.eye, FOG);
  return vec4<f32>(foggy, 1.0);
}
`;

export const CREATURE_RENDER = SKY_PARAMS_STRUCT + FOG_FN + /* wgsl */`
struct Camera { viewProj : mat4x4<f32>, eye : vec3<f32>, _p : f32, invViewProj : mat4x4<f32> };
@group(0) @binding(0) var<uniform> CAM : Camera;
@group(0) @binding(1) var<uniform> SIZE : vec4<f32>;
@group(0) @binding(2) var<uniform> SKY : SkyParams;
@group(0) @binding(3) var<uniform> FOG : FogParams;

struct VsOut {
  @builtin(position) clip : vec4<f32>,
  @location(0) nrm : vec3<f32>,
  @location(1) tint : vec3<f32>,
  @location(2) worldPos : vec3<f32>,
};

// Per-species deformation of a canonical-space vertex (local mesh coords, +X fwd, +Y up,
// +Z right). species: 0 = deer, 1 = wolf. Returns the deformed local position
fn deform(localPos : vec3<f32>, species : f32) -> vec3<f32> {
  // axis scales: deer is taller (Y) and a touch shorter (X); wolf is longer (X) and lower (Y).
  let deerS = vec3<f32>(0.95, 1.25, 0.85) * 2;
  let wolfS = vec3<f32>(0.60, 0.70, 0.85) * 2;
  let s = mix(deerS, wolfS, species);
  var p = localPos * s;

  // neck/head live at high local X (>~0.42). Deer carry the head high & upright; wolves
  // hold it low and forward. Shift the upper body's Y by how far forward it is.
  let headRegion = smoothstep(0.40, 0.62, localPos.x);
  let deerLift =  0.18;
  let wolfDrop = -0.16;
  p.y = p.y + headRegion * mix(deerLift, wolfDrop, species);
  // wolves push the muzzle further forward (predatory), deer less so
  p.x = p.x + headRegion * mix(0.02, 0.10, species);

  let tailRegion = smoothstep(-0.52, -0.58, localPos.x);
  let tailT = clamp((-0.52 - localPos.x) / 0.20, 0.0, 1.0);
  let deerTailY =  0.50;
  let wolfTailY =  0.17;
  let deerTailX =  0.05;
  let wolfTailX = -0.37;
  p.y = p.y + tailRegion * tailT * mix(deerTailY, wolfTailY, species);
  p.x = p.x + tailRegion * tailT * mix(deerTailX, wolfTailX, species);
  return p;
}

// matching normal deform: for a diagonal scale S, correct normal transform is N/S then
// renormalize. The head-region Y/X shears are small and ignored for the normal (visually
// negligible vs the cost of a full Jacobian).
fn deformNormal(localN : vec3<f32>, species : f32) -> vec3<f32> {
  let deerS = vec3<f32>(0.95, 1.25, 0.85);
  let wolfS = vec3<f32>(1.20, 0.80, 0.95);
  let s = mix(deerS, wolfS, species);
  return normalize(localN / s);
}

@vertex
fn vs(@location(0) vPos : vec3<f32>,
      @location(1) vNrm : vec3<f32>,
      @location(2) instPos : vec4<f32>,
      @location(3) instSH  : vec2<f32>) -> VsOut {
  let species = instSH.x;
  let heading = instSH.y;

  let dl = deform(vPos, species);
  let dn = deformNormal(vNrm, species);

  // rotate about Y by heading so +X (nose) points along travel direction.
  // MOVE travels by (dx,dz) = (cos(heading), sin(heading)) in world XZ, so the nose
  // (local +X) must map to that same (cos,sin). That requires:
  //   x' = x*ch - z*sh ;  z' = x*sh + z*ch
  let ch = cos(heading); let sh = sin(heading);
  let rl = vec3<f32>(dl.x*ch - dl.z*sh, dl.y, dl.x*sh + dl.z*ch);
  let rn = vec3<f32>(dn.x*ch - dn.z*sh, dn.y, dn.x*sh + dn.z*ch);

  // scale to world size and place at the instance ground position. instPos.y already
  // sits ~1.5 above ground (move pass); the mesh's own feet are at local y=0, so we
  // drop the placement down by that offset so feet meet the ground rather than float.
  let scale = SIZE.x;
  let foot = instPos.xyz - vec3<f32>(0.0, 0.0, 0.0);   // undo the move-pass body lift
  let worldPos = foot + rl * scale;

  var out : VsOut;
  out.worldPos = worldPos;
  out.clip = CAM.viewProj * vec4<f32>(worldPos, 1.0);
  out.nrm = rn;
  // tint: species base color + slight per-individual variation from the instance position
  let h = fract(sin(dot(instPos.xz, vec2<f32>(12.9898, 78.233))) * 43758.5453);
  let deerCol = mix(vec3<f32>(0.55, 0.38, 0.22), vec3<f32>(0.68, 0.50, 0.30), h);
  let wolfCol = mix(vec3<f32>(0.34, 0.34, 0.36), vec3<f32>(0.50, 0.50, 0.52), h);
  var baseTint = mix(deerCol, wolfCol, species);
  // Deer have a white tail ("flag"). Tail verts are the only geometry at local x < -0.52;
  // reuse that same test and whiten only on deer (species==0), ramping toward the tip.
  let tailMask = smoothstep(-0.52, -0.58, vPos.x) * (1.0 - species);
  out.tint = mix(baseTint, vec3<f32>(0.92, 0.92, 0.90), tailMask);
  return out;
}

@fragment
fn fs(in : VsOut) -> @location(0) vec4<f32> {
  let nrm = normalize(in.nrm);
  let lightDir = normalize(SKY.sunDir);
  let ndl = max(dot(nrm, lightDir), 0.0);
  // a touch of wrap lighting so the shadowed side isn't pure ambient-flat
  let wrap = ndl * 0.85 + 0.15;
  // dim moon fill, wrapped the same way, only meaningful at night
  let mdl = max(dot(nrm, normalize(SKY.moonDir)), 0.0);
  let moon = SKY.moonColor * (mdl * 0.85 + 0.15) * SKY.moonVisible * 0.12;
  let lit = in.tint * (SKY.ambient + SKY.sunColor * wrap + moon);
  let foggy = applyFog(lit, in.worldPos, CAM.eye, FOG);
  return vec4<f32>(foggy, 1.0);
}
`;

export const WATER_RENDER = SKY_PARAMS_STRUCT + FOG_FN + /* wgsl */`
struct Camera { viewProj : mat4x4<f32>, eye : vec3<f32>, _p : f32, invViewProj : mat4x4<f32> };
struct WaterParams { worldMin : vec2<f32>, worldMax : vec2<f32>, waterLevel : f32, time : f32, _p0:f32, _p1:f32 };

@group(0) @binding(0) var<uniform> CAM : Camera;
@group(0) @binding(1) var<uniform> SKY : SkyParams;
@group(0) @binding(2) var<uniform> WP  : WaterParams;
@group(0) @binding(3) var<uniform> FOG : FogParams;

struct VsOut {
  @builtin(position) clip : vec4<f32>,
  @location(0) worldPos : vec3<f32>,
};

// 6 vertex_index values draw 2 triangles; no index buffer needed for one static quad.
@vertex
fn vs(@builtin(vertex_index) vid : u32) -> VsOut {
  var corners = array<vec2<f32>, 6>(
    vec2<f32>(0.0, 0.0), vec2<f32>(1.0, 0.0), vec2<f32>(1.0, 1.0),
    vec2<f32>(0.0, 0.0), vec2<f32>(1.0, 1.0), vec2<f32>(0.0, 1.0),
  );
  let uv = corners[vid];
  let xz = WP.worldMin + uv * (WP.worldMax - WP.worldMin);
  let worldPos = vec3<f32>(xz.x, WP.waterLevel, xz.y);

  var out : VsOut;
  out.clip = CAM.viewProj * vec4<f32>(worldPos, 1.0);
  out.worldPos = worldPos;
  return out;
}

fn hash2(p : vec2<f32>) -> f32 {
  return fract(sin(dot(p, vec2<f32>(127.1, 311.7))) * 43758.5453123);
}
fn vnoise(p : vec2<f32>) -> f32 {
  let i = floor(p); let f = fract(p);
  let u = f * f * (3.0 - 2.0 * f);
  let a = hash2(i); let b = hash2(i + vec2<f32>(1.0, 0.0));
  let c = hash2(i + vec2<f32>(0.0, 1.0)); let d = hash2(i + vec2<f32>(1.0, 1.0));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}

// Animated normal: two scrolling noise layers perturbing the flat normal (0,1,0).
fn waterNormal(xz : vec2<f32>, t : f32) -> vec3<f32> {
  let p1 = xz * 0.05 + vec2<f32>(t * 0.6, t * 0.35);
  let p2 = xz * 0.13 - vec2<f32>(t * 0.4, t * 0.5);
  let n1 = vnoise(p1) - 0.5;
  let n2 = vnoise(p2) - 0.5;
  let slope = vec2<f32>(n1, n2) * 0.35;
  return normalize(vec3<f32>(-slope.x, 1.0, -slope.y));
}

@fragment
fn fs(in : VsOut) -> @location(0) vec4<f32> {
  let nrm = waterNormal(in.worldPos.xz, WP.time);
  let viewDir = normalize(CAM.eye - in.worldPos);

  // Fresnel: grazing angles reflect sky, head-on shows deep-water tint
  let fresnel = pow(1.0 - max(dot(nrm, viewDir), 0.0), 4.0);
  let deepColor = vec3<f32>(0.04, 0.12, 0.16);
  let skyReflect = mix(SKY.skyBottom, SKY.skyTop, 0.5);
  var col = mix(deepColor, skyReflect, clamp(fresnel, 0.0, 0.85));

  // specular sun glint (exponent 64: near-indistinguishable from 120 on water,
  // cheaper pow evaluation per fragment)
  let halfV = normalize(normalize(SKY.sunDir) + viewDir);
  let spec = pow(max(dot(nrm, halfV), 0.0), 64.0) * SKY.sunVisible;
  col = col + SKY.sunColor * spec * 1.5;

  col = applyFog(col, in.worldPos, CAM.eye, FOG);
  return vec4<f32>(col, 0.85); // slightly transparent; blended over terrain
}
`;

// Plants: instanced crossed billboards with vertex-shader wind sway. One instance per plant;
// 12 vertices (two quads). Camera + Sky + Fog + PlantDraw. (Host factory: createPlants in
// renderer.js.)
export const PLANT_RENDER = SKY_PARAMS_STRUCT + FOG_FN + /* wgsl */`
struct Camera { viewProj : mat4x4<f32>, eye : vec3<f32>, _p : f32, invViewProj : mat4x4<f32> };
struct PlantDraw {
  colA   : vec3<f32>, time  : f32,   // base foliage color (young), sim time (sway phase)
  colB   : vec3<f32>, height: f32,   // tip foliage color (mature/dry), base world height
  width  : f32, sway : f32, _p0 : f32, _p1 : f32,   // half-width, sway amplitude (world units)
};

@group(0) @binding(0) var<uniform> CAM : Camera;
@group(0) @binding(1) var<uniform> PD  : PlantDraw;
@group(0) @binding(2) var<uniform> SKY : SkyParams;
@group(0) @binding(3) var<uniform> FOG : FogParams;

struct VsOut {
  @builtin(position) clip : vec4<f32>,
  @location(0) worldPos : vec3<f32>,
  @location(1) tv       : f32,    // 0 at root, 1 at tip (vertical param, for tint + sway)
  @location(2) uvx      : f32,    // -1..1 across the quad width (for the leaf-edge cutout)
  @location(3) tint     : vec3<f32>,
};

fn hash11(x : f32) -> f32 { return fract(sin(x * 91.345) * 47453.21); }

@vertex
fn vs(@builtin(vertex_index) vid : u32,
      @location(0) inst : vec4<f32>) -> VsOut {
  // x = width axis in [-1,1], y = height in [0,1]. 6 verts each; vid<6 -> quad A, else B.
  var corners = array<vec2<f32>, 6>(
    vec2<f32>(-1.0, 0.0), vec2<f32>( 1.0, 0.0), vec2<f32>( 1.0, 1.0),
    vec2<f32>(-1.0, 0.0), vec2<f32>( 1.0, 1.0), vec2<f32>(-1.0, 1.0),
  );
  let quad = vid / 6u;
  let c = corners[vid % 6u];

  let seed = inst.w;
  // Eaten plants are marked inert by the INTERACT pass setting inst.w negative (valid seeds
  // are in [0,1)). Collapse every vertex of an eaten instance to a single clip-space point so
  // it produces zero-area triangles and disappears from the mesh. No index/draw-count change:
  // the instance is still drawn, it just rasterizes nothing (mark-to-inert, not compaction).
  if (seed < 0.0) {
    var gone : VsOut;
    gone.clip = vec4<f32>(2.0, 2.0, 2.0, 1.0);  // outside the clip volume, degenerate
    gone.worldPos = vec3<f32>(0.0);
    gone.tv = 0.0; gone.uvx = 0.0; gone.tint = vec3<f32>(0.0);
    return gone;
  }
  // per-plant size so a field doesn't look stamped.
  let hgt = PD.height * (0.65 + 0.70 * seed);
  let halfW = PD.width * (0.75 + 0.50 * hash11(seed * 7.13 + 1.0));

  // Billboard the width axis about Y only: a horizontal "right" across the view direction
  // (in XZ) so the card turns to face the camera in yaw but stays vertical. Quad B uses the
  // perpendicular horizontal axis so the two cross.
  let toEye = CAM.eye - inst.xyz;
  var rightA = normalize(vec3<f32>(-toEye.z, 0.0, toEye.x) + vec3<f32>(1e-4, 0.0, 0.0));
  var rightB = vec3<f32>(-rightA.z, 0.0, rightA.x);
  let right = select(rightA, rightB, quad == 1u);

  // Wind sway: displace the top along a per-plant-phased sine, tapered by height^2 so the
  // root stays fixed. Direction is a gentle world-space drift (matches the rain wind).
  let phase = seed * 6.2831853;
  let s = sin(PD.time * 1.6 + phase) + 0.35 * sin(PD.time * 3.1 + phase * 1.7);
  let swayOff = vec3<f32>(0.8, 0.0, 0.5) * (PD.sway * s * c.y * c.y);

  let worldPos = inst.xyz
    + right * (c.x * halfW)
    + vec3<f32>(0.0, 1.0, 0.0) * (c.y * hgt)
    + swayOff;

  let dry = hash11(seed * 3.77 + 0.5);
  var out : VsOut;
  out.worldPos = worldPos;
  out.clip = CAM.viewProj * vec4<f32>(worldPos, 1.0);
  out.tv = c.y;
  out.uvx = c.x;
  out.tint = mix(PD.colA, PD.colB, dry * 0.85);
  return out;
}

@fragment
fn fs(in : VsOut) -> @location(0) vec4<f32> {
  // Leaf cutout: taper the silhouette toward the tip so the quad reads as a blade, not a
  // rectangle. Discard fragments outside the allowed (shrinking) width.
  let allowed = 1.0 - in.tv * 0.85;
  if (abs(in.uvx) > allowed) { discard; }

  let shade = 0.45 + 0.55 * in.tv;   // darker at the self-shadowed root, brighter at the tip

  // Sky-driven light: ambient + soft sun wrap + faint moon fill, then fogged like everything.
  let sunWrap = clamp(SKY.sunDir.y * 0.5 + 0.5, 0.0, 1.0);
  let sun = SKY.sunColor * (0.35 + 0.65 * sunWrap);
  let moon = SKY.moonColor * SKY.moonVisible * 0.10;
  let lit = in.tint * shade * (SKY.ambient + sun + moon);

  let foggy = applyFog(lit, in.worldPos, CAM.eye, FOG);
  return vec4<f32>(foggy, 1.0);
}
`;

// Cat companion: creature-style lighting (Sky ambient + sun wrap + moon fill + fog)
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

// Move: placeholder movement. Random-walk in XZ, then snap Y via the shared
// heightAt() (same noise as the renderer). Proves on-GPU position updates with
// no CPU.
export const MOVE = HEIGHT_FN + /* wgsl */`
struct MoveParams {
  time : f32, dt : f32, speed : f32, N : u32,
  waterLevel : f32,   // world Y of the water plane
  floatDepth : f32,   // how far below the surface a floating body sits
  _p0 : f32, _p1 : f32,
};
// SenseResult mirrors grid.js: per-entity neighbor summary produced by the SENSE pass that
// runs immediately before MOVE. Bound read-only here (binding 4) so movement can react.
struct SenseResult { count : u32, nearest : u32, nearestD2 : f32, _pad : u32 };

@group(0) @binding(0) var<uniform> MP : MoveParams;
@group(0) @binding(1) var<uniform> TP : TerrainParams;
@group(0) @binding(2) var<storage, read_write> positions : array<vec4<f32>>;
@group(0) @binding(3) var<storage, read_write> speciesHeading : array<vec2<f32>>;
@group(0) @binding(4) var<storage, read> senseOut : array<SenseResult>;

fn hash11(x : f32) -> f32 { return fract(sin(x * 91.345) * 47453.21); }
// two-input hash: stable random in [0,1) for a given (entity, epoch) pair.
fn hash21(a : f32, b : f32) -> f32 { return fract(sin(a * 91.345 + b * 47.853) * 47453.21); }

@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) gid : vec3<u32>) {
  let i = gid.x;
  if (i >= MP.N) { return; }
  var p = positions[i];

  // Dead animals freeze in place. Energy lives in positions[i].w; the INTERACT pass drives it
  // to <= 0 via metabolic drain or predation. We keep the corpse visible (the CREATURE_RENDER
  // VS still draws it) but skip all steering/locomotion so it stays exactly where it fell.
  // No position/heading writes below run for the dead.
  if (p.w <= 0.0) { return; }

  // The animal's ACTUAL facing persists in speciesHeading[i].y across frames. We never snap
  // it: each frame we pick a DESIRED heading and rotate the current facing toward it by at
  // most MAX_TURN*dt radians. This turn-rate cap is what kills the sub-second left/right
  // stutter: the nearest-neighbor target can flip between frames, but the body physically
  // can't reverse that fast, so a one-frame target flip only nudges the heading a few degrees.
  // (Placeholder steering until per-animal neural nets drive the desired heading instead.)
  let MAX_TURN = 2.5;   // radians/sec; ~quick-but-physical predator turn at the 30Hz step
  let me = speciesHeading[i];
  var ang = me.y;       // current facing (what we actually travel along)

  // Desired heading. Default: a slow random wander that changes each WANDER_SECS window
  // (epoch = floor(time/WANDER_SECS) is constant for the whole window, so the hash is too).
  let WANDER_SECS = 10.0;
  let epoch = floor(MP.time / WANDER_SECS);
  var want = hash21(f32(i) + 1.0, epoch) * 6.2831853;

  // If something's in sense range, override the desired heading: species 1 (wolf) pursues
  // its single nearest target; species 0 (deer) flees it (+pi). Target selection is still
  // per-frame/stateless here on purpose — the turn cap absorbs the churn until the nets add
  // real target locking.
  let sr = senseOut[i];
  if (sr.nearest != 0xffffffffu) {
    let q = positions[sr.nearest].xyz;
    let toN = vec2<f32>(q.x - p.x, q.z - p.z);
    if (dot(toN, toN) > 1e-4) {
      want = atan2(toN.y, toN.x);
      if (me.x < 0.5) { want = want + 3.1415927; }  // deer: flee
    }
  }

  var d = want - ang;
  d = d - 6.2831853 * floor((d + 3.1415927) / 6.2831853);  // wrap to (-pi, pi]
  let maxStep = MAX_TURN * MP.dt;
  ang = ang + clamp(d, -maxStep, maxStep);

  let step = MP.speed * MP.dt;
  let dx = cos(ang) * step;
  let dz = sin(ang) * step;
  p.x = p.x + dx;
  p.z = p.z + dz;

  // keep inside world XZ bounds (reflect)
  p.x = clamp(p.x, TP.worldMin.x, TP.worldMax.x);
  p.z = clamp(p.z, TP.worldMin.y, TP.worldMax.y);

  // Ground follow, with water interaction. Normally the body sits a little above the
  // terrain surface. Where the terrain dips below the water plane, the entity instead
  // floats: it rides at waterLevel minus a small floatDepth so it appears to sit ON the
  // water rather than sinking
  let ground = heightAt(TP, vec2<f32>(p.x, p.z)) + 1.5;
  let floatY = MP.waterLevel - MP.floatDepth;
  p.y = max(ground, floatY);

  positions[i] = p;

  // facing: heading is the chosen travel direction
  var sh = speciesHeading[i];
  sh.y = ang;
  speciesHeading[i] = sh;
}
`;

// ===========================================================================
// INTERACT (Tier 2.3 + 2.4): energy economy + eating, one thread per creature.
// Runs AFTER the creature SENSE pass and the plant grid build, BEFORE MOVE, so:
//   - it can read creature senseOut[i].nearest (nearest creature) for predation, and
//   - it can query the plant grid (cellStart/cellCount/sortedIdx over the plant buffer) for
//     herbivore grazing, without a second full SENSE pass.
//
// Model (mark-to-inert energy transfer; no removal here):
//   * Every LIVING animal pays a metabolic cost   e -= metabolicRate * dt   -> starvation.
//   * species 1 (wolf/predator): if its nearest creature is a LIVING deer within eatRadius,
//     it CLAIMS that prey (atomic 0->1 so only one predator eats it per frame), drains
//     transferPred energy from the prey (capped), and banks gainPred into itself (capped at
//     maxEnergy). A drain that takes prey energy <= 0 is the kill; MOVE freezes it next.
//   * species 0 (deer/herbivore): scans the PLANT grid over a capped neighborhood (center
//     cell + 1 ring, at most MAX_SCAN candidates) for the nearest un-eaten plant within
//     eatRadius. It CLAIMS that plant (atomic 0->1), banks gainHerb energy (capped), and marks
//     the plant inert by writing its .w negative -> the plant VS emits degenerate verts, so it
//     vanishes from the mesh and is skipped by every future scan (w<0 == already eaten).
//
// Prey/plant claims live in two atomic<u32> buffers cleared each frame by CLAIM_CLEAR. The
// creature scan is O(1) (reuses the single nearest from SENSE); the plant scan is bounded by
// MAX_SCAN so cost stays fixed regardless of cluster density.
export const INTERACT = /* wgsl */`
struct InteractParams {
  dt          : f32,
  N           : u32,      // creature count
  eatRadius   : f32,      // world-units reach for a bite (predator + herbivore)
  metabolic   : f32,      // energy/sec drained from every living animal
  transferPred: f32,      // energy/sec a predator drains from claimed prey
  gainPred    : f32,      // energy/sec a predator banks from a successful bite
  gainHerb    : f32,      // energy/sec a herbivore banks from a claimed plant
  maxEnergy   : f32,      // energy clamp (so a well-fed animal doesn't grow unbounded)
  maxScan     : u32,      // hard cap on LIVE plant candidates considered per herbivore
  plantBase   : u32,      // offset into the shared claim buffer where plant claims begin (= N)
  maxWalk     : u32,      // hard cap on RAW grid entries examined (bounds cost in dense cells)
  _p0 : u32,
};
// Plant grid Params: same layout as the grid COMMON Params struct.
struct GParams {
  worldMin : vec3<f32>, N : u32,
  worldMax : vec3<f32>, cellSize : f32,
  gridDims : vec3<u32>, totalCells : u32,
};
struct SenseResult { count : u32, nearest : u32, nearestD2 : f32, _pad : u32 };

@group(0) @binding(0) var<uniform> IP : InteractParams;
@group(0) @binding(1) var<storage, read_write> positions      : array<vec4<f32>>; // creatures (.w=energy)
@group(0) @binding(2) var<storage, read>       speciesHeading : array<vec2<f32>>; // .x=species
@group(0) @binding(3) var<storage, read>       senseOut       : array<SenseResult>;
// ONE shared claim buffer keeps the compute stage within the 8-storage-buffer limit: creature
// (prey) claims live at [0, N); plant claims live at [plantBase, plantBase + plantCount).
@group(0) @binding(4) var<storage, read_write> claim          : array<atomic<u32>>;
// Plant grid (read plant positions; mark eaten by writing .w<0).
@group(0) @binding(5) var<uniform> GP : GParams;
@group(0) @binding(6) var<storage, read_write> plants         : array<vec4<f32>>; // (.w=seed; <0 eaten)
@group(0) @binding(7) var<storage, read>       plantStart     : array<u32>;
@group(0) @binding(8) var<storage, read>       plantCountRO   : array<u32>;
@group(0) @binding(9) var<storage, read>       plantSorted    : array<u32>;

fn plantCell(posIn : vec3<f32>) -> vec3<u32> {
  var p = posIn;
  if (!(p.x == p.x)) { p.x = GP.worldMin.x; }
  if (!(p.y == p.y)) { p.y = GP.worldMin.y; }
  if (!(p.z == p.z)) { p.z = GP.worldMin.z; }
  let rel = (p - GP.worldMin) / GP.cellSize;
  let gx = u32(clamp(floor(rel.x), 0.0, f32(GP.gridDims.x - 1u)));
  let gy = select(0u, u32(clamp(floor(rel.y), 0.0, f32(GP.gridDims.y - 1u))), GP.gridDims.y > 1u);
  let gz = u32(clamp(floor(rel.z), 0.0, f32(GP.gridDims.z - 1u)));
  return vec3<u32>(gx, gy, gz);
}
fn plantRange(x : u32, y : u32, z : u32) -> vec2<u32> {
  let idx = x + GP.gridDims.x * (y + GP.gridDims.y * z);
  let s = plantStart[idx];
  return vec2<u32>(s, s + plantCountRO[idx]);
}

@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) gid : vec3<u32>) {
  let i = gid.x;
  if (i >= IP.N) { return; }

  var p = positions[i];
  if (p.w <= 0.0) { return; }              // already dead: no metabolism, no eating

  // ---- metabolic drain: the clock that makes energy (and death) mean something ----
  var energy = p.w - IP.metabolic * IP.dt;

  let species = speciesHeading[i].x;
  let r2 = IP.eatRadius * IP.eatRadius;

  if (species >= 0.5) {
    // ----- PREDATOR: eat the nearest LIVING deer within reach (claimed once/frame) -----
    let sr = senseOut[i];
    let j = sr.nearest;
    if (j != 0xffffffffu && j < IP.N) {
      let prey = positions[j];
      let preyIsDeer = speciesHeading[j].x < 0.5;
      if (preyIsDeer && prey.w > 0.0) {
        let d = prey.xyz - p.xyz;
        if (dot(d, d) <= r2) {
          // claim the prey: 0 -> 1. Only the winning predator this frame proceeds.
          let won = atomicCompareExchangeWeak(&claim[j], 0u, 1u);
          if (won.exchanged) {
            let drain = min(prey.w, IP.transferPred * IP.dt);
            positions[j].w = prey.w - drain;     // may cross <= 0 -> the kill; MOVE freezes it
            energy = min(IP.maxEnergy, energy + IP.gainPred * IP.dt);
          }
        }
      }
    }
  } else {
    // ----- HERBIVORE: graze the nearest un-eaten plant within reach, capped scan -----
    let myPos = p.xyz;
    let c = plantCell(myPos);
    let R = 1u;                              // center + one ring (capped neighborhood)
    let xLo = max(c.x, R) - R; let xHi = min(c.x + R, GP.gridDims.x - 1u);
    let zLo = max(c.z, R) - R; let zHi = min(c.z + R, GP.gridDims.z - 1u);
    let yLo = select(c.y, max(c.y, R) - R, GP.gridDims.y > 1u);
    let yHi = select(c.y, min(c.y + R, GP.gridDims.y - 1u), GP.gridDims.y > 1u);

    var best = 0xffffffffu;
    var bestD2 = 3.4e38;
    var tested = 0u;   // LIVE plants considered (drives the eat-reliability cap)
    var walked = 0u;   // raw entries examined (drives the hard cost bound)

    var z = zLo;
    loop {
      if (z > zHi || tested >= IP.maxScan || walked >= IP.maxWalk) { break; }
      var y = yLo;
      loop {
        if (y > yHi || tested >= IP.maxScan || walked >= IP.maxWalk) { break; }
        var x = xLo;
        loop {
          if (x > xHi || tested >= IP.maxScan || walked >= IP.maxWalk) { break; }

          // walk this cell's sorted plant entries: skip eaten (.w < 0), track nearest in reach
          let rg = plantRange(x, y, z);
          var k = rg.x;
          loop {
            if (k >= rg.y || tested >= IP.maxScan || walked >= IP.maxWalk) { break; }
            walked = walked + 1u;
            let pi = plantSorted[k];
            let pl = plants[pi];
            if (pl.w >= 0.0) {               // live plant (eaten ones are marked w = -1)
              tested = tested + 1u;
              let d = pl.xyz - myPos;
              let d2 = dot(d, d);
              if (d2 <= r2 && d2 < bestD2) { bestD2 = d2; best = pi; }
            }
            k = k + 1u;
          }

          x = x + 1u;
        }
        y = y + 1u;
      }
      z = z + 1u;
    }

    if (best != 0xffffffffu) {
      // claim the plant: 0 -> 1, so two deer can't both eat it this frame. Plant claims are
      // offset by plantBase (= N) so they never collide with creature (prey) claims.
      let won = atomicCompareExchangeWeak(&claim[IP.plantBase + best], 0u, 1u);
      if (won.exchanged) {
        plants[best].w = -1.0;               // mark inert: vanishes + skipped by all scans
        energy = min(IP.maxEnergy, energy + IP.gainHerb * IP.dt);
      }
    }
  }

  positions[i].w = energy;   // write back energy only; MOVE owns xyz/heading next
}
`;

// CLAIM_CLEAR: zero one atomic<u32> claim buffer (creatures or plants). One thread per slot.
// Dispatched twice per frame (once per buffer) before INTERACT, so each prey/plant can be
// claimed exactly once that frame.
export const CLAIM_CLEAR = /* wgsl */`
struct ClearParams { count : u32, _p0 : u32, _p1 : u32, _p2 : u32 };
@group(0) @binding(0) var<uniform> CP : ClearParams;
@group(0) @binding(1) var<storage, read_write> claim : array<atomic<u32>>;
@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) gid : vec3<u32>) {
  let i = gid.x;
  if (i >= CP.count) { return; }
  atomicStore(&claim[i], 0u);
}
`;
// INIT: one-time GPU seeding of the entity buffers. Replaces the CPU Float32Array
// build+upload that stalled on every scale change (that path allocated N*16 + N*8 bytes,
// filled them on the CPU, and blocked on two writeBuffers). Here each entity hashes its
// own index against the world seed to place itself, choose a species + heading, and set a
// starting energy, entirely on the GPU. Same seed -> same scatter (the hashes are pure),
// so determinism is preserved.
//
// Buffers written (must match the MOVE bind group so INIT can reuse the same layout):
//   positions      : array<vec4<f32>>  (.xyz = world pos, .w = energy)
//   speciesHeading : array<vec2<f32>>  (.x = species {0,1}, .y = heading radians)
//
// The world-Y is seeded above the terrain (at amplitude) exactly as the old CPU path did;
// the first MOVE pass snaps every entity down onto the ground/water on frame 0.
export const INIT = HEIGHT_FN + /* wgsl */`
struct InitParams {
  worldMin : vec2<f32>,
  worldMax : vec2<f32>,
  amplitude : f32,
  seed      : f32,
  N         : u32,
  deerFrac  : f32,   // fraction assigned species 0 (deer); rest are species 1 (wolf)
};
@group(0) @binding(0) var<uniform> IP : InitParams;
@group(0) @binding(1) var<storage, read_write> positions : array<vec4<f32>>;
@group(0) @binding(2) var<storage, read_write> speciesHeading : array<vec2<f32>>;

// Pure hashes: identical stream for a given (index, salt) pair on any GPU, so the scatter
// is reproducible from the seed alone (matches the determinism the CPU RNG gave us).
fn ih11(x : f32) -> f32 { return fract(sin(x * 91.345) * 47453.21); }
fn ih21(a : f32, b : f32) -> f32 { return fract(sin(a * 91.345 + b * 47.853) * 47453.21); }

@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) gid : vec3<u32>) {
  let i = gid.x;
  if (i >= IP.N) { return; }

  let fi = f32(i);
  // decorrelate the draws by salting each with the seed + a distinct constant.
  let rx = ih21(fi + 1.0,  IP.seed + 17.13);
  let rz = ih21(fi + 2.0,  IP.seed + 43.71);
  let rs = ih21(fi + 3.0,  IP.seed + 91.19);
  let rh = ih21(fi + 4.0,  IP.seed + 57.07);

  var p : vec4<f32>;
  p.x = IP.worldMin.x + rx * (IP.worldMax.x - IP.worldMin.x);
  p.z = IP.worldMin.y + rz * (IP.worldMax.y - IP.worldMin.y);
  p.y = IP.amplitude;              // seeded high; MOVE snaps to ground/water on frame 0
  p.w = 0.5 + 0.5 * ih11(fi + 5.0); // starting energy in [0.5,1.0)
  positions[i] = p;

  let species = select(1.0, 0.0, rs < IP.deerFrac);
  speciesHeading[i] = vec2<f32>(species, rh * 6.2831853);
}
`;
// ===========================================================================
// GRID: GPU-resident uniform-grid neighbor search (was grid.js)
// ===========================================================================

// grid.js: GPU-resident uniform-grid neighbor search: WGSL + host orchestration
// + the downstream sensing pass, all in one subsystem file.
//
// Per frame: clear -> count -> scan(local) -> scan(blockSums) -> scan(addOffsets) -> scatter.
// WG=64 (per-entity), SCAN_WG=256 (per-cell, block size 512 via 2 loads). flat 2D: gridDims.y=1.
// No host readback in the hot path: buildFrame() only records dispatches.

export const WG = 64;
export const SCAN_BLOCK = 512;   // elements processed per scan workgroup (256 threads * 2)
export const SCAN_WG = 256;

// Shared declarations injected at the top of grid compute shaders.
export const COMMON = /* wgsl */`
struct Params {
  worldMin : vec3<f32>,
  N        : u32,
  worldMax : vec3<f32>,
  cellSize : f32,
  gridDims : vec3<u32>,   // (gx, gy, gz); gy = 1 for a flat 2D world
  totalCells : u32,       // gx*gy*gz, precomputed on host to avoid recompute
};

@group(0) @binding(0) var<uniform> P : Params;
@group(0) @binding(1) var<storage, read>        positions : array<vec4<f32>>;
@group(0) @binding(2) var<storage, read_write>  cellCount : array<atomic<u32>>;
@group(0) @binding(3) var<storage, read_write>  cellStart : array<u32>;
@group(0) @binding(4) var<storage, read_write>  sortedEntityIndices : array<u32>;
@group(0) @binding(5) var<storage, read_write>  localCounter : array<atomic<u32>>; // scatter cursor, length=totalCells

// World position -> clamped 3D cell. Handles on-worldMax (clamp down), NaN (steer to
// cell 0), and non-dividing cellSize (floor+clamp absorbs the remainder edge cells).
fn cellCoord(posIn : vec3<f32>) -> vec3<u32> {
  var p = posIn;
  // NaN scrub: (p == p) is false for NaN. Replace any NaN component with worldMin (-> edge cell 0).
  if (!(p.x == p.x)) { p.x = P.worldMin.x; }
  if (!(p.y == p.y)) { p.y = P.worldMin.y; }
  if (!(p.z == p.z)) { p.z = P.worldMin.z; }

  let rel = (p - P.worldMin) / P.cellSize;            // float cell coords
  // floor then clamp into [0, gridDims-1]. max(...,0) guards entities below worldMin
  // (including +/-inf which floor()s to a huge value -> clamped by min()).
  let gx = u32(clamp(floor(rel.x), 0.0, f32(P.gridDims.x - 1u)));
  let gy = select(0u,
                  u32(clamp(floor(rel.y), 0.0, f32(P.gridDims.y - 1u))),
                  P.gridDims.y > 1u);                  // flat 2D: y collapses to 0 with no math risk
  let gz = u32(clamp(floor(rel.z), 0.0, f32(P.gridDims.z - 1u)));
  return vec3<u32>(gx, gy, gz);
}

fn cellIndex(c : vec3<u32>) -> u32 {
  // x-fastest linearization
  return c.x + P.gridDims.x * (c.y + P.gridDims.y * c.z);
}
`;

// Pass 1: clear cellCount and localCounter to zero. One thread per cell.
export const CLEAR = COMMON + /* wgsl */`
@compute @workgroup_size(${WG})
fn main(@builtin(global_invocation_id) gid : vec3<u32>) {
  let i = gid.x;
  if (i >= P.totalCells) { return; }
  atomicStore(&cellCount[i], 0u);
  atomicStore(&localCounter[i], 0u);
}
`;

// Pass 2: count. One thread per entity; atomically bump its cell's count.
export const COUNT = COMMON + /* wgsl */`
@compute @workgroup_size(${WG})
fn main(@builtin(global_invocation_id) gid : vec3<u32>) {
  let i = gid.x;
  if (i >= P.N) { return; }
  let c = cellIndex(cellCoord(positions[i].xyz));
  atomicAdd(&cellCount[i_clamp(c)], 1u);
}
// cellIndex already clamps coords, so c is always < totalCells; this guard is belt-and-suspenders.
fn i_clamp(c : u32) -> u32 { return min(c, P.totalCells - 1u); }
`;

// Pass 3: work-efficient exclusive (Blelloch) scan, blocked. Each workgroup scans
// SCAN_BLOCK=512 elems in shared memory; a second level scans blockSums; a third adds
// offsets back. Scales to totalCells <= SCAN_BLOCK^2 with one block-sum level.
//
// IMPORTANT: scan reads cellCount as plain u32, not atomic. WGSL forbids aliasing one
// buffer as both atomic and non-atomic, so the JS binds the same buffer under a
// non-atomic view for these passes.
export const SCAN_LOCAL = /* wgsl */`
struct ScanParams { totalCells : u32, numBlocks : u32, _pad0 : u32, _pad1 : u32 };
@group(0) @binding(0) var<uniform> SP : ScanParams;
@group(0) @binding(1) var<storage, read>        countIn  : array<u32>; // == cellCount, non-atomic view
@group(0) @binding(2) var<storage, read_write>  scanOut  : array<u32>; // == cellStart
@group(0) @binding(3) var<storage, read_write>  blockSums: array<u32>;

var<workgroup> tile : array<u32, ${SCAN_BLOCK}>;

@compute @workgroup_size(${SCAN_WG})
fn main(@builtin(workgroup_id) wid : vec3<u32>,
        @builtin(local_invocation_id) lid : vec3<u32>) {
  let t = lid.x;
  let base = wid.x * ${SCAN_BLOCK}u;
  let ai = base + t;
  let bi = base + t + ${SCAN_WG}u;

  tile[t]               = select(0u, countIn[ai], ai < SP.totalCells);
  tile[t + ${SCAN_WG}u] = select(0u, countIn[bi], bi < SP.totalCells);
  workgroupBarrier();

  // up-sweep
  var offset = 1u;
  var d = ${SCAN_BLOCK}u >> 1u;
  loop {
    if (d == 0u) { break; }
    workgroupBarrier();
    if (t < d) {
      let aii = offset * (2u * t + 1u) - 1u;
      let bii = offset * (2u * t + 2u) - 1u;
      tile[bii] = tile[bii] + tile[aii];
    }
    offset = offset * 2u;
    d = d >> 1u;
  }

  // clear last -> exclusive scan; stash block total
  if (t == 0u) {
    blockSums[wid.x] = tile[${SCAN_BLOCK}u - 1u];
    tile[${SCAN_BLOCK}u - 1u] = 0u;
  }

  // down-sweep
  d = 1u;
  loop {
    if (d >= ${SCAN_BLOCK}u) { break; }
    offset = offset >> 1u;
    workgroupBarrier();
    if (t < d) {
      let aii = offset * (2u * t + 1u) - 1u;
      let bii = offset * (2u * t + 2u) - 1u;
      let tmp = tile[aii];
      tile[aii] = tile[bii];
      tile[bii] = tile[bii] + tmp;
    }
    d = d * 2u;
  }
  workgroupBarrier();

  if (ai < SP.totalCells) { scanOut[ai] = tile[t]; }
  if (bi < SP.totalCells) { scanOut[bi] = tile[t + ${SCAN_WG}u]; }
}
`;

// Scan the blockSums in place (single workgroup; assumes numBlocks <= SCAN_BLOCK).
export const SCAN_BLOCKSUMS = /* wgsl */`
struct ScanParams { totalCells : u32, numBlocks : u32, _pad0 : u32, _pad1 : u32 };
@group(0) @binding(0) var<uniform> SP : ScanParams;
@group(0) @binding(3) var<storage, read_write> blockSums : array<u32>;

var<workgroup> tile : array<u32, ${SCAN_BLOCK}>;

@compute @workgroup_size(${SCAN_WG})
fn main(@builtin(local_invocation_id) lid : vec3<u32>) {
  let t = lid.x;
  tile[t]               = select(0u, blockSums[t],               t < SP.numBlocks);
  tile[t + ${SCAN_WG}u] = select(0u, blockSums[t + ${SCAN_WG}u], (t + ${SCAN_WG}u) < SP.numBlocks);
  workgroupBarrier();

  var offset = 1u;
  var d = ${SCAN_BLOCK}u >> 1u;
  loop {
    if (d == 0u) { break; }
    workgroupBarrier();
    if (t < d) {
      let aii = offset * (2u * t + 1u) - 1u;
      let bii = offset * (2u * t + 2u) - 1u;
      tile[bii] = tile[bii] + tile[aii];
    }
    offset = offset * 2u; d = d >> 1u;
  }
  if (t == 0u) { tile[${SCAN_BLOCK}u - 1u] = 0u; }
  d = 1u;
  loop {
    if (d >= ${SCAN_BLOCK}u) { break; }
    offset = offset >> 1u;
    workgroupBarrier();
    if (t < d) {
      let aii = offset * (2u * t + 1u) - 1u;
      let bii = offset * (2u * t + 2u) - 1u;
      let tmp = tile[aii];
      tile[aii] = tile[bii];
      tile[bii] = tile[bii] + tmp;
    }
    d = d * 2u;
  }
  workgroupBarrier();
  if (t < SP.numBlocks)               { blockSums[t] = tile[t]; }
  if ((t + ${SCAN_WG}u) < SP.numBlocks) { blockSums[t + ${SCAN_WG}u] = tile[t + ${SCAN_WG}u]; }
}
`;

// Add each block's scanned offset back into scanOut.
export const SCAN_ADD = /* wgsl */`
struct ScanParams { totalCells : u32, numBlocks : u32, _pad0 : u32, _pad1 : u32 };
@group(0) @binding(0) var<uniform> SP : ScanParams;
@group(0) @binding(2) var<storage, read_write> scanOut : array<u32>;
@group(0) @binding(3) var<storage, read_write> blockSums : array<u32>;

@compute @workgroup_size(${SCAN_WG})
fn main(@builtin(workgroup_id) wid : vec3<u32>,
        @builtin(local_invocation_id) lid : vec3<u32>) {
  let add = blockSums[wid.x];
  let base = wid.x * ${SCAN_BLOCK}u;
  let ai = base + lid.x;
  let bi = base + lid.x + ${SCAN_WG}u;
  if (ai < SP.totalCells) { scanOut[ai] = scanOut[ai] + add; }
  if (bi < SP.totalCells) { scanOut[bi] = scanOut[bi] + add; }
}
`;

// Pass 4: scatter. Each entity writes its index at cellStart[cell] + localCounter++.
export const SCATTER = COMMON + /* wgsl */`
@compute @workgroup_size(${WG})
fn main(@builtin(global_invocation_id) gid : vec3<u32>) {
  let i = gid.x;
  if (i >= P.N) { return; }
  let cell = min(cellIndex(cellCoord(positions[i].xyz)), P.totalCells - 1u);
  let slot = cellStart[cell] + atomicAdd(&localCounter[cell], 1u);
  sortedEntityIndices[slot] = i;
}
`;

// Reusable neighbor helpers for a downstream sensing shader. Include this + bindings for
// cellStart/cellCount(non-atomic)/sortedEntityIndices. R=1 => 3x3x3 (or 3x3 if gridDims.y==1).
export const GRID_HELPERS = /* wgsl */`
// Expects in scope: P (Params), cellStart, cellCountRO (array<u32>, non-atomic view),
// sortedEntityIndices, and a user callback inlined where marked.

fn neighborCellRange(c : vec3<u32>) -> vec2<u32> {
  let idx = c.x + P.gridDims.x * (c.y + P.gridDims.y * c.z);
  let start = cellStart[idx];
  return vec2<u32>(start, start + cellCountRO[idx]); // [begin, end) into sortedEntityIndices
}

// Example sensing entry point: counts neighbors within euclidean range r.
@compute @workgroup_size(${WG})
fn sense(@builtin(global_invocation_id) gid : vec3<u32>) {
  let i = gid.x;
  if (i >= P.N) { return; }
  let myPos = positions[i].xyz;
  let c = cellCoord(myPos);
  let R = 1u; // radius in cells; make uniform-driven if you want it runtime-tunable
  let r2 = (P.cellSize * f32(R)) * (P.cellSize * f32(R));

  let yLo = select(c.y, max(c.y, R) - R, P.gridDims.y > 1u);
  let yHi = select(c.y, min(c.y + R, P.gridDims.y - 1u), P.gridDims.y > 1u);

  var count = 0u;
  var z = max(c.z, R) - R;
  loop {
    if (z > min(c.z + R, P.gridDims.z - 1u)) { break; }
    var y = yLo;
    loop {
      if (y > yHi) { break; }
      var x = max(c.x, R) - R;
      loop {
        if (x > min(c.x + R, P.gridDims.x - 1u)) { break; }
        let rng = neighborCellRange(vec3<u32>(x, y, z));
        var s = rng.x;
        loop {
          if (s >= rng.y) { break; }
          let j = sortedEntityIndices[s];
          if (j != i) {
            let d = positions[j].xyz - myPos;
            if (dot(d, d) <= r2) { count = count + 1u; }
          }
          s = s + 1u;
        }
        x = x + 1u;
      }
      y = y + 1u;
    }
    z = z + 1u;
  }
}
`;

// ---------------------------------------------------------------------------
// Sensing pass: per entity neighbor count within senseRadius, nearest index,
// nearest distance squared. Shows the cell-radius vs euclidean-radius split.
// Bindings: 0 Params, 1 SenseParams, 2 positions, 3 cellStart,
// 4 cellCountRO (non-atomic view), 5 sortedEntityIndices, 6 senseOut.
// ---------------------------------------------------------------------------
export const SENSE = /* wgsl */`
struct Params {
  worldMin : vec3<f32>, N : u32,
  worldMax : vec3<f32>, cellSize : f32,
  gridDims : vec3<u32>, totalCells : u32,
};
struct SenseParams { senseRadius : f32, _p0 : f32, _p1 : f32, _p2 : f32 };
struct SenseResult { count : u32, nearest : u32, nearestD2 : f32, _pad : u32 };

@group(0) @binding(0) var<uniform> P  : Params;
@group(0) @binding(1) var<uniform> SP : SenseParams;
@group(0) @binding(2) var<storage, read> positions : array<vec4<f32>>;
@group(0) @binding(3) var<storage, read> cellStart : array<u32>;
@group(0) @binding(4) var<storage, read> cellCountRO : array<u32>;
@group(0) @binding(5) var<storage, read> sortedEntityIndices : array<u32>;
@group(0) @binding(6) var<storage, read_write> senseOut : array<SenseResult>;

fn cellCoord(posIn : vec3<f32>) -> vec3<u32> {
  var p = posIn;
  if (!(p.x == p.x)) { p.x = P.worldMin.x; }
  if (!(p.y == p.y)) { p.y = P.worldMin.y; }
  if (!(p.z == p.z)) { p.z = P.worldMin.z; }
  let rel = (p - P.worldMin) / P.cellSize;
  let gx = u32(clamp(floor(rel.x), 0.0, f32(P.gridDims.x - 1u)));
  let gy = select(0u, u32(clamp(floor(rel.y), 0.0, f32(P.gridDims.y - 1u))), P.gridDims.y > 1u);
  let gz = u32(clamp(floor(rel.z), 0.0, f32(P.gridDims.z - 1u)));
  return vec3<u32>(gx, gy, gz);
}

fn cellRange(x : u32, y : u32, z : u32) -> vec2<u32> {
  let idx = x + P.gridDims.x * (y + P.gridDims.y * z);
  let s = cellStart[idx];
  return vec2<u32>(s, s + cellCountRO[idx]);
}

@compute @workgroup_size(${WG})
fn main(@builtin(global_invocation_id) gid : vec3<u32>) {
  let i = gid.x;
  if (i >= P.N) { return; }
  let myPos = positions[i].xyz;
  let c = cellCoord(myPos);

  // scan enough cells to cover a sphere of radius senseRadius (R rounds UP), then
  // filter by exact euclidean distance.
  let R = max(1u, u32(ceil(SP.senseRadius / P.cellSize)));
  let r2 = SP.senseRadius * SP.senseRadius;

  // clamp neighborhood to grid bounds; y axis collapses when flat 2D (gridDims.y==1)
  let xLo = max(c.x, R) - R;  let xHi = min(c.x + R, P.gridDims.x - 1u);
  let zLo = max(c.z, R) - R;  let zHi = min(c.z + R, P.gridDims.z - 1u);
  let yLo = select(c.y, max(c.y, R) - R, P.gridDims.y > 1u);
  let yHi = select(c.y, min(c.y + R, P.gridDims.y - 1u), P.gridDims.y > 1u);

  var count = 0u;
  var nearest = 0xffffffffu;          // sentinel = none found
  var bestD2 = 3.4e38;                // ~f32 max

  var z = zLo;
  loop {
    if (z > zHi) { break; }
    var y = yLo;
    loop {
      if (y > yHi) { break; }
      var x = xLo;
      loop {
        if (x > xHi) { break; }
        let rng = cellRange(x, y, z);
        var s = rng.x;
        loop {
          if (s >= rng.y) { break; }
          let j = sortedEntityIndices[s];
          if (j != i) {
            let d = positions[j].xyz - myPos;
            let dd = dot(d, d);
            if (dd <= r2) {
              count = count + 1u;
              if (dd < bestD2) { bestD2 = dd; nearest = j; }
            }
          }
          s = s + 1u;
        }
        x = x + 1u;
      }
      y = y + 1u;
    }
    z = z + 1u;
  }

  senseOut[i] = SenseResult(count, nearest, select(0.0, bestD2, nearest != 0xffffffffu), 0u);
}
`;

// Host-side orchestration for the GPU uniform-grid neighbor search.
// No host readback in the hot path: buildFrame() only records dispatches.
const ceilDiv = (a, b) => Math.floor((a + b - 1) / b);

export function createGrid(device, opts) {
  const {
    N,
    positions,                 // GPUBuffer, array<vec4<f32>>, STORAGE
    worldMin, worldMax,        // [x,y,z]
    cellSize,
    flat2D = false,            // if true, gridDims.y forced to 1
  } = opts;

  // limit checks
  const lim = device.limits;
  if (lim.maxStorageBuffersPerShaderStage < 6) {
    console.warn(`maxStorageBuffersPerShaderStage=${lim.maxStorageBuffersPerShaderStage} (<6); grid binds 5 storage buffers per pass.`);
  }

  // grid dims
  const span = [worldMax[0]-worldMin[0], worldMax[1]-worldMin[1], worldMax[2]-worldMin[2]];
  const gx = Math.max(1, Math.ceil(span[0] / cellSize));
  const gy = flat2D ? 1 : Math.max(1, Math.ceil(span[1] / cellSize));
  const gz = Math.max(1, Math.ceil(span[2] / cellSize));
  const totalCells = gx * gy * gz;

  // Single-blocksum-level scan handles totalCells <= SCAN_BLOCK^2.
  const numBlocks = ceilDiv(totalCells, SCAN_BLOCK);
  if (numBlocks > SCAN_BLOCK) {
    throw new Error(
      `totalCells=${totalCells} needs ${numBlocks} scan blocks > ${SCAN_BLOCK}; ` +
      `add a recursive block-sum level or increase cellSize.`);
  }

  // memory cost report
  const gridBytes = totalCells * 4 * 3; // cellCount + cellStart + localCounter, u32 each
  console.info(`grid: ${gx}x${gy}x${gz}=${totalCells} cells, ` +
    `${(gridBytes/1e6).toFixed(1)} MB for cell arrays; ` +
    `sortedIndices=${(N*4/1e6).toFixed(1)} MB; ` +
    `avg occupancy=${(N/totalCells).toFixed(2)} entities/cell.`);
  if (totalCells * 4 > lim.maxStorageBufferBindingSize) {
    console.warn(`per-cell buffer (${totalCells*4} B) exceeds maxStorageBufferBindingSize=${lim.maxStorageBufferBindingSize}.`);
  }

  // buffers
  const S = GPUBufferUsage.STORAGE;
  const SRC = opts.allowReadback ? GPUBufferUsage.COPY_SRC : 0;
  const mk = (bytes, usage) => device.createBuffer({ size: Math.max(bytes, 4), usage });

  const cellCount   = mk(totalCells*4, S | GPUBufferUsage.COPY_DST | SRC); // atomic<u32> in shaders
  const cellStart   = mk(totalCells*4, S | SRC);                            // u32 (scan output)
  const localCounter= mk(totalCells*4, S);                                  // atomic<u32> scatter cursor
  const sortedIdx   = mk(N*4, S | SRC);                                     // u32
  const blockSums   = mk(SCAN_BLOCK*4, S);                                  // u32, padded to a full block

  // Params uniform: std140-ish layout matching struct Params (vec3 aligned to 16).
  const paramsBuf = device.createBuffer({ size: 64, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
  const pf = new Float32Array(16), pu = new Uint32Array(pf.buffer);
  pf[0]=worldMin[0]; pf[1]=worldMin[1]; pf[2]=worldMin[2]; pu[3]=N;
  pf[4]=worldMax[0]; pf[5]=worldMax[1]; pf[6]=worldMax[2]; pf[7]=cellSize;
  pu[8]=gx; pu[9]=gy; pu[10]=gz; pu[11]=totalCells;
  device.queue.writeBuffer(paramsBuf, 0, pf);

  const scanParamsBuf = device.createBuffer({ size: 16, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
  device.queue.writeBuffer(scanParamsBuf, 0, new Uint32Array([totalCells, numBlocks, 0, 0]));

  // bind group layout for grid passes (clear/count/scatter share it)
  const gridBGL = device.createBindGroupLayout({ entries: [
    { binding:0, visibility:GPUShaderStage.COMPUTE, buffer:{type:"uniform"} },
    { binding:1, visibility:GPUShaderStage.COMPUTE, buffer:{type:"read-only-storage"} },
    { binding:2, visibility:GPUShaderStage.COMPUTE, buffer:{type:"storage"} },
    { binding:3, visibility:GPUShaderStage.COMPUTE, buffer:{type:"storage"} },
    { binding:4, visibility:GPUShaderStage.COMPUTE, buffer:{type:"storage"} },
    { binding:5, visibility:GPUShaderStage.COMPUTE, buffer:{type:"storage"} },
  ]});
  const gridBG = device.createBindGroup({ layout:gridBGL, entries:[
    {binding:0, resource:{buffer:paramsBuf}},
    {binding:1, resource:{buffer:positions}},
    {binding:2, resource:{buffer:cellCount}},
    {binding:3, resource:{buffer:cellStart}},
    {binding:4, resource:{buffer:sortedIdx}},
    {binding:5, resource:{buffer:localCounter}},
  ]});

  // scan bind group layout. cellCount is read here as a NON-atomic view (same buffer).
  const scanBGL = device.createBindGroupLayout({ entries:[
    { binding:0, visibility:GPUShaderStage.COMPUTE, buffer:{type:"uniform"} },
    { binding:1, visibility:GPUShaderStage.COMPUTE, buffer:{type:"read-only-storage"} }, // countIn
    { binding:2, visibility:GPUShaderStage.COMPUTE, buffer:{type:"storage"} },           // scanOut=cellStart
    { binding:3, visibility:GPUShaderStage.COMPUTE, buffer:{type:"storage"} },           // blockSums
  ]});
  const scanBG = device.createBindGroup({ layout:scanBGL, entries:[
    {binding:0, resource:{buffer:scanParamsBuf}},
    {binding:1, resource:{buffer:cellCount}},   // read-only u32 view of the atomic buffer
    {binding:2, resource:{buffer:cellStart}},
    {binding:3, resource:{buffer:blockSums}},
  ]});

  const mkPipe = (code, bgl) => device.createComputePipeline({
    layout: device.createPipelineLayout({ bindGroupLayouts:[bgl] }),
    compute: { module: device.createShaderModule({ code }), entryPoint:"main" },
  });

  const pClear   = mkPipe(CLEAR,   gridBGL);
  const pCount   = mkPipe(COUNT,   gridBGL);
  const pScatter = mkPipe(SCATTER, gridBGL);
  const pScanL   = mkPipe(SCAN_LOCAL,    scanBGL);
  const pScanB   = mkPipe(SCAN_BLOCKSUMS,scanBGL);
  const pScanA   = mkPipe(SCAN_ADD,      scanBGL);

  const entityGroups = ceilDiv(N, WG);
  const cellGroups   = ceilDiv(totalCells, WG);

  function buildFrame(encoder) {
    const pass = encoder.beginComputePass();

    pass.setBindGroup(0, gridBG);
    pass.setPipeline(pClear);   pass.dispatchWorkgroups(cellGroups);

    pass.setPipeline(pCount);   pass.dispatchWorkgroups(entityGroups);

    // scan: local -> blocksums -> add
    pass.setBindGroup(0, scanBG);
    pass.setPipeline(pScanL);   pass.dispatchWorkgroups(numBlocks);
    pass.setPipeline(pScanB);   pass.dispatchWorkgroups(1);
    pass.setPipeline(pScanA);   pass.dispatchWorkgroups(numBlocks);

    pass.setBindGroup(0, gridBG);
    pass.setPipeline(pScatter); pass.dispatchWorkgroups(entityGroups);

    pass.end();
  }

  return {
    buildFrame, gridDims:[gx,gy,gz], totalCells,
    buffers:{ cellCount, cellStart, localCounter, sortedIdx, blockSums, params:paramsBuf },
  };
}