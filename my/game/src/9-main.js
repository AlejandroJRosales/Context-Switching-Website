// 9-main.js: MAIN. Starts the game: loading steps, start screen, settings, debug readout, HUD, load functions,
// teardownWorld, newEcosystem, loadIntroScene, the frame loop, wake, visibility, resize.
// Owns: the DOM of the panel, card and settings, the loading steps and say, the start screen and mode choice, the
// settings chips, the debug readout, the HUD (refreshHud), fullscreen, the load functions (loadPlace, loadWilderness,
// finishLoad, populate, clearEcosystem, teardownWorld, newEcosystem, loadIntroScene), the frame loop (frame,
// drawEcosystem), visibility and resize, and the start sequence at the end (binds in the original listener order).
// May import: three (importmap) and src/1 to src/8.
//
// MODULE MAP (imports point down only; files 1 to 8 declare, main starts):
//   1-config.js        tunable tables and derived constants; pure data, no imports
//   2-core.js          math, grids, ring geometry, solar math, the loop object (wake, invalidate)
//   3-gfx-io.js        renderer, scene, buffer helpers, culling | Nominatim, Overpass, city files, terrain, parsers
//   4-provider.js      the active world provider slot, ground and water queries, provider version
//   5-collision.js     walls, shells, occupancy, cover, spawn checks, isOpen
//   6-worlds.js        city and wilderness construction, providers (CityWorld, WildernessWorld, IntroWorld)
//   7-sim.js           brains, Animal, Plant, Ecosystem, simSky
//   8-render-player-game.js  renderers, human rig, sky, rain, graphics; player, input, car, cat, VR; game
//   9-main.js          this file
// Placement per identifier (INVENTORY.md section 9), plan and decisions: INVENTORY.md.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import {
  MAP_SIZE_SCALES, WORLD_SIZES, CITY_LADDER, EYE_HEIGHT, FEATURES_VERSION, ELEV_MARGIN, CITY_STEPS, WILDERNESS_STEPS,
  LOW_RENDER_FPS, HIGH_LABEL_TICKS, LOW_LABEL_TICKS, HIGH_HUD_TICKS, LOW_HUD_TICKS, LOW_WATER_FPS, CITY_FILE_RADIUS,
  NPC_TICK_S, NPC_DEER_POPULATION, NPC_TYPE_IDS, HUMAN_TYPE_ID, NPC_BODY_R, CONFIG, DEFAULT_SEED, MIX_BLEND,
  MIX_HABITAT, TIMES, SKIES, DEBUG_PROBE_LAYER, DEBUG_PROBE_PX, NPC_TICK_SLACK, PICKS
} from './1-config.js';
import {
  fmt, loop, wake, invalidate
} from './2-core.js';
import {
  renderer, scene, camera, viewPos, viewQuat, hemi, sun, moon, resetGroundPlane, msaa, perf, geocode, fetchBuildings,
  cityFileFor, fetchCityFile, makeProjector, featuresFrom, fetchTerrain
} from './3-gfx-io.js';
import {
  providers, _surf, groundAt
} from './4-provider.js';
import {
  resetObstacles, resolveCollisions, cover, occ, streetSpawn, outdoorSpawn
} from './5-collision.js';
import {
  groundMatch, layers, clearLayers, buildCity, elevation, buildTerrainBase, waterClip, indoorClip, cityWater,
  lampLight, streets, paintSlope, clearWildLayers, shelters, wildWater, pebbles, CityWorld, WildernessWorld,
  INTRO_SCENE, IntroWorld
} from './6-worlds.js';
import {
  personInfoFields, plantView, ecosystem, simSky
} from './7-sim.js';
import {
  dotEl, knobEl, climbEl, npcOnScreen, foodBoxView, povEl, raysEl, gfxEl, avgFpsEl, pov, vr, graphics, cat, labels,
  visionRays, animalRenderer, plantRenderer, blobShadows, game, bindInventory, healthBars, player, keys, play,
  lastPointerType, bindKeys, bindMouseLook, crouchY, stance, touchKnob, bindTouch, flying, toggleFly, car, chaseCam,
  facePlayer, placeCar, parkBesideCabin, bindCar, updateCarButton, setPlayerInCar, skyChoice, skyInstant, conditions,
  playerStep, movementHeld, avgFps, clockText, placeSkyBodies, skyFade, updateSky, rainClock, disposeRain, rainTick,
  rainAnimating, populationText
} from './8-render-player-game.js';

// the core frame loop draws with this file's frame (wake() schedules loop.frame)
loop.frame = frame;
// the sim's sky clock redraws the sky and the HUD minute through these
simSky.onSkyStep = updateSky;
simSky.onMinute = refreshHud;

let storedPlace = localStorage.getItem('lastPlace') ? JSON.parse(localStorage.getItem('lastPlace')) : null;
if (storedPlace) {
  document.getElementById('addr').value = storedPlace.label;
}
let worldSize = 'medium';

// The chosen size as { scale, people, ladder }. Custom takes the map size level and people count from its sliders.
function worldSizeChoice() {
  const custom = worldSize === 'custom';
  const mapSize = custom ? parseInt(document.getElementById('size').value, 10) : WORLD_SIZES[worldSize].mapSize;
  const people = custom ? parseInt(document.getElementById('people').value, 10) : WORLD_SIZES[worldSize].people;
  return { scale: MAP_SIZE_SCALES[mapSize - 1], people, ladder: CITY_LADDER };
}


const panel = document.getElementById('panel');
const addrEl = document.getElementById('addr');
const goEl = document.getElementById('go');
const statEl = document.getElementById('status');
const hudEl = document.getElementById('hud');
const gearEl = document.getElementById('gear');
const settingsEl = document.getElementById('settings');
const timesEl = document.getElementById('times');
const skiesEl = document.getElementById('skies');

function say(msg, isError) {
  statEl.textContent = msg;
  statEl.className = isError ? 'error' : '';
}

// LOADING STEPS: one row per load() stage, parallel fetches can be active together (wait, active, done, off, error).
const cardEl = document.getElementById('card');
const stepsEl = document.getElementById('steps');

const steps = {
  rows: {}, t0: {}, timer: 0,

  reset(list) {
    stepsEl.textContent = '';
    this.rows = {}; this.t0 = {};
    for (const [id, name, what] of list) {
      const li = document.createElement('li');
      li.className = 'wait';
      li.innerHTML = '<span class="mark"></span><span class="name"></span><span class="time"></span><span class="detail"></span>';
      li.querySelector('.name').textContent = name;
      li.querySelector('.detail').textContent = what;
      stepsEl.appendChild(li);
      this.rows[id] = li;
    }
    stepsEl.hidden = false;
    cardEl.classList.add('loading');
    clearInterval(this.timer);
    this.timer = setInterval(() => this.tick(), 100);
  },

  set(id, state, detail) {
    const li = this.rows[id];
    if (!li) return;
    if (state === 'active' && !this.t0[id]) this.t0[id] = performance.now();
    li.className = state;
    if (detail != null) li.querySelector('.detail').textContent = detail;
    if (state !== 'active' && state !== 'wait' && this.t0[id]) this.stamp(id);
  },
  start(id, detail) { this.set(id, 'active', detail); },
  note(id, detail) { const li = this.rows[id]; if (li) li.querySelector('.detail').textContent = detail; },
  done(id, detail) { this.set(id, 'done', detail); },
  off(id, detail) { this.set(id, 'off', detail); },
  error(id, detail) { this.set(id, 'error', detail); },

  stamp(id) {
    const s = (performance.now() - this.t0[id]) / 1000;
    this.rows[id].querySelector('.time').textContent = `${s.toFixed(1)} s`;
  },
  tick() {
    for (const id in this.rows) if (this.rows[id].className === 'active') this.stamp(id);
  },

  // load ended: stop the clock; a failed load leaves the list showing where it stopped
  finish(ok) {
    clearInterval(this.timer);
    cardEl.classList.remove('loading');
    if (ok) stepsEl.hidden = true;
    else for (const id in this.rows) if (this.rows[id].className === 'active') this.set(id, 'off');
  }
};

