// plant.js: host orchestration for the GPU plant system (Tier 3.2, fixed-population step).
// Mirrors createRain: reused scratch typed arrays (no per-frame allocation), own bind
// group, draw() records into the caller's already-open render pass.
//
// Plants are a SECOND entity system. Their buffer  plants : array<vec4<f32>>  is:
//   - STORAGE, so a grid instance can count/scatter them for sensing/eating, and
//   - VERTEX,  so it feeds the instanced billboard draw directly (xyz + seed.w).
// It is seeded once on the host (clustered placement, baked onto the terrain surface) and
// never touched by the CPU again. No per-plant compute in this step: fixed population, no
// growth. Growth (spawning toward a target, clustering near existing plants) is a birth
// problem and waits on the Tier 4.x compaction substrate, per the prompt.
//
// PLACEMENT needs the terrain height at each XZ so plants sit ON the ground. The renderer
// exposes the baked heightfield asynchronously (readHeights). Because that readback may
// not be ready at construction, placement is done in place() which the caller invokes once
// the sampler is available; until then the buffer holds a cheap fallback (flat scatter) so
// a draw before the heightfield arrives still shows something sane rather than NaNs.

import { PLANT_RENDER } from "./plant.wgsl.js";

export function createPlants(device, format, {
  camBuf,                 // GPUBuffer, renderer Camera uniform (144 B) — reused read-only
  skyBuf,                 // GPUBuffer, renderer SkyParams uniform (112 B) — reused read-only
  fogBuf,                 // GPUBuffer, renderer FogParams uniform (16 B) — reused read-only
  worldMin, worldMax,     // [x,y,z] world bounds (placement domain)
  count = 20000,          // fixed plant population
  clusters = 48,          // number of seed clusters; plants scatter around these
  clusterRadius = 220,    // world-units spread of a cluster
  height = 2,            // base billboard height (per-plant varied in the VS)
  width = 7,              // base billboard half-width
  sway = 3.2,             // wind sway amplitude at the tip (world units)
  maxWaterLevel = -1e30,  // plants below this Y are pushed to the fallback flat scatter edge
                          //   (kept simple here; underwater culling can come with growth)
  seed = 1,
}) {
  // ---- plant buffer. STORAGE (grid reads it) | VERTEX (instanced draw) | COPY_DST (seed).
  const plantBuf = device.createBuffer({
    size: Math.max(count, 1) * 16,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
  });

  // deterministic RNG independent of the creature/rain seed streams.
  function makeRng(s0) {
    let s = (s0 * 2654435761) >>> 0;
    return () => { s = (Math.imul(s ^ (s >>> 15), 2246822519)) >>> 0; return s / 4294967296; };
  }

  // Reused scratch for the seed upload (allocated once at construction, not per frame —
  // placement runs at most once per world build, but we still avoid re-allocating on
  // re-placement, e.g. after the async heightfield arrives).
  const initScratch = new Float32Array(Math.max(count, 1) * 4);

  // Precompute cluster centers once (host-side, deterministic). Plants are then scattered
  // around a randomly chosen center each — this is the "clustering" the growth pass will
  // later reinforce, front-loaded here as static placement.
  const spanX = worldMax[0] - worldMin[0];
  const spanZ = worldMax[2] - worldMin[2];
  const rng = makeRng(seed + 0x51ed);
  const centers = new Float32Array(clusters * 2);
  for (let c = 0; c < clusters; c++) {
    centers[c * 2 + 0] = worldMin[0] + rng() * spanX;
    centers[c * 2 + 1] = worldMin[2] + rng() * spanZ;
  }

  // place(sampleHeight): fill the buffer with clustered, ground-baked positions.
  // sampleHeight(x, z) -> terrain world Y (same heightfield the player/renderer use).
  // If omitted, falls back to a flat scatter at y=worldMin[1] so early draws are safe.
  let placed = false;
  function place(sampleHeight) {
    const prng = makeRng(seed + 1);
    for (let i = 0; i < count; i++) {
      // pick a cluster, then a gaussian-ish offset (two uniforms averaged) around it.
      const cc = (Math.min(clusters - 1, (prng() * clusters) | 0)) * 2;
      const ang = prng() * Math.PI * 2;
      const rr = (prng() * 0.5 + prng() * 0.5) * clusterRadius; // triangular -> denser center
      let x = centers[cc + 0] + Math.cos(ang) * rr;
      let z = centers[cc + 1] + Math.sin(ang) * rr;
      // clamp inside the world so grid cellCoord never sees out-of-range XZ.
      x = Math.min(worldMax[0], Math.max(worldMin[0], x));
      z = Math.min(worldMax[2], Math.max(worldMin[2], z));

      const y = sampleHeight ? sampleHeight(x, z) : worldMin[1];

      initScratch[i * 4 + 0] = x;
      initScratch[i * 4 + 1] = y;
      initScratch[i * 4 + 2] = z;
      initScratch[i * 4 + 3] = prng();   // per-plant seed (size/phase/tint)
    }
    device.queue.writeBuffer(plantBuf, 0, initScratch);
    placed = true;
  }
  // seed an immediate fallback scatter so a draw before place(withHeights) is valid.
  place(null);

  // ---- PlantDraw uniform. colA+time, colB+height, width,sway,pad,pad. 48 B used of 64.
  const pdBuf = device.createBuffer({ size: 64, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
  const pdScratch = new Float32Array(16);
  // static fields written once; per-frame writeDraw only refreshes tint + time.
  pdScratch[7] = height;   // .height at [7]
  pdScratch[8] = width;    // .width  at [8]
  pdScratch[9] = sway;     // .sway   at [9]
  function writeDraw(time, sunVisible) {
    // young (near ground / wet) vs dry (mature) foliage colors, dimmed a touch at night.
    const day = 0.35 + 0.65 * Math.max(0, Math.min(1, sunVisible));
    pdScratch[0] = 0.16 * day; pdScratch[1] = 0.42 * day; pdScratch[2] = 0.14 * day; // colA
    pdScratch[3] = time;                                                             // .time
    pdScratch[4] = 0.45 * day; pdScratch[5] = 0.52 * day; pdScratch[6] = 0.20 * day; // colB
    // [7] height, [8] width, [9] sway are static
    device.queue.writeBuffer(pdBuf, 0, pdScratch);
  }

  // ---- render pipeline: instanced crossed billboards, opaque (depth test + write),
  // cutout alpha via discard in the FS. Drawn after creatures, before water.
  const drawBGL = device.createBindGroupLayout({ entries: [
    { binding: 0, visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT, buffer: { type: "uniform" } }, // Camera
    { binding: 1, visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT, buffer: { type: "uniform" } }, // PlantDraw
    { binding: 2, visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT, buffer: { type: "uniform" } }, // Sky
    { binding: 3, visibility: GPUShaderStage.FRAGMENT,                      buffer: { type: "uniform" } }, // Fog
  ]});
  const drawBG = device.createBindGroup({ layout: drawBGL, entries: [
    { binding: 0, resource: { buffer: camBuf } },
    { binding: 1, resource: { buffer: pdBuf } },
    { binding: 2, resource: { buffer: skyBuf } },
    { binding: 3, resource: { buffer: fogBuf } },
  ]});
  const drawMod = device.createShaderModule({ code: PLANT_RENDER });
  const drawPipe = device.createRenderPipeline({
    layout: device.createPipelineLayout({ bindGroupLayouts: [drawBGL] }),
    vertex: { module: drawMod, entryPoint: "vs", buffers: [
      { arrayStride: 16, stepMode: "instance", attributes: [
        { shaderLocation: 0, offset: 0, format: "float32x4" },   // inst pos.xyz + seed.w
      ]},
    ]},
    fragment: { module: drawMod, entryPoint: "fs", targets: [{ format }] },
    // opaque foliage: cull nothing (double-sided cards), test AND write depth.
    primitive: { topology: "triangle-list", cullMode: "none" },
    depthStencil: { format: "depth24plus", depthWriteEnabled: true, depthCompare: "less" },
  });

  // enabled toggle (HUD-controlled). When off, draw() is a no-op but the buffer still
  // exists so a plant grid (if built) stays consistent.
  let enabled = true;
  function setEnabled(v) { enabled = !!v; return enabled; }

  // record the draw into the caller's already-open render pass (after creatures, before
  // water). `sky` = current sky state; `time` drives the wind sway phase.
  function draw(pass, sky, time) {
    if (!enabled || count === 0) return;
    writeDraw(time, sky?.sunVisible ?? 1);
    pass.setPipeline(drawPipe);
    pass.setBindGroup(0, drawBG);
    pass.setVertexBuffer(0, plantBuf);
    pass.draw(12, count);   // 2 crossed quads = 12 verts, one instance per plant
  }

  return {
    draw, place, setEnabled,
    get enabled() { return enabled; },
    get placed() { return placed; },
    buffers: { plants: plantBuf, draw: pdBuf },
    count,
  };
}