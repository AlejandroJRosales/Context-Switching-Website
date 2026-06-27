// world_wgsl.js: GPU world shaders — terrain heightfield + bake + render, instanced
// creature billboards, animated water plane, and the placeholder movement compute
// pass. Grouped because they all share TerrainParams/heightAt() and SkyParams/fog.
import { SKY_PARAMS_STRUCT, FOG_FN } from "./sky.js";

// ---------------------------------------------------------------------------
// Terrain: procedural heightfield generated on GPU, shared with the sim via the
// exported heightAt() string (creatures snap to ground with no CPU round-trip).
// heightAt() blends a smooth-plains fractal with a ridged-mountain layer, mixed
// by a low-frequency biome mask. Signature (TerrainParams, worldXZ)->f32 is
// unchanged, so the baked-buffer consumers (render + player.js sampler) stay
// correct automatically.
// ---------------------------------------------------------------------------

// Shared noise + height function. Include this string in any shader that needs ground height.
// Domain: world XZ. Returns world Y. Deterministic from a seed in TerrainParams.
export const HEIGHT_FN = /* wgsl */`
struct TerrainParams {
  worldMin : vec2<f32>,   // xz min
  worldMax : vec2<f32>,   // xz max
  gridN    : u32,         // heightfield resolution per side (gridN x gridN verts)
  amplitude: f32,         // max height
  seed     : f32,
  mountainThreshold : f32, // biome-mask value above which ridged mountains blend in (0..1)
};

fn hash2(p : vec2<f32>) -> f32 {
  // cheap deterministic hash -> [0,1)
  let h = dot(p, vec2<f32>(127.1, 311.7));
  return fract(sin(h) * 43758.5453123);
}

fn valueNoise(p : vec2<f32>) -> f32 {
  let i = floor(p);
  let f = fract(p);
  let u = f * f * (3.0 - 2.0 * f);          // smoothstep
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
  return sum / norm; // 0..1
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
    let ridge = 1.0 - abs(n * 2.0 - 1.0);   // fold into a ridge
    sum = sum + ridge * ridge * amp;         // square it: sharpens peaks further
    norm = norm + amp;
    p = p * 2.13;
    amp = amp * 0.5;
  }
  return sum / norm; // 0..1
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
  let uv = (worldXZ - tp.worldMin) / span;   // 0..1 across world
  let basePos = uv * 6.0 + vec2<f32>(tp.seed, tp.seed * 1.7);

  let plains = fractalNoise(basePos);                 // 0..1, gentle rolling base
  let ridged = ridgedNoise(basePos * 1.6 + vec2<f32>(11.0, -7.0));

  let mask = biomeMask(uv, tp.seed);                  // 0..1, plains->mountains
  let mtnBlend = smoothstep(tp.mountainThreshold, tp.mountainThreshold + 0.15, mask);

  // mountains both blend in ridged detail AND push the base height up, so the
  // transition reads as rising terrain rather than just a texture change.
  let h01 = mix(plains, max(plains, ridged), mtnBlend);
  let lift = mtnBlend * 0.6; // extra height fraction added in mountain regions

  return h01 * tp.amplitude * (1.0 + lift);
}
`;

// Compute pass: fill a gridN*gridN f32 height buffer at vertex grid points (baked once).
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

// Terrain render: each vertex pulls its height from the buffer by vertex_index (indices
// generated host-side); normal from neighbors; fragment shaded by SkyParams + FogParams.
export const TERRAIN_RENDER = HEIGHT_FN + SKY_PARAMS_STRUCT + FOG_FN + /* wgsl */`
struct Camera { viewProj : mat4x4<f32>, eye : vec3<f32>, _p : f32, invViewProj : mat4x4<f32> };
@group(0) @binding(0) var<uniform> CAM : Camera;
@group(0) @binding(1) var<uniform> TP  : TerrainParams;
@group(0) @binding(2) var<storage, read> heights : array<f32>;
@group(0) @binding(3) var<uniform> SKY : SkyParams;
@group(0) @binding(4) var<uniform> FOG : FogParams;

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

  // central-difference normal from neighboring heights
  let cell = span / f32(n - 1u);
  let dx = hAt(ix + 1, iz) - hAt(ix - 1, iz);
  let dz = hAt(ix, iz + 1) - hAt(ix, iz - 1);
  let nrm = normalize(vec3<f32>(-dx, 2.0 * cell.x, -dz));

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
  // height-banded ground color: low = wet earth, high = pale rock
  let t = clamp(in.worldPos.y / TP.amplitude, 0.0, 1.0);
  let low  = vec3<f32>(0.18, 0.22, 0.16);
  let mid  = vec3<f32>(0.30, 0.34, 0.22);
  let high = vec3<f32>(0.55, 0.54, 0.48);
  var albedo = mix(low, mid, smoothstep(0.0, 0.5, t));
  albedo = mix(albedo, high, smoothstep(0.5, 1.0, t));
  let lit = albedo * (SKY.ambient + SKY.sunColor * ndl);
  let foggy = applyFog(lit, in.worldPos, CAM.eye, FOG);
  return vec4<f32>(foggy, 1.0);
}
`;

// ---------------------------------------------------------------------------
// Creatures: instanced. Each instance reads one entry from the positions buffer
// (the same buffer compute writes) via an instance-step vertex buffer; no CPU
// per-entity work. Bodies are cheap camera-facing quads. Shading reads SkyParams
// + fog.
// ---------------------------------------------------------------------------

