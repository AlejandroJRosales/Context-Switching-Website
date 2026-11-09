// 7b-sim.js: SIM, artificial life and the game clock (Animal, Plant, Ecosystem, simSky). May import 1-config.js to
// 6-worlds.js, 7a-ml.js and three. Never calls render, player or main; they read its state and fill its hooks.
import * as THREE from 'three';
import {
  RUN_SPEED, STEP_UP, NPC_TICK_S, DIET_WATER_SHARE, PLANT_SIGHT_CELL, NPC_CONTACT_CELL, DEER_CRUISE, DEER_THINK_TICKS,
  DEER_SPRINT_DIST, DEER_SPRINT_OVER, DEER_SPRINT_ENERGY, NPC_SUBSTEP, DEER_EXPLORE_P, NPC_ATTACK_COOLDOWN_S,
  NPC_ATTACK_DAMAGE_PER_S, NPC_BITE_COOLDOWN_S, NPC_HIT_NO_EAT_S, PLANT_MAX_HEALTH, PLANT_BITE_NUTRITION,
  NPC_FIGHT_DAMAGE_PER_S, NPC_FIGHT_REF_STRENGTH, NPC_REF_BODY_FAT, fightMassShare, NPC_ANIMAL_FIGHT_SHARE,
  NPC_PACE_LEAN_EXP, NPC_PACE_LIMITS, bodyJumpSpeed, NPC_FIGHT_HOLD_PAD_S, NPC_FIGHT_MOVES, NIGHT_SUN_ALT_DEG,
  PREY_SIZE_STEP_KG, NPC_POUNCES, POUNCE_LAND_SHORT, FIGHT_KEY_FIELDS, NPC_AGE_DEPLETION_RATE, DEER_REPRO_SHARE,
  MATE_TIME_MULT, REPRO_NEED_MAX, NPC_MATURITY_TICKS, GROWTH_MIN_SCALE, NPC_ADULT_AGE, NPC_TICKS_PER_YEAR,
  NPC_START_AGE, HUMAN_TURN_RATE, NPC_UNIT, NPC_RADIUS, NPC_COLLIDE_H, NPC_SPAWN_GAP, NPC_SIZE, NPC_SIZE_Z_MAX,
  NPC_SIZE_HERITABILITY, NPC_REF_BMI, NPC_REF_MASS_KG, NPC_BUILD_BASE, NPC_BUILD_BASE_MEAN, NPC_WIDTH_LIMITS,
  NPC_GIRTH_STEPS, NPC_TORSO_REGIONS, NPC_BODY_SHAPE,
  NPC_SOMATOTYPES, LB_PER_KG, M_PER_IN, NPC_RATING_SPREAD, NPC_RATING_LIMITS, NPC_BODY_FAT_LIMITS, NPC_LEAN_INDEX_BASE, NPC_LEAN_REF_RATING,
  NPC_LEAN_PER_MESO, NPC_LEAN_PER_ECTO, NPC_BODY_TYPE_HERITABILITY, NPC_BODY_HERITABILITY, NPC_BODY_TRAITS, NPC_BODY_POP, SPECIES, NPC_TYPE_IDS, NPC_TYPE_COUNT, HUNTS_MASK,
  HUNTED_BY_MASK, NIGHT_PREY_MASK, HUNTS_LIST, FOOD_TYPE_ID, WATER_SIGHT_CELL, HUMAN_FACE_VARIANTS,
  HUMAN_OUTFITS, HUMAN_SKIN, HUMAN_SHIRTS, HUMAN_PANTS, HUMAN_SUITS, CAR_GLANCE, CAR_ALIGN, FALLBACK_HOURS, SKIES,
  NPC_DRINK_SECONDS, DAY_S, NPC_HIT_ACCEL_MS2, NPC_HOLD_ACCEL_MS2, NPC_DOWN_MIN_S, NPC_DOWN_S_PER_EXCESS, NPC_DOWN_MAX_S,
  NPC_NEED_FULL, REGEN_MIN_SHARE, REGEN_COST_SHARE, NPC_FALL_S, NPC_GETUP_S, NPC_BUMP_DIST, NPC_BUMP_CONTACT_S, BUMP_RESTITUTION, BUMP_SAFE_J,
  BUMP_HEALTH_PER_J, CORPSE_S, CORPSE_MAX, HUMAN_RIG, HUMAN_ARM_FLARE, RAGDOLL_G, RAGDOLL_DAMP, RAGDOLL_ITERS,
  RAGDOLL_FRICTION, RAGDOLL_MAX_DV, RAGDOLL_TOP_SHARE, RAGDOLL_BASE_SHARE, FALL_SETTLE_MS, FALL_SETTLE_S
} from './1-config.js';
import {
  cellKey, fightEase, fightClamp01, TWO_PI, wrapAngle, turnToward, SpatialGrid, ContactGrid, tools
} from './2-core.js';
import {
  scene
} from './3-gfx-io.js';
import {
  providers, baseAt, surfaceY, surfaceFor
} from './4-provider.js';
import {
  collision, resolveCollisions, cover, occ, shellAt, isOpen
} from './5-collision.js';
import {
  foodBoxes
} from './6-worlds.js';
import {
  brains, SpikingNetwork
} from './7a-ml.js';

// Fight state for animals and the avatar: the playing move, moveSide, and the hold (fightFrom, fightUntil).
export function startFightMove(f, move, now) {
  if (now - f.moveAt >= (f.playing ?? move).moveS) { f.moveAt = now; f.playing = move; f.moveSide = -f.moveSide; }
  if (now >= f.fightUntil) f.fightFrom = now;
  const holdS = move.flees ? move.moveS : Math.max(move.moveS, NPC_ATTACK_COOLDOWN_S + NPC_FIGHT_HOLD_PAD_S);
  f.fightUntil = Math.max(f.fightUntil, now + holdS);
}

// A person's iAct at `now`: punch reach, punching arm, guard share, unused.
export function humanFightAct(f, now, out, o) {
  const m = NPC_FIGHT_MOVES.human, u = (now - f.moveAt) / m.moveS;
  out[o] = u >= 0 && u < 1 ? (u < m.peak ? fightEase(u / m.peak) : 1 - fightEase((u - m.peak) / (1 - m.peak))) : 0;
  out[o + 1] = f.moveSide;
  out[o + 2] = fightClamp01((f.fightUntil - now) / m.guardEaseS) * fightClamp01((now - f.fightFrom) / m.guardEaseS);
  out[o + 3] = 0;
}
// KNOCKDOWNS: condition is health share x energy share.
export function conditionShare(health, maxHealth, foodNeed, waterNeed) {
  const healthShare = fightClamp01(health / maxHealth);
  const energyShare = 1 - fightClamp01(Math.max(foodNeed, waterNeed) / NPC_NEED_FULL);
  return healthShare * energyShare;
}
// REGEN, one step for any body with health, foodNeed and waterNeed (an animal, the player's game): with food and water
// both at least REGEN_MIN_SHARE full, the health bar refills at fillSharePerS (the body's drink rate, bar share per
// second) and each need bar drops REGEN_COST_SHARE of the share healed. Needs run 0 (full) to needFull (empty).
export function regenStep(body, maxHealth, needFull, fillSharePerS, dt) {
  const maxNeed = needFull * (1 - REGEN_MIN_SHARE);   // the most need that still heals
  if (body.foodNeed > maxNeed || body.waterNeed > maxNeed) return;
  const healed = Math.min(fillSharePerS * dt * maxHealth, maxHealth - body.health);   // health points
  if (!(healed > 0)) return;
  const cost = healed / maxHealth * REGEN_COST_SHARE * needFull;   // need added to each bar
  body.health += healed;
  body.foodNeed = Math.min(needFull, body.foodNeed + cost);
  body.waterNeed = Math.min(needFull, body.waterNeed + cost);
}
// Drawn knockdown share at `now`, 0 standing to 1 lying.
export function downShare(a, now) {
  if (now >= a.downUntil) return 0;
  return fightEase(fightClamp01((now - a.downAt) / NPC_FALL_S)) * fightEase(fightClamp01((a.downUntil - now) / NPC_GETUP_S));
}
// FALLS (with ragdolls on, Ecosystem.stepFalls): the physical body of a knocked-down or dead animal, stepped by the sim at
// every distance; the animal is where its body is, so the drawn body, the stats panel and the sim agree. VerletBody:
// particles, distance links, one-way hinges, ground, friction and the car's box (Ecosystem.fallBox). BoxFall and
// HumanFall lay out their rigs. The renderer poses meshes from these particles; the player's ragdoll is a HumanFall the
// renderer steps (AnimalRenderer.bodyDown).
export class VerletBody {
  // n particles; links [a, b, aShare, bShare]; radii in rig units; anchors, the particles whose centre is the animal's
  // place; hinges as solveHinge. Flat typed arrays.
  constructor(n, links, radii, anchors, hinges = []) {
    this.n = n; this.radii = radii; this.anchors = anchors;
    this.nLinks = links.length;
    this.la = Int32Array.from(links, l => l[0] * 3);
    this.lb = Int32Array.from(links, l => l[1] * 3);
    this.sa = Float64Array.from(links, l => l[2]);
    this.sb = Float64Array.from(links, l => l[3]);
    this.nHinges = hinges.length;
    this.hParent = Int32Array.from(hinges, h => h[0] * 3);
    this.hJoint = Int32Array.from(hinges, h => h[1] * 3);
    this.hChild = Int32Array.from(hinges, h => h[2] * 3);
    this.hAxisFrom = Int32Array.from(hinges, h => h[3] * 3);
    this.hAxisTo = Int32Array.from(hinges, h => h[4] * 3);
    this.hMin = Float64Array.from(hinges, h => h[5]);
    this.hMax = Float64Array.from(hinges, h => h[6]);
    this.hAxis = new Float64Array(hinges.length * 3);   // last good hinge axes
    this.pos = new Float64Array(n * 3);    // particles now
    this.prev = new Float64Array(n * 3);   // last step's particles (velocity)
    this.len = new Float64Array(links.length);   // link lengths as placed
    this.floor = new Float64Array(n);      // lowest height per particle
    this.kp = 0; this.ground = 0;
    this.boundX = 0; this.boundY = 0; this.boundZ = 0; this.boundR = 0;   // bounding sphere
    this.cx = 0; this.cz = 0;              // anchors' centre (anchorCentre)
  }

  // Place particle i at v, launched by (lx, lz) per step.
  place(i, v, lx, lz) {
    const o = i * 3, pos = this.pos, prev = this.prev;
    pos[o] = v.x; pos[o + 1] = v.y; pos[o + 2] = v.z;
    prev[o] = v.x - lx; prev[o + 1] = v.y; prev[o + 2] = v.z - lz;
  }

  // After place(): links keep their starting lengths. kp: metres per rig unit.
  begin(kp, ground) {
    this.kp = kp; this.ground = ground;
    for (let k = 0; k < this.nLinks; k++) this.len[k] = this.dist(this.la[k] / 3, this.lb[k] / 3);
    for (let i = 0; i < this.n; i++) this.floor[i] = ground + this.radii[i] * kp;
    // seed hinge fallback axes from the placed pose
    for (let k = 0, o = 0; k < this.nHinges; k++, o += 3) {
      const p = this.pos, a = this.hAxisFrom[k], b = this.hAxisTo[k];
      const ax = p[a] - p[b], ay = p[a + 1] - p[b + 1], az = p[a + 2] - p[b + 2], al = Math.sqrt(ax * ax + ay * ay + az * az) || 1;
      this.hAxis[o] = ax / al; this.hAxis[o + 1] = ay / al; this.hAxis[o + 2] = az / al;
    }
    this.fitBounds();
  }

  // The body's bounding sphere now, for the view cull and the box wake check.
  fitBounds() {
    const pos = this.pos, n = this.n, kp = this.kp;
    let cx = 0, cy = 0, cz = 0;
    for (let o = 0; o < n * 3; o += 3) { cx += pos[o]; cy += pos[o + 1]; cz += pos[o + 2]; }
    cx /= n; cy /= n; cz /= n;
    let rMax = 0;
    for (let i = 0, o = 0; i < n; i++, o += 3) {
      const dx = pos[o] - cx, dy = pos[o + 1] - cy, dz = pos[o + 2] - cz, r = Math.sqrt(dx * dx + dy * dy + dz * dz) + this.radii[i] * kp;
      if (r > rMax) rMax = r;
    }
    this.boundX = cx; this.boundY = cy; this.boundZ = cz; this.boundR = rMax;
  }

  dist(i, j) {
    const p = this.pos, a = i * 3, b = j * 3, dx = p[b] - p[a], dy = p[b + 1] - p[a + 1], dz = p[b + 2] - p[a + 2];
    return Math.sqrt(dx * dx + dy * dy + dz * dz);
  }

  // One sim tick: damping, gravity, links, hinges, ground, car box.
  step(box) {
    const pos = this.pos, prev = this.prev, h = NPC_TICK_S, n3 = this.n * 3, fall = RAGDOLL_G * h * h;
    for (let o = 0; o < n3; o++) {
      const v = (pos[o] - prev[o]) * RAGDOLL_DAMP;
      prev[o] = pos[o];
      pos[o] += v;
    }
    for (let o = 1; o < n3; o += 3) pos[o] -= fall;
    const la = this.la, lb = this.lb, sa = this.sa, sb = this.sb, len = this.len, floor = this.floor, nLinks = this.nLinks;
    for (let it = 0; it < RAGDOLL_ITERS; it++) {
      for (let k = 0; k < nLinks; k++) {
        const a = la[k], b = lb[k];
        const dx = pos[b] - pos[a], dy = pos[b + 1] - pos[a + 1], dz = pos[b + 2] - pos[a + 2];
        const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
        if (d < 1e-9) continue;
        const f = (d - len[k]) / d, fa = f * sa[k], fb = f * sb[k];
        pos[a] += dx * fa; pos[a + 1] += dy * fa; pos[a + 2] += dz * fa;
        pos[b] -= dx * fb; pos[b + 1] -= dy * fb; pos[b + 2] -= dz * fb;
      }
      for (let k = 0; k < this.nHinges; k++) this.solveHinge(k);
      const last = it === RAGDOLL_ITERS - 1;
      for (let i = 0, o = 0; i < this.n; i++, o += 3) {
        if (pos[o + 1] >= floor[i]) continue;
        pos[o + 1] = floor[i];
        if (last) {
          prev[o] += (pos[o] - prev[o]) * RAGDOLL_FRICTION;
          prev[o + 2] += (pos[o + 2] - prev[o + 2]) * RAGDOLL_FRICTION;
        }
      }
      if (box) for (let i = 0; i < this.n; i++) this.outOfBox(i, box);
    }
    this.fitBounds();
  }

  // The player's ragdoll only: the anchors' centre pulled toward (ax, az) at perS share per second, speed kept.
  pullToward(ax, az, perS) {
    this.anchorCentre();
    const pull = Math.min(1, perS * NPC_TICK_S);
    this.translate((ax - this.cx) * pull, (az - this.cz) * pull);
    this.fitBounds();
  }

