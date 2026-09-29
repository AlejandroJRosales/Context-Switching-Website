// sky.js: atmosphere. Day/night cycle + sky/fog shader sources, plus GPU-resident
// weather particles (rain). (merged: sky.js + rain.js)

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
const lerp3 = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
const smoothstep = (e0, e1, x) => { const t = clamp((x - e0) / (e1 - e0), 0, 1); return t * t * (3 - 2 * t); };

// Palette keyframes across a day, indexed by sun height (sin of elevation).
// Each stop: { h (-1..1), top, bot (sky gradient), sun, amb, fog }
const STOPS = [
  { h: -1.00, top: [0.01, 0.015, 0.03], bot: [0.02, 0.025, 0.05], sun: [0.4, 0.5, 0.9], amb: [0.05, 0.06, 0.10], fog: [0.01, 0.015, 0.03] },
  { h: -0.20, top: [0.03, 0.04, 0.09], bot: [0.10, 0.08, 0.12], sun: [0.6, 0.5, 0.7], amb: [0.08, 0.08, 0.13], fog: [0.05, 0.05, 0.09] },
  { h: 0.00, top: [0.20, 0.18, 0.28], bot: [0.85, 0.45, 0.30], sun: [1.0, 0.55, 0.30], amb: [0.30, 0.22, 0.22], fog: [0.55, 0.35, 0.30] },
  { h: 0.20, top: [0.30, 0.45, 0.75], bot: [0.65, 0.72, 0.85], sun: [1.0, 0.85, 0.65], amb: [0.35, 0.37, 0.42], fog: [0.55, 0.62, 0.72] },
  { h: 0.85, top: [0.25, 0.50, 0.90], bot: [0.65, 0.78, 0.95], sun: [1.0, 0.98, 0.92], amb: [0.40, 0.43, 0.48], fog: [0.62, 0.72, 0.85] },
  { h: 1.00, top: [0.22, 0.47, 0.88], bot: [0.62, 0.75, 0.93], sun: [1.0, 0.95, 0.85], amb: [0.38, 0.41, 0.46], fog: [0.60, 0.70, 0.82] },
];

const MOON_COLOR = [0.45, 0.52, 0.72];

// sunset/dusk mirror sunrise/pre-dawn via the same table (symmetric by height).
function sampleStops(h) {
  for (let i = 0; i < STOPS.length - 1; i++) {
    const a = STOPS[i], b = STOPS[i + 1];
    if (h <= b.h || i === STOPS.length - 2) {
      const t = clamp((h - a.h) / (b.h - a.h || 1), 0, 1);
      return {
        top: lerp3(a.top, b.top, t),
        bot: lerp3(a.bot, b.bot, t),
        sun: lerp3(a.sun, b.sun, t),
        amb: lerp3(a.amb, b.amb, t),
        fog: lerp3(a.fog, b.fog, t),
      };
    }
  }
  return { top: STOPS[0].top, bot: STOPS[0].bot, sun: STOPS[0].sun, amb: STOPS[0].amb, fog: STOPS[0].fog };
}

// createSky({ dayLengthSeconds, tiltDeg }) -> { update(simTime)->state, get state() }
// state = { sunDir, sunColor, ambient, skyTop, skyBottom, fogColor, moonDir, moonColor,
//           moonVisible, timeOfDay:0..1, sunHeight:-1..1, sunVisible }
export function createSky(opts = {}) {
  const dayLen = opts.dayLengthSeconds ?? 120;
  const tilt = (opts.tiltDeg ?? 25) * Math.PI / 180;

  let state = null;

  function update(simTime) {
    const timeOfDay = (simTime / dayLen) % 1;          // 0..1, 0=midnight
    const ang = timeOfDay * Math.PI * 2 - Math.PI / 2; // sun rises ~0.25, sets ~0.75
    const sunHeight = Math.sin(ang);
    const sunAz = Math.cos(ang);

    const sunDir = [
      sunAz,
      sunHeight * Math.cos(tilt) + 0.15,   // small uplift so dusk isn't edge-on
      Math.sin(tilt) * 0.6,
    ];
    const len = Math.hypot(sunDir[0], sunDir[1], sunDir[2]) || 1;
    sunDir[0] /= len; sunDir[1] /= len; sunDir[2] /= len;

    const c = sampleStops(sunHeight);
    const sunVisible = smoothstep(-0.15, 0.05, sunHeight);

    // Moon: roughly opposite the sun, on a slightly different tilt. Up whenever the sun is
    // down; light/disc fade in as the sun sets.
    const moonDir = [
      -sunAz,
      -sunHeight * Math.cos(tilt) + 0.10,
      -Math.sin(tilt) * 0.6,
    ];
    const mlen = Math.hypot(moonDir[0], moonDir[1], moonDir[2]) || 1;
    moonDir[0] /= mlen; moonDir[1] /= mlen; moonDir[2] /= mlen;
    const moonVisible = (1 - smoothstep(-0.05, 0.15, sunHeight)) * smoothstep(-0.05, 0.10, moonDir[1]);

    state = {
      sunDir,
      sunColor: c.sun,
      ambient: c.amb,
      skyTop: c.top,
      skyBottom: c.bot,
      fogColor: c.fog,
      moonDir,
      moonColor: MOON_COLOR,
      moonVisible,
      timeOfDay,
      sunHeight,
      sunVisible,
    };
    return state;
  }

  return { update, get state() { return state; } };
}