// Let a row's change reach the screen before synchronous work blocks it.
const paint = () => new Promise(r => requestAnimationFrame(() => setTimeout(r, 0)));
document.body.appendChild(renderer.domElement);

addEventListener('resize', () => {
  if (renderer.xr.isPresenting) return;
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
  invalidate();
});
renderer.domElement.addEventListener('webglcontextrestored', () => invalidate());
const vitalsEl = document.getElementById('vitals');
const hudBtnEl = document.getElementById('hudbtn');
const fsEl = document.getElementById('fs');
const newEcoEl = document.getElementById('neweco');
const tintEl = document.getElementById('water-tint');

// The intro scene behind the intro card, until a world loads (teardownWorld clears it like any world).
function loadIntroScene() {
  teardownWorld();
  const iw = new IntroWorld();
  iw.build();
  providers.active = iw;
  populate(iw);
  const tz = -new Date().getTimezoneOffset();
  simSky.site = { lat: 40, lon: tz / 60 * 15, offset: tz * 60 };
  iw.prevHour = simSky.hour;
  iw.clock = simSky;   // the clock whose hour teardown gives back
  simSky.hour = INTRO_SCENE.hour;
  updateSky();
  player.pos.set(0, EYE_HEIGHT, 0);
  player.vel.set(0, 0, 0);
  facePlayer(0, INTRO_SCENE.eye.pitch);
  graphics.apply();
  wake();
}
// the sim's plants report to this renderer
plantView.add = p => plantRenderer.add(p);
plantView.remove = p => plantRenderer.remove(p);
plantView.touch = p => plantRenderer.touch(p);

// the game's hooks into the sim: Survivor rules after each tick's contacts; the avatar the animals sense and hunt
ecosystem.afterContacts.push(dt => game.update(dt));
ecosystem.avatar = game.avatar;
bindInventory();   // its listeners, in their original place among main's
document.getElementById('runNew').addEventListener('click', e => {
  e.currentTarget.blur();
  newEcosystem();   // back to the intro's loading view, which hides the summary
});

bindKeys();   // its listeners, in their original place among main's

renderer.domElement.addEventListener('pointerdown', e => {
  if (e.pointerType !== 'mouse') return;
  if (!panel.classList.contains('hidden')) return;
  renderer.domElement.requestPointerLock();
});

document.addEventListener('pointerlockchange', () => {
  play.locked = document.pointerLockElement === renderer.domElement;
  if (!play.locked) keys.clear();
  // Esc releasing pointer lock never reaches the page, so losing the lock opens settings.
  if (!play.locked && play.active && !game.dead) setSettingsOpen(true);
  wake();
});
bindMouseLook();   // its listeners, in their original place among main's

function returnToIntro() {
  if (!play.active) return;
  if (play.locked) document.exitPointerLock();
  play.active = false;
  dotEl.classList.remove('on');
  panel.classList.remove('hidden');
  showControls(false);
}

// Escape toggles the settings sheet (while the pointer is locked, Esc only releases it, which opens the sheet)
addEventListener('keydown', e => {
  if (e.code === 'Escape' && !e.repeat && !play.locked && play.active) setSettingsOpen(!settingsEl.classList.contains('on'));
});
bindTouch();   // its listeners, in their original place among main's

bindCar();   // its listeners, in their original place among main's

function chips(host, names, pick) {
  for (const name of names) {
    const b = document.createElement('button');
    b.textContent = name;
    b.addEventListener('click', () => {
      pick(name);
      for (const other of host.children) other.classList.toggle('sel', other === b);
      b.blur();
      updateSky();
      refreshHud();
    });
    if (name === 'Game') b.classList.add('sel');
    host.appendChild(b);
  }
}

chips(timesEl, TIMES, n => { skyChoice.time = n; });
chips(skiesEl, Object.keys(SKIES), n => { skyChoice.sky = n; });

document.getElementById('tomenu').addEventListener('click', e => {
  e.currentTarget.blur();
  returnToIntro();
});

// open or close the settings sheet; the gear becomes its close X, and closing resumes the paused world
function setSettingsOpen(open) {
  const wasOpen = settingsEl.classList.contains('on');
  settingsEl.classList.toggle('on', open);
  gearEl.classList.toggle('open', open);
  gearEl.setAttribute('aria-label', open ? 'Close settings' : 'Settings');
  if (wasOpen && !open) wake();
}

gearEl.addEventListener('click', () => {
  setSettingsOpen(!settingsEl.classList.contains('on'));
  gearEl.blur();
});

// VIEW AND ECOSYSTEM SETTINGS (the Arena's panel rows, as chips)
povEl.addEventListener('click', () => { pov.cycle(); povEl.blur(); });
raysEl.addEventListener('click', () => { labels.toggleRayVis(); raysEl.blur(); invalidate(); });
vitalsEl.addEventListener('click', () => {
  healthBars.setEnabled(!healthBars.enabled);
  vitalsEl.classList.toggle('sel', healthBars.enabled);
  vitalsEl.setAttribute('aria-pressed', String(healthBars.enabled));
  vitalsEl.blur();
  invalidate();
});

// DEBUG (settings): a copyable readout of the GPU, the people renderer and recent errors, refreshed each second while shown.
const debugEl = document.getElementById('debug');
const debugInfoEl = document.getElementById('debuginfo');
const DEBUG_PROBE_BG = new THREE.Color(1, 0, 1);   // magenta clear, so any drawn texel counts
const debugErrors = [];                            // the last few script errors since load
const debugError = msg => { debugErrors.push(msg); if (debugErrors.length > 5) debugErrors.shift(); };
addEventListener('error', e => debugError(`${e.message} (line ${e.lineno})`));
addEventListener('unhandledrejection', e => debugError('unhandled: ' + (e.reason && e.reason.message || e.reason)));

