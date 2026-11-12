// 8c-audio.js: AUDIO. The Web Audio backend behind core's `sound` port: one AudioContext, one shared noise buffer, a master
// gain into a DynamicsCompressor, a voice manager, the car's engine loop, and the listener on the camera.
// Owns: audio (unlock, setEnabled, update, emit). May import: 1-config.js, 1b-sound-models.js, 2-core.js, three.
// Playback only: it reads emitting bodies (bodyMassKg, the car's speed) and never writes them, so sound on or off, and any
// voice cap, leaves every creature's behaviour, update rate and precision unchanged. Main calls unlock in the start tap
// (iOS needs the context created or resumed inside a user gesture), setEnabled from the Sound switch and chip (also taps),
// update each frame, and points sound.emit at audio.emit.
//
// Models are fitted to recordings (tools/sound/fit_models.py) and played as written in 1b-sound-models.js:
//   bandModel (one-shots): shared noise -> one bandpass per band -> a gain following that band's fitted envelope -> sum.
//   engineLoop (the car): harmonics of the firing rate (one oscillator) + noise bands pulsed at the firing rate; speed
//   raises the firing rate up to revMaxRatio x idle and the loudness by (rate ratio)^levelExponent.
// Voices: each one-shot builds its nodes when it starts and lets them go when it ends, rather than keeping chains alive,
// because a kept chain's filters run every audio frame even while silent. The voice cap (SOUND.voices, per Graphics
// quality) bounds how many exist at once; a new sound louder at the listener than the quietest playing one steals it.
// The car's engine loop is the one long-lived chain, outside the cap, and exists only while the player drives.
import * as THREE from 'three';
import { SOUND } from './1-config.js';
import { SOUND_MODELS } from './1b-sound-models.js';
import { seededRandom } from './2-core.js';

const _fwd = new THREE.Vector3(), _up = new THREE.Vector3();
// Audio's own random numbers: the sim draws from Math.random, so audio drawing there too would shift every creature's draws.
const rand = seededRandom(SOUND.randomSeed);

// Gain at the listener of a unit source dist metres away, by the PannerNode's own law (Web Audio spec), so the voice
// manager ranks and culls sounds by what the panner will actually play.
// The panner's gain at `dist` by SOUND.distance's law, with reference distance refM (the law's own, or a sound's).
function distanceGain(dist, refM = SOUND.distance.refM) {
  const D = SOUND.distance;
  const d = Math.min(Math.max(dist, refM), D.maxM);
  if (D.model === 'linear') return 1 - D.rolloff * (d - refM) / (D.maxM - refM);
  if (D.model === 'exponential') return Math.pow(d / refM, -D.rolloff);
  return refM / (refM + D.rolloff * (d - refM));   // 'inverse'
}

// A fitted bandModel's envelopes resampled once (linear between breakpoints) at the model's smallest breakpoint gap, no
// finer than SOUND.curveMinStepMs, one Float32Array per band, so a sound sets each band with one setValueCurveAtTime.
function curvesOf(model) {
  const bp = model.breakpointsMs, endMs = bp[bp.length - 1];
  let gap = endMs;
  for (let k = 1; k < bp.length; k++) gap = Math.min(gap, bp[k] - bp[k - 1]);
  const n = Math.max(2, Math.round(endMs / Math.max(gap, SOUND.curveMinStepMs)) + 1);
  const curves = model.gains.map(row => {
    const c = new Float32Array(n);
    let k = 0;
    for (let i = 0; i < n; i++) {
      const t = endMs * i / (n - 1);
      while (k < bp.length - 2 && bp[k + 1] < t) k++;
      const s = (t - bp[k]) / (bp[k + 1] - bp[k]);
      c[i] = row[k] + (row[k + 1] - row[k]) * Math.min(1, Math.max(0, s));
    }
    return c;
  });
  return { model, curves, durS: endMs / 1000 };
}

