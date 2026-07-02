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
    const timeOfDay = (simTime / dayLen) % 1;     // 0..1, 0=midnight
    const ang = timeOfDay * Math.PI * 2 - Math.PI / 2; // sun rises ~0.25, sets ~0.75
    const sunHeight = Math.sin(ang);              // -1..1
    const sunAz = Math.cos(ang);

    const sunDir = [
      sunAz,
      sunHeight * Math.cos(tilt) + 0.15,           // small uplift so dusk isn't edge-on
      Math.sin(tilt) * 0.6,
    ];
    const len = Math.hypot(sunDir[0], sunDir[1], sunDir[2]) || 1;
    sunDir[0] /= len; sunDir[1] /= len; sunDir[2] /= len;

    const c = sampleStops(sunHeight);
    const sunVisible = smoothstep(-0.15, 0.05, sunHeight);

    // Moon: roughly opposite the sun, on a slightly different tilt so it doesn't trace the
    // exact same arc. Up whenever the sun is down; light/disc fade in as the sun sets.
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

// Full-screen sky pass: oversized triangle from vertex_index. Uses the camera's invViewProj
// to turn screen NDC into world-space view rays so sky/sun align with geometry.
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