  // Hinge k: the child segment turns from the parent's line only about the hinge axis, within [minRad, maxRad].
  // Near-parallel, the last good axis is kept.
  solveHinge(k) {
    const pos = this.pos, p = this.hParent[k], j = this.hJoint[k], c = this.hChild[k], h3 = k * 3, last = this.hAxis;
    // u: parent direction
    let ux = pos[j] - pos[p], uy = pos[j + 1] - pos[p + 1], uz = pos[j + 2] - pos[p + 2];
    const ul = Math.sqrt(ux * ux + uy * uy + uz * uz);
    if (ul < 1e-9) return;
    ux /= ul; uy /= ul; uz /= ul;
    // A: hinge axis, or the last good one
    const f = this.hAxisFrom[k], t = this.hAxisTo[k];
    let ax = pos[f] - pos[t], ay = pos[f + 1] - pos[t + 1], az = pos[f + 2] - pos[t + 2];
    const rawLen = Math.sqrt(ax * ax + ay * ay + az * az);
    let along = ax * ux + ay * uy + az * uz;
    ax -= along * ux; ay -= along * uy; az -= along * uz;
    let al = Math.sqrt(ax * ax + ay * ay + az * az);
    const axisFromPair = al >= HUMAN_RAG_HINGE_MIN_AXIS * rawLen;   // true: the pair gives the axis
    if (!axisFromPair) {
      ax = last[h3]; ay = last[h3 + 1]; az = last[h3 + 2];
      along = ax * ux + ay * uy + az * uz;
      ax -= along * ux; ay -= along * uy; az -= along * uz;
      al = Math.sqrt(ax * ax + ay * ay + az * az);
      if (al < 1e-6) return;
    }
    ax /= al; ay /= al; az /= al;
    if (axisFromPair) { last[h3] = ax; last[h3 + 1] = ay; last[h3 + 2] = az; }
    // w = A x u
    const wx = ay * uz - az * uy, wy = az * ux - ax * uz, wz = ax * uy - ay * ux;
    // v: child segment; its angle clamped
    const vx = pos[c] - pos[j], vy = pos[c + 1] - pos[j + 1], vz = pos[c + 2] - pos[j + 2];
    const vl = Math.sqrt(vx * vx + vy * vy + vz * vz);
    if (vl < 1e-9) return;
    const angle = Math.atan2(vx * wx + vy * wy + vz * wz, vx * ux + vy * uy + vz * uz);
    const clamped = Math.min(this.hMax[k], Math.max(this.hMin[k], angle));
    const cu = Math.cos(clamped) * vl, cw = Math.sin(clamped) * vl;
    pos[c] = pos[j] + ux * cu + wx * cw;
    pos[c + 1] = pos[j + 1] + uy * cu + wy * cw;
    pos[c + 2] = pos[j + 2] + uz * cu + wz * cw;
  }

  // Particle i out of the car's box the shallowest way, so bodies go over the car.
  outOfBox(i, box) {
    const pos = this.pos, o = i * 3, r = this.radii[i] * this.kp;
    const dx = pos[o] - box.cx, dz = pos[o + 2] - box.cz, h = pos[o + 1] - box.y;
    const u = dx * box.fx + dz * box.fz, w = dx * box.sx + dz * box.sz;   // along, across
    const penU = box.halfLen + r - Math.abs(u), penW = box.halfWid + r - Math.abs(w), penTop = box.top + r - h;
    if (penU <= 0 || penW <= 0 || penTop <= 0 || h < -r) return;
    if (penTop <= penU && penTop <= penW) pos[o + 1] += penTop;
    else if (penU <= penW) { const k = Math.sign(u) * penU; pos[o] += box.fx * k; pos[o + 2] += box.fz * k; }
    else { const k = Math.sign(w) * penW; pos[o] += box.sx * k; pos[o + 2] += box.sz * k; }
  }

  // Does the bounding sphere reach the box (Ecosystem.fallBox)? Wakes a sleeping body.
  nearBox(box) {
    const dx = this.boundX - box.cx, dz = this.boundZ - box.cz, r = this.boundR;
    return Math.abs(dx * box.fx + dz * box.fz) < box.halfLen + r && Math.abs(dx * box.sx + dz * box.sz) < box.halfWid + r &&
      this.boundY - r < box.y + box.top;
  }

  // The anchors' centre into cx, cz.
  anchorCentre() {
    const pos = this.pos, an = this.anchors;
    let cx = 0, cz = 0;
    for (let k = 0; k < an.length; k++) { cx += pos[an[k] * 3]; cz += pos[an[k] * 3 + 2]; }
    this.cx = cx / an.length; this.cz = cz / an.length;
  }

  // The body's lowest point: its lowest particle's bottom (the ground, or the roof it lies on).
  lowestY() {
    let y = Infinity;
    for (let i = 0, o = 1; i < this.n; i++, o += 3) y = Math.min(y, this.pos[o] - this.radii[i] * this.kp);
    return y;
  }

  // The largest particle move this step, squared (metres per step).
  maxStepSq() {
    const pos = this.pos, prev = this.prev;
    let m = 0;
    for (let o = 0; o < this.n * 3; o += 3) {
      const dx = pos[o] - prev[o], dy = pos[o + 1] - prev[o + 1], dz = pos[o + 2] - prev[o + 2], d2 = dx * dx + dy * dy + dz * dz;
      if (d2 > m) m = d2;
    }
    return m;
  }

  // Every particle moved by (dx, dz), its speed kept.
  translate(dx, dz) {
    const pos = this.pos, prev = this.prev;
    for (let o = 0; o < this.n * 3; o += 3) { pos[o] += dx; prev[o] += dx; pos[o + 2] += dz; prev[o + 2] += dz; }
  }

  // Speed along x and/or z stopped (a wall).
  stopAxis(x, z) {
    const pos = this.pos, prev = this.prev;
    for (let o = 0; o < this.n * 3; o += 3) { if (x) prev[o] = pos[o]; if (z) prev[o + 2] = pos[o + 2]; }
  }

  // particle i into out
  at(i, out) { const o = i * 3; return out.set(this.pos[o], this.pos[o + 1], this.pos[o + 2]); }
}

// Every fall's launch: the hit's push heading and speed (capped at RAGDOLL_MAX_DV) per step, x then z.
function fallLaunch(a) {
  const dv = Math.min(a.downDV, RAGDOLL_MAX_DV) * NPC_TICK_S;
  return [Math.sin(a.downYaw) * dv, Math.cos(a.downYaw) * dv];
}

// Each particle's world point from its rest point, placed at world / quat.
function placeFromRest(body, rest, shares, world, quat, a, v) {
  const [lx, lz] = fallLaunch(a);
  for (let i = 0; i < rest.length; i++) {
    v.copy(rest[i]).multiplyScalar(body.kp).applyQuaternion(quat).add(world);
    body.place(i, v, lx * shares[i], lz * shares[i]);
  }
}

// BOX-RIG FALLS (deer, coyotes): rear, front, top, 4 hips, 4 feet. Body and hips are rigid; feet swing. The top takes
// the full launch, so it rolls toward the push. Layouts by type in fallRigs, rig units: points, bodyR, footR (the
// renderer registers them from its meshes, AnimalRenderer.ragdollRig).
export const fallRigs = {};
const BOX_RAG_CORE = 7;   // particles 0 to 6
const BOX_RAG_LINKS = (() => {
  const links = [];
  for (let i = 0; i < BOX_RAG_CORE; i++) for (let j = i + 1; j < BOX_RAG_CORE; j++) links.push([i, j, 0.5, 0.5]);
  for (let l = 0; l < 4; l++) links.push([3 + l, 7 + l, 0, 1]);
  return links;
})();
const BOX_RAG_SHARES = [RAGDOLL_BASE_SHARE, RAGDOLL_BASE_SHARE, RAGDOLL_TOP_SHARE, ...Array(4).fill(RAGDOLL_BASE_SHARE), ...Array(4).fill(0)];
export class BoxFall {
  constructor(rig) {
    this.rig = rig; this.owner = null; this.type = null; this.stillS = 0; this.asleep = false;
    this.body = new VerletBody(11, BOX_RAG_LINKS, [rig.bodyR, rig.bodyR, rig.bodyR, ...Array(8).fill(rig.footR)], [0, 1]);
    this._v = new THREE.Vector3();
  }

  // From the standing pose at world / quat on `ground`.
  start(a, world, quat, kp, ground) {
    this.body.kp = kp;
    placeFromRest(this.body, this.rig.points, BOX_RAG_SHARES, world, quat, a, this._v);
    this.body.begin(kp, ground);
  }
}

// HUMAN FALLS: pelvis, chest, head, then left/right shoulders, elbows, hands, hips, knees, feet. Torso and head are
// rigid; limbs bend on one-way hinges.
const HUMAN_RAG_CORE = [0, 1, 2, 3, 4, 9, 10];
const HUMAN_RAG_LINKS = (() => {
  const links = [];
  for (let i = 0; i < HUMAN_RAG_CORE.length; i++) for (let j = i + 1; j < HUMAN_RAG_CORE.length; j++) links.push([HUMAN_RAG_CORE[i], HUMAN_RAG_CORE[j], 0.5, 0.5]);
  // limbs: [joint, child, shares]; the end nearer the torso is heavier
  for (const s of [0, 1]) links.push([3 + s, 5 + s, 0.2, 0.8], [5 + s, 7 + s, 0.5, 0.5], [9 + s, 11 + s, 0.3, 0.7], [11 + s, 13 + s, 0.5, 0.5]);
  return links;
})();
// ELBOW AND KNEE HINGES: one way about +x, straight to flexDeg; elbow -1, knee +1.
const HUMAN_RAG_JOINT_LIMITS = {
  elbow: { flexDeg: 145, flexDir: -1 },
  knee: { flexDeg: 150, flexDir: 1 }
};
// under this axis share left, a hinge keeps its last good axis
const HUMAN_RAG_HINGE_MIN_AXIS = 0.1;
// limits [minRad, maxRad] about +x
const hingeRange = ({ flexDeg, flexDir }) => {
  const flex = flexDir * flexDeg * Math.PI / 180;
  return [Math.min(0, flex), Math.max(0, flex)];
};
// hinge rows: elbows on the shoulders' axis, knees on the hips'
const HUMAN_RAG_HINGES = (() => {
  const elbow = hingeRange(HUMAN_RAG_JOINT_LIMITS.elbow), knee = hingeRange(HUMAN_RAG_JOINT_LIMITS.knee), hinges = [];
  for (const s of [0, 1]) hinges.push([3 + s, 5 + s, 7 + s, 3, 4, ...elbow], [9 + s, 11 + s, 13 + s, 9, 10, ...knee]);
  return hinges;
})();
// ground radii, rig units
const HUMAN_RAG_RADII = [2.3, 2.3, 1.9, 1.5, 1.5, 0.9, 0.9, 0.6, 0.6, 1.8, 1.8, 1.2, 1.2, 0.9, 0.9];
// launch share per particle: the upper body leads, so it topples toward the push
const HUMAN_RAG_SHARES = [RAGDOLL_BASE_SHARE, RAGDOLL_TOP_SHARE, RAGDOLL_TOP_SHARE, RAGDOLL_TOP_SHARE, RAGDOLL_TOP_SHARE,
  0, 0, 0, 0, RAGDOLL_BASE_SHARE, RAGDOLL_BASE_SHARE, 0, 0, 0, 0];
// Rest points in rig units at body shape `shape`, matching the shader's arm and leg offsets.
function humanRagRest(shape) {
  const R = HUMAN_RIG, at = R.at;
  const arm = (s, y) => new THREE.Vector3(s * (R.shoulderX + (R.shoulder - y) * HUMAN_ARM_FLARE) * shape.shoulder, y, 0);
  const leg = (s, y) => new THREE.Vector3(s * (R.legX - (R.hip - y) * R.legSplay) * shape.hip, y, 0);
  return [new THREE.Vector3(0, R.hip, 0), new THREE.Vector3(0, at(0.84), 0), new THREE.Vector3(0, at(0.94), 0),
    arm(1, R.shoulder), arm(-1, R.shoulder), arm(1, R.elbow), arm(-1, R.elbow), arm(1, at(0.44)), arm(-1, at(0.44)),
    leg(1, R.hip), leg(-1, R.hip), leg(1, R.knee), leg(-1, R.knee), leg(1, R.ankle), leg(-1, R.ankle)];
}
export class HumanFall {
  constructor() {
    this.owner = null; this.type = null; this.stillS = 0; this.asleep = false; this.rest = null;
    this.lieReach = 0;   // the player's ragdoll: anchors' reach from the feet once lying, metres (bodyDown's pull)
    this.body = new VerletBody(15, HUMAN_RAG_LINKS, HUMAN_RAG_RADII, [0, 1], HUMAN_RAG_HINGES);
    this._v = new THREE.Vector3();
  }

  start(a, world, quat, kp, ground) {
    this.rest = humanRagRest(a.look.shape);
    this.body.kp = kp;
    const an = this.body.anchors;
    this.lieReach = an.reduce((sum, i) => sum + this.rest[i].y - HUMAN_RIG.foot, 0) / an.length * kp;
    placeFromRest(this.body, this.rest, HUMAN_RAG_SHARES, world, quat, a, this._v);
    this.body.begin(kp, ground);
  }
}

export function sampleFightKeys(keys, u, out) {
  let i = 0;
  while (i < keys.length - 2 && u > keys[i + 1].t) i++;
  const a = keys[i], b = keys[i + 1], f = fightEase(fightClamp01((u - a.t) / (b.t - a.t)));
  for (const k of FIGHT_KEY_FIELDS) out[k] = a[k] + (b[k] - a[k]) * f;
  return out;
}
// A person's BMI: the look's, or the sex's reference with no look.
export function humanBmi(sex, look) {
  return look ? look.bmi : NPC_REF_BMI[sex];
}
// A person's mass in kg: BMI x height^2.
export function humanMassKg(sex, look, heightM) {
  return humanBmi(sex, look) * heightM * heightM;
}
// Fighting mass in kg: lean mass in full, fat at NPC_FAT_STRENGTH_SHARE.
export function humanFightMassKg(sex, look, heightM) {
  return humanMassKg(sex, look, heightM) * fightMassShare(look ? look.bodyFat : NPC_REF_BODY_FAT[sex]);
}
// Stats readout: age, sex, height, weight; the key packs what can change, so displays redraw only on change.
export function personInfoKey(age, sex, look, heightM) {
  const lb = Math.round(humanMassKg(sex, look, heightM) * LB_PER_KG);
  const inches = Math.round(heightM / M_PER_IN);
  return ((age + 2) * 1000 + inches) * 10000 + lb;
}
// lb packed in a personInfoKey
const personInfoLb = key => key % 10000;
// Share of lean mass counted as muscle; the readout's muscle is lean mass at this share.
const MUSCLE_SHARE_OF_LEAN = 0.5;
// type name per dominant somatotype rating
const BODY_TYPE_NAMES = { meso: 'Meso', endo: 'Endo', ecto: 'Ecto' };
// A person's body type: their highest rating's name.
export function humanBodyType(look) {
  let best = null;
  for (const k in BODY_TYPE_NAMES) {
    const rating = look ? look[k] : NPC_BODY_POP[k].mean;
    if (best === null || rating > best.rating) best = { k, rating };
  }
  return BODY_TYPE_NAMES[best.k];
}
// body readout fields: fat lb, muscle lb, type name, from the same key so weights add up
export function personBodyFields(key, sex, look) {
  const lb = personInfoLb(key), fatShare = look ? look.bodyFat : NPC_REF_BODY_FAT[sex];
  return [`Fat ${Math.round(lb * fatShare)} lb`, `Muscle ${Math.round(lb * (1 - fatShare) * MUSCLE_SHARE_OF_LEAN)} lb`, humanBodyType(look)];
}
// inches as 5'9"
export const feetInches = inches => `${Math.floor(inches / 12)}'${inches % 12}"`;
// readout fields in order; each display joins them its own way
export function personInfoFields(key, sex) {
  const lb = personInfoLb(key), inches = Math.floor(key / 10000) % 1000, age = Math.floor(key / 1e7) - 2;
  return [`Age ${age < 0 ? '<' + NPC_ADULT_AGE : age}`, sex === 'male' ? 'M' : 'F', feetInches(inches), `${lb} lb`];
}

