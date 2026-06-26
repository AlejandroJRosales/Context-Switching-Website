// sense.js: builds the sensing pipeline on top of an existing grid.
import { WG } from "./grid.wgsl.js";
import { SENSE } from "./sense.wgsl.js";

const ceilDiv = (a, b) => Math.floor((a + b - 1) / b);

// grid: the object returned by createGrid (needs buffers + totalCells + N).
// allowReadback adds COPY_SRC to senseOut so verify can read it.
export function createSense(device, grid, { N, positions, senseRadius, allowReadback = false }) {
  const SRC = allowReadback ? GPUBufferUsage.COPY_SRC : 0;

  // SenseResult is 16 bytes: u32 count, u32 nearest, f32 nearestD2, u32 pad.
  const senseOut = device.createBuffer({
    size: Math.max(N * 16, 16),
    usage: GPUBufferUsage.STORAGE | SRC,
  });

  const senseParams = device.createBuffer({
    size: 16, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });
  device.queue.writeBuffer(senseParams, 0, new Float32Array([senseRadius, 0, 0, 0]));

  const bgl = device.createBindGroupLayout({ entries: [
    { binding:0, visibility:GPUShaderStage.COMPUTE, buffer:{type:"uniform"} },
    { binding:1, visibility:GPUShaderStage.COMPUTE, buffer:{type:"uniform"} },
    { binding:2, visibility:GPUShaderStage.COMPUTE, buffer:{type:"read-only-storage"} },
    { binding:3, visibility:GPUShaderStage.COMPUTE, buffer:{type:"read-only-storage"} },
    { binding:4, visibility:GPUShaderStage.COMPUTE, buffer:{type:"read-only-storage"} },
    { binding:5, visibility:GPUShaderStage.COMPUTE, buffer:{type:"read-only-storage"} },
    { binding:6, visibility:GPUShaderStage.COMPUTE, buffer:{type:"storage"} },
  ]});

  const bg = device.createBindGroup({ layout:bgl, entries:[
    {binding:0, resource:{buffer:grid.buffers.params}},
    {binding:1, resource:{buffer:senseParams}},
    {binding:2, resource:{buffer:positions}},
    {binding:3, resource:{buffer:grid.buffers.cellStart}},
    {binding:4, resource:{buffer:grid.buffers.cellCount}},   // non-atomic read view of same buffer
    {binding:5, resource:{buffer:grid.buffers.sortedIdx}},
    {binding:6, resource:{buffer:senseOut}},
  ]});

  const pipeline = device.createComputePipeline({
    layout: device.createPipelineLayout({ bindGroupLayouts:[bgl] }),
    compute: { module: device.createShaderModule({ code: SENSE }), entryPoint:"main" },
  });

  const groups = ceilDiv(N, WG);
  function record(pass) { pass.setPipeline(pipeline); pass.setBindGroup(0, bg); pass.dispatchWorkgroups(groups); }

  return { record, buffers:{ senseOut, senseParams } };
}
