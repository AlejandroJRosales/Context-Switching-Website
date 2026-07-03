// rain.js: GPU-resident weather particles (host + shaders).
//
// Re-expression of mbverse's CPU rain into the compute-first architecture: particles live
// in one storage buffer  rain : array<vec4<f32>>  (xyz = world pos, w = per-drop seed for
// length variation), never read back to the CPU. One compute pass advances + recycles each
// drop; the render pass draws the pool as instanced billboard streaks.
//
// The buffer is NOT ping-ponged: each thread touches only its own element, so there is no
// cross-thread aliasing and double-buffering would only add a copy.
//
// Intensity/mode is CPU-side global state (correctly a uniform, not a compute output):
// a 3-way toggle auto/on/off, eased each frame, surfaced in the HUD by the caller.

import { SKY_PARAMS_STRUCT } from "./sky.js";

export const RAIN_WG = 64;   // one thread per drop

// Compute: advance + in-place recycle. Camera XZ arrives via RainParams so the finite pool
// always brackets the player (rain follows the camera, as in mbverse).
export const RAIN_ADVANCE = /* wgsl */`
struct RainParams {
  camPos    : vec3<f32>, dt        : f32,
  wind      : vec3<f32>, fallSpeed : f32,
  radius    : f32,       top       : f32,   // spawn cylinder radius; column top (world Y)
  fall      : f32,       floorY    : f32,   // vertical spawn band height; recycle floor
  N         : u32,       _p0 : f32, _p1 : f32, _p2 : f32,
};
@group(0) @binding(0) var<uniform> RP : RainParams;
@group(0) @binding(1) var<storage, read_write> rain : array<vec4<f32>>;

fn hash11(x : f32) -> f32 { return fract(sin(x * 91.345) * 47453.21); }
fn hash21(a : f32, b : f32) -> f32 { return fract(sin(a * 91.345 + b * 47.853) * 47453.21); }

@compute @workgroup_size(${RAIN_WG})
fn main(@builtin(global_invocation_id) gid : vec3<u32>) {
  let i = gid.x;
  if (i >= RP.N) { return; }
  var p = rain[i];

  p.x = p.x + RP.wind.x * RP.dt;
  p.z = p.z + RP.wind.z * RP.dt;
  p.y = p.y - RP.fallSpeed * RP.dt;

  // recycle test (per-drop, independent): below the floor, or outside the camera column.
  let ddx = p.x - RP.camPos.x;
  let ddz = p.z - RP.camPos.z;
  let outR = (ddx * ddx + ddz * ddz) > (RP.radius * RP.radius) * 1.2;
  if (p.y < RP.floorY || outR) {
    // fresh offset from a hash of (drop index, coarse time epoch). Two hashes give angle +
    // normalized radius; sqrt(r) keeps the disc uniform so drops don't clump at center.
    let epoch = floor(RP.top + p.w * 977.0);
    let a  = hash21(f32(i) + 1.0, epoch) * 6.2831853;
    let rr = sqrt(hash11(f32(i) * 0.61803 + epoch)) * RP.radius;
    p.x = RP.camPos.x + cos(a) * rr;
    p.z = RP.camPos.z + sin(a) * rr;
    p.y = RP.top - hash11(f32(i) * 1.77 + epoch) * RP.fall;
    p.w = hash11(f32(i) * 2.31 + epoch);
  }

  rain[i] = p;
}
`;

// Render: instanced billboard streaks. Length is applied in world space along world-up
// (before projection, so streaks stay vertical and foreshorten); width is a screen-space
// clip offset. Per-drop length from the .w seed.
export const RAIN_RENDER = SKY_PARAMS_STRUCT + /* wgsl */`
struct Camera { viewProj : mat4x4<f32>, eye : vec3<f32>, _p : f32, invViewProj : mat4x4<f32> };
struct RainDraw {
  color : vec3<f32>, width : f32,   // tint, streak half-width (NDC / screen fraction)
  len   : f32, alpha : f32, aspect : f32, _p2 : f32,
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
  var corners = array<vec2<f32>, 6>(
    vec2<f32>(-1.0, -1.0), vec2<f32>( 1.0, -1.0), vec2<f32>( 1.0, 1.0),
    vec2<f32>(-1.0, -1.0), vec2<f32>( 1.0,  1.0), vec2<f32>(-1.0, 1.0),
  );
  let c = corners[vid];
  let seed = inst.w;
  let len = RD.len * (0.6 + 0.4 * seed);

  let world = inst.xyz + vec3<f32>(0.0, 1.0, 0.0) * (c.y * len);
  var clip = CAM.viewProj * vec4<f32>(world, 1.0);

  // Width in CLIP space as a horizontal screen offset. The old world-space "right" axis was
  // derived from the drop->camera vector projected to XZ, which degenerates (parallel to
  // view) for drops straight ahead, stacking the still-camera column into one fat bar. A
  // screen-space offset can't degenerate. Multiply by clip.w so the perspective divide
  // leaves a constant NDC width; divide by aspect so it isn't stretched by the viewport.
  clip.x = clip.x + c.x * RD.width * clip.w / RD.aspect;

  var out : VsOut;
  out.clip = clip;
  out.t = c.y * 0.5 + 0.5;
  return out;
}

@fragment
fn fs(in : VsOut) -> @location(0) vec4<f32> {
  let a = RD.alpha * (0.15 + 0.85 * in.t);   // fainter at bottom: cheap motion-blur look
  return vec4<f32>(RD.color, a);
}
`;

