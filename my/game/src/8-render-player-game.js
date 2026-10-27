// 8-render-player-game.js: RENDER, PLAYER and GAME. What draws the world and what the player drives.
// Render owns: the NPC frustum and npcOnScreen, the human rig (geometry, atlas, materials, PS2-era shaders), the
// billboards, AnimalRenderer, PlantRenderer, foodBoxView, BlobShadows, HealthBars with the brain view, StatLabelSystem
// (labels), VisionRaySystem, the sky (bodies, colours, fade, updateSky, the Observer presets in skyChoice), rain and
// graphics.
// Player owns: player, keys, play { active, locked }, stance, touch (touchKnob), fly and climb, swimming, playerStep,
// movementHeld, the car and chase camera, the cat and petting, pov and VR.
// Game owns: SURVIVOR_ACTIONS, SURVIVOR_FIELD_ACTIONS, cabinAt and game (Survivor rules, inventory, the run summary).
// Binds: bindInventory, bindKeys, bindMouseLook, bindTouch, bindCar register this file's listeners; 9-main calls
// them in the original listener order. Construction (meshes, canvases) runs at load.
// May import: 1-config.js to 7-sim.js and three. It registers into the sim (avatar, afterContacts, plantView) only
// through statements in 9-main.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import {
  HEAD_CLEAR, EYE_HEIGHT, PLAYER_RADIUS, WALK_SPEED, RUN_SPEED, JUMP_SPEED, CROUCH_SPEED, FOOT_TURN_RATE,
  FOOT_CAM_FOLLOW, LOOK_PITCH_MAX, FLY_SPEED, CROUCH_RATE, GRAVITY, GRID_CELL, LAND_EPS, STEP_UP, GROUND_SNAP,
  ROAD_WIDTH, PATH_KINDS, LOW_PIXEL_RATIO, HIGH_FOG_FAR, LOW_FOG_FAR, HIGH_CAMERA_FAR, LOW_CAMERA_FAR,
  LOW_NPC_LOD_DIST, LOW_FAR_STAT_DIST, GRAPHICS_KEY, HEMI_DAY, HEMI_NIGHT, MOON_MAX, SHADOW_AHEAD, MOON_BLEND_DEG,
  NPC_TICK_S, DIET_WATER_SHARE, GAIT_MAX_HZ, GAIT_GALLOP_SWING, GAIT_CADENCE_SCALE, NPC_ATTACK_COOLDOWN_S,
  NPC_FIGHT_MOVES, NPC_MATURITY_TICKS, GROWTH_MIN_SCALE, NPC_ADULT_AGE, NPC_TICKS_PER_YEAR, NPC_START_AGE, NPC_RIG_TOP,
  NPC_UNIT, PLAYER_HS, NPC_SIZE, NPC_SIZE_Z_MAX, SPECIES, NPC_TYPES, NPC_TYPE_IDS, NPC_TYPE_COUNT, HUMAN_TYPE_ID,
  HUNTS_MASK, NIGHT_PREY_MASK, HIGH_NPC_LOD_DIST, HIGH_FAR_STAT_DIST, NPC_BODY_R, NPC_STATS_R, NPC_STATS_UP,
  HUMAN_ATLAS, HUMAN_FACE_TILE, HUMAN_BODY_TILE, HUMAN_FACE_VARIANTS, HUMAN_OUTFITS, HUMAN_OUTFIT_TILES,
  HUMAN_STRIDE_BASE, HUMAN_STRIDE_PER_V, HUMAN_STRIDE_MAX, HUMAN_CADENCE_MAX, HUMAN_SWING_MAX, HUMAN_IDLE_SPEED,
  HUMAN_GAIT_EASE, HUMAN_GAIT_JUMP, HUMAN_RIG, HUMAN_LEG, HUMAN_CROUCH, HUMAN_FIGHT, HUMAN_CROUCH_DROP, CROUCH_DROP,
  HUMAN_ARM_FLARE, HUMAN_PET, PET_BEND_LEVELS, HUMAN_HAIR, BB_CELL, BB_DIRS, BB_BAKED_DIRS, BB_PHASES, BB_POSES,
  BB_BLOCK, BB_FRAME, BB_FACE_VARIANT, BB_HUMAN_SWING, BB_STAND_SWING, BB_PHASE_K, BB_MIP_BIAS, PLANT_GRID,
  FOOD_BOX_SIZE, STREET_STEP, CABIN_SCALE, CABIN_M, CAT_HEAD_TOP, CAT_SCALE, CAT_SEAT, CAT_DOOR, CAT_RUN_FROM,
  CAT_WALK_WITHIN, CAT_RUN_SPEED, CAT_BOARD_SPEED, CAT_JUMP_TIME, CAT_BOARD_TIMEOUT, CAT_HEAD_FWD, CAT_PET_STEP_SPEED,
  CAT_PET_SETTLED, CAT_PET_TURN_RATE, TPP_BACK, TPP_UP, PLAYER_JOG_ANIM, SHADOW_FOLLOW_STEP, SHADOW_SUN_STEP_COS,
  SHADOW_MOVER_HZ, SHADOW_MOVER_DIST, SUN_DIST, SHADOWS_ENABLED, BLOB_DIST, BLOB_MAX, BLOB_OPACITY, BLOB_FULL_SUN,
  BLOB_LIFT, BLOB_SPREAD, SURVIVOR_CONFIG, playerPlantFood, BAR_STEPS, BAR_RELEASE_TICKS, ARROW_STEPS, BAR_W_M,
  BAR_ABOVE, BAR_COLORS, BAR_ICONS, EMOJI_FONT, FAR_STAT_MAX, BAR_CANVAS_W, BAR_CANVAS_H, BAR_INFO_H, BAR_INFO_FONT,
  BAR_INFO_GAP, BAR_SPRITE_CANVAS_H, BAR_PX, BAR_H_M, LOBE_RADIUS, LOBE_COLS, BRAIN_SCALE, BRAIN_HALF_H, BRAIN_ABOVE,
  BRAIN_SPIN, BRAIN_TILT, BRAIN_DIM, BRAIN_IN_GROUPS, BRAIN_GROUP_COLS, STICK_RADIUS, FLICK_RADIUS, TAP_GAP_MS,
  TAP_SLOP, TAP_SWALLOW_MS, TAP_BUTTONS, HOLD_SAFE, CAR_SCALE, CAR_LEN, CAR_WID, CAR_TOP, CAR_WHEELBASE, CAR_TRACK,
  CAR_WHEEL_R, CAR_R, CAR_CIRCLES, CAR_STEP_UP, CAR_SUBSTEP, CAR_ACCEL_MAX, CAR_POWER, CAR_BRAKE, CAR_HANDBRAKE,
  CAR_REV_MAX, CAR_REV_ACCEL, CAR_ROLL, CAR_ENGINE_BRK, CAR_DRAG, CAR_GRIP, CAR_STEER_MAX, CAR_STEER_FALL,
  CAR_STEER_RATE, CAR_G, CAR_GLANCE, CAR_ALIGN, CAR_REACH, CAM_DIST, CAM_PIVOT, CAM_PITCH, CAM_FOLLOW, CAM_LOOK_HOLD,
  CABIN_CAR_GAP, CABIN_CAR_WALKWAY, SKIES, SWIM_DEPTH, SWIM_FLOAT, SWIM_SPEED, SWIM_JUMP, SWIM_DRAG, SKY, SKY_DIST,
  SKY_FAR_FRACTION, SKY_BODY_DEG, SKY_TEX, SKY_FADE_S, RAIN_SPAN, RAIN_HEIGHT, RAIN_FPS_IDLE, RAIN_FADE_S,
  RAIN_TIME_WRAP, ROOF_MAP_N, ROOF_MAP_SIZE, ROOF_MAP_SNAP, RAIN_BY_CODE
} from './1-config.js';
import {
  fmt, cellKey, fightEase, fightClamp01, tools, loop, wake, invalidate, solarVector, moonVector
} from './2-core.js';
import {
  startLowPower, renderer, scene, camera, rig, viewPos, viewQuat, hemi, sun, MOON_FALLBACK, moon, msaa, perf
} from './3-gfx-io.js';
import {
  providers, _surf, groundAt, isWaterAt
} from './4-provider.js';
import {
  pointInShell, collision, resolveCollisions, moveAndCollide, supportAt, ceilingAt, solidOverlap, shellAt
} from './5-collision.js';
import {
  facadeLit, foodBoxes, streets, shelters
} from './6-worlds.js';
import {
  startFightMove, humanFightAct, sampleFightKeys, humanMassKg, personInfoKey, personInfoFields, Animal, humanLook,
  packHumanLook, plantView, brains, ecosystem, simSky, presetHour
} from './7-sim.js';

export const dotEl = document.getElementById('dot');
export const stickEl = document.getElementById('stick');
export const knobEl = document.getElementById('knob');
export const flyEl = document.getElementById('fly');
export const climbEl = document.getElementById('climb');
export const upEl = document.getElementById('up');
export const downEl = document.getElementById('down');

// VIEW CULL: off-screen bodies, stats and brains are skipped (bounding sphere vs frustum).
export const npcFrustum = new THREE.Frustum();
export const _npcVP = new THREE.Matrix4();
export const _npcSphere = new THREE.Sphere();

export function updateNpcFrustum() {
  camera.updateMatrixWorld();
  if (renderer.xr.isPresenting) return;
  _npcVP.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
  npcFrustum.setFromProjectionMatrix(_npcVP);
}

export function npcOnScreen(x, y, z, r) {
  if (renderer.xr.isPresenting) return true;
  _npcSphere.center.set(x, y, z);
  _npcSphere.radius = r;
  return npcFrustum.intersectsSphere(_npcSphere);
}

// INSTANCED RENDERER

export const geometryViews = new WeakMap();
export function geometryView(geo, slot) {
  let views = geometryViews.get(geo);
  if (!views) geometryViews.set(geo, views = []);
  if (views[slot]) return views[slot];
  const g = new THREE.BufferGeometry();
  g.setIndex(geo.index);
  for (const k in geo.attributes) g.setAttribute(k, geo.attributes[k]);
  for (const gr of geo.groups) g.addGroup(gr.start, gr.count, gr.materialIndex);
  g.setDrawRange(geo.drawRange.start, geo.drawRange.count);
  return views[slot] = g;
}
export const petBendAt = level => HUMAN_PET.bend[0] + (HUMAN_PET.bend[1] - HUMAN_PET.bend[0]) * level / (PET_BEND_LEVELS - 1);
export const petQuant = (v, lo, hi, steps) => Math.round(fightClamp01((v - lo) / (hi - lo)) * steps);
export function humanPetPack(share, bendLevel, shoulder, turn) {
  const P = HUMAN_PET;
  return petQuant(share, 0, 1, 63) + 64 * bendLevel + 256 * petQuant(shoulder, P.shoulder[0], P.shoulder[1], 255) +
    65536 * petQuant(turn, -P.turnMax, P.turnMax, 255);
}
// The petting arm's hand point in rig space (body centre origin, +x the body's left, +z forward; before size and
// facing), posed as humanPose poses it at full crouch and full pet reach standing still, with the bend (radians),
// shoulder angle a1 and sweep angle turn.
export function humanPetHand(bend, a1, turn, girth) {
  const R = HUMAN_RIG, P = HUMAN_PET, y0 = R.at(P.handAt);
  // humanTurn on (y, z) about (cy, 0)
  const turnYZ = (y, z, cy, a) => { const c = Math.cos(a), s = Math.sin(a), v = y - cy; return [cy + v * c - z * s, v * s + z * c]; };
  let [y, z] = turnYZ(y0, 0, R.elbow, P.elbow);
  [y, z] = turnYZ(y, z, R.shoulder, a1);
  const x0 = P.arm * R.shoulderX * girth, dx = P.arm * (R.shoulderX + (R.shoulder - y0) * HUMAN_ARM_FLARE) * girth - x0;
  const c = Math.cos(turn), s = Math.sin(turn);
  const x = x0 + dx * c - z * s;
  z = dx * s + z * c;
  [y, z] = turnYZ(y, z, R.hip, HUMAN_CROUCH.lean + bend);
  return { x, y: y - HUMAN_CROUCH_DROP, z };
}

// The rest-pose body: 16 parts (ids below) lofted from rings, ~490 triangles; uv is tile-local (0..1 in a face or outfit tile).
export function buildHumanGeometry() {
  const R = HUMAN_RIG, at = R.at;
  const pos = [], nrm = [], uv = [], rig = [], piv = [], idx = [];
  // ring points start at the back centre and run toward +x (the body's left), the front, then -x
  const oval = (n, cx, y, cz, rx, rz) => Array.from({ length: n }, (_, i) => {
    const a = Math.PI - i * 2 * Math.PI / n;
    return [cx + rx * Math.sin(a), y, cz + rz * Math.cos(a)];
  });
  const boxy = (y, cz, rx, rz) => [[0, -rz], [0.62 * rx, -rz], [rx, -0.58 * rz], [rx, 0.58 * rz], [0.62 * rx, rz], [0, rz],
    [-0.62 * rx, rz], [-rx, 0.58 * rz], [-rx, -0.58 * rz], [-0.62 * rx, -rz]].map(([x, z]) => [x, y, cz + z]);
  const part = ({ rings, vs, rect, tile, id, limb = 0, side = 0, depth = 0, pivot = [0, 0, 0], capStart, capEnd }) => {
    const n = rings[0].length, base = pos.length / 3, idx0 = idx.length, mid = rings[rings.length >> 1], us = [0];
    for (let i = 1; i <= n; i++) {
      const a = mid[i - 1], b = mid[i % n];
      us.push(us[i - 1] + Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]));
    }
    const put = (p, u, v) => {
      if (side < 0) u = 1 - u;   // right limbs mirror, so u 0.25 is always the outer side
      pos.push(p[0], p[1], p[2]);
      uv.push((rect[0] + 0.5 + u * (rect[2] - 1)) / tile[0], (rect[1] + 0.5 + v * (rect[3] - 1)) / tile[1]);
      rig.push(id, limb, side, depth);
      piv.push(pivot[0], pivot[1], pivot[2]);
    };
    rings.forEach((ring, r) => { for (let i = 0; i <= n; i++) put(ring[i % n], us[i] / us[n], vs[r]); });
    for (let r = 0; r + 1 < rings.length; r++) for (let i = 0; i < n; i++) {
      const a = base + r * (n + 1) + i, c = a + n + 1;
      idx.push(a, a + 1, c, a + 1, c + 1, c);
    }
    const cap = (c, r, start) => {
      const ci = pos.length / 3, r0 = base + r * (n + 1);
      put(c, 0.5, c[3] ?? vs[r]);
      for (let i = 0; i < n; i++) start ? idx.push(ci, r0 + i + 1, r0 + i) : idx.push(ci, r0 + i, r0 + i + 1);
    };
    if (capStart) cap(capStart, 0, true);
    if (capEnd) cap(capEnd, rings.length - 1, false);
    // smooth normals, welded by position so the back seam and cap edges do not show
    const acc = new Map(), key = i => `${pos[3 * i].toFixed(3)} ${pos[3 * i + 1].toFixed(3)} ${pos[3 * i + 2].toFixed(3)}`;
    for (let t = idx0; t < idx.length; t += 3) {
      const [a, b, c] = [idx[t], idx[t + 1], idx[t + 2]].map(i => new THREE.Vector3(pos[3 * i], pos[3 * i + 1], pos[3 * i + 2]));
      const fn = b.clone().sub(a).cross(c.clone().sub(a));
      for (const i of [idx[t], idx[t + 1], idx[t + 2]]) {
        const k = key(i);
        acc.set(k, (acc.get(k) || new THREE.Vector3()).add(fn));
      }
    }
    for (let i = base; i < pos.length / 3; i++) {
      const v = (acc.get(key(i)) || new THREE.Vector3(0, 1, 0)).normalize();
      nrm.push(v.x, v.y, v.z);
    }
  };
  const F = HUMAN_FACE_TILE, B = HUMAN_BODY_TILE, arm = [R.shoulder, R.elbow, 0], leg = [R.hip, R.knee, R.ankle];
  // head (0) and neck (1) on the face tile; texture v runs with height so features sit where the paint expects
  const chin = at(0.864), hv = y => (R.crown - y) / (R.crown - chin);
  const headRing = (f, k, nose, fwd) => { const r = oval(8, 0, at(f), fwd - 0.15, 1.72 * k, 2.1 * k); r[4][2] += nose; return r; };
  const head = [headRing(0.985, 0.62, 0, 0), headRing(0.945, 1, 0, 0), headRing(0.905, 0.97, 0.32, 0.05), headRing(0.875, 0.78, 0.25, 0.2)];
  part({ rings: head, vs: head.map(r => hv(r[0][1])), rect: [0, 0, 128, 48], tile: F, id: 0, capStart: [0, R.crown, -0.1, 0], capEnd: [0, chin, 0.3, 1] });
  part({ rings: [oval(6, 0, at(0.885), -0.25, 1.36, 1.3), oval(6, 0, at(0.825), -0.25, 1.36, 1.3)], vs: [0, 1], rect: [0, 48, 128, 16], tile: F, id: 1 });
  // torso (2) and pelvis (3)
  part({ rings: [boxy(at(0.842), -0.2, 1.2, 1.1), boxy(at(0.814), -0.15, 4.4, 2.2), boxy(at(0.725), 0.1, 3.75, 2.55), boxy(at(0.6), 0, 3.0, 2.05)],
    vs: [0, 0.26, 0.56, 1], rect: [0, 0, 128, 60], tile: B, id: 2 });
  part({ rings: [boxy(at(0.615), 0, 3.08, 2.1), boxy(at(0.545), 0, 3.45, 2.35), boxy(at(0.475), 0, 2.6, 1.85)],
    vs: [0, 0.45, 1], rect: [0, 60, 128, 28], tile: B, id: 3, capEnd: [0, at(0.468), 0, 1] });
  for (const s of [1, -1]) {
    const L = s > 0 ? 0 : 1, ax = y => s * (R.shoulderX + (R.shoulder - y) * HUMAN_ARM_FLARE), lx = y => s * (1.85 - (R.hip - y) * 0.02);
    const armRing = (f, r, rz = r * 1.05) => oval(6, ax(at(f)), at(f), 0, r, rz);
    // upper arm (4, 5), lower arm (6, 7), hand (12, 13): arms hang slightly out from the shoulder
    part({ rings: [armRing(0.8, 1.28), armRing(0.72, 1.1), armRing(0.615, 0.86)], vs: [0.12, 0.5, 1], rect: [128, 0, 48, 36], tile: B,
      id: 4 + L, limb: 1, side: s, depth: 1, pivot: arm, capStart: [ax(at(0.822)), at(0.822), 0, 0] });
    part({ rings: [armRing(0.635, 0.84), armRing(0.58, 0.9, 0.95), armRing(0.49, 0.6, 0.66)], vs: [0, 0.3, 1], rect: [128, 36, 48, 32], tile: B,
      id: 6 + L, limb: 1, side: s, depth: 2, pivot: arm });
    part({ rings: [armRing(0.495, 0.42, 0.75), armRing(0.388, 0.3, 0.68)], vs: [0, 0.95], rect: [128, 68, 48, 20], tile: B,
      id: 12 + L, limb: 1, side: s, depth: 2, pivot: arm, capEnd: [ax(at(0.382)), at(0.382), 0.1, 1] });
    // upper leg (8, 9), lower leg (10, 11), foot (14, 15)
    const legRing = (f, rx, rz, cz = 0) => oval(6, lx(at(f)), at(f), cz, rx, rz);
    part({ rings: [legRing(0.56, 1.95, 2.05, 0.1), legRing(0.43, 1.72, 1.82), legRing(0.275, 1.18, 1.25)], vs: [0, 0.5, 1], rect: [176, 0, 80, 40], tile: B,
      id: 8 + L, limb: 2, side: s, depth: 1, pivot: leg });
    part({ rings: [legRing(0.3, 1.16, 1.16), legRing(0.2, 1.22, 1.32, -0.18), legRing(0.05, 0.7, 0.74)], vs: [0, 0.42, 1], rect: [176, 40, 80, 48], tile: B,
      id: 10 + L, limb: 2, side: s, depth: 2, pivot: leg });
    // the shoe lofts heel to toe; its rings start at the sole's centre; toes turn out a little
    const cx = lx(R.ankle), turn = s * 0.1, ct = Math.cos(turn), st = Math.sin(turn);
    const toWorld = (x, y, z) => [cx + x * ct + z * st, y, z * ct - x * st];
    const shoe = (z, w, top) => [[0, 0], [w, 0], [0.78 * w, top], [-0.78 * w, top], [-w, 0]].map(([x, y]) => toWorld(x, R.foot + y, z));
    part({ rings: [shoe(-1.35, 0.9, 1.9), shoe(2.9, 1.2, 1.05), shoe(4.7, 0.85, 0.6)], vs: [0, 0.68, 1], rect: [128, 88, 128, 40], tile: B,
      id: 14 + L, limb: 2, side: s, depth: 3, pivot: leg, capStart: [...toWorld(0, R.foot + 0.9, -1.35), 0], capEnd: [...toWorld(0, R.foot + 0.3, 4.7), 1] });
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('rig', new THREE.Float32BufferAttribute(rig, 4));
  g.setAttribute('pivot', new THREE.Float32BufferAttribute(piv, 3));
  g.setIndex(idx);
  return g;
}

// Paint and mask atlases, drawn texel by texel at startup: grey paint is tinted per person by the mask (r skin, g shirt, b pants).
export function paintHumanAtlas() {
  const S = HUMAN_ATLAS, paint = new Uint8ClampedArray(S * S * 4), mask = new Uint8ClampedArray(S * S * 4);
  let seed = 7;
  const rnd = () => (seed = seed * 16807 % 2147483647) / 2147483647;
  const hash = (x, y) => {
    let h = Math.imul(x, 374761393) + Math.imul(y, 668265263) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  };
  const mott = (x, y) => {
    const fx = x / 7, fy = y / 7, ix = Math.floor(fx), iy = Math.floor(fy), tx = fx - ix, ty = fy - iy;
    const a = hash(ix, iy), b = hash(ix + 1, iy), c = hash(ix, iy + 1), d = hash(ix + 1, iy + 1);
    return a + (b - a) * tx + (c - a) * ty + (a - b - c + d) * tx * ty;
  };
  const ss = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
  const tent = (x, w) => Math.max(0, 1 - Math.abs(x) / w);
  const fold = (u, v) => Math.max(0, Math.sin(u * 47 + v * 13 + Math.sin(u * 9 + v * 5) * 2) - 0.55) * 2.2;
  const o = { r: 0, g: 0, b: 0, s: 0, t: 0, p: 0, h: 0 };
  const tint = (g, ch) => { o.r = o.g = o.b = g; o.s = +(ch === 0); o.t = +(ch === 1); o.p = +(ch === 2); o.h = 0; };
  const over = (hex, a = 1, k = 1) => {
    o.r += (((hex >> 16) & 255) / 255 * k - o.r) * a; o.g += (((hex >> 8) & 255) / 255 * k - o.g) * a; o.b += ((hex & 255) / 255 * k - o.b) * a;
    o.s *= 1 - a; o.t *= 1 - a; o.p *= 1 - a; o.h *= 1 - a;
  };
  // hair colour; its coverage goes in the mask's alpha, which only the billboard bake reads (far people get their own hair colour)
  const overHair = (hex, a = 1, k = 1) => { over(hex, a, k); o.h += a; };
  const shade = k => { o.r *= k; o.g *= k; o.b *= k; };
  let col = 0;
  const region = (x0, y0, w, h, fn) => {
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      col = x;
      fn((x + 0.5) / w, (y + 0.5) / h);
      const X = x0 + x, Y = y0 + y, i = (Y * S + X) * 4, k = (1 + (rnd() - 0.5) * 0.07) * (0.96 + 0.08 * mott(X, Y)) * 255;
      paint[i] = o.r * k; paint[i + 1] = o.g * k; paint[i + 2] = o.b * k; paint[i + 3] = 255;
      mask[i] = o.s * 255; mask[i + 1] = o.t * 255; mask[i + 2] = o.p * 255; mask[i + 3] = o.h * 255;
    }
  };

  // FACES: u around the head (0.5 = the face), hv crown to chin; hair, brows and eyes are painted colour, skin is tinted
  const IRIS = [0x2a1c12, 0x3b2a1b, 0x41606e, 0x4a3a20];
  const headTexel = (u, hv, fem, v4, hair) => {
    const th = (u - 0.5) * 2 * Math.PI, a = Math.abs(th);
    tint(0.86 + 0.05 * ss(0.5, 0, a) - 0.12 * ss(1.0, 2.2, a)
      - 0.12 * tent(hv - 0.5, 0.08) * tent(a - 0.42, 0.26)              // eye sockets
      + 0.07 * tent(a, 0.09) * ss(0.45, 0.6, hv) * ss(0.75, 0.68, hv)    // nose ridge
      - 0.18 * tent(hv - 0.735, 0.03) * tent(a, 0.16)                    // under the nose
      - 0.08 * tent(hv - 0.85, 0.05) * tent(a, 0.25)                     // under the lip
      + 0.05 * tent(a - 0.65, 0.25) * tent(hv - 0.64, 0.08)              // cheekbones
      - 0.14 * ss(0.86, 1.0, hv), 0);                                     // jaw shadow
    const ear = tent(a - 1.57, 0.17) * tent(hv - 0.58, 0.13);
    if (ear > 0.1) shade(ear < 0.3 ? 0.8 : 0.95);
    if (Math.abs(hv - 0.5) < 0.027 && a > 0.28 && a < 0.56) {
      over(0xe2ddd4, 0.9);
      if (Math.abs(a - 0.42) < 0.06) over(IRIS[v4]);
      if (hv < 0.49) over(0x2a1f18, 0.7);
    }
    if (Math.abs(hv - 0.445 + 0.03 * (a - 0.42)) < 0.017 && a > 0.24 && a < 0.62) overHair(hair, 0.85, 0.8);
    if (a < 0.26) {
      if (Math.abs(hv - 0.8) < 0.011) shade(0.62);
      else if (hv > 0.811 && hv < 0.835) shade(1.04);
      if (fem && Math.abs(hv - 0.812) < 0.024) over(0xa04848, 0.35);
    }
    if (Math.abs(hv - 0.725) < 0.012 && Math.abs(a - 0.08) < 0.04) shade(0.7);
    if (!fem && v4 === 2 && hv > 0.7 && a < 1.5 && !(a < 0.26 && hv > 0.78 && hv < 0.84)) shade(1 - 0.45 * ss(0.7, 0.78, hv));   // stubble
    const hlAt = a => {
      let l = fem ? 0.17 + 0.83 * ss(0.72, 1.0, a) : 0.2 + 0.28 * ss(0.45, 1.15, a) + 0.4 * ss(1.75, 2.5, a);
      if (!fem && a > 1.12 && a < 1.38) l = Math.max(l, 0.62);       // sideburns
      if (fem && v4 === 1) l = Math.max(l, 0.33 * ss(0.55, 0.25, a)); // fringe
      return l;
    };
    const hl = hlAt(a);
    // the hair's edge texels stay skin-tinted (just dark), so filtering never blends tinted and untinted into grey
    if (hv < hl) {
      if (hv > hl - 0.03 || hv > Math.min(hlAt(a - 0.05), hlAt(a + 0.05))) tint(0.2, 0);
      else overHair(hair, 1, 0.8 + 0.32 * hash(col >> 1, v4) - 0.25 * ss(hl - 0.08, hl, hv) + 0.18 * tent(hv - 0.12, 0.08) * ss(1.6, 0, a));
    }
  };
  for (let f = 0; f < HUMAN_FACE_VARIANTS * 2; f++) {
    const fem = f >= HUMAN_FACE_VARIANTS, v4 = f % HUMAN_FACE_VARIANTS, hair = HUMAN_HAIR[+fem][v4], fx = (f % 2) * 128, fy = (f >> 1) * 64;
    region(fx, fy, 128, 48, (u, v) => headTexel(u, v, fem, v4, hair));
    region(fx, fy + 48, 128, 16, (u, v) => {
      const a = Math.abs((u - 0.5) * 2 * Math.PI);
      tint(0.7 + 0.14 * ss(0, 0.6, v) - 0.08 * ss(1.0, 2.6, a) - 0.1 * ss(0.8, 1, v), 0);
      if ((fem && a > 1.9) || (!fem && a > 2.3 && v < 0.3)) overHair(hair, 1, 0.72 + 0.25 * hash(col >> 1, 9));
    });
  }

  // OUTFITS: u around each part (0 back, 0.25 outer side / the body's left, 0.5 front, 0.75 inner side), v down the part
  const SHOES = [[0xd8d5ce, 0xe9e7e1], [0x4a2f1d, 0x2a1d14], [0x2c2521, 0x1c1714], [0x484b53, 0xdcdad4], [0xd8d5ce, 0xe9e7e1], [0x1c1a19, 0x131211]];
  const sides = u => Math.min(Math.abs(u - 0.25), Math.abs(u - 0.75));
  const torso = (u, v, k) => {
    const f = Math.abs(u - 0.5), sd = sides(u), back = Math.min(u, 1 - u);
    let g = 0.88 + 0.08 * ss(0.3, 0.05, v) - 0.08 * ss(0.1, 0, sd)
      - 0.3 * ss(0.07, 0, sd) * tent(v - 0.56, 0.14)                     // armpits
      - 0.07 * tent(v - 0.64, 0.05) * ss(0.2, 0.05, f)                    // under the chest
      - 0.12 * ss(0.88, 1, v) - 0.1 * ss(0.72, 0.95, v) * fold(u, v);     // tucked in, waist wrinkles
    if (k === 2) g *= 0.86;
    tint(g, 1);
    if (k === 0 && v < 0.05) shade(0.8);
    if (k === 1) {
      if (v < 0.13 && f < 0.09) shade(v > 0.11 || f > 0.08 ? 0.72 : 1.06);   // collar points
      if (f < 0.01 && v > 0.12) shade(0.82);
      if (f < 0.009 && v > 0.15 && (v * 9) % 1 < 0.12) over(0xdcd6c6);
      if (Math.abs(u - 0.4) < 0.04 && Math.abs(v - 0.37) < 0.05 && (Math.abs(u - 0.4) > 0.032 || v > 0.41)) shade(0.8);
    }
    if (k === 2) {
      if (f < 0.05 && v > 0.04) over(0xcdc8bd, 1, 0.9 - 0.2 * ss(0.85, 1, v));
      if (Math.abs(f - 0.05) < 0.007) over(0x2a2724, 0.8);
      if (v < 0.1) shade(0.82);
      if (Math.abs(f - 0.15) < 0.05 && Math.abs(v - 0.82) < 0.008) shade(0.6);
    }
    if (k === 3) {
      if (back < 0.14 && v < 0.35) shade(1 - 0.3 * fold(u * 3, v));
      if (Math.abs(f - 0.03) < 0.006 && v > 0.04 && v < 0.3) over(0xe0ddd5);
      if (f < 0.13 && v > 0.66 && v < 0.9) shade(f > 0.12 || v < 0.672 ? 0.72 : 0.94);
      if (v > 0.92) shade(col % 2 ? 0.88 : 1);
    }
    if (k === 4 && ((sd < 0.09 && v < 0.62) || (v < 0.27 && sd < 0.17) || (f < 0.12 && v < 0.2) || (back < 0.1 && v < 0.14))) {
      tint(0.85 + 0.05 * ss(0.3, 0, v) - 0.25 * ss(0.07, 0, sd) * tent(v - 0.56, 0.14), 0);
    }
    if (k === 5) {
      const edge = 0.1 * (1 - v / 0.58) + 0.012;
      if (v < 0.58 && f < edge) { over(0xe6e4de, 1, g); if (f < 0.022 + 0.015 * ss(0.1, 0.03, v)) over(0x6b1f25, 1, g * 0.95); }
      if (v < 0.58 && Math.abs(f - edge) < 0.008) shade(0.6);
      if (f < 0.008 && (Math.abs(v - 0.66) < 0.012 || Math.abs(v - 0.78) < 0.012)) over(0x1a1918);
      if (Math.abs(f - 0.16) < 0.04 && Math.abs(v - 0.83) < 0.006) shade(0.6);
    }
  };
  const pelvis = (u, v, k) => {
    const f = Math.abs(u - 0.5), back = Math.min(u, 1 - u);
    tint(0.86 - 0.07 * ss(0.1, 0, sides(u)) - 0.28 * ss(0.6, 1, v) * Math.min(1, ss(0.15, 0, f) + ss(0.12, 0, back)) - 0.08 * ss(0.85, 1, v), 2);
    if (k === 0 || k === 1 || k === 5) {
      if (v < 0.16) { over(k === 5 ? 0x191716 : 0x33241a, 1, 0.9 + 0.15 * ss(0.16, 0, v)); if (f < 0.035) over(k === 0 ? 0xa59372 : 0x9a9a9a); }
      if (k === 0 && f < 0.008 && v > 0.16 && v < 0.62) shade(0.75);
      if (k === 0 && Math.abs(f - (0.13 + 0.06 * v)) < 0.006 && v > 0.16 && v < 0.5) shade(0.8);
      if (k === 0 && Math.abs(back - 0.12) < 0.06 && Math.abs(v - 0.42) < 0.12 && (Math.abs(back - 0.12) > 0.052 || v > 0.52)) shade(0.8);
    }
    if (k === 2 && v < 0.3) tint(0.76 * (v > 0.27 ? 0.7 : 1), 1);
    if (k === 3 && v < 0.32) tint(0.84 * (v > 0.18 && col % 2 ? 0.88 : 1) * (v > 0.3 ? 0.75 : 1), 1);
    if (k === 4 && v < 0.14) shade(col % 2 ? 0.85 : 0.95);
  };
  const upperArm = (u, v, k) => {
    const inner = Math.abs(u - 0.75), bare = k === 4 || (k === 0 && v > 0.5);
    const g = 0.86 + 0.06 * ss(0.2, 0, v) - 0.22 * ss(0.12, 0, inner) * ss(0.4, 0.05, v) - 0.08 * ss(0.15, 0, inner)
      - (bare ? 0.04 : 0.14) * ss(0.85, 1, v) * ss(0.2, 0, inner);
    tint(bare ? g : g * (k === 2 ? 0.86 : 1), bare ? 0 : 1);
    if (k === 0 && v > 0.45 && v < 0.5) tint(g * 0.8, 1);
  };
  const lowerArm = (u, v, k) => {
    const inner = Math.abs(u - 0.75), bare = k === 0 || k === 4;
    const g = 0.86 - 0.18 * ss(0.15, 0, v) * ss(0.2, 0, inner) - 0.06 * ss(0.2, 0, inner);
    tint(bare ? g : g * (k === 2 ? 0.86 : 1), bare ? 0 : 1);
    if (!bare && v > 0.86) shade(k === 3 ? (col % 2 ? 0.8 : 0.9) : 0.8);
    if (k === 5 && v > 0.93) over(0xe6e4de, 1, 0.9);
  };
  const hand = (u, v) => {
    const back = Math.abs(u - 0.25), palm = Math.abs(u - 0.75);
    let g = 0.84 + 0.05 * ss(0.15, 0, palm);
    if (v > 0.5 && Math.min(back, palm) < 0.15 && col % 4 === 0) g -= 0.18;
    if (Math.abs(v - 0.48) < 0.03 && back < 0.15) g -= 0.1;
    if (Math.abs(u - 0.5) < 0.05 && v > 0.15 && v < 0.6) g -= 0.12;
    tint(g - 0.1 * ss(0.9, 1, v), 0);
  };
  const upperLeg = (u, v, k) => {
    const inner = Math.abs(u - 0.75), back = Math.min(u, 1 - u), f = Math.abs(u - 0.5);
    if (k === 4 && v > 0.6) { tint(0.85 - 0.06 * ss(0.15, 0, inner) - 0.15 * ss(0.9, 1, v) * ss(0.12, 0, back), 0); return; }
    tint(0.86 + 0.04 * ss(0.2, 0, f) - 0.18 * ss(0.12, 0, inner) * ss(0.3, 0, v) - 0.07 * ss(0.2, 0, inner)
      - 0.22 * ss(0.82, 1, v) * ss(0.15, 0, back) - 0.1 * ss(0.8, 1, v) * ss(0.2, 0, f) * fold(u * 2, v * 4), 2);
    if (k === 0 && Math.abs(u - 0.25) < 0.006) shade(1.12);
    if (k === 4 && v > 0.55) shade(0.75);
    if ((k === 1 || k === 5) && f < 0.006) shade(0.88);
  };
  const lowerLeg = (u, v, k) => {
    const f = Math.abs(u - 0.5), back = Math.min(u, 1 - u);
    if (k === 4) {
      tint(0.85 + 0.05 * ss(0.15, 0, f) * tent(v - 0.35, 0.3) - 0.12 * ss(0.15, 0, back) * ss(0.2, 0, v), 0);
      if (v > 0.86) over(0xdedbd3, 1, 0.92 - 0.12 * (Math.floor(v * 44) % 2));
      return;
    }
    tint(0.86 - 0.2 * ss(0.15, 0, v) * ss(0.15, 0, back) - 0.12 * ss(0.75, 1, v) * fold(u, v * 6) - 0.1 * ss(0.94, 1, v)
      - 0.06 * ss(0.12, 0, Math.abs(u - 0.75)), 2);
    if (k === 0 && Math.abs(u - 0.25) < 0.006) shade(1.12);
    if ((k === 1 || k === 5) && f < 0.006) shade(0.88);
  };
  const shoe = (u, v, k) => {
    const s = SHOES[k], f = Math.abs(u - 0.5), side = Math.min(u, 1 - u);
    tint(0, 3);
    over(side < 0.18 ? s[1] : s[0], 1, 0.92 + 0.16 * ss(0.3, 0, f) * ss(0.55, 0.9, v) - 0.12 * ss(0.3, 0, v) * ss(0.2, 0.4, f));
    if (Math.abs(side - 0.18) < 0.012) shade(0.6);
    if ((k === 0 || k === 3 || k === 4) && f < 0.06 && v > 0.12 && v < 0.55) shade(Math.floor(v * 40) % 2 ? 0.75 : 1.05);
    if ((k === 0 || k === 4) && Math.abs(f - 0.22) < 0.02 && v > 0.25 && v < 0.6) over(0x7a7d85, 0.8);
  };
  HUMAN_OUTFIT_TILES.forEach(([ox, oy], k) => {
    region(ox, oy, 128, 60, (u, v) => torso(u, v, k));
    region(ox, oy + 60, 128, 28, (u, v) => pelvis(u, v, k));
    region(ox, oy + 88, 128, 40, () => tint(0.8, 1));
    region(ox + 128, oy, 48, 36, (u, v) => upperArm(u, v, k));
    region(ox + 128, oy + 36, 48, 32, (u, v) => lowerArm(u, v, k));
    region(ox + 128, oy + 68, 48, 20, hand);
    region(ox + 176, oy, 80, 40, (u, v) => upperLeg(u, v, k));
    region(ox + 176, oy + 40, 80, 48, (u, v) => lowerLeg(u, v, k));
    region(ox + 128, oy + 88, 128, 40, (u, v) => shoe(u, v, k));
  });
  const texture = (data, srgb) => {
    const t = new THREE.DataTexture(new Uint8Array(data.buffer), S, S, THREE.RGBAFormat);
    t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    t.magFilter = THREE.LinearFilter;
    t.minFilter = THREE.LinearMipmapLinearFilter;
    t.generateMipmaps = true;
    t.needsUpdate = true;
    return t;
  };
  return { paint: texture(paint, true), mask: texture(mask, false) };
}

