// 8a-render.js: RENDER. What draws the world.
// Owns: the NPC frustum and npcOnScreen, the human rig (geometry, atlas, materials, PS2-era shaders), the billboards,
// AnimalRenderer, PlantRenderer, foodBoxView, BlobShadows, HealthBars with the brain view, StatLabelSystem (labels),
// VisionRaySystem, the sky (bodies, colours, fade, updateSky, the Observer presets in skyChoice), rain, graphics,
// avgFps and populationText.
// Reads the player and the game only through renderInputs, which 8b-player-game fills at load, so this file never
// imports 8b. Construction (meshes, canvases) runs at load.
// May import: 1-config.js to 7b-sim.js and three.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import {
  EYE_HEIGHT, GRID_CELL, LOW_PIXEL_RATIO, HIGH_FOG_FAR, LOW_FOG_FAR, HIGH_CAMERA_FAR, LOW_CAMERA_FAR,
  LOW_NPC_LOD_DIST, LOW_FAR_STAT_DIST, GRAPHICS_KEY, HEMI_DAY, HEMI_NIGHT, FACADE_LIGHTS_DEG, MOON_MAX, SHADOW_AHEAD, MOON_BLEND_DEG,
  NPC_TICK_S, GAIT_MAX_HZ, GAIT_GALLOP_SWING, GAIT_CADENCE_SCALE, NPC_FIGHT_MOVES, NPC_MATURITY_TICKS,
  GROWTH_MIN_SCALE, NPC_RIG_TOP, NPC_UNIT, PLAYER_HS, NPC_TYPES, NPC_TYPE_IDS, NPC_TYPE_COUNT, HUMAN_TYPE_ID,
  HIGH_NPC_LOD_DIST, HIGH_FAR_STAT_DIST, NPC_BODY_R, NPC_STATS_R, NPC_STATS_UP, HUMAN_ATLAS, HUMAN_FACE_TILE,
  HUMAN_BODY_TILE, HUMAN_FACE_VARIANTS, HUMAN_OUTFITS, HUMAN_OUTFIT_TILES, HUMAN_STRIDE_BASE, HUMAN_STRIDE_PER_V,
  HUMAN_STRIDE_MAX, HUMAN_CADENCE_MAX, HUMAN_SWING_MAX, HUMAN_IDLE_SPEED, HUMAN_GAIT_EASE, HUMAN_GAIT_JUMP, HUMAN_RIG,
  HUMAN_LEG, HUMAN_JOINT_BLEND, HUMAN_CROUCH, HUMAN_FIGHT, HUMAN_CROUCH_DROP, HUMAN_ARM_FLARE, HUMAN_PET, PET_BEND_LEVELS, HUMAN_HAIR,
  NPC_BUILD_BASE_MEAN, NPC_WIDTH_LIMITS, NPC_GIRTH_STEPS, NPC_TORSO_REGIONS,
  BB_CELL, BB_DIRS, BB_BAKED_DIRS, BB_PHASES, BB_POSES, BB_BLOCK, BB_FRAME, BB_FACE_VARIANT, BB_HUMAN_SWING,
  BB_STAND_SWING, BB_PHASE_K, BB_MIP_BIAS, PLANT_GRID, FOOD_BOX_SIZE, SHADOW_FOLLOW_STEP, SHADOW_SUN_STEP_COS,
  SHADOW_ANIMAL_HZ, SHADOW_ANIMAL_DIST, SUN_DIST, SHADOWS_ENABLED, BLOB_DIST, BLOB_MAX, BLOB_OPACITY, BLOB_FULL_SUN,
  BLOB_LIFT, BLOB_SPREAD, BAR_STEPS, BAR_RELEASE_TICKS, ARROW_STEPS, BAR_W_M, BAR_ABOVE, BAR_COLORS, BAR_ICONS,
  EMOJI_FONT, FAR_STAT_MAX, FAR_PANEL_SCALE, FAR_PAGE_PX, FAR_CELL_GUTTER, FAR_REDRAW_MAX, BAR_CANVAS_W, BAR_CANVAS_H, BAR_ROW_H, BAR_TEXT_FONT, BAR_ROW_GAP, BAR_SPRITE_CANVAS_H,
  BAR_PX, BAR_H_M, LOBE_RADIUS, LOBE_COLS, BRAIN_SCALE, BRAIN_HALF_H, BRAIN_ABOVE, BRAIN_SPIN, BRAIN_TILT, BRAIN_DIM,
  BRAIN_IN_GROUPS, BRAIN_GROUP_COLS, SKIES, SKY, SKY_DIST, SKY_FAR_FRACTION, SKY_BODY_DEG, SKY_TEX, SKY_FADE_S,
  RAIN_SPAN, RAIN_HEIGHT, RAIN_FPS_IDLE, RAIN_FADE_S, RAIN_TIME_WRAP, ROOF_MAP_N, ROOF_MAP_SIZE, ROOF_MAP_SNAP,
  RAIN_BY_CODE, SPECIES, NPC_FALL_S, NPC_GETUP_S, HIGH_RAGDOLLS, LOW_RAGDOLLS, RAGDOLL_G, RAGDOLL_DAMP, RAGDOLL_ITERS,
  RAGDOLL_FRICTION, RAGDOLL_ANCHOR_PER_S, RAGDOLL_MAX_DV, RAGDOLL_TOP_SHARE, RAGDOLL_BASE_SHARE
} from './1-config.js';
import {
  fmt, cellKey, fightClamp01, fightEase, invalidate, solarVector, moonVector
} from './2-core.js';
import {
  startLowPower, renderer, scene, camera, viewPos, viewQuat, hemi, sun, MOON_FALLBACK, moon, msaa, perf
} from './3-gfx-io.js';
import {
  providers
} from './4-provider.js';
import {
  pointInShell, collision
} from './5-collision.js';
import {
  facadeLit, foodBoxes, streets, shelters
} from './6-worlds.js';
import {
  humanFightAct, sampleFightKeys, personInfoKey, personInfoFields, personBodyFields, Animal, averageHumanLook, plantView, ecosystem,
  simSky, presetHour, downShare
} from './7b-sim.js';


// RENDER INPUTS: everything this file reads from the player and the game, one entry per fact. 8b-player-game fills
// it at the end of its load; the defaults are only what render sees before then (nothing calls these at load).
export const renderInputs = {
  player: null,              // the player object: pos and yaw place the shadow box and the rain around it
  casters: () => [],         // non-animal meshes whose moves redraw the shadow map (the cat and the player's body)
  survivor: () => false,     // true in Survivor mode: the sky ignores the Observer presets (skyChoice)
  pointerTaken: id => false, // true when the touch stick or touch look owns this pointer (not a label tap)
  locked: () => false        // true while the pointer is locked to the canvas
};

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
// shoulder angle a1, sweep angle turn and shoulder width shoulderW (the look's shape.shoulder).
export function humanPetHand(bend, a1, turn, shoulderW) {
  const R = HUMAN_RIG, P = HUMAN_PET, y0 = R.at(P.handAt);
  // humanTurn on (y, z) about (cy, 0)
  const turnYZ = (y, z, cy, a) => { const c = Math.cos(a), s = Math.sin(a), v = y - cy; return [cy + v * c - z * s, v * s + z * c]; };
  let [y, z] = turnYZ(y0, 0, R.elbow, P.elbow);
  [y, z] = turnYZ(y, z, R.shoulder, a1);
  const x0 = P.arm * R.shoulderX * shoulderW, dx = P.arm * (R.shoulderX + (R.shoulder - y0) * HUMAN_ARM_FLARE) * shoulderW - x0;
  const c = Math.cos(turn), s = Math.sin(turn);
  const x = x0 + dx * c - z * s;
  z = dx * s + z * c;
  [y, z] = turnYZ(y, z, R.hip, HUMAN_CROUCH.lean + bend);
  return { x, y: y - HUMAN_CROUCH_DROP, z };
}

// The people rig's per-instance attributes (4 floats each), as the shaders declare them: every geometry drawn with
// the rig (the crowd, the player's body, the billboard bake) carries all of them.
export const HUMAN_INSTANCE_ATTRS = ['iPose', 'iGait', 'iLook', 'iAct', 'iShape', 'iDown'];
// A knockdown into one instance's iDown at offset o (render only): the down share at `now` (downShare), the push's
// angle in rig space (Animal.downYaw less the facing), and the lift (rig units) that keeps the tipped body on the
// ground: the rest body's half-extent along the push, from its half-depth (+z/-z) and half-width (x) in `half`.
export function writeHumanDown(a, now, half, out, o) {
  const share = downShare(a, now), angle = a.downYaw - a.facingAngle;
  out[o] = share;
  out[o + 1] = angle;
  out[o + 2] = share > 0 ? Math.sin(share * Math.PI / 2) * (Math.abs(Math.cos(angle)) * half.depth + Math.abs(Math.sin(angle)) * half.width) : 0;
  out[o + 3] = 0;   // no ragdoll row
}
// A look into one instance's iLook (skin, shirt, pants, face/outfit/limb girth code) and iShape (torso widths in
// NPC_TORSO_REGIONS order) at offset o.
export function writeHumanLook(L, look, shape, o) {
  look[o] = L.skinRGB; look[o + 1] = L.shirt; look[o + 2] = L.pants; look[o + 3] = L.code;
  for (let i = 0; i < NPC_TORSO_REGIONS.length; i++) shape[o + i] = L.shape[NPC_TORSO_REGIONS[i]];
}
// A far card's width over the baked body's: the bake draws everyone at the sex's base build and proportions
// (averageHumanLook), so a card widens by build alone.
export const humanCardWidth = L => L.build / NPC_BUILD_BASE_MEAN[L.female ? 'female' : 'male'];

