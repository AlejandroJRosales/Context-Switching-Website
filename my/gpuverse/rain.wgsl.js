// rain.wgsl.js: GPU-resident weather particles.
//
// Re-expression of mbverse's CPU rain (a 3000-particle JS loop that recycled drops and
// re-uploaded the whole array every frame) into the gpuverse compute-first architecture:
//
//   - particles live in one storage buffer  rain : array<vec4<f32>>  (xyz = world pos,
//     w = per-drop seed in [0,1) for length variation), never read back to the CPU.
//   - RAIN_ADVANCE is one compute pass, one thread per drop: gravity + wind, then an
//     in-place respawn when a drop falls past the floor OR drifts outside the camera
//     column. The recycle test is per-particle independent (no scatter/compaction),
//     so it parallelizes cleanly — this is the easy case, not the hard one.
//   - RAIN_RENDER draws the pool as instanced camera-facing billboard streaks, last,
//     alpha-blended and depth-tested but not depth-writing (same config as water).
//
// The buffer is NOT ping-ponged: each thread touches only its own element, so there is
// no cross-thread read/write aliasing and double-buffering would only add a copy.

import { SKY_PARAMS_STRUCT } from "./sky.js";

// One thread per drop.
export const RAIN_WG = 64;

// ---------------------------------------------------------------------------
// Compute: advance + in-place recycle. Camera XZ arrives via RainParams so the
// finite pool always brackets the player (rain follows the camera, as in mbverse).
// ---------------------------------------------------------------------------
export const RAIN_ADVANCE = /* wgsl */`
struct RainParams {
  camPos    : vec3<f32>, dt        : f32,   // camPos.xyz, dt seconds
  wind      : vec3<f32>, fallSpeed : f32,   // wind drift (world units/s), downward speed
  radius    : f32,       top       : f32,   // spawn cylinder radius; column top (world Y)
  fall      : f32,       floorY    : f32,   // vertical spawn band height; recycle floor
  N         : u32,       _p0 : f32, _p1 : f32, _p2 : f32,
};
@group(0) @binding(0) var<uniform> RP : RainParams;
@group(0) @binding(1) var<storage, read_write> rain : array<vec4<f32>>;

// Stable per-(drop,epoch) hash so a recycled drop gets a fresh but deterministic offset.
fn hash11(x : f32) -> f32 { return fract(sin(x * 91.345) * 47453.21); }
fn hash21(a : f32, b : f32) -> f32 { return fract(sin(a * 91.345 + b * 47.853) * 47453.21); }

@compute @workgroup_size(${RAIN_WG})
fn main(@builtin(global_invocation_id) gid : vec3<u32>) {
  let i = gid.x;
  if (i >= RP.N) { return; }
  var p = rain[i];

  // advance: constant wind drift in XZ + gravity in Y
  p.x = p.x + RP.wind.x * RP.dt;
  p.z = p.z + RP.wind.z * RP.dt;
  p.y = p.y - RP.fallSpeed * RP.dt;

  // recycle test (per-drop, independent): below the floor, or outside the camera column.
  let ddx = p.x - RP.camPos.x;
  let ddz = p.z - RP.camPos.z;
  let outR = (ddx * ddx + ddz * ddz) > (RP.radius * RP.radius) * 1.2;
  if (p.y < RP.floorY || outR) {
    // fresh offset from a hash of (drop index, coarse time epoch). Two independent
    // hashes give an angle + normalized radius; sqrt(r) keeps the disc uniform so
    // drops don't clump at the center of the column.
    let epoch = floor(RP.top + p.w * 977.0);            // decorrelate per drop
    let a  = hash21(f32(i) + 1.0, epoch) * 6.2831853;
    let rr = sqrt(hash11(f32(i) * 0.61803 + epoch)) * RP.radius;
    p.x = RP.camPos.x + cos(a) * rr;
    p.z = RP.camPos.z + sin(a) * rr;
    p.y = RP.top - hash11(f32(i) * 1.77 + epoch) * RP.fall;
    p.w = hash11(f32(i) * 2.31 + epoch);                // new length seed
  }

  rain[i] = p;
}
`;

// ---------------------------------------------------------------------------
// Render: instanced billboard streaks. A 6-vertex quad in [-1,1] is expanded in the
// VS: width along the camera-right axis (passed as a uniform), length straight down
// world-up so drops always read as vertical, per-drop length from the .w seed.
// ---------------------------------------------------------------------------
export const RAIN_RENDER = SKY_PARAMS_STRUCT + /* wgsl */`
struct Camera { viewProj : mat4x4<f32>, eye : vec3<f32>, _p : f32, invViewProj : mat4x4<f32> };
struct RainDraw {
  color : vec3<f32>, width : f32,   // tint, streak half-width
  len   : f32, alpha : f32, _p1 : f32, _p2 : f32,
};

@group(0) @binding(0) var<uniform> CAM : Camera;
@group(0) @binding(1) var<uniform> RD  : RainDraw;
@group(0) @binding(2) var<uniform> SKY : SkyParams;

struct VsOut {
  @builtin(position) clip : vec4<f32>,
  @location(0) t : f32,   // 0 at bottom of streak, 1 at top (for the alpha ramp)
};

@vertex
fn vs(@builtin(vertex_index) vid : u32,
      @location(0) inst : vec4<f32>) -> VsOut {
  // 2 triangles, corners in [-1,1]. x = width axis, y = length axis.
  var corners = array<vec2<f32>, 6>(
    vec2<f32>(-1.0, -1.0), vec2<f32>( 1.0, -1.0), vec2<f32>( 1.0, 1.0),
    vec2<f32>(-1.0, -1.0), vec2<f32>( 1.0,  1.0), vec2<f32>(-1.0, 1.0),
  );
  let c = corners[vid];
  let seed = inst.w;
  let len = RD.len * (0.6 + 0.4 * seed);

  // PER-DROP billboard: width axis = horizontal vector perpendicular to the line from
  // this drop to the camera, so every drop turns to face the viewer individually. A
  // single global camera-right made the drop straight ahead present edge-on, stacking
  // all the down-the-view-axis drops into one fat central seam when standing still.
  // right = normalize(cross(worldUp, toCam)); flattening toCam to XZ keeps streaks vertical.
  let toCam = CAM.eye - inst.xyz;
  var flat = vec3<f32>(toCam.x, 0.0, toCam.z);
  let fl = length(flat);
  // degenerate only if the camera is directly above/below the drop; fall back to +X.
  var right = select(vec3<f32>(1.0, 0.0, 0.0),
                     normalize(vec3<f32>(-flat.z, 0.0, flat.x)),
                     fl > 1e-4);

  let world = inst.xyz
    + right * (c.x * RD.width)
    + vec3<f32>(0.0, 1.0, 0.0) * (c.y * len);

  var out : VsOut;
  out.clip = CAM.viewProj * vec4<f32>(world, 1.0);
  out.t = c.y * 0.5 + 0.5;
  return out;
}

@fragment
fn fs(in : VsOut) -> @location(0) vec4<f32> {
  // taper: fainter at the bottom, fuller at the top — cheap motion-blur look.
  let a = RD.alpha * (0.15 + 0.85 * in.t);
  return vec4<f32>(RD.color, a);
}
`;