const debugReadout = {
  timer: 0,
  baseRender: null,     // renderer.render as the game set it up; wrapped only while Debug is on
  mainCalls: -1,        // the last frame's main-scene draw calls and triangles (-1: none drawn yet)
  mainTris: 0,
  linked: new Map(),    // program id -> { ok, log }
  probe: null,

  show(on) {
    debugInfoEl.hidden = !on;
    debugEl.classList.toggle('sel', on);
    debugEl.setAttribute('aria-pressed', String(on));
    clearInterval(this.timer);
    if (!this.baseRender) this.baseRender = renderer.render;
    if (!on) { renderer.render = this.baseRender; return; }
    const base = this.baseRender, self = this;
    renderer.render = function (s, c) {
      base.call(this, s, c);
      if (s === scene) { self.mainCalls = renderer.info.render.calls; self.mainTris = renderer.info.render.triangles; }
    };
    this.refresh();
    this.timer = setInterval(() => this.refresh(), 1000);
  },

  glErrors() {
    const gl = renderer.getContext(), out = [];
    let e;
    while ((e = gl.getError()) !== gl.NO_ERROR && out.length < 4) out.push('0x' + e.toString(16));
    return out.join(' ') || 'none';
  },

  // link status and logs read from GL once per program, so the game can keep three's own checks off
  link(p) {
    let r = this.linked.get(p.id);
    if (!r) {
      const gl = renderer.getContext(), ok = !!gl.getProgramParameter(p.program, gl.LINK_STATUS);
      const log = ok ? '' : [gl.getProgramInfoLog(p.program), ...(gl.getAttachedShaders(p.program) || []).map(sh => gl.getShaderInfoLog(sh))]
        .filter(Boolean).join(' | ').slice(0, 1500);
      this.linked.set(p.id, r = { ok, log });
    }
    return r;
  },

  programInfo(mat) {
    const p = renderer.properties.get(mat).currentProgram;
    if (!p) return 'not compiled yet';
    const r = this.link(p);
    return `program ${p.id}, linked ${r.ok ? 'yes' : 'NO: ' + r.log}, inputs ` +
      Object.entries(p.getAttributes()).map(([k, v]) => `${k}@${v.location}`).join(' ');
  },

  // draw only the detailed (near) people from the live camera into a small target and count what lands
  runProbe(n) {
    if (n === 0) return 'Probe: no detailed people to draw this tick';
    if (renderer.xr.isPresenting) return 'Probe: skipped in VR';
    if (sun.shadow.needsUpdate) return 'Probe: skipped while the shadow map redraws';
    if (!this.probe) {
      animalRenderer.human.mesh.layers.enable(DEBUG_PROBE_LAYER);
      for (const l of [hemi, sun, moon]) l.layers.enable(DEBUG_PROBE_LAYER);
      this.probe = {
        target: new THREE.WebGLRenderTarget(DEBUG_PROBE_PX, DEBUG_PROBE_PX), cam: new THREE.PerspectiveCamera(),
        px: new Uint8Array(DEBUG_PROBE_PX * DEBUG_PROBE_PX * 4)
      };
    }
    const { target, cam, px } = this.probe;
    cam.copy(camera, false);
    cam.layers.set(DEBUG_PROBE_LAYER);
    cam.updateMatrixWorld();
    // the same output encoding as the real frame, so the probe uses the same shader variant
    target.texture.colorSpace = graphics.high ? THREE.NoColorSpace : THREE.SRGBColorSpace;
    const bg = scene.background, prevTarget = renderer.getRenderTarget();
    scene.background = DEBUG_PROBE_BG;
    this.glErrors();
    renderer.setRenderTarget(target);
    this.baseRender.call(renderer, scene, cam);
    renderer.readRenderTargetPixels(target, 0, 0, DEBUG_PROBE_PX, DEBUG_PROBE_PX, px);
    renderer.setRenderTarget(prevTarget);
    scene.background = bg;
    let drawn = 0;
    for (let i = 0; i < px.length; i += 4) if (!(px[i] > 235 && px[i + 1] < 20 && px[i + 2] > 235)) drawn++;
    return `Probe (detailed people only, your camera, ${DEBUG_PROBE_PX}x${DEBUG_PROBE_PX}): ${drawn} px drawn, GL errors ${this.glErrors()}`;
  },

  refresh() {
    // only while the settings sheet shows it, and held still while you select
    if (!settingsEl.classList.contains('on') || document.activeElement === debugInfoEl) return;
    const lines = [];
    try {
      const gl = renderer.getContext(), ext = gl.getExtension('WEBGL_debug_renderer_info');
      const size = renderer.getDrawingBufferSize(new THREE.Vector2());
      const yn = b => (b ? 'yes' : 'no'), f3 = a => Array.from(a, v => +v.toFixed(3)).join(', ');
      lines.push(`Nova Orbis debug, ${new Date().toISOString()}`,
        `GPU: ${ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER)} | ${gl.getParameter(gl.VERSION)} | context lost: ${yn(gl.isContextLost())}`,
        `Browser: ${navigator.userAgent}`,
        `Screen: ${innerWidth}x${innerHeight} css, dpr ${devicePixelRatio}, render scale ${renderer.getPixelRatio()}, buffer ${size.x}x${size.y}`,
        `Limits: attributes ${gl.getParameter(gl.MAX_VERTEX_ATTRIBS)}, texture units ${gl.getParameter(gl.MAX_TEXTURE_IMAGE_UNITS)}, MSAA ${renderer.capabilities.maxSamples}`,
        `Graphics: ${graphics.high ? 'high' : 'low'} | shadow map ${renderer.shadowMap.enabled ? 'on' : 'off'} | world ${providers.active ? providers.active.kind : 'none'}`,
        `Main render: ${this.mainCalls < 0 ? 'no frame drawn since Debug was turned on' : `${this.mainCalls} draw calls, ${this.mainTris} triangles in the last frame`}`,
        `GL errors since last refresh: ${this.glErrors()}`);
      if (ecosystem.ready) {
        const H = animalRenderer.human, g = H.geometry, n = g.instanceCount;
        let alive = 0, near = Infinity, nearest = null;
        for (const a of ecosystem.animals) {
          if (!a.alive || a.typeId !== HUMAN_TYPE_ID) continue;
          alive++;
          const d = Math.hypot(a.position.x - viewPos.x, a.position.z - viewPos.z);
          if (d < near) { near = d; nearest = a; }
        }
        const p = nearest && nearest.position;
        lines.push(`People: ${alive} alive, ${n} detailed and ${animalRenderer.passById[HUMAN_TYPE_ID].billboarded} billboards drawn this tick, nearest ` +
          (p ? `${near.toFixed(1)} m, on screen ${yn(npcOnScreen(p.x, p.y, p.z, NPC_BODY_R))}` : 'none'),
          `People mesh: in scene ${yn(H.mesh.parent === scene)}, visible ${yn(H.mesh.visible)}, instance count ${n}, max ${g._maxInstanceCount ?? 'unset'}`,
          `Slot 0: pose [${f3(H.pose.array.subarray(0, 4))}] gait [${f3(H.gait.array.subarray(0, 4))}] look [${f3(H.look.array.subarray(0, 4))}]`,
          'People shader (lit): ' + this.programInfo(H.mesh.material),
          'People shader (shadow): ' + this.programInfo(H.mesh.customDepthMaterial));
        let failed = 0;
        for (const prog of renderer.info.programs) {
          const r = this.link(prog);
          if (!r.ok) { failed++; lines.push(`FAILED program ${prog.id} (${prog.name}): ${r.log}`); }
        }
        lines.push(`Shaders: ${renderer.info.programs.length} programs, ${failed} failed to link`, this.runProbe(n));
        const rig = t => animalRenderer.meshes[t] ? `near ${animalRenderer.meshes[t].body.count}, billboards ${animalRenderer.passById[NPC_TYPE_IDS[t]].billboarded}` : 'none';
        lines.push(`Deer drawn: ${rig('deer')} | Coyotes drawn: ${rig('coyote')}`);
      } else lines.push('World: not loaded yet');
    } catch (e) {
      lines.push('Readout error: ' + e.message);
    }
    lines.push('Script errors: ' + (debugErrors.length ? '\n  ' + debugErrors.join('\n  ') : 'none'));
    debugInfoEl.value = lines.join('\n');
  }
};