// The rest-pose body: 16 parts (ids below) lofted from rings, ~490 triangles; uv is tile-local (0..1 in a face or outfit tile).
export function buildHumanGeometry() {
  const R = HUMAN_RIG, at = R.at, W = R.widthAt;
  const pos = [], nrm = [], uv = [], rig = [], piv = [], idx = [];
  // ring points start at the back centre and run toward +x (the body's left), the front, then -x
  const oval = (n, cx, y, cz, rx, rz) => Array.from({ length: n }, (_, i) => {
    const a = Math.PI - i * 2 * Math.PI / n;
    return [cx + rx * Math.sin(a), y, cz + rz * Math.cos(a)];
  });
  const boxy = (y, cz, rx, rz) => [[0, -rz], [0.62 * rx, -rz], [rx, -0.58 * rz], [rx, 0.58 * rz], [0.62 * rx, rz], [0, rz],
    [-0.62 * rx, rz], [-rx, 0.58 * rz], [-rx, -0.58 * rz], [-0.62 * rx, -rz]].map(([x, z]) => [x, y, cz + z]);
  const part = ({ rings, vs, rect, tile, id, limb = 0, side = 0, depth = 0, ringDepth = {}, pivot = [0, 0, 0], capStart, capEnd }) => {
    // ringDepth: per-ring depth overrides by ring index (a joint seam ring); other rings take the part's depth
    const depthOf = r => ringDepth[r] ?? depth;
    const n = rings[0].length, base = pos.length / 3, idx0 = idx.length, mid = rings[rings.length >> 1], us = [0];
    for (let i = 1; i <= n; i++) {
      const a = mid[i - 1], b = mid[i % n];
      us.push(us[i - 1] + Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]));
    }
    const put = (p, u, v, d) => {
      if (side < 0) u = 1 - u;   // right limbs mirror, so u 0.25 is always the outer side
      pos.push(p[0], p[1], p[2]);
      uv.push((rect[0] + 0.5 + u * (rect[2] - 1)) / tile[0], (rect[1] + 0.5 + v * (rect[3] - 1)) / tile[1]);
      rig.push(id, limb, side, d);
      piv.push(pivot[0], pivot[1], pivot[2]);
    };
    rings.forEach((ring, r) => { for (let i = 0; i <= n; i++) put(ring[i % n], us[i] / us[n], vs[r], depthOf(r)); });
    for (let r = 0; r + 1 < rings.length; r++) for (let i = 0; i < n; i++) {
      const a = base + r * (n + 1) + i, c = a + n + 1;
      idx.push(a, a + 1, c, a + 1, c + 1, c);
    }
    const cap = (c, r, start) => {
      const ci = pos.length / 3, r0 = base + r * (n + 1);
      put(c, 0.5, c[3] ?? vs[r], depthOf(r));
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
  // a joint seam ring (waist, elbow, knee): one ring both parts of the joint end on, at the joint, taking HUMAN_JOINT_BLEND of
  // the moving part's bend (the torso's lean at the waist, the lower limb's bend at the elbow and knee) so the joint stays
  // closed; seamDepth is the shader depth that makes it take that share
  const seamDepth = 1 + HUMAN_JOINT_BLEND;
  // torso (2) and pelvis (3), joined at the waist seam
  const waistRing = boxy(W.waist, 0, 3.0, 2.05);
  part({ rings: [boxy(at(0.842), -0.2, 1.2, 1.1), boxy(W.shoulder, -0.15, 4.4, 2.2), boxy(W.chest, 0.1, 3.75, 2.55), waistRing],
    vs: [0, 0.26, 0.56, 1], rect: [0, 0, 128, 60], tile: B, id: 2, ringDepth: { 3: seamDepth } });
  part({ rings: [waistRing, boxy(W.hip, 0, 3.45, 2.35), boxy(at(0.475), 0, 2.6, 1.85)],
    vs: [0, 0.45, 1], rect: [0, 60, 128, 28], tile: B, id: 3, ringDepth: { 0: seamDepth }, capEnd: [0, at(0.468), 0, 1] });
  for (const s of [1, -1]) {
    const L = s > 0 ? 0 : 1, ax = y => s * (R.shoulderX + (R.shoulder - y) * HUMAN_ARM_FLARE), lx = y => s * (R.legX - (R.hip - y) * R.legSplay);
    // inward: how far the ring's centre sits toward the body from the arm's axis (a hand's relaxed curl)
    const armRingAt = (y, r, rz, inward = 0) => oval(6, ax(y) - s * inward, y, 0, r, rz);
    const armRing = (f, r, rz = r * 1.05, inward = 0) => armRingAt(at(f), r, rz, inward);
    const elbowRing = armRingAt(R.elbow, 0.85, 0.85 * 1.05);
    // upper arm (4, 5), lower arm (6, 7), hand (12, 13): arms hang slightly out from the shoulder
    part({ rings: [armRing(0.8, 1.28), armRing(0.72, 1.1), elbowRing], vs: [0.12, 0.5, 1], rect: [128, 0, 48, 36], tile: B,
      id: 4 + L, limb: 1, side: s, depth: 1, ringDepth: { 2: seamDepth }, pivot: arm, capStart: [ax(at(0.822)), at(0.822), 0, 0] });
    part({ rings: [elbowRing, armRing(0.58, 0.9, 0.95), armRing(0.49, 0.6, 0.66)], vs: [0, 0.3, 1], rect: [128, 36, 48, 32], tile: B,
      id: 6 + L, limb: 1, side: s, depth: 2, ringDepth: { 0: seamDepth }, pivot: arm });
    // hand: the palm faces the thigh, so it is thin across the body (rx) and wide front to back (rz); rings run wrist, palm
    // base, knuckles, mid finger, fingertip, and the fingers curl a little toward the palm (the last argument). vs puts the
    // knuckles at the painted knuckle line (v 0.48)
    part({ rings: [armRing(0.495, 0.4, 0.52), armRing(0.472, 0.4, 0.74), armRing(0.447, 0.36, 0.8, 0.03),
      armRing(0.418, 0.3, 0.7, 0.12), armRing(0.393, 0.2, 0.5, 0.24)], vs: [0, 0.2, 0.48, 0.75, 0.95], rect: [128, 68, 48, 20], tile: B,
      id: 12 + L, limb: 1, side: s, depth: 2, pivot: arm, capEnd: [ax(at(0.385)) - s * 0.3, at(0.385), 0, 1] });
    // thumb (same ids as the hand): a four-sided tube from the front of the palm base, out and down along the front edge,
    // curling toward the palm; it takes its skin from the top rows of the hand's paint, clear of the finger lines
    const thumbRing = (f, inward, z, r) => oval(4, ax(at(f)) - s * inward, at(f), z, r, r);
    part({ rings: [thumbRing(0.478, 0.12, 0.55, 0.24), thumbRing(0.452, 0.16, 0.78, 0.2), thumbRing(0.43, 0.2, 0.86, 0.15)],
      vs: [0, 0.5, 1], rect: [128, 68, 48, 3], tile: B,
      id: 12 + L, limb: 1, side: s, depth: 2, pivot: arm, capEnd: [ax(at(0.42)) - s * 0.21, at(0.42), 0.88, 1] });
    // upper leg (8, 9), lower leg (10, 11), foot (14, 15)
    const legRingAt = (y, rx, rz, cz = 0) => oval(6, lx(y), y, cz, rx, rz);
    const legRing = (f, rx, rz, cz = 0) => legRingAt(at(f), rx, rz, cz);
    const kneeRing = legRingAt(R.knee, 1.17, 1.2);
    part({ rings: [legRing(0.56, 1.95, 2.05, 0.1), legRing(0.43, 1.72, 1.82), kneeRing], vs: [0, 0.5, 1], rect: [176, 0, 80, 40], tile: B,
      id: 8 + L, limb: 2, side: s, depth: 1, ringDepth: { 2: seamDepth }, pivot: leg });
    part({ rings: [kneeRing, legRing(0.2, 1.22, 1.32, -0.18), legRing(0.05, 0.7, 0.74)], vs: [0, 0.42, 1], rect: [176, 40, 80, 48], tile: B,
      id: 10 + L, limb: 2, side: s, depth: 2, ringDepth: { 0: seamDepth }, pivot: leg });
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

// The torso's width at rest height y (GLSL): iShape's regions (NPC_TORSO_REGIONS) at HUMAN_RIG.widthAt, blended
// linearly between neighbours, the end widths held above the shoulders and below the hips.
const HUMAN_TORSO_WIDTH = NPC_TORSO_REGIONS.slice(1).reduce((expr, k, i) => {
  const y0 = HUMAN_RIG.widthAt[NPC_TORSO_REGIONS[i]], y1 = HUMAN_RIG.widthAt[k];
  return `mix(${expr}, iShape.${'xyzw'[i + 1]}, clamp((${y0.toFixed(3)} - y) / ${(y0 - y1).toFixed(3)}, 0.0, 1.0))`;
}, 'iShape.x');

// HUMAN RAGDOLL bones (HumanRagdoll, below), here because the people shader reads their count.
// bones in texture order: [base joint particle, child joint particle] (a limb bone turns from its rest direction to
// the base-to-child direction; the torso and head turn with the torso frame). The shader's ragBone maps rig part ids to
// these indices: 0 torso (torso, pelvis), 1 head (head, neck), 2/3 upper arms, 4/5 lower arms (and hands),
// 6/7 upper legs, 8/9 lower legs (and feet).
const HUMAN_RAG_BONES = [[0, 1], [1, 2], [3, 5], [4, 6], [5, 7], [6, 8], [9, 11], [10, 12], [11, 13], [12, 14]];
export const HUMAN_RAG_TEXELS = HUMAN_RAG_BONES.length * 2;   // ragdoll texture texels per row: rotation, translation per bone

// Shared by the lit and shadow-depth materials: per-vertex rig data, per-instance pose, gait, look and body shape.
export const HUMAN_VERTEX_PARS = /* glsl */`
      attribute vec4 rig;
      attribute vec3 pivot;
      attribute vec4 iPose;
      attribute vec4 iGait;
      attribute vec4 iLook;
      attribute vec4 iAct;   // fight (humanFightAct): punch reach, punching arm (+1 left, -1 right), guard share; pet (humanPetPack)
      attribute vec4 iShape; // torso widths in NPC_TORSO_REGIONS order (writeHumanLook); limb girth rides in iLook.w
      attribute vec4 iDown;  // knockdown: w 0 = the lying pose (writeHumanDown: down share 0 standing to 1 lying, push angle in rig
                             // space, lift in rig units); w > 0 = a ragdoll in texture row w - 1, z its rise share (0 ragdoll, 1 standing)
      uniform sampler2D humanRagdoll;   // ragdoll bones (HumanRagdoll.pose): per row, each bone's rotation then translation
      vec4 ragTexel(float row, float col) {
        return texture2D(humanRagdoll, vec2((col + 0.5) / ${HUMAN_RAG_TEXELS}.0, (row + 0.5) / ${HIGH_RAGDOLLS}.0));
      }
      vec3 quatRotate(vec4 q, vec3 v) { return v + 2.0 * cross(q.xyz, cross(q.xyz, v) + q.w * v); }
      // a rig part id (rig.x) to its HUMAN_RAG_BONES index: head and neck 1, torso and pelvis 0, upper and lower limbs
      // (4 to 11) id - 2, hands (12, 13) with the lower arms, feet (14, 15) with the lower legs
      float ragBone(float id) {
        if (id < 1.5) return 1.0;
        if (id < 3.5) return 0.0;
        if (id < 11.5) return id - 2.0;
        if (id < 13.5) return id - 8.0;
        return id - 6.0;
      }
      void ragBoneMove(float row, float bone, vec3 p, vec3 n, out vec3 op, out vec3 on) {
        vec4 q = ragTexel(row, bone * 2.0), t = ragTexel(row, bone * 2.0 + 1.0);
        op = quatRotate(q, p) + t.xyz; on = quatRotate(q, n);
      }
      // the shaped rest pose (p, n) moved by its part's ragdoll bone; an elbow or knee seam ring (depth between 1 and 2)
      // takes its depth's share of the way from the upper limb's bone to the lower's, so the joint stays closed
      void humanRagdollPose(vec3 p, vec3 n, out vec3 op, out vec3 on) {
        float row = iDown.w - 1.0, bone = ragBone(rig.x);
        ragBoneMove(row, bone, p, n, op, on);
        if (rig.w > 1.01 && rig.w < 1.99 && rig.x > 3.5 && rig.x < 11.5) {
          bool lowerPart = (rig.x > 5.5 && rig.x < 7.5) || rig.x > 9.5;
          float upperBone = lowerPart ? bone - 2.0 : bone;
          vec3 up, un, lp, ln;
          ragBoneMove(row, upperBone, p, n, up, un);
          ragBoneMove(row, upperBone + 2.0, p, n, lp, ln);
          float k = rig.w - 1.0;
          op = mix(up, lp, k); on = normalize(mix(un, ln, k));
        }
      }
      float humanTorsoWidth(float y) { return ${HUMAN_TORSO_WIDTH}; }
      vec2 humanTurn(vec2 p, float a) { float c = cos(a), s = sin(a); return vec2(p.x * c - p.y * s, p.x * s + p.y * c); }
      // rig space to world for this instance: body shape, walk cycle (joints turn about x), fight arms, lean, bob, size, facing
      void humanPose(inout vec3 p, inout vec3 n) {
        // BODY SHAPE: the head keeps its rest width; the neck takes limb girth (iLook.w); torso and pelvis take iShape's
        // region width at their height; a limb's axis moves out with the shoulders (arms) or hips (legs) and the limb
        // thickens about it by limb girth; shoes keep their size
        float limbGirth = ${NPC_WIDTH_LIMITS[0].toFixed(3)} + floor(iLook.w / 64.0) / ${NPC_GIRTH_STEPS.toFixed(1)};
        if (rig.x > 3.5) {
          float axisX = rig.z * (rig.y < 1.5 ? ${HUMAN_RIG.shoulderX.toFixed(3)} + (${HUMAN_RIG.shoulder.toFixed(3)} - p.y) * ${HUMAN_ARM_FLARE.toFixed(3)}
            : ${HUMAN_RIG.legX.toFixed(3)} - (${HUMAN_RIG.hip.toFixed(3)} - max(p.y, ${HUMAN_RIG.ankle.toFixed(3)})) * ${HUMAN_RIG.legSplay.toFixed(3)});
          float g = rig.w > 2.5 ? 1.0 : limbGirth;
          p.x = axisX * (rig.y < 1.5 ? iShape.x : iShape.w) + (p.x - axisX) * g;
          p.z *= g; n.xz /= g;
        } else if (rig.x > 1.5) {
          float w = humanTorsoWidth(p.y);
          p.xz *= w; n.xz /= w;
        } else if (rig.x > 0.5) {
          p.xz *= limbGirth; n.xz /= limbGirth;
        }
        vec3 restP = p, restN = n;   // the shaped rest pose, what a ragdoll's bones move (humanRagdollPose)
        // knockdown: the walk, run and fight arms fade out as the body goes down (upright share)
        float upright = 1.0 - iDown.x;
        // iGait.w: the run share when >= 0, the crouch share when < 0 (the player's stance never mixes them)
        float run = max(iGait.w, 0.0) * upright, crouch = max(-iGait.w, 0.0);
        float t = iGait.y, sw = iGait.z * upright * (1.0 - ${(1 - HUMAN_CROUCH.swingKept).toFixed(3)} * crouch), s = sin(t) * rig.z, c = cos(t) * rig.z;
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
          float reach = iAct.x * upright * step(0.5, iAct.y * rig.z), fight = max(iAct.z * upright, reach);
          a1 = mix(a1, mix(${HUMAN_FIGHT.guardShoulder.toFixed(3)}, ${HUMAN_FIGHT.punchShoulder.toFixed(3)}, reach), fight);
          a2 = mix(a2, mix(${HUMAN_FIGHT.guardElbow.toFixed(3)}, ${HUMAN_FIGHT.punchElbow.toFixed(3)}, reach), fight);
          // pet: the petting arm takes the solved shoulder angle and the pet's elbow by the reach share, and turns about
          // its shoulder's vertical by the sweep angle
          float pet = petReach * step(0.5, ${HUMAN_PET.arm.toFixed(1)} * rig.z);
          a1 = mix(a1, ${HUMAN_PET.shoulder[0].toFixed(3)} + ${(HUMAN_PET.shoulder[1] - HUMAN_PET.shoulder[0]).toFixed(3)} * mod(floor(iAct.w / 256.0), 256.0) / 255.0, pet);
          a2 = mix(a2, ${HUMAN_PET.elbow.toFixed(3)}, pet);
          petTurn = pet * (floor(iAct.w / 65536.0) / 255.0 * ${(2 * HUMAN_PET.turnMax).toFixed(3)} - ${HUMAN_PET.turnMax.toFixed(3)});
        }
        // depth 1 takes none of the middle joint's bend, depth 2 and deeper all of it, a seam ring between them its share
        // (HUMAN_JOINT_BLEND); seamShare is that share, 0 to 1, for a seam ring (depth 1 to 2) and 0 or 1 elsewhere
        float seamShare = clamp(rig.w - 1.0, 0.0, 1.0);
        a2 *= seamShare; a3 *= step(2.5, rig.w);
        vec2 q = p.yz;
        if (rig.w > 0.5) {
          q = vec2(pivot.z, 0.0) + humanTurn(q - vec2(pivot.z, 0.0), a3);
          q = vec2(pivot.y, 0.0) + humanTurn(q - vec2(pivot.y, 0.0), a2);
          q = vec2(pivot.x, 0.0) + humanTurn(q - vec2(pivot.x, 0.0), a1);
        }
        // the petting arm's sweep, before the lean (as humanPetHand)
        if (petTurn != 0.0) {
          vec2 sh = vec2(rig.z * ${HUMAN_RIG.shoulderX.toFixed(3)} * iShape.x, 0.0);
          p.yz = q;
          p.xz = sh + humanTurn(p.xz - sh, petTurn);
          q = p.yz;
        }
        // upper body (head, neck, torso, arms) leans with the gait; in a crouch or a pet's bend the pelvis (3) tilts with
        // it, so the waist stays joined and the pelvis's open top stays inside the torso
        float bendLean = ${HUMAN_CROUCH.lean.toFixed(3)} * crouch + petBend * petReach;
        float upperLean = sw * 0.12 + run * 0.16 + bendLean + ${HUMAN_FIGHT.punchLean.toFixed(3)} * iAct.x * upright;   // the upper body's lean
        float lean = (rig.x < 2.5 || abs(rig.y - 1.0) < 0.5) ? upperLean : (abs(rig.x - 3.0) < 0.5 ? bendLean : 0.0);
        // the waist seam ring (torso 2 and pelvis 3 share it, depth 1 to 2) takes seamShare of the way from the pelvis's lean
        // to the upper body's, so the waist stays closed when the torso leans over a pelvis that does not
        if (rig.w > 0.5 && rig.x > 1.5 && rig.x < 3.5) lean = mix(bendLean, upperLean, seamShare);
        q = vec2(${HUMAN_RIG.hip.toFixed(3)}, 0.0) + humanTurn(q - vec2(${HUMAN_RIG.hip.toFixed(3)}, 0.0), lean);
        p.yz = q;
        p.y -= ${HUMAN_LEG.toFixed(3)} * (1.0 - cos(sw * sin(t))) * 0.85 + ${HUMAN_CROUCH_DROP.toFixed(3)} * crouch;
        n.yz = humanTurn(n.yz, a1 + a2 + a3);
        n.xz = humanTurn(n.xz, petTurn);
        n.yz = humanTurn(n.yz, lean);
        // knockdown: the body tips about its feet by down share x 90 degrees the way it was pushed (iDown.y, turned to
        // +z for the tip and back), raised by iDown.z so it lies on the ground instead of through it
        if (iDown.x > 0.0) {
          float tip = iDown.x * ${(Math.PI / 2).toFixed(4)};
          p.xz = humanTurn(p.xz, iDown.y); n.xz = humanTurn(n.xz, iDown.y);
          vec2 ly = humanTurn(vec2(p.y - ${HUMAN_RIG.foot.toFixed(3)}, p.z), tip);
          p.y = ${HUMAN_RIG.foot.toFixed(3)} + ly.x + iDown.z; p.z = ly.y;
          vec2 lyn = humanTurn(n.yz, tip); n.y = lyn.x; n.z = lyn.y;
          p.xz = humanTurn(p.xz, -iDown.y); n.xz = humanTurn(n.xz, -iDown.y);
        }
        // a ragdoll: its bones' pose, blended into the standing pose above by the rise share
        if (iDown.w > 0.5) {
          vec3 rp, rn;
          humanRagdollPose(restP, restN, rp, rn);
          p = mix(rp, p, iDown.z); n = normalize(mix(rn, n, iDown.z));
        }
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
      float hLimb = floor(iLook.w / 64.0), hRest = iLook.w - hLimb * 64.0, hOutfit = floor(hRest / 8.0), hFace = hRest - hOutfit * 8.0;
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
export function humanMaterials(paint, mask, ragdoll) {
  const lit = new THREE.MeshLambertMaterial();
  lit.onBeforeCompile = sh => {
    sh.uniforms.humanPaint = { value: paint };
    sh.uniforms.humanMask = { value: mask };
    sh.uniforms.humanRagdoll = { value: ragdoll };
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
    sh.uniforms.humanRagdoll = { value: ragdoll };
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
      attribute float bWidth;  // card width over the baked body's (humanCardWidth; 1 for animals)
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
      vec3 bbPos = bbAxis + vec3(bbTo.y, 0.0, -bbTo.x) * ((position.x - 0.5) * bFrame.x * bWidth);
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

// RAGDOLLS (render only, RAGDOLL_* in 1-config.js): the sim decides who is down and for how long (Ecosystem.applyHit);
// a ragdoll only plays the fall out. VerletBody is the shared physics: particles in world metres, distance links with
// per-end shares of each correction, flat ground at the body's footing (each particle held its radius above it),
// friction on contact, and a pull of the body's anchor particles back over the sim's position, so it gets up where the
// sim body is. BoxRagdoll (deer, coyotes) and HumanRagdoll (people) each lay out the particles and links of their rig
// and turn the particles back into their rig's pose.
class VerletBody {
  // n particles; links: [a, b, aShare, bShare] (the shares of a length correction each end takes); radii: rig units
  // per particle; anchors: the particles whose mean is pulled back over the sim's position
  constructor(n, links, radii, anchors) {
    this.n = n; this.links = links; this.radii = radii; this.anchors = anchors;
    this.pos = new Float64Array(n * 3);    // particles now
    this.prev = new Float64Array(n * 3);   // particles one step ago (Verlet velocity)
    this.len = new Float64Array(links.length);   // each link's length, metres, as placed at the start
    this.kp = 0; this.ground = 0;
  }

  // Place particle i at world point v, launched by (lx, lz) metres per step (its share of the launch already applied).
  place(i, v, lx, lz) {
    const o = i * 3, pos = this.pos, prev = this.prev;
    pos[o] = v.x; pos[o + 1] = v.y; pos[o + 2] = v.z;
    prev[o] = v.x - lx; prev[o + 1] = v.y; prev[o + 2] = v.z - lz;
  }

  // After every place(): the links keep the lengths they start with. kp: metres per rig unit; ground: footing height.
  begin(kp, ground) {
    this.kp = kp; this.ground = ground;
    for (let k = 0; k < this.links.length; k++) this.len[k] = this.dist(this.links[k][0], this.links[k][1]);
  }

  dist(i, j) {
    const p = this.pos, a = i * 3, b = j * 3;
    return Math.hypot(p[b] - p[a], p[b + 1] - p[a + 1], p[b + 2] - p[a + 2]);
  }

  // One sim tick: damping and gravity, RAGDOLL_ITERS passes of links then ground (friction on the last), then the pull
  // back toward (anchorX, anchorZ): every particle and its last step move alike, so the pull adds no speed.
  step(anchorX, anchorZ) {
    const pos = this.pos, prev = this.prev, h = NPC_TICK_S, n3 = this.n * 3;
    for (let o = 0; o < n3; o += 3) {
      for (let d = 0; d < 3; d++) {
        const v = (pos[o + d] - prev[o + d]) * RAGDOLL_DAMP;
        prev[o + d] = pos[o + d];
        pos[o + d] += v;
      }
      pos[o + 1] -= RAGDOLL_G * h * h;
    }
    for (let it = 0; it < RAGDOLL_ITERS; it++) {
      for (let k = 0; k < this.links.length; k++) {
        const [i, j, si, sj] = this.links[k], a = i * 3, b = j * 3, d = this.dist(i, j);
        if (d < 1e-9) continue;
        const f = (d - this.len[k]) / d;
        for (let e = 0; e < 3; e++) {
          const delta = (pos[b + e] - pos[a + e]) * f;
          pos[a + e] += delta * si; pos[b + e] -= delta * sj;
        }
      }
      const last = it === RAGDOLL_ITERS - 1;
      for (let i = 0; i < this.n; i++) {
        const o = i * 3, floor = this.ground + this.radii[i] * this.kp;
        if (pos[o + 1] >= floor) continue;
        pos[o + 1] = floor;
        if (last) {
          prev[o] += (pos[o] - prev[o]) * RAGDOLL_FRICTION;
          prev[o + 2] += (pos[o + 2] - prev[o + 2]) * RAGDOLL_FRICTION;
        }
      }
    }
    let cx = 0, cz = 0;
    for (const i of this.anchors) { cx += pos[i * 3]; cz += pos[i * 3 + 2]; }
    cx /= this.anchors.length; cz /= this.anchors.length;
    const pull = Math.min(1, RAGDOLL_ANCHOR_PER_S * h), sx = (anchorX - cx) * pull, sz = (anchorZ - cz) * pull;
    for (let o = 0; o < n3; o += 3) { pos[o] += sx; prev[o] += sx; pos[o + 2] += sz; prev[o + 2] += sz; }
  }

  // particle i into out
  at(i, out) { const o = i * 3; return out.set(this.pos[o], this.pos[o + 1], this.pos[o + 2]); }
}

// The launch every ragdoll starts with: the sim's push heading and speed (Animal.downYaw, downDV, capped at
// RAGDOLL_MAX_DV) as metres per step, x then z.
function ragdollLaunch(a) {
  const dv = Math.min(a.downDV, RAGDOLL_MAX_DV) * NPC_TICK_S;
  return [Math.sin(a.downYaw) * dv, Math.cos(a.downYaw) * dv];
}
// Share of the rise done at `now` (0 still a ragdoll, 1 standing): eases in over the last NPC_GETUP_S of the hold.
const ragdollRise = (a, now) => fightEase(fightClamp01(1 - (a.downUntil - now) / NPC_GETUP_S));

// Every particle's world point from its rest point in rig units, placed by the standing pose at world / quat.
function placeFromRest(body, rest, shares, world, quat, a, v) {
  const [lx, lz] = ragdollLaunch(a);
  for (let i = 0; i < rest.length; i++) {
    v.copy(rest[i]).multiplyScalar(body.kp).applyQuaternion(quat).add(world);
    body.place(i, v, lx * shares[i], lz * shares[i]);
  }
}

// BOX-RIG RAGDOLL: deer and coyotes. Particles: 0 body rear, 1 body front, 2 body top, 3 to 6 the hips and 7 to 10 the
// feet in LIMB_NAMES order. The body points and hips are linked all to all (held rigid); each foot hangs from its hip
// on its leg's length and swings free (the foot takes the whole correction). The body's top takes the full launch,
// rear, front and hips RAGDOLL_BASE_SHARE, so the body rolls toward the push. `rig`: AnimalRenderer.ragdollRig.
const BOX_RAG_CORE = 7;   // body points and hips: particles 0 to 6
const BOX_RAG_LINKS = (() => {
  const links = [];
  for (let i = 0; i < BOX_RAG_CORE; i++) for (let j = i + 1; j < BOX_RAG_CORE; j++) links.push([i, j, 0.5, 0.5]);
  for (let l = 0; l < 4; l++) links.push([3 + l, 7 + l, 0, 1]);
  return links;
})();
const BOX_RAG_SHARES = [RAGDOLL_BASE_SHARE, RAGDOLL_BASE_SHARE, RAGDOLL_TOP_SHARE, ...Array(4).fill(RAGDOLL_BASE_SHARE), ...Array(4).fill(0)];
class BoxRagdoll {
  constructor(rig) {
    this.rig = rig; this.owner = null; this.seen = -1;
    this.body = new VerletBody(11, BOX_RAG_LINKS, [rig.bodyR, rig.bodyR, rig.bodyR, ...Array(8).fill(rig.footR)], [0, 1]);
    this._c = new THREE.Vector3(); this._x = new THREE.Vector3(); this._y = new THREE.Vector3(); this._z = new THREE.Vector3();
    this._v = new THREE.Vector3(); this._w = new THREE.Vector3(); this._m = new THREE.Matrix4(); this._q = new THREE.Quaternion();
    this._sp = new THREE.Vector3(); this._sq = new THREE.Quaternion(); this._ss = new THREE.Vector3(); this._scale = new THREE.Vector3();
  }

  // From the standing pose at world / quat (kp metres per rig unit) on ground at height `ground`.
  start(a, world, quat, kp, ground) {
    this.owner = a;
    this.body.kp = kp;
    placeFromRest(this.body, this.rig.points, BOX_RAG_SHARES, world, quat, a, this._v);
    this.body.begin(kp, ground);
  }

  step(a) { this.body.step(a.position.x, a.position.z); }

  // The body's centre (_c) and axes (_x, _y, _z: right, up, forward) from its three points.
  frame() {
    const b = this.body, c = this._c, y = this._y, z = this._z;
    b.at(0, this._v); b.at(1, this._w);
    c.addVectors(this._v, this._w).multiplyScalar(0.5);
    z.subVectors(this._w, this._v).normalize();
    b.at(2, y).sub(c);
    y.addScaledVector(z, -y.dot(z)).normalize();
    this._x.crossVectors(y, z);
  }

  // Write the body, head (and antlers), and legs into the instances at idx / aidx, blended toward the standing pose
  // already there (poseBoxRig) by `toStand` (0 ragdoll, 1 standing).
  pose(im, idx, antlers, aidx, legNames, toStand) {
    const rig = this.rig, kp = this.body.kp;
    this.frame();
    this._m.makeBasis(this._x, this._y, this._z);
    const bodyQ = this._q.setFromRotationMatrix(this._m), h = rig.head;
    const headPos = this._v.copy(this._c).addScaledVector(this._x, h.x * kp).addScaledVector(this._y, h.y * kp).addScaledVector(this._z, h.z * kp);
    this.write(im.body, idx, this._c, bodyQ, toStand);
    this.write(im.head, idx, headPos, bodyQ, toStand);
    if (antlers) this.write(antlers, aidx, headPos, bodyQ, toStand);
    for (let l = 0; l < 4; l++) {
      const hip = this.body.at(3 + l, this._w), dir = this.body.at(7 + l, this._v).sub(hip).normalize();
      const legQ = this._q.setFromUnitVectors(RAG_DOWN, dir);
      this.write(im[legNames[l]], idx, hip.addScaledVector(dir, rig.limbHalf * kp), legQ, toStand);
    }
  }

  // One instance at (p, q), blended toward the standing matrix already in the slot by `toStand`.
  write(mesh, i, p, q, toStand) {
    const m = this._m;
    if (toStand > 0) {
      mesh.getMatrixAt(i, m);
      m.decompose(this._sp, this._sq, this._ss);
      // the standing transform, moved toward the ragdoll's by what is left of the rise
      p = this._sp.lerp(p, 1 - toStand);
      q = this._sq.slerp(q, 1 - toStand);
    }
    m.compose(p, q, this._scale.setScalar(this.body.kp));
    mesh.setMatrixAt(i, m);
  }
}
const RAG_DOWN = new THREE.Vector3(0, -1, 0);   // a box leg's axis, hip to foot

// HUMAN RAGDOLL: people. Particles (HUMAN_RAG_POINTS): 0 pelvis, 1 chest, 2 head, 3/4 shoulders, 5/6 elbows,
// 7/8 hands, 9/10 hips, 11/12 knees, 13/14 feet (left then right, +x the body's left). The torso (pelvis, chest,
// shoulders, hips) and the head are linked all to all (held rigid); each arm and leg is two free-swinging segments.
// Bones (HUMAN_RAG_BONES, the people shader's ragBone) turn the particles into a rotation and translation per body part
// in rig units, written to one row of the ragdoll texture (AnimalRenderer.human.ragdoll) the shader reads.
const HUMAN_RAG_CORE = [0, 1, 2, 3, 4, 9, 10];
const HUMAN_RAG_LINKS = (() => {
  const links = [];
  for (let i = 0; i < HUMAN_RAG_CORE.length; i++) for (let j = i + 1; j < HUMAN_RAG_CORE.length; j++) links.push([HUMAN_RAG_CORE[i], HUMAN_RAG_CORE[j], 0.5, 0.5]);
  // limbs: [joint, child, joint's share, child's share]; the end nearer the torso is heavier
  for (const s of [0, 1]) links.push([3 + s, 5 + s, 0.2, 0.8], [5 + s, 7 + s, 0.5, 0.5], [9 + s, 11 + s, 0.3, 0.7], [11 + s, 13 + s, 0.5, 0.5]);
  return links;
})();
// radii on the ground, rig units: pelvis, chest, head, shoulders, elbows, hands, hips, knees, feet
const HUMAN_RAG_RADII = [2.3, 2.3, 1.9, 1.5, 1.5, 0.9, 0.9, 0.6, 0.6, 1.8, 1.8, 1.2, 1.2, 0.9, 0.9];
// launch share per particle: the upper body leads, so the body topples toward the push
const HUMAN_RAG_SHARES = [RAGDOLL_BASE_SHARE, RAGDOLL_TOP_SHARE, RAGDOLL_TOP_SHARE, RAGDOLL_TOP_SHARE, RAGDOLL_TOP_SHARE,
  0, 0, 0, 0, RAGDOLL_BASE_SHARE, RAGDOLL_BASE_SHARE, 0, 0, 0, 0];
// (HUMAN_RAG_BONES and HUMAN_RAG_TEXELS are defined before the people shader, which reads them)
// A person's ragdoll rest points in rig units at body shape `shape` (look.shape: the shader moves the arms' axis out by
// the shoulder width and the legs' by the hip width).
function humanRagRest(shape) {
  const R = HUMAN_RIG, at = R.at;
  const arm = (s, y) => new THREE.Vector3(s * (R.shoulderX + (R.shoulder - y) * HUMAN_ARM_FLARE) * shape.shoulder, y, 0);
  const leg = (s, y) => new THREE.Vector3(s * (R.legX - (R.hip - y) * R.legSplay) * shape.hip, y, 0);
  return [new THREE.Vector3(0, R.hip, 0), new THREE.Vector3(0, at(0.84), 0), new THREE.Vector3(0, at(0.94), 0),
    arm(1, R.shoulder), arm(-1, R.shoulder), arm(1, R.elbow), arm(-1, R.elbow), arm(1, at(0.44)), arm(-1, at(0.44)),
    leg(1, R.hip), leg(-1, R.hip), leg(1, R.knee), leg(-1, R.knee), leg(1, R.ankle), leg(-1, R.ankle)];
}
class HumanRagdoll {
  constructor() {
    this.owner = null; this.seen = -1; this.row = -1; this.rest = null;
    this.body = new VerletBody(15, HUMAN_RAG_LINKS, HUMAN_RAG_RADII, [0, 1]);
    this.local = Array.from({ length: 15 }, () => new THREE.Vector3());   // particles in rig units this pose
    this._v = new THREE.Vector3(); this._d = new THREE.Vector3(); this._r = new THREE.Vector3();
    this._x = new THREE.Vector3(); this._y = new THREE.Vector3(); this._z = new THREE.Vector3();
    this._m = new THREE.Matrix4(); this._torso = new THREE.Quaternion(); this._inv = new THREE.Quaternion();
    this._q = new THREE.Quaternion(); this._limb = new THREE.Quaternion(); this._t = new THREE.Vector3();
  }

  start(a, world, quat, kp, ground) {
    this.owner = a;
    this.rest = humanRagRest(a.look.shape);
    this.body.kp = kp;
    placeFromRest(this.body, this.rest, HUMAN_RAG_SHARES, world, quat, a, this._v);
    this.body.begin(kp, ground);
  }

  step(a) { this.body.step(a.position.x, a.position.z); }

  // The bones into `data` at this ragdoll's row, in rig units of the instance placed at (ox, oy, oz) facing `facing`
  // (the shader's iPose): each bone's rotation (x, y, z, w) then its translation, so a rest vertex p lands at R p + t.
  pose(data, ox, oy, oz, facing) {
    const b = this.body, kp = b.kp, cy = Math.cos(facing), sy = Math.sin(facing), L = this.local;
    // world to rig units: undo the shader's facing turn (x' = x cy + z sy, z' = z cy - x sy) and scale
    for (let i = 0; i < 15; i++) {
      const w = b.at(i, this._v), dx = (w.x - ox) / kp, dy = (w.y - oy) / kp, dz = (w.z - oz) / kp;
      L[i].set(dx * cy - dz * sy, dy, dz * cy + dx * sy);
    }
    // torso frame: up pelvis to chest, x right shoulder to left, z forward; at rest it is the identity
    const y = this._y.subVectors(L[1], L[0]).normalize();
    const x = this._x.subVectors(L[3], L[4]);
    x.addScaledVector(y, -x.dot(y)).normalize();
    const z = this._z.crossVectors(x, y);
    this._m.makeBasis(x, y, z);
    const torso = this._torso.setFromRotationMatrix(this._m), inv = this._inv.copy(torso).invert();
    let o = this.row * HUMAN_RAG_TEXELS * 4;
    for (let k = 0; k < HUMAN_RAG_BONES.length; k++, o += 8) {
      const [j, c] = HUMAN_RAG_BONES[k], q = this._q.copy(torso);
      if (k >= 2) {
        // a limb: the torso's turn, then the turn from its rest direction to where it points now in the torso's frame
        const restDir = this._r.subVectors(this.rest[c], this.rest[j]).normalize();
        const nowDir = this._d.subVectors(L[c], L[j]).applyQuaternion(inv).normalize();
        q.multiply(this._limb.setFromUnitVectors(restDir, nowDir));
      }
      const t = this._t.copy(this.rest[j]).applyQuaternion(q).negate().add(L[j]);
      data[o] = q.x; data[o + 1] = q.y; data[o + 2] = q.z; data[o + 3] = q.w;
      data[o + 4] = t.x; data[o + 5] = t.y; data[o + 6] = t.z; data[o + 7] = 0;
    }
  }
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
    this._zAxis = new THREE.Vector3(0, 0, 1);
    this._quatRoll = new THREE.Quaternion();
    this._fightPose = {};
    this.LIMB_FRONT = this.LIMB_NAMES.map(n => n[3] === 'F');   // legFL, legFR: front legs
    // BOX-RIG RAGDOLLS: live ragdolls by animal, spare ones, and the update pass count that marks who was drawn
    this._ragdollOf = new Map();
    this._ragdollPools = {};       // spare ragdolls by animal type
    this._ragdollRows = Array.from({ length: HIGH_RAGDOLLS }, (_, i) => i);   // free rows of the people's ragdoll texture
    this._pass = 0;
    this.ragdollsOn = false;   // ragdolls allowed (setRagdolls): Survivor mode only, set by 9-main as the mode changes

    // per species id: that type's fixed tables plus the counters one update() pass fills
    this.passById = NPC_TYPES.map(type => ({
      type, offsets: this.PART_OFFSETS[type], pivots: this.PIVOT_OFFSETS[type], colors: this.SEX_COLORS[type],
      walkSwing: this.WALK[type], legLen: this.LEG_LEN[type], limbHalf: this.LIMB_HALF[type],
      cardFrame: BB_FRAME[type], cardLooks: null, cardTints: null,   // billboard frame (rig units), look and coat tint by sex
      // fight move; box rigs tip about the anchor joint's height and depth (rig units), or the body centre
      fight: NPC_FIGHT_MOVES[type],
      fightAnchor: NPC_FIGHT_MOVES[type].anchor ? this.PIVOT_OFFSETS[type][NPC_FIGHT_MOVES[type].anchor] : null,
      // knockdown, box rigs only: rig units the body centre drops lying on its side (centre height less the rest body's
      // half-width); people lie down in their shader (writeHumanDown)
      lieDrop: this.REST_BOUNDS[type] ? SPECIES[type].lift - Math.max(this.REST_BOUNDS[type].max.x, -this.REST_BOUNDS[type].min.x) : 0,
      // a new ragdoll of this type (people: HumanRagdoll; box rigs: BoxRagdoll on their rest points and sizes)
      newRagdoll: type === 'human' ? () => new HumanRagdoll() : (rig => () => new BoxRagdoll(rig))(this.ragdollRig(type)),
      im: null, cache: null, antlers: null,
      idx: 0, billboarded: 0, aidx: 0, colorsDirty: false, full: false
    }));

    // PEOPLE: one instanced mesh for everyone nearer than perf.npcLodDist; per instance HUMAN_INSTANCE_ATTRS (4 floats each).
    // HUMAN RAGDOLLS: one texture row of bones per live ragdoll (HumanRagdoll.pose), read by the people shader
    const ragdoll = new THREE.DataTexture(new Float32Array(HUMAN_RAG_TEXELS * HIGH_RAGDOLLS * 4), HUMAN_RAG_TEXELS, HIGH_RAGDOLLS,
      THREE.RGBAFormat, THREE.FloatType);
    ragdoll.minFilter = ragdoll.magFilter = THREE.NearestFilter;
    ragdoll.generateMipmaps = false;
    ragdoll.needsUpdate = true;
    const rest = buildHumanGeometry(), atlas = paintHumanAtlas(), mats = humanMaterials(atlas.paint, atlas.mask, ragdoll);
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
      shape: perInstance('iShape'), // torso widths in NPC_TORSO_REGIONS order (limb girth rides in iLook)
      down: perInstance('iDown'),   // knockdown pose (writeHumanDown) or ragdoll row and rise
      ragdoll,                      // ragdoll bones by row (HumanRagdoll.pose)
      // the rest body's half-depth and half-width (rig units), what a lying body is raised by (writeHumanDown)
      lieHalf: (() => {
        if (!rest.boundingBox) rest.computeBoundingBox();
        const b = rest.boundingBox;
        return { depth: Math.max(b.max.z, -b.min.z), width: Math.max(b.max.x, -b.min.x) };
      })(),
      lookOwner: new Array(this.MAX_INSTANCES).fill(null)   // who each slot's look and shape were written for
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
    const perCard = (name, size = 4) => {
      const attr = new THREE.InstancedBufferAttribute(new Float32Array(cardMax * size), size);
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
      width: perCard('bWidth', 1),   // card width over the baked body's (humanCardWidth)
      cardOwner: new Array(cardMax).fill(null)   // who each slot's tints and width were written for
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
    const n = people.length * BB_BLOCK;
    // every rig attribute, zero unless written below (baked bodies do not fight)
    const inst = Object.fromEntries(HUMAN_INSTANCE_ATTRS.map(name => [name, new Float32Array(n * 4)]));
    const { iPose, iGait, iLook, iShape } = inst;
    let j = 0;
    for (const li of people) {
      const L = averageHumanLook(looks[li].female, looks[li].outfit, BB_FACE_VARIANT);
      // at the mean body, so far cards widen from the sex's base build (humanCardWidth)
      for (let d = 0; d < BB_BAKED_DIRS; d++) for (let q = 0; q < BB_POSES; q++, j += 4) {
        const [x, y, k] = place(li * BB_BLOCK + d * BB_POSES + q, 'human');
        iPose.set([x, y, 0, turn(d)], j);
        iGait.set([k, q ? phase(q) : 0, q ? BB_HUMAN_SWING : 0, 0], j);
        writeHumanLook(L, iLook, iShape, j);
        iLook[j] = HUMAN_HAIR[+L.female][BB_FACE_VARIANT];   // the baked face's hair colour rides in the skin slot
      }
    }
    for (const name of HUMAN_INSTANCE_ATTRS) hg.setAttribute(name, new THREE.InstancedBufferAttribute(inst[name], 4));
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
    B.cardOwner.fill(null);
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

  // A box rig's ragdoll (BoxRagdoll), rig units: rest points (rear, front and top of the main body box, then the feet),
  // hips (the leg pivots), the head's offset, leg length and half length, and the particle radii on the ground.
  ragdollRig(type) {
    const body = this.GEOMETRIES[type].body, leg = this.GEOMETRIES[type].leg;
    if (!body.boundingBox) body.computeBoundingBox();
    if (!leg.boundingBox) leg.computeBoundingBox();
    const half = body.boundingBox.max, limbHalf = this.LIMB_HALF[type];
    const hips = this.LIMB_NAMES.map(n => this.PIVOT_OFFSETS[type][n]);
    const feet = hips.map(h => new THREE.Vector3(h.x, h.y - 2 * limbHalf, h.z));
    return {
      // BoxRagdoll's particles in order: body rear, front and top, the hips, the feet
      points: [new THREE.Vector3(0, 0, -half.z), new THREE.Vector3(0, 0, half.z), new THREE.Vector3(0, half.y, 0), ...hips, ...feet],
      head: this.PART_OFFSETS[type].head, limbHalf,
      bodyR: Math.min(half.x, half.y), footR: leg.boundingBox.max.x
    };
  }

  // Ragdolls allowed or not (Survivor mode on or off, 9-main): on, knockdowns get ragdolls on high graphics; off,
  // every live ragdoll ends and everyone keeps the lying pose.
  setRagdolls(on) {
    this.ragdollsOn = on;
    if (!on) for (const [a, r] of this._ragdollOf) this.freeRagdoll(a, r);
  }

  // The live ragdoll for animal `a` this pass, or null (it keeps the lying pose). A ragdoll starts only for a
  // knockdown first seen within its fall (so one walked into view mid-hold keeps the lying pose), in Survivor mode
  // (ragdollsOn) with graphics high, while a slot is free; it steps once per sim tick until the rise and ends with the
  // hold. Standing pose at this._world / this._quat; kp metres per rig unit.
  ragdollFor(a, p, now, kp, ticked) {
    let r = this._ragdollOf.get(a);
    if (r && now >= a.downUntil) { this.freeRagdoll(a, r); return null; }
    if (!r) {
      if (!a.isDown(now) || now - a.downAt > NPC_FALL_S) return null;
      if (this._ragdollOf.size >= (this.ragdollsOn && graphics.high ? HIGH_RAGDOLLS : LOW_RAGDOLLS)) return null;
      r = (this._ragdollPools[p.type] ??= []).pop() ?? p.newRagdoll();
      if (r instanceof HumanRagdoll) r.row = this._ragdollRows.pop();
      r.start(a, this._world, this._quat, kp, this._world.y - SPECIES[p.type].lift * kp);
      this._ragdollOf.set(a, r);
    } else if (ticked && now < a.downUntil - NPC_GETUP_S) r.step(a);
    r.seen = this._pass;
    return r;
  }

  freeRagdoll(a, r) {
    this._ragdollOf.delete(a);
    r.owner = null;
    if (r instanceof HumanRagdoll) { this._ragdollRows.push(r.row); r.row = -1; }
    this._ragdollPools[a.type].push(r);
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
    this._pass++;
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

    const H = this.human, hPose = H.pose.array, hGait = H.gait.array, hLook = H.look.array, hAct = H.act.array, hShape = H.shape.array, hDown = H.down.array, owners = H.lookOwner;
    const now = ecosystem.time;
    let hn = 0, lookFrom = this.MAX_INSTANCES;
    let ragBones = false;   // a people ragdoll wrote its bones this pass (the ragdoll texture uploads)
    const B = this.billboards, bPose = B.pose.array, bFrame = B.frame.array, bTint = B.tint.array, bWidth = B.width.array, cardOwners = B.cardOwner;
    let bn = 0, cardFrom = B.max;

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
        if (cardOwners[bn] !== a) {
          cardOwners[bn] = a;
          if (human) {
            const L = a.look;
            bTint[o] = L.skinRGB; bTint[o + 1] = L.shirt; bTint[o + 2] = L.pants; bTint[o + 3] = HUMAN_HAIR[+L.female][L.variant];
            bWidth[bn] = humanCardWidth(L);
          } else {
            bTint[o] = p.cardTints[a.sex]; bTint[o + 1] = bTint[o + 2] = bTint[o + 3] = 0;
            bWidth[bn] = 1;
          }
          if (bn < cardFrom) cardFrom = bn;
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
        // knockdown: a ragdoll's texture row and rise share when one is live (ragdollFor), else the lying pose
        this._quat.setFromAxisAngle(this._yAxis, a.facingAngle);
        this._world.set(a.position.x, originY, a.position.z);
        const rag = this.ragdollFor(a, p, now, kp, deltaTime > 0);
        if (rag) {
          hDown[o] = 0; hDown[o + 1] = 0; hDown[o + 2] = ragdollRise(a, now); hDown[o + 3] = rag.row + 1;
          rag.pose(H.ragdoll.image.data, a.position.x, originY, a.position.z, a.facingAngle);
          ragBones = true;
        } else writeHumanDown(a, now, H.lieHalf, hDown, o);
        if (owners[hn] !== a) {
          owners[hn] = a;
          const L = a.look;
          writeHumanLook(L, hLook, hShape, o);
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
      // knockdown: a ragdoll when one is live (ragdollFor), else rolled about the body's length onto the side the push
      // went, dropped by lieDrop, legs still
      const rag = this.ragdollFor(a, p, now, kp, deltaTime > 0);
      const down = rag ? 0 : downShare(a, now);
      if (down > 0) {
        const side = Math.sin(a.downYaw - a.facingAngle) < 0 ? 1 : -1;   // roll the up axis toward the push's side
        this._quat.multiply(this._quatRoll.setFromAxisAngle(this._zAxis, side * down * Math.PI / 2));
        this._world.y -= down * p.lieDrop * kp;
      }
      // a move playing (fight move or pounce; both anchor at the body centre for coyotes) takes over the legs from the
      // walk cycle; a knocked-down body plays neither
      const played = a.playing ?? p.fight, u = (now - a.moveAt) / played.moveS;
      const knocked = rag !== null || down > 0;   // lying or a ragdoll: no fight move and no walk cycle
      const move = !knocked && u >= 0 && u < 1 ? sampleFightKeys(played.keys, u, this._fightPose) : null;
      this.poseBoxRig(p, im, idx, antlers, p.aidx, kp, !move && !knocked && a.moving ? Math.sin(a.animTime) * swing * 0.5 : 0, move);
      // a ragdoll overwrites that standing pose, blending back into it over the rise
      if (rag) rag.pose(im, idx, antlers, p.aidx, this.LIMB_NAMES, ragdollRise(a, now));
      if (antlers) p.aidx++;
      p.idx = idx + 1;
    }

    H.geometry.instanceCount = hn;
    H.mesh.visible = hn > 0;
    if (hn > 0) {
      AnimalRenderer.queueUpload(H.pose, 0, hn);
      AnimalRenderer.queueUpload(H.gait, 0, hn);
      AnimalRenderer.queueUpload(H.act, 0, hn);
      AnimalRenderer.queueUpload(H.down, 0, hn);
      if (ragBones) H.ragdoll.needsUpdate = true;
      if (lookFrom < hn) {
        AnimalRenderer.queueUpload(H.look, lookFrom, hn);
        AnimalRenderer.queueUpload(H.shape, lookFrom, hn);
      }
    }
    B.geometry.instanceCount = bn;
    B.mesh.visible = bn > 0;
    if (bn > 0) {
      AnimalRenderer.queueUpload(B.pose, 0, bn);
      AnimalRenderer.queueUpload(B.frame, 0, bn);
      if (cardFrom < bn) {
        AnimalRenderer.queueUpload(B.tint, cardFrom, bn);
        AnimalRenderer.queueUpload(B.width, cardFrom, bn);
      }
    }
    // ragdolls whose animal was not drawn this pass (gone, culled, far, removed) end
    for (const [a, r] of this._ragdollOf) if (r.seen !== this._pass) this.freeRagdoll(a, r);
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
export const raysEl = document.getElementById('rays');
export const gfxEl = document.getElementById('gfx');
export const avgFpsEl = document.getElementById('avg-fps');

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
      if (renderInputs.pointerTaken(e.pointerId)) return;
      this.locked = null;
    });
    renderer.domElement.addEventListener('click', () => { if (renderInputs.locked()) this.locked = null; });
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

export const graphics = {
  high: !startLowPower,
  anchor: new THREE.Vector3(Infinity, 0, Infinity),
  sunDir: new THREE.Vector3(-0.5, 1, 0.4).normalize(),
  drawnSunDir: new THREE.Vector3(),   // sunDir when the map was last drawn
  lastRefresh: -1e9,
  force: true,
  // what the last drawn map saw of the moving casters: animals near the player, and the cat and body poses
  nearAnimals: -1,
  _casterSnaps: [new Float64Array(8).fill(NaN), new Float64Array(8).fill(NaN)],   // 64-bit: compared to positions exactly
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
    this.force = true;
    this.placeSun();
    invalidate();
  },

  // Set high or low without saving it (the loading screen's AUTO GRAPHICS pick); toggle is the player's saved choice.
  set(high) {
    if (high === this.high) return;
    this.high = high;
    // Survivor mode's average fps measures one quality setting at a time
    avgFps.reset();
    this.apply();
  },

  toggle() {
    this.set(!this.high);
    // the next load starts on this setting
    try { localStorage.setItem(GRAPHICS_KEY, this.high ? 'high' : 'low'); } catch (e) { }
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

  // Did an animal within SHADOW_ANIMAL_DIST of the player move, or did the count there change, since the last draw? `record`
  // stores the count.
  animalsChanged(record) {
    const player = renderInputs.player;
    const px = player.pos.x, pz = player.pos.z, r2 = SHADOW_ANIMAL_DIST * SHADOW_ANIMAL_DIST;
    let near = 0, moving = false;
    if (ecosystem.ready) for (const a of ecosystem.animals) {
      if (!a.alive) continue;
      const dx = a.position.x - px, dz = a.position.z - pz;
      if (dx * dx + dz * dz > r2) continue;
      near++;
      if (a.moving) moving = true;
    }
    const changed = moving || near !== this.nearAnimals;
    if (record) this.nearAnimals = near;
    return changed;
  },

  // Did the cat or the player's body (renderInputs.casters) move, turn or show or hide since the last draw? `record` stores them.
  castersChanged(record) {
    let changed = false;
    const movers = renderInputs.casters();
    for (let i = 0; i < movers.length; i++) {
      const o = movers[i], snap = this._casterSnaps[i];
      const vis = o && o.visible ? 1 : 0;
      const p = o ? o.position : null, q = o ? o.quaternion : null;
      if (record) {
        snap[0] = vis;
        if (vis) { snap[1] = p.x; snap[2] = p.y; snap[3] = p.z; snap[4] = q.x; snap[5] = q.y; snap[6] = q.z; snap[7] = q.w; }
      } else if (snap[0] !== vis || (vis && (snap[1] !== p.x || snap[2] !== p.y || snap[3] !== p.z ||
        snap[4] !== q.x || snap[5] !== q.y || snap[6] !== q.z || snap[7] !== q.w))) changed = true;
    }
    return changed;
  },

  update(now) {
    if (!renderer.shadowMap.enabled) return;
    // sun below the horizon: it lights nothing, so the map is not drawn; redraw as soon as it is back
    if (sun.intensity <= 0) { this.force = true; return; }
    // where the box centre should be: SHADOW_AHEAD in front of the player, at the feet
    const player = renderInputs.player;
    const aim = this._aim.set(player.pos.x - Math.sin(player.yaw) * SHADOW_AHEAD, player.pos.y - EYE_HEIGHT,
      player.pos.z - Math.cos(player.yaw) * SHADOW_AHEAD);
    const dx = aim.x - this.anchor.x, dz = aim.z - this.anchor.z;
    const moved = !(dx * dx + dz * dz <= SHADOW_FOLLOW_STEP * SHADOW_FOLLOW_STEP);
    // the cat and the player's body redraw the map on every frame they moved, so their shadows keep up with them; the
    // crowd's animals (each moving every tick) redraw it at most SHADOW_ANIMAL_HZ times a second
    const due = this.force || moved || this.castersChanged(false) ||
      (now - this.lastRefresh >= 1000 / SHADOW_ANIMAL_HZ && this.animalsChanged(false));
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
    this.animalsChanged(true);
    this.castersChanged(true);
    this.drawnSunDir.copy(this.sunDir);
    this.lastRefresh = now;
    this.force = false;
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
    // the player's own blob: its own mesh on the same plane and material, so it can follow the body every frame while the
    // crowd's instances update once per NPC tick
    this.playerMesh = new THREE.Mesh(geo, this.material);
    this.playerMesh.matrixAutoUpdate = false;
    this.playerMesh.visible = false;
    this.playerMesh.frustumCulled = false;
    scene.add(this.playerMesh);
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
    this.hidePlayer();
  }

  hidePlayer() {
    this.playerMesh.visible = false;
  }

  // The share of full blob strength the light gives (0 with no world or no sun), set as the shared material's opacity.
  applyLight() {
    const light = providers.active ? Math.min(1, sun.intensity / BLOB_FULL_SUN) : 0;
    this.material.opacity = BLOB_OPACITY * light;
    return light;
  }

  // Into this._m: a blob under feet (x, feetY, z), turned to face `facing`, for a body of this footprint drawn at kp metres
  // per rig unit. Shared by the crowd and the player, so the spread and the lift are set in one place.
  compose(x, feetY, z, facing, foot, kp) {
    const k = kp * BLOB_SPREAD;
    this._p.set(x, feetY + BLOB_LIFT, z);
    this._q.setFromAxisAngle(this._y, facing);
    this._s.set(foot.x * k, 1, foot.z * k);
    this._m.compose(this._p, this._q, this._s);
  }

  // The player's blob, called every frame with the body's feet, facing and size (kp as the body is drawn).
  placePlayer(x, feetY, z, facing, kp) {
    if (this.applyLight() <= 0) { this.hidePlayer(); return; }
    this.compose(x, feetY, z, facing, this.foot.human, kp);
    this.playerMesh.matrix.copy(this._m);
    this.playerMesh.matrixWorldNeedsUpdate = true;
    this.playerMesh.visible = true;
  }

  update(animals) {
    if (this.applyLight() <= 0) { this.hide(); return; }
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
      const kp = (GROWTH_MIN_SCALE + (1 - GROWTH_MIN_SCALE) * age) * NPC_UNIT * hs;
      this.compose(a.position.x, a.position.y - a.footLift() * NPC_UNIT, a.position.z, a.facingAngle, this.foot[a.type], kp);
      mesh.setMatrixAt(n++, this._m);
    }
    perf.instances(mesh, n);
  }
}
export const blobShadows = new BlobShadows();
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

const STAT_LABEL_MAX = 100;   // top of the whole-number scale shown for each stat
const BAR_PAD = 4;            // canvas px between the panel's edges and its rows
const PERSON_ROWS = 3;        // panel rows for people: stats, body, info (others get the stat row only)
const STAT_PART_GAP = 0.15;   // space between a stat's icon, number and arrow, as a share of the font px
const STAT_ARROWED = [false, true, true, true];   // per stat, whether it can show a memory arrow (health never does); those cells keep room for one
// the panel's three fonts, all at the one px a draw picks
const FIELD_FONT = px => `${px}px sans-serif`;
const STAT_FONT = px => `bold ${px}px sans-serif`;
const ICON_FONT = px => `${px}px ${EMOJI_FONT}`;

export class HealthBars {
  constructor() {
    this.bars = new Map();
    this.spare = [];
    this.seen = new Set();

    // FAR PANELS: each far person's panel is the near canvas drawn at FAR_PANEL_SCALE into a cell of an atlas page.
    this.cellW = Math.ceil(BAR_CANVAS_W * FAR_PANEL_SCALE);
    this.cellH = Math.ceil(BAR_SPRITE_CANVAS_H * FAR_PANEL_SCALE);
    this.pageCols = Math.floor(FAR_PAGE_PX / (this.cellW + 2 * FAR_CELL_GUTTER));
    this.pageCells = this.pageCols * Math.floor(FAR_PAGE_PX / (this.cellH + 2 * FAR_CELL_GUTTER));
    this.farPanelGeo = new THREE.PlaneGeometry(BAR_W_M, BAR_H_M);
    this.farPanelGeo.translate(0, BAR_H_M / 2, 0);   // anchored at its bottom centre, like the near sprite
    this.pages = [];
    this.farCells = new Map();   // far person -> the atlas cell holding their panel
    this.freeCells = [];
    this.addPage();              // the first page is made at load so the load's compileAsync builds its shader

    const c = new THREE.Color();

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
    for (const page of this.pages) perf.instances(page.mesh, 0);
    perf.instances(this.farLobes, 0);
  }

  firing(act) {
    let n = 0;
    for (let i = 0; i < act.length; i++) if (act[i] >= 1.0) n++;
    return n / act.length;
  }

  // A new atlas page: its canvas and texture, and an instanced mesh whose instances each show one of its cells.
  addPage() {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = FAR_PAGE_PX;
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    const geo = this.farPanelGeo.clone();
    const cellUv = new THREE.InstancedBufferAttribute(new Float32Array(this.pageCells * 2), 2);   // per instance: its cell's bottom-left uv
    cellUv.setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('cellUv', cellUv);
    const mat = new THREE.ShaderMaterial({
      uniforms: {
        map: { value: tex },
        cellSize: { value: new THREE.Vector2(this.cellW / FAR_PAGE_PX, this.cellH / FAR_PAGE_PX) }
      },
      transparent: true,
      depthWrite: false,
      vertexShader: `
        attribute vec2 cellUv;
        uniform vec2 cellSize;
        varying vec2 vUv;
        void main() {
          vUv = cellUv + uv * cellSize;
          gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0);
        }`,
      fragmentShader: `
        uniform sampler2D map;
        varying vec2 vUv;
        void main() {
          gl_FragColor = texture2D(map, vUv);
          #include <colorspace_fragment>
        }`
    });
    const mesh = new THREE.InstancedMesh(geo, mat, this.pageCells);
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.frustumCulled = false;
    mesh.renderOrder = 2;   // same as the near sprites
    mesh.count = 0;
    mesh.visible = false;
    scene.add(mesh);
    const page = { canvas, ctx: canvas.getContext('2d'), tex, mesh, cellUv, used: 0, n: 0 };   // used: cells handed out; n: instances this frame
    this.pages.push(page);
    return page;
  }

  // An atlas cell for a far panel: a freed one, else the next one on the last page (a new page when that is full).
  // Its x, y and scale place the near canvas's coordinates in the cell, so draw() paints it unchanged.
  takeCell() {
    if (this.freeCells.length) return this.freeCells.pop();
    let page = this.pages[this.pages.length - 1];
    if (page.used === this.pageCells) page = this.addPage();
    const i = page.used++;
    const x = (i % this.pageCols) * (this.cellW + 2 * FAR_CELL_GUTTER) + FAR_CELL_GUTTER;
    const y = Math.floor(i / this.pageCols) * (this.cellH + 2 * FAR_CELL_GUTTER) + FAR_CELL_GUTTER;
    return {
      page, ctx: page.ctx, tex: page.tex, scale: FAR_PANEL_SCALE, x, y,
      u: x / FAR_PAGE_PX, v: 1 - (y + this.cellH) / FAR_PAGE_PX,   // canvas textures are flipped, so v counts up from the page bottom
      key: -1, infoKey: -1, tick: 0
    };
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
      sprite, canvas, ctx: canvas.getContext('2d'), tex, scale: 1, x: 0, y: 0, key: -1, infoKey: -1,
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

  // Height of the brain's centre for a panel whose sprite bottom is at barY: it sits BRAIN_ABOVE over the panel's top.
  brainY(barY, info) {
    return barY + (BAR_SPRITE_CANVAS_H - this.panelTop(info)) * BAR_PX + BRAIN_ABOVE + BRAIN_HALF_H * BRAIN_SCALE;
  }

  // The panel's inputs for a: stat fullness in whole BAR_STEPS (rounded down) and memory arrow headings (-1 for none).
  readStats(a, now, vals, arrows) {
    const q = v => Math.floor(Math.max(0, Math.min(1, v)) * BAR_STEPS);
    vals[0] = q(a.health / a.maxHealth);
    vals[1] = q(1 - Math.min(a.foodNeed, 100) / 100);
    vals[2] = q(1 - Math.min(a.waterNeed, 100) / 100);
    vals[3] = q(a.mateFill(now));
    arrows[1] = this.heading(a, a.hasFood, a.rayFoodSin, a.rayFoodCos);
    arrows[2] = this.heading(a, a.hasWater, a.rayWaterSin, a.rayWaterCos);
    arrows[3] = this.heading(a, a.hasMate, a.rayMateSin, a.rayMateCos);
  }

  // People only (0 for others): age code (-1 child, else whole years), shown height in inches, weight in lb.
  infoKey(a) {
    if (a.type !== 'human') return 0;
    const growth = a.isAdult ? 1 : Math.min(1, (ecosystem.ticks - a.birthTick) / NPC_MATURITY_TICKS);
    const s = GROWTH_MIN_SCALE + (1 - GROWTH_MIN_SCALE) * growth;
    const metres = a.heightScale * NPC_RIG_TOP.human * NPC_UNIT * s;   // crown height as drawn
    const age = a.isAdult ? Math.floor(a.ageYears()) : -1;
    return personInfoKey(age, a.sex, a.look, metres);
  }

  infoFields(a, key) {
    return [`Gen ${a.generation}`, ...personInfoFields(key, a.sex)];
  }

  bodyFields(a, key) {
    return personBodyFields(key, a.sex, a.look);
  }

  // Panel bounds in canvas px. People's panel runs to the canvas bottom, others' to the bottom of the bars area;
  // it holds its rows plus BAR_PAD above and below. Brains, near and far, sit on panelTop (brainY).
  panelBottom(info) {
    return info ? BAR_SPRITE_CANVAS_H : BAR_CANVAS_H;
  }

  panelTop(info) {
    return this.panelBottom(info) - (info ? PERSON_ROWS : 1) * BAR_ROW_H - 2 * BAR_PAD;
  }

  // Item widths of a row at font px: text fields, or the stat cells (icon, room for the widest number, arrow room).
  fieldWidths(ctx, fields, px) {
    ctx.font = FIELD_FONT(px);
    return fields.map(f => ctx.measureText(f).width);
  }

  statWidths(ctx, px) {
    ctx.font = STAT_FONT(px);
    const numberW = ctx.measureText(String(STAT_LABEL_MAX)).width, gap = px * STAT_PART_GAP;
    ctx.font = ICON_FONT(px);
    return BAR_ICONS.map((icon, i) => ctx.measureText(icon).width + gap + numberW + (STAT_ARROWED[i] ? gap + px : 0));
  }

  // Largest font px, up to BAR_TEXT_FONT, at which a row measured at BAR_TEXT_FONT fits the width with its least
  // gaps (text width scales with px).
  fitPx(widths) {
    let sum = 0;
    for (const w of widths) sum += w;
    const room = BAR_CANVAS_W - 2 * BAR_PAD - BAR_ROW_GAP * (widths.length - 1);
    return Math.min(BAR_TEXT_FONT, Math.floor(BAR_TEXT_FONT * room / sum));
  }

  // Left x of each item of a row spread across the width: first and last at the pads, equal gaps between.
  spreadX(widths) {
    let sum = 0;
    for (const w of widths) sum += w;
    const gap = (BAR_CANVAS_W - 2 * BAR_PAD - sum) / (widths.length - 1);
    const xs = [];
    let x = BAR_PAD;
    for (const w of widths) { xs.push(x); x += w + gap; }
    return xs;
  }

  // One row of text fields spread across the width, centered at rowCy.
  fieldRow(ctx, fields, rowCy, px) {
    const xs = this.spreadX(this.fieldWidths(ctx, fields, px));   // leaves ctx.font at FIELD_FONT(px)
    ctx.fillStyle = 'rgba(232, 228, 220, 0.95)';
    ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    for (let i = 0; i < fields.length; i++) ctx.fillText(fields[i], xs[i], rowCy);
  }

  // The stat row spread across the width like the field rows: per stat its icon, its number centered in room
  // for the widest number, then its arrow when it has one.
  statRow(ctx, vals, arrows, rowCy, px) {
    const xs = this.spreadX(this.statWidths(ctx, px)), gap = px * STAT_PART_GAP;
    ctx.font = STAT_FONT(px);
    const numberW = ctx.measureText(String(STAT_LABEL_MAX)).width;
    ctx.textBaseline = 'middle';
    for (let i = 0; i < BAR_ICONS.length; i++) {
      ctx.font = ICON_FONT(px);
      ctx.textAlign = 'left';
      ctx.fillText(BAR_ICONS[i], xs[i], rowCy);
      const numberX = xs[i] + ctx.measureText(BAR_ICONS[i]).width + gap;
      ctx.font = STAT_FONT(px);
      ctx.textAlign = 'center';
      ctx.fillStyle = BAR_COLORS[i];
      ctx.fillText(String(Math.round(vals[i] / BAR_STEPS * STAT_LABEL_MAX)), numberX + numberW / 2, rowCy);   // stat as a whole number, 0 to STAT_LABEL_MAX
      if (arrows[i] >= 0) this.arrow(ctx, numberX + numberW + gap + px / 2, rowCy, px, arrows[i], BAR_COLORS[i]);
    }
  }

  draw(slot, vals, arrows, a) {
    // packed integer key, no allocation per person per tick; exact in a double
    const V = BAR_STEPS + 1, A = ARROW_STEPS + 1;
    const key = ((((((vals[0] * V + vals[1]) * V + vals[2]) * V + vals[3])
      * A + arrows[1] + 1) * A + arrows[2] + 1) * A + arrows[3] + 1);
    const info = this.infoKey(a);
    if (slot.key === key && slot.infoKey === info) return false;
    slot.key = key;
    slot.infoKey = info;
    const { ctx } = slot;
    ctx.setTransform(slot.scale, 0, 0, slot.scale, slot.x, slot.y);   // near: its own canvas; far: its atlas cell
    const body = info ? this.bodyFields(a, info) : null;      // fat, muscle, body type
    const details = info ? this.infoFields(a, info) : null;   // gen, age, sex, height, weight
    // one font px for the whole panel: the largest at which every row fits
    let px = this.fitPx(this.statWidths(ctx, BAR_TEXT_FONT));
    if (info) px = Math.min(px, this.fitPx(this.fieldWidths(ctx, body, BAR_TEXT_FONT)), this.fitPx(this.fieldWidths(ctx, details, BAR_TEXT_FONT)));
    const panelTop = this.panelTop(info);
    const rowCy = r => panelTop + BAR_PAD + (r + 0.5) * BAR_ROW_H;   // vertical center of panel row r, 0 at the top
    ctx.clearRect(0, 0, BAR_CANVAS_W, BAR_SPRITE_CANVAS_H);
    ctx.fillStyle = 'rgba(12, 15, 21, 0.7)';
    ctx.fillRect(0, panelTop, BAR_CANVAS_W, this.panelBottom(info) - panelTop);
    this.statRow(ctx, vals, arrows, rowCy(0), px);
    if (info) {
      this.fieldRow(ctx, body, rowCy(1), px);
      this.fieldRow(ctx, details, rowCy(2), px);
    }
    slot.tex.needsUpdate = true;
    return true;
  }

  // Near slots are taken up close and returned after BAR_RELEASE_TICKS away, so they track the nearby crowd.
  // Far people get an atlas cell for as long as they are drawn far.
  update(animals) {
    if (!this.enabled) return;
    const tick = ++this.tick;
    const spin = performance.now() / 1000 * BRAIN_SPIN;
    const now = ecosystem.time;
    const vals = [0, 0, 0, 0], arrows = [-1, -1, -1, -1];
    const seen = this.seen;
    seen.clear();

    updateNpcFrustum();
    const cam = viewPos, cq = viewQuat;
    this._right.set(1, 0, 0).applyQuaternion(cq);
    this._up.set(0, 1, 0).applyQuaternion(cq);
    const lod2 = perf.npcLodDist * perf.npcLodDist, farMax2 = perf.farStatDist * perf.farStatDist;
    const lobeOff = 1.1 * BRAIN_SCALE;
    let nf = 0;
    let nl = 0;
    let redraws = 0;   // far panels painted this frame, up to FAR_REDRAW_MAX
    for (const page of this.pages) page.n = 0;

    const qx = cq.x, qy = cq.y, qz = cq.z, qw = cq.w;
    const x2 = qx + qx, y2 = qy + qy, z2 = qz + qz;
    const xx = qx * x2, xy = qx * y2, xz = qx * z2, yy = qy * y2, yz = qy * z2, zz = qz * z2;
    const wx = qw * x2, wy = qw * y2, wz = qw * z2;
    const r0 = 1 - (yy + zz), r1 = xy + wz, r2 = xz - wy;
    const r4 = xy - wz, r5 = 1 - (xx + zz), r6 = yz + wx;
    const r8 = xz + wy, r9 = yz - wx, r10 = 1 - (xx + yy);
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

        let cell = this.farCells.get(a);
        if (!cell) { cell = this.takeCell(); this.farCells.set(a, cell); }
        cell.tick = tick;
        this.readStats(a, now, vals, arrows);
        if (redraws < FAR_REDRAW_MAX && this.draw(cell, vals, arrows, a)) redraws++;
        if (cell.key !== -1) {   // a cell not painted yet waits for a frame with redraws to spare
          const page = cell.page, k = page.n++, o = k * 16, arr = page.mesh.instanceMatrix.array;
          // the camera's rotation, so the panel faces the viewer like the near sprite
          arr[o] = r0; arr[o + 1] = r1; arr[o + 2] = r2; arr[o + 3] = 0;
          arr[o + 4] = r4; arr[o + 5] = r5; arr[o + 6] = r6; arr[o + 7] = 0;
          arr[o + 8] = r8; arr[o + 9] = r9; arr[o + 10] = r10; arr[o + 11] = 0;
          arr[o + 12] = a.position.x; arr[o + 13] = barY; arr[o + 14] = a.position.z; arr[o + 15] = 1;
          page.cellUv.array[k * 2] = cell.u;
          page.cellUv.array[k * 2 + 1] = cell.v;
        }

        const nn = a.brain;
        if (nn) {
          const by = this.brainY(barY, cell.infoKey);
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

      this.readStats(a, now, vals, arrows);
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
      b.group.position.set(a.position.x, this.brainY(barY, bar.infoKey), a.position.z);
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

    // far cells not drawn this frame go back to the free list (repainted before they are shown again)
    for (const [a, cell] of this.farCells) {
      if (cell.tick === tick) continue;
      this.farCells.delete(a);
      cell.key = -1;
      this.freeCells.push(cell);
    }
    for (const page of this.pages) {
      perf.instances(page.mesh, page.n);
      if (page.n) page.cellUv.needsUpdate = true;
    }
    perf.instances(this.farLobes, nl * 2);
    perf.instanceColors(this.farLobes, nl * 2);
  }
}

export const healthBars = new HealthBars();

// The Observer presets the settings chips pick ('Game': the game's own clock and weather).
export const skyChoice = {
  time: 'Game',
  sky: 'Game'
};

// Survivor mode ignores the presets (their pickers are hidden there)
export function timeMode() { return renderInputs.survivor() ? 'Game' : skyChoice.time; }
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
  const preset = renderInputs.survivor() ? null : SKIES[skyChoice.sky];
  if (preset) return preset;
  return simSky.on ? simSky.conditions() : null;
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
  // the windows' own dusk ramp over FACADE_LIGHTS_DEG (0 in daylight, 1 once dark); by day a quarter of the evening's
  // lights stay on
  const [litFrom, litFull] = FACADE_LIGHTS_DEG;
  const dark = Math.max(Math.min(Math.max((litFrom - s.altDeg) / (litFrom - litFull), 0), 1), 0.25);
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
  const player = renderInputs.player;
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
  parts.push(`${fmt(ecosystem.plants.length)} plants`, `day ${simSky.day}`);
  return parts.join(', ');
}