// ENTITIES

export class Entity {
  constructor(position, type) {
    this.position = new THREE.Vector3(...position);
    this.type = type;
    this.mesh = null;
    this.health = 300;
    this.alive = true;
  }

  update(deltaTime) { }

  remove() {
    if (this.mesh) scene.remove(this.mesh);
  }
}

// PREY CHOICE scratch: candidates picked after the scan, once pack sums are known.
const _preyObj = [], _preyD2 = [], _preyKey = [], _preySight = [];
let _nPrey = 0;
function addPrey(obj, d2, key, sight) {
  _preyObj[_nPrey] = obj; _preyD2[_nPrey] = d2; _preyKey[_nPrey] = key; _preySight[_nPrey] = sight; _nPrey++;
}

export class Animal extends Entity {
  static TWO_PI = TWO_PI;
  static DEATH_HEALTH = 1;   // health at or under which an animal dies (and leaves a corpse, Ecosystem.step)
  static FOV_H_MIN = 0.30; static FOV_H_MAX = Math.PI;
  static FOV_V_MIN = 0.08; static FOV_V_MAX = 0.60;
  static INPUT_DIMS = 19;
  static _hit = { d3sq: 0, sin: 0, cos: 0, elev: 0, dist: 0 };
  static _ray = { sin: 0, cos: 0, elev: 0, dist: 0 };

  constructor(position, type) {
    super(position, type);
    const spec = SPECIES[type];
    this.spec = spec;
    this.typeId = NPC_TYPE_IDS[type];
    this.speed = spec.speed;
    this.WATER_SPEED_FACTOR = 0.45;
    this.submerged = false;
    this.startHealth = spec.health;
    this.health = this.startHealth;
    this.maxHealth = this.health;
    this.visionDistance = tools.random(500, 2000) * NPC_UNIT;
    this.visionDistSq = this.visionDistance * this.visionDistance;

    const fh = spec.fovH, fv = spec.fovV;
    this.setFov(tools.random(fh[0], fh[1]), tools.random(fv[0], fv[1]));
    this.eyeOffset = spec.eye;

    this.generation = 0;

    this.waterNeed = Math.random() * 0.05;
    this.foodNeed = Math.random() * 0.05;
    this.reproductionNeed = Math.random() * 0.05;
    this.avoidNeed = 0;

    this.sex = Math.random() < 0.5 ? 'male' : 'female';
    this.setSizeZ(tools.gauss());
    this.look = type === 'human' ? humanLook(this.sex) : null;   // appearance (render only), for life
    this.mutationMulti = 0.5;
    this.lastChildTime = ecosystem.time;   // sim seconds
    this.childGracePeriod = (15 + Math.random() * 15) * spec.grace * MATE_TIME_MULT;   // sim seconds
    this.lookForMate = false;

    this.waterIncrement = this.health * 0.000001;
    this.foodIncrement = this.health * 0.000003;
    this.reproductionIncrement = this.foodIncrement * DEER_REPRO_SHARE;
    this.ageDepl = this.health * NPC_AGE_DEPLETION_RATE;

    this.memPredatorX = 0; this.memPredatorY = 0; this.memPredatorZ = 0; this.hasPredator = false;
    this.memFoodX = 0; this.memFoodY = 0; this.memFoodZ = 0; this.hasFood = false;
    this.memWaterX = 0; this.memWaterY = 0; this.memWaterZ = 0; this.hasWater = false;
    this.memMateX = 0; this.memMateY = 0; this.memMateZ = 0; this.hasMate = false;
    this.priority = null;          // deer focus: 'predator', 'hunt', 'food', 'water', 'mate', or null exploring
    this.speedScale = 1;
    this.sprinting = false;
    this.nextAttackAt = 0;   // next attack time
    this.nextBiteAt = 0;     // next bite time
    this.noEatUntil = 0;     // no eating until then after a hit
    // fight move and hold; no steps while ecosystem.time < fightUntil
    this.moveAt = -Infinity; this.playing = null; this.moveSide = 1; this.fightFrom = 0; this.fightUntil = 0;
    // KNOCKDOWNS: downAt starts the fall, downUntil ends the hold; downYaw, downDV for render
    this.downAt = -Infinity; this.downUntil = 0; this.downYaw = 0; this.downDV = 0;
    this.contactTick = -Infinity;   // BUMP IMPACTS: last tick the player or the car touched it (Ecosystem.freshContact)
    this.fall = null;               // FALLS: its body while knocked down or dead with ragdolls on (Ecosystem.beginFall)
    this.corpseUntil = 0;           // CORPSES: sim time its body goes (Ecosystem.addCorpse)
    this.diedAt = 0;                // CORPSES: sim time it died; its readouts stop here
    this.quarry = null;      // night hunt quarry (animal or avatar)
    // PACK STRENGTH: mass and height summed over the pack in sight
    this.packMassKg = 0; this.packHeightM = 0;
    this.pounceAt = -Infinity;   // start of the current or last pounce
    this.nextPounceAt = 0;       // next pounce time
    this.fleeFrom = null;    // who a fleeing species' move answered
    this.fleeUntil = 0;      // no new flee move until then
    this.bumpScale = 1;

    // no target reads as distance 1 (sight's edge), never 0 (touching)
    this.rayFoodSin = 0; this.rayFoodCos = 0; this.rayFoodElev = 0; this.rayFoodDist = 1;
    this.rayWaterSin = 0; this.rayWaterCos = 0; this.rayWaterElev = 0; this.rayWaterDist = 1;
    this.rayPredatorSin = 0; this.rayPredatorCos = 0; this.rayPredatorElev = 0; this.rayPredatorDist = 1;
    this.rayMateSin = 0; this.rayMateCos = 0; this.rayMateElev = 0; this.rayMateDist = 1;

    this.brain = spec.brain ? new SpikingNetwork(Animal.INPUT_DIMS) : null;
    this.ACTION_HOLD = spec.brain ? 60 : DEER_THINK_TICKS;
    this.actionTimer = Math.floor(Math.random() * this.ACTION_HOLD);
    // City: heading in radians; people turn toward targetHeading.
    this.heading = Math.random() * Animal.TWO_PI;
    this.targetHeading = this.heading;
    // headingDir's memo: sin and cos of heading as of _dirFor (NaN: none yet)
    this._dirFor = NaN; this._dirSin = 0; this._dirCos = 1;
    this.moving = true;
    this.facingAngle = this.heading;
    this.prevHealth = this.health;
    this.prevWaterNeed = this.waterNeed;
    this.prevFoodNeed = this.foodNeed;
    this._inputs = new Float32Array(Animal.INPUT_DIMS);

    this.isAdult = true;
    this.birthTick = 0;
    // age in years at ageBaseTick
    this.ageBaseTick = ecosystem.ticks;
    this.ageBase = NPC_START_AGE[0] + Math.random() * (NPC_START_AGE[1] - NPC_START_AGE[0]);

    this.animTime = Math.random() * Math.PI * 2;
    // people's gait (render only)
    this.gaitPhase = Math.random() * Animal.TWO_PI;
    this.gaitSwing = 0; this.gaitRun = 0; this.gaitSpeed = 0;
    this.gaitX = NaN; this.gaitZ = NaN;

    this.focusX = this.position.x;
    this.focusZ = this.position.z;
    this.tob = ecosystem.time;   // birth time, sim seconds

    this._hx = NaN; this._hz = NaN; this._hv = -1; this._h = 0;

    // City: last wall-clear position, Ecosystem.collide's fallback
    this.freeX = this.position.x; this.freeZ = this.position.z;
    this._fx = NaN; this._fz = NaN;

    this.mesh = null;
    this.home = null;
    this._gk = -1;   // animalGrid bucket, -1 when not filed
  }

  remove() { }

  setFov(h, v) {
    this.fovH = tools.clamp(h, Animal.FOV_H_MIN, Animal.FOV_H_MAX);
    this.fovV = tools.clamp(v, Animal.FOV_V_MIN, Animal.FOV_V_MAX);
    this.cosFovH = Math.cos(this.fovH);
    this.tanFovV = Math.tan(this.fovV);
  }

  // City: body-centre height above the feet in Arena units.
  footLift() {
    const hs = this.heightScale;
    return this.spec.lift * hs;
  }

  eyeY() {
    return this.position.y + this.eyeOffset * this.heightScale * NPC_UNIT;
  }

  // Is (tx, ty, tz) in the vision cone, in sight and nearer than `beat` (squared 3D distance)? A target at or past
  // `beat` cannot replace the current best under locate's strict `<`, so it is rejected before the cone and the
  // line-of-sight test; the targets locate picks are the same as testing everything.
  senseCloser(px, py, pz, ax, az, cosH, tanV, tx, ty, tz, beat) {
    const dx = tx - px, dy = ty - py, dz = tz - pz;
    const h2 = dx * dx + dz * dz;
    if (h2 === 0) return false;
    const d3sq = h2 + dy * dy;
    if (!(d3sq < beat)) return false;
    if (d3sq > this.visionDistSq) return false;
    const h = Math.sqrt(h2);
    if ((dx * ax + dz * az) < cosH * h) return false;
    if (Math.abs(dy) > tanV * h) return false;
    if (cover.blocks(px, py, pz, tx, ty, tz)) return false;
    const d3 = Math.sqrt(d3sq);
    const hit = Animal._hit;
    hit.d3sq = d3sq;
    hit.sin = dx / h;
    hit.cos = dz / h;
    hit.elev = dy / d3;
    hit.dist = Math.min(1, d3 / this.visionDistance);
    return true;
  }

  outOfRange(mx, my, mz) {
    const dx = mx - this.position.x;
    const dy = my - this.eyeY();
    const dz = mz - this.position.z;
    return (dx * dx + dy * dy + dz * dz) > this.visionDistSq;
  }

  // Brained senses: food, predators, mates and water in the vision cone.
  locate(grid) {
    const px = this.position.x, pz = this.position.z;
    const py = this.eyeY();
    const vd = this.visionDistSq;
    const ax = Math.sin(this.facingAngle), az = Math.cos(this.facingAngle);
    const cosH = this.cosFovH, tanV = this.tanFovV;
    const hit = Animal._hit;
    const type = this.type, tid = this.typeId;
    const huntedBy = HUNTED_BY_MASK[tid], hunts = HUNTS_MASK[tid];
    let bestPredDist = Infinity, bestFoodDist = Infinity, bestMateDist = Infinity, bestWaterDist = Infinity;

    // Animals in the grid cells covering the sight circle, in the grid's visit order; the distance reject matches
    // senseCloser's.
    const r = this.visionDistance;
    const seen = ecosystem._qSeen;
    const nSeen = grid.queryInto(seen, px, pz, r);
    for (let _i = 0; _i < nSeen; _i++) {
      const obj = seen[_i];
      if (obj === this) continue;
      const ox = obj.position.x, oy = obj.position.y, oz = obj.position.z;
      const hx = ox - px, hz = oz - pz;
      if (hx * hx + hz * hz > vd) continue;
      const oid = obj.typeId, obit = 1 << oid;
      const isPred = (huntedBy & obit) !== 0;
      const isFood = (hunts & obit) !== 0;
      const isMate = oid === tid && this.sex !== obj.sex;
      if (!isPred && !isFood && !isMate) continue;
      // the farthest best among the categories obj could fill: nearer than this, it can replace at least one of them;
      // at or past it, it can replace none (each category below still checks its own best)
      const beat = Math.max(isPred ? bestPredDist : 0, isFood ? bestFoodDist : 0, isMate ? bestMateDist : 0);
      if (!this.senseCloser(px, py, pz, ax, az, cosH, tanV, ox, oy, oz, beat)) continue;

      if (isPred) {
        if (hit.d3sq < bestPredDist) {
          bestPredDist = hit.d3sq;
          this.memPredatorX = ox; this.memPredatorY = oy; this.memPredatorZ = oz;
          this.hasPredator = true;
          this.rayPredatorSin = hit.sin; this.rayPredatorCos = hit.cos;
          this.rayPredatorElev = hit.elev; this.rayPredatorDist = hit.dist;
        }
      }
      if (isFood) {
        if (hit.d3sq < bestFoodDist) {
          bestFoodDist = hit.d3sq;
          this.memFoodX = ox; this.memFoodY = oy; this.memFoodZ = oz;
          this.hasFood = true;
          this.rayFoodSin = hit.sin; this.rayFoodCos = hit.cos;
          this.rayFoodElev = hit.elev; this.rayFoodDist = hit.dist;
        }
      }
      if (isMate) {
        if (hit.d3sq < bestMateDist) {
          bestMateDist = hit.d3sq;
          this.memMateX = ox; this.memMateY = oy; this.memMateZ = oz;
          this.hasMate = true;
          this.rayMateSin = hit.sin; this.rayMateCos = hit.cos;
          this.rayMateElev = hit.elev; this.rayMateDist = hit.dist;
        }
      }
    }

    // City: in Survivor the player is a predator to what people hunt
    const gp = ecosystem.avatar;
    if (gp.isThreatTo(tid) &&
      this.senseCloser(px, py, pz, ax, az, cosH, tanV, gp.position.x, gp.position.y, gp.position.z, bestPredDist)) {
      bestPredDist = hit.d3sq;
      this.memPredatorX = gp.position.x; this.memPredatorY = gp.position.y; this.memPredatorZ = gp.position.z;
      this.hasPredator = true;
      this.rayPredatorSin = hit.sin; this.rayPredatorCos = hit.cos;
      this.rayPredatorElev = hit.elev; this.rayPredatorDist = hit.dist;
    }

    // City: plants are food for people too, from the sight grid.
    const seenPlants = ecosystem._qSeenPlants;
    const nPlants = ecosystem.plantSight.queryInto(seenPlants, px, pz, r);
    for (let _i = 0; _i < nPlants; _i++) {
      const plant = seenPlants[_i];
      if (!plant.alive) continue;
      const qx = plant.position.x - px, qz = plant.position.z - pz;
      if (qx * qx + qz * qz > vd) continue;
      if (!this.senseCloser(px, py, pz, ax, az, cosH, tanV,
        plant.position.x, plant.position.y, plant.position.z, bestFoodDist)) continue;
      bestFoodDist = hit.d3sq;
      this.memFoodX = plant.position.x; this.memFoodY = plant.position.y; this.memFoodZ = plant.position.z;
      this.hasFood = true;
      this.rayFoodSin = hit.sin; this.rayFoodCos = hit.cos;
      this.rayFoodElev = hit.elev; this.rayFoodDist = hit.dist;
    }

    // food boxes are food for people: nearest of animal, plant and crate wins
    if (type === 'human' && foodBoxes.list.length) {
      const nBox = foodBoxes.sight.queryInto(ecosystem._qBox, px, pz, this.visionDistance);
      for (let _i = 0; _i < nBox; _i++) {
        const bp = ecosystem._qBox[_i].position;
        if (!this.senseCloser(px, py, pz, ax, az, cosH, tanV, bp.x, bp.y, bp.z, bestFoodDist)) continue;
        bestFoodDist = hit.d3sq;
        this.memFoodX = bp.x; this.memFoodY = bp.y; this.memFoodZ = bp.z;
        this.hasFood = true;
        this.rayFoodSin = hit.sin; this.rayFoodCos = hit.cos;
        this.rayFoodElev = hit.elev; this.rayFoodDist = hit.dist;
      }
    }

    // water, from the sight grid
    const nWater = ecosystem.waterSight.queryInto(ecosystem._qWater, px, pz, this.visionDistance);
    for (let _i = 0; _i < nWater; _i++) {
      const wp = ecosystem._qWater[_i].position;
      const qx = wp.x - px, qz = wp.z - pz;
      if (qx * qx + qz * qz > vd) continue;
      if (!this.senseCloser(px, py, pz, ax, az, cosH, tanV, wp.x, wp.y, wp.z, bestWaterDist)) continue;
      bestWaterDist = hit.d3sq;
      this.memWaterX = wp.x; this.memWaterY = wp.y; this.memWaterZ = wp.z;
      this.hasWater = true;
      this.rayWaterSin = hit.sin; this.rayWaterCos = hit.cos;
      this.rayWaterElev = hit.elev; this.rayWaterDist = hit.dist;
    }

    if (this.hasPredator && this.outOfRange(this.memPredatorX, this.memPredatorY, this.memPredatorZ)) {
      this.hasPredator = false;
      this.rayPredatorSin = 0; this.rayPredatorCos = 0;
      this.rayPredatorElev = 0; this.rayPredatorDist = 1;
    }
    if (this.hasFood && this.outOfRange(this.memFoodX, this.memFoodY, this.memFoodZ)) {
      this.hasFood = false;
      this.rayFoodSin = 0; this.rayFoodCos = 0;
      this.rayFoodElev = 0; this.rayFoodDist = 1;
    }
    if (this.hasWater && this.outOfRange(this.memWaterX, this.memWaterY, this.memWaterZ)) {
      this.hasWater = false;
      this.rayWaterSin = 0; this.rayWaterCos = 0;
      this.rayWaterElev = 0; this.rayWaterDist = 1;
    }
    if (this.hasMate && this.outOfRange(this.memMateX, this.memMateY, this.memMateZ)) {
      this.hasMate = false;
      this.rayMateSin = 0; this.rayMateCos = 0;
      this.rayMateElev = 0; this.rayMateDist = 1;
    }
    this.refreshRays();
  }