// Shared by the lit and shadow-depth materials: per-vertex rig data, per-instance pose, gait and look.
export const HUMAN_VERTEX_PARS = /* glsl */`
      attribute vec4 rig;
      attribute vec3 pivot;
      attribute vec4 iPose;
      attribute vec4 iGait;
      attribute vec4 iLook;
      attribute vec4 iAct;   // fight (humanFightAct): punch reach, punching arm (+1 left, -1 right), guard share; pet (humanPetPack)
      vec2 humanTurn(vec2 p, float a) { float c = cos(a), s = sin(a); return vec2(p.x * c - p.y * s, p.x * s + p.y * c); }
      // rig space to world for this instance: build, walk cycle (joints turn about x), fight arms, lean, bob, size, facing
      void humanPose(inout vec3 p, inout vec3 n) {
        float girth = rig.x > 0.5 ? 0.8 + floor(iLook.w / 64.0) / 200.0 : 1.0;
        p.xz *= girth; n.xz /= girth;
        // iGait.w: the run share when >= 0, the crouch share when < 0 (the player's stance never mixes them)
        float run = max(iGait.w, 0.0), crouch = max(-iGait.w, 0.0);
        float t = iGait.y, sw = iGait.z * (1.0 - ${(1 - HUMAN_CROUCH.swingKept).toFixed(3)} * crouch), s = sin(t) * rig.z, c = cos(t) * rig.z;
        // pet (iAct.w, humanPetPack): its reach share; the body bends further at the waist by it, to the pet's bend level
        float petReach = mod(iAct.w, 64.0) / 63.0;
        float petBend = ${HUMAN_PET.bend[0].toFixed(3)} + ${((HUMAN_PET.bend[1] - HUMAN_PET.bend[0]) / (PET_BEND_LEVELS - 1)).toFixed(4)} * mod(floor(iAct.w / 64.0), ${PET_BEND_LEVELS.toFixed(1)});
        float a1 = 0.0, a2 = 0.0, a3 = 0.0, petTurn = 0.0;
        if (rig.y > 1.5) {
          a1 = -sw * s;
          a2 = sw * (0.3 + (2.1 + 1.4 * run) * max(c, 0.0));
          a3 = -(a1 + a2) * 0.8 - 0.45 * sw * s;
          a1 += ${HUMAN_CROUCH.hip.toFixed(3)} * crouch;
          a2 += ${HUMAN_CROUCH.knee.toFixed(3)} * crouch;
          a3 -= ${(HUMAN_CROUCH.hip + HUMAN_CROUCH.knee).toFixed(3)} * crouch;
        } else if (rig.y > 0.5) {
          a1 = sw * (0.85 + 0.5 * run) * s + ${HUMAN_CROUCH.arm.toFixed(3)} * crouch;
          a2 = -(0.14 + sw * (0.3 + 0.35 * max(-s, 0.0)) + 1.15 * run) + ${HUMAN_CROUCH.elbow.toFixed(3)} * crouch;
          // fight: both fists up in the guard, the punching arm thrown straight out by the reach
          float reach = iAct.x * step(0.5, iAct.y * rig.z), fight = max(iAct.z, reach);
          a1 = mix(a1, mix(${HUMAN_FIGHT.guardShoulder.toFixed(3)}, ${HUMAN_FIGHT.punchShoulder.toFixed(3)}, reach), fight);
          a2 = mix(a2, mix(${HUMAN_FIGHT.guardElbow.toFixed(3)}, ${HUMAN_FIGHT.punchElbow.toFixed(3)}, reach), fight);
          // pet: the petting arm takes the solved shoulder angle and the pet's elbow by the reach share, and turns about
          // its shoulder's vertical by the sweep angle
          float pet = petReach * step(0.5, ${HUMAN_PET.arm.toFixed(1)} * rig.z);
          a1 = mix(a1, ${HUMAN_PET.shoulder[0].toFixed(3)} + ${(HUMAN_PET.shoulder[1] - HUMAN_PET.shoulder[0]).toFixed(3)} * mod(floor(iAct.w / 256.0), 256.0) / 255.0, pet);
          a2 = mix(a2, ${HUMAN_PET.elbow.toFixed(3)}, pet);
          petTurn = pet * (floor(iAct.w / 65536.0) / 255.0 * ${(2 * HUMAN_PET.turnMax).toFixed(3)} - ${HUMAN_PET.turnMax.toFixed(3)});
        }
        a2 *= step(1.5, rig.w); a3 *= step(2.5, rig.w);
        vec2 q = p.yz;
        if (rig.w > 0.5) {
          q = vec2(pivot.z, 0.0) + humanTurn(q - vec2(pivot.z, 0.0), a3);
          q = vec2(pivot.y, 0.0) + humanTurn(q - vec2(pivot.y, 0.0), a2);
          q = vec2(pivot.x, 0.0) + humanTurn(q - vec2(pivot.x, 0.0), a1);
        }
        // the petting arm's sweep, before the lean (as humanPetHand)
        if (petTurn != 0.0) {
          vec2 sh = vec2(rig.z * ${HUMAN_RIG.shoulderX.toFixed(3)} * girth, 0.0);
          p.yz = q;
          p.xz = sh + humanTurn(p.xz - sh, petTurn);
          q = p.yz;
        }
        // upper body (head, neck, torso, arms) leans with the gait; in a crouch or a pet's bend the pelvis (3) tilts with
        // it, so the waist stays joined and the pelvis's open top stays inside the torso
        float bendLean = ${HUMAN_CROUCH.lean.toFixed(3)} * crouch + petBend * petReach;
        float lean = (rig.x < 2.5 || abs(rig.y - 1.0) < 0.5) ? sw * 0.12 + run * 0.16 + bendLean + ${HUMAN_FIGHT.punchLean.toFixed(3)} * iAct.x
          : (abs(rig.x - 3.0) < 0.5 ? bendLean : 0.0);
        q = vec2(${HUMAN_RIG.hip.toFixed(3)}, 0.0) + humanTurn(q - vec2(${HUMAN_RIG.hip.toFixed(3)}, 0.0), lean);
        p.yz = q;
        p.y -= ${HUMAN_LEG.toFixed(3)} * (1.0 - cos(sw * sin(t))) * 0.85 + ${HUMAN_CROUCH_DROP.toFixed(3)} * crouch;
        n.yz = humanTurn(n.yz, a1 + a2 + a3);
        n.xz = humanTurn(n.xz, petTurn);
        n.yz = humanTurn(n.yz, lean);
        float cy = cos(iPose.w), sy = sin(iPose.w);
        p = vec3(p.x * cy + p.z * sy, p.y, p.z * cy - p.x * sy) * iGait.x + iPose.xyz;
        n = vec3(n.x * cy + n.z * sy, n.y, n.z * cy - n.x * sy);
      }
      #ifndef HUMAN_DEPTH
      varying vec2 vHumanUv;
      varying vec3 vHumanSkin, vHumanShirt, vHumanPants;
      vec3 humanColor(float c) { vec3 v = floor(c / vec3(65536.0, 256.0, 1.0)); v.yz -= v.xy * 256.0; return pow(v / 255.0, vec3(2.2)); }
      #endif
    `;
export const HUMAN_VERTEX_MAIN = /* glsl */`
      vec3 objectNormal = vec3(normal);
      vec3 humanPos = vec3(position);
      humanPose(humanPos, objectNormal);
      float hBuild = floor(iLook.w / 64.0), hRest = iLook.w - hBuild * 64.0, hOutfit = floor(hRest / 8.0), hFace = hRest - hOutfit * 8.0;
      vec2 hTile = rig.x < 1.5 ? vec2(mod(hFace, 2.0) * ${HUMAN_FACE_TILE[0]}.0, floor(hFace / 2.0) * ${HUMAN_FACE_TILE[1]}.0)
        : (hOutfit < 1.5 ? vec2(${HUMAN_ATLAS / 2}.0, hOutfit * ${HUMAN_BODY_TILE[1]}.0)
          : vec2(mod(hOutfit, 2.0) * ${HUMAN_BODY_TILE[0]}.0, ${HUMAN_ATLAS / 2}.0 + floor(hOutfit / 2.0 - 1.0) * ${HUMAN_BODY_TILE[1]}.0));
      vHumanUv = (hTile + uv * (rig.x < 1.5 ? vec2(${HUMAN_FACE_TILE[0]}.0, ${HUMAN_FACE_TILE[1]}.0) : vec2(${HUMAN_BODY_TILE[0]}.0, ${HUMAN_BODY_TILE[1]}.0))) / ${HUMAN_ATLAS}.0;
      vHumanSkin = humanColor(iLook.x);
      vHumanShirt = humanColor(iLook.y);
      vHumanPants = humanColor(iLook.z);
    `;

