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
  let deerTailY =  0.17;
  let wolfTailY =  0.17;
  let deerTailX =  0.05;
  let wolfTailX = -0.07;
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
@group(0) @binding(0) var<uniform> MP : MoveParams;
@group(0) @binding(1) var<uniform> TP : TerrainParams;
@group(0) @binding(2) var<storage, read_write> positions : array<vec4<f32>>;
@group(0) @binding(3) var<storage, read_write> speciesHeading : array<vec2<f32>>;

fn hash11(x : f32) -> f32 { return fract(sin(x * 91.345) * 47453.21); }
// two-input hash: stable random in [0,1) for a given (entity, epoch) pair.
fn hash21(a : f32, b : f32) -> f32 { return fract(sin(a * 91.345 + b * 47.853) * 47453.21); }

@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) gid : vec3<u32>) {
  let i = gid.x;
  if (i >= MP.N) { return; }
  var p = positions[i];

  // Random walk: each entity picks a random heading in [0, 2pi) and holds it for
  // WANDER_SECS, then picks a new one. The "epoch" index = floor(time / WANDER_SECS)
  // is constant for 10s at a time, so hashing (entity, epoch) gives a heading that's
  // fixed within the window and jumps to a fresh random direction each new window.
  let WANDER_SECS = 10.0;
  let epoch = floor(MP.time / WANDER_SECS);
  let ang = hash21(f32(i) + 1.0, epoch) * 6.2831853;
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