  // Remembered targets point from the current eye to the remembered spot.
  refreshRays() {
    const px = this.position.x, py = this.eyeY(), pz = this.position.z, vd = this.visionDistance;
    const ray = (mx, my, mz) => {
      const dx = mx - px, dy = my - py, dz = mz - pz;
      const h = Math.hypot(dx, dz), d3 = Math.hypot(h, dy);
      const r = Animal._ray;
      if (h === 0) { r.sin = 0; r.cos = 0; } else { r.sin = dx / h; r.cos = dz / h; }
      r.elev = d3 === 0 ? 0 : dy / d3;
      r.dist = Math.min(1, d3 / vd);
      return r;
    };
    let r;
    if (this.hasFood) {
      r = ray(this.memFoodX, this.memFoodY, this.memFoodZ);
      this.rayFoodSin = r.sin; this.rayFoodCos = r.cos; this.rayFoodElev = r.elev; this.rayFoodDist = r.dist;
    }
    if (this.hasWater) {
      r = ray(this.memWaterX, this.memWaterY, this.memWaterZ);
      this.rayWaterSin = r.sin; this.rayWaterCos = r.cos; this.rayWaterElev = r.elev; this.rayWaterDist = r.dist;
    }
    if (this.hasPredator) {
      r = ray(this.memPredatorX, this.memPredatorY, this.memPredatorZ);
      this.rayPredatorSin = r.sin; this.rayPredatorCos = r.cos;
      this.rayPredatorElev = r.elev; this.rayPredatorDist = r.dist;
    }
    if (this.hasMate) {
      r = ray(this.memMateX, this.memMateY, this.memMateZ);
      this.rayMateSin = r.sin; this.rayMateCos = r.cos; this.rayMateElev = r.elev; this.rayMateDist = r.dist;
    }
  }

  // Refreshes _dirSin and _dirCos to the current heading (Math.sin and Math.cos, recomputed only when heading changed).
  headingDir() {
    const h = this.heading;
    // a new heading, or 0 after -0 (or back): Math.sin keeps the zero's sign, so the memo does too
    if (h !== this._dirFor || (h === 0 && 1 / h !== 1 / this._dirFor)) {
      this._dirFor = h; this._dirSin = Math.sin(h); this._dirCos = Math.cos(h);
    }
  }

  // World (sin, cos) in the body's frame: (0, 1) ahead, sin > 0 right.
  static egoSin(s, c, fs, fc) { return s * fc - c * fs; }
  static egoCos(s, c, fs, fc) { return c * fc + s * fs; }

  think(grid) {
    this.locate(grid);
    const inp = this._inputs;

    // relative to facing, so directions mean the same whichever way the body points
    const fs = Math.sin(this.facingAngle), fc = Math.cos(this.facingAngle);
    const es = Animal.egoSin, ec = Animal.egoCos;
    inp[0] = es(this.rayFoodSin, this.rayFoodCos, fs, fc);
    inp[1] = ec(this.rayFoodSin, this.rayFoodCos, fs, fc);
    inp[2] = this.rayFoodElev;
    inp[3] = this.rayFoodDist;
    inp[4] = es(this.rayWaterSin, this.rayWaterCos, fs, fc);
    inp[5] = ec(this.rayWaterSin, this.rayWaterCos, fs, fc);
    inp[6] = this.rayWaterElev;
    inp[7] = this.rayWaterDist;
    inp[8] = es(this.rayPredatorSin, this.rayPredatorCos, fs, fc);
    inp[9] = ec(this.rayPredatorSin, this.rayPredatorCos, fs, fc);
    inp[10] = this.rayPredatorElev;
    inp[11] = this.rayPredatorDist;
    inp[12] = es(this.rayMateSin, this.rayMateCos, fs, fc);
    inp[13] = ec(this.rayMateSin, this.rayMateCos, fs, fc);
    inp[14] = this.rayMateElev;
    inp[15] = this.rayMateDist;
    inp[16] = this.foodNeed < 100 ? this.foodNeed / 100 : 1;
    inp[17] = this.waterNeed < 100 ? this.waterNeed / 100 : 1;
    inp[18] = this.health / this.maxHealth;

    this.targetHeading = wrapAngle(this.facingAngle + this.brain.think(inp));
    this.moving = true;
  }

  // DEER AND COYOTE AI (species.py): thinkDeer picks the top need; steerDeer moves every tick.
  thinkDeer(grid) {
    if (Math.random() <= 1 - Math.pow(1 - DEER_EXPLORE_P, DEER_THINK_TICKS)) this.newExploreCoords();
    this.searchDeer(grid);

    let best = null, bestV = -Infinity;
    if (this.hasPredator && this.avoidNeed > bestV) { best = 'predator'; bestV = this.avoidNeed; }
    // a night hunt outranks all but fleeing
    if (this.quarry !== null && best === null) { best = 'hunt'; bestV = Infinity; }
    if (this.hasFood && this.foodNeed > bestV) { best = 'food'; bestV = this.foodNeed; }
    if (this.hasWater && this.waterNeed > bestV) { best = 'water'; bestV = this.waterNeed; }
    if (this.hasMate && this.reproductionNeed > bestV) { best = 'mate'; bestV = this.reproductionNeed; }
    this.priority = best;

    const x = this.position.x, z = this.position.z;
    if (best === 'predator') {
      const ax = x - this.memPredatorX, az = z - this.memPredatorZ;
      if (ax !== 0 || az !== 0) this.heading = this.targetHeading = wrapAngle(Math.atan2(ax, az));
    } else if (best === 'hunt') { this.focusX = this.quarry.position.x; this.focusZ = this.quarry.position.z; }
    else if (best === 'food') { this.focusX = this.memFoodX; this.focusZ = this.memFoodZ; }
    else if (best === 'water') { this.focusX = this.memWaterX; this.focusZ = this.memWaterZ; }
    else if (best === 'mate') { this.focusX = this.memMateX; this.focusZ = this.memMateZ; }

    const fx = this.memPredatorX - x, fz = this.memPredatorZ - z;
    const chase = best === 'hunt' || (best === 'food' && this.spec.food !== 'plant');
    this.sprinting = chase || (best === 'predator' && fx * fx + fz * fz <= DEER_SPRINT_DIST * DEER_SPRINT_DIST);
    this.speedScale = best === 'predator' ? 1 : DEER_CRUISE;
    this.bumpScale = 1;
    if (best !== 'predator') this.aimAtFocus();
    this.moving = true;
  }

  aimAtFocus() {
    const dx = this.focusX - this.position.x, dz = this.focusZ - this.position.z;
    if (dx !== 0 || dz !== 0) this.heading = this.targetHeading = wrapAngle(Math.atan2(dx, dz));
  }

  steerDeer() {
    // sprinting burns DEER_SPRINT_ENERGY x walking energy
    if (this.sprinting) this.foodNeed += this.foodIncrement * (DEER_SPRINT_ENERGY - 1);

    if (this.priority === 'hunt') { this.steerHunt(); return; }
    // the heading holds until the next decision; only arrival is checked
    if (this.priority === 'predator' || !this.moving) return;
    const dx = this.focusX - this.position.x, dz = this.focusZ - this.position.z;
    const step = this.stepLength();
    if (dx * dx + dz * dz <= step * step) {
      // at the focus: stand; a reached explore point is replaced
      if (this.priority === null) { this.newExploreCoords(); this.aimAtFocus(); }
      else this.moving = false;
    }
  }

  // Is `q` still fair game for this night hunter?
  canHunt(q) {
    if (q === null || !q.alive || !ecosystem.night) return false;
    return q === ecosystem.avatar ? q.isPreyFor(this.typeId) : (NIGHT_PREY_MASK[this.typeId] & (1 << q.typeId)) !== 0;
  }

  // PACK STRENGTH: a pack attacks only when its summed mass or height beats q's.
  mayAttack(q) {
    if (this.spec.pack !== true) return true;
    return this.packMassKg >= q.bodyMassKg() || this.packHeightM >= q.bodyHeightM();
  }

  // NIGHT HUNT: run at the quarry, pounce in reach; a lost quarry ends the hunt.
  steerHunt() {
    const q = this.quarry, now = ecosystem.time;
    if (!this.canHunt(q)) {
      this.quarry = null; this.priority = null; this.sprinting = false;
      this.actionTimer = 0;   // decide again next tick
      return;
    }
    if (this.pouncing(now)) return;
    this.focusX = q.position.x; this.focusZ = q.position.z;
    this.aimAtFocus();
    this.moving = true;
    const P = NPC_POUNCES[this.type];
    if (P === undefined || now < this.nextPounceAt || now < this.heldUntil()) return;
    const dx = this.focusX - this.position.x, dz = this.focusZ - this.position.z, reach = this.leapLength(P);
    if (dx * dx + dz * dz > reach * reach) return;
    this.pounceAt = this.moveAt = now;
    this.playing = P;
    this.nextPounceAt = now + P.moveS + P.cooldownS;
    this.bumpScale = 1;
  }

  pouncing(now) {
    const P = NPC_POUNCES[this.type];
    return P !== undefined && now - this.pounceAt < P.moveS;
  }

  // a pounce's flight speed and length
  leapSpeed(P) { return P.leapOver * this.sprintSpeed(); }
  leapLength(P) { return this.leapSpeed(P) * P.moveS * (1 - P.leapAt); }

  // A pounce's step: 0 crouched, then flight short of contact; -1 when not pouncing.
  pounceStep() {
    const now = ecosystem.time;
    if (!this.pouncing(now)) return -1;
    const P = NPC_POUNCES[this.type];
    if ((now - this.pounceAt) / P.moveS < P.leapAt) return 0;
    const q = this.quarry, flight = this.leapSpeed(P) * this.bumpScale * NPC_TICK_S;
    if (q === null) return flight;   // hunt ended mid-air: the leap carries on
    this.headingDir();
    const along = (q.position.x - this.position.x) * this._dirSin + (q.position.z - this.position.z) * this._dirCos;
    return Math.max(0, Math.min(flight, along - Ecosystem.CONTACT_DIST * POUNCE_LAND_SHORT));
  }

