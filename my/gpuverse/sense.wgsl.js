// sense.wgsl.js: a real sensing pass that consumes the uniform grid.
// Per entity it computes: neighbor count within senseRadius, nearest neighbor index,
// and nearest distance squared. Demonstrates the correct cell-radius / euclidean-radius split.
//
// Bindings (group 0): a layout distinct from the grid passes:
//   0 uniform Params         (same struct/buffer as the grid)
//   1 uniform SenseParams    (senseRadius)
//   2 read positions
//   3 read cellStart
//   4 read cellCountRO       (NON-atomic view of cellCount, same buffer)
//   5 read sortedEntityIndices
//   6 read_write senseOut    (array<SenseResult>)
import { WG } from "./grid.wgsl.js";

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

  // Decouple euclidean cutoff from the cell scan: scan enough cells to fully cover
  // a sphere of radius senseRadius, then filter by exact distance. R must round UP.
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