debugEl.addEventListener('click', () => {
  debugReadout.show(debugInfoEl.hidden);
  debugEl.blur();
});
debugInfoEl.addEventListener('focus', () => debugInfoEl.select());                // one tap selects it all for copying
debugInfoEl.addEventListener('contextmenu', e => e.stopPropagation());           // keeps the long-press copy menu while playing
debugInfoEl.addEventListener('keydown', e => { if (e.code !== 'Escape') e.stopPropagation(); });   // keys here do not steer the player
// HUD off: the Arena's clearHud (text, crosshair, vitals and vision rays hide together)
let hudOn = true, raysBeforeHud = 'single';
function setHud(on) {
  if (on === hudOn) return;
  hudOn = on;
  document.body.classList.toggle('hud-off', !hudOn);
  hudBtnEl.classList.toggle('sel', hudOn);
  hudBtnEl.setAttribute('aria-pressed', String(hudOn));
  healthBars.setEnabled(hudOn);
  vitalsEl.classList.toggle('sel', hudOn);
  if (!hudOn) { raysBeforeHud = labels.rayVisMode; labels.setRayVis('off'); }
  else labels.setRayVis(raysBeforeHud);
  invalidate();
}
hudBtnEl.addEventListener('click', () => { setHud(!hudOn); hudBtnEl.blur(); });
gfxEl.addEventListener('click', () => { graphics.toggle(); gfxEl.blur(); });
function fullscreenElement() { return document.fullscreenElement || document.webkitFullscreenElement || null; }
// entering fullscreen also locks landscape where the device can (the lock needs fullscreen); skipped elsewhere
const so = screen.orientation;
const canLock = !!(so && typeof so.lock === 'function' && matchMedia('(pointer: coarse)').matches);   // desktop Chrome has lock() but always rejects it
fsEl.addEventListener('click', () => {
  fsEl.blur();
  const exit = document.exitFullscreen || document.webkitExitFullscreen;
  if (fullscreenElement()) { if (exit) Promise.resolve(exit.call(document)).catch(() => { }); return; }
  const root = document.documentElement;
  const req = root.requestFullscreen || root.webkitRequestFullscreen;
  if (req) Promise.resolve(req.call(root)).then(() => { if (canLock) return so.lock('landscape'); }).catch(() => { });
});
const syncFullscreen = () => {
  const on = !!fullscreenElement();
  fsEl.classList.toggle('sel', on);
  fsEl.setAttribute('aria-pressed', String(on));
};
document.addEventListener('fullscreenchange', syncFullscreen);
document.addEventListener('webkitfullscreenchange', syncFullscreen);
newEcoEl.addEventListener('click', () => { newEcoEl.blur(); newEcosystem(); });

function showControls(on) {
  game.showPanel(on);
  climbEl.classList.toggle('on', on && flying);
  gearEl.classList.toggle('on', on);
  if (!on) setSettingsOpen(false);
  updateCarButton();
}
const drawnPos = new THREE.Vector3(NaN, NaN, NaN);
let drawnYaw = NaN, drawnPitch = NaN, drawnCrouch = NaN;
// low-power frame cap: a draw wanted inside the cap waits for the next allowed frame (sim ticks are unaffected)
let drawPending = false, drawnAt = -1e9;
// Graphics low: when the water-flow offsets last advanced (see LOW_WATER_FPS)
let waterAt = -1e9;
let npcAcc = 0;
let npcElapsed = 0;

// drawn frames in the current one-second window; Observer mode shows the rate on the HUD
let fpsFrames = 0, fpsAt = 0;
let hudFps = 0;

// One sim tick drawn: the renderers, labels, rays and HUD read the tick before endTick advances its clock (they ran
// at the end of step before).
function drawEcosystem(dt) {
  animalRenderer.update(ecosystem.animals, dt);
  blobShadows.update(ecosystem.animals);
  foodBoxView.render();
  plantRenderer.update(ecosystem.plants);
  healthBars.update(ecosystem.animals);
  if (ecosystem.ticks % (perf.lowPower ? LOW_LABEL_TICKS : HIGH_LABEL_TICKS) === 0) labels.updateTarget();
  visionRays.update(ecosystem.animals);
  if (ecosystem.populationChanged()) refreshHud();
  if (ecosystem.ticks % (perf.lowPower ? LOW_HUD_TICKS : HIGH_HUD_TICKS) === 0) refreshHud();
}

function frame(now) {
  loop.rafId = 0;
  const xr = renderer.xr.isPresenting;
  // settings open: the world is paused (no sim time passes, the loop sleeps); only a change made in the sheet redraws
  if (!xr && settingsEl.classList.contains('on')) {
    loop.last = -1;
    simSky.lastNow = 0;
    if (loop.sceneDirty) {
      placeSkyBodies();
      graphics.update(now);
      if (graphics.high) msaa.render();
      else renderer.render(scene, camera);
      loop.sceneDirty = false;
    }
    return;
  }
  // first frame after a sleep: no elapsed time to integrate
  const resumed = loop.last < 0;
  const dt = resumed ? 0 : Math.min(Math.max((now - loop.last) / 1000, 0), 0.05);
  // a fresh fps window after a sleep or pause, so the time asleep is not counted as slow frames
  if (resumed) { fpsFrames = 0; fpsAt = now; }
  else avgFps.ms += now - loop.last;
  loop.last = now;
  if (xr) vr.poll(dt);
  playerStep(dt);
  camera.updateMatrixWorld();
  camera.getWorldPosition(viewPos);
  camera.getWorldQuaternion(viewQuat);
  if (providers.active) cat.update(dt);
  simSky.update(now);
  skyFade.tick(now);

  const rainDue = rainTick(dt, now);
  const npcLive = ecosystem.ready && ecosystem.animals.length > 0;
  let npcDue = false;
  if (npcLive) {
    npcAcc += dt;
    npcElapsed += dt;
    if (npcAcc >= NPC_TICK_S - NPC_TICK_SLACK) {
      npcDue = ecosystem.step(npcElapsed);
      // draw the tick, then advance its clock; a provider that drives its own walkers (the intro) has already ticked and
      // only moves them, so only they are drawn
      if (npcDue && providers.active && providers.active.drive) { animalRenderer.update(ecosystem.animals, npcElapsed); blobShadows.update(ecosystem.animals); }
      else if (npcDue) { drawEcosystem(npcElapsed); ecosystem.endTick(); }
      // carry the remainder, but bank at most one tick (no catch-up burst)
      npcAcc = Math.max(-NPC_TICK_SLACK, Math.min(npcAcc - NPC_TICK_S, NPC_TICK_S));
      npcElapsed = 0;
    }
  }
  const posed = !player.pos.equals(drawnPos) || player.yaw !== drawnYaw || player.pitch !== drawnPitch ||
    crouchY !== drawnCrouch;
  const wantDraw = xr || posed || loop.sceneDirty || rainDue || npcDue || drawPending;
  const capped = !xr && !graphics.high && now - drawnAt < 1000 / LOW_RENDER_FPS - NPC_TICK_SLACK * 1000;
  drawPending = wantDraw && capped;
  // the touch knob moves with the drawn frames on low (a capped frame leaves it dirty for the next draw)
  if (touchKnob.dirty && !capped) {
    knobEl.style.transform = `translate(${touchKnob.dx}px, ${touchKnob.dy}px)`;
    touchKnob.dirty = false;
  }
  if (wantDraw && !capped) {
    drawnAt = now;
    placeSkyBodies();
    if (graphics.high || now - waterAt >= 1000 / LOW_WATER_FPS) {
      waterAt = now;
      wildWater.update(now * 0.001);
    }
    graphics.update(now);
    // the view under a water surface is tinted (the Arena's water-tint)
    if (providers.active) {
      providers.active.surface(viewPos.x, viewPos.z, _surf);
      tintEl.classList.toggle('on', _surf.dip < 0 && viewPos.y < _surf.base);
    }
    if (graphics.high && !xr) msaa.render();
    else renderer.render(scene, camera);
    drawnPos.copy(player.pos); drawnYaw = player.yaw; drawnPitch = player.pitch; drawnCrouch = crouchY;
    loop.sceneDirty = false;
    rainClock.drawn = now;
    fpsFrames++;
    avgFps.frames++;
  }
  if (now - fpsAt >= 1000) {
    const fps = Math.round(fpsFrames * 1000 / (now - fpsAt));
    if (game.on) avgFps.show();
    else if (fps !== hudFps) { hudFps = fps; refreshHud(); }
    if (xr) vr.updateHud();
    fpsFrames = 0; fpsAt = now;
  }
  if (xr) return;

  // falling rain and live NPCs keep the loop awake
  const settled = !posed && (player.grounded || flying || player.inCar) && player.vel.y === 0 &&
    car.speed === 0 && !chaseCam.settling && !cat.boarding && !stance.squatting;
  if (settled && !drawPending && !movementHeld() && !rainAnimating() && !npcLive && !simSky.on && !skyFade.fading) {
    loop.last = -1;
    return;
  }
  // a redraw requested during this frame (invalidate -> wake) may have scheduled the next one already
  if (!loop.rafId) loop.rafId = requestAnimationFrame(frame);
}

