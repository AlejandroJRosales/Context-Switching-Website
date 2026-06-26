// grid.js — host-side orchestration for the GPU uniform-grid neighbor search.
// No host readback in the hot path: buildFrame() only records dispatches.
import {
  WG, SCAN_BLOCK, SCAN_WG,
  CLEAR, COUNT, SCATTER,
  SCAN_LOCAL, SCAN_BLOCKSUMS, SCAN_ADD,
} from "./grid.wgsl.js";

const ceilDiv = (a, b) => Math.floor((a + b - 1) / b);

export function createGrid(device, opts) {
  const {
    N,
    positions,                 // GPUBuffer, array<vec4<f32>>, STORAGE
    worldMin, worldMax,        // [x,y,z]
    cellSize,
    flat2D = false,            // if true, gridDims.y forced to 1
  } = opts;

  // ---- limit checks ----
  const lim = device.limits;
  if (lim.maxStorageBuffersPerShaderStage < 6) {
    console.warn(`maxStorageBuffersPerShaderStage=${lim.maxStorageBuffersPerShaderStage} (<6); grid binds 5 storage buffers per pass.`);
  }

  // ---- grid dims ----
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

  // ---- memory cost report ----
  const gridBytes = totalCells * 4 * 3; // cellCount + cellStart + localCounter, u32 each
  console.info(`grid: ${gx}x${gy}x${gz}=${totalCells} cells, ` +
    `${(gridBytes/1e6).toFixed(1)} MB for cell arrays; ` +
    `sortedIndices=${(N*4/1e6).toFixed(1)} MB; ` +
    `avg occupancy=${(N/totalCells).toFixed(2)} entities/cell.`);
  if (totalCells * 4 > lim.maxStorageBufferBindingSize) {
    console.warn(`per-cell buffer (${totalCells*4} B) exceeds maxStorageBufferBindingSize=${lim.maxStorageBufferBindingSize}.`);
  }

  // ---- buffers ----
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

  // ---- bind group layout for grid passes (clear/count/scatter share it) ----
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

  // ---- scan bind group layout. cellCount is read here as a NON-atomic view (same buffer). ----
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