// Lambert (scene sun, hemisphere and fog, shadows when the map is on) plus a depth twin so shadows follow the pose.
// The people code goes in front of three's '#include <common>' line, so no minifier can glue its closing #endif to a directive.
export function humanMaterials(paint, mask) {
  const lit = new THREE.MeshLambertMaterial();
  lit.onBeforeCompile = sh => {
    sh.uniforms.humanPaint = { value: paint };
    sh.uniforms.humanMask = { value: mask };
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', HUMAN_VERTEX_PARS + '\n#include <common>')
      .replace('#include <beginnormal_vertex>', HUMAN_VERTEX_MAIN)
      .replace('#include <begin_vertex>', 'vec3 transformed = humanPos;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `uniform sampler2D humanPaint, humanMask;
          varying vec2 vHumanUv;
          varying vec3 vHumanSkin, vHumanShirt, vHumanPants;
#include <common>`).replace('#include <map_fragment>', `
          vec3 hMask = texture2D(humanMask, vHumanUv).rgb;
          diffuseColor.rgb *= texture2D(humanPaint, vHumanUv).rgb * (vHumanSkin * hMask.r + vHumanShirt * hMask.g + vHumanPants * hMask.b
            + max(0.0, 1.0 - hMask.r - hMask.g - hMask.b));`);
  };
  lit.customProgramCacheKey = () => 'human-rig-lit';
  const depth = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking });
  depth.onBeforeCompile = sh => {
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#define HUMAN_DEPTH\n' + HUMAN_VERTEX_PARS + '\n#include <common>').replace('#include <begin_vertex>',
      'vec3 transformed = vec3(position); vec3 humanNormal = vec3(normal); humanPose(transformed, humanNormal);');
  };
  depth.customProgramCacheKey = () => 'human-rig-depth';
  return { lit, depth };
}

// Shared by the billboard lit and shadow-depth materials: per-card pose, frame and tints.
export const BB_VERTEX_PARS = /* glsl */`
      attribute vec4 bPose;    // rig origin x, y, z, facing
      attribute vec4 bFrame;   // frame side and bottom (metres), look, pose
      uniform vec2 bbGrid;     // atlas frames across and down
      varying vec2 vBbUv;
      #ifndef BB_DEPTH
      attribute vec4 bTint;    // packed sRGB: people skin, shirt, pants, hair; animals their coat
      varying vec3 vBbAxes;    // toward the baked view's eye (x, z), mirror sign: orients the frame's normals
      varying vec3 vBbTint0, vBbTint1, vBbTint2, vBbTint3;
      vec3 bbColor(float c) { vec3 v = floor(c / vec3(65536.0, 256.0, 1.0)); v.yz -= v.xy * 256.0; return pow(v / 255.0, vec3(2.2)); }
      #endif
    `;
// Sets bbPos (the card corner, turned about y to face the viewer), bbAxis (the body's centre line at that height) and bbToward.
export const BB_VERTEX_MAIN = /* glsl */`
      // toward the viewer in xz: to a perspective eye, or back along an orthographic one (the sun's shadow camera)
      vec2 bbTo = isPerspectiveMatrix(projectionMatrix) ? cameraPosition.xz - bPose.xz : vec2(viewMatrix[0][2], viewMatrix[2][2]);
      float bbLen = length(bbTo);
      bbTo = bbLen > 1e-6 ? bbTo / bbLen : vec2(0.0, 1.0);
      float bbCos = cos(bPose.w), bbSin = sin(bPose.w);
      // the view in the body's frame (0 front, + its left) snapped to a baked one; right-hand views mirror a left-hand frame
      float bbDir = floor(atan(bbTo.x * bbCos - bbTo.y * bbSin, bbTo.x * bbSin + bbTo.y * bbCos) * ${(BB_DIRS / (2 * Math.PI)).toFixed(6)} + 0.5);
      float bbFlip = bbDir < -0.5 ? -1.0 : 1.0;
      // a mirror swaps the legs, so a walk frame shows half a cycle on
      float bbPose = bbFlip < 0.0 && bFrame.w > 0.5 ? 1.0 + floor(mod(bFrame.w + ${(BB_PHASES / 2 - 0.5).toFixed(1)}, ${BB_PHASES}.0)) : bFrame.w;
      float bbCell = bFrame.z * ${BB_BLOCK}.0 + abs(bbDir) * ${BB_POSES}.0 + bbPose;
      float bbRow = floor((bbCell + 0.5) / bbGrid.x);
      vBbUv = vec2(bbCell - bbRow * bbGrid.x + (bbFlip > 0.0 ? position.x : 1.0 - position.x), bbRow + position.y) / bbGrid;
      vec3 bbToward = vec3(bbTo.x, 0.0, bbTo.y);
      vec3 bbAxis = bPose.xyz + vec3(0.0, bFrame.y + position.y * bFrame.x, 0.0);
      vec3 bbPos = bbAxis + vec3(bbTo.y, 0.0, -bbTo.x) * ((position.x - 0.5) * bFrame.x);
      #ifndef BB_DEPTH
      float bbView = bPose.w + bbDir * ${(2 * Math.PI / BB_DIRS).toFixed(6)};
      vBbAxes = vec3(sin(bbView), cos(bbView), bbFlip);
      vBbTint0 = bbColor(bTint.x); vBbTint1 = bbColor(bTint.y); vBbTint2 = bbColor(bTint.z); vBbTint3 = bbColor(bTint.w);
      #endif
    `;
// Bake output, coverage-weighted (cleared texels stay 0): mode 0 sqrt tint weights and coverage, 1 sqrt untinted colour and hair weight, 2 normal.
export const BB_BAKE_OUT = /* glsl */`
      uniform int bakeMode;
      vec4 bakeOut(vec3 tints, vec3 fixedColor, float hairWeight, vec3 n) {
        if (bakeMode == 0) return vec4(sqrt(tints), 1.0);
        if (bakeMode == 1) return vec4(sqrt(fixedColor), sqrt(0.5 * hairWeight));
        return vec4(normalize(n) * 0.5 + 0.5, 1.0);
      }
    `;

// Lambert (scene sun, hemisphere, fog, shadows) on the atlas's normals and per-body tints, plus a depth twin cut to the frame's coverage.
export function billboardMaterials(atlases, grid) {
  const lit = new THREE.MeshLambertMaterial();
  lit.shadowSide = THREE.DoubleSide;   // when casting, the card turns to the sun, so neither face may be culled
  lit.onBeforeCompile = sh => {
    sh.uniforms.bbAtlas0 = { value: atlases[0] };
    sh.uniforms.bbAtlas1 = { value: atlases[1] };
    sh.uniforms.bbAtlas2 = { value: atlases[2] };
    sh.uniforms.bbGrid = { value: grid };
    // shadows are looked up on the body's centre line, so the card is not shadowed by its own sun-facing twin
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', BB_VERTEX_PARS + '\n#include <common>')
      .replace('#include <beginnormal_vertex>', BB_VERTEX_MAIN + '\nvec3 objectNormal = bbToward;')
      .replace('#include <begin_vertex>', 'vec3 transformed = bbPos;')
      .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\n#ifdef USE_SHADOWMAP\nworldPosition = vec4(bbAxis, 1.0);\n#endif');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `uniform sampler2D bbAtlas0, bbAtlas1, bbAtlas2;
          varying vec2 vBbUv;
          varying vec3 vBbAxes, vBbTint0, vBbTint1, vBbTint2, vBbTint3;
#include <common>`).replace('#include <map_fragment>', `
          vec4 bbCover = texture2D(bbAtlas0, vBbUv, ${BB_MIP_BIAS.toFixed(2)});
          if (bbCover.a < 0.5) discard;
          float bbInv = 1.0 / bbCover.a;
          vec3 bbW = bbCover.rgb * bbInv;
          vec4 bbFix = texture2D(bbAtlas1, vBbUv, ${BB_MIP_BIAS.toFixed(2)}) * bbInv;
          diffuseColor.rgb *= vBbTint0 * (bbW.r * bbW.r) + vBbTint1 * (bbW.g * bbW.g) + vBbTint2 * (bbW.b * bbW.b)
            + vBbTint3 * (2.0 * bbFix.a * bbFix.a) + bbFix.rgb * bbFix.rgb;`).replace('#include <normal_fragment_begin>', `#include <normal_fragment_begin>
          vec3 bbN = texture2D(bbAtlas2, vBbUv, ${BB_MIP_BIAS.toFixed(2)}).rgb * (2.0 * bbInv) - 1.0;
          bbN.x *= vBbAxes.z;
          normal = normalize((viewMatrix * vec4(vBbAxes.y * bbN.x + vBbAxes.x * bbN.z, bbN.y, vBbAxes.y * bbN.z - vBbAxes.x * bbN.x, 0.0)).xyz);`);
  };
  lit.customProgramCacheKey = () => 'npc-billboard-lit';
  const depth = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking });
  depth.onBeforeCompile = sh => {
    sh.uniforms.bbAtlas0 = { value: atlases[0] };
    sh.uniforms.bbGrid = { value: grid };
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#define BB_DEPTH\n' + BB_VERTEX_PARS + '\n#include <common>')
      .replace('#include <begin_vertex>', BB_VERTEX_MAIN + '\nvec3 transformed = bbPos;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `uniform sampler2D bbAtlas0;
          varying vec2 vBbUv;
#include <common>`).replace('#include <map_fragment>', `if (texture2D(bbAtlas0, vBbUv, ${BB_MIP_BIAS.toFixed(2)}).a < 0.5) discard;`);
  };
  depth.customProgramCacheKey = () => 'npc-billboard-depth';
  return { lit, depth };
}

export class AnimalRenderer {
  constructor() {
    this.MAX_INSTANCES = 12000;
    this.MATURITY_TICKS = NPC_MATURITY_TICKS;

    this.BOX_RIG_TYPES = ['deer', 'coyote'];   // drawn from box parts; people use the human rig (this.human)
    this.PART_NAMES = ['body', 'head', 'legFL', 'legFR', 'legBL', 'legBR'];
    this.LIMB_NAMES = ['legFL', 'legFR', 'legBL', 'legBR'];
    this.LIMB_SIGNS = [1, -1, -1, 1];

    const boxAt = (w, h, d, x, y, z, rx = 0, rz = 0) => {
      const g = new THREE.BoxGeometry(w, h, d);
      if (rx) g.rotateX(rx);
      if (rz) g.rotateZ(rz);
      g.translate(x, y, z);
      return g;
    };

    // DEER RIG: rig units, origin at the body centre, head toward +z; sized by NPC_SIZE.deer. Antlers: bucks only.
    const deerHead = mergeGeometries([
      boxAt(4.5, 8, 5, 0, 3.2, 1.5, 0.45),
      boxAt(5, 5, 7, 0, 7.8, 5),
      boxAt(3.4, 3.2, 4.5, 0, 6.9, 10),
      boxAt(0.9, 3.4, 2, 2.8, 11.2, 3, 0, -0.5),  // ears, tipped outward
      boxAt(0.9, 3.4, 2, -2.8, 11.2, 3, 0, 0.5)
    ], false);
    const deerBody = mergeGeometries([
      boxAt(10, 10, 26, 0, 0, 0),
      boxAt(3, 4.2, 1.8, 0, 3, -13.7, -0.45)
    ], false);
    const antlerSide = s => [
      boxAt(0.9, 4.5, 0.9, s * 2.1, 12.3, 3.6, 0, -s * 0.45),
      boxAt(0.8, 0.8, 5.5, s * 3.1, 14.4, 5.6),
      boxAt(0.7, 2.8, 0.7, s * 3.1, 16, 4.3),
      boxAt(0.7, 2.8, 0.7, s * 3.1, 16, 7.2)
    ];
    const deerAntlers = mergeGeometries([...antlerSide(1), ...antlerSide(-1)], false);

    // COYOTE RIG: rig units, origin at the body centre, head toward +z; lean body, pointed ears, drooping tail.
    const coyoteHead = mergeGeometries([
      boxAt(3.6, 5, 3.6, 0, 1.8, 0.6, 0.6),
      boxAt(4.6, 4.2, 5, 0, 4.4, 3.6),
      boxAt(2.2, 2, 4.5, 0, 3.6, 7.8),
      boxAt(1.4, 3, 0.8, 1.5, 7.8, 3, 0, -0.2),
      boxAt(1.4, 3, 0.8, -1.5, 7.8, 3, 0, 0.2)
    ], false);
    const coyoteBody = mergeGeometries([
      boxAt(7, 7, 18, 0, 0, 0),
      boxAt(2.6, 2.6, 8, 0, -2, -12.3, -0.5)
    ], false);

    this.GEOMETRIES = {
      deer: {
        body: deerBody,
        head: deerHead,
        leg: new THREE.BoxGeometry(2.4, 13, 2.4)
      },
      // coyote legs reach 11.5 below the body centre (SPECIES.coyote.lift)
      coyote: {
        body: coyoteBody,
        head: coyoteHead,
        leg: new THREE.BoxGeometry(1.8, 10, 1.8)
      }
    };

    this.MATERIALS = {
      deer: new THREE.MeshStandardMaterial({ color: 0xffffff, vertexColors: false }),
      coyote: new THREE.MeshStandardMaterial({ color: 0xffffff, vertexColors: false })
    };

    this.SEX_COLORS = {
      deer: { male: new THREE.Color(0x6f4a2a), female: new THREE.Color(0x93683f) },
      coyote: { male: new THREE.Color(0x8a7658), female: new THREE.Color(0xa38e6c) }
    };

    // Male-only parts: one extra mesh per type, placed with the head's matrix.
    this.ANTLERS = {
      deer: { geom: deerAntlers, mat: new THREE.MeshStandardMaterial({ color: 0xcbb793 }) }
    };

    this.PART_OFFSETS = {
      coyote: {
        head: new THREE.Vector3(0, 2, 8.5),
        legFL: new THREE.Vector3(-2.2, -6.5, 6.5),
        legFR: new THREE.Vector3(2.2, -6.5, 6.5),
        legBL: new THREE.Vector3(-2.2, -6.5, -6.5),
        legBR: new THREE.Vector3(2.2, -6.5, -6.5),
      },
      deer: {
        head: new THREE.Vector3(0, 2.5, 11.5),
        legFL: new THREE.Vector3(-3.2, -8.5, 10),
        legFR: new THREE.Vector3(3.2, -8.5, 10),
        legBL: new THREE.Vector3(-3.2, -8.5, -10),
        legBR: new THREE.Vector3(3.2, -8.5, -10),
      },
    };

    this.PIVOT_OFFSETS = {
      coyote: {
        legFL: new THREE.Vector3(-2.2, -1.5, 6.5),
        legFR: new THREE.Vector3(2.2, -1.5, 6.5),
        legBL: new THREE.Vector3(-2.2, -1.5, -6.5),
        legBR: new THREE.Vector3(2.2, -1.5, -6.5),
      },
      deer: {
        legFL: new THREE.Vector3(-3.2, -2, 10),
        legFR: new THREE.Vector3(3.2, -2, 10),
        legBL: new THREE.Vector3(-3.2, -2, -10),
        legBR: new THREE.Vector3(3.2, -2, -10),
      },
    };

    this.LIMB_HALF = { deer: 6.5, coyote: 5 };
    this.WALK = { deer: 0.45, coyote: 0.55 };   // walking leg swing, radians (cadence comes from speed, see GAIT)
    this.LEG_LEN = { deer: 13, coyote: 10 };

    this.meshes = {};
    this.antlers = {};
    this.renderCache = { deer: null, coyote: null };

    // Rest-pose bounds of each box rig in rig units: body, head and legs at their offsets.
    this.REST_BOUNDS = {};
    for (const type of this.BOX_RIG_TYPES) {
      const box = new THREE.Box3(), part = new THREE.Box3(), g = this.GEOMETRIES[type], at = this.PART_OFFSETS[type];
      const add = (geo, offset) => {
        if (!geo.boundingBox) geo.computeBoundingBox();
        box.union(part.copy(geo.boundingBox).translate(offset));
      };
      add(g.body, new THREE.Vector3());
      add(g.head, at.head);
      for (const leg of this.LIMB_NAMES) add(g.leg, at[leg]);
      this.REST_BOUNDS[type] = box;
    }

    this._mat4 = new THREE.Matrix4();
    this._local = new THREE.Vector3();
    this._world = new THREE.Vector3();
    this._quat = new THREE.Quaternion();
    this._yAxis = new THREE.Vector3(0, 1, 0);
    this._scale = new THREE.Vector3(1, 1, 1);
    this._quatLeg = new THREE.Quaternion();
    this._quatFinal = new THREE.Quaternion();
    this._xAxis = new THREE.Vector3(1, 0, 0);
    this._pivot = new THREE.Vector3();
    this._root = new THREE.Vector3();
    this._quatBody = new THREE.Quaternion();
    this._quatTip = new THREE.Quaternion();
    this._quatHead = new THREE.Quaternion();
    this._fightPose = {};
    this.LIMB_FRONT = this.LIMB_NAMES.map(n => n[3] === 'F');   // legFL, legFR: front legs

    // per species id: that type's fixed tables plus the counters one update() pass fills
    this.passById = NPC_TYPES.map(type => ({
      type, offsets: this.PART_OFFSETS[type], pivots: this.PIVOT_OFFSETS[type], colors: this.SEX_COLORS[type],
      walkSwing: this.WALK[type], legLen: this.LEG_LEN[type], limbHalf: this.LIMB_HALF[type],
      cardFrame: BB_FRAME[type], cardLooks: null, cardTints: null,   // billboard frame (rig units), look and coat tint by sex
      // fight move; box rigs tip about the anchor joint's height and depth (rig units), or the body centre
      fight: NPC_FIGHT_MOVES[type],
      fightAnchor: NPC_FIGHT_MOVES[type].anchor ? this.PIVOT_OFFSETS[type][NPC_FIGHT_MOVES[type].anchor] : null,
      im: null, cache: null, antlers: null,
      idx: 0, billboarded: 0, aidx: 0, colorsDirty: false, full: false
    }));

    // PEOPLE: one instanced mesh for everyone nearer than perf.npcLodDist; per instance a pose, gait and look (4 floats each).
    const rest = buildHumanGeometry(), atlas = paintHumanAtlas(), mats = humanMaterials(atlas.paint, atlas.mask);
    const geometry = new THREE.InstancedBufferGeometry();
    geometry.setIndex(rest.index);
    for (const k in rest.attributes) geometry.setAttribute(k, rest.attributes[k]);
    const perInstance = name => {
      const attr = new THREE.InstancedBufferAttribute(new Float32Array(this.MAX_INSTANCES * 4), 4);
      attr.setUsage(THREE.DynamicDrawUsage);
      geometry.setAttribute(name, attr);
      return attr;
    };
    geometry.instanceCount = 0;
    const mesh = new THREE.Mesh(geometry, mats.lit);
    mesh.customDepthMaterial = mats.depth;
    mesh.castShadow = mesh.receiveShadow = true;
    mesh.frustumCulled = false;
    mesh.visible = false;
    this.human = {
      rest, geometry, mesh,
      pose: perInstance('iPose'),   // x, y, z of the rig origin, facing angle
      gait: perInstance('iGait'),   // metres per rig unit, phase, hip swing, run share
      look: perInstance('iLook'),   // skin, shirt, pants (packed sRGB), face/outfit/build code
      act: perInstance('iAct'),     // fight pose (humanFightAct)
      lookOwner: new Array(this.MAX_INSTANCES).fill(null)   // who each slot's look was written for
    };

    // FAR BILLBOARDS: looks in atlas order: people by outfit and sex, then each box rig's (does then bucks; coyote coats are tints)
    const looks = [];
    for (let outfit = 0; outfit < HUMAN_OUTFITS; outfit++) for (let female = 0; female < 2; female++) looks.push({ type: 'human', outfit, female: female === 1 });
    for (const type of this.BOX_RIG_TYPES) {
      const p = this.passById[NPC_TYPE_IDS[type]], c = this.SEX_COLORS[type];
      p.cardLooks = { female: looks.length, male: looks.length };
      looks.push({ type, male: false });
      if (this.ANTLERS[type]) { p.cardLooks.male = looks.length; looks.push({ type, male: true }); }
      p.cardTints = { female: c.female.getHex(), male: c.male.getHex() };
    }
    const grid = new THREE.Vector2(Math.floor(2048 / BB_CELL), 0);
    grid.y = Math.ceil(looks.length * BB_BLOCK / grid.x);
    const atlases = this.bakeBillboards(looks, grid, rest, atlas.paint, atlas.mask);
    // a restored WebGL context comes back with empty render targets: draw the frames again
    renderer.domElement.addEventListener('webglcontextrestored', () => this.bakeBillboards(looks, grid, rest, atlas.paint, atlas.mask, atlases));
    const cardMats = billboardMaterials(atlases.map(t => t.texture), grid);
    const cards = new THREE.InstancedBufferGeometry();
    cards.setIndex([0, 1, 2, 0, 2, 3]);
    cards.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, 1, 0, 0, 1, 1, 0, 0, 1, 0], 3));   // corner: x right, y up
    const cardMax = this.MAX_INSTANCES * NPC_TYPE_COUNT;
    const perCard = name => {
      const attr = new THREE.InstancedBufferAttribute(new Float32Array(cardMax * 4), 4);
      attr.setUsage(THREE.DynamicDrawUsage);
      cards.setAttribute(name, attr);
      return attr;
    };
    cards.instanceCount = 0;
    const cardMesh = new THREE.Mesh(cards, cardMats.lit);
    cardMesh.customDepthMaterial = cardMats.depth;
    cardMesh.castShadow = cardMesh.receiveShadow = true;
    cardMesh.frustumCulled = false;
    cardMesh.visible = false;
    this.billboards = {
      geometry: cards, mesh: cardMesh, max: cardMax,
      pose: perCard('bPose'),     // x, y, z of the rig origin, facing angle
      frame: perCard('bFrame'),   // frame side and bottom (metres), look, pose
      tint: perCard('bTint'),     // packed sRGB tints
      tintOwner: new Array(cardMax).fill(null)   // who each slot's tints were written for
    };
  }

  // Draw every billboard frame with the real rigs (each look from BB_BAKED_DIRS views, standing and walking) into three atlas targets.
  bakeBillboards(looks, grid, rest, paint, mask, atlases = null) {
    const W = grid.x * BB_CELL, H = grid.y * BB_CELL;
    const bakeScene = new THREE.Scene(), cam = new THREE.OrthographicCamera(0, grid.x, grid.y, 0, -10, 10);
    const mode = { value: 0 }, trash = [];
    // a frame's cell in atlas units: where the rig origin goes, and atlas units per rig unit
    const place = (cell, type) => {
      const [side, bottom] = BB_FRAME[type];
      return [cell % grid.x + 0.5, Math.floor(cell / grid.x) - bottom / side, 1 / side];
    };
    const phase = q => (q - 1) * 2 * Math.PI / BB_PHASES;   // walk pose q's gait phase
    const turn = d => -d * 2 * Math.PI / BB_DIRS;            // the facing that shows view d to a camera looking down -z

    // people: the lit rig's geometry and vertex shader, one instance per frame
    const people = looks.flatMap((l, i) => l.type === 'human' ? [i] : []);
    const hg = new THREE.InstancedBufferGeometry().copy(rest);
    const n = people.length * BB_BLOCK, iPose = new Float32Array(n * 4), iGait = new Float32Array(n * 4), iLook = new Float32Array(n * 4);
    let j = 0;
    for (const li of people) {
      const L = { tone: 0, variant: BB_FACE_VARIANT, female: looks[li].female, buildDev: 0, outfit: looks[li].outfit, skinRGB: 0, code: 0 };
      packHumanLook(L);
      for (let d = 0; d < BB_BAKED_DIRS; d++) for (let q = 0; q < BB_POSES; q++, j += 4) {
        const [x, y, k] = place(li * BB_BLOCK + d * BB_POSES + q, 'human');
        iPose.set([x, y, 0, turn(d)], j);
        iGait.set([k, q ? phase(q) : 0, q ? BB_HUMAN_SWING : 0, 0], j);
        iLook.set([HUMAN_HAIR[+L.female][BB_FACE_VARIANT], 0, 0, L.code], j);   // the baked face's hair colour rides in the skin slot
      }
    }
    hg.setAttribute('iPose', new THREE.InstancedBufferAttribute(iPose, 4));
    hg.setAttribute('iGait', new THREE.InstancedBufferAttribute(iGait, 4));
    hg.setAttribute('iLook', new THREE.InstancedBufferAttribute(iLook, 4));
    hg.setAttribute('iAct', new THREE.InstancedBufferAttribute(new Float32Array(n * 4), 4));   // baked bodies do not fight
    hg.instanceCount = n;
    const humanBake = new THREE.ShaderMaterial({
      uniforms: { humanPaint: { value: paint }, humanMask: { value: mask }, bakeMode: mode },
      vertexShader: HUMAN_VERTEX_PARS + `
            varying vec3 vBakeNormal;
            void main() {
              ${HUMAN_VERTEX_MAIN}
              vBakeNormal = objectNormal;
              gl_Position = projectionMatrix * viewMatrix * vec4(humanPos, 1.0);
            }`,
      fragmentShader: `uniform sampler2D humanPaint, humanMask;
            varying vec2 vHumanUv;
            varying vec3 vHumanSkin, vBakeNormal;
            ${BB_BAKE_OUT}
            void main() {
              vec3 paint = texture2D(humanPaint, vHumanUv).rgb;
              vec4 mask = texture2D(humanMask, vHumanUv);
              float grey = dot(paint, vec3(0.2126, 0.7152, 0.0722));
              float hairWeight = mask.a * grey / max(dot(vHumanSkin, vec3(0.2126, 0.7152, 0.0722)), 1e-3);
              gl_FragColor = bakeOut(grey * mask.rgb, paint * max(0.0, 1.0 - mask.r - mask.g - mask.b - mask.a), hairWeight, vBakeNormal);
            }`
    });
    const hm = new THREE.Mesh(hg, humanBake);
    hm.frustumCulled = false;
    bakeScene.add(hm);
    trash.push(hg, humanBake);

    // animals: the near rigs' parts and posing (poseBoxRig), one instance per frame; antlers only in bucks' frames
    const boxBake = (tinted, fixedColor) => {
      const m = new THREE.ShaderMaterial({
        uniforms: { bakeMode: mode, bakeTinted: { value: tinted }, bakeFixed: { value: fixedColor } },
        vertexShader: `varying vec3 vBakeNormal;
              void main() {
                vBakeNormal = (instanceMatrix * vec4(normal, 0.0)).xyz;
                gl_Position = projectionMatrix * viewMatrix * instanceMatrix * vec4(position, 1.0);
              }`,
        fragmentShader: `uniform float bakeTinted;
              uniform vec3 bakeFixed;
              varying vec3 vBakeNormal;
              ${BB_BAKE_OUT}
              void main() { gl_FragColor = bakeOut(vec3(bakeTinted, 0.0, 0.0), bakeFixed * (1.0 - bakeTinted), 0.0, vBakeNormal); }`
      });
      trash.push(m);
      return m;
    };
    const coat = boxBake(1, new THREE.Color(0x000000));   // the coat colour is each body's tint
    for (const type of this.BOX_RIG_TYPES) {
      const p = this.passById[NPC_TYPE_IDS[type]], g = this.GEOMETRIES[type], ant = this.ANTLERS[type];
      const own = looks.flatMap((l, i) => l.type === type ? [i] : []), count = own.length * BB_BLOCK;
      const parts = {};
      for (const name of this.PART_NAMES) parts[name] = new THREE.InstancedMesh(name === 'body' ? g.body : name === 'head' ? g.head : g.leg, coat, count);
      const antlers = ant ? new THREE.InstancedMesh(ant.geom, boxBake(0, ant.mat.color), count) : null;
      let i = 0, ai = 0;
      for (const li of own) for (let d = 0; d < BB_BAKED_DIRS; d++) for (let q = 0; q < BB_POSES; q++, i++) {
        const [x, y, k] = place(li * BB_BLOCK + d * BB_POSES + q, type);
        const male = antlers !== null && looks[li].male;
        this._world.set(x, y, 0);
        this._quat.setFromAxisAngle(this._yAxis, turn(d));
        this.poseBoxRig(p, parts, i, male ? antlers : null, ai, k, q ? Math.sin(phase(q)) * p.walkSwing * 0.5 : 0);
        if (male) ai++;
      }
      for (const m of Object.values(parts)) m.count = i;
      if (antlers) antlers.count = ai;
      for (const m of antlers ? [...Object.values(parts), antlers] : Object.values(parts)) {
        m.frustumCulled = false;
        bakeScene.add(m);
        trash.push(m);
      }
    }

    // draw each output into a multisampled target (antialiased coverage), then copy it into its atlas, which builds the mips
    const target = new THREE.WebGLRenderTarget(W, H, { samples: Math.min(4, renderer.capabilities.maxSamples || 0) });
    if (!atlases) atlases = [0, 1, 2].map(() => new THREE.WebGLRenderTarget(W, H, {
      depthBuffer: false, generateMipmaps: true, minFilter: THREE.LinearMipmapLinearFilter, magFilter: THREE.LinearFilter
    }));
    const copy = new THREE.ShaderMaterial({
      uniforms: { src: { value: target.texture } },
      vertexShader: 'varying vec2 vUv;\nvoid main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
      fragmentShader: 'uniform sampler2D src;\nvarying vec2 vUv;\nvoid main() { gl_FragColor = texture2D(src, vUv); }',
      depthTest: false, depthWrite: false
    });
    const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), copy), copyScene = new THREE.Scene();
    quad.frustumCulled = false;
    copyScene.add(quad);
    trash.push(target, copy, quad.geometry);
    const prevTarget = renderer.getRenderTarget(), prevColor = renderer.getClearColor(new THREE.Color());
    const prevAlpha = renderer.getClearAlpha(), prevAuto = renderer.autoClear;
    renderer.autoClear = true;
    renderer.setClearColor(0x000000, 0);
    for (let m = 0; m < atlases.length; m++) {
      mode.value = m;
      renderer.setRenderTarget(target);
      renderer.render(bakeScene, cam);
      renderer.setRenderTarget(atlases[m]);
      renderer.render(copyScene, cam);
    }
    renderer.setRenderTarget(prevTarget);
    renderer.setClearColor(prevColor, prevAlpha);
    renderer.autoClear = prevAuto;
    for (const t of trash) t.dispose();
    return atlases;
  }

  // Near box rig at this._world / this._quat, kp metres per rig unit: body, head (and antlers if given), four legs swung by legH.
  // `move` (sampleFightKeys) tips, lifts and lunges the body, tips the head and sets the legs from straight down.
  poseBoxRig(p, im, idx, antlers, aidx, kp, legH, move = null) {
    this._scale.set(kp, kp, kp);
    let bodyQ = this._quat, root = this._world, headQ = this._quat;
    if (move) {
      bodyQ = this._quatBody.multiplyQuaternions(this._quat, this._quatTip.setFromAxisAngle(this._xAxis, move.pitch));
      headQ = this._quatHead.multiplyQuaternions(bodyQ, this._quatTip.setFromAxisAngle(this._xAxis, move.head));
      // the root moves by the rise and lunge, plus what keeps the anchor joint where it stands at rest
      let oy = move.rise, oz = move.lunge;
      const an = p.fightAnchor;
      if (an) {
        const c = Math.cos(move.pitch), s = Math.sin(move.pitch);
        oy += an.y - (an.y * c - an.z * s);
        oz += an.z - (an.y * s + an.z * c);
      }
      root = this._root.set(0, oy * kp, oz * kp).applyQuaternion(this._quat).add(this._world);
    }
    this._mat4.compose(root, bodyQ, this._scale);
    im.body.setMatrixAt(idx, this._mat4);

    this._local.copy(p.offsets.head);
    this._local.multiplyScalar(kp).applyQuaternion(bodyQ).add(root);
    this._mat4.compose(this._local, headQ, this._scale);
    im.head.setMatrixAt(idx, this._mat4);
    if (antlers) antlers.setMatrixAt(aidx, this._mat4);

    // FL/BR and FR/BL swing opposite: one sin/cos pair per body instead of four setFromAxisAngle calls
    const legS = Math.sin(legH), legC = Math.cos(legH);
    const legSign = this.LIMB_SIGNS;
    for (let pi = 0; pi < this.LIMB_NAMES.length; pi++) {
      const part = this.LIMB_NAMES[pi];
      if (move) {
        // the key's angle is from straight down in the world, so the body's tip comes off it
        const half = ((this.LIMB_FRONT[pi] ? move.front : move.back) - move.pitch) / 2 + legSign[pi] * legH;
        this._quatLeg.set(Math.sin(half), 0, 0, Math.cos(half));
      } else this._quatLeg.set(legSign[pi] * legS, 0, 0, legC);
      this._quatFinal.multiplyQuaternions(bodyQ, this._quatLeg);

      this._pivot.copy(p.pivots[part]);
      this._pivot.multiplyScalar(kp).applyQuaternion(bodyQ).add(root);

      this._local.set(0, -p.limbHalf * kp, 0).applyQuaternion(this._quatFinal);
      this._local.add(this._pivot);

      this._mat4.compose(this._local, this._quatFinal, this._scale);
      im[part].setMatrixAt(idx, this._mat4);
    }
  }

  // Rest-pose bounds of a type's whole body in rig units (blob shadow footprints).
  restBox(type) {
    if (type !== 'human') return this.REST_BOUNDS[type];
    const g = this.human.rest;
    if (!g.boundingBox) g.computeBoundingBox();
    return g.boundingBox;
  }

  // Queue items [lo, n) of an instanced attribute for upload, keeping any range not yet drawn.
  static queueUpload(attr, lo, n) {
    const per = attr.itemSize, pending = attr.updateRanges;
    let a = lo * per, b = n * per;
    for (let i = 0; i < pending.length; i++) {
      const r = pending[i];
      if (r.start < a) a = r.start;
      if (r.start + r.count > b) b = r.start + r.count;
    }
    attr.clearUpdateRanges();
    attr.addUpdateRange(a, b - a);
    attr.needsUpdate = true;
  }

  // A person's gait from the ground actually covered this tick: phase by distance over stride, so feet keep pace (render only).
  stepGait(a, deltaTime, kp) {
    const dx = a.position.x - a.gaitX, dz = a.position.z - a.gaitZ;
    a.gaitX = a.position.x; a.gaitZ = a.position.z;
    if (!deltaTime) return;
    const d = Math.sqrt(dx * dx + dz * dz);
    if (!(d < HUMAN_GAIT_JUMP)) return;   // first sight or a teleport: hold the pose
    if (d === 0 && a.gaitSpeed < 1e-3) { a.gaitSpeed = a.gaitSwing = a.gaitRun = 0; return; }   // settled idle
    const leg = HUMAN_LEG * kp;           // hip to sole, metres
    a.gaitSpeed += (d / NPC_TICK_S - a.gaitSpeed) * HUMAN_GAIT_EASE;
    const vl = a.gaitSpeed / leg;          // leg lengths per second
    const stride = Math.min(HUMAN_STRIDE_MAX, HUMAN_STRIDE_BASE + HUMAN_STRIDE_PER_V * vl);
    const ph = a.gaitPhase + Animal.TWO_PI * Math.min(d / (stride * leg), HUMAN_CADENCE_MAX * NPC_TICK_S);
    a.gaitPhase = ph >= Animal.TWO_PI ? ph - Animal.TWO_PI : ph;
    a.gaitSwing = Math.min(HUMAN_SWING_MAX, Math.asin(Math.min(1, stride / 4))) * Math.min(1, a.gaitSpeed / HUMAN_IDLE_SPEED);
    a.gaitRun = Math.max(0, Math.min(1, (vl - 2.6) / 2.6));
  }

  init() {
    const H = this.human;
    if (!H.mesh.parent) scene.add(H.mesh);
    H.lookOwner.fill(null);
    H.geometry.instanceCount = 0;
    H.mesh.visible = false;
    const B = this.billboards;
    if (!B.mesh.parent) scene.add(B.mesh);
    B.tintOwner.fill(null);
    B.geometry.instanceCount = 0;
    B.mesh.visible = false;
    for (const type of this.BOX_RIG_TYPES) {
      if (this.meshes[type]) {
        for (const part of Object.values(this.meshes[type])) { scene.remove(part); part.dispose(); }
      }
      if (this.antlers[type]) { scene.remove(this.antlers[type]); this.antlers[type].dispose(); }
      const geom = this.GEOMETRIES[type];
      const mat = this.MATERIALS[type];
      this.meshes[type] = {
        body: new THREE.InstancedMesh(geom.body, mat, this.MAX_INSTANCES),
        head: new THREE.InstancedMesh(geom.head, mat, this.MAX_INSTANCES),
        legFL: new THREE.InstancedMesh(geom.leg, mat, this.MAX_INSTANCES),
        legFR: new THREE.InstancedMesh(geometryView(geom.leg, 1), mat, this.MAX_INSTANCES),
        legBL: new THREE.InstancedMesh(geometryView(geom.leg, 2), mat, this.MAX_INSTANCES),
        legBR: new THREE.InstancedMesh(geometryView(geom.leg, 3), mat, this.MAX_INSTANCES),
      };
      for (const mesh of Object.values(this.meshes[type])) {
        mesh.castShadow = true;
        mesh.frustumCulled = false;
        scene.add(mesh);
      }
      const ant = this.ANTLERS[type];
      if (ant) {
        const mesh = new THREE.InstancedMesh(ant.geom, ant.mat, this.MAX_INSTANCES);
        mesh.castShadow = true;
        mesh.frustumCulled = false;
        scene.add(mesh);
        this.antlers[type] = mesh;
      }
    }
  }

  cacheFor(type, im) {
    let c = this.renderCache[type];
    if (!c || c.owner !== im) {
      c = { owner: im, list: Object.values(im), colKeys: [] };
      this.renderCache[type] = c;
    }
    return c;
  }

  // One pass over the animals; each species keeps its own instance counters, so its instance order is unchanged.
  update(animals, deltaTime) {
    updateNpcFrustum();
    const cx = viewPos.x, cy = viewPos.y, cz = viewPos.z;
    const lod2 = perf.npcLodDist * perf.npcLodDist;
    const passes = this.passById;
    // npcOnScreen's plane tests inlined, the same sums in the same order; in VR every body counts as on screen, as it does there
    const inVr = renderer.xr.isPresenting, fp = npcFrustum.planes;
    const p0 = fp[0].normal, p1 = fp[1].normal, p2 = fp[2].normal, p3 = fp[3].normal, p4 = fp[4].normal, p5 = fp[5].normal;
    const ax0 = p0.x, ay0 = p0.y, az0 = p0.z, d0 = fp[0].constant, ax1 = p1.x, ay1 = p1.y, az1 = p1.z, d1 = fp[1].constant;
    const ax2 = p2.x, ay2 = p2.y, az2 = p2.z, d2 = fp[2].constant, ax3 = p3.x, ay3 = p3.y, az3 = p3.z, d3 = fp[3].constant;
    const ax4 = p4.x, ay4 = p4.y, az4 = p4.z, d4 = fp[4].constant, ax5 = p5.x, ay5 = p5.y, az5 = p5.z, d5 = fp[5].constant;
    for (let ti = 0; ti < passes.length; ti++) {
      const p = passes[ti], im = this.meshes[p.type];
      p.im = im || null;
      p.idx = 0; p.billboarded = 0; p.aidx = 0;
      p.colorsDirty = false; p.full = false;
      if (!im) continue;
      p.cache = this.cacheFor(p.type, im);
      p.antlers = this.antlers[p.type];
    }

    const H = this.human, hPose = H.pose.array, hGait = H.gait.array, hLook = H.look.array, hAct = H.act.array, owners = H.lookOwner;
    const now = ecosystem.time;
    let hn = 0, lookFrom = this.MAX_INSTANCES;
    const B = this.billboards, bPose = B.pose.array, bFrame = B.frame.array, bTint = B.tint.array, tintOwners = B.tintOwner;
    let bn = 0, tintFrom = B.max;

    for (const a of animals) {
      if (!a.alive) continue;
      const human = a.typeId === HUMAN_TYPE_ID;
      const p = passes[a.typeId];
      if (human) {
        if (hn + p.billboarded >= this.MAX_INSTANCES) continue;
      } else {
        if (p.im === null || p.full) continue;
        if (p.idx + p.billboarded >= this.MAX_INSTANCES) { p.full = true; continue; }
      }
      const im = p.im;

      const ageRatio = a.isAdult ? 1 : Math.min(1, (ecosystem.ticks - a.birthTick) / this.MATURITY_TICKS);
      const s = GROWTH_MIN_SCALE + (1 - GROWTH_MIN_SCALE) * ageRatio;
      const k = s * NPC_UNIT;
      const hs = a.heightScale;
      // City: rigs scale uniformly by heightScale
      const kp = k * hs;

      const swing = a.sprinting ? GAIT_GALLOP_SWING : p.walkSwing;
      if (human) this.stepGait(a, deltaTime, kp);
      else if (deltaTime && a.moving) {
        const v = a.stepLength() / NPC_TICK_S;
        const perCycle = 4 * p.legLen * kp * Math.sin(swing);
        const hz = Math.min(GAIT_MAX_HZ, v / perCycle) * GAIT_CADENCE_SCALE;
        a.animTime += deltaTime * hz * 2 * Math.PI;
      }

      if (!inVr) {
        const sx = a.position.x, sy = a.position.y, sz = a.position.z, nr = -(NPC_BODY_R * hs);
        if (ax0 * sx + ay0 * sy + az0 * sz + d0 < nr || ax1 * sx + ay1 * sy + az1 * sz + d1 < nr ||
          ax2 * sx + ay2 * sy + az2 * sz + d2 < nr || ax3 * sx + ay3 * sy + az3 * sz + d3 < nr ||
          ax4 * sx + ay4 * sy + az4 * sz + d4 < nr || ax5 * sx + ay5 * sy + az5 * sz + d5 < nr) continue;
      }
      const originY = a.position.y - (1 - s) * a.footLift() * NPC_UNIT;
      const ex = a.position.x - cx, ey = a.position.y - cy, ez = a.position.z - cz;
      if (ex * ex + ey * ey + ez * ez > lod2) {
        // FAR: one billboard; its frame is picked here (look, pose) and in the shader (view)
        const o = bn * 4, fr = p.cardFrame;
        bPose[o] = a.position.x; bPose[o + 1] = originY; bPose[o + 2] = a.position.z; bPose[o + 3] = a.facingAngle;
        bFrame[o] = fr[0] * kp; bFrame[o + 1] = fr[1] * kp;
        if (human) {
          const L = a.look;
          bFrame[o + 2] = L.outfit * 2 + (L.female ? 1 : 0);
          bFrame[o + 3] = a.gaitSwing < BB_STAND_SWING ? 0 : 1 + Math.round(a.gaitPhase * BB_PHASE_K) % BB_PHASES;
        } else {
          bFrame[o + 2] = p.cardLooks[a.sex];
          bFrame[o + 3] = a.moving ? 1 + ((Math.round(a.animTime * BB_PHASE_K) % BB_PHASES) + BB_PHASES) % BB_PHASES : 0;
        }
        if (tintOwners[bn] !== a) {
          tintOwners[bn] = a;
          if (human) {
            const L = a.look;
            bTint[o] = L.skinRGB; bTint[o + 1] = L.shirt; bTint[o + 2] = L.pants; bTint[o + 3] = HUMAN_HAIR[+L.female][L.variant];
          } else {
            bTint[o] = p.cardTints[a.sex]; bTint[o + 1] = bTint[o + 2] = bTint[o + 3] = 0;
          }
          if (bn < tintFrom) tintFrom = bn;
        }
        bn++;
        p.billboarded++;
        continue;
      }
      if (human) {
        const o = hn * 4;
        hPose[o] = a.position.x; hPose[o + 1] = originY; hPose[o + 2] = a.position.z; hPose[o + 3] = a.facingAngle;
        hGait[o] = kp; hGait[o + 1] = a.gaitPhase; hGait[o + 2] = a.gaitSwing; hGait[o + 3] = a.gaitRun;
        humanFightAct(a, now, hAct, o);
        if (owners[hn] !== a) {
          owners[hn] = a;
          const L = a.look;
          hLook[o] = L.skinRGB; hLook[o + 1] = L.shirt; hLook[o + 2] = L.pants; hLook[o + 3] = L.code;
          if (hn < lookFrom) lookFrom = hn;
        }
        hn++;
        continue;
      }

      const idx = p.idx, col = p.colors[a.sex];
      if (p.cache.colKeys[idx] !== col) {
        p.cache.colKeys[idx] = col;
        for (let pi = 0; pi < this.PART_NAMES.length; pi++) {
          im[this.PART_NAMES[pi]].setColorAt(idx, col);
        }
        p.colorsDirty = true;
      }
      this._quat.setFromAxisAngle(this._yAxis, a.facingAngle);
      this._world.set(a.position.x, originY, a.position.z);
      const antlers = p.antlers && a.sex === 'male' ? p.antlers : null;
      // a move playing (fight move or pounce; both anchor at the body centre for coyotes) takes over the legs from the walk cycle
      const played = a.playing ?? p.fight, u = (now - a.moveAt) / played.moveS;
      const move = u >= 0 && u < 1 ? sampleFightKeys(played.keys, u, this._fightPose) : null;
      this.poseBoxRig(p, im, idx, antlers, p.aidx, kp, !move && a.moving ? Math.sin(a.animTime) * swing * 0.5 : 0, move);
      if (antlers) p.aidx++;
      p.idx = idx + 1;
    }

    H.geometry.instanceCount = hn;
    H.mesh.visible = hn > 0;
    if (hn > 0) {
      AnimalRenderer.queueUpload(H.pose, 0, hn);
      AnimalRenderer.queueUpload(H.gait, 0, hn);
      AnimalRenderer.queueUpload(H.act, 0, hn);
      if (lookFrom < hn) AnimalRenderer.queueUpload(H.look, lookFrom, hn);
    }
    B.geometry.instanceCount = bn;
    B.mesh.visible = bn > 0;
    if (bn > 0) {
      AnimalRenderer.queueUpload(B.pose, 0, bn);
      AnimalRenderer.queueUpload(B.frame, 0, bn);
      if (tintFrom < bn) AnimalRenderer.queueUpload(B.tint, tintFrom, bn);
    }
    for (const type of this.BOX_RIG_TYPES) {
      const p = passes[NPC_TYPE_IDS[type]];
      if (p.im === null) continue;
      for (let mi = 0; mi < p.cache.list.length; mi++) {
        const mesh = p.cache.list[mi];
        perf.instances(mesh, p.idx);
        if (p.colorsDirty) perf.instanceColors(mesh, p.idx);
      }
      if (p.antlers) perf.instances(p.antlers, p.aidx);
    }
  }
}

export class PlantRenderer {
  constructor() {
    this.MAX_INSTANCES = 15000;   // plants drawn at most, over all cells
    this.GEOMETRIES = {
      stem: new THREE.CylinderGeometry(1, 1, 5, 3),
      leaf: new THREE.SphereGeometry(1, 2, 2),
    };
    this.LEAF_OFFSETS_XZ = [0, 1, 2, 3].map(i => {
      const angle = (i / 4) * Math.PI * 2;
      return new THREE.Vector2(Math.cos(angle) * 2, Math.sin(angle) * 2);
    });
    this.MATERIAL = new THREE.MeshStandardMaterial({
      color: 0x228b22,
      roughness: 0.85,
    });
    // each cell: its plants' slots, a stem mesh and one leaf mesh (4 instances a plant), both grown as the cell fills
    this.cells = null;
    this.grid = null;
    this.count = 0;
    this.fresh = false;
    this.MAX_RUNS = 32;
    this._sortBuf = [];
    this._runs = [];
  }

  init(bounds) {
    this.disposeCells();
    const n = PLANT_GRID, w = (bounds.maxX - bounds.minX) / n, d = (bounds.maxZ - bounds.minZ) / n;
    this.grid = { n, x0: bounds.minX, z0: bounds.minZ, w, d };
    this.cells = [];
    for (let k = 0; k < n * n; k++) {
      this.cells.push({
        id: k, x0: bounds.minX + (k % n) * w, z0: bounds.minZ + Math.floor(k / n) * d,
        slots: [], count: 0, cap: 0, stem: null, leaves: null, dirty: [], dirtyFlag: null, shown: -1,
        minY: Infinity, maxY: -Infinity, sphere: new THREE.Sphere(), sphereDirty: false
      });
    }
    this.count = 0;
    this.fresh = true;
  }

  disposeCells() {
    if (!this.cells) return;
    for (const c of this.cells) {
      for (const mesh of [c.stem, c.leaves]) if (mesh) { scene.remove(mesh); mesh.dispose(); }
    }
    this.cells = null;
  }

  cellAt(x, z) {
    const g = this.grid, n = g.n;
    const i = Math.min(n - 1, Math.max(0, Math.floor((x - g.x0) / g.w)));
    const j = Math.min(n - 1, Math.max(0, Math.floor((z - g.z0) / g.d)));
    return this.cells[j * n + i];
  }

  add(p) {
    if (p._slot >= 0 || !this.cells) return;
    if (this.count >= this.MAX_INSTANCES) { plantView.pending = true; return; }
    const c = this.cellAt(p.position.x, p.position.z), slot = c.count++;
    this.count++;
    c.slots[slot] = p;
    p._slot = slot;
    p._cell = c;
    const y = p.position.y;
    if (y < c.minY) { c.minY = y; c.sphereDirty = true; }
    if (y > c.maxY) { c.maxY = y; c.sphereDirty = true; }
    this.markDirty(c, slot);
  }

  remove(p) {
    const slot = p._slot;
    if (slot < 0) return;
    const c = p._cell, last = --c.count;
    this.count--;
    if (slot !== last) {
      const moved = c.slots[last];
      c.slots[slot] = moved;
      moved._slot = slot;
      this.markDirty(c, slot);
    }
    c.slots[last] = null;
    p._slot = -1;
    p._cell = null;
  }

  touch(p) {
    if (p._slot >= 0) this.markDirty(p._cell, p._slot);
  }

  // slots past the cell's meshes need no mark: growing the meshes writes every slot
  markDirty(c, slot) {
    if (slot >= c.cap || c.dirtyFlag[slot]) return;
    c.dirtyFlag[slot] = 1;
    c.dirty.push(slot);
  }

  rebuild(plants) {
    if (!this.cells) return;
    for (const c of this.cells) {
      c.slots.length = 0;
      c.count = 0;
      c.dirty.length = 0;
      if (c.dirtyFlag) c.dirtyFlag.fill(0);
      c.shown = -1;
    }
    this.count = 0;
    for (const p of plants) {
      p._slot = -1;
      p._cell = null;
      if (p.alive) this.add(p);
    }
  }

  // New meshes a quarter larger than the cell's plants, every slot written; the old ones are freed.
  grow(c) {
    const cap = Math.ceil(c.count * 1.25 / 64) * 64, geos = this.GEOMETRIES, old = [c.stem, c.leaves];
    c.stem = new THREE.InstancedMesh(geometryView(geos.stem, c.id), this.MATERIAL, cap);
    c.leaves = new THREE.InstancedMesh(geometryView(geos.leaf, c.id), this.MATERIAL, cap * 4);
    for (const mesh of [c.stem, c.leaves]) {
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.boundingSphere = c.sphere;
      mesh.count = 0;
      mesh.visible = false;
      scene.add(mesh);
    }
    for (const mesh of old) if (mesh) { scene.remove(mesh); mesh.dispose(); }
    c.cap = cap;
    c.dirtyFlag = new Uint8Array(cap);
    c.dirty.length = 0;
    c.shown = -1;
    for (let s = 0; s < c.count; s++) this.writeSlot(c, s);
  }

