// sky.js: day/night cycle. Pure CPU: computes sun dir/color, ambient, sky gradient,
// and fog color from simTime, returned as a flat object for uniform upload.

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
const lerp3 = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
const smoothstep = (e0, e1, x) => { const t = clamp((x - e0) / (e1 - e0), 0, 1); return t * t * (3 - 2 * t); };

// Palette keyframes across a full day, indexed by sun height (sin of elevation angle).
// Each stop: { h (sun height -1..1), sky top, sky bottom, sun color, ambient, fog }
const STOPS = [
  // deep night
  { h: -1.00, top: [0.01, 0.015, 0.03], bot: [0.02, 0.025, 0.05], sun: [0.4, 0.5, 0.9], amb: [0.05, 0.06, 0.10], fog: [0.01, 0.015, 0.03] },
  // pre-dawn
  { h: -0.20, top: [0.03, 0.04, 0.09], bot: [0.10, 0.08, 0.12], sun: [0.6, 0.5, 0.7], amb: [0.08, 0.08, 0.13], fog: [0.05, 0.05, 0.09] },
  // sunrise
  { h: 0.00, top: [0.20, 0.18, 0.28], bot: [0.85, 0.45, 0.30], sun: [1.0, 0.55, 0.30], amb: [0.30, 0.22, 0.22], fog: [0.55, 0.35, 0.30] },
  // morning
  { h: 0.20, top: [0.30, 0.45, 0.75], bot: [0.65, 0.72, 0.85], sun: [1.0, 0.85, 0.65], amb: [0.35, 0.37, 0.42], fog: [0.55, 0.62, 0.72] },
  // midday
  { h: 0.85, top: [0.25, 0.50, 0.90], bot: [0.65, 0.78, 0.95], sun: [1.0, 0.98, 0.92], amb: [0.40, 0.43, 0.48], fog: [0.62, 0.72, 0.85] },
  // afternoon (mirrors morning)
  { h: 1.00, top: [0.22, 0.47, 0.88], bot: [0.62, 0.75, 0.93], sun: [1.0, 0.95, 0.85], amb: [0.38, 0.41, 0.46], fog: [0.60, 0.70, 0.82] },
];

// sunset/dusk mirror sunrise/pre-dawn via the same stop table (symmetric enough by height).
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

// createSky({ dayLengthSeconds, tiltDeg }) -> { update(simTime) -> state, get state() }
// state = { sunDir:[x,y,z], sunColor:[r,g,b], ambient:[r,g,b],
//           skyTop:[r,g,b], skyBottom:[r,g,b], fogColor:[r,g,b],
//           timeOfDay:0..1, sunHeight:-1..1 }
export function createSky(opts = {}) {
  const dayLen = opts.dayLengthSeconds ?? 120; // one full day/night cycle, in real seconds
  const tilt = (opts.tiltDeg ?? 25) * Math.PI / 180; // sun path tilt off the horizon plane

  let state = null;

  function update(simTime) {
    const timeOfDay = (simTime / dayLen) % 1;     // 0..1, 0=midnight
    const ang = timeOfDay * Math.PI * 2 - Math.PI / 2; // sun rises ~0.25, sets ~0.75
    const sunHeight = Math.sin(ang);              // -1..1
    const sunAz = Math.cos(ang);

    const sunDir = [
      sunAz,
      sunHeight * Math.cos(tilt) + 0.15,           // small constant uplift so dusk isn't pitch-edge-on
      Math.sin(tilt) * 0.6,
    ];
    const len = Math.hypot(sunDir[0], sunDir[1], sunDir[2]) || 1;
    sunDir[0] /= len; sunDir[1] /= len; sunDir[2] /= len;

    const c = sampleStops(sunHeight);
    // sun visual intensity fades out below the horizon (no point lighting a disc you can't see)
    const sunVisible = smoothstep(-0.15, 0.05, sunHeight);

    state = {
      sunDir,
      sunColor: c.sun,
      ambient: c.amb,
      skyTop: c.top,
      skyBottom: c.bot,
      fogColor: c.fog,
      timeOfDay,
      sunHeight,
      sunVisible,
    };
    return state;
  }

  return { update, get state() { return state; } };
}
