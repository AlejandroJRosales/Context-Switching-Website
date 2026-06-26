// move.wgsl.js: minimal movement so the scene is alive. Random-walk in XZ, then
// snap Y to terrain height using the SHARED heightAt() (same noise as the renderer).
// This is a placeholder for your real SNN/behavior step; it proves positions can be
// driven on-GPU and stay on the ground with zero CPU involvement.
import { HEIGHT_FN } from "./terrain.wgsl.js";

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