  // The cell's square, padded by a leaf's reach, from its lowest plant's foot to its highest plant's top.
  placeSphere(c) {
    const U = NPC_UNIT, g = this.grid, pad = 3 * U;
    const x0 = c.x0 - pad, x1 = c.x0 + g.w + pad, z0 = c.z0 - pad, z1 = c.z0 + g.d + pad, y0 = c.minY, y1 = c.maxY + 8 * U;
    c.sphere.center.set((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
    c.sphere.radius = Math.hypot(x1 - x0, y1 - y0, z1 - z0) / 2;
    c.sphereDirty = false;
  }

  writeSlot(c, slot) {
    const p = c.slots[slot];
    if (!p) return;

    const U = NPC_UNIT;
    const h = p.health / p.maxHealth;
    const hs = h * U;
    const groundY = p.position.y;
    const px = p.position.x, pz = p.position.z;
    const stemArr = c.stem.instanceMatrix.array, leafArr = c.leaves.instanceMatrix.array;
    const o = slot * 16;

    stemArr[o] = hs;
    stemArr[o + 5] = hs;
    stemArr[o + 10] = hs;
    stemArr[o + 12] = px;
    stemArr[o + 13] = groundY + 5 * hs;
    stemArr[o + 14] = pz;
    stemArr[o + 15] = 1;

    const leafY = groundY + 7 * hs;
    for (let li = 0; li < 4; li++) {
      const off = this.LEAF_OFFSETS_XZ[li];
      const a = (slot * 4 + li) * 16;
      leafArr[a] = hs;
      leafArr[a + 5] = hs;
      leafArr[a + 10] = hs;
      leafArr[a + 12] = px + off.x * U;
      leafArr[a + 13] = leafY;
      leafArr[a + 14] = pz + off.y * U;
      leafArr[a + 15] = 1;
    }
  }

  update(plants) {
    if (!this.cells) return;
    if (this.fresh) {
      this.fresh = false;
      this.rebuild(plants);
    }
    for (const c of this.cells) {
      if (c.count > c.cap) this.grow(c);
      if (!c.stem) continue;
      if (c.sphereDirty) this.placeSphere(c);
      const count = c.count;
      if (count !== c.shown) {
        c.shown = count;
        c.stem.count = count;
        c.leaves.count = count * 4;
        c.stem.visible = c.leaves.visible = count > 0;
      }
      const dirty = c.dirty;
      if (dirty.length === 0) continue;
      for (let i = 0; i < dirty.length; i++) {
        const slot = dirty[i];
        c.dirtyFlag[slot] = 0;
        if (slot < count) this.writeSlot(c, slot);
      }
      this.uploadDirty(c, dirty, count);
      dirty.length = 0;
    }
  }

  uploadDirty(c, dirty, count) {
    const sorted = this._sortBuf;
    sorted.length = 0;
    for (let i = 0; i < dirty.length; i++) {
      if (dirty[i] < count) sorted.push(dirty[i]);
    }
    if (sorted.length === 0) return;
    sorted.sort((a, b) => a - b);

    const runs = this._runs;
    runs.length = 0;
    let start = sorted[0], prev = sorted[0];
    for (let i = 1; i < sorted.length; i++) {
      const s = sorted[i];
      if (s <= prev + 1) { prev = s; continue; }
      runs.push(start, prev);
      start = s; prev = s;
    }
    runs.push(start, prev);

    const nRuns = runs.length / 2;
    const spanFrom = runs[0];
    const spanTo = runs[runs.length - 1];
    const useSpan = nRuns > this.MAX_RUNS;

    // the leaf mesh holds 4 instances a plant, so its ranges are 4 times the stem's
    for (const [mesh, per] of [[c.stem, 16], [c.leaves, 64]]) {
      const attr = mesh.instanceMatrix;
      attr.clearUpdateRanges();
      if (useSpan) {
        attr.addUpdateRange(spanFrom * per, (spanTo - spanFrom + 1) * per);
      } else {
        for (let r = 0; r < runs.length; r += 2) {
          attr.addUpdateRange(runs[r] * per, (runs[r + 1] - runs[r] + 1) * per);
        }
      }
      attr.needsUpdate = true;
    }
  }
}

// FOOD BOX VIEW (render layer): foodBoxes' per-crate view cull and instance writes; foodBoxes keeps the data.
export const foodBoxView = {
  _now: [], _m: new THREE.Matrix4(),   // crate indexes on screen this render; scratch matrix

  // VIEW CULL like AnimalRenderer (call after updateNpcFrustum); the buffer is rewritten only when visible crates change.
  render() {
    const mesh = foodBoxes.mesh;
    if (!mesh) return;
    const now = this._now, shown = foodBoxes._shown, r = FOOD_BOX_SIZE * 0.87;
    now.length = 0;
    for (const c of foodBoxes.list) if (npcOnScreen(c.position.x, c.position.y, c.position.z, r)) now.push(c.i);
    let same = !foodBoxes.dirty && now.length === shown.length;
    for (let i = 0; same && i < now.length; i++) same = now[i] === shown[i];
    if (same) return;
    for (let i = 0; i < now.length; i++) {
      const q = foodBoxes.list[now[i]].position;
      mesh.setMatrixAt(i, this._m.makeTranslation(q.x, q.y, q.z));
      shown[i] = now[i];
    }
    shown.length = now.length;
    mesh.count = now.length;
    mesh.instanceMatrix.needsUpdate = true;
    foodBoxes.dirty = false;
    invalidate();
  },
};

// DOM for the shared view settings and VR, read by the systems below.
export const povEl = document.getElementById('pov');
export const raysEl = document.getElementById('rays');
export const gfxEl = document.getElementById('gfx');
export const vrEl = document.getElementById('vr');
export const avgFpsEl = document.getElementById('avg-fps');
export const vrOverlayEl = document.getElementById('vr-overlay');
export const vrStatsEl = document.getElementById('vr-stats');

export class CatCompanion {
  constructor() {
    this.mesh = this.build();
    this.mesh.visible = false;
    scene.add(this.mesh);

    this.position = new THREE.Vector3();
    this.velocity = new THREE.Vector3(0, 0, 0);
    this.yaw = 0;
    this.animTime = 0;
    this.WATER_SPEED_FACTOR = 0.45;
    this.FLOAT = 1.5 * NPC_UNIT;
    this.active = false;
    this.inCar = false;
    this.boarding = null;          // walk-to-the-door state while the player gets in
    this.held = null;              // { x, z, yaw } while petted (hold): he steps to that spot, faces yaw and stays
    this._w = new THREE.Vector3();
    this._seat = new THREE.Vector3();
  }

  build() {
    const group = new THREE.Group();
    const blackMat = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.8 });
    const eyeMat = new THREE.MeshStandardMaterial({
      color: 0x88ee00,
      emissive: 0x66cc00,
      emissiveIntensity: 1.2,
      roughness: 0.2,
      metalness: 0.1
    });
    const pupilMat = new THREE.MeshStandardMaterial({ color: 0x000000, roughness: 1 });
    const noseMat = new THREE.MeshStandardMaterial({ color: 0xff8888, roughness: 1 });

    const body = new THREE.Mesh(new THREE.SphereGeometry(5, 14, 10), blackMat);
    body.scale.set(0.72, 0.78, 1.9);
    body.position.set(0, 5, 0);
    body.castShadow = true;
    group.add(body);

    const head = new THREE.Mesh(new THREE.SphereGeometry(4.5, 12, 10), blackMat);
    head.position.set(0, 8, 9);
    head.castShadow = true;
    group.add(head);

    const earGeo = new THREE.ConeGeometry(1.5, 3.5, 4);
    const earL = new THREE.Mesh(earGeo, blackMat);
    earL.position.set(-2.5, 11.5, 9);
    earL.rotation.z = 0.25;
    group.add(earL);
    const earR = new THREE.Mesh(earGeo, blackMat);
    earR.position.set(2.5, 11.5, 9);
    earR.rotation.z = -0.25;
    group.add(earR);

    const irisGeo = new THREE.SphereGeometry(1.1, 8, 8);
    const pupilGeo = new THREE.SphereGeometry(0.55, 6, 6);

    const eyeL = new THREE.Mesh(irisGeo, eyeMat);
    eyeL.position.set(-1.7, 8.6, 13.2);
    group.add(eyeL);
    const pupilL = new THREE.Mesh(pupilGeo, pupilMat);
    pupilL.position.set(-1.7, 8.6, 13.7);
    group.add(pupilL);

    const eyeR = new THREE.Mesh(irisGeo, eyeMat);
    eyeR.position.set(1.7, 8.6, 13.2);
    group.add(eyeR);
    const pupilR = new THREE.Mesh(pupilGeo, pupilMat);
    pupilR.position.set(1.7, 8.6, 13.7);
    group.add(pupilR);

    const nose = new THREE.Mesh(new THREE.SphereGeometry(0.5, 6, 6), noseMat);
    nose.position.set(0, 7.5, 13.5);
    group.add(nose);

    const legGeo = new THREE.CylinderGeometry(1.2, 1.0, 7, 6);
    const legPositions = [
      [-3.2, 1, 5],
      [3.2, 1, 5],
      [-3.2, 1, -4],
      [3.2, 1, -4],
    ];
    group.userData.legs = [];
    for (const pos of legPositions) {
      const leg = new THREE.Mesh(legGeo, blackMat);
      leg.position.set(...pos);
      leg.castShadow = true;
      group.add(leg);
      group.userData.legs.push(leg);
    }

    const tailSegGeo = new THREE.SphereGeometry(1.0, 6, 6);
    group.userData.tailSegments = [];
    const tailCount = 7;
    for (let i = 0; i < tailCount; i++) {
      const t = i / (tailCount - 1);
      const seg = new THREE.Mesh(tailSegGeo, blackMat);
      const radius = 1.0 - t * 0.55;
      seg.scale.setScalar(radius);
      seg.position.set(0, 5 + t * 11, -9 - t * t * 6);
      group.add(seg);
      group.userData.tailSegments.push(seg);
    }

    const eyeGlow = new THREE.PointLight(0x88ee00, 0.3, 30);
    eyeGlow.position.set(0, 9, 13);
    group.add(eyeGlow);

    group.scale.setScalar(CAT_SCALE);
    return group;
  }

  // Gets in with the player: walks round to the passenger door, hops onto the seat, then rides.
  board() {
    if (!this.active || this.inCar || this.boarding) return;
    const [cx, cf] = this.carLocal(this.position.x, this.position.z);
    this.boarding = { t: 0, jump: -1, from: new THREE.Vector3(), run: Math.hypot(cx, cf) > CAT_RUN_FROM };
    loop.sceneDirty = true;
  }

  // (x, z) in the car's frame: [right, forward]
  carLocal(x, z) {
    const dx = x - car.x, dz = z - car.z, c = Math.cos(car.yaw), s = Math.sin(car.yaw);
    return [dx * c - dz * s, -dx * s - dz * c];
  }

  // car frame -> world (x, z)
  carWorld(lx, lf, out) {
    const c = Math.cos(car.yaw), s = Math.sin(car.yaw);
    out.x = car.x + c * lx - s * lf; out.z = car.z - s * lx - c * lf;
    return out;
  }

  // Next point on his way to the passenger door, in the car's frame; from the driver's side he goes round the nearer end.
  boardTarget(lx, lf) {
    const L = CAR_LEN / 2 + 0.5, end = lf >= 0 ? L : -L;
    if (lx >= CAT_DOOR - 0.15) return [CAT_DOOR, 0];
    if (Math.abs(lf) >= L - 0.15) return [CAT_DOOR, end];
    if (lx < CAR_WID / 2 + 0.1) return [Math.min(lx, -CAT_DOOR), end];
    return [CAT_DOOR, 0];
  }

  static wrap(a) { return Math.atan2(Math.sin(a), Math.cos(a)); }

  legs(swing, tuck) {
    const legs = this.mesh.userData.legs;
    legs[0].rotation.x = swing - tuck;
    legs[1].rotation.x = -swing - tuck;
    legs[2].rotation.x = -swing + tuck;
    legs[3].rotation.x = swing + tuck;
  }

  // start the hop from where he stands, kept in the car's frame so a moving car carries it along
  startJump() {
    const b = this.boarding;
    b.jump = 0;
    car.mesh.updateMatrixWorld();
    car.mesh.worldToLocal(b.from.copy(this.position));
  }

  updateBoarding(dt) {
    const b = this.boarding;
    b.t += dt;
    this.animTime += dt;
    if (b.jump < 0) {
      // trying too long: appear at the passenger door and hop in from there
      if (b.t > CAT_BOARD_TIMEOUT) {
        const p = this.carWorld(CAT_DOOR, 0, this._w);
        this.position.set(p.x, this.groundAt(p.x, p.z), p.z);
        this.yaw = car.yaw - Math.PI / 2;
        this.startJump();
      } else {
        const [cx, cf] = this.carLocal(this.position.x, this.position.z);
        const [lx, lf] = this.boardTarget(cx, cf);
        const tg = this.carWorld(lx, lf, this._seat);
        const tx = tg.x, tz = tg.z;
        const dx = tx - this.position.x, dz = tz - this.position.z, d = Math.hypot(dx, dz);
        const atDoor = lx === CAT_DOOR && lf === 0;
        // run while far from the car or while it is moving, walk the last stretch
        if (car.speed !== 0) b.run = true;
        else if (Math.hypot(cx, cf) < CAT_WALK_WITHIN) b.run = false;
        const running = b.run;
        const speed = running ? CAT_RUN_SPEED : CAT_BOARD_SPEED;
        if (atDoor && d < (car.speed !== 0 ? 0.35 : 0.1)) {
          this.startJump();
        } else {
          const step = Math.min(d, speed * dt);
          if (d > 1e-6) {
            this.position.x += dx / d * step;
            this.position.z += dz / d * step;
            this.yaw += CatCompanion.wrap(Math.atan2(dx, dz) - this.yaw) * Math.min(1, dt * 10);
          }
          const feet = this.position.y;
          this._w.set(this.position.x, 0, this.position.z);
          resolveCollisions(this._w, 0.15, feet, feet + 0.35, STEP_UP);
          this.position.x = ecosystem.fitX(this._w.x);
          this.position.z = ecosystem.fitZ(this._w.z);
          this.position.y = this.groundAt(this.position.x, this.position.z);
        }
        this.legs(running ? Math.sin(this.animTime * 18) * 0.55 : Math.sin(this.animTime * 12) * 0.35, 0);
      }
    }
    if (b.jump >= 0) {
      b.jump = Math.min(1, b.jump + dt / CAT_JUMP_TIME);
      const k = b.jump, e = k * k * (3 - 2 * k);
      car.mesh.updateMatrixWorld();
      const f = b.from;
      this._seat.set(f.x + (CAT_SEAT.x - f.x) * e, f.y + (CAT_SEAT.y - f.y) * e + Math.sin(Math.PI * k) * 0.45,
        f.z + (CAT_SEAT.z - f.z) * e);
      this.position.copy(car.mesh.localToWorld(this._seat));
      // leap facing into the car, settle facing forward
      const target = k < 0.5 ? car.yaw - Math.PI / 2 : car.yaw + Math.PI;
      this.yaw += CatCompanion.wrap(target - this.yaw) * Math.min(1, dt * 12);
      this.legs(0, Math.sin(Math.PI * k) * 0.6);
      if (k >= 1) { this.seat(); return; }
    }
    this.mesh.position.copy(this.position);
    this.mesh.rotation.y = this.yaw;
    loop.sceneDirty = true;
  }

  // No shadow while he rides in the car; out of it, the parts that cast one when built cast again.
  setCastShadow(on) {
    this.mesh.traverse(o => {
      if (!o.isMesh) return;
      if (o.userData.builtCastShadow === undefined) o.userData.builtCastShadow = o.castShadow;
      o.castShadow = on && o.userData.builtCastShadow;
    });
    graphics.force = true;
  }

  // A passenger on the car's mesh, still, facing forward (his update pauses).
  seat() {
    this.boarding = null;
    this.inCar = true;
    car.mesh.add(this.mesh);
    this.setCastShadow(false);
    this.mesh.position.set(CAT_SEAT.x, CAT_SEAT.y, CAT_SEAT.z);
    this.mesh.rotation.set(0, Math.PI, 0);   // his forward is +z, the car's is -z
    for (const leg of this.mesh.userData.legs) leg.rotation.x = 0;
    loop.sceneDirty = true;
  }

  // Gets out with the player: by the passenger door if there is room, else beside the player.
  alight() {
    if (this.boarding) { this.boarding = null; return; }   // player got out before he got in
    if (!this.inCar) return;
    this.inCar = false;
    scene.add(this.mesh);
    this.setCastShadow(true);
    const rx = Math.cos(car.yaw), rz = -Math.sin(car.yaw);
    let x = car.x + rx * CAT_DOOR, z = car.z + rz * CAT_DOOR;
    const g = this.groundAt(x, z);
    if (shellAt(x, z) >= 0 || solidOverlap(x, z, 0.2, g, g + 0.35)) { x = player.pos.x; z = player.pos.z; }
    this.position.set(x, this.groundAt(x, z), z);
    this.yaw = car.yaw + Math.PI;
    this.velocity.set(0, 0, 0);
    this.update(0);
  }

  // Petting (petting.start): he steps to (x, z), turns to yaw and stays there until release().
  hold(x, z, yaw) { this.held = { x, z, yaw }; }
  release() { this.held = null; }

  // In front of the player, a little to the right, facing the player.
  reset() { this.place(false); }   // teardownWorld's entry
  place(show) {
    this.boarding = null;
    this.held = null;
    if (this.inCar) { this.inCar = false; scene.add(this.mesh); this.setCastShadow(true); }
    this.active = show;
    this.mesh.visible = show;
    if (!show) return;
    const feet = player.pos.y - EYE_HEIGHT;
    const fx = -Math.sin(player.heading), fz = -Math.cos(player.heading);   // player forward
    const rx = Math.cos(player.heading), rz = -Math.sin(player.heading);    // player right
    const ahead = 28 * NPC_UNIT, side = 10 * NPC_UNIT;
    this.position.set(player.pos.x + fx * ahead + rx * side, feet,
      player.pos.z + fz * ahead + rz * side);
    this.yaw = Math.atan2(player.pos.x - this.position.x, player.pos.z - this.position.z);
    this.velocity.set(0, 0, 0);
    this.update(0);
  }

  // Ground under him: the footing, floating a little under a water surface.
  groundAt(x, z) {
    providers.active.surface(x, z, _surf);
    return _surf.base + Math.max(_surf.dip, -this.FLOAT);
  }

  update(deltaTime) {
    if (!this.active || this.inCar) return;
    if (this.boarding) { this.updateBoarding(deltaTime); return; }
    this.animTime += deltaTime;
    providers.active.surface(this.position.x, this.position.z, _surf);
    const waterFactor = _surf.dip < 0 ? this.WATER_SPEED_FACTOR : 1;

    const px = player.pos.x;
    const pz = player.pos.z;
    const dx = px - this.position.x;
    const dz = pz - this.position.z;
    const distToPlayer = Math.sqrt(dx * dx + dz * dz);

    const followDist = 100 * NPC_UNIT;
    const catchUpDist = 360 * NPC_UNIT;
    let speed = 0;

    if (this.held) {
      // petted: a short step to the held spot, then still, facing the held way
      const h = this.held, hx = h.x - this.position.x, hz = h.z - this.position.z, hd = Math.hypot(hx, hz);
      const step = Math.min(hd, CAT_PET_STEP_SPEED * deltaTime);
      if (hd > 1e-6) {
        this.position.x += hx / hd * step;
        this.position.z += hz / hd * step;
      }
      if (hd > CAT_PET_SETTLED) speed = CAT_PET_STEP_SPEED;
      this.yaw += CatCompanion.wrap(h.yaw - this.yaw) * Math.min(1, deltaTime * CAT_PET_TURN_RATE);
    } else if (distToPlayer > catchUpDist) {
      // too far behind (car, fly, a sprint): appear just behind the player
      const warpX = px + Math.sin(player.heading) * followDist * 0.3;
      const warpZ = pz + Math.cos(player.heading) * followDist * 0.3;
      this.position.set(warpX, this.groundAt(warpX, warpZ), warpZ);
      this.velocity.y = 0;
      this.yaw = player.heading;
    } else if (distToPlayer + 50 * NPC_UNIT > followDist) {
      speed = (distToPlayer > 80 * NPC_UNIT ? 250 : 25) * NPC_UNIT * waterFactor;
      const dxRounded = Math.round(dx / (10 * NPC_UNIT)) * 10;
      const dzRounded = Math.round(dz / (10 * NPC_UNIT)) * 10;
      const angle = Math.atan2(dxRounded, dzRounded);
      this.yaw += (angle - this.yaw) * Math.min(1, deltaTime * 6);
      this.position.x += Math.sin(this.yaw) * speed * deltaTime;
      this.position.z += Math.cos(this.yaw) * speed * deltaTime;
    } else if (distToPlayer < 12 * NPC_UNIT) {
      speed = 20 * NPC_UNIT * waterFactor;
      const angle = Math.atan2(-dx, -dz);
      this.yaw += (angle - this.yaw) * Math.min(1, deltaTime * 5);
      this.position.x += Math.sin(this.yaw) * speed * deltaTime;
      this.position.z += Math.cos(this.yaw) * speed * deltaTime;
    } else {
      const faceAngle = Math.atan2(dx, dz);
      this.yaw += (faceAngle - this.yaw) * Math.min(1, deltaTime * 2);
    }

    // walls stop him like anyone else
    const feet = this.position.y;
    this._w.set(this.position.x, 0, this.position.z);
    resolveCollisions(this._w, 0.15, feet, feet + 0.35, STEP_UP);
    this.position.x = ecosystem.fitX(this._w.x);
    this.position.z = ecosystem.fitZ(this._w.z);

    // gravity down to the footing (the Arena's 400 u/s^2)
    const ground = this.groundAt(this.position.x, this.position.z);
    this.velocity.y -= 400 * NPC_UNIT * deltaTime;
    this.position.y += this.velocity.y * deltaTime;
    if (this.position.y <= ground || ground - this.position.y > -STEP_UP) {
      this.position.y = ground;
      this.velocity.y = 0;
    }

    this.mesh.position.copy(this.position);
    this.mesh.rotation.y = this.yaw;

    const legs = this.mesh.userData.legs;
    const walkFreq = speed > 50 * NPC_UNIT ? 12 : 7;
    const walkAmp = speed > 0 ? 0.35 : 0;
    legs[0].rotation.x = Math.sin(this.animTime * walkFreq) * walkAmp;
    legs[1].rotation.x = -Math.sin(this.animTime * walkFreq) * walkAmp;
    legs[2].rotation.x = -Math.sin(this.animTime * walkFreq) * walkAmp;
    legs[3].rotation.x = Math.sin(this.animTime * walkFreq) * walkAmp;
    loop.sceneDirty = true;
  }
}

// TARGET SELECTION (the animal you look at; drives the SINGLE vision rays).
export class StatLabelSystem {
  constructor() {
    this.current = null;
    this.locked = null;
    this.rayVisMode = 'single';
    this._ray = new THREE.Ray();
    this._sphere = new THREE.Sphere();
    this._hitPt = new THREE.Vector3();
  }

  setRayVis(mode) {
    this.rayVisMode = mode;
    raysEl.textContent = `Vision rays: ${mode}`;
    raysEl.classList.toggle('sel', mode !== 'off');
    visionRays.lines.visible = mode !== 'off';
  }

  toggleRayVis() {
    const modes = ['off', 'single', 'all'];
    this.setRayVis(modes[(modes.indexOf(this.rayVisMode) + 1) % modes.length]);
  }

  // Nearest animal whose body sphere the view ray crosses (the Arena's Player.pickTarget).
  pickTarget() {
    this._ray.origin.copy(viewPos);
    this._ray.direction.set(0, 0, -1).applyQuaternion(viewQuat).normalize();
    const r = 15 * NPC_UNIT * PLAYER_HS;
    let closest = null, closestDist = Infinity;
    for (const a of ecosystem.animals) {
      if (!a.alive) continue;
      this._sphere.set(a.position, r);
      if (!this._ray.intersectSphere(this._sphere, this._hitPt)) continue;
      const d = viewPos.distanceTo(this._hitPt);
      if (d < closestDist) { closest = a; closestDist = d; }
    }
    return closest;
  }

  updateTarget() {
    const target = this.rayVisMode === 'single' ? this.pickTarget() : null;
    this.current = target;
    if (this.current !== null && this.current !== this.locked) this.locked = this.current;
    if (this.locked && !this.locked.alive) this.locked = null;
    visionRays.lines.visible = this.rayVisMode !== 'off' && !!(this.current || this.locked || this.rayVisMode === 'all');
  }

  // a tap or click that is not a look-drag lets go of the selection
  reset() { this.locked = this.current = null; }   // teardownWorld's entry
  bind() {
    renderer.domElement.addEventListener('pointerup', e => {
      if (!this.locked || e.pointerType === 'mouse') return;
      if (e.pointerId === stickId || e.pointerId === lookId) return;
      this.locked = null;
    });
    renderer.domElement.addEventListener('click', () => { if (play.locked) this.locked = null; });
  }
}

// VISION RAYS: each ray-visible animal's 3D vision cone (spokes, rim and a faint fill), from the Arena.
export class VisionRaySystem {
  constructor() {
    this.MAX = 1000;
    this.LEN_SCALE = 0.55;
    this.COLS = 10;

    const COLS = this.COLS;
    this.RIM = [];
    for (let j = 0; j < COLS; j++) this.RIM.push([-1 + (2 * j) / (COLS - 1), -1]);
    for (let j = COLS - 1; j >= 0; j--) this.RIM.push([-1 + (2 * j) / (COLS - 1), 1]);

    this.SPOKES = [[0, 0], [-1, -1], [1, -1], [1, 1], [-1, 1]];
    this.SEGS = this.SPOKES.length + this.RIM.length;

    this.colors = [
      new THREE.Color(0xffffff),
      new THREE.Color(0x00ffff),
      new THREE.Color(0xff8800)
    ];

    this._d = new Float32Array(3);
    this._rimPts = new Float32Array(this.RIM.length * 3);
    this._list = [];

    this.positions = new Float32Array(this.MAX * this.SEGS * 2 * 3);
    this.colorArr = new Float32Array(this.MAX * this.SEGS * 2 * 3);

    this.geo = new THREE.BufferGeometry();
    this.geo.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
    this.geo.setAttribute('color', new THREE.BufferAttribute(this.colorArr, 3));
    this.geo.setDrawRange(0, 0);

    this.mat = new THREE.LineBasicMaterial({
      vertexColors: true,
      transparent: true,
      opacity: 0.55,
      depthTest: true,
    });

    this.lines = new THREE.LineSegments(this.geo, this.mat);
    this.lines.frustumCulled = false;
    this.lines.visible = false;
    this.lines.renderOrder = 2;
    scene.add(this.lines);

    this.FILL_VERTS = COLS * 2;
    this.FILL_TRIS = (COLS - 1) * 2;

    this.fillPos = new Float32Array(this.MAX * this.FILL_VERTS * 3);
    const fillIdx = new Uint32Array(this.MAX * this.FILL_TRIS * 3);
    let w = 0;
    for (let ai = 0; ai < this.MAX; ai++) {
      const bot = ai * this.FILL_VERTS;
      const top = bot + COLS;
      for (let j = 0; j < COLS - 1; j++) {
        fillIdx[w++] = bot + j; fillIdx[w++] = bot + j + 1; fillIdx[w++] = top + j + 1;
        fillIdx[w++] = bot + j; fillIdx[w++] = top + j + 1; fillIdx[w++] = top + j;
      }
    }

    this.fillGeo = new THREE.BufferGeometry();
    this.fillGeo.setAttribute('position', new THREE.BufferAttribute(this.fillPos, 3));
    this.fillGeo.setIndex(new THREE.BufferAttribute(fillIdx, 1));
    this.fillGeo.setDrawRange(0, 0);

    this.fillMat = new THREE.MeshBasicMaterial({
      color: 0xff8800,
      transparent: true,
      opacity: 0.05,
      side: THREE.DoubleSide,
      depthWrite: false,
    });

    this.fill = new THREE.Mesh(this.fillGeo, this.fillMat);
    this.fill.frustumCulled = false;
    this.fill.visible = false;
    this.fill.renderOrder = 2;
    scene.add(this.fill);
  }

  _dir(base, fh, fv, yawFrac, pitchFrac, len) {
    const yaw = base + fh * yawFrac;
    const pitch = fv * pitchFrac;
    const cp = Math.cos(pitch);
    const d = this._d;
    d[0] = Math.sin(yaw) * cp * len;
    d[1] = Math.sin(pitch) * len;
    d[2] = Math.cos(yaw) * cp * len;
    return d;
  }

  _upload(attr, n) {
    if (n <= 0) return;
    attr.clearUpdateRanges();
    attr.addUpdateRange(0, n);
    attr.needsUpdate = true;
  }

  update(animals) {
    this.fill.visible = this.lines.visible;
    if (!this.lines.visible) return;

    const pos = this.positions;
    const col = this.colorArr;
    const fpos = this.fillPos;
    const rim = this._rimPts;
    const target = labels.locked || labels.current;

    const rayAnimals = this._list;
    rayAnimals.length = 0;
    if (labels.rayVisMode === 'all') {
      for (const a of animals) {
        if (!a.alive) continue;
        rayAnimals.push(a);
        if (rayAnimals.length >= this.MAX) break;
      }
    } else if (target && target.alive) {
      rayAnimals.push(target);
    }

    const n = rayAnimals.length;
    const nSpokes = this.SPOKES.length;
    const nRim = this.RIM.length;
    const nCols = this.COLS;
    let vi = 0;
    let fi = 0;

    for (let ai = 0; ai < n; ai++) {
      const a = rayAnimals[ai];
      const ox = a.position.x;
      const oy = a.eyeY();
      const oz = a.position.z;
      const len = a.visionDistance * this.LEN_SCALE;
      const base = a.facingAngle;
      const fh = a.fovH, fv = a.fovV;

      for (let r = 0; r < nRim; r++) {
        const p = this.RIM[r];
        const d = this._dir(base, fh, fv, p[0], p[1], len);
        const o3 = r * 3;
        rim[o3] = ox + d[0];
        rim[o3 + 1] = oy + d[1];
        rim[o3 + 2] = oz + d[2];
      }

      for (let j = 0; j < nCols; j++) {
        const o3 = j * 3;
        fpos[fi] = rim[o3]; fpos[fi + 1] = rim[o3 + 1]; fpos[fi + 2] = rim[o3 + 2];
        fi += 3;
      }
      for (let j = 0; j < nCols; j++) {
        const o3 = (2 * nCols - 1 - j) * 3;
        fpos[fi] = rim[o3]; fpos[fi + 1] = rim[o3 + 1]; fpos[fi + 2] = rim[o3 + 2];
        fi += 3;
      }

      for (let s = 0; s < nSpokes; s++) {
        const sp = this.SPOKES[s];
        const d = this._dir(base, fh, fv, sp[0], sp[1], len);
        const c = this.colors[s === 0 ? 0 : 1];

        pos[vi] = ox; pos[vi + 1] = oy; pos[vi + 2] = oz;
        col[vi] = c.r; col[vi + 1] = c.g; col[vi + 2] = c.b;
        vi += 3;

        pos[vi] = ox + d[0]; pos[vi + 1] = oy + d[1]; pos[vi + 2] = oz + d[2];
        col[vi] = c.r; col[vi + 1] = c.g; col[vi + 2] = c.b;
        vi += 3;
      }

      const cr = this.colors[2];
      for (let r = 0; r < nRim; r++) {
        const o0 = r * 3;
        const o1 = ((r + 1) % nRim) * 3;

        pos[vi] = rim[o0]; pos[vi + 1] = rim[o0 + 1]; pos[vi + 2] = rim[o0 + 2];
        col[vi] = cr.r; col[vi + 1] = cr.g; col[vi + 2] = cr.b;
        vi += 3;

        pos[vi] = rim[o1]; pos[vi + 1] = rim[o1 + 1]; pos[vi + 2] = rim[o1 + 2];
        col[vi] = cr.r; col[vi + 1] = cr.g; col[vi + 2] = cr.b;
        vi += 3;
      }
    }

    this.geo.setDrawRange(0, n * this.SEGS * 2);
    this._upload(this.geo.attributes.position, vi);
    this._upload(this.geo.attributes.color, vi);

    this.fillGeo.setDrawRange(0, n * this.FILL_TRIS * 3);
    this._upload(this.fillGeo.attributes.position, fi);
  }
}