const ceilDiv = (a, b) => Math.floor((a + b - 1) / b);

export function createRain(device, format, {
  camBuf,                    // renderer Camera uniform (144 B) — reused
  skyBuf,                    // renderer SkyParams uniform (112 B) — reused
  count = 4096,              // particle pool size (power of 2)
  radius = 700,              // camera-column radius drops live within
  top = 400,                 // world Y where drops spawn
  fall = 300,                // vertical spawn-band height
  floorY = -20,              // recycle when a drop falls below this
  fallSpeed = 1300,          // downward world units / second
  wind = [40, 0, 18],        // constant drift (world units / second)
  width = 0.0035,            // streak half-width in NDC (~a few px)
  len = 14.0,                // base streak length
  seed = 1,
}) {
  // particle buffer: VERTEX (feeds instanced draw) | STORAGE (compute writes) | COPY_DST.
  const rainBuf = device.createBuffer({
    size: count * 16,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
  });
  // seed initial positions ONE time; after this the CPU never touches the particle data.
  {
    let s = (seed * 2654435761) >>> 0;
    const rng = () => { s = (Math.imul(s ^ (s >>> 15), 2246822519)) >>> 0; return s / 4294967296; };
    const init = new Float32Array(count * 4);
    for (let i = 0; i < count; i++) {
      const a = rng() * Math.PI * 2, rr = Math.sqrt(rng()) * radius;
      init[i*4+0] = Math.cos(a) * rr;
      init[i*4+1] = top - rng() * fall;
      init[i*4+2] = Math.sin(a) * rr;
      init[i*4+3] = rng();
    }
    device.queue.writeBuffer(rainBuf, 0, init);
  }

  // RainParams uniform (advance pass). Static fields written once; writeParams refreshes camPos/dt.
  const rpBuf = device.createBuffer({ size: 64, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
  const rpScratch = new Float32Array(16);
  const rpU = new Uint32Array(rpScratch.buffer);
  rpScratch[4]=wind[0]; rpScratch[5]=wind[1]; rpScratch[6]=wind[2]; rpScratch[7]=fallSpeed;
  rpScratch[8]=radius;  rpScratch[9]=top;
  rpScratch[10]=fall;   rpScratch[11]=floorY;
  rpU[12]=count;

  function writeParams(camPos, dt) {
    rpScratch[0]=camPos[0]; rpScratch[1]=camPos[1]; rpScratch[2]=camPos[2]; rpScratch[3]=dt;
    device.queue.writeBuffer(rpBuf, 0, rpScratch);
  }

  // RainDraw uniform (render pass). .width at [3], .len at [4] are static.
  const rdBuf = device.createBuffer({ size: 64, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
  const rdScratch = new Float32Array(16);
  rdScratch[3]=width; rdScratch[4]=len;
  function writeDraw(color, alpha, aspect) {
    rdScratch[0]=color[0]; rdScratch[1]=color[1]; rdScratch[2]=color[2];
    rdScratch[5]=alpha;
    rdScratch[6]=aspect;   // viewport w/h, for screen-space width
    device.queue.writeBuffer(rdBuf, 0, rdScratch);
  }

  // compute pipeline
  const advBGL = device.createBindGroupLayout({ entries:[
    { binding:0, visibility:GPUShaderStage.COMPUTE, buffer:{type:"uniform"} },
    { binding:1, visibility:GPUShaderStage.COMPUTE, buffer:{type:"storage"} },
  ]});
  const advBG = device.createBindGroup({ layout:advBGL, entries:[
    { binding:0, resource:{buffer:rpBuf} },
    { binding:1, resource:{buffer:rainBuf} },
  ]});
  const advPipe = device.createComputePipeline({
    layout: device.createPipelineLayout({ bindGroupLayouts:[advBGL] }),
    compute:{ module: device.createShaderModule({ code:RAIN_ADVANCE }), entryPoint:"main" },
  });

  // render pipeline: instanced billboard, alpha-blended, depth-tested, no depth write.
  const drawBGL = device.createBindGroupLayout({ entries:[
    { binding:0, visibility:GPUShaderStage.VERTEX,                        buffer:{type:"uniform"} }, // Camera
    { binding:1, visibility:GPUShaderStage.VERTEX|GPUShaderStage.FRAGMENT, buffer:{type:"uniform"} }, // RainDraw
    { binding:2, visibility:GPUShaderStage.FRAGMENT,                      buffer:{type:"uniform"} }, // Sky
  ]});
  const drawBG = device.createBindGroup({ layout:drawBGL, entries:[
    { binding:0, resource:{buffer:camBuf} },
    { binding:1, resource:{buffer:rdBuf} },
    { binding:2, resource:{buffer:skyBuf} },
  ]});
  const drawMod = device.createShaderModule({ code:RAIN_RENDER });
  const drawPipe = device.createRenderPipeline({
    layout: device.createPipelineLayout({ bindGroupLayouts:[drawBGL] }),
    vertex:{ module:drawMod, entryPoint:"vs", buffers:[
      { arrayStride:16, stepMode:"instance", attributes:[
        { shaderLocation:0, offset:0, format:"float32x4" },   // inst pos.xyz + seed.w
      ]},
    ]},
    fragment:{ module:drawMod, entryPoint:"fs", targets:[{
      format,
      blend:{
        color:{ srcFactor:"src-alpha", dstFactor:"one-minus-src-alpha", operation:"add" },
        alpha:{ srcFactor:"one",       dstFactor:"one-minus-src-alpha", operation:"add" },
      },
    }]},
    primitive:{ topology:"triangle-list", cullMode:"none" },
    depthStencil:{ format:"depth24plus", depthWriteEnabled:false, depthCompare:"less" },
  });

  const groups = ceilDiv(count, RAIN_WG);

  // host-side weather state: mode + eased intensity (global, so a uniform-ish scalar).
  const state = { mode:"auto", intensity:0, target:0, nextRoll:0, on:false };
  const MODES = ["auto", "on", "off"];
  let ws = ((seed + 12345) * 2654435761) >>> 0;
  const wrng = () => { ws = (Math.imul(ws ^ (ws >>> 13), 2246822519)) >>> 0; return ws / 4294967296; };

  function cycleMode() {
    state.mode = MODES[(MODES.indexOf(state.mode) + 1) % MODES.length];
    if (state.mode === "auto") state.nextRoll = 0; // re-roll immediately
    return state.mode;
  }

  // ease intensity toward the mode's target; call once per frame with dt + sim time.
  function resolve(dt, t) {
    if (state.mode === "on") {
      state.target = 1;
    } else if (state.mode === "off") {
      state.target = 0;
    } else { // auto: periodically roll a new target
      if (t >= state.nextRoll) {
        state.nextRoll = t + 20 + wrng() * 40;
        state.target = wrng() < 0.35 ? (0.4 + wrng() * 0.6) : 0;
      }
    }
    const k = Math.min(1, dt * (state.mode === "auto" ? 0.4 : 0.6));
    state.intensity += (state.target - state.intensity) * k;
    state.on = state.intensity > 0.02;
    return state;
  }

  // record the advance dispatch. Skipped entirely when it isn't raining.
  function buildFrame(encoder, camPos, dt) {
    if (!state.on) return;
    writeParams(camPos, dt);
    const pass = encoder.beginComputePass();
    pass.setPipeline(advPipe);
    pass.setBindGroup(0, advBG);
    pass.dispatchWorkgroups(groups);
    pass.end();
  }

  // record the draw into the caller's already-open render pass (after water).
  function draw(pass, sky, aspect) {
    if (!state.on) return;
    const up = sky?.sunVisible ?? 1;
    // bluish, brighter by day; alpha scales with intensity (floored so light rain reads)
    writeDraw(
      [0.30 + 0.62*up, 0.34 + 0.68*up, 0.40 + 0.78*up],
      0.42 * Math.max(0.15, state.intensity),
      aspect || 1);
    pass.setPipeline(drawPipe);
    pass.setBindGroup(0, drawBG);
    pass.setVertexBuffer(0, rainBuf);
    pass.draw(6, count);
  }

  return {
    buildFrame, draw, resolve, cycleMode,
    get state() { return state; },
    buffers: { rain: rainBuf, params: rpBuf, draw: rdBuf },
    count,
  };
}