// another tab or a minimised window: the game stops outright and picks up where it left off on return
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    if (loop.rafId) { cancelAnimationFrame(loop.rafId); loop.rafId = 0; }
    loop.last = -1;
    simSky.lastNow = 0;
  } else wake();
});
wake();


let hudPlace = '';
let hudBuildings = 0;

function refreshHud() {
  if (!providers.active || providers.active.hud === false) { perf.setText(hudEl, ''); return; }
  let head;
  if (!providers.active.city) head = `Wilderness, seed ${providers.active.seed}`;
  else {
    head = `${fmt(hudBuildings)} buildings ${hudPlace}`;
    head += `, wilderness seed ${providers.active.seed}`;
  }
  // last line: time and conditions, then (Observer) the player's stats, comma-separated like the rest of the HUD
  const c = conditions(), info = game.on ? -1 : pov.infoKey();
  const sky = simSky.site ? `${clockText(skyInstant())}${c ? '  ' + c.label : ''}` : '';
  const last = [sky, ...(info >= 0 ? personInfoFields(info, pov.sex) : [])].filter(Boolean).join(', ');
  const fps = !game.on && hudFps ? `, ${hudFps} fps` : '';
  perf.setText(hudEl, head + '\n' + populationText() + fps + (last ? '\n' + last : ''));
}

// LOAD

let busy = false;
let lastTerrain = null;
let lastQuery = '';
let startMode = 'city';

const seedEl = document.getElementById('seed');
const sizeBtns = [...document.querySelectorAll('.sizebtn')];
const sizeEl = document.getElementById('size');
const sizeOutEl = document.getElementById('sizeOut');
const peopleEl = document.getElementById('people');
const peopleOutEl = document.getElementById('peopleOut');
const customRowEl = document.getElementById('customrow');
const startGoEl = document.getElementById('startgo');

function seedValue() {
  return seedEl.value || DEFAULT_SEED;
}

// A new population on `provider`: the player's state and body, the renderers ready before the first plant, the sim's
// own spawn, then its instance data and the HUD (the order initialize ran them in, renderer init moved ahead of it).
function populate(provider) {
  game.reset();
  // each spawned world gives the player a new random body
  pov.newBody();
  animalRenderer.init();
  plantRenderer.init(provider.bounds);
  ecosystem.initialize(provider);
  // write instance data now so compileAsync warms the instance-colour shader
  animalRenderer.update(ecosystem.animals, 0);
  blobShadows.update(ecosystem.animals);
  foodBoxView.render();
  plantRenderer.update(ecosystem.plants);
  if (ecosystem.populationChanged()) refreshHud();
}

// The ecosystem emptied, and its renderers and HUD with it (what clear drew before).
function clearEcosystem() {
  ecosystem.clear();
  animalRenderer.update(ecosystem.animals, 0);
  blobShadows.update(ecosystem.animals);
  plantRenderer.rebuild(ecosystem.plants);
  plantRenderer.update(ecosystem.plants);
  healthBars.update(ecosystem.animals);
  if (ecosystem.populationChanged()) refreshHud();
}

// Everything the last world built: its provider's layers, the city's, the obstacle index, the population and sky.
function teardownWorld() {
  clearEcosystem();
  if (providers.active && providers.active.teardown) providers.active.teardown();
  providers.active = null;
  clearLayers();
  clearWildLayers();
  wildWater.reset();
  pebbles.reset();
  shelters.reset();
  resetObstacles();
  occ.reset();
  cityWater.reset();
  waterClip.reset();
  indoorClip.reset();
  streets.reset();
  cover.reset();
  lampLight.reset();
  elevation.reset();
  resetGroundPlane();
  simSky.stop();
  skyFade.reset();
  simSky.site = null;
  disposeRain();
  cat.reset();
  car.reset();
  labels.reset();
  hudPlace = ''; hudBuildings = 0;
  providers.version++;
  graphics.apply();
}

function setBusy(on) {
  busy = on;
  goEl.disabled = startGoEl.disabled = on;
  for (const b of picksEl.children) b.disabled = on;
}

// Shared tail of every load: warm the shaders, then hand the world to the player.
async function finishLoad(provider) {
  steps.start('scene');
  await paint();
  cat.place(provider.companion);
  labels.setRayVis(hudOn ? provider.rays : 'off');
  raysBeforeHud = provider.rays;
  graphics.apply();
  camera.position.copy(player.pos);
  camera.rotation.set(player.pitch, player.yaw, 0, 'YXZ');
  camera.updateMatrixWorld();
  camera.getWorldPosition(viewPos);
  camera.getWorldQuaternion(viewQuat);
  try {
    // compile for where the scene will be drawn (high graphics draws into the MSAA target, a different variant)
    if (graphics.high && !renderer.xr.isPresenting) renderer.setRenderTarget(msaa.ensure());
    try { await renderer.compileAsync(scene, camera); } finally { renderer.setRenderTarget(null); }
    for (const m of layers) if (m.material && m.material.map) renderer.initTexture(m.material.map);
  } catch (e) {
    // warm-up only: the scene still draws, compiling on first use
    console.warn('Shader warm-up failed:', e);
  }
  refreshHud();
  steps.done('scene');
  steps.finish(true);
  const wantGame = await chooseMode();
  if (wantGame !== game.on) gameEl.click();
  simSky.start();
  syncSkyset();
  if (randomSky) {
    // New ecosystem: a random hour and weather for the game's sky, and a random preset of each for Observer
    randomSky = false;
    simSky.randomize();
    for (const host of [timesEl, skiesEl]) {
      host.children[1 + Math.floor(Math.random() * (host.children.length - 1))].click();   // 0 is Game
    }
  }
  updateSky();
  panel.classList.add('hidden');
  showControls(true);
  say('');
  play.active = true;
  dotEl.classList.add('on');
  if (lastPointerType === 'mouse') renderer.domElement.requestPointerLock();
  invalidate();
}