export const pov = {
  mode: '3rd',
  body: null,
  // the player's body: a random person (sex, height, build, skin, face, clothes), drawn anew each time a world spawns.
  // Only the drawn body changes; the player's eye height and collision stay PLAYER_HEIGHT's.
  look: null,
  heightScale: PLAYER_HS,
  ageBase: NPC_ADULT_AGE,   // years at world tick 0 (newBody)
  ageYears() { return this.ageBase + ecosystem.ticks / NPC_TICKS_PER_YEAR; },
  // the player's stats readout key (personInfoKey; Survivor panel and Observer HUD), or -1 before the first body
  infoKey() {
    return this.look ? personInfoKey(Math.floor(this.ageYears()), this.sex, this.look.buildDev, game.avatar.bodyHeightM()) : -1;
  },
  gait: { x: NaN, z: NaN, speed: 0, phase: 0, swing: 0, run: 0 },

  // one instance of the people renderer's rig and materials; posed by the mesh's own transform, so iPose stays at the origin
  build() {
    const H = animalRenderer.human;
    const g = new THREE.InstancedBufferGeometry();
    g.setIndex(H.rest.index);
    for (const k in H.rest.attributes) g.setAttribute(k, H.rest.attributes[k]);
    for (const name of ['iPose', 'iGait', 'iLook', 'iAct']) g.setAttribute(name, new THREE.InstancedBufferAttribute(new Float32Array(4), 4));
    g.instanceCount = 1;
    const mesh = new THREE.Mesh(g, H.mesh.material);
    mesh.customDepthMaterial = H.mesh.customDepthMaterial;
    mesh.castShadow = mesh.receiveShadow = true;
    mesh.frustumCulled = false;
    mesh.visible = false;
    scene.add(mesh);
    this.body = mesh;
    if (!this.look) this.newBody();
    else this.writeLook();
  },

  // a fresh random person, sized like NPC adults of the same sex
  newBody() {
    const sex = Math.random() < 0.5 ? 'male' : 'female';
    this.sex = sex;
    this.look = humanLook(sex);
    const sz = NPC_SIZE.human, [mean, std] = sz[sex];
    const z = Math.max(-NPC_SIZE_Z_MAX, Math.min(NPC_SIZE_Z_MAX, brains.gauss()));
    this.heightScale = (mean + std * z) / (sz.rig * NPC_UNIT);
    // an age like a spawned person's, aging on the same clock (Animal.ageYears); the ecosystem's ticks restart with it
    this.ageBase = NPC_START_AGE[0] + Math.random() * (NPC_START_AGE[1] - NPC_START_AGE[0]);
    const G = this.gait;
    G.x = G.z = NaN; G.speed = G.phase = G.swing = G.run = 0;
    if (this.body) this.writeLook();
  },

  writeLook() {
    const L = this.look, attr = this.body.geometry.attributes.iLook;
    attr.array.set([L.skinRGB, L.shirt, L.pants, L.code]);
    attr.needsUpdate = true;
  },

  // the NPC gait (AnimalRenderer.stepGait) on the frame's step instead of the NPC tick;
  // off a sprint the legs animate as if covering PLAYER_JOG_ANIM of the ground (a slower cycle)
  stepGait(dt, kp) {
    const G = this.gait;
    const dx = player.pos.x - G.x, dz = player.pos.z - G.z;
    G.x = player.pos.x; G.z = player.pos.z;
    if (!dt) return;
    const moved = Math.sqrt(dx * dx + dz * dz);
    if (!(moved < HUMAN_GAIT_JUMP)) return;   // first sight or a teleport: hold the pose
    const d = player.running ? moved : moved * PLAYER_JOG_ANIM;
    if (d === 0 && G.speed < 1e-3) { G.speed = G.swing = G.run = 0; return; }
    const leg = HUMAN_LEG * kp;
    G.speed += (d / dt - G.speed) * (1 - Math.pow(1 - HUMAN_GAIT_EASE, dt / NPC_TICK_S));
    const vl = G.speed / leg;
    const stride = Math.min(HUMAN_STRIDE_MAX, HUMAN_STRIDE_BASE + HUMAN_STRIDE_PER_V * vl);
    const ph = G.phase + Animal.TWO_PI * Math.min(d / (stride * leg), HUMAN_CADENCE_MAX * dt);
    G.phase = ph >= Animal.TWO_PI ? ph - Animal.TWO_PI : ph;
    G.swing = Math.min(HUMAN_SWING_MAX, Math.asin(Math.min(1, stride / 4))) * Math.min(1, G.speed / HUMAN_IDLE_SPEED);
    G.run = Math.max(0, Math.min(1, (vl - 2.6) / 2.6));
  },

  cycle() {
    this.mode = this.mode === '1st' ? '3rd' : '1st';
    povEl.textContent = this.mode === '1st' ? '1st person' : '3rd person';
    invalidate();
  },

  // After step(): move the camera behind the player (boom shortened before walls) and pose the body.
  apply(dt) {
    const show = this.mode === '3rd' && !player.inCar && play.active && !renderer.xr.isPresenting;
    if (!this.body) this.build();
    this.body.visible = show;
    if (!show) return;

    const feet = player.pos.y - EYE_HEIGHT;
    const b = this.body, kp = NPC_UNIT * this.heightScale;
    b.position.set(player.pos.x, feet + SPECIES.human.lift * kp, player.pos.z);
    b.rotation.y = player.heading + Math.PI;   // the rig faces +z at rotation 0, the camera -z at yaw 0

    const G = this.gait, gait = b.geometry.attributes.iGait;
    // flying: the standing pose (no walk or run cycle); the gait starts from rest on landing
    if (flying) { G.x = player.pos.x; G.z = player.pos.z; G.speed = G.swing = G.run = 0; }
    else this.stepGait(dt, kp);
    // iGait.w: the crouch share as a negative number while crouching or easing out of it, else the run share
    const crouchShare = crouchY / CROUCH_DROP;
    gait.array[0] = kp; gait.array[1] = G.phase; gait.array[2] = G.swing; gait.array[3] = crouchShare > 0 ? -crouchShare : G.run;
    gait.needsUpdate = true;
    const act = b.geometry.attributes.iAct;
    humanFightAct(game.avatar, ecosystem.time, act.array, 0);
    act.array[3] = petting.act();
    act.needsUpdate = true;

    const pitch = Math.max(-Math.PI / 3, Math.min(Math.PI / 6, player.pitch));
    const bx = Math.sin(player.yaw), bz = Math.cos(player.yaw);
    const px = player.pos.x, py = player.pos.y - crouchY, pz = player.pos.z;
    let boom = TPP_BACK;
    for (let d = 0.4; d <= TPP_BACK; d += 0.3) {
      const x = px + bx * d, y = py + TPP_UP * d / TPP_BACK, z = pz + bz * d;
      const s = shellAt(x, z);
      if ((s >= 0 && y < collision.shells[s].top + 0.3) || solidOverlap(x, z, 0.2, y - 0.2, y + 0.2)) {
        boom = Math.max(0.3, d - 0.3);
        break;
      }
    }
    const cx = px + bx * boom, cz = pz + bz * boom;
    const cy = Math.max(py + TPP_UP * boom / TPP_BACK, groundAt(cx, cz) + 0.3);
    camera.position.set(cx, cy, cz);
    camera.rotation.set(pitch, player.yaw, 0, 'YXZ');
    loop.sceneDirty = true;
  }
};

// VR: the Arena's WebXR session, on the shared player. The rig carries the headset to the player's feet.
export const vr = {
  moveX: 0, moveY: 0, turnX: 0,
  jumpPressed: false, resetPressed: false,
  aWasDown: false, bWasDown: false,
  snapCooldown: 0,
  session: null,
  supported: false,

  poll(dt) {
    const session = renderer.xr.getSession();
    if (!session) return;
    this.moveX = this.moveY = this.turnX = 0;
    for (const source of session.inputSources) {
      const gp = source.gamepad;
      if (!gp) continue;
      if (source.handedness === 'left') {
        this.moveX = Math.abs(gp.axes[2] ?? 0) > 0.12 ? (gp.axes[2] ?? 0) : 0;
        this.moveY = Math.abs(gp.axes[3] ?? 0) > 0.12 ? (gp.axes[3] ?? 0) : 0;
        const yDown = gp.buttons[5]?.pressed;
        if (yDown && !this.bWasDown) this.resetPressed = true;
        this.bWasDown = yDown;
      }
      if (source.handedness === 'right') {
        this.turnX = Math.abs(gp.axes[2] ?? 0) > 0.5 ? Math.sign(gp.axes[2]) : 0;
        const aDown = gp.buttons[4]?.pressed;
        if (aDown && !this.aWasDown) this.jumpPressed = true;
        this.aWasDown = aDown;
      }
    }
    this.snapCooldown -= dt;
    if (this.turnX !== 0 && this.snapCooldown <= 0) {
      player.yaw += this.turnX * (Math.PI / 6);
      this.snapCooldown = 0.3;
    }
    if (this.jumpPressed) jumpQueued = true;
    this.jumpPressed = false;
    if (this.resetPressed && ecosystem.ready && providers.active) ecosystem.initialize(providers.active);
    this.resetPressed = false;
  },

  // The head sits EYE_HEIGHT over the rig in local-floor space, so the rig goes to the feet.
  placeRig() {
    if (!renderer.xr.isPresenting) return;
    rig.position.set(player.pos.x, player.pos.y - EYE_HEIGHT, player.pos.z);
    rig.rotation.set(0, player.yaw, 0);
  },

  updateHud() {
    perf.setText(vrStatsEl, populationText());
  },

  start(session) {
    this.session = session;
    session.addEventListener('end', () => this.end());
    renderer.xr.setReferenceSpaceType('local-floor');
    renderer.xr.setSession(session);
    if (loop.rafId) { cancelAnimationFrame(loop.rafId); loop.rafId = 0; }
    renderer.setAnimationLoop(t => loop.frame(t));
    vrOverlayEl.style.display = 'block';
    vrEl.textContent = 'Exit VR';
  },

  end() {
    this.session = null;
    renderer.setAnimationLoop(null);
    rig.position.set(0, 0, 0);
    rig.rotation.set(0, 0, 0);
    vrOverlayEl.style.display = 'none';
    vrEl.textContent = 'Enter VR';
    loop.last = -1;
    wake();
  },

  bind() {
    vrEl.addEventListener('click', () => {
      vrEl.blur();
      if (this.session) { this.session.end(); return; }
      navigator.xr.requestSession('immersive-vr', {
        optionalFeatures: ['local-floor', 'bounded-floor', 'hand-tracking', 'dom-overlay'],
        domOverlay: { root: vrOverlayEl }
      }).then(s => this.start(s)).catch(err => {
        console.warn('VR session failed:', err);
        vrEl.textContent = 'VR unavailable';
      });
    });
    if ('xr' in navigator) {
      navigator.xr.isSessionSupported('immersive-vr').then(ok => {
        this.supported = ok;
        vrEl.hidden = !ok;
      }).catch(() => { });
    }
  }
};

export const graphics = {
  high: !startLowPower,
  anchor: new THREE.Vector3(Infinity, 0, Infinity),
  sunDir: new THREE.Vector3(-0.5, 1, 0.4).normalize(),
  drawnSunDir: new THREE.Vector3(),   // sunDir when the map was last drawn
  lastRefresh: -1e9,
  force: true,
  // what the last drawn map saw of the moving casters: animals near the player, and the cat and body poses
  nearAnimals: -1,
  _moverSnaps: [new Float64Array(8).fill(NaN), new Float64Array(8).fill(NaN)],   // 64-bit: compared to positions exactly
  _aim: new THREE.Vector3(),

  shadowsOn() { return SHADOWS_ENABLED && this.high && !!providers.active && providers.active.shadows; },

  apply() {
    const on = this.shadowsOn();
    gfxEl.textContent = `Graphics: ${this.high ? 'high' : 'low'}`;
    const pr = Math.min(devicePixelRatio, this.high ? 2 : LOW_PIXEL_RATIO);
    if (renderer.getPixelRatio() !== pr) renderer.setPixelRatio(pr);
    if (!this.high) msaa.dispose();
    perf.lowPower = !this.high;
    perf.npcLodDist = this.high ? HIGH_NPC_LOD_DIST : LOW_NPC_LOD_DIST;
    perf.farStatDist = this.high ? HIGH_FAR_STAT_DIST : LOW_FAR_STAT_DIST;
    scene.fog.far = this.high ? HIGH_FOG_FAR : LOW_FOG_FAR;
    const far = this.high ? HIGH_CAMERA_FAR : LOW_CAMERA_FAR;
    if (camera.far !== far) { camera.far = far; camera.updateProjectionMatrix(); }
    if (renderer.shadowMap.enabled !== on) {
      renderer.shadowMap.enabled = on;
      scene.traverse(o => { if (o.material) { for (const m of [].concat(o.material)) m.needsUpdate = true; } });
    }
    sun.castShadow = on;
    // high: the shadow map replaces the blobs (low redraws them on its next NPC tick)
    if (this.high) blobShadows.hide();
    this.force = true;
    this.placeSun();
    invalidate();
  },

  toggle() {
    this.high = !this.high;
    // Survivor mode's average fps measures one quality setting at a time
    avgFps.reset();
    // the next load starts on this setting
    try { localStorage.setItem(GRAPHICS_KEY, this.high ? 'high' : 'low'); } catch (e) { }
    this.apply();
  },

  // Keep the light's direction and aim it at the anchor, so the shadow box sits around and ahead of the player.
  placeSun() {
    const a = Number.isFinite(this.anchor.x) ? this.anchor : this.anchor.set(0, 0, 0);
    sun.target.position.copy(a);
    sun.target.updateMatrixWorld();
    sun.position.copy(a).addScaledVector(this.sunDir, SUN_DIST);
  },

  // The sky turned the sun: redraw once it has moved SHADOW_SUN_STEP_DEG from where the map was drawn.
  sunTurned() {
    if (this.sunDir.dot(this.drawnSunDir) < SHADOW_SUN_STEP_COS) this.force = true;
  },

  // Did a caster near the player (animals within SHADOW_MOVER_DIST, cat, body) change since the last draw? `record` stores it.
  moversChanged(record) {
    const px = player.pos.x, pz = player.pos.z, r2 = SHADOW_MOVER_DIST * SHADOW_MOVER_DIST;
    let near = 0, moving = false;
    if (ecosystem.ready) for (const a of ecosystem.animals) {
      if (!a.alive) continue;
      const dx = a.position.x - px, dz = a.position.z - pz;
      if (dx * dx + dz * dz > r2) continue;
      near++;
      if (a.moving) moving = true;
    }
    let changed = moving || near !== this.nearAnimals;
    const movers = [cat.mesh, pov.body];
    for (let i = 0; i < movers.length; i++) {
      const o = movers[i], snap = this._moverSnaps[i];
      const vis = o && o.visible ? 1 : 0;
      const p = o ? o.position : null, q = o ? o.quaternion : null;
      if (record) {
        snap[0] = vis;
        if (vis) { snap[1] = p.x; snap[2] = p.y; snap[3] = p.z; snap[4] = q.x; snap[5] = q.y; snap[6] = q.z; snap[7] = q.w; }
      } else if (snap[0] !== vis || (vis && (snap[1] !== p.x || snap[2] !== p.y || snap[3] !== p.z ||
        snap[4] !== q.x || snap[5] !== q.y || snap[6] !== q.z || snap[7] !== q.w))) changed = true;
    }
    if (record) this.nearAnimals = near;
    return changed;
  },

  update(now) {
    if (!renderer.shadowMap.enabled) return;
    // sun below the horizon: it lights nothing, so the map is not drawn; redraw as soon as it is back
    if (sun.intensity <= 0) { this.force = true; return; }
    // where the box centre should be: SHADOW_AHEAD in front of the player, at the feet
    const aim = this._aim.set(player.pos.x - Math.sin(player.yaw) * SHADOW_AHEAD, player.pos.y - EYE_HEIGHT,
      player.pos.z - Math.cos(player.yaw) * SHADOW_AHEAD);
    const dx = aim.x - this.anchor.x, dz = aim.z - this.anchor.z;
    const moved = !(dx * dx + dz * dz <= SHADOW_FOLLOW_STEP * SHADOW_FOLLOW_STEP);
    const due = this.force || moved ||
      (now - this.lastRefresh >= 1000 / SHADOW_MOVER_HZ && this.moversChanged(false));
    if (!due) return;
    if (this.force || moved) {
      this.anchor.copy(aim);
      this.placeSun();
      sun.shadow.camera.updateProjectionMatrix();
    }
    sun.shadow.needsUpdate = true;
    // the render sets these matrices again; set here so what the new map sees is recorded in its own space
    sun.updateMatrixWorld();
    sun.shadow.updateMatrices(sun);
    this.moversChanged(true);
    this.drawnSunDir.copy(this.sunDir);
    this.lastRefresh = now;
    this.force = false;
  }
};

export const cat = new CatCompanion();

// PETTING (the Pet field action): the player squats for the pet's length (stance.squat), turns so the petting hand
// (HUMAN_PET) comes over the cat, and the cat steps under it facing the player (cat.hold); the hand reaches in, rubs
// his head from the player's left to right and back, and withdraws. Stepping off the spot, leaving the ground, the
// car, flying, dying, or the cat leaving (boarding, gone) ends it early.
export const petting = {
  t: -1,                       // seconds into the pet; -1: not petting
  bendLevel: 0,                // the bend level (petBendAt) and shoulder angle solved for this pet (humanPetHand)
  a1: 0,
  turnAmp: 0,                  // the sweep angle that carries the hand sweepM to either side
  at: new THREE.Vector3(),     // where the player stands for it
  get on() { return this.t >= 0; },
  get duration() { const P = HUMAN_PET; return 2 * P.reachS + P.strokes * P.strokeS; },

  // the cat is free to be petted: out with the player, not boarding, not already being petted
  canPet() { return !this.on && cat.active && !cat.inCar && !cat.boarding; },

  start() {
    if (!this.canPet() || !pov.look) return;
    const P = HUMAN_PET, kp = NPC_UNIT * pov.heightScale, girth = 0.8 + Math.floor(pov.look.code / 64) / 200;
    // the hand's height that meets his head top, in rig units over the body centre (pov.apply's placement)
    const want = (cat.position.y + CAT_HEAD_TOP - (player.pos.y - EYE_HEIGHT)) / kp - SPECIES.human.lift;
    // shallowest bend first, over the shoulder angles the pack can carry, forward first, until the hand (in front of
    // the body) comes down to the head (deeper bends only reach lower); the pose that came nearest wins
    let best = null, bestErr = Infinity;
    search: for (let b = 0; b < PET_BEND_LEVELS; b++) {
      for (let k = 0; k <= 255; k++) {
        const a = P.shoulder[0] + (P.shoulder[1] - P.shoulder[0]) * k / 255, h = humanPetHand(petBendAt(b), a, 0, girth);
        if (h.z <= 0) continue;
        const err = Math.abs(h.y - want);
        if (err < bestErr) { bestErr = err; best = [b, a]; }
        if (h.y <= want) break search;
      }
    }
    if (!best) return;
    [this.bendLevel, this.a1] = best;
    const bend = petBendAt(this.bendLevel), hand = humanPetHand(bend, this.a1, 0, girth);
    // the sweep angle whose sideways reach is sweepM (bisection; the reach grows with the angle up to turnMax)
    const side = P.sweepM / kp, reachAt = a => hand.x - humanPetHand(bend, this.a1, a, girth).x;
    let lo = 0, hi = P.turnMax;
    if (reachAt(hi) <= side) lo = hi;
    else for (let i = 0; i < 24; i++) { const m = (lo + hi) / 2; if (reachAt(m) < side) lo = m; else hi = m; }
    this.turnAmp = lo;
    // his body centre in the player's frame (+x left, +z forward): under the hand, a head's length farther out,
    // facing back at the player; the player turns so that spot lies the way the cat already is
    const ox = hand.x * kp, oz = hand.z * kp + CAT_HEAD_FWD;
    const toWorld = h => [-Math.cos(h) * ox - Math.sin(h) * oz, Math.sin(h) * ox - Math.cos(h) * oz];
    const [wx, wz] = toWorld(player.heading);
    player.heading += CatCompanion.wrap(Math.atan2(cat.position.x - player.pos.x, cat.position.z - player.pos.z) - Math.atan2(wx, wz));
    const [cx, cz] = toWorld(player.heading);
    cat.hold(player.pos.x + cx, player.pos.z + cz, player.heading);
    this.at.copy(player.pos);
    this.t = 0;
    stance.squat(this.duration);
  },

  update(dt) {
    if (!this.on) return;
    this.t += dt;
    const dx = player.pos.x - this.at.x, dz = player.pos.z - this.at.z, stay = HUMAN_PET.stayM;
    if (this.t >= this.duration) this.end(false);
    else if (dx * dx + dz * dz > stay * stay || !player.grounded || player.inCar || flying || game.dead ||
      !cat.active || cat.inCar || cat.boarding) this.end(true);
  },

  // early: cut short, so the squat ends with it
  end(early) {
    this.t = -1;
    cat.release();
    if (early) stance.unsquat();
  },

  // the pose for the body's iAct.w (humanPetPack): reach eases in and out, the sweep runs left, right, left per stroke
  act() {
    if (!this.on) return 0;
    const P = HUMAN_PET, t = this.t;
    const share = fightEase(fightClamp01(Math.min(t, this.duration - t) / P.reachS));
    const strokes = Math.max(0, Math.min(P.strokes, (t - P.reachS) / P.strokeS));
    return humanPetPack(share, this.bendLevel, this.a1, -this.turnAmp * Math.cos(2 * Math.PI * strokes));
  }
};

