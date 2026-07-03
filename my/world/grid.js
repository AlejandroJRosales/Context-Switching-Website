// grid.js: GPU-resident uniform-grid neighbor search — WGSL + host orchestration
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
  // write the 'count' value to your sensing output buffer here.
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

// ---------------------------------------------------------------------------
// Host-side orchestration for the GPU uniform-grid neighbor search.
// No host readback in the hot path: buildFrame() only records dispatches.
// ---------------------------------------------------------------------------
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
  // allowReadback adds COPY_SRC to the buffers verify.js reads back. Off in production.
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