  searchDeer(grid) {
    const x = this.position.x, z = this.position.z;
    const vd = this.visionDistSq, r = this.visionDistance;
    this.hasPredator = this.hasFood = this.hasWater = this.hasMate = false;
    this.avoidNeed = 0;
    this.quarry = null;
    const food = this.spec.food, tid = this.typeId, sex = this.sex;
    // at night, night prey is quarry even if fled by day
    const quarryMask = ecosystem.night ? NIGHT_PREY_MASK[tid] : 0;
    const huntedBy = HUNTED_BY_MASK[tid] & ~quarryMask, foodId = FOOD_TYPE_ID[tid];
    const needP = huntedBy !== 0, needQ = quarryMask !== 0;
    // food and night prey in one pick; no early stop, as smaller prey may lie farther
    const needT = (food !== null && food !== 'plant') || needQ;
    const pack = this.spec.pack === true;   // packmates in sight are summed, so no early stop
    const needJ = needQ && pack;   // packmates' hunts to join
    let bP = Infinity, bM = Infinity, bJ = Infinity, kP = -1, kM = -1, kJ = -1;
    let oP = null, oM = null, oJ = null;
    // pack sums start with this animal's body
    let packKg = this.bodyMassKg(), packM = this.bodyHeightM();
    _nPrey = 0;   // candidates for the pick (addPrey)

    const cells = grid.cells;
    if (cells !== null) {
      const cols = grid.cols, rows = grid.rows;
      const { cx0, cx1, cy0, cy1, ccx, ccy, K, W } = grid.ringBox(x, z, r);
      const drift = Math.sqrt(ecosystem.drift2);
      const early = W <= cols && cy1 - cy0 < rows;
      for (let k = 0; k <= K; k++) {
        if (k > 0 && early) {
          const L = grid.ringFloor(k) - drift;
          if (L > r) break;
          if (L > 0) {
            const L2 = L * L;
            if ((!needP || bP < L2) && !needT && !pack && (!needJ || bJ < L2) && bM < L2) break;
          }
        }
        const j0 = Math.max(cy0, ccy - k), j1 = Math.min(cy1, ccy + k);
        for (let j = j0; j <= j1; j++) {
          const row = (((j % rows) + rows) % rows) * cols;
          const full = j === ccy - k || j === ccy + k;
          const step = full ? 1 : 2 * k;
          const iEnd = Math.min(cx1, ccx + k);
          for (let i = full ? Math.max(cx0, ccx - k) : ccx - k; i <= iEnd; i += step) {
            if (i < cx0) continue;
            const bucket = cells[row + ((i % cols) + cols) % cols];
            if (bucket === null) continue;
            const base = ((j - cy0) * W + (i - cx0)) * 1048576;
            for (let b = 0; b < bucket.length; b++) {
              const obj = bucket[b];
              if (obj === this || !obj.alive) continue;
              const ox = obj.position.x, oz = obj.position.z;
              const d2 = (ox - x) * (ox - x) + (oz - z) * (oz - z);
              if (d2 > vd) continue;
              const key = base + b;
              const oid = obj.typeId;
              if ((quarryMask & (1 << oid)) !== 0 || oid === foodId) {
                addPrey(obj, d2, key, 1);
              } else if ((huntedBy & (1 << oid)) !== 0) {
                if ((d2 < bP || (d2 === bP && key > kP)) && this.inSight(ox, obj.position.y, oz)) { bP = d2; kP = key; oP = obj; }
              } else if (oid === tid) {
                if (pack) { packKg += obj.bodyMassKg(); packM += obj.bodyHeightM(); }
                if (needJ && obj.priority === 'hunt' && (d2 < bJ || (d2 === bJ && key > kJ)) && this.canHunt(obj.quarry) &&
                  this.inSight(ox, obj.position.y, oz)) { bJ = d2; kJ = key; oJ = obj; }
                if (obj.sex !== sex && (d2 < bM || (d2 === bM && key > kM)) && this.inSight(ox, obj.position.y, oz)) { bM = d2; kM = key; oM = obj; }
              }
            }
          }
        }
      }
    }
    if (oP) { this.seen(0, oP.position.x, oP.position.y, oP.position.z); this.avoidNeed = Infinity; }
    if (oM) this.seen(3, oM.position.x, oM.position.y, oM.position.z);

    // City: the avatar as predator and night quarry
    const gp = ecosystem.avatar;
    if (gp.isThreatTo(tid) || gp.isPreyFor(tid)) {
      const ox = gp.position.x, oz = gp.position.z;
      const d2 = (ox - x) * (ox - x) + (oz - z) * (oz - z);
      if (gp.isThreatTo(tid)) {
        if (d2 <= vd && d2 <= bP && this.inSight(ox, gp.position.y, oz)) { bP = d2; this.seen(0, ox, gp.position.y, oz); this.avoidNeed = Infinity; }
      } else if (d2 <= vd) addPrey(gp, d2, -1, 1);   // the avatar never wins a tie
    }
    // a pack hunter joins the nearest packmate's attack unless its own pick ranks ahead
    if (oJ) {
      const q = oJ.quarry;
      addPrey(q, (q.position.x - x) * (q.position.x - x) + (q.position.z - z) * (q.position.z - z), -1, 0);
    }

    // of the candidates this pack can take, the smallest, then nearest
    this.packMassKg = packKg; this.packHeightM = packM;
    // the pick: size step, squared distance, tie key, target
    let sT = Infinity, bT = Infinity, kT = -1, oT = null;
    for (let i = 0; i < _nPrey; i++) {
      const obj = _preyObj[i], d2 = _preyD2[i], key = _preyKey[i];
      _preyObj[i] = null;   // let go of the reference
      if (!this.mayAttack(obj)) continue;
      const s = Animal.preySize(obj);
      if (!(Animal.preyAhead(s, d2, sT, bT) || (s === sT && d2 === bT && key > kT))) continue;
      if (_preySight[i] === 1 && !this.inSight(obj.position.x, obj.position.y, obj.position.z)) continue;
      sT = s; bT = d2; kT = key; oT = obj;
    }
    // the pick shows as the food ray; night prey is hunted, food chased when hunger leads
    if (oT) {
      if (oT === gp || (quarryMask & (1 << oT.typeId)) !== 0) this.quarry = oT;
      this.seen(1, oT.position.x, oT.position.y, oT.position.z);
    }

    if (food === 'plant') {
      const plant = ecosystem.plantSight.nearest(x, z, r, vd, true);
      if (plant) this.seen(1, plant.position.x, plant.position.y, plant.position.z);
    }

    const w = ecosystem.waterSight.nearest(x, z, r, vd, false);
    if (w) this.seen(2, w.position.x, w.position.y, w.position.z);
  }

  // Is the eye's line to (tx, ty, tz) clear of cover?
  inSight(tx, ty, tz) {
    return !cover.blocks(this.position.x, this.eyeY(), this.position.z, tx, ty, tz);
  }

  // Metres moved this tick: pounce, sprint or walk.
  stepLength() {
    const leap = this.pounceStep();
    if (leap >= 0) return leap;
    const ms = this.sprinting ? this.sprintSpeed() : this.moveSpeed() * this.speedScale * NPC_UNIT;
    return (this.submerged ? ms * this.WATER_SPEED_FACTOR : ms) * this.bumpScale * NPC_TICK_S;
  }

  // sprint m/s
  sprintSpeed() { return DEER_SPRINT_OVER * Math.max(RUN_SPEED, ecosystem.fastestHunterMSById[this.typeId]); }

  // City: deer slide along walls like the car.
  moveDeer(step) {
    const p = this.position, w = Animal._wallPos;
    const feet = this._b ?? baseAt(p.x, p.z);
    const n = Math.max(1, Math.ceil(step / NPC_SUBSTEP));
    const b0 = this.bumpScale || 1;
    const d0 = step / n;
    for (let k = 0; k < n; k++) {
      const d = d0 * (this.bumpScale / b0);
      this.headingDir();
      const fx = this._dirSin, fz = this._dirCos;
      p.x = ecosystem.fitX(p.x + fx * d);
      p.z = ecosystem.fitZ(p.z + fz * d);
      w.set(p.x, 0, p.z);
      if (!resolveCollisions(w, NPC_RADIUS, feet, feet + NPC_COLLIDE_H, STEP_UP)) continue;
      const px = w.x - p.x, pz = w.z - p.z;
      p.x = w.x; p.z = w.z;
      const len = Math.hypot(px, pz);
      if (len < 1e-6) continue;
      const nx = px / len, nz = pz / len;
      const dot = fx * nx + fz * nz;
      if (dot < 0) this.bumpScale *= 1 - dot * dot;
      if (Math.abs(dot) < CAR_GLANCE) {
        let tx = -nz, tz = nx;
        if (tx * fx + tz * fz < 0) { tx = -tx; tz = -tz; }
        let dy = Math.atan2(tx, tz) - this.heading;
        dy = Math.atan2(Math.sin(dy), Math.cos(dy));
        this.heading = this.targetHeading = wrapAngle(this.heading + dy * CAR_ALIGN);
      }
    }
  }

  // Record a sighting (0 predator, 1 food, 2 water, 3 mate) for the arrows.
  seen(kind, ox, oy, oz) {
    const dx = ox - this.position.x, dz = oz - this.position.z;
    const h = Math.hypot(dx, dz) || 1;
    const s = dx / h, c = dz / h, dist = Math.min(1, h / this.visionDistance);
    if (kind === 0) {
      this.memPredatorX = ox; this.memPredatorY = oy; this.memPredatorZ = oz; this.hasPredator = true;
      this.rayPredatorSin = s; this.rayPredatorCos = c; this.rayPredatorDist = dist;
    } else if (kind === 1) {
      this.memFoodX = ox; this.memFoodY = oy; this.memFoodZ = oz; this.hasFood = true;
      this.rayFoodSin = s; this.rayFoodCos = c; this.rayFoodDist = dist;
    } else if (kind === 2) {
      this.memWaterX = ox; this.memWaterY = oy; this.memWaterZ = oz; this.hasWater = true;
      this.rayWaterSin = s; this.rayWaterCos = c; this.rayWaterDist = dist;
    } else {
      this.memMateX = ox; this.memMateY = oy; this.memMateZ = oz; this.hasMate = true;
      this.rayMateSin = s; this.rayMateCos = c; this.rayMateDist = dist;
    }
  }

  // species.py new_explore_coords; City: up to 10 draws for an open outdoor spot.
  newExploreCoords() {
    for (let k = 0; k < 10; k++) {
      this.focusX = ecosystem.minX + Math.random() * (ecosystem.maxX - ecosystem.minX);
      this.focusZ = ecosystem.minZ + Math.random() * (ecosystem.maxZ - ecosystem.minZ);
      if (isOpen(this.focusX, this.focusZ)) return;
    }
  }

  static _wallPos = new THREE.Vector3();

  // PREY CHOICE: `q`'s size in PREY_SIZE_STEP_KG steps
  static preySize(q) { return Math.round(q.bodyMassKg() / PREY_SIZE_STEP_KG); }
  // PREY CHOICE: does size s at d2 rank ahead of (sB, dB)? smaller, then nearer
  static preyAhead(s, d2, sB, dB) { return s < sB || (s === sB && d2 < dB); }

  move() {
    const lift = this.footLift() * NPC_UNIT;
    if (this.moving && ecosystem.time >= this.heldUntil()) {
      if (this.heading !== this.targetHeading) {
        this.heading = turnToward(this.heading, this.targetHeading, HUMAN_TURN_RATE * NPC_TICK_S);
      }
      this.facingAngle = this.heading;
      const step = this.stepLength();
      this.headingDir();
      const sx = this._dirSin * step, sz = this._dirCos * step;
      const n = Math.ceil(step / NPC_SUBSTEP);
      if (!this.brain) {
        this.moveDeer(step);
      } else if (n <= 1) {
        // walking step: Ecosystem.collide settles walls
        this.position.x = ecosystem.fitX(this.position.x + sx);
        this.position.z = ecosystem.fitZ(this.position.z + sz);
      } else {
        // sprinting step: sub-steps refused or slid at blocked cells
        let x = this.position.x, z = this.position.z;
        for (let k = 0; k < n; k++) {
          const nx = ecosystem.fitX(x + sx / n);
          const nz = ecosystem.fitZ(z + sz / n);
          if (!occ.blockedAt(nx, nz)) { x = nx; z = nz; }
          else if (!occ.blockedAt(nx, z)) x = nx;
          else if (!occ.blockedAt(x, nz)) z = nz;
          else break;
        }
        this.position.x = x; this.position.z = z;
      }
    }
    // footing: base (floor, ground or water) + dip, floating past the float depth
    const g = surfaceFor(this, this.position.x, this.position.z);
    const floatY = -this._fd;
    this.floating = g < floatY;
    this.submerged = g < 0;
    this.position.y = this._b + (this.floating ? floatY : g) + lift;
  }

  update(now, grid) {
    this.waterNeed += this.waterIncrement;
    this.foodNeed += this.foodIncrement;
    if (!this.isAdult && ecosystem.ticks - this.birthTick >= NPC_MATURITY_TICKS) {
      this.isAdult = true;
      this.ageBase = NPC_ADULT_AGE;
      this.ageBaseTick = ecosystem.ticks;
    }
    this.lookForMate = this.mateReady(now);
    // people: the Arena's rule; deer: species.py's
    const rn = this.reproductionNeed;
    this.reproductionNeed = !this.lookForMate ? 0
      : this.brain ? Math.min(rn + rn, REPRO_NEED_MAX) : rn + this.reproductionIncrement;
    this.health -= (now - this.tob) * this.ageDepl
      + this.waterNeed * 0.0001
      + this.foodNeed * 0.0001;
    this.avoidNeed = 0;
    if (this.health <= Animal.DEATH_HEALTH) { this.alive = false; return; }
    regenStep(this, this.maxHealth, NPC_NEED_FULL, Animal.DRINK_SHARE_PER_S, NPC_TICK_S);
    if (this.fleeFrom !== null && now >= this.heldUntil()) this.fleeAttacker();

    if (!this.brain) {
      // City: deer decide every DEER_THINK_TICKS (staggered) and steer every tick
      if (--this.actionTimer <= 0 && !this.pouncing(now)) {
        this.thinkDeer(grid);
        this.actionTimer = this.ACTION_HOLD;
      }
      this.steerDeer();
    } else if (--this.actionTimer <= 0) {
      // credit the held decision, then make the next
      this.learnFromLastDecision();
      this.think(grid);
      this.actionTimer = this.ACTION_HOLD;
    }
    this.move();
  }

  // Reward: mean health, food and water gained, clipped to [-1, 1].
  learnFromLastDecision() {
    const gained = (this.health - this.prevHealth)
      + (this.prevFoodNeed - this.foodNeed)
      + (this.prevWaterNeed - this.waterNeed);
    const reward = gained / (3 * this.startHealth * 0.05);
    this.brain.adjustWeights(Math.max(-1, Math.min(1, reward)));
    this.prevHealth = this.health;
    this.prevWaterNeed = this.waterNeed;
    this.prevFoodNeed = this.foodNeed;
  }

  // One hit; the per-hit share keeps NPC_ATTACK_DAMAGE_PER_S whatever the cooldown.
  attacked(predator) {
    ecosystem.applyHit(this, predator, this.startHealth * NPC_ATTACK_DAMAGE_PER_S * NPC_ATTACK_COOLDOWN_S);
  }

  // A hit's damage: no eating for NPC_HIT_NO_EAT_S; a kill feeds the attacker when `feeds` (false for bump impacts).
  takeHit(attacker, damage, feeds = true) {
    this.health -= damage;
    this.noEatUntil = ecosystem.time + NPC_HIT_NO_EAT_S;
    if (this.health <= Animal.DEATH_HEALTH) {
      this.alive = false;
      if (feeds) attacker.feedOn(this);
    } else this.answerHit(attacker);
  }

  // A striker landing a hit: its move, facing the target, holding ground.
  strike(target) {
    this.faceToward(target.position.x, target.position.z, 1);
    startFightMove(this, NPC_FIGHT_MOVES[this.type], ecosystem.time);
  }

  // A fleeing species answers a hit with its move, then runs; once per fleeS.
  answerHit(attacker) {
    const move = NPC_FIGHT_MOVES[this.type], now = ecosystem.time;
    if (!move.flees || now < this.fleeUntil) return;
    this.faceToward(attacker.position.x, attacker.position.z, -1);
    startFightMove(this, move, now);
    this.fleeFrom = attacker;
    this.fleeUntil = now + move.moveS + move.fleeS;
  }

  // Move over: sprint away; it keeps fleeing while the attacker is in sight.
  fleeAttacker() {
    const f = this.fleeFrom;
    this.fleeFrom = null;
    this.seen(0, f.position.x, f.position.y, f.position.z);
    this.priority = 'predator';
    this.faceToward(f.position.x, f.position.z, -1);
    this.sprinting = true;
    this.speedScale = this.bumpScale = 1;
    this.moving = true;
    this.actionTimer = this.ACTION_HOLD;
  }

  // Turn toward (1) or away from (-1) (x, z) at once.
  faceToward(x, z, sign) {
    const dx = (x - this.position.x) * sign, dz = (z - this.position.z) * sign;
    if (dx === 0 && dz === 0) return;
    this.heading = this.facingAngle = wrapAngle(Math.atan2(dx, dz));
    if (!this.brain) this.targetHeading = this.heading;
  }

  // A kill's meal: the victim's starting health as food and water (health comes back by REGEN only).
  feedOn(victim) {
    this.foodNeed = Math.max(0, this.foodNeed - victim.startHealth);
    this.dietWater(victim.startHealth);
  }

  // City: water eaten with `food` units of food.
  dietWater(food) {
    const perFood = DIET_WATER_SHARE * this.waterIncrement / this.foodIncrement;
    this.waterNeed = Math.max(0, this.waterNeed - food * perFood);
  }

  ageYears() {
    return this.ageBase + (ecosystem.ticks - this.ageBaseTick) / NPC_TICKS_PER_YEAR;
  }