// WILD: the Arena's world from a seed; CITY OFF: the same wilderness with no city in the middle. Nothing is downloaded.
async function loadWilderness(seed) {
  if (busy) return;
  setBusy(true);
  say('');
  steps.reset(WILDERNESS_STEPS);
  let current = 'terrain';
  const o = { ...loadOpts };
  try {
    teardownWorld();
    const sizeChoice = worldSizeChoice();
    CONFIG.applySize(sizeChoice.scale, sizeChoice.people);
    const w = new WildernessWorld(null, seed, o);

    steps.start('terrain', `Seed ${seed}, map size ${CONFIG.scale}…`);
    await paint();
    w.terrainStep();
    providers.active = w;
    const b = w.bounds;
    steps.done('terrain', `${Math.round(b.maxX - b.minX)} \u00d7 ${Math.round(b.maxZ - b.minZ)} m of land from seed ${seed}.`);

    current = 'water';
    steps.start('water');
    await paint();
    w.waterStep();
    steps.done('water', `${w.locations.length} shore points where the water can be seen.`);

    current = 'cabins';
    steps.start('cabins');
    await paint();
    w.cabinStep();
    const [groveTrees, groves] = w.treeStep();
    steps.done('cabins', `${w.cabins.length} cabins, ${fmt(groveTrees)} trees in ${fmt(groves)} groves, ` +
      `${fmt(pebbles.data.length)} pebbles.`);

    current = 'people';
    const plan = w.population();
    const planned = t => plan.reduce((n, g) => n + (g.type === t ? g.count : 0), 0);
    steps.start('people', `Spawning up to ${fmt(planned('human'))} people, ${fmt(planned('coyote'))} coyotes, ` +
      `${fmt(planned('deer'))} deer and ${fmt(planned('plant'))} plants…`);
    await paint();
    populate(w);
    const made = { human: 0, coyote: 0, deer: 0 };
    for (const a of ecosystem.animals) made[a.type]++;
    steps.done('people', `${fmt(made.human)} people, each with a two-lobe brain; ${fmt(made.coyote)} coyotes and ` +
      `${fmt(made.deer)} deer; ${fmt(ecosystem.plants.length)} plants.`);

    // no place: this device's time zone places the sun
    const tz = -new Date().getTimezoneOffset();
    simSky.site = { lat: 40, lon: tz / 60 * 15, offset: tz * 60 };
    updateSky();

    setPlayerInCar(false);
    const st = w.playerStart();
    player.pos.set(st.x, st.y + EYE_HEIGHT, st.z);
    player.vel.set(0, 0, 0);
    facePlayer(st.yaw, -0.3);
    player.grounded = false;
    if (o.car && !parkBesideCabin(w.cabins[0], st.yaw)) placeCar([], player.pos.x, player.pos.z);

    current = 'scene';
    await finishLoad(w);
  } catch (err) {
    console.error(err);
    steps.error(current, err.message || String(err));
    steps.finish(false);
    say(`Failed to build the world. ${err.message || String(err)}`, true);
  }
  setBusy(false);
}