export const labels = new StatLabelSystem();
export const visionRays = new VisionRaySystem();
export const animalRenderer = new AnimalRenderer();
export const plantRenderer = new PlantRenderer();
export class BlobShadows {
  constructor() {
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const g = c.getContext('2d');
    const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    grad.addColorStop(0, 'rgba(255,255,255,1)');
    grad.addColorStop(0.55, 'rgba(255,255,255,0.7)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, 64, 64);
    const tex = new THREE.CanvasTexture(c);
    const geo = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
    this.material = new THREE.MeshBasicMaterial({
      color: 0x000000, map: tex, transparent: true, depthWrite: false, opacity: BLOB_OPACITY,
      polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2
    });
    this.mesh = new THREE.InstancedMesh(geo, this.material, BLOB_MAX);
    this.mesh.count = 0;
    this.mesh.visible = false;
    this.mesh.frustumCulled = false;
    scene.add(this.mesh);
    // body footprint per type in model units (x across, z along the facing), from the rest-pose bodies
    this.foot = {};
    for (const type of NPC_TYPES) {
      const bb = animalRenderer.restBox(type);
      this.foot[type] = { x: bb.max.x - bb.min.x, z: bb.max.z - bb.min.z };
    }
    this._m = new THREE.Matrix4();
    this._p = new THREE.Vector3();
    this._q = new THREE.Quaternion();
    this._s = new THREE.Vector3();
    this._y = new THREE.Vector3(0, 1, 0);
  }

  hide() {
    perf.instances(this.mesh, 0);
  }

  update(animals) {
    const light = Math.min(1, sun.intensity / BLOB_FULL_SUN);
    if (!perf.lowPower || !providers.active || light <= 0) { this.hide(); return; }
    this.material.opacity = BLOB_OPACITY * light;
    updateNpcFrustum();
    const r = animalRenderer, mesh = this.mesh;
    const cx = viewPos.x, cy = viewPos.y, cz = viewPos.z, d2 = BLOB_DIST * BLOB_DIST;
    let n = 0;
    for (const a of animals) {
      if (n >= BLOB_MAX) break;
      if (!a.alive || a.submerged || a.floating) continue;
      const ex = a.position.x - cx, ey = a.position.y - cy, ez = a.position.z - cz;
      if (ex * ex + ey * ey + ez * ez > d2) continue;
      const hs = a.heightScale;
      if (!npcOnScreen(a.position.x, a.position.y, a.position.z, NPC_BODY_R * hs)) continue;
      // the same size the body is drawn at (AnimalRenderer.update)
      const age = a.isAdult ? 1 : Math.min(1, (ecosystem.ticks - a.birthTick) / r.MATURITY_TICKS);
      const kp = (GROWTH_MIN_SCALE + (1 - GROWTH_MIN_SCALE) * age) * NPC_UNIT * hs * BLOB_SPREAD;
      const f = this.foot[a.type];
      this._p.set(a.position.x, a.position.y - a.footLift() * NPC_UNIT + BLOB_LIFT, a.position.z);
      this._q.setFromAxisAngle(this._y, a.facingAngle);
      this._s.set(f.x * kp, 1, f.z * kp);
      this._m.compose(this._p, this._q, this._s);
      mesh.setMatrixAt(n++, this._m);
    }
    perf.instances(mesh, n);
  }
}
export const blobShadows = new BlobShadows();

// What using an item does, by its kind's action: verb names the use (slot labels), past the run summary's row.
// run(game, slot, item) applies it; `consumed` actions empty the slot first and count toward the run summary.
export const SURVIVOR_ACTIONS = {
  open: { verb: 'Open', consumed: false, run(g, slot) { g.inventory[slot] = g.rollLoot(); } },
  eat: { verb: 'Eat', past: 'Ate', consumed: true, run(g, slot, item) { g.eat(Math.min(item.food, g.foodNeed)); } },
  drink: { verb: 'Drink', past: 'Drank', consumed: true, run(g, slot, item) { g.drink(item.water); } },
  treat: { verb: 'Use', past: 'Used', consumed: true, run(g, slot, item) { g.cure(item.cures); } }
};

// What the action button (the car button's slot) can do on foot, first in reach first: label is its text,
// find(game, x, feet, z) its target in reach (null: none). run(game, target) acts once on the press; a `hold`
// action runs run(game, target, dt) every tick instead, while held. Harvest and Collect need a free slot.
// A `squat` action squats the body for SURVIVOR_CONFIG.squatS (stance.squat) when it runs.
export const SURVIVOR_FIELD_ACTIONS = {
  collect: {
    label: 'Collect',
    squat: true,
    find: (g, x, feet, z) => g.inventory.includes(null) ? foodBoxes.touching(g._qb, x, feet, z) : null,
    run: (g, crate) => g.collect(crate)
  },
  harvest: {
    label: 'Harvest',
    squat: true,
    find: (g, x, feet, z) => g.inventory.includes(null) ? g.plantInReach(x, feet, z) : null,
    run: (g, plant) => g.harvest(plant)
  },
  drink: {
    label: 'Drink',
    hold: true,
    find: (g, x, feet, z) => g.atWater(x, z) ? true : null,
    run: (g, target, dt) => g.drink(SURVIVOR_CONFIG.needs.drinkPerS * dt)
  },
  // last, so a plant, box or water by the cat keeps its button; the pet squats on its own (petting)
  pet: {
    label: 'Pet',
    find: (g, x, feet, z) => petting.canPet() && g.catInReach(x, feet, z) ? cat : null,
    run: () => petting.start()
  }
};

export const needsEl = document.getElementById('needs');
export const needHealthEl = document.getElementById('needHealth');
export const needFoodEl = document.getElementById('needFood');
export const needWaterEl = document.getElementById('needWater');
export const needDayEl = document.getElementById('needDay');
export const needInfoEl = document.getElementById('needInfo');
export const slotEls = [...document.querySelectorAll('#slots button:not(.craft)')];
export const craftEl = document.querySelector('#slots button.craft');
export const injuriesEl = document.getElementById('injuries');
export const hurtFlashEl = document.getElementById('hurtflash');
export const runOverEl = document.getElementById('runover');
export const runCauseEl = document.getElementById('runCause');
export const runStatsEl = document.getElementById('runStats');

// Inside a cabin's walls at feet height (x, y, z): the cabins' shelter rectangles carry their interior.
export function cabinAt(x, y, z) {
  for (const c of shelters.list) {
    const qx = x - c.cx, qz = z - c.cz;
    const lx = qx * c.cosR - qz * c.sinR, lz = qx * c.sinR + qz * c.cosR;
    if (Math.abs(lx) < c.inHalfX && Math.abs(lz) < c.inHalfZ && y >= c.floorY - 0.5 && y < c.ceilY) return true;
  }
  return false;
}

export const game = {
  on: false,
  dead: false,
  health: SURVIVOR_CONFIG.maxHealth,
  foodNeed: 0,
  waterNeed: 0,
  sheltered: false,       // in the car or a cabin: nothing can hurt the player
  fieldHeld: null,        // the hold field action (SURVIVOR_FIELD_ACTIONS) whose button or key is down, or null
  inventory: new Array(SURVIVOR_CONFIG.inventory.slots).fill(null),   // makeItem's { kind, food, water, cures } or null
  injuries: new Set(),    // SURVIVOR_CONFIG.injuries keys the player has
  run: null,              // this run's record: hours, eaten counts, cause
  _lastHour: null,
  _q: [], _qp: [], _qb: [],
  _shown: -1, _shownDay: -1, _shownSlots: '', _shownInjuries: '', _shownInfo: -1, _shownSex: '',

  // The ecosystem's view of the player: an Animal-shaped combatant, alive only in Survivor mode while in play.
  // It is a predator to what people hunt, quarry at night to people's night hunters, and trades fight hits like an animal.
  avatar: {
    type: 'player', alive: false, prey: false, position: new THREE.Vector3(),
    startHealth: SURVIVOR_CONFIG.maxHealth, nextAttackAt: 0,
    moveAt: -Infinity, playing: null, moveSide: 1, fightFrom: 0, fightUntil: 0,   // fight move (startFightMove), drawn on the 3rd-person body
    get health() { return game.health; },
    strike() { startFightMove(this, NPC_FIGHT_MOVES.human, ecosystem.time); },
    bodyHeightM() { return pov.heightScale * NPC_SIZE.human.rig * NPC_UNIT; },
    bodyMassKg() { return humanMassKg(pov.sex, pov.look ? pov.look.buildDev : 0, this.bodyHeightM()); },
    // the animal `tid` flees the player
    isThreatTo(tid) { return this.alive && (HUNTS_MASK[HUMAN_TYPE_ID] & (1 << tid)) !== 0 && !this.isPreyFor(tid); },
    // the animal `tid` hunts the player (night hunts: `prey` is night out of shelter)
    isPreyFor(tid) { return this.alive && this.prey && (NIGHT_PREY_MASK[tid] & (1 << HUMAN_TYPE_ID)) !== 0; },
    takeHit(attacker, damage) {
      if (game.sheltered || game.dead) return;
      game.hurt(damage, attacker.type);
      if (game.dead) attacker.feedOn(this);
      else game.rollInjuries(d => d.chancePerHit ?? 0);
    },
    feedOn(victim) {
      game.eat(victim.startHealth);
      game.tally(victim.type);
    }
  },

  reset() {
    this.dead = false;
    this.health = SURVIVOR_CONFIG.maxHealth;
    this.foodNeed = 0;
    this.waterNeed = 0;
    this.inventory.fill(null);
    this.injuries.clear();
    this.fieldHeld = null;
    this.run = { hours: 0, eaten: {}, cause: null };
    this._lastHour = null;
    this.avatar.nextAttackAt = 0;
    this.showPanel();
    this.draw();
  },

  // Health loss from any source; `cause` names it for the run summary. A hit flashes the screen edge.
  hurt(amount, cause) {
    if (amount <= 0 || this.dead) return;
    this.health = Math.max(0, this.health - amount);
    this.flash(amount);
    if (this.health <= 0) this.die(cause);
    this.draw();
  },

  heal(amount) {
    if (amount <= 0 || this.dead) return;
    this.health = Math.min(SURVIVOR_CONFIG.maxHealth, this.health + amount);
  },

  // `food` units of food, with the water that comes with that much food (DIET_WATER_SHARE)
  eat(food) {
    const N = SURVIVOR_CONFIG.needs;
    this.foodNeed = Math.max(0, this.foodNeed - food);
    this.waterNeed = Math.max(0, this.waterNeed - food * DIET_WATER_SHARE * N.waterPerS / N.foodPerS);
  },

  // `water` units of water need removed
  drink(water) { this.waterNeed = Math.max(0, this.waterNeed - water); },

  // A hit or a fall: each injury the player does not have yet sets in with chanceOf(its INJURIES entry).
  rollInjuries(chanceOf) {
    const all = SURVIVOR_CONFIG.injuries;
    for (const id in all) if (!this.injuries.has(id) && Math.random() < chanceOf(all[id])) this.injuries.add(id);
    this.draw();
  },

  // The injuries in `ids` mended.
  cure(ids) { for (const id of ids) this.injuries.delete(id); },

  // Whether the player may sprint: no injury that stops running (Survivor mode only).
  canRun() {
    if (!this.on) return true;
    for (const id of this.injuries) if (SURVIVOR_CONFIG.injuries[id].noRun) return false;
    return true;
  },

  tally(kind) { this.run.eaten[kind] = (this.run.eaten[kind] || 0) + 1; },

  // An inventory item of `kind`: its kind's food and water, unless `own` gives the item's own (a picked plant's).
  makeItem(kind, own = null) {
    const def = SURVIVOR_CONFIG.inventory.items[kind];
    return { kind, food: def.food ?? 0, water: def.water ?? 0, cures: def.cures ?? [], ...own };
  },

  // The craft slot's recipe: the first whose items the inventory holds, with the slots it would use up; or null.
  craftable() {
    for (const r of SURVIVOR_CONFIG.craft.recipes) {
      const slots = [];
      for (const kind of r.uses) {
        const i = this.inventory.findIndex((it, j) => it !== null && it.kind === kind && !slots.includes(j));
        if (i < 0) break;
        slots.push(i);
      }
      if (slots.length === r.uses.length) return { recipe: r, slots };
    }
    return null;
  },

  // The craft slot pressed: its items used up, the made item in the first slot they freed.
  craft() {
    if (!this.on || this.dead) return;
    const c = this.craftable();
    if (!c) return;
    for (const i of c.slots) this.inventory[i] = null;
    this.inventory[Math.min(...c.slots)] = this.makeItem(c.recipe.makes);
    this.draw();
  },

  // A box's contents: one item kind drawn by its loot weight.
  rollLoot() {
    const items = SURVIVOR_CONFIG.inventory.items;
    let total = 0;
    for (const k in items) total += items[k].loot ?? 0;
    let r = Math.random() * total;
    for (const k in items) {
      const w = items[k].loot ?? 0;
      if (w > 0 && (r -= w) < 0) return this.makeItem(k);
    }
    return null;   // no loot weights: an empty box
  },

  // Landing at impactSpeed (m/s, downward): the drop height that speed implies, v^2 / 2g, so a teleport
  // (which zeroes velocity) never counts as a fall.
  land(impactSpeed) {
    if (!this.on || !play.active || this.dead) return;
    const F = SURVIVOR_CONFIG.fall;
    const dropHeight = impactSpeed * impactSpeed / (2 * GRAVITY);
    if (dropHeight <= F.safeM) return;
    this.hurt((dropHeight - F.safeM) * F.damagePerM, 'fall');
    // a hurting fall may injure: each injury's fallChanceAtSafe at the safe height, growing with the drop
    if (!this.dead) this.rollInjuries(d => (d.fallChanceAtSafe ?? 0) * dropHeight / F.safeM);
  },

  update(dt) {
    const av = this.avatar;
    av.alive = this.on && play.active && !this.dead;
    if (!av.alive) { av.prey = false; return; }
    const N = SURVIVOR_CONFIG.needs, R = SURVIVOR_CONFIG.reach;

    const px = player.pos.x, pz = player.pos.z;
    const feet = player.pos.y - EYE_HEIGHT;
    av.position.set(px, feet + (EYE_HEIGHT + HEAD_CLEAR) / 2, pz);
    this.sheltered = player.inCar || cabinAt(px, feet, pz);
    av.prey = ecosystem.night && !this.sheltered;

    // days survived run on the sky's own clock
    const hour = simSky.hour;
    if (this._lastHour !== null) this.run.hours += (hour - this._lastHour + 24) % 24;
    this._lastHour = hour;

    const cost = player.running ? N.sprintCost : 1;
    this.foodNeed = Math.min(100, this.foodNeed + N.foodPerS * cost * dt);
    this.waterNeed = Math.min(100, this.waterNeed + N.waterPerS * cost * dt);
    if (this.foodNeed >= 100) this.hurt(N.starvingPerS * dt, 'starving');
    if (this.waterNeed >= 100) this.hurt(N.parchedPerS * dt, 'parched');
    if (this.dead) return;

    // drinking, harvesting and collecting take the action button (pressField); contact only fights
    if (!player.inCar) {
      this.touchAnimals(px, pz, R);
      if (this.dead) return;
      if (this.fieldHeld !== null) this.holdField(dt);
    }
    this.draw();
  },

  // Contact with animals: prey that cannot fight back is eaten on touch; one that hunts people trades fight hits.
  touchAnimals(px, pz, R) {
    const av = this.avatar, now = ecosystem.time;
    const n = ecosystem.animalGrid.queryInto(this._q, px, pz, R.radius);
    for (let i = 0; i < n; i++) {
      const d = this._q[i];
      if (!d.alive || (HUNTS_MASK[HUMAN_TYPE_ID] & (1 << d.typeId)) === 0) continue;
      if (Math.abs(d.position.y - av.position.y) > R.height) continue;
      if (tools.distSq(px, pz, d.position.x, d.position.z) > R.radius * R.radius) continue;
      if ((HUNTS_MASK[d.typeId] & (1 << HUMAN_TYPE_ID)) === 0) {
        d.alive = false;
        av.feedOn(d);
        continue;
      }
      if (av.nextAttackAt <= now) {
        av.strike(d);
        ecosystem.fightHit(av, d);
        av.nextAttackAt = now + NPC_ATTACK_COOLDOWN_S;
      }
      if (d.alive && d.nextAttackAt <= now) {
        d.strike(av);
        ecosystem.fightHit(d, av);
        d.nextAttackAt = now + NPC_ATTACK_COOLDOWN_S;
        if (this.dead) return;
      }
    }
  },

  // The attack button: the body punches in either mode. Only in Survivor (out of shelter) does it land: the nearest
  // animal people hunt within punch reach ahead takes a hit, at most once per NPC_ATTACK_COOLDOWN_S (shared with
  // touch fights). A fighter trades it like a touch fight; other prey takes a hunter's hit (a deer bucks and flees).
  punch() {
    const av = this.avatar, now = ecosystem.time;
    av.strike();
    if (!av.alive || this.sheltered || av.nextAttackAt > now) return;
    const P = SURVIVOR_CONFIG.punch, R = SURVIVOR_CONFIG.reach;
    const px = player.pos.x, pz = player.pos.z;
    const fx = -Math.sin(player.heading), fz = -Math.cos(player.heading);   // the body's facing (pov.apply)
    const n = ecosystem.animalGrid.queryInto(this._q, px, pz, P.reachM);
    let target = null, best = P.reachM * P.reachM;
    for (let i = 0; i < n; i++) {
      const d = this._q[i];
      if (!d.alive || (HUNTS_MASK[HUMAN_TYPE_ID] & (1 << d.typeId)) === 0) continue;
      if (Math.abs(d.position.y - av.position.y) > R.height) continue;
      const dx = d.position.x - px, dz = d.position.z - pz, d2 = dx * dx + dz * dz;
      if (d2 > best || dx * fx + dz * fz < P.coneCos * Math.sqrt(d2)) continue;
      best = d2;
      target = d;
    }
    if (!target) return;
    av.nextAttackAt = now + NPC_ATTACK_COOLDOWN_S;
    if ((HUNTS_MASK[target.typeId] & (1 << HUMAN_TYPE_ID)) !== 0) ecosystem.fightHit(av, target);
    else target.attacked(av);
  },

  // FIELD ACTIONS: the action button's (pressField) choice, the first SURVIVOR_FIELD_ACTIONS entry with something in
  // reach: { id, target } or null. Only on foot in Survivor mode, alive, not flying.
  fieldAction() {
    if (!this.on || this.dead || !play.active || player.inCar || flying || !ecosystem.ready) return null;
    const px = player.pos.x, pz = player.pos.z, feet = player.pos.y - EYE_HEIGHT;
    for (const id in SURVIVOR_FIELD_ACTIONS) {
      const target = SURVIVOR_FIELD_ACTIONS[id].find(this, px, feet, pz);
      if (target !== null) return { id, target };
    }
    return null;
  },

  // The action button (or E) pressed: a press action acts on what fieldAction finds now; a hold action is held
  // (fieldHeld) and runs each tick in update() while it stays the action in reach, until releaseField.
  pressField() {
    const a = this.fieldAction();
    if (!a) return;
    const def = SURVIVOR_FIELD_ACTIONS[a.id];
    if (def.hold) { this.fieldHeld = a.id; return; }
    def.run(this, a.target);
    if (def.squat) stance.squat(SURVIVOR_CONFIG.squatS);
    this.draw();
  },

  releaseField() { this.fieldHeld = null; },

  // A held action's tick: it runs while the held action is the one in reach (out of the water and back resumes).
  holdField(dt) {
    const a = this.fieldAction();
    if (a && a.id === this.fieldHeld) SURVIVOR_FIELD_ACTIONS[a.id].run(this, a.target, dt);
  },

  // The nearest live plant in reach, or null.
  plantInReach(px, feet, pz) {
    const R = SURVIVOR_CONFIG.reach;
    const np = ecosystem.plantGrid.queryInto(this._qp, px, pz, R.radius);
    let best = null, bestD2 = R.radius * R.radius;
    for (let i = 0; i < np; i++) {
      const p = this._qp[i];
      if (!p.alive || Math.abs(p.position.y - feet) > R.height) continue;
      const d2 = tools.distSq(px, pz, p.position.x, p.position.z);
      if (d2 <= bestD2) { bestD2 = d2; best = p; }
    }
    return best;
  },

  // The cat within reach, as plants are.
  catInReach(px, feet, pz) {
    const R = SURVIVOR_CONFIG.reach, c = cat.position;
    return Math.abs(c.y - feet) <= R.height && tools.distSq(px, pz, c.x, c.z) <= R.radius * R.radius;
  },

  // Standing in water, or swimming: where the player can drink.
  atWater(px, pz) { return (player.grounded || swimming) && isWaterAt(px, pz); },

  // The whole plant goes into the first free slot, its food the bites it has left.
  harvest(p) {
    const free = this.inventory.indexOf(null);
    if (free < 0) return;
    const food = playerPlantFood(p.health);
    p.health = 0;
    p.alive = false;
    ecosystem.plantsDied = true;
    plantRenderer.touch(p);
    this.inventory[free] = this.makeItem('plant', { food });
  },

  // The box goes into the first free slot, closed (its contents are drawn when it is opened); the crate moves on.
  collect(crate) {
    const free = this.inventory.indexOf(null);
    if (free < 0) return;
    foodBoxes.eat(crate);
    this.inventory[free] = this.makeItem('crate');
  },

  // Use the item in slot i (key or tap) by its kind's action: a box opens into its contents in the same slot,
  // food is eaten, water drunk.
  useSlot(i) {
    const item = this.inventory[i];
    if (!item || !this.on || this.dead) return;
    const act = SURVIVOR_ACTIONS[SURVIVOR_CONFIG.inventory.items[item.kind].action];
    if (act.consumed) { this.inventory[i] = null; this.tally(item.kind); }
    act.run(this, i, item);
    this.draw();
  },

  die(cause) {
    this.dead = true;
    this.avatar.alive = false;
    this.run.cause = cause;
    const r = this.run, eaten = Object.entries(r.eaten);
    runCauseEl.textContent = SURVIVOR_CONFIG.causes[cause] ?? 'Died';
    runStatsEl.textContent = '';
    const row = (k, v) => { const dt = document.createElement('dt'), dd = document.createElement('dd'); dt.textContent = k; dd.textContent = v; runStatsEl.append(dt, dd); };
    row('Days survived', (r.hours / 24).toFixed(1));
    for (const [kind, n] of eaten) {
      const def = SURVIVOR_CONFIG.inventory.items[kind];   // none for kills (deer): eaten
      row(`${def ? SURVIVOR_ACTIONS[def.action].past : 'Ate'} (${def?.label.toLowerCase() ?? kind})`, n);
    }
    if (!eaten.length) row('Ate', 'nothing');
    this.showPanel();
    if (play.locked) document.exitPointerLock();
  },

  // A soft red edge whose strength follows the hit, fading out.
  flash(amount) {
    const F = SURVIVOR_CONFIG.flash;
    if (amount < F.minDamage) return;
    const s = hurtFlashEl.style;
    s.transition = 'none';
    s.opacity = String(F.maxOpacity * Math.min(1, amount / F.fullAtDamage + 0.25));
    void hurtFlashEl.offsetWidth;
    s.transition = `opacity ${F.fadeS}s ease-out`;
    s.opacity = '0';
  },

  draw() {
    const h = Math.round(this.health);
    const f = Math.round(100 - this.foodNeed), w = Math.round(100 - this.waterNeed);
    const key = h * 1000000 + f * 1000 + w;
    if (key !== this._shown) {
      this._shown = key;
      needHealthEl.style.width = h + '%';
      needFoodEl.style.width = f + '%';
      needWaterEl.style.width = w + '%';
    }
    const day = this.run ? Math.floor(this.run.hours / 24) + 1 : 1;
    if (day !== this._shownDay) { this._shownDay = day; needDayEl.textContent = `Day ${day}`; }
    // the player's body, read out as people's labels read theirs (no generation: the player has none)
    const info = pov.infoKey();
    if (info >= 0) {
      if (info !== this._shownInfo || pov.sex !== this._shownSex) {
        this._shownInfo = info; this._shownSex = pov.sex;
        // one span per field: the top row spaces them evenly after the day (#needTop)
        needInfoEl.replaceChildren(...personInfoFields(info, pov.sex).map(f => {
          const s = document.createElement('span');
          s.textContent = f;
          return s;
        }));
      }
    }
    const slots = this.inventory.map(it => it ? it.kind : '').join(',');
    if (slots !== this._shownSlots) {
      this._shownSlots = slots;
      this.inventory.forEach((it, i) => {
        const el = slotEls[i], item = it && SURVIVOR_CONFIG.inventory.items[it.kind];
        el.querySelector('span').textContent = item ? item.icon : '';
        el.disabled = !item;
        el.setAttribute('aria-label', item ? `${SURVIVOR_ACTIONS[item.action].verb} ${item.label.toLowerCase()}` : 'Empty slot');
      });
      // any inventory change (craft, use, pick up) can free or fill the slot Harvest and Collect need
      updateCarButton();
      // the craft slot shows what the carried items make
      const c = this.craftable(), made = c && SURVIVOR_CONFIG.inventory.items[c.recipe.makes];
      craftEl.querySelector('span').textContent = made ? made.icon : '';
      craftEl.disabled = !made;
      craftEl.setAttribute('aria-label', made ? `Craft ${made.label.toLowerCase()}` : 'Nothing to craft');
    }
    const hurt = [...this.injuries].join(',');
    if (hurt !== this._shownInjuries) {
      this._shownInjuries = hurt;
      const defs = [...this.injuries].map(id => SURVIVOR_CONFIG.injuries[id]);
      injuriesEl.textContent = defs.map(d => d.icon).join('');
      injuriesEl.setAttribute('aria-label', defs.map(d => d.label).join(', '));
      injuriesEl.classList.toggle('on', defs.length > 0);
    }
  },

  // the needs panel, and the run summary after a death, show while Survivor mode is in play
  showPanel(inPlay = play.active) {
    needsEl.classList.toggle('on', inPlay && this.on);
    runOverEl.classList.toggle('on', inPlay && this.on && this.dead);
  }
};

// BIND INVENTORY: inventory slot keys and taps, the craft slot (game.useSlot, game.craft); main calls it in the original listener order.
export function bindInventory() {
  // inventory: a slot's key or a tap uses its item (game.useSlot); the craft slot's crafts (game.craft)
  addEventListener('keydown', e => {
    if (e.repeat || !play.active) return;
    const i = SURVIVOR_CONFIG.inventory.keys.indexOf(e.code);
    if (i >= 0) game.useSlot(i);
    else if (e.code === SURVIVOR_CONFIG.craft.key) game.craft();
  });
  slotEls.forEach((el, i) => el.addEventListener('click', () => { game.useSlot(i); el.blur(); }));
  craftEl.addEventListener('click', () => { game.craft(); craftEl.blur(); });
}
export const BRAIN_NODE_GEO = new THREE.SphereGeometry(0.13, 8, 6);
export const brainNodeMat = new THREE.MeshBasicMaterial({ toneMapped: false });
export const brainLineMat = new THREE.LineBasicMaterial({
  vertexColors: true, transparent: true, depthWrite: false, toneMapped: false
});
export const _bCol = new THREE.Color(), _bMat = new THREE.Matrix4();

export function buildBrain(nn) {
  const I = nn.inputDims, NA = nn.lobeSizeA, NB = nn.lobeSizeB, O = nn.outputDims;
  const spread = (count, radius) => Array.from({ length: count }, (_, i) => {
    const ang = (i / count) * Math.PI * 2;
    return new THREE.Vector3(0, Math.cos(ang) * radius, Math.sin(ang) * radius);
  });
  const posIn = [], inCol = [];
  const G = BRAIN_IN_GROUPS.length;
  for (let g = 0; g < G; g++) {
    const ga = (g / G) * Math.PI * 2 - Math.PI / 2;
    const gy = Math.cos(ga) * 1.5, gz = Math.sin(ga) * 1.5;
    for (let k = 0; k < BRAIN_IN_GROUPS[g]; k++) {
      const ka = (k / BRAIN_IN_GROUPS[g]) * Math.PI * 2;
      posIn.push(new THREE.Vector3(Math.cos(ka) * 0.30, gy + Math.sin(ka) * 0.30, gz));
      inCol.push(BRAIN_GROUP_COLS[g]);
    }
  }
  const posA = spread(NA, 0.55), posB = spread(NB, 0.55), posOut = spread(O, 0.90);
  posIn.forEach(p => p.x += -2.8);
  posA.forEach(p => p.y += 1.1);
  posB.forEach(p => p.y -= 1.1);
  posOut.forEach(p => p.x += 2.8);

  const oA = I, oB = I + NA, oOut = I + NA + NB, total = oOut + O;
  const nodePos = [...posIn, ...posA, ...posB, ...posOut];
  const baseCol = [], fireCol = [];
  for (let k = 0; k < total; k++) {
    const hex = k < oA ? inCol[k] : k < oB ? 0x00e5ff : k < oOut ? 0xaaff00 : 0x00ff88;
    baseCol.push(new THREE.Color(hex));
    fireCol.push(new THREE.Color(k >= oOut ? 0xff4444 : hex));
  }
  const mesh = new THREE.InstancedMesh(BRAIN_NODE_GEO, brainNodeMat, total);
  for (let k = 0; k < total; k++) {
    mesh.setMatrixAt(k, _bMat.makeTranslation(nodePos[k].x, nodePos[k].y, nodePos[k].z));
    mesh.setColorAt(k, _bCol.copy(baseCol[k]).multiplyScalar(BRAIN_DIM));
  }

  const verts = [], cols = [], outEdges = Array.from({ length: total }, () => []);
  const pushSeg = (p, q, c, op) => {
    verts.push(p.x, p.y, p.z, q.x, q.y, q.z);
    cols.push(c.r, c.g, c.b, op, c.r, c.g, c.b, op);
  };
  const edgeCol = w => new THREE.Color(w >= 0 ? 0x50a0ff : 0xff5050);
  const straight = (src, pa, pb, w) => {
    const start = verts.length / 3;
    pushSeg(pa, pb, edgeCol(w), 0.18);
    outEdges[src].push({ start, end: start + 2, baseOp: 0.18 });
  };
  const curved = (src, pa, pb, w, zBias) => {
    const mid = pa.clone().lerp(pb, 0.5); mid.z += zBias;
    const pts = new THREE.QuadraticBezierCurve3(pa, mid, pb).getPoints(16);
    const c = edgeCol(w), start = verts.length / 3;
    for (let i = 0; i < pts.length - 1; i++) pushSeg(pts[i], pts[i + 1], c, 0.22);
    outEdges[src].push({ start, end: verts.length / 3, baseOp: 0.22 });
  };
  for (let i = 0; i < I; i++) for (let j = 0; j < NA; j++) {
    const k = i * NA + j; if (nn.maskIA[k]) straight(i, posIn[i], posA[j], nn.wIA[k]);
  }
  for (let i = 0; i < I; i++) for (let j = 0; j < NB; j++) {
    const k = i * NB + j; if (nn.maskIB[k]) straight(i, posIn[i], posB[j], nn.wIB[k]);
  }
  for (let i = 0; i < NA; i++) for (let j = 0; j < NB; j++) {
    const k = i * NB + j; if (nn.maskAB[k]) curved(oA + i, posA[i], posB[j], nn.wAB[k], 0.70);
  }
  for (let i = 0; i < NB; i++) for (let j = 0; j < NA; j++) {
    const k = i * NA + j; if (nn.maskBA[k]) curved(oB + i, posB[i], posA[j], nn.wBA[k], -0.70);
  }
  for (let i = 0; i < NA; i++) for (let j = 0; j < O; j++) {
    const k = i * O + j; if (nn.maskAO[k]) straight(oA + i, posA[i], posOut[j], nn.wAO[k]);
  }
  for (let i = 0; i < NB; i++) for (let j = 0; j < O; j++) {
    const k = i * O + j; if (nn.maskBO[k]) straight(oB + i, posB[i], posOut[j], nn.wBO[k]);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
  const colorAttr = new THREE.Float32BufferAttribute(cols, 4);
  geo.setAttribute('color', colorAttr);
  const lines = new THREE.LineSegments(geo, brainLineMat);
  lines.renderOrder = 2;

  const group = new THREE.Group();
  group.add(mesh, lines);
  group.scale.setScalar(BRAIN_SCALE);
  group.visible = false;
  scene.add(group);
  return {
    group, mesh, lines, colorAttr, outEdges, nodePos, baseCol, fireCol,
    fire: new Int8Array(total).fill(-1), total, oA, oB, oOut,
    phase: Math.random() * Math.PI * 2
  };
}

export function disposeBrain(b) {
  scene.remove(b.group);
  b.lines.geometry.dispose();
  b.mesh.dispose();
}

export function brainActivity(b, a) {
  const nn = a.brain, out = nn.output ?? 0;
  const arr = b.colorAttr.array;
  let dirty = false;
  for (let k = 0; k < b.total; k++) {
    let f;
    if (k < b.oA) f = Math.abs(nn.input[k]) > 0.5;
    else if (k < b.oB) f = nn.actA[k - b.oA] >= 1.0;
    else if (k < b.oOut) f = nn.actB[k - b.oB] >= 1.0;
    else f = (k - b.oOut) === out;
    const v = f ? 1 : 0;
    if (b.fire[k] === v) continue;
    b.fire[k] = v;
    dirty = true;
    const sc = f ? 1.6 : 1.0, p = b.nodePos[k];
    b.mesh.setMatrixAt(k, _bMat.makeScale(sc, sc, sc).setPosition(p.x, p.y, p.z));
    b.mesh.setColorAt(k, f ? b.fireCol[k] : _bCol.copy(b.baseCol[k]).multiplyScalar(BRAIN_DIM));
    for (const e of b.outEdges[k]) {
      const op = f ? 0.75 : e.baseOp;
      for (let vi = e.start; vi < e.end; vi++) arr[vi * 4 + 3] = op;
    }
  }
  if (dirty) {
    b.mesh.instanceMatrix.needsUpdate = true;
    b.mesh.instanceColor.needsUpdate = true;
    b.colorAttr.needsUpdate = true;
  }
}

export class HealthBars {
  constructor() {
    this.bars = new Map();
    this.spare = [];
    this.seen = new Set();

    const rows = BAR_ICONS.length, pad = 4, gap = 3;
    const rh = (BAR_CANVAS_H - 2 * pad - (rows - 1) * gap) / rows;
    this.farBarX = -BAR_W_M / 2 + (pad + 24) * BAR_PX;
    this.farBarW = (BAR_CANVAS_W - (pad + 24) - 22 - pad) * BAR_PX;
    this.farBarH = rh * 0.62 * BAR_PX;
    this.farRowY = [];
    for (let i = 0; i < rows; i++) this.farRowY.push(BAR_H_M - (pad + i * (rh + gap) + rh / 2) * BAR_PX);

    const barGeo = new THREE.PlaneGeometry(1, 1);
    barGeo.translate(0.5, 0, 0);                                     // left-anchored, so scale.x is the fill
    const barMat = new THREE.MeshBasicMaterial({ toneMapped: false, side: THREE.DoubleSide });
    this.farBars = new THREE.InstancedMesh(barGeo, barMat, FAR_STAT_MAX * rows);
    const c = new THREE.Color();
    for (let j = 0; j < FAR_STAT_MAX * rows; j++) this.farBars.setColorAt(j, c.set(BAR_COLORS[j % rows]));
    this.farBars.instanceColor.needsUpdate = true;
    this.farBars.frustumCulled = false;
    this.farBars.count = 0;
    this.farBars.visible = false;
    scene.add(this.farBars);

    const lobeGeo = new THREE.IcosahedronGeometry(LOBE_RADIUS * BRAIN_SCALE, 0);
    this.farLobes = new THREE.InstancedMesh(lobeGeo, new THREE.MeshBasicMaterial({ toneMapped: false }), FAR_STAT_MAX * 2);
    this.farLobes.setColorAt(0, c.set(0));
    this.farLobes.frustumCulled = false;
    this.farLobes.count = 0;
    this.farLobes.visible = false;
    scene.add(this.farLobes);
    this.lobeBase = LOBE_COLS.map(h => new THREE.Color(h));

    this._right = new THREE.Vector3();
    this._up = new THREE.Vector3();
    this._c = new THREE.Color();
    this._fill = [0, 0, 0, 0];
    this.tick = 0;
    this.enabled = true;

    // Hidden stand-ins for a near stats sprite and a brain, never drawn, so the load's compileAsync builds their shaders.
    this.warmBar = this.makeBar();
    const warmGeo = new THREE.BufferGeometry();
    warmGeo.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, 0, 0, 0], 3));
    warmGeo.setAttribute('color', new THREE.Float32BufferAttribute([1, 1, 1, 1, 1, 1, 1, 1], 4));
    this.warmLines = new THREE.LineSegments(warmGeo, brainLineMat);
    this.warmLines.visible = false;
    this.warmNodes = new THREE.InstancedMesh(BRAIN_NODE_GEO, brainNodeMat, 1);
    this.warmNodes.setColorAt(0, this._c);
    this.warmNodes.visible = false;
    scene.add(this.warmLines, this.warmNodes);
  }

  setEnabled(on) {
    this.enabled = on;
    if (on) return;
    for (const bar of this.bars.values()) {
      bar.sprite.visible = false;
      if (bar.brain) bar.brain.group.visible = false;
    }
    perf.instances(this.farBars, 0);
    perf.instances(this.farLobes, 0);
  }

  firing(act) {
    let n = 0;
    for (let i = 0; i < act.length; i++) if (act[i] >= 1.0) n++;
    return n / act.length;
  }

  makeBar() {
    const canvas = document.createElement('canvas');
    canvas.width = BAR_CANVAS_W; canvas.height = BAR_SPRITE_CANVAS_H;
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    const mat = new THREE.SpriteMaterial({
      map: tex, transparent: true, depthWrite: false, toneMapped: false
    });
    const sprite = new THREE.Sprite(mat);
    sprite.scale.set(BAR_W_M, BAR_H_M, 1);
    sprite.center.set(0.5, 0);
    sprite.renderOrder = 2;
    sprite.visible = false;
    scene.add(sprite);
    return {
      sprite, canvas, ctx: canvas.getContext('2d'), tex, key: -1, infoKey: -1,
      brain: null, brainFor: null, nearTick: 0
    };
  }

  headTop(a) {
    const hs = a.heightScale;
    return a.position.y + (NPC_RIG_TOP[a.type] * hs - a.footLift()) * NPC_UNIT;
  }

  // Memory arrow heading relative to facing, snapped; -1 when nothing is remembered.
  heading(a, has, sin, cos) {
    if (!has) return -1;
    const rel = Math.atan2(sin, cos) - a.facingAngle;
    const k = Math.round(-rel / (2 * Math.PI) * ARROW_STEPS);
    return ((k % ARROW_STEPS) + ARROW_STEPS) % ARROW_STEPS;
  }

  arrow(ctx, x, y, size, step, color) {
    const u = size / 12;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(step / ARROW_STEPS * 2 * Math.PI);
    ctx.strokeStyle = color; ctx.fillStyle = color;
    ctx.lineWidth = 1.5 * u; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(0, 4 * u); ctx.lineTo(0, -4 * u); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, -6 * u); ctx.lineTo(-2.5 * u, -2 * u); ctx.lineTo(2.5 * u, -2 * u);
    ctx.closePath(); ctx.fill();
    ctx.restore();
  }

  // People only (0 for others): age code (-1 child, else whole years), shown height in inches, weight in lb.
  infoKey(a) {
    if (a.type !== 'human') return 0;
    const growth = a.isAdult ? 1 : Math.min(1, (ecosystem.ticks - a.birthTick) / NPC_MATURITY_TICKS);
    const s = GROWTH_MIN_SCALE + (1 - GROWTH_MIN_SCALE) * growth;
    const metres = a.heightScale * NPC_RIG_TOP.human * NPC_UNIT * s;   // crown height as drawn
    const age = a.isAdult ? Math.floor(a.ageYears()) : -1;
    return personInfoKey(age, a.sex, a.look ? a.look.buildDev : 0, metres);
  }

  infoFields(a, key) {
    return [`Gen ${a.generation}`, ...personInfoFields(key, a.sex)];
  }

  draw(slot, vals, arrows, a) {
    // packed integer key, no allocation per person per tick; exact in a double
    const V = BAR_STEPS + 1, A = ARROW_STEPS + 1;
    const key = ((((((vals[0] * V + vals[1]) * V + vals[2]) * V + vals[3])
      * A + arrows[1] + 1) * A + arrows[2] + 1) * A + arrows[3] + 1);
    const info = this.infoKey(a);
    if (slot.key === key && slot.infoKey === info) return;
    slot.key = key;
    slot.infoKey = info;
    const { ctx } = slot;
    const W = BAR_CANVAS_W, H = BAR_CANVAS_H;
    const rows = BAR_ICONS.length;
    const pad = 4, gap = 3, rh = (H - 2 * pad - (rows - 1) * gap) / rows;
    const iconW = 24, arrowW = 22;
    const bx = pad + iconW, bw = W - bx - arrowW - pad;
    const bh = rh * 0.62;
    ctx.clearRect(0, 0, W, BAR_SPRITE_CANVAS_H);
    ctx.fillStyle = 'rgba(12, 15, 21, 0.7)';
    ctx.fillRect(0, 0, W, info ? BAR_SPRITE_CANVAS_H : H);
    ctx.font = `${Math.round(rh * 0.8)}px ${EMOJI_FONT}`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    for (let i = 0; i < rows; i++) {
      const cy = pad + i * (rh + gap) + rh / 2;
      ctx.fillText(BAR_ICONS[i], pad + iconW / 2, cy);
      ctx.fillStyle = 'rgba(232, 228, 220, 0.12)';
      ctx.fillRect(bx, cy - bh / 2, bw, bh);
      ctx.fillStyle = BAR_COLORS[i];
      ctx.fillRect(bx, cy - bh / 2, bw * vals[i] / BAR_STEPS, bh);
      if (arrows[i] >= 0) this.arrow(ctx, W - pad - arrowW / 2, cy, rh * 0.9, arrows[i], BAR_COLORS[i]);
    }
    if (info) {
      // one row under the bars, the fields spread across the width like the player's panel row;
      // the font shrinks only when the fields and their least gaps would not fit
      const fields = this.infoFields(a, info), n = fields.length, maxW = W - 2 * pad;
      const measure = px => {
        ctx.font = `${px}px sans-serif`;
        let tw = 0;
        for (const f of fields) tw += ctx.measureText(f).width;
        return tw;
      };
      let px = BAR_INFO_FONT, tw = measure(px);
      const need = tw + BAR_INFO_GAP * (n - 1);
      if (need > maxW) { px = Math.max(5, px * maxW / need); tw = measure(px); }
      const fieldGap = (maxW - tw) / (n - 1);
      ctx.fillStyle = 'rgba(232, 228, 220, 0.95)';
      ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
      let x = pad;
      for (const f of fields) {
        ctx.fillText(f, x, H + BAR_INFO_H / 2);
        x += ctx.measureText(f).width + fieldGap;
      }
    }
    slot.tex.needsUpdate = true;
  }

  // Slots are taken up close and returned after BAR_RELEASE_TICKS away, so they track the nearby crowd.
  update(animals) {
    if (!this.enabled) return;
    const tick = ++this.tick;
    const spin = performance.now() / 1000 * BRAIN_SPIN;
    const now = ecosystem.time;
    const q = v => Math.floor(Math.max(0, Math.min(1, v)) * BAR_STEPS);   // bars round down
    const vals = [0, 0, 0, 0], arrows = [-1, -1, -1, -1];
    const seen = this.seen;
    seen.clear();

    updateNpcFrustum();
    const cam = viewPos, cq = viewQuat;
    this._right.set(1, 0, 0).applyQuaternion(cq);
    this._up.set(0, 1, 0).applyQuaternion(cq);
    const lod2 = perf.npcLodDist * perf.npcLodDist, farMax2 = perf.farStatDist * perf.farStatDist;
    const rows = BAR_ICONS.length;
    const lobeOff = 1.1 * BRAIN_SCALE;
    let nf = 0;
    let nl = 0;

    const qx = cq.x, qy = cq.y, qz = cq.z, qw = cq.w;
    const x2 = qx + qx, y2 = qy + qy, z2 = qz + qz;
    const xx = qx * x2, xy = qx * y2, xz = qx * z2, yy = qy * y2, yz = qy * z2, zz = qz * z2;
    const wx = qw * x2, wy = qw * y2, wz = qw * z2;
    const r0 = 1 - (yy + zz), r1 = xy + wz, r2 = xz - wy;
    const r4 = xy - wz, r5 = 1 - (xx + zz), r6 = yz + wx;
    const r8 = xz + wy, r9 = yz - wx, r10 = 1 - (xx + yy);
    const barArr = this.farBars.instanceMatrix.array, barH = this.farBarH, barW = this.farBarW;
    const rx = this._right.x, ry = this._right.y, rz = this._right.z, ux = this._up.x, uy = this._up.y, uz = this._up.z;
    const lobeArr = this.farLobes.instanceMatrix.array;

    for (const a of animals) {
      if (!a.alive) continue;
      let bar = this.bars.get(a);
      if (bar) seen.add(a);

      // distance first (cheap), then the frustum: stats past perf.farStatDist are not drawn (on high they would be under a pixel tall)
      const ex = a.position.x - cam.x, ey = a.position.y - cam.y, ez = a.position.z - cam.z;
      const d2 = ex * ex + ey * ey + ez * ez;
      if (d2 > farMax2) continue;
      const barY = this.headTop(a) + BAR_ABOVE;
      if (!npcOnScreen(a.position.x, barY + NPC_STATS_UP, a.position.z, NPC_STATS_R)) continue;
      if (d2 > lod2) {
        if (nf >= FAR_STAT_MAX) continue;

        const fill = this._fill;
        fill[0] = a.health / a.maxHealth;
        fill[1] = 1 - Math.min(a.foodNeed, 100) / 100;
        fill[2] = 1 - Math.min(a.waterNeed, 100) / 100;
        fill[3] = a.mateFill(now);
        const dx = this.farBarX;
        for (let i = 0; i < rows; i++) {
          const f = Math.max(0, Math.min(1, fill[i]));
          const dy = this.farRowY[i];
          const sx = Math.max(f * barW, 1e-4);
          const o = (nf * rows + i) * 16;
          barArr[o] = r0 * sx; barArr[o + 1] = r1 * sx; barArr[o + 2] = r2 * sx; barArr[o + 3] = 0;
          barArr[o + 4] = r4 * barH; barArr[o + 5] = r5 * barH; barArr[o + 6] = r6 * barH; barArr[o + 7] = 0;
          barArr[o + 8] = r8; barArr[o + 9] = r9; barArr[o + 10] = r10; barArr[o + 11] = 0;
          barArr[o + 12] = a.position.x + rx * dx + ux * dy;
          barArr[o + 13] = barY + ry * dx + uy * dy;
          barArr[o + 14] = a.position.z + rz * dx + uz * dy;
          barArr[o + 15] = 1;
        }

        const nn = a.brain;
        if (nn) {
          const by = barY + BAR_H_M + BRAIN_ABOVE + BRAIN_HALF_H * BRAIN_SCALE;
          const fireA = this.firing(nn.actA), fireB = this.firing(nn.actB);
          for (let l = 0; l < 2; l++) {
            const o = (nl * 2 + l) * 16;
            lobeArr[o + 12] = a.position.x;
            lobeArr[o + 13] = by + (l === 0 ? lobeOff : -lobeOff);
            lobeArr[o + 14] = a.position.z;
            const k = BRAIN_DIM + (1 - BRAIN_DIM) * (l === 0 ? fireA : fireB);
            this.farLobes.setColorAt(nl * 2 + l, this._c.copy(this.lobeBase[l]).multiplyScalar(k));
          }
          nl++;
        }
        nf++;
        continue;
      }

      if (!bar) {
        bar = this.spare.pop() || this.makeBar();
        bar.key = -1;
        bar.infoKey = -1;
        this.bars.set(a, bar);
        seen.add(a);
      }
      bar.nearTick = tick;

      vals[0] = q(a.health / a.maxHealth);
      vals[1] = q(1 - Math.min(a.foodNeed, 100) / 100);
      vals[2] = q(1 - Math.min(a.waterNeed, 100) / 100);
      vals[3] = q(a.mateFill(now));
      arrows[1] = this.heading(a, a.hasFood, a.rayFoodSin, a.rayFoodCos);
      arrows[2] = this.heading(a, a.hasWater, a.rayWaterSin, a.rayWaterCos);
      arrows[3] = this.heading(a, a.hasMate, a.rayMateSin, a.rayMateCos);
      this.draw(bar, vals, arrows, a);
      bar.sprite.position.set(a.position.x, barY, a.position.z);
      bar.sprite.visible = true;

      const nn = a.brain;
      if (!nn) { if (bar.brain) bar.brain.group.visible = false; continue; }
      if (bar.brainFor !== nn) {
        if (bar.brain) disposeBrain(bar.brain);
        bar.brain = buildBrain(nn);
        bar.brainFor = nn;
      }
      const b = bar.brain;
      brainActivity(b, a);
      b.group.position.set(a.position.x, barY + BAR_H_M + BRAIN_ABOVE + BRAIN_HALF_H * BRAIN_SCALE, a.position.z);
      b.group.rotation.set(BRAIN_TILT, spin + b.phase, 0);
      b.group.visible = true;
    }
    for (const [a, bar] of this.bars) {
      const alive = seen.has(a);
      if (alive && bar.nearTick === tick) continue;
      bar.sprite.visible = false;
      if (bar.brain) bar.brain.group.visible = false;
      if (alive && tick - bar.nearTick <= BAR_RELEASE_TICKS) continue;
      this.bars.delete(a);
      this.spare.push(bar);
    }

    perf.instances(this.farBars, nf * rows);
    perf.instances(this.farLobes, nl * 2);
    perf.instanceColors(this.farLobes, nl * 2);
  }
}