  // GROWTH: drawn size share, GROWTH_MIN_SCALE at birth to 1 at maturity.
  growthScale() {
    const growth = this.isAdult ? 1 : Math.min(1, (ecosystem.ticks - this.birthTick) / NPC_MATURITY_TICKS);
    return GROWTH_MIN_SCALE + (1 - GROWTH_MIN_SCALE) * growth;
  }
  // Metres per rig unit as drawn.
  rigScale() { return this.growthScale() * NPC_UNIT * this.heightScale; }
  // The drawn rig's origin height: a young body's centre sits lower by the lift it has not grown into.
  originY() { return this.position.y - (1 - this.growthScale()) * this.footLift() * NPC_UNIT; }

  // Drawn height in metres.
  bodyHeightM() {
    return this.heightScale * NPC_SIZE[this.type].rig * NPC_UNIT * this.growthScale();
  }

  // Body pace: the look's, 1 for animals.
  pace() { return this.look ? this.look.pace : 1; }
  // Arena speed per second: speed gene x pace.
  moveSpeed() { return this.speed * this.pace(); }
  // Jump takeoff speed (bodyJumpSpeed). Not called yet.
  jumpSpeed(baseSpeed) { return bodyJumpSpeed(baseSpeed, this.pace()); }

  // Fighting mass in kg: people by humanFightMassKg, animals at the reference man's share.
  fightMassKg() {
    return this.type === 'human' ? humanFightMassKg(this.sex, this.look, this.bodyHeightM())
      : this.bodyMassKg() * NPC_ANIMAL_FIGHT_SHARE;
  }

  // KNOCKDOWNS: health share x energy share
  condition() { return conditionShare(this.health, this.maxHealth, this.foodNeed, this.waterNeed); }
  // no steps until the later of the fight hold and a knockdown
  heldUntil() { return Math.max(this.fightUntil, this.downUntil); }
  // knocked down: neither attacks nor mates (the brain still thinks)
  isDown(now) { return now < this.downUntil; }
  // BUMPING: m/s along its heading this tick, 0 while held
  groundSpeed(now) { return this.moving && now >= this.heldUntil() ? this.stepLength() / NPC_TICK_S : 0; }
  // BUMP IMPACTS: m/s of this tick's velocity along the unit direction (nx, nz)
  speedAlong(nx, nz, now) { return (Math.sin(this.heading) * nx + Math.cos(this.heading) * nz) * this.groundSpeed(now); }
  // KNOCKDOWNS: can a push knock it down (applyHit)? Every living animal; the avatar has its own rule
  knockable() { return this.alive; }
  // KNOCKDOWNS: braced on its feet (applyHit)? Every animal; the avatar has its own rule
  braced() { return true; }

  // Mass in kg: people by humanMassKg, animals by reference mass x height ratio^3.
  bodyMassKg() {
    const h = this.bodyHeightM();
    if (this.type === 'human') return humanMassKg(this.sex, this.look, h);
    const k = h / NPC_SIZE[this.type][this.sex][0];
    return NPC_REF_MASS_KG[this.type][this.sex] * k * k * k;
  }

  // Adult size from a z-score, cut at NPC_SIZE_Z_MAX.
  setSizeZ(z) {
    this.sizeZ = Math.max(-NPC_SIZE_Z_MAX, Math.min(NPC_SIZE_Z_MAX, z));
    const sz = NPC_SIZE[this.type], [mean, std] = sz[this.sex];
    this.heightScale = (mean + std * this.sizeZ) / (sz.rig * NPC_UNIT);
  }

  // Mate bar fill; only an adult with a full bar mates.
  mateFill(now) {
    return this.isAdult ? (now - this.lastChildTime) / this.childGracePeriod : 0;
  }
  mateReady(now) {
    return this.isAdult && this.mateFill(now) >= 1;
  }

  mate(partner) {
    const mm = this.mutationMulti;
    const lo = Math.max(0.1, 1 - mm);
    const hi = Math.min(1.1, 1 + mm);
    const rand = () => lo + Math.random() * (hi - lo);

    const mother = this.sex === 'female' ? this : partner;
    const child = new Animal(
      [mother.position.x, mother.position.y,
      mother.position.z + this.spec.childDrop * NPC_UNIT],
      this.type
    );
    child.isAdult = false;
    child.birthTick = ecosystem.ticks;
    child.home = mother.home;

    child.speed = ((this.speed + partner.speed) / 2) * rand();
    child.visionDistance = ((this.visionDistance + partner.visionDistance) / 2) * rand();
    child.visionDistSq = child.visionDistance * child.visionDistance;
    child.setFov(
      ((this.fovH + partner.fovH) / 2) * rand(),
      ((this.fovV + partner.fovV) / 2) * rand()
    );
    child.eyeOffset = (this.eyeOffset + partner.eyeOffset) / 2;
    child.mutationMulti = ((this.mutationMulti + partner.mutationMulti) / 2)
      * (0.9 + Math.random() * 0.2);

    // mid-parent z x heritability plus noise; variance stays 1
    const midZ = (this.sizeZ + partner.sizeZ) / 2, h = NPC_SIZE_HERITABILITY;
    child.setSizeZ(h * midZ + Math.sqrt(1 - h * h / 2) * tools.gauss());
    if (child.look) inheritHumanLook(child.look, this.look, partner.look);

    if (this.brain && partner.brain) {
      const ParentBrain = Math.random() < 0.5 ? this.brain : partner.brain;
      // the parent's wiring, mutated; weights fresh
      const childMasks = brains.mutateMasks(ParentBrain.getMasks(), ParentBrain.inputDims,
        ParentBrain.outputDims, child.mutationMulti / 0.5);
      child.brain = new SpikingNetwork(
        ParentBrain.inputDims,
        ((this.brain.learningRate + partner.brain.learningRate) / 2)
        * (0.5 + Math.random()),
        ParentBrain.weightDecay,
        childMasks
      );
    }

    child.generation = Math.max(this.generation, partner.generation) + 1;

    const now = ecosystem.time;
    this.lastChildTime = now;
    this.lookForMate = false;
    this.reproductionNeed = 0;
    partner.lastChildTime = now;
    partner.lookForMate = false;
    partner.reproductionNeed = 0;

    return child;
  }

  eatPlant(plant) {
    const nutrition = plant.maxHealth * PLANT_BITE_NUTRITION;
    this.foodNeed = Math.max(0, this.foodNeed - nutrition * 0.01);
    this.dietWater(nutrition * 0.01);
    plant.health -= 1;
    plantView.touch(plant);
    if (plant.health <= 0) { plant.alive = false; ecosystem.plantsDied = true; }
  }

  // A food box: hunger cleared; the crate moves.
  eatBox() {
    this.dietWater(this.foodNeed);
    this.foodNeed = 0;
  }

  // Every species drinks alike: an empty bar refills in NPC_DRINK_SECONDS.
  static DRINK_SHARE_PER_S = 1 / NPC_DRINK_SECONDS;   // water bar share drinking fills per second (also REGEN's rate)
  drinkWater() {
    this.waterNeed = Math.max(0, Math.min(this.waterNeed, 100) - 100 * Animal.DRINK_SHARE_PER_S * NPC_TICK_S);
  }
}

export function humanLook(sex) {
  const pick = list => list[Math.floor(Math.random() * list.length)];
  const outfit = Math.floor(Math.random() * HUMAN_OUTFITS), shirt = outfit === 5 ? pick(HUMAN_SUITS) : pick(HUMAN_SHIRTS);
  const look = {
    tone: Math.random(), variant: Math.floor(Math.random() * HUMAN_FACE_VARIANTS), female: sex === 'female',
    bodyType: 0, endo: 0, meso: 0, ecto: 0, bodyFat: 0, bmi: 0, pace: 1, build: 0, shape: newShape(), outfit, shirt,
    pants: outfit === 5 ? shirt : pick(HUMAN_PANTS), skinRGB: 0, code: 0
  };
  drawFounderBody(look);
  setHumanBody(look);
  packHumanLook(look);
  return look;
}

const clampTo = (v, [lo, hi]) => Math.max(lo, Math.min(hi, v));
// pure type per readout body type
const PURE_TYPE = { ecto: 'ectomorph', meso: 'mesomorph', endo: 'endomorph' };

// The player's Custom body: bodyType, bodyFat and bmi set; pace and shape follow.
export function customizeHumanLook(L, { bodyType, bodyFat, bmi }) {
  L.bodyType = NPC_SOMATOTYPES.findIndex(t => t.name === PURE_TYPE[bodyType]);
  for (const k in BODY_TYPE_NAMES) setBodyTrait(L, k, 0);
  L.bodyFat = clampTo(bodyFat, NPC_BODY_FAT_LIMITS);
  setHumanBody(L);
  L.bmi = bmi;
  setHumanShape(L);
  packHumanLook(L);
}
// a trait's population curve; fat differs by sex
const bodyPop = (trait, female) => trait === 'bodyFat' ? NPC_BODY_POP.bodyFat[female ? 'female' : 'male'] : NPC_BODY_POP[trait];
// a look's drawn widths
const newShape = () => Object.fromEntries([...NPC_TORSO_REGIONS, 'limb'].map(k => [k, 1]));

// a somatotype by weight
function pickBodyType() {
  let roll = Math.random() * NPC_SOMATOTYPES.reduce((s, t) => s + t.weight, 0);
  const i = NPC_SOMATOTYPES.findIndex(t => (roll -= t.weight) < 0);
  return i < 0 ? NPC_SOMATOTYPES.length - 1 : i;
}
// A trait's [mean, sd] within a somatotype.
const typeCurve = (typeIndex, trait, female) => {
  const t = NPC_SOMATOTYPES[typeIndex];
  return trait === 'bodyFat' ? t.bodyFat[female ? 'female' : 'male'] : [t.ratings[trait], NPC_RATING_SPREAD];
};
// Sets a trait from its z-score on the look's type curve, within limits.
function setBodyTrait(L, trait, z) {
  const [mean, sd] = typeCurve(L.bodyType, trait, L.female);
  L[trait] = clampTo(mean + sd * z, trait === 'bodyFat' ? NPC_BODY_FAT_LIMITS : NPC_RATING_LIMITS);
}

// A founder's ratings and fat: a type by weight, varied within it.
function drawFounderBody(L) {
  L.bodyType = pickBodyType();
  for (const k of NPC_BODY_TRAITS) setBodyTrait(L, k, tools.gauss());
}

// Derives bmi from ratings and fat, then the drawn widths.
function setHumanBody(L) {
  const sex = L.female ? 'female' : 'male';
  const leanIndex = NPC_LEAN_INDEX_BASE[sex] + NPC_LEAN_PER_MESO * (L.meso - NPC_LEAN_REF_RATING) + NPC_LEAN_PER_ECTO * (L.ecto - NPC_LEAN_REF_RATING);
  L.bmi = leanIndex / (1 - L.bodyFat);                   // lean mass / (1 - fat), per m^2
  // pace: lean share over the reference's, to NPC_PACE_LEAN_EXP
  L.pace = clampTo(((1 - L.bodyFat) / (1 - NPC_REF_BODY_FAT[sex])) ** NPC_PACE_LEAN_EXP, NPC_PACE_LIMITS);
  setHumanShape(L);
}

// DRAWN BODY SHAPE: build from bmi, split among regions by NPC_BUILD_BASE.
function setHumanShape(L) {
  const sex = L.female ? 'female' : 'male', base = NPC_BUILD_BASE[sex], baseMean = NPC_BUILD_BASE_MEAN[sex];
  L.build = clampTo(baseMean + Math.sqrt(L.bmi / NPC_REF_BMI[sex]) - 1, NPC_WIDTH_LIMITS);
  // a region's width per unit of build
  const share = k => base[k] / baseMean;
  // a region's relative width from each trait's z-score
  const rel = {};
  for (const k in NPC_BODY_SHAPE) {
    rel[k] = 1;
    for (const t in NPC_BODY_SHAPE[k]) {
      const p = bodyPop(t, L.female);
      rel[k] += NPC_BODY_SHAPE[k][t] * (L[t] - p.mean) / p.sd;
    }
  }
  // torso mean over build, so composition moves width between regions only
  let torsoMean = 0;
  for (const k of NPC_TORSO_REGIONS) torsoMean += share(k) * rel[k] / NPC_TORSO_REGIONS.length;
  for (const k of NPC_TORSO_REGIONS) L.shape[k] = clampTo(L.build * share(k) * rel[k] / torsoMean, NPC_WIDTH_LIMITS);
  L.shape.limb = clampTo(L.build * share('limb') * rel.limb, NPC_WIDTH_LIMITS);
}

// A person at the population's mean body: the billboard bake's bodies.
export function averageHumanLook(female, outfit, variant) {
  const sex = female ? 'female' : 'male';
  const L = {
    tone: 0, variant, female, endo: NPC_BODY_POP.endo.mean, meso: NPC_BODY_POP.meso.mean, ecto: NPC_BODY_POP.ecto.mean,
    bodyFat: NPC_BODY_POP.bodyFat[sex].mean, bmi: NPC_REF_BMI[sex], build: 0, shape: newShape(), outfit, shirt: 0,
    pants: 0, skinRGB: 0, code: 0
  };
  setHumanShape(L);
  packHumanLook(L);
  return L;
}

// skinRGB as one integer; code: face + outfit * 8 + girth * 64.
export function packHumanLook(L) {
  const t = L.tone * (HUMAN_SKIN.length - 1), i = Math.min(HUMAN_SKIN.length - 2, Math.floor(t)), f = t - i;
  const mix = sh => Math.round(((HUMAN_SKIN[i] >> sh) & 255) * (1 - f) + ((HUMAN_SKIN[i + 1] >> sh) & 255) * f);
  L.skinRGB = mix(16) * 65536 + mix(8) * 256 + mix(0);
  L.code = (L.female ? HUMAN_FACE_VARIANTS : 0) + L.variant + L.outfit * 8 +
    Math.round((L.shape.limb - NPC_WIDTH_LIMITS[0]) * NPC_GIRTH_STEPS) * 64;
}

export function inheritHumanLook(L, a, b) {
  L.tone = Math.max(0, Math.min(1, (a.tone + b.tone) / 2 + (Math.random() - 0.5) * 0.12));
  L.variant = (Math.random() < 0.5 ? a : b).variant;
  // somatotype: a parent's by heritability, else fresh by weight
  L.bodyType = Math.random() < NPC_BODY_TYPE_HERITABILITY ? (Math.random() < 0.5 ? a : b).bodyType : pickBodyType();
  // each trait's z: mid-parent x heritability plus noise
  const zOf = (P, k) => { const [mean, sd] = typeCurve(P.bodyType, k, P.female); return (P[k] - mean) / sd; };
  for (const k of NPC_BODY_TRAITS) {
    const h = NPC_BODY_HERITABILITY[k], midZ = (zOf(a, k) + zOf(b, k)) / 2;
    setBodyTrait(L, k, h * midZ + Math.sqrt(1 - h * h / 2) * tools.gauss());
  }
  setHumanBody(L);
  packHumanLook(L);
}

// PLANTS: the Arena's Plant; stem and four leaves that shrink with health.

// PLANT VIEW: the plant renderer's add, remove and touch hooks.
export const plantView = { add: null, remove: null, touch: null, pending: false };

export class Plant extends Entity {
  constructor(position) {
    super(position, 'plant');
    this.health = PLANT_MAX_HEALTH;
    this.maxHealth = PLANT_MAX_HEALTH;
    // On the provider's footing, sunk 3 Arena units.
    const x = this.position.x, z = this.position.z;
    this.position.y = surfaceY(x, z) - 3 * NPC_UNIT;
    this._slot = -1;
    this._cell = null;
    this._sightKey = -1;
    this._gridKey = -1;
    plantView.add(this);
  }