// CITY ON: the city's load, then the wilderness grown around the finished city before the population.
async function loadPlace(query) {
  if (busy || !query.trim()) return;
  setBusy(true);
  say('');
  steps.reset(CITY_STEPS);
  let current = 'address';
  const o = { ...loadOpts };
  const seed = seedValue();
  lastQuery = query;

  try {
    teardownWorld();
    const sizeChoice = worldSizeChoice(), ladder = sizeChoice.ladder;
    CONFIG.applySize(sizeChoice.scale, sizeChoice.people);

    // The saved label is Nominatim's own, so re-submitting it skips the geocoder.
    const reuse = storedPlace && storedPlace.v === FEATURES_VERSION &&
      query.trim() === storedPlace.label;
    // a suggested place carries its own coordinates, so it needs no geocoder either
    const pick = cityFileFor(query);
    let place;
    if (pick) {
      place = { lat: pick.lat, lon: pick.lon, label: pick.label };
      steps.done('address', 'Suggested place, no lookup needed.');
    } else if (reuse) {
      place = { lat: storedPlace.lat, lon: storedPlace.lon, label: storedPlace.label };
      steps.done('address', 'Saved place, no lookup needed.');
    } else {
      steps.start('address', `Looking up "${query.trim()}"…`);
      place = await geocode(query);
      steps.done('address', `${place.label.split(',').slice(0, 3).join(',').trim()} ` +
        `(${place.lat.toFixed(4)}, ${place.lon.toFixed(4)})`);
    }

    // terrain for the largest radius, so it covers whichever Overpass settles on
    const terrainKey = `${place.lat},${place.lon},${ladder[0]}`;
    const reusedTerrain = lastTerrain && lastTerrain.key === terrainKey;
    if (!o.terrain) steps.off('terrain', 'Turned off; the ground stays flat.');
    else steps.start('terrain', reusedTerrain ? 'Reusing heights from the last load.' : undefined);
    const pendingTerrain = !o.terrain ? Promise.resolve(null) : (reusedTerrain
      ? Promise.resolve(lastTerrain.grid)
      : fetchTerrain(place.lat, place.lon, ladder[0], d => steps.note('terrain', d)))
      .then(g => {
        if (g) {
          steps.done('terrain', `${g.tiles} tiles, ground from ${g.min.toFixed(1)} to ` +
            `${g.max.toFixed(1)} m around the start, sampled every ${g.step} m.`);
        } else {
          const why = steps.rows.terrain.querySelector('.detail').textContent;
          steps.off('terrain', `${why} Unavailable; the ground stays flat.`);
        }
        return g;
      })
      .catch(() => { steps.off('terrain', 'Unavailable; the ground stays flat.'); return null; });

    let features = null;
    // the cache only counts when it was downloaded for this city size (older entries were Medium)
    const cacheFits = !!storedPlace && (storedPlace.want ?? 500) === ladder[0];
    let radius = cacheFits ? storedPlace.radius : ladder[0];
    let cached = (cacheFits && place.label === storedPlace.label &&
      storedPlace.v === FEATURES_VERSION)
      ? localStorage.getItem('lastFeatures')
      : null;

    current = 'map';
    // a suggested place loads from this site's own file first; the device cache is only its fallback
    const cityFile = pick && ladder[0] === CITY_FILE_RADIUS ? pick.file : null;
    let hosted = null;
    if (cityFile) {
      steps.start('map', `Looking for ${cityFile} on this site…`);
      hosted = await fetchCityFile(cityFile);
      if (hosted) { cached = null; radius = ladder[0]; }
    }
    if (cached) {
      steps.done('map', `Loaded from this device's cache (${radius} m radius).`);
      current = 'sort';
      steps.start('sort', 'Reading the cached features…');
      await paint();
      features = JSON.parse(cached);
    } else {
      if (!cityFile) steps.start('map');
      // this site's own file for a suggested place, then the public map servers
      let fetched;
      if (hosted) {
        fetched = { json: hosted, radius: CITY_FILE_RADIUS };
        radius = fetched.radius;
        steps.done('map', `${fmt(hosted.elements.length)} map elements within ${radius} m, from ${cityFile} on this site.`);
      } else {
        fetched = await fetchBuildings(place.lat, place.lon, ladder, msg => steps.note('map',
          cityFile ? `${cityFile} is not on this site. ${msg}` : msg));
        radius = fetched.radius;
        steps.done('map', `${fmt((fetched.json.elements || []).length)} map elements within ${radius} m.`);
      }

      current = 'sort';
      steps.start('sort');
      await paint();
      const project = makeProjector(place.lat, place.lon);
      features = featuresFrom(fetched.json, project);
      try {
        storedPlace = { label: place.label, lat: place.lat, lon: place.lon, radius, want: ladder[0], v: FEATURES_VERSION };
        localStorage.setItem('lastPlace', JSON.stringify(storedPlace));
        localStorage.setItem('lastFeatures', JSON.stringify(features));
      } catch (e) {
        // over quota: the scene is built, but nothing is cached for next time
        localStorage.removeItem('lastFeatures');
        storedPlace = null;
      }
    }

    steps.done('sort', `${fmt(features.buildings.length)} buildings, ${fmt(features.roads.length)} roads and paths, ` +
      `${fmt(features.trees.length)} trees, ${fmt(features.places.length)} places.`);

    const terrainGrid_ = await pendingTerrain;
    if (terrainGrid_) lastTerrain = { key: terrainKey, grid: terrainGrid_ };
    elevation.set(terrainGrid_);
    // level the ground under mapped water before anything is draped on it
    if (elevation.active) cityWater.levelGround(features, Math.min(radius + ELEV_MARGIN, elevation.half));

    current = 'build';
    steps.start('build');
    await paint();
    resetObstacles();
    groundMatch.half = elevation.active ? Math.min(radius + ELEV_MARGIN, elevation.half) : radius;
    const { count, skipped } = buildCity(o.buildings ? features : { ...features, buildings: [] });
    // the measured square is painted like the wild ground, so the city sits in the same land
    buildTerrainBase(radius, g => { paintSlope(g); return new THREE.MeshLambertMaterial({ vertexColors: true }); });

    if (!count && o.buildings) {
      steps.error('build', `No mapped buildings within ${radius} m.`);
      say(`That spot has no mapped buildings within ${radius} m. Try somewhere more built up.`, true);
      steps.finish(false);
      teardownWorld();
      setBusy(false);
      return;
    }
    if (o.buildings) {
      steps.done('build', `${fmt(count)} buildings standing` +
        (skipped ? `, ${fmt(skipped)} skipped (slivers or broken outlines).` : '.'));
    } else {
      steps.done('build', 'Buildings turned off; streets, ground and trees only.');
    }

    // the city's provider: painted water, places, green areas and sidewalks for spawning
    const cw = new CityWorld(features, radius, o, MIX_HABITAT);
    cw.build();
    providers.active = cw;
    {
      current = 'wilderness';
      steps.start('wilderness', `Seed ${seed}, map size ${CONFIG.scale}…`);
      await paint();
      const mw = new WildernessWorld(cw, seed);
      mw.terrainStep();
      providers.active = mw;
      mw.waterStep();
      mw.cabinStep();
      const [groveTrees, groves] = mw.treeStep();
      const b = mw.bounds;
      steps.done('wilderness', `${Math.round(b.maxX - b.minX)} m square of wilderness from seed ${seed}, blended into the ` +
        `measured ground over ${MIX_BLEND} m; ${mw.cabins.length} cabins, ${mw.locations.length} shore points, ` +
        `${fmt(groveTrees)} trees in ${fmt(groves)} groves.`);
      providers.active = mw;
    }
    const provider = providers.active;

    const plan = provider.population();
    const planned = t => plan.reduce((n, g) => n + (g.type === t ? g.count : 0), 0);
    if (plan.some(g => g.count > 0)) {
      current = 'people';
      const want = [];
      if (planned('human')) want.push(`${fmt(planned('human'))} people`);
      if (planned('coyote')) want.push(`${fmt(planned('coyote'))} coyotes`);
      if (planned('deer')) want.push(`${fmt(planned('deer'))} deer`);
      if (planned('plant')) want.push(`${fmt(planned('plant'))} plants`);
      steps.start('people', `Spawning up to ${want.join(', ')}…`);
      await paint();
      populate(provider);
      const made = { human: 0, coyote: 0, deer: 0 };
      for (const a of ecosystem.animals) made[a.type]++;
      const out = [];
      if (made.human) out.push(`${fmt(made.human)} people, each with a two-lobe brain`);
      if (made.coyote) out.push(`${fmt(made.coyote)} coyotes`);
      if (made.deer) out.push(`${fmt(made.deer)} deer`);
      out.push(`${fmt(ecosystem.plants.length)} plants`);
      steps.done('people', out.join(', ') + '.');
    } else {
      clearEcosystem();
      steps.off('people', 'Turned off.');
    }

    // no time zone is fetched: estimate it from the longitude, so preset and game hours match the sun
    simSky.site = { lat: place.lat, lon: place.lon, offset: Math.round(place.lon / 15) * 3600 };
    updateSky();

    setPlayerInCar(false);
    if (provider.cabins.length) {
      // in the edge cabin, looking out the door at the city; the car parked in front, beside the doorway
      const st = provider.playerStart();
      player.pos.set(st.x, st.y + EYE_HEIGHT, st.z);
      player.vel.set(0, 0, 0);
      facePlayer(st.yaw, 0);
      player.grounded = false;
      if (o.car && !parkBesideCabin(provider.cabins[0], st.yaw)) placeCar(features.roads, player.pos.x, player.pos.z);
    } else {
      const [sx, sz] = streetSpawn(features.roads, 0, 0) ?? outdoorSpawn(0, 0);
      player.pos.set(sx, groundAt(sx, sz) + EYE_HEIGHT, sz);
      player.vel.set(0, 0, 0);
      facePlayer(0, 0);
      player.grounded = false;
      resolveCollisions(player.pos);
      if (o.car) placeCar(features.roads, player.pos.x, player.pos.z);
    }

    hudBuildings = count;
    hudPlace =
      `for ${place.label.split(',').slice(0, 3).join(',').trim()}` +
      ` (${skipped} skipped)`;

    current = 'scene';
    await finishLoad(provider);
    goEl.textContent = 'Load';
  } catch (err) {
    console.error(err);
    steps.error(current, err.message || String(err));
    steps.finish(false);
    say(`Failed to load. ${err.message || String(err)}`, true);
    goEl.textContent = 'Try again';
  }

  setBusy(false);
}

// NEW ECOSYSTEM: a fresh seed for the next load (same city if any), used up when it loads; an intro load clears it.
let randomSky = false;
goEl.addEventListener('click', () => { randomSky = false; }, true);
startGoEl.addEventListener('click', () => { randomSky = false; }, true);

function newEcosystem() {
  if (!providers.active || busy) return;
  const noCity = !providers.active.city;
  const seed = String(Math.floor(Math.random() * 1e12));
  seedEl.value = seed;
  returnToIntro();
  randomSky = true;
  setMode(noCity ? 'wilderness' : 'city');
  if (noCity) loadWilderness(seed);
  else loadPlace(lastQuery);
}