export const CREATURE_RENDER = SKY_PARAMS_STRUCT + FOG_FN + /* wgsl */`
struct Camera { viewProj : mat4x4<f32>, eye : vec3<f32>, _p : f32, invViewProj : mat4x4<f32> };
@group(0) @binding(0) var<uniform> CAM : Camera;
@group(0) @binding(1) var<uniform> SIZE : vec4<f32>; // x = creature radius
@group(0) @binding(2) var<uniform> SKY : SkyParams;
@group(0) @binding(3) var<uniform> FOG : FogParams;

struct VsOut {
  @builtin(position) clip : vec4<f32>,
  @location(0) nrm : vec3<f32>,
  @location(1) tint : vec3<f32>,
  @location(2) uv : vec2<f32>,
  @location(3) worldPos : vec3<f32>,
};

// Camera-facing quad (2 tris), corner index 0..5, expanded around the instance center.
fn cornerOffset(i : u32) -> vec2<f32> {
  var c = array<vec2<f32>, 6>(
    vec2<f32>(-1.0, -1.0), vec2<f32>( 1.0, -1.0), vec2<f32>( 1.0,  1.0),
    vec2<f32>(-1.0, -1.0), vec2<f32>( 1.0,  1.0), vec2<f32>(-1.0,  1.0),
  );
  return c[i];
}

@vertex
fn vs(@builtin(vertex_index) vid : u32,
      @location(0) instPos : vec4<f32>) -> VsOut {
  let center = instPos.xyz;
  let r = SIZE.x;

  // camera-facing basis
  let fwd   = normalize(CAM.eye - center);
  let right = normalize(cross(vec3<f32>(0.0, 1.0, 0.0), fwd));
  let up    = cross(fwd, right);

  let off = cornerOffset(vid);
  let worldPos = center + (right * off.x + up * off.y) * r;

  var out : VsOut;
  out.clip = CAM.viewProj * vec4<f32>(worldPos, 1.0);
  out.worldPos = worldPos;
  out.nrm = fwd;
  out.uv = off;   // [-1,1] quad coords for the fragment radial fade
  // tint by a hash of instance position so the field reads as many individuals
  let h = fract(sin(dot(center.xz, vec2<f32>(12.9898, 78.233))) * 43758.5453);
  out.tint = mix(vec3<f32>(0.9, 0.5, 0.2), vec3<f32>(0.95, 0.85, 0.3), h);
  return out;
}

@fragment
fn fs(in : VsOut) -> @location(0) vec4<f32> {
  // round the quad into a disc; drop the corners entirely
  let d = length(in.uv);
  if (d > 1.0) { discard; }

  // reconstruct a hemisphere normal from disc coords for a little shaded roundness.
  let z = sqrt(max(0.0, 1.0 - d * d));
  let sphereN = normalize(in.nrm * z + vec3<f32>(in.uv.x, in.uv.y, 0.0));
  let lightDir = normalize(SKY.sunDir);
  let ndl = max(dot(sphereN, lightDir), 0.0);

  let lit = in.tint * (SKY.ambient + SKY.sunColor * ndl);
  let foggy = applyFog(lit, in.worldPos, CAM.eye, FOG);

  // opaque output (alpha-blending many overlapping sprites would need sorting we skip).
  return vec4<f32>(foggy, 1.0);
}
`;

// ---------------------------------------------------------------------------
// Water: one large quad at fixed Y (waterLevel), alpha-blended after opaque
// geometry. Animated normal from two scrolling noise layers, Fresnel mix between
// deep-water tint and sky reflection, plus a specular sun glint. One static quad,
// one draw.
// ---------------------------------------------------------------------------

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

  // specular sun glint
  let halfV = normalize(normalize(SKY.sunDir) + viewDir);
  let spec = pow(max(dot(nrm, halfV), 0.0), 120.0) * SKY.sunVisible;
  col = col + SKY.sunColor * spec * 1.5;

  col = applyFog(col, in.worldPos, CAM.eye, FOG);
  return vec4<f32>(col, 0.85); // slightly transparent; blended over terrain
}
`;

// ---------------------------------------------------------------------------
// Move: placeholder movement. Random-walk in XZ, then snap Y via the shared
// heightAt() (same noise as the renderer). Proves on-GPU position updates with
// no CPU.
// ---------------------------------------------------------------------------

export const MOVE = HEIGHT_FN + /* wgsl */`
struct MoveParams { time : f32, dt : f32, speed : f32, N : u32 };
@group(0) @binding(0) var<uniform> MP : MoveParams;
@group(0) @binding(1) var<uniform> TP : TerrainParams;
@group(0) @binding(2) var<storage, read_write> positions : array<vec4<f32>>;

fn hash11(x : f32) -> f32 { return fract(sin(x * 91.345) * 47453.21); }

@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) gid : vec3<u32>) {
  let i = gid.x;
  if (i >= MP.N) { return; }
  var p = positions[i];

  // wander: per-entity phase drives a smoothly turning heading
  let ph = hash11(f32(i)) * 6.2831853;
  let ang = ph + MP.time * 0.3 * (0.5 + hash11(f32(i) + 1.0));
  let step = MP.speed * MP.dt;
  p.x = p.x + cos(ang) * step;
  p.z = p.z + sin(ang) * step;

  // keep inside world XZ bounds (reflect)
  p.x = clamp(p.x, TP.worldMin.x, TP.worldMax.x);
  p.z = clamp(p.z, TP.worldMin.y, TP.worldMax.y);

  // snap to ground (+ small offset so the body sits above the surface)
  p.y = heightAt(TP, vec2<f32>(p.x, p.z)) + 1.5;

  positions[i] = p;
}
`;
