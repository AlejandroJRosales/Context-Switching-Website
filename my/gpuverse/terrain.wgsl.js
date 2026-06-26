// terrain.wgsl.js — procedural heightfield, generated on GPU, shared with the sim.
// The same heightAt() function is exported as a string so the simulation can place
// creatures on the ground without any CPU round-trip or duplicated logic.

// Shared noise + height function. Include this string in any shader that needs ground height.
// Domain: world XZ. Returns world Y. Deterministic from a seed in TerrainParams.
export const HEIGHT_FN = /* wgsl */`
struct TerrainParams {
  worldMin : vec2<f32>,   // xz min
  worldMax : vec2<f32>,   // xz max
  gridN    : u32,         // heightfield resolution per side (gridN x gridN verts)
  amplitude: f32,         // max height
  seed     : f32,
  _pad     : f32,
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

// fractal sum; takes WORLD xz, returns world height
fn heightAt(tp : TerrainParams, worldXZ : vec2<f32>) -> f32 {
  let span = tp.worldMax - tp.worldMin;
  let uv = (worldXZ - tp.worldMin) / span;   // 0..1 across world
  var p = uv * 6.0 + vec2<f32>(tp.seed, tp.seed * 1.7);
  var amp = 1.0;
  var sum = 0.0;
  var norm = 0.0;
  for (var o = 0u; o < 5u; o = o + 1u) {
    sum = sum + valueNoise(p) * amp;
    norm = norm + amp;
    p = p * 2.03;
    amp = amp * 0.5;
  }
  return (sum / norm) * tp.amplitude;
}
`;

// Compute pass: fill a height buffer (gridN*gridN f32) sampled at vertex grid points.
// The render pass reads this; storing it avoids recomputing fractal noise per frame.
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

// Terrain render: a vertex pulls its position from the height buffer by vertex_index.
// Mesh is an implicit grid; we generate indices on the host. Normal computed from neighbors.
export const TERRAIN_RENDER = HEIGHT_FN + /* wgsl */`
struct Camera { viewProj : mat4x4<f32>, eye : vec3<f32>, _p : f32 };
@group(0) @binding(0) var<uniform> CAM : Camera;
@group(0) @binding(1) var<uniform> TP  : TerrainParams;
@group(0) @binding(2) var<storage, read> heights : array<f32>;

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
  let lightDir = normalize(vec3<f32>(0.4, 0.9, 0.2));
  let ndl = max(dot(in.normal, lightDir), 0.0);
  // height-banded ground color: low = wet earth, high = pale rock
  let t = clamp(in.worldPos.y / TP.amplitude, 0.0, 1.0);
  let low  = vec3<f32>(0.18, 0.22, 0.16);
  let mid  = vec3<f32>(0.30, 0.34, 0.22);
  let high = vec3<f32>(0.55, 0.54, 0.48);
  var albedo = mix(low, mid, smoothstep(0.0, 0.5, t));
  albedo = mix(albedo, high, smoothstep(0.5, 1.0, t));
  let lit = albedo * (0.25 + 0.75 * ndl);
  return vec4<f32>(lit, 1.0);
}
`;
