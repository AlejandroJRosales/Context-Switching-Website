// rain.js: host orchestration for GPU rain. Mirrors createGrid/createRenderer:
// reused scratch typed arrays (no per-frame allocation), own bind groups, buildFrame()
// records the compute dispatch, draw() records into the caller's existing render pass.
//
// Intensity/mode is CPU-side global state (correctly a uniform, not a compute output):
// a 3-way toggle auto/on/off, eased each frame, surfaced in the HUD by the caller.

import { RAIN_ADVANCE, RAIN_RENDER, RAIN_WG } from "./rain.wgsl.js";

const ceilDiv = (a, b) => Math.floor((a + b - 1) / b);

export function createRain(device, format, {
  camBuf,                    // GPUBuffer, the renderer's Camera uniform (144 B) — reused
  skyBuf,                    // GPUBuffer, the renderer's SkyParams uniform (112 B) — reused
  count = 4096,              // particle pool size (power of 2, > mbverse's 3000)
  radius = 700,              // camera-column radius drops live within
  top = 400,                 // world Y where drops spawn
  fall = 300,                // vertical spawn-band height
  floorY = -20,              // recycle when a drop falls below this
  fallSpeed = 1300,          // downward world units / second
  wind = [40, 0, 18],        // constant drift (world units / second)
  width = 0.0035,            // streak half-width in NDC (screen fraction), ~a few px wide
  len = 14.0,                // base streak length
  seed = 1,
}) {
  // ---- particle buffer: rain : array<vec4<f32>>. VERTEX so it feeds the instanced
  // draw directly; STORAGE so the compute pass writes it. No ping-pong (see rain.wgsl.js).
  const rainBuf = device.createBuffer({
    size: count * 16,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
  });
  // seed initial positions on the host, ONE time (not per frame). After this the CPU
  // never touches the particle data — the compute pass owns it.
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

  // ---- RainParams uniform (advance pass). 3x vec4 + tail = 64 B.
  const rpBuf = device.createBuffer({ size: 64, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
  const rpScratch = new Float32Array(16);
  const rpU = new Uint32Array(rpScratch.buffer);
  // static fields written once; per-frame writeParams only refreshes camPos/dt.
  rpScratch[4]=wind[0]; rpScratch[5]=wind[1]; rpScratch[6]=wind[2]; rpScratch[7]=fallSpeed;
  rpScratch[8]=radius;  rpScratch[9]=top;
  rpScratch[10]=fall;   rpScratch[11]=floorY;
  rpU[12]=count;

  function writeParams(camPos, dt) {
    rpScratch[0]=camPos[0]; rpScratch[1]=camPos[1]; rpScratch[2]=camPos[2]; rpScratch[3]=dt;
    device.queue.writeBuffer(rpBuf, 0, rpScratch);
  }

  // ---- RainDraw uniform (render pass). color(vec3)+width, then len,alpha,pad. 32 B used.
  const rdBuf = device.createBuffer({ size: 64, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
  const rdScratch = new Float32Array(16);
  rdScratch[3]=width; rdScratch[4]=len;   // .width at [3], .len at [4] (static)
  function writeDraw(color, alpha, aspect) {
    rdScratch[0]=color[0]; rdScratch[1]=color[1]; rdScratch[2]=color[2]; // .width at [3] static
    rdScratch[5]=alpha;                                                  // .len at [4] static
    rdScratch[6]=aspect;                                                 // viewport w/h, for screen-space width
    device.queue.writeBuffer(rdBuf, 0, rdScratch);
  }

  // ---- compute pipeline
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

  // ---- render pipeline: instanced billboard, alpha-blended, depth-tested, no depth write.
  const drawBGL = device.createBindGroupLayout({ entries:[
    { binding:0, visibility:GPUShaderStage.VERTEX,                          buffer:{type:"uniform"} }, // Camera
    { binding:1, visibility:GPUShaderStage.VERTEX|GPUShaderStage.FRAGMENT,   buffer:{type:"uniform"} }, // RainDraw
    { binding:2, visibility:GPUShaderStage.FRAGMENT,                        buffer:{type:"uniform"} }, // Sky
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
    // match the pass depth attachment; test but do not write (drops don't sort vs each other)
    depthStencil:{ format:"depth24plus", depthWriteEnabled:false, depthCompare:"less" },
  });

  const groups = ceilDiv(count, RAIN_WG);

  // ---- host-side weather state: mode + eased intensity (global, so a uniform-ish scalar).
  const state = { mode:"auto", intensity:0, target:0, nextRoll:0, on:false };
  const MODES = ["auto", "on", "off"];
  // deterministic weather RNG independent of the particle seed stream
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
  // `sky` = current sky state (day/night tint). `aspect` = viewport w/h, used by the VS
  // for screen-space streak width. Streaks are oriented in clip space, no camera-right needed.
  function draw(pass, sky, aspect) {
    if (!state.on) return;
    const up = sky?.sunVisible ?? 1;
    // bluish, brighter by day; alpha scales with intensity (floored so light rain still reads)
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