// RMS of the shared uniform noise (variance 1/3) after two identical cascaded filters:
// variance = (1/3) * (2/sr) * integral over 0..sr/2 of |H(f)|^4 df, integrated numerically from the node's own frequency
// response up to 100x its cutoff (the response there is below -160 dB).
function filteredNoiseRms(ctx, filter, cutoffHz) {
  const n = 4096, top = Math.min(ctx.sampleRate / 2, cutoffHz * 100);
  const freqs = new Float32Array(n), mag = new Float32Array(n), phase = new Float32Array(n);
  for (let i = 0; i < n; i++) freqs[i] = (i + 0.5) * top / n;
  filter.getFrequencyResponse(freqs, mag, phase);
  let sum = 0;
  for (let i = 0; i < n; i++) sum += mag[i] ** 4;
  return Math.sqrt((1 / 3) * (2 / ctx.sampleRate) * sum * (top / n));
}

export const audio = {
  ctx: null,
  master: null,
  noise: null,
  enabled: SOUND.onAtLoad,   // the Sound switch and chip; off suspends the context (no audio thread work, emits dropped)
  high: true,          // Graphics quality, from update: voice cap and panning model
  voices: [],          // one-shots playing: { endS, priority, out, sources }
  played: {},          // per bandModel name: curvesOf(model), built at unlock
  lx: 0, ly: 0, lz: 0, // listener position, world metres (update)
  // the car's engine: loop (the running chain or null), idleAtS (context time the start hands over to the loop, or -1
  // with no start pending), fadeInS (the loop's fade-in), lastSeenS (context time of the last carEngine report)
  engine: { loop: null, idleAtS: -1, fadeInS: 0, lastSeenS: -Infinity },

  // In a tap (start, or the Sound switch or chip turning on): create (or resume) the context, building the shared parts once.
  unlock() {
    if (!this.enabled) return;
    if (!this.ctx) {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return;   // no Web Audio: every emit stays a no-op
      const ctx = this.ctx = new Ctx();
      const C = SOUND.compressor, comp = ctx.createDynamicsCompressor();
      comp.threshold.value = C.thresholdDb; comp.knee.value = C.kneeDb; comp.ratio.value = C.ratio;
      comp.attack.value = C.attackS; comp.release.value = C.releaseS;
      this.master = ctx.createGain();
      this.master.gain.value = SOUND.volume;
      this.master.connect(comp);
      comp.connect(ctx.destination);
      // uniform white noise in [-1, 1], the source every model was fitted against
      const frames = Math.round(SOUND.noiseS * ctx.sampleRate);
      this.noise = ctx.createBuffer(1, frames, ctx.sampleRate);
      const data = this.noise.getChannelData(0);
      for (let i = 0; i < frames; i++) data[i] = rand() * 2 - 1;
      for (const name in SOUND_MODELS) if (SOUND_MODELS[name].kind === 'bandModel') this.played[name] = curvesOf(SOUND_MODELS[name]);
    }
    if (this.ctx.state !== 'running') this.ctx.resume();
  },

  // The Sound switch and chip. Off suspends the context, so playing sounds pause and new ones are dropped; on resumes.
  setEnabled(on) {
    this.enabled = on;
    if (on) this.unlock();
    else if (this.ctx && this.ctx.state === 'running') this.ctx.suspend();
  },

  // Each frame: the listener on the camera (world position, quaternion), the Graphics quality for new voices, and the
  // engine loop stopped if the car stopped reporting (a reload or reset ends the drive without an exit).
  update(pos, quat, high) {
    this.high = high;
    const ctx = this.ctx;
    if (!ctx) return;
    const L = ctx.listener;
    _fwd.set(0, 0, -1).applyQuaternion(quat);
    _up.set(0, 1, 0).applyQuaternion(quat);
    if (L.positionX) {
      L.positionX.value = pos.x; L.positionY.value = pos.y; L.positionZ.value = pos.z;
      L.forwardX.value = _fwd.x; L.forwardY.value = _fwd.y; L.forwardZ.value = _fwd.z;
      L.upX.value = _up.x; L.upY.value = _up.y; L.upZ.value = _up.z;
    } else {   // older Safari: the deprecated setters
      L.setPosition(pos.x, pos.y, pos.z);
      L.setOrientation(_fwd.x, _fwd.y, _fwd.z, _up.x, _up.y, _up.z);
    }
    this.lx = pos.x; this.ly = pos.y; this.lz = pos.z;
    const E = this.engine;
    if (E.loop && ctx.currentTime - E.lastSeenS > SOUND.car.lostAfterS) this.stopEngine(ctx.currentTime, SOUND.car.idleToShutdownFadeS);
  },

  // core's sound.emit points here. Nothing plays with sound off (checked directly: suspend() takes effect asynchronously)
  // or while the context is not running (before the start tap, or the browser suspended it).
  emit(type, x, y, z, body) {
    if (!this.enabled || !this.ctx || this.ctx.state !== 'running') return;
    if (type === 'footstep') this.footstep(x, y, z, body);
    else if (type === 'gunshot') this.gunshot(x, y, z);
    else if (type === 'carEngine') this.carEngine(x, y, z, body);
    else if (type === 'carStart') this.carStart(x, y, z);
    else if (type === 'carStop') this.carStop(x, y, z);
  },

  // Gain at the listener of a source at (x, y, z) through a panner with reference distance refM.
  reachAt(x, y, z, refM) { return distanceGain(Math.hypot(x - this.lx, y - this.ly, z - this.lz), refM); },

  footstep(x, y, z, body) {
    const F = SOUND.footstep, reach = this.reachAt(x, y, z);
    if (reach * F.outputGain * Math.max(F.gainAtMinMass, F.gainAtMaxMass) < SOUND.cullGain) return;   // cheap cull before the body is read
    const m = F.massRangeKg, share = Math.min(1, Math.max(0, (body.bodyMassKg() - m[0]) / (m[1] - m[0])));
    const gain = F.outputGain * (F.gainAtMinMass + (F.gainAtMaxMass - F.gainAtMinMass) * share);
    if (reach * gain < SOUND.cullGain) return;
    this.playBandModel(this.played[F.model], x, y, z, gain, reach * gain, F.releaseS);
  },

  gunshot(x, y, z) {
    const G = SOUND.gun, heard = this.reachAt(x, y, z, G.refM) * G.outputGain;
    if (heard < SOUND.cullGain) return;
    this.playBandModel(this.played[G.model], x, y, z, G.outputGain, heard, G.releaseS, G.refM);
  },

  // The player boarded: the start sound, then the engine loop takes over at its last breakpoint.
  carStart(x, y, z) {
    const C = SOUND.car, E = this.engine, now = this.ctx.currentTime;
    if (E.loop) this.stopEngine(now, C.idleToShutdownFadeS);   // a start while running (cannot happen in play): restart
    const handover = this.playBandModel(this.played[C.startModel], x, y, z, C.outputGain, Infinity, C.startToIdleFadeS);
    E.idleAtS = handover; E.fadeInS = C.startToIdleFadeS;
  },

  // Every frame while the player drives: the loop follows the car's position and |speed|. With no loop and no start pending
  // (sound turned on mid-drive), the loop starts now with a short fade-in.
  carEngine(x, y, z, car) {
    const C = SOUND.car, E = this.engine, now = this.ctx.currentTime;
    E.lastSeenS = now;
    if (!E.loop) {
      if (E.idleAtS < 0) { E.idleAtS = now; E.fadeInS = C.lateIdleFadeS; }
      if (now + 0.05 >= E.idleAtS) { E.loop = this.engineLoop(Math.max(now, E.idleAtS), E.fadeInS); E.idleAtS = -1; }
    }
    if (E.loop) E.loop.follow(x, y, z, Math.abs(car.speed), now);
  },

  // The player got out: the loop fades as the shutdown sound starts.
  carStop(x, y, z) {
    const C = SOUND.car, now = this.ctx.currentTime;
    this.stopEngine(now, C.idleToShutdownFadeS);
    this.playBandModel(this.played[C.shutdownModel], x, y, z, C.outputGain, Infinity, C.releaseS);
  },

  stopEngine(at, fadeS) {
    const E = this.engine;
    if (E.loop) E.loop.stop(at, fadeS);
    E.loop = null; E.idleAtS = -1;
  },

  // A voice slot for a sound heard at `priority` (its gain at the listener), stealing the quietest when full; false: drop it.
  takeVoice(priority) {
    const now = this.ctx.currentTime, V = this.voices;
    for (let i = V.length - 1; i >= 0; i--) if (V[i].endS <= now) V.splice(i, 1);
    const cap = this.high ? SOUND.voices.high : SOUND.voices.low;
    if (V.length < cap) return true;
    let q = 0;
    for (let i = 1; i < V.length; i++) if (V[i].priority < V[q].priority) q = i;
    if (V[q].priority >= priority) return false;
    const v = V[q], g = v.out.gain;
    if (g.cancelAndHoldAtTime) g.cancelAndHoldAtTime(now); else g.cancelScheduledValues(now);   // drop its pending release
    g.setTargetAtTime(0, now, SOUND.stealFadeS / 3);   // about 95% gone after stealFadeS
    for (const s of v.sources) s.stop(now + SOUND.stealFadeS);
    V.splice(q, 1);
    return true;
  },

  // A panner at (x, y, z) into the master, set by SOUND.distance (reference distance refM) and the Graphics quality's
  // panning model.
  panner(x, y, z, refM = SOUND.distance.refM) {
    const D = SOUND.distance, p = this.ctx.createPanner();
    p.panningModel = this.high ? SOUND.panning.high : SOUND.panning.low;
    p.distanceModel = D.model; p.refDistance = refM; p.rolloffFactor = D.rolloff; p.maxDistance = D.maxM;
    if (p.positionX) { p.positionX.value = x; p.positionY.value = y; p.positionZ.value = z; }
    else p.setPosition(x, y, z);
    p.connect(this.master);
    return p;
  },

  // A fitted bandModel at (x, y, z): noise -> bandpass per band -> fitted envelope -> gain -> panner -> master.
  // The release ramps `out`, not the envelopes: Chrome can start a curve late, and a ramp on the curve's param then throws.
  // `refM`: its panner's reference distance (SOUND.distance's, or the sound's own, as the gun's).
  // Returns the context time of its last breakpoint (where its release begins), or -1 if no voice was free.
  playBandModel(played, x, y, z, gain, priority, releaseS, refM = SOUND.distance.refM) {
    if (!this.takeVoice(priority)) return -1;
    const ctx = this.ctx, now = ctx.currentTime;
    const out = ctx.createGain();
    out.gain.setValueAtTime(gain, now);
    out.connect(this.panner(x, y, z, refM));
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    src.loop = true;
    const M = played.model, lastS = now + played.durS, endS = lastS + releaseS;
    for (let i = 0; i < M.bandHz.length; i++) {
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass'; bp.frequency.value = M.bandHz[i]; bp.Q.value = M.bandQ;
      const env = ctx.createGain();
      env.gain.setValueCurveAtTime(played.curves[i], now, played.durS);   // holds its last value after the curve ends
      src.connect(bp); bp.connect(env); env.connect(out);
    }
    out.gain.setValueAtTime(gain, lastS);
    out.gain.linearRampToValueAtTime(0, endS);
    src.start(now, rand() * this.noise.duration);   // a random read point keeps overlapping sounds decorrelated
    src.stop(endS);
    this.voices.push({ endS, priority, out, sources: [src] });
    return lastS;
  },

  // The car's engine loop from `when`, fading in over fadeInS. Returns { follow(x, y, z, speedMps, at), stop(at, fadeS) }.
  engineLoop(when, fadeInS) {
    const ctx = this.ctx, C = SOUND.car, m = SOUND_MODELS[C.idleModel];
    const fade = ctx.createGain();         // fade in and out
    fade.gain.setValueAtTime(0, when);
    fade.gain.linearRampToValueAtTime(C.outputGain, when + Math.max(fadeInS, 0.005));
    const level = ctx.createGain();        // loudness vs firing rate
    level.connect(fade);
    const pan = this.panner(this.lx, this.ly, this.lz);
    fade.connect(pan);

    // harmonics: sum of A_k cos(k theta + p_k) -> real = A cos p, imag = -A sin p
    const n = m.harmonicAmp.length + 1, real = new Float32Array(n), imag = new Float32Array(n);
    m.harmonicAmp.forEach((a, k) => { real[k + 1] = a * Math.cos(m.harmonicPhase[k]); imag[k + 1] = -a * Math.sin(m.harmonicPhase[k]); });
    const harm = ctx.createOscillator();
    harm.setPeriodicWave(ctx.createPeriodicWave(real, imag, { disableNormalization: true }));
    harm.frequency.value = m.idleHz;
    harm.connect(level);

    // noise bands, pulsed at the firing rate: gain = 1 + pulseDepth * cos(theta)
    const src = ctx.createBufferSource();
    src.buffer = this.noise; src.loop = true;
    const noiseSum = ctx.createGain();
    for (let i = 0; i < m.bandHz.length; i++) {
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass'; bp.frequency.value = m.bandHz[i]; bp.Q.value = m.bandQ;
      const g = ctx.createGain();
      g.gain.value = m.noiseGains[i];
      src.connect(bp); bp.connect(g); g.connect(noiseSum);
    }
    const pulse = ctx.createOscillator();
    pulse.frequency.value = m.idleHz;
    const pulseDepth = ctx.createGain();
    pulseDepth.gain.value = m.pulseDepth;
    pulse.connect(pulseDepth); pulseDepth.connect(noiseSum.gain);
    noiseSum.connect(level);

    // firing-rate wander: noise through two lowpasses, scaled so its RMS is wanderFraction of idleHz
    const wanderSrc = ctx.createBufferSource();
    wanderSrc.buffer = this.noise; wanderSrc.loop = true;
    const lp1 = ctx.createBiquadFilter(), lp2 = ctx.createBiquadFilter();
    for (const lp of [lp1, lp2]) { lp.type = 'lowpass'; lp.frequency.value = m.wanderHz; lp.Q.value = Math.SQRT1_2; }
    const wander = ctx.createGain();
    wander.gain.value = (m.wanderFraction * m.idleHz) / filteredNoiseRms(ctx, lp1, m.wanderHz);
    wanderSrc.connect(lp1); lp1.connect(lp2); lp2.connect(wander);
    wander.connect(harm.frequency); wander.connect(pulse.frequency);

    const sources = [harm, pulse, src, wanderSrc];
    let ratioSet = 1;   // firing-rate ratio last scheduled; follow re-targets only when it moves
    harm.start(when); pulse.start(when);
    src.start(when, rand() * this.noise.duration); wanderSrc.start(when, rand() * this.noise.duration);

    return {
      follow(x, y, z, speedMps, at) {
        if (pan.positionX) { pan.positionX.value = x; pan.positionY.value = y; pan.positionZ.value = z; }
        else pan.setPosition(x, y, z);
        const r = C.speedRangeMps, t = Math.min(1, Math.max(0, (speedMps - r[0]) / (r[1] - r[0])));
        const ratio = 1 + (m.revMaxRatio - 1) * t;   // firing rate / idle rate
        if (Math.abs(ratio - ratioSet) < 1e-3) return;
        ratioSet = ratio;
        harm.frequency.setTargetAtTime(m.idleHz * ratio, at, C.speedSmoothS);
        pulse.frequency.setTargetAtTime(m.idleHz * ratio, at, C.speedSmoothS);
        level.gain.setTargetAtTime(Math.pow(ratio, m.levelExponent), at, C.speedSmoothS);
      },
      stop(at, fadeS) {
        // hold whatever the fade-in has reached at `at`, then ramp to 0
        if (fade.gain.cancelAndHoldAtTime) fade.gain.cancelAndHoldAtTime(at);
        else { fade.gain.cancelScheduledValues(at); fade.gain.setValueAtTime(fade.gain.value, at); }
        fade.gain.linearRampToValueAtTime(0, at + fadeS);
        for (const s of sources) s.stop(at + fadeS + 0.05);
      }
    };
  }
};
