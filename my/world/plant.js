// plant.js: GPU-resident plants with host + shaders

import { SKY_PARAMS_STRUCT, FOG_FN } from "./sky.js";

// Render: instanced crossed billboards with vertex-shader wind sway. One instance per plant;
// 12 vertices (two quads). Camera + Sky + Fog + PlantDraw.
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

export function createPlants(device, format, {
  camBuf,                 // renderer Camera uniform (144 B) — reused read-only
  skyBuf,                 // renderer SkyParams uniform (112 B) — reused read-only
  fogBuf,                 // renderer FogParams uniform (16 B) — reused read-only
  worldMin, worldMax,     // [x,y,z] world bounds (placement domain)
  count = 20000,          // fixed plant population
  clusters = 48,          // number of seed clusters; plants scatter around these
  clusterRadius = 220,    // world-units spread of a cluster
  height = 2,             // base billboard height (per-plant varied in the VS)
  width = 7,              // base billboard half-width
  sway = 3.2,             // wind sway amplitude at the tip (world units)
  maxWaterLevel = -1e30,  // (reserved) underwater culling deferred to growth
  seed = 1,
}) {
  // plant buffer. STORAGE (grid reads it) | VERTEX (instanced draw) | COPY_DST (seed).
  const plantBuf = device.createBuffer({
    size: Math.max(count, 1) * 16,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
  });

  // deterministic RNG independent of the creature/rain seed streams.
  function makeRng(s0) {
    let s = (s0 * 2654435761) >>> 0;
    return () => { s = (Math.imul(s ^ (s >>> 15), 2246822519)) >>> 0; return s / 4294967296; };
  }

  // Reused scratch for the seed upload (allocated once; re-placement after the async
  // heightfield arrives reuses it rather than re-allocating).
  const initScratch = new Float32Array(Math.max(count, 1) * 4);

  // Precompute cluster centers once (deterministic). Plants scatter around a random center
  // each — the static form of the "clustering" the growth pass will later reinforce.
  const spanX = worldMax[0] - worldMin[0];
  const spanZ = worldMax[2] - worldMin[2];
  const rng = makeRng(seed + 0x51ed);
  const centers = new Float32Array(clusters * 2);
  for (let c = 0; c < clusters; c++) {
    centers[c * 2 + 0] = worldMin[0] + rng() * spanX;
    centers[c * 2 + 1] = worldMin[2] + rng() * spanZ;
  }

  // place(sampleHeight): fill the buffer with clustered, ground-baked positions.
  // sampleHeight(x,z) -> terrain world Y. If omitted, flat scatter at y=worldMin[1].
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
  place(null);   // immediate fallback scatter so a draw before place(withHeights) is valid.

  // PlantDraw uniform. Static fields written once; writeDraw refreshes tint + time.
  const pdBuf = device.createBuffer({ size: 64, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
  const pdScratch = new Float32Array(16);
  pdScratch[7] = height;   // .height
  pdScratch[8] = width;    // .width
  pdScratch[9] = sway;     // .sway
  function writeDraw(time, sunVisible) {
    const day = 0.35 + 0.65 * Math.max(0, Math.min(1, sunVisible)); // dimmed a touch at night
    pdScratch[0] = 0.16 * day; pdScratch[1] = 0.42 * day; pdScratch[2] = 0.14 * day; // colA
    pdScratch[3] = time;                                                             // .time
    pdScratch[4] = 0.45 * day; pdScratch[5] = 0.52 * day; pdScratch[6] = 0.20 * day; // colB
    device.queue.writeBuffer(pdBuf, 0, pdScratch);
  }

  // render pipeline: instanced crossed billboards, opaque (depth test + write), cutout alpha
  // via discard. Drawn after creatures, before water.
  const drawBGL = device.createBindGroupLayout({ entries: [
    { binding: 0, visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT, buffer: { type: "uniform" } }, // Camera
    { binding: 1, visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT, buffer: { type: "uniform" } }, // PlantDraw
    { binding: 2, visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT, buffer: { type: "uniform" } }, // Sky
    { binding: 3, visibility: GPUShaderStage.FRAGMENT,                        buffer: { type: "uniform" } }, // Fog
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
    primitive: { topology: "triangle-list", cullMode: "none" },   // double-sided cards
    depthStencil: { format: "depth24plus", depthWriteEnabled: true, depthCompare: "less" },
  });

  // HUD-controlled toggle. When off, draw() is a no-op but the buffer still exists so a
  // plant grid (if built) stays consistent.
  let enabled = true;
  function setEnabled(v) { enabled = !!v; return enabled; }

  // record the draw into the caller's already-open render pass. `time` drives the sway phase.
  function draw(pass, sky, time) {
    if (!enabled || count === 0) return;
    writeDraw(time, sky?.sunVisible ?? 1);
    pass.setPipeline(drawPipe);
    pass.setBindGroup(0, drawBG);
    pass.setVertexBuffer(0, plantBuf);
    pass.draw(12, count);   // 2 crossed quads, one instance per plant
  }

  return {
    draw, place, setEnabled,
    get enabled() { return enabled; },
    get placed() { return placed; },
    buffers: { plants: plantBuf, draw: pdBuf },
    count,
  };
}