export const SKY_PARAMS_STRUCT = /* wgsl */`
struct SkyParams {
  sunDir    : vec3<f32>, _p0 : f32,
  sunColor  : vec3<f32>, _p1 : f32,
  skyTop    : vec3<f32>, _p2 : f32,
  skyBottom : vec3<f32>, sunVisible : f32,
  ambient   : vec3<f32>, _p3 : f32,
  moonDir   : vec3<f32>, moonVisible : f32,
  moonColor : vec3<f32>, _p4 : f32,
};
`;

// Shared fog helper. Expects FogParams bound in scope as `FOG`; exp2 falloff by camera dist.
export const FOG_FN = /* wgsl */`
struct FogParams { fogColor : vec3<f32>, fogDist : f32 };

fn applyFog(litColor : vec3<f32>, worldPos : vec3<f32>, eye : vec3<f32>, fog : FogParams) -> vec3<f32> {
  let d = length(worldPos - eye);
  let f = 1.0 - exp(-pow(d / max(fog.fogDist, 1.0), 2.0));
  return mix(litColor, fog.fogColor, clamp(f, 0.0, 1.0));
}
`;

// Full-screen sky pass: oversized triangle from vertex_index. Uses invViewProj to turn
// screen NDC into world-space view rays so sky/sun align with geometry.
export const SKY_RENDER = SKY_PARAMS_STRUCT + /* wgsl */`
struct Camera {
  viewProj    : mat4x4<f32>,
  eye         : vec3<f32>, _p : f32,
  invViewProj : mat4x4<f32>,
};
@group(0) @binding(0) var<uniform> CAM : Camera;
@group(0) @binding(1) var<uniform> SKY : SkyParams;

struct VsOut {
  @builtin(position) clip : vec4<f32>,
  @location(0) ndc : vec2<f32>,
};

@vertex
fn vs(@builtin(vertex_index) vid : u32) -> VsOut {
  var p = array<vec2<f32>, 3>(
    vec2<f32>(-1.0, -1.0), vec2<f32>( 3.0, -1.0), vec2<f32>(-1.0,  3.0),
  );
  var out : VsOut;
  out.clip = vec4<f32>(p[vid], 0.9999, 1.0); // pinned at far plane
  out.ndc = p[vid];
  return out;
}

@fragment
fn fs(in : VsOut) -> @location(0) vec4<f32> {
  let nearP = CAM.invViewProj * vec4<f32>(in.ndc, -1.0, 1.0);
  let farP  = CAM.invViewProj * vec4<f32>(in.ndc,  1.0, 1.0);
  let nearW = nearP.xyz / nearP.w;
  let farW  = farP.xyz / farP.w;
  let dir   = normalize(farW - nearW);

  let t = clamp(dir.y * 0.5 + 0.5, 0.0, 1.0);
  var col = mix(SKY.skyBottom, SKY.skyTop, smoothstep(0.0, 0.6, t));

  // sun disc + glow: angular distance between view dir and sun dir
  let cosA = dot(dir, normalize(SKY.sunDir));
  let disc = smoothstep(0.9995, 0.9998, cosA);
  let glow = pow(max(cosA, 0.0), 64.0) * 0.6;
  col = col + SKY.sunColor * (disc * 3.0 + glow) * SKY.sunVisible;

  // moon disc + faint glow, opposite side, gated by moonVisible
  let cosM = dot(dir, normalize(SKY.moonDir));
  let mdisc = smoothstep(0.9990, 0.9995, cosM);
  let mglow = pow(max(cosM, 0.0), 200.0) * 0.25;
  col = col + SKY.moonColor * (mdisc * 1.4 + mglow) * SKY.moonVisible;

  return vec4<f32>(col, 1.0);
}
`;
// ===========================================================================
// RAIN: GPU-resident weather particles (was rain.js)
// ===========================================================================

// rain.js: GPU-resident weather particles (host + shaders).
//
// Re-expression of mbverse's CPU rain into the compute-first architecture: particles live
// in one storage buffer  rain : array<vec4<f32>>  (xyz = world pos, w = per-drop seed for
// length variation), never read back to the CPU. One compute pass advances + recycles each
// drop; the render pass draws the pool as instanced billboard streak.


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

  // Width in CLIP space as a horizontal screen offset
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
  camBuf,                    // renderer Camera uniform (144 B): reused
  skyBuf,                    // renderer SkyParams uniform (112 B): reused
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