// SURVIVOR MODE TOGGLE: a chip in the Other row; only switches the food chain.
const gameEl = document.getElementById('game');
const skysetEl = document.getElementById('skyset');
// the sky pickers: Observer only. Their first chip, Game, clears the preset back to the game's own clock or weather.
function syncSkyset() {
  skysetEl.hidden = game.on;
}
let hudBeforeGame = true;
gameEl.addEventListener('click', () => {
  game.on = !game.on;
  gameEl.classList.toggle('sel', game.on);
  gameEl.setAttribute('aria-pressed', String(game.on));
  gameEl.blur();
  game.showPanel();
  // the HUD goes off in Survivor mode and comes back as it was on leaving
  if (game.on) { hudBeforeGame = hudOn; setHud(false); }
  else setHud(hudBeforeGame);
  // no Vision rays, Vitals or HUD chips in Survivor mode
  syncSkyset();
  raysEl.hidden = vitalsEl.hidden = hudBtnEl.hidden = game.on;
  // fps: the HUD line in Observer mode, the settings sheet's average in Survivor mode
  avgFpsEl.hidden = !game.on;
  if (game.on) avgFps.show();
  newEcoEl.textContent = game.on ? 'New game' : 'New ecosystem';
  updateSky();
  refreshHud();
  // no flying in Survivor mode: land and hide the button
  if (game.on && flying) toggleFly();
  updateCarButton();
  // The city's deer only in Survivor mode: the Deer switch follows and a live city gains or loses its own deer.
  loadOpts.deer = game.on;
  const deerSwitch = document.querySelector('#more .switch[data-opt="deer"]');
  deerSwitch.classList.toggle('on', game.on);
  deerSwitch.setAttribute('aria-checked', String(game.on));
  if (ecosystem.ready && providers.active && providers.active.city) {
    const city = providers.active.city;
    const hasDeer = ecosystem.animals.some(a => a.alive && a.type === 'deer' && a.home === city);
    if (game.on && !hasDeer) ecosystem.spawn('deer', NPC_DEER_POPULATION, city);
    else if (!game.on) for (const a of ecosystem.animals) if (a.type === 'deer' && a.home === city) a.alive = false;
  }
  wake();
});

// OBSERVER OR SURVIVOR: asked once the world is ready; buttons only select, Go launches.
const chooseObsEl = document.getElementById('chooseObs');
const chooseGameEl = document.getElementById('chooseGame');
const chooseGoEl = document.getElementById('chooseGo');
// Fullscreen, Third person and High graphics switches: only flipped here, applied when Go is pressed
const chooseFsSwitchEl = document.getElementById('chooseFsSwitch');
const choosePovSwitchEl = document.getElementById('choosePovSwitch');
const chooseGfxSwitchEl = document.getElementById('chooseGfxSwitch');
function setSwitch(el, on) {
  el.classList.toggle('on', on);
  el.setAttribute('aria-checked', String(on));
}
for (const el of [chooseFsSwitchEl, choosePovSwitchEl, chooseGfxSwitchEl]) {
  el.addEventListener('click', () => { setSwitch(el, !el.classList.contains('on')); el.blur(); });
}
function chooseMode() {
  cardEl.classList.add('choosing');
  return new Promise(resolve => {
    let wantGame = game.on;
    const show = () => {
      for (const [el, on] of [[chooseObsEl, !wantGame], [chooseGameEl, wantGame]]) {
        el.classList.toggle('sel', on);
        el.setAttribute('aria-pressed', String(on));
      }
    };
    show();
    setSwitch(chooseFsSwitchEl, !!fullscreenElement());
    setSwitch(choosePovSwitchEl, pov.mode === '3rd');
    setSwitch(chooseGfxSwitchEl, graphics.high);
    chooseObsEl.onclick = () => { wantGame = false; show(); chooseObsEl.blur(); };
    chooseGameEl.onclick = () => { wantGame = true; show(); chooseGameEl.blur(); };
    chooseGoEl.onclick = () => {
      cardEl.classList.remove('choosing');
      chooseObsEl.onclick = chooseGameEl.onclick = chooseGoEl.onclick = null;
      // Go is the user gesture fullscreen needs; fsEl's handler toggles it (and locks landscape)
      if (chooseFsSwitchEl.classList.contains('on') !== !!fullscreenElement()) fsEl.click();
      if (choosePovSwitchEl.classList.contains('on') !== (pov.mode === '3rd')) pov.cycle();
      if (chooseGfxSwitchEl.classList.contains('on') !== graphics.high) graphics.toggle();
      resolve(wantGame);
    };
  });
}

// START-UP OPTIONS: the More toggles; loadPlace() reads a copy when it starts.
const loadOpts = { car: true, terrain: true, people: true, deer: false, plants: true, buildings: true };
for (const el of document.querySelectorAll('#more .switch')) {
  if (el.dataset.opt === 'city') continue;   // the City switch picks the world (setMode), not a build option
  el.addEventListener('click', () => {
    const k = el.dataset.opt;
    loadOpts[k] = !loadOpts[k];
    el.classList.toggle('on', loadOpts[k]);
    el.setAttribute('aria-checked', String(loadOpts[k]));
    el.blur();
  });
}

// START SCREEN: the City switch picks a city in the wilderness ('city') or the wilderness alone ('wilderness').
const citySwitchEl = document.querySelector('#more .switch[data-opt="city"]');
function setMode(m) {
  startMode = m;
  cardEl.dataset.mode = m;
  const on = m === 'city';
  citySwitchEl.classList.toggle('on', on);
  citySwitchEl.setAttribute('aria-checked', String(on));
  say('');
}
citySwitchEl.addEventListener('click', () => {
  if (busy) return;
  setMode(startMode === 'city' ? 'wilderness' : 'city');
  citySwitchEl.blur();
});

// the Arena's seed field: digits only, the default seed when left empty
seedEl.addEventListener('input', () => {
  const cleaned = seedEl.value.replace(/[^0-9]/g, '');
  if (cleaned !== seedEl.value) seedEl.value = cleaned;
});
seedEl.addEventListener('blur', () => { if (!seedEl.value) seedEl.value = DEFAULT_SEED; });
seedEl.addEventListener('keydown', e => {
  if (e.key !== 'Enter') return;
  if (startMode === 'wilderness') { loadWilderness(seedValue()); }
  else { loadPlace(addrEl.value); }
});
for (const b of sizeBtns) {
  b.addEventListener('click', () => {
    worldSize = b.dataset.size;
    for (const o of sizeBtns) {
      o.classList.toggle('on', o === b);
      o.setAttribute('aria-checked', o === b ? 'true' : 'false');
    }
    customRowEl.hidden = worldSize !== 'custom';
  });
}
sizeEl.addEventListener('input', () => { sizeOutEl.textContent = sizeEl.value; });
peopleEl.addEventListener('input', () => { peopleOutEl.textContent = fmt(parseInt(peopleEl.value, 10)); });
startGoEl.addEventListener('click', () => { loadWilderness(seedValue()); });

goEl.addEventListener('click', () => { loadPlace(addrEl.value); });
const picksEl = document.getElementById('picks');
for (const [label, query] of PICKS) {
  const b = document.createElement('button');
  b.textContent = label;
  b.addEventListener('click', () => {
    addrEl.value = query;
    b.blur();
    loadPlace(query);
  });
  picksEl.appendChild(b);
}
addrEl.addEventListener('keydown', e => {
  if (e.key !== 'Enter') return;
  loadPlace(addrEl.value);
});

setMode('city');
loadIntroScene();
graphics.apply();
labels.bind();
vr.bind();
addrEl.focus();