  remove() { plantView.remove(this); }

  update() {
    // past MAX_INSTANCES: retry each tick for a freed slot
    if (this._slot < 0) plantView.add(this);
  }
}

// ECOSYSTEM: the Arena's World loop for every provider; stepped from frame().
export class Ecosystem {
  static CONTACT_QUERY_RADIUS = 20 * NPC_UNIT;
  static CONTACT_DIST_SQ = 200 * NPC_UNIT * NPC_UNIT;
  static CONTACT_DIST = Math.sqrt(200) * NPC_UNIT;
  static BUMP_DIST_SQ = NPC_BUMP_DIST * NPC_BUMP_DIST;   // BUMPING: touching distance, squared

  constructor() {
    this.animals = [];
    this.corpses = [];   // CORPSES: dead animals drawn lying, oldest first (addCorpse)
    this.falls = [];     // FALLS: bodies being simulated, living and dead (beginFall)
    this.ragdolls = false;      // FALLS: the collision mode has ragdolls (setRagdolls, from main's applyCollision)
    this.fallBox = () => null;  // FALLS: the car's box this tick, or null (8b fills it)
    this._fallPools = {};       // FALLS: spare bodies by type
    this._fallWorld = new THREE.Vector3();
    this._fallQuat = new THREE.Quaternion();
    this.plants = [];
    this.ticks = 0;
    this.ready = false;
    this.shownPop = -1;
    this.minX = 0; this.maxX = 0; this.minZ = 0; this.maxZ = 0;
    this.wraps = false;

    this.animalGrid = null;
    this.plantGrid = null;
    // Plants for vision queries; rebuilt with plantGrid.
    this.plantSight = null;
    // Water points for vision queries.
    this.waterSight = null;
    this.aliveById = new Int32Array(NPC_TYPE_COUNT);             // per species: live count
    this.canHuntById = new Uint8Array(NPC_TYPE_COUNT);           // per species: 1 while its prey lives
    this.fastestHunterMSById = new Float64Array(NPC_TYPE_COUNT); // per species: fastest live hunter, m/s
    this.night = false;   // sun below NIGHT_SUN_ALT_DEG: night hunts on
    this.afterContacts = [];   // fn(dt) after each tick's contacts
    this.avatar = null;        // the player's avatar (the game registers)

    this._qPlant = [];
    this._qWater = [];
    this._qBox = [];
    this._qSeen = [];         // locate: animals in the sight box
    this._qSeenPlants = [];   // locate: plants in the sight box
    this._plantAdds = [];
    this._plantDrops = [];
    this._animalGridDrops = [];    // removed animals still in the grid
    this.plantsDied = false;       // a plant died, so removal runs
    this.drift2 = 0;
    this.contact = null;
    this._contactR = Ecosystem.CONTACT_DIST;
  }

  // SIM CLOCK: sim seconds since init; pauses with the sim.
  get time() { return this.ticks * NPC_TICK_S; }

  // Keep a coordinate in the world: torus wrap or clamp.
  fitX(x) {
    if (this.wraps) return this.minX + tools.wrap(x - this.minX, this.maxX - this.minX);
    return x < this.minX ? this.minX : x > this.maxX ? this.maxX : x;
  }

  fitZ(z) {
    if (this.wraps) return this.minZ + tools.wrap(z - this.minZ, this.maxZ - this.minZ);
    return z < this.minZ ? this.minZ : z > this.maxZ ? this.maxZ : z;
  }

  clear() {
    this.animals.length = 0;
    this.corpses.length = 0;
    this.dropFalls();
    this.plants.length = 0;
    this._plantAdds.length = 0;
    this._plantDrops.length = 0;
    this.plantsDied = false;
    this.ready = false;
  }

  // true once per population change
  populationChanged() {
    if (this.animals.length === this.shownPop) return false;
    this.shownPop = this.animals.length;
    return true;
  }

  // Spatial indexes, then the provider's population.
  initialize(provider) {
    this.animals.length = 0;
    this.corpses.length = 0;
    this.dropFalls();
    this.plants.length = 0;
    this._plantAdds.length = 0;
    this._plantDrops.length = 0;
    this.plantsDied = false;
    this.ticks = 0;
    this._animalGridDrops.length = 0;
    const b = provider.bounds;
    this.minX = b.minX; this.maxX = b.maxX;
    this.minZ = b.minZ; this.maxZ = b.maxZ;
    collision.openBounds = { minX: b.minX, maxX: b.maxX, minZ: b.minZ, maxZ: b.maxZ };
    this.wraps = provider.wraps;

    const spanX = b.maxX - b.minX + 1, spanZ = b.maxZ - b.minZ + 1;
    this.animalGrid = new SpatialGrid(spanX, spanZ, 160 * NPC_UNIT);
    this.plantGrid = new SpatialGrid(spanX, spanZ, 30 * NPC_UNIT);
    this.contact = new ContactGrid(NPC_CONTACT_CELL);
    this.plantSight = new SpatialGrid(spanX, spanZ, PLANT_SIGHT_CELL);
    this.waterSight = new SpatialGrid(spanX, spanZ, WATER_SIGHT_CELL);
    for (const w of provider.waterSources()) this.waterSight.insert({ position: { x: w[0], y: w[2], z: w[1] } });
    foodBoxes.buildSight(spanX, spanZ);

    occ.build();
    const plan = provider.population();
    for (const g of plan) if (g.type === 'plant') for (let i = 0; i < g.count; i++) this.spawnPlant(g.src);
    for (const g of plan) if (g.type !== 'plant') this.spawn(g.type, g.count, g.src);
    this.ready = true;
    this.shownPop = -1;
  }

  spawnPlant(src) {
    const s = src.spawnPoint('plant');
    if (!s) return;
    const p = new Plant([s[0], 0, s[1]]);
    this.plants.push(p);
    p._sightKey = this.plantSight.insert(p);
    this._plantAdds.push(p);
  }

  syncPlantGrids() {
    const drops = this._plantDrops, adds = this._plantAdds;
    for (let i = 0; i < drops.length; i++) {
      const p = drops[i];
      if (p._gridKey >= 0) { this.plantGrid.remove(p, p._gridKey); p._gridKey = -1; }
      if (p._sightKey >= 0) { this.plantSight.remove(p, p._sightKey); p._sightKey = -1; }
    }
    for (let i = 0; i < adds.length; i++) {
      const p = adds[i];
      if (p.alive && p._sightKey >= 0) p._gridKey = this.plantGrid.insert(p);
    }
    drops.length = 0;
    adds.length = 0;
  }

  // Places `count` of `type` NPC_SPAWN_GAP apart; returns how many.
  spawn(type, count, src) {
    if (count <= 0) return 0;
    const cell = NPC_SPAWN_GAP;
    const taken = new Map();
    let gap = NPC_SPAWN_GAP, placed = 0;
    const maxTries = count * 80;
    for (let tries = 1; placed < count && tries <= maxTries; tries++) {
      if (tries % (count * 20) === 0) gap *= 0.5;
      const p = src.spawnPoint(type);
      if (!p) continue;
      const [x, z] = p;
      if (!isOpen(x, z)) continue;
      const ci = Math.floor(x / cell), cj = Math.floor(z / cell);
      let crowded = false;
      for (let di = -1; di <= 1 && !crowded; di++) {
        for (let dj = -1; dj <= 1 && !crowded; dj++) {
          const list = taken.get(cellKey(ci + di, cj + dj));
          if (!list) continue;
          for (let i = 0; i < list.length; i += 2) {
            const dx = list[i] - x, dz = list[i + 1] - z;
            if (dx * dx + dz * dz < gap * gap) { crowded = true; break; }
          }
        }
      }
      if (crowded) continue;

      const key = cellKey(ci, cj);
      let list = taken.get(key);
      if (!list) { list = []; taken.set(key, list); }
      list.push(x, z);
      placed++;

      const a = new Animal([x, 0, z], type);
      a.heading = a.targetHeading = a.facingAngle = Math.random() * Animal.TWO_PI;
      a.position.y = surfaceY(x, z) + a.footLift() * NPC_UNIT;
      a.freeX = x; a.freeZ = z;
      a.home = src;
      this.animals.push(a);
    }
    return placed;
  }

  tryMate(a, px, pz) {
    if (a.sex !== 'male') return;
    const cg = this.contact, items = cg.items, start = cg.start;
    const nh = cg.cellsFor(px, pz, this._contactR), hs = cg.hs;
    for (let q = 0; q < nh; q++) for (let i = start[hs[q]], iEnd = start[hs[q] + 1]; i < iEnd; i++) {
      const other = items[i];
      if (other !== a && other.alive && other.type === a.type &&
        other.sex === 'female' && other.lookForMate &&
        tools.distSq(px, pz, other.position.x, other.position.z) < Ecosystem.CONTACT_DIST_SQ) {
        const child = a.mate(other);
        // City: a child in or through a wall is born at the mother's spot.
        const cp = child.position, mp = other.position;
        if (occ.blockedAt(cp.x, cp.z) ||
          shellAt(cp.x, cp.z) !== shellAt(mp.x, mp.z)) {
          cp.x = mp.x; cp.z = mp.z;
        }
        cp.x = this.fitX(cp.x); cp.z = this.fitZ(cp.z);
        child.freeX = cp.x; child.freeZ = cp.z;
        this.animals.push(child);
        return;
      }
    }
  }

  // Contact: hunters kill, all mate and drink, grazers eat plants.
  handleCollisions() {
    if (this.ticks % 3 === 0) this.syncPlantGrids();
    // Candidates from a grid up to 2 ticks old.
    this._contactR = Ecosystem.CONTACT_DIST + Math.sqrt(this.drift2);
    const cg = this.contact, items = cg.items, start = cg.start;
    const now = this.time;

    for (const a of this.animals) {
      if (!a.alive) continue;
      const px = a.position.x, pz = a.position.z;

      const down = a.isDown(now);
      // one neighbour pass for hunting and bumping; hunts is 0 when down or preyless
      const hunts = !down && this.canHuntById[a.typeId] ? HUNTS_MASK[a.typeId] : 0, abit = 1 << a.typeId;
      // BUMPING: this tick's velocity
      const speed = a.groundSpeed(now);
      a.headingDir();
      const vx = a._dirSin * speed, vz = a._dirCos * speed;
      const nh = cg.cellsFor(px, pz, this._contactR), hs = cg.hs;
      near: for (let q = 0; q < nh; q++) for (let i = start[hs[q]], iEnd = start[hs[q] + 1]; i < iEnd; i++) {
        const other = items[i];
        if (other === a || !other.alive) continue;
        const dx = other.position.x - px, dz = other.position.z - pz, d2 = dx * dx + dz * dz;
        if ((hunts & (1 << other.typeId)) !== 0 && d2 < Ecosystem.CONTACT_DIST_SQ) {
          // PACK STRENGTH: strike only what the pack can take
          if (a.nextAttackAt <= now && a.mayAttack(other)) {
            // one hit per cooldown, on the first prey in reach
            a.strike(other);
            if ((HUNTS_MASK[other.typeId] & abit) !== 0) this.fightHit(a, other);
            else other.attacked(a);
            a.nextAttackAt = now + NPC_ATTACK_COOLDOWN_S;
          }
          if (!a.alive) break near;
        }
        if (other.alive && d2 < Ecosystem.BUMP_DIST_SQ) this.bump(a, other, dx, dz, d2, vx, vz);
      }
      if (!a.alive) continue;
      if (!down && a.lookForMate) this.tryMate(a, px, pz);

      const canEat = a.noEatUntil <= now;
      const nPlant = canEat && a.spec.grazes && a.nextBiteAt <= now ? this.plantGrid.queryInto(this._qPlant, px, pz, Ecosystem.CONTACT_QUERY_RADIUS) : 0;
      for (let i = 0; i < nPlant; i++) {
        const plant = this._qPlant[i];
        if (plant.alive &&
          tools.distSq(px, pz, plant.position.x, plant.position.z) < Ecosystem.CONTACT_DIST_SQ) {
          // one bite per cooldown
          a.eatPlant(plant);
          a.nextBiteAt = now + NPC_BITE_COOLDOWN_S;
          break;
        }
      }

      const crate = canEat && a.type === 'human' ? foodBoxes.touching(this._qBox, px, a.position.y, pz) : null;
      if (crate) { a.eatBox(); foodBoxes.eat(crate); }

      if (surfaceFor(a, px, pz) < 0) {
        a.drinkWater();
      }
    }
  }

  // A strikes b: damage scales with a's strength, fighting mass x health (as NPC_FIGHT_REF_STRENGTH), relative to the
  // reference fighter's. Nothing about b changes it.
  fightHit(a, b) {
    const strength = a.fightMassKg() * Math.max(0, a.health);
    this.applyHit(b, a, NPC_FIGHT_DAMAGE_PER_S * NPC_ATTACK_COOLDOWN_S * strength / NPC_FIGHT_REF_STRENGTH);
  }

  // BUMPING, a's side of a pair: b moves half the overlap away, and a's momentum pushes it against its hold.
  bump(a, b, dx, dz, d2, vx, vz) {
    const d = Math.sqrt(d2);
    if (d < 1e-6) return;   // same spot: no direction
    const nx = dx / d, nz = dz / d, half = (NPC_BUMP_DIST - d) / 2;
    const bx = this.fitX(b.position.x + nx * half), bz = this.fitZ(b.position.z + nz * half);
    if (!occ.blockedAt(bx, bz)) this.shove(b, bx, bz);
    const closing = vx * nx + vz * nz;   // m/s a moves toward b
    if (closing > 0) this.applyHit(b, a, 0, Ecosystem.bumpForceN(a.bodyMassKg(), closing));
  }
  // BUMPING: push in newtons, momentum stopped over NPC_BUMP_CONTACT_S
  static bumpForceN(massKg, closingMS) { return massKg * closingMS / NPC_BUMP_CONTACT_S; }

  // BUMP IMPACTS: true on a contact's first touching tick with `body` (not touched the tick before). Later touching
  // ticks are the pair moving together, with no new impact.
  freshContact(body) {
    const fresh = body.contactTick < this.ticks - 1;
    body.contactTick = this.ticks;
    return fresh;
  }
  // BUMP IMPACTS: a pair of massAKg and massBKg closing at closingMS. Fills `out`: impulseNs, the same on both bodies
  // (Newton's third law); pushN, that impulse over NPC_BUMP_CONTACT_S; energyJ, the closing motion's energy; damage, body
  // health lost by each of the pair at BUMP_HEALTH_PER_J.
  static impact(massAKg, massBKg, closingMS, out = Ecosystem._impact) {
    const reducedKg = massAKg * massBKg / (massAKg + massBKg);
    out.impulseNs = reducedKg * closingMS * (1 + BUMP_RESTITUTION);
    out.pushN = out.impulseNs / NPC_BUMP_CONTACT_S;
    out.energyJ = reducedKg * closingMS * closingMS / 2;
    out.damage = Ecosystem.impactDamage(out.energyJ, BUMP_HEALTH_PER_J);
    return out;
  }
  static _impact = { impulseNs: 0, pushN: 0, energyJ: 0, damage: 0 };
  // BUMP IMPACTS: health lost at healthPerJ past BUMP_SAFE_J
  static impactDamage(energyJ, healthPerJ) { return Math.max(0, energyJ - BUMP_SAFE_J) * healthPerJ; }