export const healthBars = new HealthBars();


// CONTROLS

export const player = {
  pos: new THREE.Vector3(0, EYE_HEIGHT, 0),
  vel: new THREE.Vector3(),
  yaw: 0,            // the view (camera) direction; look input writes it
  pitch: 0,
  heading: 0,        // the body's facing on foot: it turns toward the direction of movement
  grounded: true,
  running: false,    // on foot, moving, at RUN_SPEED this frame (Survivor mode needs read it)
  inCar: false       // driving; the cat's own is cat.inCar (he may still be boarding, or left behind)
};
export const keys = new Set();
// In play: the panel closed and input accepted (active), and the pointer locked to the canvas (locked); main sets both.
export const play = {
  active: false,
  locked: false
};
// Last pointer type, so a tap-started load does not grab pointer lock.
export let lastPointerType = 'mouse';
// BIND KEYS: pointer type, held keys; main calls it in the original listener order.
export function bindKeys() {
  addEventListener('pointerdown', e => { lastPointerType = e.pointerType; }, true);
  addEventListener('keydown', e => {
    keys.add(e.code);
    wake();
    if (e.code === 'Space' && play.active) e.preventDefault();
  });
  addEventListener('keyup', e => { keys.delete(e.code); wake(); });
}

// BIND MOUSELOOK: mouse look while the pointer is locked; main calls it in the original listener order.
export function bindMouseLook() {
  addEventListener('mousemove', e => {
    if (!play.locked) return;
    player.yaw -= e.movementX * 0.0022;
    player.pitch -= e.movementY * 0.0022;
    player.pitch = Math.max(-LOOK_PITCH_MAX, Math.min(LOOK_PITCH_MAX, player.pitch));
    wake();
  });
}

export const touchMove = { x: 0, z: 0 };
export let stickId = null, stickCx = 0, stickCy = 0;
export let lookId = null, lookX = 0, lookY = 0;
export let jumpQueued = false;
// double tap on the stick toggles crouch (stance); crouchY eases the eye toward it
export let lastStickTapAt = 0, crouchY = 0;

// STANCE: crouch and sprint exclude each other and the latest input wins. Sprint is a hold (Shift, the sprint
// pedal), crouch a toggle. Pressing sprint stands up; crouching stops a held sprint until it is pressed again.
// A squat (squat(seconds), e.g. picking something up) holds the body low for that long, then it stands again.
// `low` is the one rule for the crouched pose and speed: crouched or squatting.
export const stance = {
  crouched: false,
  squatLeft: 0,           // seconds of squat left
  sprintBlocked: false,   // crouched while sprint was held: that hold no longer runs
  _sprintWas: false,

  get squatting() { return this.squatLeft > 0; },
  get low() { return this.crouched || this.squatting; },

  toggleCrouch() {
    this.crouched = !this.crouched;
    if (this.crouched) this.sprintBlocked = true;
  },
  stand() { this.crouched = false; this.squatLeft = 0; },
  squat(seconds) { this.squatLeft = Math.max(this.squatLeft, seconds); wake(); },   // a longer squat under way stands
  unsquat() { this.squatLeft = 0; },
  tick(dt) { this.squatLeft = Math.max(0, this.squatLeft - dt); },

  // this frame's sprint input -> whether the player runs
  sprinting(held) {
    if (held && !this._sprintWas) { this.crouched = false; this.sprintBlocked = false; }
    if (!held) this.sprintBlocked = false;
    this._sprintWas = held;
    return held && !this.sprintBlocked;
  }
};
// knob offset is written once per frame, not per pointermove
// The touch stick's knob offset (px) and whether frame still has to draw it.
export const touchKnob = {
  dx: 0,
  dy: 0,
  dirty: false
};

// BIND TOUCH: touch stick and look, tap buttons, climb and fly; main calls it in the original listener order.
export function bindTouch() {
  {
    const el = renderer.domElement;

    el.addEventListener('pointerdown', e => {
      if (!play.active || e.pointerType !== 'touch') return;

      if (e.clientX < innerWidth / 2 && stickId === null) {
        stickId = e.pointerId;
        stickCx = e.clientX; stickCy = e.clientY;
        stickEl.style.left = stickCx + 'px';
        stickEl.style.top = stickCy + 'px';
        knobEl.style.transform = 'translate(0px, 0px)';
        stickEl.classList.toggle('flick', player.inCar);
        stickEl.classList.add('on');
        const now = performance.now();
        if (now - lastStickTapAt < TAP_GAP_MS) {
          if (!player.inCar && !flying) stance.toggleCrouch();
          lastStickTapAt = 0;
        } else lastStickTapAt = now;
      } else if (lookId === null) {
        lookId = e.pointerId;
        lookX = e.clientX; lookY = e.clientY;
      }
      wake();
    });

    el.addEventListener('pointermove', e => {
      if (e.pointerId === stickId) {
        let dx = e.clientX - stickCx, dy = e.clientY - stickCy;
        if (player.inCar) dy = 0;
        const reach = player.inCar ? FLICK_RADIUS : STICK_RADIUS;
        const d = Math.hypot(dx, dy);
        if (d > reach) { dx *= reach / d; dy *= reach / d; }
        touchKnob.dx = dx; touchKnob.dy = dy; touchKnob.dirty = true;
        touchMove.x = dx / reach;
        touchMove.z = -dy / reach;
      } else if (e.pointerId === lookId) {
        player.yaw -= (e.clientX - lookX) * 0.005;
        player.pitch -= (e.clientY - lookY) * 0.005;
        player.pitch = Math.max(-LOOK_PITCH_MAX, Math.min(LOOK_PITCH_MAX, player.pitch));
        lookX = e.clientX; lookY = e.clientY;
      } else {
        return;
      }
      wake();
    });

    const endTouch = e => {
      if (e.pointerId === stickId) {
        stickId = null;
        touchMove.x = touchMove.z = 0;
        touchKnob.dirty = false;
        stickEl.classList.remove('on');
      } else if (e.pointerId === lookId) {
        lookId = null;
      }
      wake();
    };
    el.addEventListener('pointerup', endTouch);
    el.addEventListener('pointercancel', endTouch);
  }
  {
    const taps = new Map();   // pointerId -> { btn, x, y }
    let swallowBtn = null, swallowUntil = 0;

    addEventListener('pointerdown', e => {
      if (e.pointerType !== 'touch') return;
      const btn = e.target instanceof Element ? e.target.closest(TAP_BUTTONS) : null;
      if (btn) taps.set(e.pointerId, { btn, x: e.clientX, y: e.clientY });
    }, true);
    addEventListener('pointerup', e => {
      const t = taps.get(e.pointerId);
      if (!t) return;
      taps.delete(e.pointerId);
      if (Math.hypot(e.clientX - t.x, e.clientY - t.y) > TAP_SLOP || t.btn.disabled) return;
      // only a tap that ends on the button counts
      const under = document.elementFromPoint(e.clientX, e.clientY);
      if (!under || !t.btn.contains(under)) return;
      swallowBtn = null;
      t.btn.click();
      swallowBtn = t.btn;
      swallowUntil = performance.now() + TAP_SWALLOW_MS;
    }, true);
    addEventListener('pointercancel', e => { taps.delete(e.pointerId); }, true);
    addEventListener('click', e => {
      if (swallowBtn && performance.now() < swallowUntil && e.target instanceof Element && swallowBtn.contains(e.target)) {
        e.stopImmediatePropagation();
        e.preventDefault();
        swallowBtn = null;
      }
    }, true);

    // no long-press haptics or menus while playing; touchstart is cancelled only where a touch never needs to scroll
    addEventListener('contextmenu', e => { if (play.active) e.preventDefault(); });
    addEventListener('touchstart', e => {
      if (!play.active || !(e.target instanceof Element)) return;
      if (e.target === renderer.domElement || e.target.closest(HOLD_SAFE)) e.preventDefault();
    }, { passive: false });
  }
  holdClimb(upEl, 1);
  holdClimb(downEl, -1);
  flyEl.addEventListener('click', toggleFly);
  addEventListener('keydown', e => {
    if (e.code === 'KeyF' && !e.repeat && play.active && !game.on) toggleFly();
  });
}

// FLY

export let flying = false;

export let climb = 0;

export function holdClimb(btn, dir) {
  btn.addEventListener('pointerdown', e => {
    btn.setPointerCapture(e.pointerId);
    climb = dir;
    btn.classList.add('held');
    wake();
  });
  const release = () => {
    if (climb === dir) climb = 0;
    btn.classList.remove('held');
    btn.blur();
    wake();
  };
  btn.addEventListener('pointerup', release);
  btn.addEventListener('pointercancel', release);
}

export function toggleFly() {
  if (player.inCar) return;
  flying = !flying;
  stance.stand();
  flyEl.classList.toggle('flying', flying);
  climbEl.classList.toggle('on', flying);
  climb = 0;
  upEl.classList.remove('held');
  downEl.classList.remove('held');
  // drop focus, or the next space press re-clicks the button
  flyEl.blur();
  player.vel.y = 0;
  player.grounded = false;
  wake();
}

export const carEl = document.getElementById('car');
export const useEl = document.getElementById('use');

export const car = {
  reset() { setPlayerInCar(false); this.placed = false; this.mesh.visible = false; this.speed = this.steer = this.spin = 0; },   // teardownWorld's entry
  placed: false,
  x: 0, y: 0, z: 0, yaw: 0, pitch: 0, roll: 0,
  speed: 0,        // m/s along the heading, negative in reverse
  steer: 0,        // front-wheel angle, rad, positive = left
  spin: 0,
  mesh: null, front: [], wheels: []
};

// CHASE CAMERA: the car's and the walking player's view. Look input (player.yaw / pitch, written by mouse and touch)
// is tracked here; CAM_LOOK_HOLD after the last look, while moving, the view swings back behind the heading.
// The car uses step (tight follow plus a look offset); on foot, drift (the view stays free, swinging back slowly).
export const chaseCam = {
  camYaw: 0, lookYaw: 0, lookPitch: 0, lookAt: 0, shownYaw: 0, shownPitch: 0, settling: false,

  // behind `heading`, no look offset
  reset(heading) {
    this.camYaw = heading;
    this.lookYaw = this.lookPitch = this.lookAt = 0;
    this.shownYaw = player.yaw; this.shownPitch = player.pitch;
    this.settling = false;
  },

  // Follow `heading`; the view's pitch is basePitch plus the look offset, kept within [minPitch, maxPitch].
  // Writes the result to player.yaw / pitch.
  step(dt, heading, moving, basePitch, minPitch, maxPitch) {
    const dYaw = player.yaw - this.shownYaw, dPitch = player.pitch - this.shownPitch;
    const now = performance.now();
    if (dYaw !== 0 || dPitch !== 0) this.lookAt = now;
    this.lookYaw += dYaw;
    this.lookPitch += dPitch;

    let dy = heading - this.camYaw;
    dy = Math.atan2(Math.sin(dy), Math.cos(dy));
    this.camYaw += dy * (1 - Math.exp(-CAM_FOLLOW * dt));
    if (now - this.lookAt > CAM_LOOK_HOLD && moving) {
      const k = Math.exp(-2 * dt);
      this.lookYaw *= k; this.lookPitch *= k;
      if (Math.abs(this.lookYaw) < 1e-4) this.lookYaw = 0;
      if (Math.abs(this.lookPitch) < 1e-4) this.lookPitch = 0;
    }
    this.lookPitch = Math.max(minPitch - basePitch, Math.min(maxPitch - basePitch, this.lookPitch));
    player.yaw = this.shownYaw = this.camYaw + this.lookYaw;
    player.pitch = this.shownPitch = basePitch + this.lookPitch;
    this.settling = Math.abs(dy) > 1e-4 || this.lookYaw !== 0 || this.lookPitch !== 0;
  },

  // On foot: the view is player.yaw itself; while moving, CAM_LOOK_HOLD after the last look, it swings toward
  // `heading` at `rate` (1/s). Pitch is left to the look input.
  drift(dt, heading, moving, rate) {
    const now = performance.now();
    if (player.yaw !== this.shownYaw || player.pitch !== this.shownPitch) this.lookAt = now;
    let dy = 0;
    if (moving && now - this.lookAt > CAM_LOOK_HOLD) {
      dy = Math.atan2(Math.sin(heading - player.yaw), Math.cos(heading - player.yaw));
      player.yaw += dy * (1 - Math.exp(-rate * dt));
    }
    this.shownYaw = player.yaw; this.shownPitch = player.pitch;
    this.settling = Math.abs(dy) > 1e-3;
  }
};

// Face the player (body and view) along `yaw`, the camera straight behind: spawns and leaving the car.
export function facePlayer(yaw, pitch) {
  player.yaw = player.heading = yaw;
  player.pitch = pitch;
  chaseCam.reset(yaw);
}

// Mesh: body, glasshouse, roof, lamps, four wheels (front two on steer pivots).
{
  const mat = c => new THREE.MeshLambertMaterial({ color: c });
  const paint = mat(0x9c2f2a), glass = mat(0x28313b), trim = mat(0x1d1f22);
  const tyre = mat(0x151617), head = mat(0xf2ecd8), tail = mat(0xb3261e);
  // built at full size inside a group scaled by CAR_SCALE
  const LEN = CAR_LEN / CAR_SCALE, WID = CAR_WID / CAR_SCALE, WB = CAR_WHEELBASE / CAR_SCALE;
  const TRACK = CAR_TRACK / CAR_SCALE, WR = CAR_WHEEL_R / CAR_SCALE;
  const root = new THREE.Group();
  const g = new THREE.Group();
  g.scale.setScalar(CAR_SCALE);
  root.add(g);
  const part = (w, h, d, x, y, z, m) => {
    const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
    b.position.set(x, y, z);
    g.add(b);
    return b;
  };
  // Lower body: narrow core plus side panels with arches cut over the wheels, dark liners behind each arch.
  {
    const yb = 0.31, yt = 0.93, L = LEN / 2, R = WR + 0.09;
    const arches = [-WB / 2, WB / 2];
    const core = 0.46;                 // core half-width: clear of the wheels at full lock
    const side = WID / 2 - core;   // side panel thickness
    // profile in (z, y): bottom edge left to right with the arches, then up and back across the top
    const prof = new THREE.Shape();
    prof.moveTo(-L, yb);
    for (const c of arches) {
      prof.lineTo(c - R, yb);
      prof.lineTo(c - R, WR);
      prof.absarc(c, WR, R, Math.PI, 0, true);
      prof.lineTo(c + R, yb);
    }
    prof.lineTo(L, yb);
    prof.lineTo(L, yt);
    prof.lineTo(-L, yt);
    prof.closePath();
    const panelGeo = new THREE.ExtrudeGeometry(prof, { depth: side, bevelEnabled: false, curveSegments: 12 });
    panelGeo.rotateY(Math.PI / 2);     // profile z -> car z (mirrored, symmetric), extrusion -> car +x
    for (const sx of [-1, 1]) {
      const m = new THREE.Mesh(panelGeo, paint);
      m.position.x = sx > 0 ? core : -WID / 2;
      g.add(m);
    }
    part(core * 2, yt - yb, LEN, 0, (yb + yt) / 2, 0, paint);
    const liner = new THREE.MeshLambertMaterial({ color: 0x0d0e10, side: THREE.DoubleSide });
    for (const c of arches) {
      const well = new THREE.Shape();
      well.moveTo(c - R, yb);
      well.lineTo(c + R, yb);
      well.lineTo(c + R, WR);
      well.absarc(c, WR, R, 0, Math.PI, false);
      well.closePath();
      const wellGeo = new THREE.ShapeGeometry(well, 12);
      wellGeo.rotateY(Math.PI / 2);
      for (const sx of [-1, 1]) {
        const m = new THREE.Mesh(wellGeo, liner);
        m.position.x = sx * (core + 0.005);
        g.add(m);
      }
    }
  }
  part(WID - 0.2, 0.5, 2.2, 0, 1.18, 0.25, glass);
  part(WID - 0.24, 0.05, 2.0, 0, 1.44, 0.25, paint);
  part(WID + 0.02, 0.18, 0.12, 0, 0.42, -LEN / 2, trim);
  part(WID + 0.02, 0.18, 0.12, 0, 0.42, LEN / 2, trim);
  for (const s of [-1, 1]) {
    part(0.34, 0.14, 0.04, s * 0.62, 0.72, -LEN / 2 - 0.01, head);
    part(0.34, 0.12, 0.04, s * 0.62, 0.74, LEN / 2 + 0.01, tail);
  }
  const wheelGeo = new THREE.CylinderGeometry(WR, WR, 0.24, 14);
  wheelGeo.rotateZ(Math.PI / 2);
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    const pivot = new THREE.Group();
    pivot.position.set(sx * TRACK / 2, WR, sz * WB / 2);
    const w = new THREE.Mesh(wheelGeo, tyre);
    w.rotation.order = 'YXZ';
    pivot.add(w);
    g.add(pivot);
    car.wheels.push(w);
    if (sz < 0) car.front.push(pivot);
  }
  root.rotation.order = 'YXZ';
  root.visible = false;
  scene.add(root);
  car.mesh = root;
}

// Ground under the axles and sides sets height, pitch and roll.
export function settleCar() {
  const fx = -Math.sin(car.yaw), fz = -Math.cos(car.yaw);
  const rx = Math.cos(car.yaw), rz = -Math.sin(car.yaw);
  const hb = CAR_WHEELBASE / 2, ht = CAR_TRACK / 2;
  const hf = groundAt(car.x + fx * hb, car.z + fz * hb);
  const hr = groundAt(car.x - fx * hb, car.z - fz * hb);
  const hR = groundAt(car.x + rx * ht, car.z + rz * ht);
  const hL = groundAt(car.x - rx * ht, car.z - rz * ht);
  car.y = (hf + hr + hR + hL) / 4;
  car.pitch = Math.atan2(hf - hr, CAR_WHEELBASE);
  car.roll = Math.atan2(hR - hL, CAR_TRACK);
}

export function syncCarMesh() {
  const m = car.mesh;
  m.position.set(car.x, car.y, car.z);
  m.rotation.set(car.pitch, car.yaw, car.roll);
  for (const p of car.front) p.rotation.y = car.steer;
  for (const w of car.wheels) w.rotation.x = -car.spin;
  loop.sceneDirty = true;
}

export function carFits(x, z, yaw, margin = 0.2) {
  const fx = -Math.sin(yaw), fz = -Math.cos(yaw);
  for (const o of CAR_CIRCLES) {
    const cx = x + fx * o, cz = z + fz * o, g = groundAt(cx, cz);
    if (shellAt(cx, cz) >= 0 || isWaterAt(cx, cz)) return false;
    if (solidOverlap(cx, cz, CAR_R + margin, g + CAR_STEP_UP, g + CAR_TOP)) return false;
  }
  return true;
}

// Parked on the right side of the nearest street, aligned with it, off the player.
export function placeCar(roads, x, z) {
  const cands = [];
  for (const r of roads || []) {
    if (PATH_KINDS.has(r.kind)) continue;
    const half = (r.width || ROAD_WIDTH[r.kind]) / 2;
    const side = Math.max(0, half - CAR_WID / 2 - 0.3);
    for (let i = 0; i < r.pts.length - 1; i++) {
      const [x0, z0] = r.pts[i], [x1, z1] = r.pts[i + 1];
      const len = Math.hypot(x1 - x0, z1 - z0);
      if (len < 0.01) continue;
      const ux = (x1 - x0) / len, uz = (z1 - z0) / len;
      const yaw = Math.atan2(-ux, -uz);
      const n = Math.max(1, Math.ceil(len / STREET_STEP));
      for (let k = 0; k <= n; k++) {
        const px = x0 + (x1 - x0) * k / n - uz * side;
        const pz = z0 + (z1 - z0) * k / n + ux * side;
        const d = (px - x) ** 2 + (pz - z) ** 2;
        if (d < 25 || d > 150 * 150) continue;
        cands.push({ px, pz, yaw, d });
      }
    }
  }
  cands.sort((a, b) => a.d - b.d);
  let spot = cands.find(c => carFits(c.px, c.pz, c.yaw));
  if (!spot) {
    // no street fits: nearest open ground, facing the player's way
    for (let d = 5; d <= 80 && !spot; d += 1) {
      for (let i = 0; i < 24; i++) {
        const a = i / 24 * 2 * Math.PI, px = x + Math.cos(a) * d, pz = z + Math.sin(a) * d;
        if (carFits(px, pz, player.yaw)) { spot = { px, pz, yaw: player.yaw }; break; }
      }
    }
  }
  setCar(spot);
}

export function setCar(spot) {
  car.placed = !!spot;
  car.mesh.visible = car.placed;
  car.speed = car.steer = car.spin = 0;
  if (!spot) return;
  car.x = spot.px; car.z = spot.pz; car.yaw = spot.yaw;
  settleCar();
  syncCarMesh();
  invalidate();
}
export function parkBesideCabin(c, yaw) {
  const s = CABIN_SCALE * CABIN_M;
  const fx = -Math.sin(yaw), fz = -Math.cos(yaw), rx = Math.cos(yaw), rz = -Math.sin(yaw);
  const halfDoor = 9 * s;   // Cabin DOOR_WIDTH / 2, rig units -> metres
  const floorFront = 34 * s;   // Cabin floor slab's front edge (CD / 2 + 4)
  const carBack = -CAR_CIRCLES[0] + CAR_R;   // car centre to its rear
  const ahead = floorFront + CABIN_CAR_GAP + carBack;
  const side = halfDoor + CABIN_CAR_WALKWAY + CAR_WID / 2;
  // only ever step further out or further aside, never toward the doorway's lane
  for (let df = 0; df <= 6; df += 0.5) {
    for (let ds = 0; ds <= 3; ds += 0.5) {
      for (const sign of [1, -1]) {
        const lat = sign * (side + ds), fwd = ahead + df;
        const px = c.x + rx * lat + fx * fwd, pz = c.z + rz * lat + fz * fwd;
        if (carFits(px, pz, yaw)) { setCar({ px, pz, yaw }); return true; }
      }
    }
  }
  return false;
}

export const _carPos = new THREE.Vector3();

// Move by (dx, dz), push each circle out of walls, carry the push to the centre; returns it or null.
export const _push = { x: 0, z: 0 };
export function moveCar(dx, dz) {
  car.x += dx; car.z += dz;
  let any = false;
  _push.x = _push.z = 0;
  for (let pass = 0; pass < 3; pass++) {
    let moved = false;
    const fx = -Math.sin(car.yaw), fz = -Math.cos(car.yaw);
    for (const o of CAR_CIRCLES) {
      const cx = car.x + fx * o, cz = car.z + fz * o, g = groundAt(cx, cz);
      _carPos.set(cx, g, cz);
      if (resolveCollisions(_carPos, CAR_R, g, g + CAR_TOP, CAR_STEP_UP)) {
        const px = _carPos.x - cx, pz = _carPos.z - cz;
        car.x += px; car.z += pz;
        _push.x += px; _push.z += pz;
        moved = any = true;
      }
    }
    if (!moved) break;
  }
  return any ? _push : null;
}

// One physics step. throttle, steer in [-1, 1] (steer > 0 = left).
export function carPhysics(dt, throttle, steer, handbrake) {
  if (dt <= 0) return;
  const v = car.speed;

  const lock = CAR_STEER_MAX / (1 + Math.abs(v) / CAR_STEER_FALL);
  const target = steer * lock;
  const ds = target - car.steer, maxDs = CAR_STEER_RATE * dt;
  car.steer += Math.max(-maxDs, Math.min(maxDs, ds));

  let a = 0;
  if (throttle > 0) {
    if (v < -0.3) a = CAR_BRAKE * throttle;
    else a = throttle * Math.min(CAR_ACCEL_MAX, CAR_POWER / Math.max(v, 1));
  } else if (throttle < 0) {
    if (v > 0.3) a = CAR_BRAKE * throttle;
    else if (v > -CAR_REV_MAX) a = CAR_REV_ACCEL * throttle;
  }
  let resist = CAR_ROLL + CAR_DRAG * v * v + (throttle === 0 ? CAR_ENGINE_BRK : 0);
  if (handbrake) resist += CAR_HANDBRAKE;
  const slope = -CAR_G * Math.sin(car.pitch);

  let nv = v + (a + slope) * dt;
  // resistance opposes motion but never reverses it, so a stopped car stays stopped on gentle slopes
  const r = resist * dt;
  if (nv > 0) nv = Math.max(0, nv - r);
  else if (nv < 0) nv = Math.min(0, nv + r);
  if (nv < -CAR_REV_MAX) nv = -CAR_REV_MAX;
  car.speed = nv;

  // yaw from the bicycle model, capped where the tyres would slide
  let yawRate = car.speed * Math.tan(car.steer) / CAR_WHEELBASE;
  const s = Math.abs(car.speed);
  if (s > 0.5) {
    const cap = CAR_GRIP / s;
    yawRate = Math.max(-cap, Math.min(cap, yawRate));
  }
  car.yaw += yawRate * dt;

  const dist = car.speed * dt;
  const n = Math.max(1, Math.ceil(Math.abs(dist) / CAR_SUBSTEP));
  for (let k = 0; k < n; k++) {
    const fx = -Math.sin(car.yaw), fz = -Math.cos(car.yaw);
    const hit = moveCar(fx * dist / n, fz * dist / n);
    if (hit) {
      const len = Math.hypot(hit.x, hit.z);
      if (len > 1e-6) {
        const nx = hit.x / len, nz = hit.z / len;
        const dot = fx * nx + fz * nz;
        if (car.speed * dot < 0) car.speed *= 1 - dot * dot;
        // a glancing hit turns the body along the wall instead of pinning it
        if (Math.abs(dot) < CAR_GLANCE) {
          let tx = -nz, tz = nx;
          if (tx * fx + tz * fz < 0) { tx = -tx; tz = -tz; }
          let dy = Math.atan2(-tx, -tz) - car.yaw;
          dy = Math.atan2(Math.sin(dy), Math.cos(dy));
          car.yaw += dy * CAR_ALIGN;
        }
      }
    }
  }

  car.spin += (car.speed * dt) / CAR_WHEEL_R;
  if (ecosystem.ready) { car.x = ecosystem.fitX(car.x); car.z = ecosystem.fitZ(car.z); }
  settleCar();
  syncCarMesh();
}

export function carNear() {
  if (!car.placed || flying) return false;
  const d = Math.hypot(player.pos.x - car.x, player.pos.z - car.z);
  const feet = player.pos.y - EYE_HEIGHT;
  return d < CAR_REACH && feet > car.y - 1 && feet < car.y + CAR_TOP;
}

export function pushPlayerFromCar() {
  if (!car.placed) return false;
  const feet = player.pos.y - EYE_HEIGHT;
  if (feet >= car.y + CAR_TOP - LAND_EPS || player.pos.y + HEAD_CLEAR <= car.y) return false;
  let pushed = false;
  const fx = -Math.sin(car.yaw), fz = -Math.cos(car.yaw), min = CAR_R + PLAYER_RADIUS;
  for (const o of CAR_CIRCLES) {
    const cx = car.x + fx * o, cz = car.z + fz * o;
    let dx = player.pos.x - cx, dz = player.pos.z - cz;
    const d = Math.hypot(dx, dz);
    if (d < min) {
      if (d < 1e-6) { dx = -fz; dz = fx; } else { dx /= d; dz /= d; }
      player.pos.x = cx + dx * min;
      player.pos.z = cz + dz * min;
      pushed = true;
    }
  }
  return pushed;
}

// Touch pedals, held like the fly buttons; brake reverses once stopped, like S.
export const gasEl = document.getElementById('gas');
export const brakeEl = document.getElementById('brake');
export const sprintEl = document.getElementById('sprint');
export const jumpEl = document.getElementById('jump');
export const attackEl = document.getElementById('attack');
export const pedal = { gas: false, brake: false, sprint: false, jump: false, attack: false };
export const touchUi = () => matchMedia('(pointer: coarse)').matches || lastPointerType === 'touch';

export function holdPedal(btn, name) {
  btn.addEventListener('pointerdown', e => {
    btn.setPointerCapture(e.pointerId);
    pedal[name] = true;
    btn.classList.add('held');
    wake();
  });
  const release = () => {
    pedal[name] = false;
    btn.classList.remove('held');
    wake();
  };
  btn.addEventListener('pointerup', release);
  btn.addEventListener('pointercancel', release);
  btn.addEventListener('lostpointercapture', release);
}
// BIND CAR: pedals, jump and attack taps, the car and action buttons, E; main calls it in the original listener order.
export function bindCar() {
  holdPedal(gasEl, 'gas');
  holdPedal(brakeEl, 'brake');
  holdPedal(sprintEl, 'sprint');
  holdPedal(jumpEl, 'jump');
  holdPedal(attackEl, 'attack');
  // a tap shorter than a frame still jumps (or punches); holding attack keeps punching (playerStep)
  jumpEl.addEventListener('pointerdown', () => { jumpQueued = true; });
  attackEl.addEventListener('pointerdown', () => { attackQueued = true; });
  carEl.addEventListener('click', () => { toggleCar(); carEl.blur(); });
  // The action button acts on its own pointer, like the pedals: a press acts at once, a hold (Drink) lasts until release.
  useEl.addEventListener('pointerdown', e => {
    useEl.setPointerCapture(e.pointerId);   // before the action, which may hide the button (a full inventory)
    game.pressField();
    updateCarButton();
  });
  for (const ev of ['pointerup', 'pointercancel', 'lostpointercapture']) useEl.addEventListener(ev, () => game.releaseField());
  // E is the slot's key: the car when the car button shows, else the action button's action (held while E is down)
  addEventListener('keydown', e => {
    if (e.code !== 'KeyE' || e.repeat || !play.active) return;
    if (carBtnState !== '') toggleCar();
    else { game.pressField(); updateCarButton(); }
  });
  addEventListener('keyup', e => { if (e.code === 'KeyE') game.releaseField(); });
  addEventListener('blur', () => game.releaseField());
}
export let attackQueued = false;

// Touch sprint, jump and attack, shown on foot (sprint in the gas pedal's slot), hidden while flying.
export let footTouch = false, sprintShown = false;
export function updateSprintButton() {
  const foot = play.active && !player.inCar && touchUi();
  if (foot !== footTouch) {
    footTouch = foot;
    document.body.classList.toggle('foot-touch', foot);
  }
  const show = foot && !flying;
  if (show === sprintShown) return;
  sprintShown = show;
  for (const el of [sprintEl, jumpEl, attackEl]) {
    el.classList.toggle('on', show);
    if (!show) el.classList.remove('held');
  }
  if (!show) pedal.sprint = pedal.jump = pedal.attack = attackQueued = false;
}

// Fly button: Observer mode on foot, unless the car is in reach; then the car button takes its slot.
// (carNear() is false while flying, so a flyer always keeps the button to land with.)
export let flyShown = false;
export function updateFlyButton(carState) {
  const show = play.active && !game.on && carState === '';
  if (show === flyShown) return;
  flyShown = show;
  flyEl.classList.toggle('on', show);
}

// Action button: Survivor mode on foot, the field action in reach (game.fieldAction), unless the car button has the slot.
export let useShown = '';
export function updateUseButton(carState) {
  const a = carState === '' ? game.fieldAction() : null;
  const id = a ? a.id : '';
  if (id === useShown) return;
  useShown = id;
  useEl.classList.toggle('on', id !== '');
  useEl.textContent = id ? SURVIVOR_FIELD_ACTIONS[id].label : '';
}

export let carBtnState = '';
export function updateCarButton() {
  updateSprintButton();
  const state = !play.active ? '' : player.inCar ? 'exit' : carNear() ? 'enter' : '';
  updateFlyButton(state);
  updateUseButton(state);
  if (state === carBtnState) return;
  carBtnState = state;
  carEl.classList.toggle('on', state !== '');
  carEl.textContent = state === 'exit' ? 'Exit' : 'Drive';
  const pedals = state === 'exit' && touchUi();
  for (const el of [gasEl, brakeEl]) {
    el.classList.toggle('on', pedals);
    if (!pedals) el.classList.remove('held');
  }
  if (!pedals) pedal.gas = pedal.brake = false;
}

// The player in or out of the car: no body shadow while in it (the body is hidden there too).
export function setPlayerInCar(on) {
  player.inCar = on;
  if (pov.body) pov.body.castShadow = !on;
  graphics.force = true;
}

export function enterCar() {
  if (player.inCar || !carNear()) return;
  setPlayerInCar(true);
  stance.stand(); crouchY = 0;
  chaseCam.reset(car.yaw);
  player.vel.set(0, 0, 0);
  jumpQueued = false;
  touchMove.z = 0;
  cat.board();
  updateCarButton();
  wake();
}