  // KNOCKDOWNS: every hit and bump comes here. Damage first (a kill feeds the attacker when `feeds`), then pushN
  // against the hold (0 when not braced()). Past it the body falls, away from the push if braced, over toward it if
  // airborne, longer the further past.
  applyHit(target, attacker, damage, pushN = Ecosystem.hitForceN(attacker), feeds = true) {
    if (damage > 0) target.takeHit(attacker, damage, feeds);
    // CORPSES: a killed animal has no hold; it falls from the hit, and addCorpse keeps it down
    if (target instanceof Animal && !target.alive) { if (!target.isDown(this.time)) this.startFall(target, attacker, true, pushN, 0); return; }
    if (!target.knockable()) return;   // dead, or the player out of play or sheltered
    const bracedHoldN = Ecosystem.holdForceN(target);        // hold with feet planted
    const braced = target.braced();   // true: feet planted, it holds and falls away; false: airborne, no hold, legs swept
    const holdN = braced ? bracedHoldN : 0;
    if (!(pushN > holdN)) return;
    const now = this.time;
    // down time scales with the push past the braced hold
    const excess = Math.max(0, pushN / Math.max(bracedHoldN, 1e-9) - 1);
    const downS = Math.min(NPC_DOWN_MAX_S, NPC_DOWN_MIN_S + NPC_DOWN_S_PER_EXCESS * excess);
    if (!target.isDown(now)) this.startFall(target, attacker, braced, pushN, holdN);
    target.downUntil = Math.max(target.downUntil, now + downS);
  }
  // KNOCKDOWNS: a fall starting now. Braced, it topples away from the attacker (backward when facing it); airborne, the
  // push takes its legs, so the upper body pitches over toward the attacker (head first when facing it). The push past
  // the hold is its launch speed.
  startFall(target, attacker, braced, pushN, holdN) {
    target.downAt = this.time;
    const away = braced ? 1 : -1;
    const dx = (target.position.x - attacker.position.x) * away, dz = (target.position.z - attacker.position.z) * away;
    target.downYaw = dx !== 0 || dz !== 0 ? wrapAngle(Math.atan2(dx, dz)) : target.facingAngle + (braced ? Math.PI : 0);
    target.downDV = Math.max(0, pushN - holdN) * NPC_BUMP_CONTACT_S / target.bodyMassKg();
    this.beginFall(target);
  }

  // CORPSES: a dead animal lies where it fell, drawn only, for CORPSE_S. One already falling (a fatal hit) keeps its
  // fall; any other death collapses forward where it stands. The oldest past CORPSE_MAX goes.
  addCorpse(a) {
    const now = this.time;
    if (!a.isDown(now)) { a.downAt = now; a.downYaw = a.facingAngle; a.downDV = 0; this.beginFall(a); }
    a.downUntil = Infinity;   // never rises
    a.moving = false; a.playing = null;
    a.diedAt = now;
    a.corpseUntil = now + CORPSE_S;
    this.corpses.push(a);
    if (this.corpses.length > CORPSE_MAX) this.corpses.shift();
  }
  // CORPSES: drop the ones past their time (oldest first)
  expireCorpses() {
    const c = this.corpses, now = this.time;
    let n = 0;
    while (n < c.length && c[n].corpseUntil <= now) n++;
    if (n > 0) c.splice(0, n);
  }
  // hit push: fighting mass x NPC_HIT_ACCEL_MS2 x condition
  static hitForceN(attacker) { return attacker.fightMassKg() * NPC_HIT_ACCEL_MS2 * attacker.condition(); }
  // hold: fighting mass x NPC_HOLD_ACCEL_MS2 x condition
  static holdForceN(target) { return target.fightMassKg() * NPC_HOLD_ACCEL_MS2 * target.condition(); }

  // Move b to (x, z); a body in a fall moves whole with it.
  shove(b, x, z) {
    if (b.fall) b.fall.body.translate(x - b.position.x, z - b.position.z);
    b.position.x = x; b.position.z = z;
  }

  // FALLS: ragdolls on or off (main's applyCollision); off ends every fall where it is.
  setRagdolls(on) {
    this.ragdolls = on;
    if (!on) this.dropFalls();
  }

  // FALLS: an animal starting to fall gets its body, from its standing pose, launched by the hit (downYaw, downDV).
  // Ragdolls off, the player's avatar (the renderer's) and species without a fall rig keep the lying pose.
  beginFall(a) {
    if (!this.ragdolls || !(a instanceof Animal) || a.fall) return;
    const human = a.type === 'human';   // true: a HumanFall, false: a BoxFall from the type's registered rig
    const rig = human ? null : fallRigs[a.type];
    if (!human && !rig) return;
    const f = (this._fallPools[a.type] ??= []).pop() ?? (human ? new HumanFall() : new BoxFall(rig));
    const kp = a.rigScale();
    const world = this._fallWorld.set(a.position.x, a.originY(), a.position.z);
    const quat = this._fallQuat.setFromAxisAngle(Ecosystem.Y_AXIS, a.facingAngle);
    f.start(a, world, quat, kp, world.y - SPECIES[a.type].lift * kp);
    f.owner = a; f.type = a.type; f.stillS = 0; f.asleep = false;
    a.fall = f;
    this.falls.push(f);
  }
  static Y_AXIS = new THREE.Vector3(0, 1, 0);

  // FALLS, one tick: every body steps (gravity, links, ground, the car's box), kept out of walls and in the world, and
  // its animal is placed where it lies. A body still for FALL_SETTLE_S sleeps until the car's box reaches it. A rising
  // animal's body holds while it gets up (the renderer blends it to standing); a risen animal or a gone corpse ends it.
  stepFalls() {
    const fs = this.falls;
    if (fs.length === 0) return;
    const now = this.time, box = this.fallBox();
    const stillSq = (FALL_SETTLE_MS * NPC_TICK_S) * (FALL_SETTLE_MS * NPC_TICK_S);   // a still step's largest move, squared
    for (let i = fs.length - 1; i >= 0; i--) {
      const f = fs[i], a = f.owner, b = f.body;
      const ended = a.alive ? now >= a.downUntil : a.corpseUntil <= now;   // true: risen, or no longer a shown corpse
      if (ended) { this.endFall(i); continue; }
      if (now >= a.downUntil - NPC_GETUP_S) continue;   // rising where it lies (a corpse's downUntil is Infinity)
      if (f.asleep && box && b.nearBox(box)) { f.asleep = false; f.stillS = 0; }
      if (!f.asleep) {
        b.anchorCentre();
        const fromX = b.cx, fromZ = b.cz;
        b.step(box);
        this.keepFallIn(b, fromX, fromZ);
        f.stillS = b.maxStepSq() < stillSq ? f.stillS + NPC_TICK_S : 0;
        f.asleep = f.stillS >= FALL_SETTLE_S;
      }
      this.placeOnFall(a, b);
    }
  }

  // FALLS: the body kept in the world (wrap or clamp moves it whole) and out of walls, sliding along them like collide:
  // the blocked axis of this step's anchor move is undone and its speed stopped. (fromX, fromZ): the anchors before.
  keepFallIn(b, fromX, fromZ) {
    b.anchorCentre();
    let cx = b.cx, cz = b.cz;
    const fx = this.fitX(cx), fz = this.fitZ(cz);
    if (fx !== cx || fz !== cz) { b.translate(fx - cx, fz - cz); fromX += fx - cx; fromZ += fz - cz; cx = fx; cz = fz; }
    if (!occ.blockedAt(cx, cz)) return;
    if (!occ.blockedAt(cx, fromZ)) { b.translate(0, fromZ - cz); b.stopAxis(false, true); }
    else if (!occ.blockedAt(fromX, cz)) { b.translate(fromX - cx, 0); b.stopAxis(true, false); }
    else { b.translate(fromX - cx, fromZ - cz); b.stopAxis(true, true); }
    b.fitBounds();
  }

  // FALLS: the animal where its body lies: x, z the anchors' centre (hips for people, body for box rigs), its centre
  // height its lift over the body's lowest point (the ground, or the car's roof).
  placeOnFall(a, b) {
    b.anchorCentre();
    a.position.x = b.cx; a.position.z = b.cz;
    a.position.y = b.lowestY() + a.footLift() * NPC_UNIT;
    a.freeX = b.cx; a.freeZ = b.cz;
  }

  // FALLS: fall i ended; its body back to the pool.
  endFall(i) {
    const f = this.falls[i];
    f.owner.fall = null;
    f.owner = null;
    this._fallPools[f.type].push(f);
    this.falls.splice(i, 1);
  }

  // FALLS: every fall ended where it is (a new or cleared world, ragdolls off).
  dropFalls() {
    for (let i = this.falls.length - 1; i >= 0; i--) this.endFall(i);
  }

  // Occupancy-grid wall check: a blocked step slides or is undone.
  collide(a) {
    if (!a.moving || !a.brain) return;
    const p = a.position;
    if (occ.blockedAt(p.x, p.z)) {
      if (!occ.blockedAt(p.x, a.freeZ)) p.z = a.freeZ;
      else if (!occ.blockedAt(a.freeX, p.z)) p.x = a.freeX;
      else { p.x = a.freeX; p.z = a.freeZ; }
    }
    a.freeX = p.x; a.freeZ = p.z;
  }

  step(dt) {
    if (!this.ready || this.animals.length === 0) return false;
    // a provider that drives its own NPCs replaces the sim
    if (providers.active && providers.active.drive) return providers.active.drive(this, dt);
    const now = this.time;
    this.night = simSky.sunAltDeg < NIGHT_SUN_ALT_DEG;

    // Incremental grid sync every 3 ticks.
    if (this.ticks % 3 === 0) {
      const g = this.animalGrid, drops = this._animalGridDrops;
      for (let i = 0; i < drops.length; i++) {
        const d = drops[i];
        if (d._gk >= 0) { g.remove(d, d._gk); d._gk = -1; }
      }
      drops.length = 0;
      for (const a of this.animals) {
        if (!a.alive) {
          if (a._gk >= 0) { g.remove(a, a._gk); a._gk = -1; }
          continue;
        }
        const k = g._cell(a.position.x, a.position.z);
        if (k !== a._gk) {
          if (a._gk >= 0) g.remove(a, a._gk);
          g.place(a, k);
          a._gk = k;
        }
        a._fx = a.position.x; a._fz = a.position.z;
      }
      this.contact.rebuild(this.animals);
      this.drift2 = 0;
    }

    const alive = this.aliveById, fastest = this.fastestHunterMSById;
    alive.fill(0); fastest.fill(0);
    for (let ai = 0; ai < this.animals.length; ai++) {
      const a = this.animals[ai];
      if (a.alive) {
        a.update(now, this.animalGrid);
        if (a.alive) {
          this.collide(a);
          const fx = a.position.x - a._fx, fz = a.position.z - a._fz, f2 = fx * fx + fz * fz;
          if (f2 > this.drift2) this.drift2 = f2;
          alive[a.typeId]++;
          const ms = a.moveSpeed() * NPC_UNIT, prey = HUNTS_LIST[a.typeId];
          for (let k = 0; k < prey.length; k++) if (ms > fastest[prey[k]]) fastest[prey[k]] = ms;
        }
      }
    }
    for (let t = 0; t < NPC_TYPE_COUNT; t++) {
      const prey = HUNTS_LIST[t];
      let any = 0;
      for (let k = 0; k < prey.length; k++) if (alive[prey[k]]) { any = 1; break; }
      this.canHuntById[t] = any;
    }

    // skip the retry pass when nothing waits
    if (plantView.pending) {
      plantView.pending = false;
      for (const p of this.plants) {
        if (p.alive) p.update();
      }
    }

    this.handleCollisions();
    for (const f of this.afterContacts) f(dt);

    this.expireCorpses();
    for (let i = this.animals.length - 1; i >= 0; i--) {
      const a = this.animals[i];
      if (!a.alive) {
        a.remove();
        this._animalGridDrops.push(a);
        this.animals.splice(i, 1);
        // CORPSES: died of health loss (not eaten whole or taken out of the world)
        if (a.health <= Animal.DEATH_HEALTH) this.addCorpse(a);
      }
    }
    // FALLS: after addCorpse, so an animal that died falling keeps its body as a corpse
    this.stepFalls();
    if (this.plantsDied) {
      this.plantsDied = false;
      for (let i = this.plants.length - 1; i >= 0; i--) {
        if (!this.plants[i].alive) {
          this.plants[i].remove();
          this._plantDrops.push(this.plants[i]);
          this.plants.splice(i, 1);
        }
      }
    }

    providers.active.regrow(this);

    return true;
  }

  // The clock advances once main has drawn this tick.
  endTick() { this.ticks++; }
}
export const ecosystem = new Ecosystem();

// GAME SKY: own clock and weather; an Observer preset overrides it.
export const simSky = {
  running: false,              // a world is in play
  DAY_S,                       // real seconds per game day
  OPENING_RAIN_S: 30,
  SPAN: [60, 180],             // seconds each weather lasts
  STEP_S: 0.25,                // sky redraw interval
  KINDS: ['Clear', 'Cloudy', 'Overcast', 'Fog', 'Rain', 'Snow', 'Storm'],
  hour: 15, day: 0, kind: 'Rain', timer: 0, acc: 0, lastNow: 0, shownMinute: -1,

  site: null,   // the world's { lat, lon, offset }
  sunAltDeg: 90,   // drawn sun altitude, degrees
  onSkyStep: null, onMinute: null,   // sky redraw and HUD minute hooks
  get on() { return this.running; },

  start() {
    this.running = true;
    this.hour = presetHour('Afternoon');
    this.day = 0;   // midnights since load (HUD day)
    this.kind = 'Rain';
    this.timer = this.OPENING_RAIN_S;
    this.opening = true;
    this.acc = 0;
    this.lastNow = 0;
    this.shownMinute = -1;
  },
  stop() { this.running = false; },

  // New ecosystem: any hour and weather
  randomize() {
    this.hour = Math.random() * 24;
    this.kind = this.KINDS[Math.floor(Math.random() * this.KINDS.length)];
    this.timer = this.SPAN[0] + Math.random() * (this.SPAN[1] - this.SPAN[0]);
    this.opening = false;
  },

  conditions() { return SKIES[this.kind]; },

  // real time, so a slow frame rate cannot stretch the day
  update(now) {
    if (!this.running || document.hidden) { this.lastNow = 0; return; }
    const dt = this.lastNow ? Math.min(Math.max((now - this.lastNow) / 1000, 0), 5) : 0;
    this.lastNow = now;
    const hours = this.hour + dt * 24 / this.DAY_S;
    this.day += Math.floor(hours / 24);
    this.hour = hours % 24;
    this.timer -= dt;
    let changed = false;
    if (this.timer <= 0) {
      if (this.opening) { this.opening = false; this.kind = 'Clear'; }
      else {
        this.kind = this.KINDS[Math.floor(Math.random() * this.KINDS.length)];
      }
      this.timer = this.SPAN[0] + Math.random() * (this.SPAN[1] - this.SPAN[0]);
      changed = true;
    }
    this.acc += dt;
    if (changed || this.acc >= this.STEP_S) {
      this.acc = 0;
      this.onSkyStep();
    }
    // the HUD clock reads game minutes
    const minute = Math.floor(this.hour * 60);
    if (changed || minute !== this.shownMinute) { this.shownMinute = minute; this.onMinute(); }
  }
};

export function presetHour(name) { return FALLBACK_HOURS[name]; }