export function exitCar() {
  if (!player.inCar) return;
  const fx = -Math.sin(car.yaw), fz = -Math.cos(car.yaw);
  const rx = Math.cos(car.yaw), rz = -Math.sin(car.yaw);
  for (const [l0, f0] of [[-1.6, 0], [1.6, 0], [0, 2.9], [0, -2.9]]) {
    const l = l0 * CAR_SCALE, f = f0 * CAR_SCALE;
    const px = car.x + rx * l + fx * f, pz = car.z + rz * l + fz * f, g = groundAt(px, pz);
    if (shellAt(px, pz) >= 0) continue;
    if (solidOverlap(px, pz, PLAYER_RADIUS + 0.05, g, g + EYE_HEIGHT + HEAD_CLEAR)) continue;
    setPlayerInCar(false);
    player.pos.set(px, g + EYE_HEIGHT, pz);
    player.vel.set(0, 0, 0);
    player.grounded = false;
    facePlayer(car.yaw, 0);
    cat.alight();
    updateCarButton();
    wake();
    return;
  }
}

export function toggleCar() {
  if (player.inCar) exitCar(); else enterCar();
}

export function driveStep(dt) {
  jumpQueued = false;

  let throttle = 0, steer = 0;
  if (play.active) {
    if (keys.has('KeyW') || keys.has('ArrowUp')) throttle += 1;
    if (keys.has('KeyS') || keys.has('ArrowDown')) throttle -= 1;
    if (keys.has('KeyA') || keys.has('ArrowLeft')) steer += 1;
    if (keys.has('KeyD') || keys.has('ArrowRight')) steer -= 1;
    if (stickId !== null) steer -= touchMove.x;
    if (pedal.brake) throttle -= 1;
    else if (pedal.gas) throttle += 1;
  }
  throttle = Math.max(-1, Math.min(1, throttle));
  steer = Math.max(-1, Math.min(1, steer));
  carPhysics(dt, throttle, steer, play.active && keys.has('Space'));

  chaseCam.step(dt, car.yaw, Math.abs(car.speed) > 1, CAM_PITCH, -1.1, 0.5);
  const yaw = player.yaw, pitch = player.pitch;

  // boom from the pivot back along the view, shortened before any wall or building
  const px = car.x, py = car.y + CAM_PIVOT, pz = car.z;
  const bx = Math.sin(yaw) * Math.cos(pitch), by = -Math.sin(pitch), bz = Math.cos(yaw) * Math.cos(pitch);
  let boom = CAM_DIST;
  for (let d = 0.6; d <= CAM_DIST; d += 0.4) {
    const x = px + bx * d, y = py + by * d, z = pz + bz * d;
    const s = shellAt(x, z);
    if ((s >= 0 && y < collision.shells[s].top + 0.3) || solidOverlap(x, z, 0.3, y - 0.3, y + 0.3)) {
      boom = Math.max(1.0, d - 0.5);
      break;
    }
  }
  const cx = px + bx * boom, cz = pz + bz * boom;
  const cy = Math.max(py + by * boom, groundAt(cx, cz) + 0.4);

  player.pos.set(cx, cy, cz);
  camera.position.copy(player.pos);
  camera.rotation.set(pitch, yaw, 0, 'YXZ');
}

// The Observer presets the settings chips pick ('Game': the game's own clock and weather).
export const skyChoice = {
  time: 'Game',
  sky: 'Game'
};

// Survivor mode ignores the presets (their pickers are hidden there)
export function timeMode() { return game.on ? 'Game' : skyChoice.time; }
// the hour the sky is drawn for: an Observer preset first, else the game's own clock
export function skyHour(mode) { return mode !== 'Game' ? presetHour(mode) : simSky.hour; }

// the instant the sky is drawn for: today at the sky hour
export function skyInstant() {
  const mode = timeMode();
  const d = cityNow();
  const now = d.getUTCHours() + d.getUTCMinutes() / 60 + d.getUTCSeconds() / 3600;
  return new Date(Date.now() + (skyHour(mode) - now) * 3600000);
}

export function conditions() {
  // an Observer preset first, then the game's own weather
  const preset = game.on ? null : SKIES[skyChoice.sky];
  if (preset) return preset;
  return simSky.on ? simSky.conditions() : null;
}

export const fwd = new THREE.Vector3();
export const right = new THREE.Vector3();
export let swimming = false;

export function playerStep(dt) {
  petting.update(dt);
  if (player.inCar) { player.running = false; swimming = false; if (pov.body) pov.body.visible = false; driveStep(dt); updateCarButton(); vr.placeRig(); return; }
  // an empty car still rolling (left at speed) brakes to a stop
  if (car.speed !== 0) carPhysics(dt, 0, 0, true);

  let mx = 0, mz = 0;
  if (keys.has('KeyW') || keys.has('ArrowUp')) mz += 1;
  if (keys.has('KeyS') || keys.has('ArrowDown')) mz -= 1;
  if (keys.has('KeyD') || keys.has('ArrowRight')) mx += 1;
  if (keys.has('KeyA') || keys.has('ArrowLeft')) mx -= 1;
  if (stickId !== null) { mx += touchMove.x; mz += touchMove.z; }
  if (renderer.xr.isPresenting) { mx += vr.moveX; mz -= vr.moveY; }

  // moves are relative to the view; the body turns to face them (below)
  fwd.set(-Math.sin(player.yaw), 0, -Math.cos(player.yaw));
  right.set(Math.cos(player.yaw), 0, -Math.sin(player.yaw));

  // deep water under the eye: swim
  if (providers.active) providers.active.surface(player.pos.x, player.pos.z, _surf);
  else { _surf.base = 0; _surf.dip = 0; }
  const waterTop = _surf.base, waterDip = _surf.dip;
  swimming = !!providers.active && !flying && -waterDip > SWIM_DEPTH && player.pos.y - EYE_HEIGHT < waterTop;

  const shiftHeld = keys.has('ShiftLeft') || keys.has('ShiftRight');
  // while flying, shift means down rather than run
  const sprint = stance.sprinting(play.active && !flying && !swimming && game.canRun() && (shiftHeld || pedal.sprint));
  const speed = swimming ? WALK_SPEED * SWIM_SPEED :
    flying ? FLY_SPEED :
      stance.low ? CROUCH_SPEED :
        sprint ? RUN_SPEED : WALK_SPEED;
  const len = Math.hypot(mx, mz);
  player.running = speed === RUN_SPEED && len > 0 && play.active;
  let dx = 0, dz = 0, dy = 0;
  if (len > 0 && play.active) {
    const scale = Math.min(len, 1) / len;
    mx *= scale; mz *= scale;
    dx = (fwd.x * mz + right.x * mx) * speed * dt;
    dz = (fwd.z * mz + right.z * mx) * speed * dt;
    if (swimming) {
      const cp = Math.cos(player.pitch);
      dx = (fwd.x * mz * cp + right.x * mx) * speed * dt;
      dz = (fwd.z * mz * cp + right.z * mx) * speed * dt;
      dy = Math.sin(player.pitch) * mz * speed * dt;
    }
  }

  // 3rd person, GTA-style: the body turns toward the move, and the view drifts back behind it.
  // 1st person and VR: the eyes are the view, so the body faces it.
  if (pov.mode !== '3rd' || renderer.xr.isPresenting) player.heading = player.yaw;
  else {
    if (dx !== 0 || dz !== 0) {
      let dh = Math.atan2(-dx, -dz) - player.heading;
      dh = Math.atan2(Math.sin(dh), Math.cos(dh));
      const maxTurn = FOOT_TURN_RATE * dt;
      player.heading += Math.max(-maxTurn, Math.min(maxTurn, dh));
    }
    chaseCam.drift(dt, player.heading, len > 0 && play.active && !swimming, FOOT_CAM_FOLLOW);
  }

  // the attack button: a tap punches once, a hold keeps punching (game.punch paces the hits)
  if (play.active && !flying && (attackQueued || pedal.attack)) game.punch();
  attackQueued = false;

  if (flying) {
    // no collision while flying; it resumes on landing
    jumpQueued = false;
    player.pos.x += dx;
    player.pos.z += dz;
    player.vel.y = 0;
    player.grounded = false;
    const keyClimb = play.active ? (keys.has('Space') ? 1 : 0) - (shiftHeld ? 1 : 0) : 0;
    const vy = Math.max(-1, Math.min(1, climb + keyClimb));
    player.pos.y += vy * speed * dt;
    player.pos.y = Math.max(player.pos.y, groundAt(player.pos.x, player.pos.z) + EYE_HEIGHT);
  } else if (swimming) {
    // walls still stop a swimmer; drag, the float cap and the bed bound the vertical
    moveAndCollide(player.pos, dx, dz, STEP_UP);
    player.vel.y *= Math.max(0, 1 - SWIM_DRAG * dt);
    if (play.active && (keys.has('Space') || jumpQueued || pedal.jump)) player.vel.y = JUMP_SPEED * SWIM_JUMP;
    jumpQueued = false;
    player.pos.y += player.vel.y * dt + dy;
    const cap = waterTop + SWIM_FLOAT;
    if (player.pos.y > cap) { player.pos.y = cap; if (player.vel.y > 0) player.vel.y = 0; }
    const bed = waterTop + waterDip + EYE_HEIGHT;
    if (player.pos.y < bed) { player.pos.y = bed; player.vel.y = 0; }
    player.grounded = false;
  } else {
    // horizontal first, so the roof lookup runs from a wall-clear position
    const wasGrounded = player.grounded;
    moveAndCollide(player.pos, dx, dz, wasGrounded ? STEP_UP : 0);
    if (pushPlayerFromCar()) moveAndCollide(player.pos, 0, 0, wasGrounded ? STEP_UP : 0);

    if (player.grounded && play.active && (keys.has('Space') || jumpQueued || pedal.jump)) {
      player.vel.y = JUMP_SPEED;
      player.grounded = false;
    }
    jumpQueued = false;
    player.vel.y -= GRAVITY * dt;

    const fromFeet = player.pos.y - EYE_HEIGHT;
    player.pos.y += player.vel.y * dt;
    if (player.vel.y > 0) {
      // indoors, a jump stops at the ceiling instead of reaching the roof
      const c = ceilingAt(player.pos.x, player.pos.z,
        fromFeet + EYE_HEIGHT + HEAD_CLEAR, player.pos.y + HEAD_CLEAR);
      if (c < Infinity) { player.pos.y = c - HEAD_CLEAR; player.vel.y = 0; }
    }
    const toFeet = player.pos.y - EYE_HEIGHT;

    // re-decided each frame, so walking off a roof edge falls with no mid-air jump
    player.grounded = false;
    if (player.vel.y <= 0) {
      const walk = wasGrounded;
      const reach = walk ? GROUND_SNAP : 0;
      const floorY = supportAt(player.pos.x, player.pos.z, fromFeet, toFeet - reach, walk ? STEP_UP : 0);
      if (toFeet - reach <= floorY) {
        if (!wasGrounded) game.land(-player.vel.y);
        player.pos.y = floorY + EYE_HEIGHT;
        player.vel.y = 0;
        player.grounded = true;
      }
    }
  }
  // every world stops the player at its edge (out in the sea)
  if (ecosystem.ready) { player.pos.x = ecosystem.fitX(player.pos.x); player.pos.z = ecosystem.fitZ(player.pos.z); }

  stance.tick(dt);
  const crouchTo = stance.low && !flying ? CROUCH_DROP : 0;
  crouchY = crouchY < crouchTo ? Math.min(crouchTo, crouchY + CROUCH_RATE * dt)
    : Math.max(crouchTo, crouchY - CROUCH_RATE * dt);
  camera.position.copy(player.pos);
  camera.position.y -= crouchY;
  camera.rotation.set(player.pitch, player.yaw, 0, 'YXZ');
  pov.apply(dt);
  vr.placeRig();
  updateCarButton();
}

export function movementHeld() {
  return stickId !== null || climb !== 0 || jumpQueued || attackQueued || pedal.gas || pedal.brake || pedal.jump || pedal.attack ||
    keys.has('KeyW') || keys.has('KeyA') || keys.has('KeyS') || keys.has('KeyD') ||
    keys.has('ArrowUp') || keys.has('ArrowDown') || keys.has('ArrowLeft') || keys.has('ArrowRight') ||
    keys.has('Space') ||
    (flying && (keys.has('ShiftLeft') || keys.has('ShiftRight')));
}
// Survivor mode (settings sheet): drawn frames per second averaged since the quality setting last changed.
// Time with the loop asleep or paused is left out.
export const avgFps = {
  frames: 0, ms: 0,
  reset() { this.frames = 0; this.ms = 0; this.show(); },
  show() {
    perf.setText(avgFpsEl, this.ms < 1000 ? 'Average fps: measuring' :
      `Average ${Math.round(this.frames * 1000 / this.ms)} fps`);
  }
};

// City wall clock (pre-shifted epoch, use getUTC*); offset from the site's longitude, this device's with City off, else UTC.
export function zoneOffset() {
  return (simSky.site && simSky.site.offset) || 0;
}

export function cityNow() {
  return new Date(Date.now() + zoneOffset() * 1000);
}

export function clockText(date) {
  const d = new Date(date.getTime() + zoneOffset() * 1000);
  const h = d.getUTCHours();
  return `${(h + 11) % 12 + 1}:${String(d.getUTCMinutes()).padStart(2, '0')}` +
    ` ${h < 12 ? 'AM' : 'PM'}`;
}

export const skyCol = new THREE.Color();
export const sunCol = new THREE.Color();
export const scratch = new THREE.Color();
export const OVERCAST = new THREE.Color(0x8b8f96);
export const FOGGY = new THREE.Color(0xb9bcc0);

export function skyDisc(canvas) {
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  const size = 2 * SKY_DIST * Math.tan(SKY_BODY_DEG * Math.PI / 360);
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(size, size), new THREE.MeshBasicMaterial({
    map: tex, transparent: true, depthWrite: false, fog: false, toneMapped: false
  }));
  mesh.visible = false;
  mesh.frustumCulled = false;
  scene.add(mesh);
  return mesh;
}

export const sunCanvas = document.createElement('canvas');
sunCanvas.width = sunCanvas.height = SKY_TEX;
{
  const g = sunCanvas.getContext('2d'), c = SKY_TEX / 2;
  const grad = g.createRadialGradient(c, c, 0, c, c, c);
  grad.addColorStop(0.00, 'rgba(255,255,255,1)');
  grad.addColorStop(0.30, 'rgba(255,255,255,1)');
  grad.addColorStop(0.36, 'rgba(255,255,255,0.45)');
  grad.addColorStop(1.00, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, SKY_TEX, SKY_TEX);
}
export const sunDisc = skyDisc(sunCanvas);

export const moonCanvas = document.createElement('canvas');
moonCanvas.width = moonCanvas.height = SKY_TEX;
export const moonDisc = skyDisc(moonCanvas);
export let moonShape = NaN;

// Lit region, bright limb on +x; e = cos(sun-moon angle); terminator x = e * sqrt(r^2 - y^2).
export function drawMoon(e) {
  const g = moonCanvas.getContext('2d'), c = SKY_TEX / 2, r = c - 2;
  g.clearRect(0, 0, SKY_TEX, SKY_TEX);
  g.beginPath();
  g.arc(c, c, r, -Math.PI / 2, Math.PI / 2, false);
  const n = 48;
  for (let i = 0; i <= n; i++) {
    const y = r - (2 * r * i) / n;
    g.lineTo(c + e * Math.sqrt(Math.max(r * r - y * y, 0)), c + y);
  }
  g.closePath();
  g.fillStyle = '#e6e9ee';
  g.fill();
  moonDisc.material.map.needsUpdate = true;
  moonShape = e;
}

export const sunDir = new THREE.Vector3();
export const moonDir = new THREE.Vector3();
export const _mx = new THREE.Vector3(), _my = new THREE.Vector3(), _mz = new THREE.Vector3();
export const _mBasis = new THREE.Matrix4();

export function updateSkyBodies(day, cloud) {
  const e = sunDir.dot(moonDir);
  if (!(Math.abs(e - moonShape) < 0.01)) drawMoon(e);

  const clear = 1 - 0.85 * cloud;
  sunDisc.material.color.copy(sunCol);
  sunDisc.material.opacity = clear;
  moonDisc.material.opacity = clear * (1 - 0.55 * day);
  sunDisc.visible = moonDisc.visible = true;

  _mz.copy(moonDir).negate();
  _mx.copy(sunDir).addScaledVector(moonDir, -e);
  if (_mx.lengthSq() < 1e-8) _mx.set(1, 0, 0).addScaledVector(moonDir, -moonDir.x);
  _mx.normalize();
  _my.crossVectors(_mz, _mx);
  moonDisc.quaternion.setFromRotationMatrix(_mBasis.makeBasis(_mx, _my, _mz));
}

export function placeSkyBodies() {
  if (!sunDisc.visible) return;
  // inside the far plane: a nearer camera.far (Graphics: low) brings the discs in, scaled to keep their angular size
  const dist = Math.min(SKY_DIST, camera.far * SKY_FAR_FRACTION), k = dist / SKY_DIST;
  sunDisc.scale.setScalar(k);
  moonDisc.scale.setScalar(k);
  sunDisc.position.copy(camera.position).addScaledVector(sunDir, dist);
  sunDisc.lookAt(camera.position);
  moonDisc.position.copy(camera.position).addScaledVector(moonDir, dist);
}

export function sampleSky(alt) {
  let i = 0;
  while (i < SKY.length - 2 && alt > SKY[i + 1][0]) i++;
  const a = SKY[i], b = SKY[i + 1];
  const t = Math.min(Math.max((alt - a[0]) / (b[0] - a[0]), 0), 1);
  skyCol.setHex(a[1]).lerp(scratch.setHex(b[1]), t);
  sunCol.setHex(a[2]).lerp(scratch.setHex(b[2]), t);
  return a[3] + (b[3] - a[3]) * t;
}

export const skyFade = {
  cloud: 0, fog: 0,                  // what the sky is drawn with now
  c0: 0, f0: 0, c1: 0, f1: 0,        // the running fade's start and end values
  t0: 0, fading: false, set: false, drawn: 0,

  reset() { this.set = false; this.fading = false; },

  aim(cloud, fog) {
    const now = performance.now();
    if (!this.set) {
      this.set = true;
      this.cloud = this.c1 = cloud; this.fog = this.f1 = fog;
      return;
    }
    if (cloud !== this.c1 || fog !== this.f1) {
      this.c0 = this.cloud; this.f0 = this.fog;
      this.c1 = cloud; this.f1 = fog;
      this.t0 = now; this.fading = true;
    }
    if (!this.fading) return;
    const t = Math.min((now - this.t0) / (SKY_FADE_S * 1000), 1);
    this.cloud = this.c0 + (this.c1 - this.c0) * t;
    this.fog = this.f0 + (this.f1 - this.f0) * t;
    if (t === 1) this.fading = false;
  },

  // each frame: redraw the sky about 15 times a second while fading
  tick(now) {
    if (!this.fading || now - this.drawn < 66) return;
    this.drawn = now;
    updateSky();
  }
};

export function updateSky() {
  if (!simSky.site) return;

  const inst = skyInstant();
  const s = solarVector(simSky.site.lat, simSky.site.lon, inst);
  simSky.sunAltDeg = s.altDeg;
  let power = sampleSky(s.altDeg);

  // cloud and fog fade out through twilight, so night is not greyed
  const day = Math.min(Math.max((s.altDeg + 6) / 12, 0), 1);
  const c = conditions();
  // cloud cover and fog ease to a new weather's values over SKY_FADE_S
  skyFade.aim(c ? c.cloud / 100 : 0, c && c.kind === 'fog' ? 1 : 0);
  const cloud = skyFade.cloud, fog = skyFade.fog;

  skyCol.lerp(OVERCAST, cloud * 0.65 * day);
  skyCol.lerp(FOGGY, 0.6 * day * fog);
  power *= 1 - 0.7 * cloud - 0.2 * fog;

  // Below the horizon the light is off; it keeps this direction and graphics aims it at the player's shadow box.
  graphics.sunDir.set(s.east, s.up, -s.north).normalize();
  graphics.placeSun();
  graphics.sunTurned();
  sun.color.copy(sunCol);
  sun.intensity = power;
  // not dimmed by cloud: kept for facade readability rather than realism
  moon.intensity = MOON_MAX * (1 - day);
  // street lamps: on through dusk and under heavy cloud, off in daylight
  streets.setGlow(Math.min(Math.max(((1 - day) + 0.35 * cloud - 0.3) / 0.45, 0), 1));
  hemi.intensity = HEMI_NIGHT + (HEMI_DAY - HEMI_NIGHT) * day;

  // FACADE: windows come on through dusk, thin out after 22:00, return toward dawn.
  const hour = skyHour(timeMode());
  const late = hour >= 22 ? 1 - 0.3 * (hour - 22) : hour < 5 ? 0.25 : hour < 7 ? 0.25 + 0.3 * (hour - 5) : 1;
  // by day a quarter of the evening's lights stay on
  const dark = Math.max(1 - day, 0.25);
  facadeLit.value.set(dark * 0.1375 * late, dark * (hour >= 22 || hour < 6 ? 0.3 : 0.9));

  const m = moonVector(simSky.site.lat, simSky.site.lon, inst);
  sunDir.set(s.east, s.up, -s.north).normalize();
  moonDir.set(m.east, m.up, -m.north).normalize();
  const tm = Math.min(Math.max(m.altDeg / MOON_BLEND_DEG, 0), 1);
  moon.position.copy(MOON_FALLBACK).lerp(moonDir, tm).normalize().multiplyScalar(100);
  updateSkyBodies(day, cloud);

  scene.background.copy(skyCol);
  scene.fog.color.copy(skyCol);
  syncRain(day);
  invalidate();
}

// RAIN: one LineSegments draw, positions in the vertex shader; a roof height map cuts streaks under roofs.

export const RAIN_MAX = matchMedia('(pointer: coarse)').matches ? 4000 : 10000;

export let rain = null;
export let rainTime = 0;
// When rain was last drawn (frame stamps it; rainAnimating paces the idle redraw from it).
export const rainClock = {
  drawn: 0
};

// 0 when dry, else 0..1. A measured rate beats the code; ~0.3 in/h is heavy.
export function rainState() {
  const c = conditions();
  if (!c || (c.kind !== 'rain' && c.kind !== 'storm')) return null;
  const code = c.code ?? (c.kind === 'storm' ? 95 : 63);
  let i = RAIN_BY_CODE[code] ?? 0.6;
  if (c.precip > 0) i = Math.min(Math.max(c.precip / 0.3, 0.12), 1);
  const drizzle = code >= 51 && code <= 57;
  return { intensity: i, drizzle, storm: c.kind === 'storm' };
}

export function makeRain() {
  const n = RAIN_MAX;
  const seed = new Float32Array(n * 2 * 4);    // x, y phase, z, speed factor
  const tip = new Float32Array(n * 2);         // 0 = head of the drop, 1 = tail
  for (let i = 0; i < n; i++) {
    const sx = Math.random(), sy = Math.random(), sz = Math.random();
    const sp = 0.8 + Math.random() * 0.4;
    for (let k = 0; k < 2; k++) {
      const o = (i * 2 + k) * 4;
      seed[o] = sx; seed[o + 1] = sy; seed[o + 2] = sz; seed[o + 3] = sp;
      tip[i * 2 + k] = k;
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 2 * 3), 3));
  g.setAttribute('seed', new THREE.BufferAttribute(seed, 4));
  g.setAttribute('tip', new THREE.BufferAttribute(tip, 1));
  // the box follows the camera, so skip frustum culling
  g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), Infinity);

  const roofData = new Float32Array(ROOF_MAP_N * ROOF_MAP_N).fill(-1e4);
  const roof = new THREE.DataTexture(roofData, ROOF_MAP_N, ROOF_MAP_N, THREE.RedFormat, THREE.FloatType);
  roof.minFilter = roof.magFilter = THREE.NearestFilter;
  roof.needsUpdate = true;

  const uniforms = {
    uRoof: { value: roof },
    uRoofArea: { value: new THREE.Vector3(0, 0, ROOF_MAP_SIZE) },
    uTime: { value: 0 },
    uCenter: { value: new THREE.Vector3() },
    uBox: { value: new THREE.Vector3(RAIN_SPAN, RAIN_HEIGHT, RAIN_SPAN) },
    uVel: { value: new THREE.Vector3(0, -8, 0) },
    uLen: { value: 0.09 },
    uColor: { value: new THREE.Color(0xc4ccd6) },
    uAlpha: { value: 0.5 }
  };

  const m = new THREE.ShaderMaterial({
    uniforms,
    transparent: true,
    depthWrite: false,
    vertexShader: `
      attribute vec4 seed;
      attribute float tip;
      uniform float uTime, uLen;
      uniform vec3 uCenter, uBox, uVel;
      varying float vA;
      varying vec3 vP;
      void main() {
        vec3 v = uVel * vec3(1.0, seed.w, 1.0);
        vec3 corner = uCenter - uBox * vec3(0.5, 0.4, 0.5);
        vec3 p = vec3(seed.x, seed.y, seed.z) * uBox + v * uTime;
        p = mod(p - corner, uBox) + corner;
        // fade at the box edges so wrapping never pops
        vec2 d = abs(p.xz - uCenter.xz) / (uBox.xz * 0.5);
        float yEdge = (p.y - corner.y) / uBox.y;
        vA = (1.0 - smoothstep(0.6, 1.0, max(d.x, d.y)))
           * smoothstep(0.0, 0.08, yEdge) * (1.0 - smoothstep(0.85, 1.0, yEdge))
           * mix(1.0, 0.0, tip) * (0.6 + 0.4 * seed.w);
        p -= v * uLen * (0.7 + 0.6 * fract(seed.x * 57.3)) * tip;
        vP = p;
        gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
      }`,
    fragmentShader: `
      uniform vec3 uColor;
      uniform float uAlpha;
      uniform sampler2D uRoof;
      uniform vec3 uRoofArea;
      varying float vA;
      varying vec3 vP;
      void main() {
        vec2 uv = (vP.xz - uRoofArea.xy) / uRoofArea.z;
        if (uv.x >= 0.0 && uv.y >= 0.0 && uv.x < 1.0 && uv.y < 1.0 &&
            vP.y < texture2D(uRoof, uv).r) discard;
        gl_FragColor = vec4(uColor, uAlpha * vA);
        #include <colorspace_fragment>
      }`
  });

  const mesh = new THREE.LineSegments(g, m);
  mesh.frustumCulled = false;
  mesh.renderOrder = 10;
  scene.add(mesh);
  return { mesh, uniforms, roof, roofData, roofShells: null, roofShelters: null, roofCx: NaN, roofCz: NaN, mark: null,
    fade: 0, target: 1, alpha: 0, fadeAt: 0 };   // fade: 0..1 toward target over RAIN_FADE_S; alpha: the full-strength opacity
}

export function disposeRain() {
  if (!rain) return;
  scene.remove(rain.mesh);
  rain.mesh.geometry.dispose();
  rain.mesh.material.dispose();
  rain.roof.dispose();
  rain = null;
  invalidate();
}

// Start, retune or stop rain from current conditions.
export function syncRain(daylight) {
  const st = rainState();
  // stopping: rainTick fades it out, then disposes it
  if (!st) { if (rain) rain.target = 0; return; }
  if (!rain) rain = makeRain();
  rain.target = 1;

  const u = rain.uniforms;
  const i = st.intensity;
  const count = Math.round(RAIN_MAX * (0.15 + 0.85 * i));
  rain.mesh.geometry.setDrawRange(0, count * 2);

  // drizzle falls slowly in short strokes; real rain is 6-9 m/s
  const fall = st.drizzle ? 3 + 1.5 * i : 6.5 + 2.5 * i;
  u.uVel.value.set(0, -fall, 0);
  u.uLen.value = st.drizzle ? 0.05 : 0.08 + 0.03 * i;
  rain.alpha = (st.drizzle ? 0.3 : 0.42 + 0.2 * i) * (0.35 + 0.65 * daylight);
  u.uAlpha.value = rain.alpha * rain.fade;
  invalidate();
}

// Roof height of a shell over (x, z): the eaves if flat, else the roofOf surface.
export function roofHeightAt(s, x, z) {
  if (!s.roofShape) return s.top;
  const o = s.obb;
  const dx = x - o.cx, dz = z - o.cz;
  const u = Math.abs(dx * o.ux + dz * o.uz), v = dx * o.vx + dz * o.vz;
  const av = Math.abs(v);
  let f;
  if (s.roofShape === 'skillion') f = (v + o.hv) / (2 * o.hv);
  else if (s.roofShape === 'pyramidal') f = Math.min(1 - u / o.hu, 1 - av / o.hv);
  else {
    f = 1 - av / o.hv;
    if (s.roofShape === 'hipped') {
      const inset = Math.min(o.hv, o.hu * 0.9);
      f = Math.min(f, (o.hu - u) / inset);
    }
  }
  f = f < 0 ? 0 : f > 1 ? 1 : f;
  return s.top + (s.roofTop - s.top) * f;
}

// Fill the shelter map around (cx, cz), testing texels inside each shell's bounds.
export function rasterRoofs(cx, cz) {
  const N = ROOF_MAP_N, cell = ROOF_MAP_SIZE / N;
  const x0 = cx - ROOF_MAP_SIZE / 2, z0 = cz - ROOF_MAP_SIZE / 2;
  const data = rain.roofData;
  data.fill(-1e4);

  if (!rain.mark || rain.mark.length !== collision.shells.length) rain.mark = new Uint8Array(collision.shells.length);
  const mark = rain.mark;
  mark.fill(0);
  const gx0 = Math.floor(x0 / GRID_CELL), gx1 = Math.floor((x0 + ROOF_MAP_SIZE) / GRID_CELL);
  const gz0 = Math.floor(z0 / GRID_CELL), gz1 = Math.floor((z0 + ROOF_MAP_SIZE) / GRID_CELL);
  for (let gx = gx0; gx <= gx1; gx++) {
    for (let gz = gz0; gz <= gz1; gz++) {
      const bucket = collision.shellGrid.get(cellKey(gx, gz));
      if (!bucket) continue;
      for (const idx of bucket) {
        if (mark[idx]) continue;
        mark[idx] = 1;
        const s = collision.shells[idx];
        const i0 = Math.max(0, Math.floor((s.minX - x0) / cell)), i1 = Math.min(N - 1, Math.floor((s.maxX - x0) / cell));
        const j0 = Math.max(0, Math.floor((s.minZ - z0) / cell)), j1 = Math.min(N - 1, Math.floor((s.maxZ - z0) / cell));
        for (let j = j0; j <= j1; j++) {
          const z = z0 + (j + 0.5) * cell;
          for (let i = i0; i <= i1; i++) {
            const x = x0 + (i + 0.5) * cell;
            if (!pointInShell(s, x, z)) continue;
            const h = roofHeightAt(s, x, z);
            const k = j * N + i;
            if (h > data[k]) data[k] = h;
          }
        }
      }
    }
  }

  // cabin roofs (the Arena's rain shelters)
  for (const c of shelters.list) {
    const ddx = c.cx - cx, ddz = c.cz - cz, reach = ROOF_MAP_SIZE * 0.75 + c.reach;
    if (ddx * ddx + ddz * ddz > reach * reach) continue;
    for (let j = 0; j < N; j++) {
      const z = z0 + (j + 0.5) * cell;
      for (let i = 0; i < N; i++) {
        const x = x0 + (i + 0.5) * cell;
        const qx = x - c.cx, qz = z - c.cz;
        const lx = qx * c.cosR - qz * c.sinR;
        if (lx < c.minX || lx > c.maxX) continue;
        const lz = qx * c.sinR + qz * c.cosR;
        if (lz < c.minZ || lz > c.maxZ) continue;
        const k = j * N + i;
        if (c.topY > data[k]) data[k] = c.topY;
      }
    }
  }

  rain.roof.needsUpdate = true;
  rain.uniforms.uRoofArea.value.set(x0, z0, ROOF_MAP_SIZE);
  rain.roofCx = cx; rain.roofCz = cz; rain.roofShells = collision.shells; rain.roofShelters = shelters.list;
}

export function rainTick(dt, now) {
  if (!rain) return false;
  // Rain fades in and out on the frame clock, not the clamped physics step, so a slow frame rate cannot stretch it.
  const since = rain.fadeAt ? Math.min(Math.max(now - rain.fadeAt, 0), 1000) / 1000 : 0;
  rain.fadeAt = now;
  if (rain.fade !== rain.target) {
    const step = since / RAIN_FADE_S;
    rain.fade = rain.target > rain.fade ? Math.min(rain.fade + step, 1) : Math.max(rain.fade - step, 0);
    rain.uniforms.uAlpha.value = rain.alpha * rain.fade;
  }
  if (rain.fade === 0 && rain.target === 0) { disposeRain(); return true; }
  const cx = Math.round(player.pos.x / ROOF_MAP_SNAP) * ROOF_MAP_SNAP;
  const cz = Math.round(player.pos.z / ROOF_MAP_SNAP) * ROOF_MAP_SNAP;
  if (cx !== rain.roofCx || cz !== rain.roofCz || rain.roofShells !== collision.shells || rain.roofShelters !== shelters.list) rasterRoofs(cx, cz);

  rainTime = (rainTime + dt) % RAIN_TIME_WRAP;
  rain.uniforms.uTime.value = rainTime;
  rain.uniforms.uCenter.value.copy(player.pos);
  return now - rainClock.drawn >= 1000 / RAIN_FPS_IDLE;
}

export function rainAnimating() {
  return rain !== null;
}
export function populationText() {
  let people = 0, coyotes = 0, deer = 0;
  for (const a of ecosystem.animals) {
    if (!a.alive) continue;
    if (a.type === 'human') people++; else if (a.type === 'coyote') coyotes++; else deer++;
  }
  const parts = [`${fmt(people)} people`];
  if (coyotes || providers.active) parts.push(`${fmt(coyotes)} coyotes`);
  if (deer) parts.push(`${fmt(deer)} deer`);
  parts.push(`${fmt(ecosystem.plants.length)} plants`, `day ${Math.floor(ecosystem.ticks / (24 * 60))}`);
  return parts.join(', ');
}
