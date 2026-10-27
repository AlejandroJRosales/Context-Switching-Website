// 7-sim.js: SIM. The artificial life and the game clock: brains, entities, the ecosystem, the sky clock.
// Owns: BrainFactory (brains), SpikingNetwork, maskLists, Entity, Animal (with the human look genetics: humanLook,
// packHumanLook, inheritHumanLook; fight helpers startFightMove, humanFightAct, sampleFightKeys; humanMassKg,
// personInfoKey, personInfoFields), Plant and plantView, Ecosystem (ecosystem), simSky (game clock and weather, the
// site and the drawn sun altitude) with presetHour.
// May import: 1-config.js to 6-worlds.js and three. It never calls the render, player, game or main layers: they
// read its state, draw after step (then endTick), fill its hooks (afterContacts, avatar, plantView, simSky.onSkyStep
// and onMinute) and wrap initialize and clear (populate, clearEcosystem).
// Config blocks it reads: NPC, fight moves and pounces, species, sizes, brain, plants, food boxes, sky presets.
import * as THREE from 'three';
import {
  RUN_SPEED, STEP_UP, NPC_TICK_S, DIET_WATER_SHARE, PLANT_SIGHT_CELL, NPC_CONTACT_CELL, DEER_CRUISE, DEER_THINK_TICKS,
  DEER_SPRINT_DIST, DEER_SPRINT_OVER, DEER_SPRINT_ENERGY, NPC_SUBSTEP, DEER_EXPLORE_P, NPC_ATTACK_COOLDOWN_S,
  NPC_ATTACK_DAMAGE_PER_S, NPC_BITE_COOLDOWN_S, NPC_HIT_NO_EAT_S, PLANT_MAX_HEALTH, PLANT_BITE_NUTRITION,
  NPC_FIGHT_DAMAGE_PER_S, NPC_FIGHT_REF_STRENGTH, NPC_FIGHT_HOLD_PAD_S, NPC_FIGHT_MOVES, NIGHT_SUN_ALT_DEG,
  PREY_SIZE_STEP_KG, NPC_POUNCES, POUNCE_LAND_SHORT, FIGHT_KEY_FIELDS, NPC_AGE_DEPLETION_RATE, DEER_REPRO_SHARE,
  MATE_TIME_MULT, REPRO_NEED_MAX, NPC_MATURITY_TICKS, GROWTH_MIN_SCALE, NPC_ADULT_AGE, NPC_TICKS_PER_YEAR,
  NPC_START_AGE, HUMAN_TURN_RATE, NPC_UNIT, NPC_RADIUS, NPC_COLLIDE_H, NPC_SPAWN_GAP, NPC_SIZE, NPC_SIZE_Z_MAX,
  NPC_SIZE_HERITABILITY, NPC_SHOWN_BMI, NPC_REF_MASS_KG, SPECIES, NPC_TYPE_IDS, NPC_TYPE_COUNT, HUNTS_MASK,
  HUNTED_BY_MASK, NIGHT_PREY_MASK, HUNTS_LIST, FOOD_TYPE_ID, WATER_SIGHT_CELL, LIF_LEAK, LIF_THRESHOLD, LIF_RESET,
  TAG_DECAY, DA_TONIC_RATE, BRAIN_LEARNING_RATE, BRAIN_WEIGHT_DECAY, HEADING_JITTER, HUMAN_FACE_VARIANTS,
  HUMAN_OUTFITS, HUMAN_SKIN, HUMAN_SHIRTS, HUMAN_PANTS, HUMAN_SUITS, CAR_GLANCE, CAR_ALIGN, FALLBACK_HOURS, SKIES,
  NPC_DRINK_SECONDS
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

// Fight state shared by animals and the player's avatar: moveAt (start of the move playing), playing (that move:
// a fight move or a pounce; drawn by the renderer), moveSide (people's punching arm, +1 left / -1 right),
// fightFrom / fightUntil (the hold). A move still playing is not restarted.
export function startFightMove(f, move, now) {
  if (now - f.moveAt >= (f.playing ?? move).moveS) { f.moveAt = now; f.playing = move; f.moveSide = -f.moveSide; }
  if (now >= f.fightUntil) f.fightFrom = now;
  const holdS = move.flees ? move.moveS : Math.max(move.moveS, NPC_ATTACK_COOLDOWN_S + NPC_FIGHT_HOLD_PAD_S);
  f.fightUntil = Math.max(f.fightUntil, now + holdS);
}

// A person's iAct at `now` into out[o..o+3]: punch reach (0..1), punching arm, guard share (0..1), unused.
export function humanFightAct(f, now, out, o) {
  const m = NPC_FIGHT_MOVES.human, u = (now - f.moveAt) / m.moveS;
  out[o] = u >= 0 && u < 1 ? (u < m.peak ? fightEase(u / m.peak) : 1 - fightEase((u - m.peak) / (1 - m.peak))) : 0;
  out[o + 1] = f.moveSide;
  out[o + 2] = fightClamp01((f.fightUntil - now) / m.guardEaseS) * fightClamp01((now - f.fightFrom) / m.guardEaseS);
  out[o + 3] = 0;
}
export function sampleFightKeys(keys, u, out) {
  let i = 0;
  while (i < keys.length - 2 && u > keys[i + 1].t) i++;
  const a = keys[i], b = keys[i + 1], f = fightEase(fightClamp01((u - a.t) / (b.t - a.t)));
  for (const k of FIGHT_KEY_FIELDS) out[k] = a[k] + (b[k] - a[k]) * f;
  return out;
}
// A person's mass in kg: BMI x build^2 x height^2 (people's stats readout, fights and the player's body all use it).
export function humanMassKg(sex, buildDev, heightM) {
  const build = 1 + buildDev;
  return NPC_SHOWN_BMI[sex] * build * build * heightM * heightM;
}
// A person's stats readout (people's labels and the player's Survivor panel): age, sex, height, weight, in that order.
// The key packs what can change (age in whole years or -1 for a child, height in inches, weight in lb), so a
// display redraws only when it changes; heightM is the crown height as drawn.
export function personInfoKey(age, sex, buildDev, heightM) {
  const lb = Math.round(humanMassKg(sex, buildDev, heightM) * 2.20462);
  const inches = Math.round(heightM / 0.0254);
  return ((age + 2) * 1000 + inches) * 10000 + lb;
}
// the readout's fields in order; each display joins them its own way (labels with commas, the panel spaced out)
export function personInfoFields(key, sex) {
  const lb = key % 10000, inches = Math.floor(key / 10000) % 1000, age = Math.floor(key / 1e7) - 2;
  return [`Age ${age < 0 ? '<' + NPC_ADULT_AGE : age}`, sex === 'male' ? 'M' : 'F', `${Math.floor(inches / 12)}'${inches % 12}"`, `${lb} lb`];
}

export class BrainFactory {
  constructor() {
    this.LOBE_SIZE_MIN = 4;
    this.LOBE_SIZE_MAX = 10;
    this.LOBE_SPARSITY = 0.20;
    // TOPOLOGY MUTATION at birth, scaled by the child's mutationMulti (0.5 = these rates)
    this.LOBE_RESIZE_P = 0.1;      // chance per lobe of gaining or losing one neuron
    this.SYNAPSE_FLIP_P = 0.01;    // chance per possible synapse of being added or removed
  }

  // Copy of a [pre * nPost + post] mask at a new size; entries for new neurons are drawn at LOBE_SPARSITY.
  resizeMask(mask, nPre, nPost, newPre, newPost) {
    if (nPre === newPre && nPost === newPost) return mask.slice();
    const out = new Uint8Array(newPre * newPost);
    for (let i = 0; i < newPre; i++) {
      for (let j = 0; j < newPost; j++) {
        out[i * newPost + j] = i < nPre && j < nPost
          ? mask[i * nPost + j]
          : (Math.random() < this.LOBE_SPARSITY ? 1 : 0);
      }
    }
    return out;
  }

  // Flip each entry with probability p, keeping at least one synapse; true if anything changed.
  flipMask(mask, p) {
    let changed = false, on = 0;
    for (let k = 0; k < mask.length; k++) {
      if (Math.random() < p) { mask[k] ^= 1; changed = true; }
      on += mask[k];
    }
    if (on === 0) { mask[Math.floor(Math.random() * mask.length)] = 1; changed = true; }
    return changed;
  }

  // A child's wiring: the parent's masks with lobes resized by one neuron and synapses flipped now and then.
  // Returns the parent's own masks object when nothing changed, so unchanged children share its synapse lists.
  mutateMasks(m, I, O, strength) {
    const resizeP = Math.min(1, this.LOBE_RESIZE_P * strength);
    const flipP = Math.min(0.5, this.SYNAPSE_FLIP_P * strength);
    const resize = n => {
      if (Math.random() >= resizeP) return n;
      const d = Math.random() < 0.5 ? -1 : 1;
      return Math.max(this.LOBE_SIZE_MIN, Math.min(this.LOBE_SIZE_MAX, n + d));
    };
    const NA = m.lobeSizeA, NB = m.lobeSizeB, nA = resize(NA), nB = resize(NB);
    const c = {
      lobeSizeA: nA, lobeSizeB: nB,
      maskIA: this.resizeMask(m.maskIA, I, NA, I, nA),
      maskIB: this.resizeMask(m.maskIB, I, NB, I, nB),
      maskAB: this.resizeMask(m.maskAB, NA, NB, nA, nB),
      maskBA: this.resizeMask(m.maskBA, NB, NA, nB, nA),
      maskAO: this.resizeMask(m.maskAO, NA, O, nA, O),
      maskBO: this.resizeMask(m.maskBO, NB, O, nB, O),
    };
    let changed = nA !== NA || nB !== NB;
    for (const k of ['maskIA', 'maskIB', 'maskAB', 'maskBA', 'maskAO', 'maskBO']) {
      if (this.flipMask(c[k], flipP)) changed = true;
    }
    return changed ? c : m;
  }

  randLobeSize() {
    return this.LOBE_SIZE_MIN + Math.floor(Math.random() * (this.LOBE_SIZE_MAX - this.LOBE_SIZE_MIN + 1));
  }

  makeSparseMask(inD, outD, sparsity) {
    const mask = new Uint8Array(inD * outD);
    const total = inD * outD;
    const target = Math.max(1, Math.round(total * sparsity));
    const indices = new Int32Array(total);
    for (let i = 0; i < total; i++) indices[i] = i;
    for (let i = 0; i < target; i++) {
      const j = i + Math.floor(Math.random() * (total - i));
      const tmp = indices[i]; indices[i] = indices[j]; indices[j] = tmp;
      mask[indices[i]] = 1;
    }
    return mask;
  }

  makeMaskedWeights(inD, outD, mask) {
    const limit = Math.sqrt(6.0 / (inD + outD));
    const w = new Float32Array(inD * outD);
    for (let k = 0; k < w.length; k++) {
      if (mask[k]) w[k] = tools.random(-limit, limit);
    }
    return w;
  }

  // Standard normal sample (Box-Muller), unclamped.
  gauss() {
    let u;
    do { u = Math.random(); } while (u === 0);
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * Math.random());
  }

}

// ACTIVE-SYNAPSE LISTS for a mask laid out [pre * nPost + post]: `idx`, the set entries in ascending order (as the
// dense loops visit them), and per post neuron its entries by ascending pre (colStart / colPre / colK), the order
// propagate sums in. Masks never change after creation and children share their parent's, so one list per mask.
export const _maskLists = new WeakMap();
export function maskLists(mask, nPre, nPost) {
  let L = _maskLists.get(mask);
  if (L) return L;
  let n = 0;
  for (let k = 0; k < mask.length; k++) if (mask[k]) n++;
  const idx = new Int32Array(n), pre = new Int32Array(n), post = new Int32Array(n);
  n = 0;
  for (let k = 0; k < mask.length; k++) if (mask[k]) { idx[n] = k; pre[n] = (k / nPost) | 0; post[n] = k - pre[n] * nPost; n++; }
  const colStart = new Int32Array(nPost + 1), colPre = new Int32Array(n), colK = new Int32Array(n);
  for (let m = 0; m < n; m++) colStart[post[m] + 1]++;
  for (let i = 0; i < nPost; i++) colStart[i + 1] += colStart[i];
  const fill = colStart.slice(0, nPost);
  for (let m = 0; m < n; m++) { const c = fill[post[m]]++; colPre[c] = pre[m]; colK[c] = idx[m]; }
  L = { idx, pre, post, colStart, colPre, colK };
  _maskLists.set(mask, L);
  return L;
}

export class SpikingNetwork {
  constructor(inputDims, learningRate = BRAIN_LEARNING_RATE, weightDecay = BRAIN_WEIGHT_DECAY, masks = null) {
    this.inputDims = inputDims;
    this.outputDims = 8;
    this.learningRate = learningRate;
    this.weightDecay = weightDecay;
    this.output = null;
    this.turnAngle = 0;
    this.input = new Float32Array(inputDims);   // last inputs read (the brain view shows them)

    const I = inputDims;
    const O = this.outputDims;

    if (masks) {
      this.lobeSizeA = masks.lobeSizeA;
      this.lobeSizeB = masks.lobeSizeB;
    } else {
      this.lobeSizeA = brains.randLobeSize();
      this.lobeSizeB = brains.randLobeSize();
    }
    const NA = this.lobeSizeA;
    const NB = this.lobeSizeB;

    if (masks) {
      this.maskIA = masks.maskIA;
      this.maskIB = masks.maskIB;
      this.maskAB = masks.maskAB;
      this.maskBA = masks.maskBA;
      this.maskAO = masks.maskAO;
      this.maskBO = masks.maskBO;
    } else {
      this.maskIA = brains.makeSparseMask(I, NA, brains.LOBE_SPARSITY);
      this.maskIB = brains.makeSparseMask(I, NB, brains.LOBE_SPARSITY);
      this.maskAB = brains.makeSparseMask(NA, NB, brains.LOBE_SPARSITY);
      this.maskBA = brains.makeSparseMask(NB, NA, brains.LOBE_SPARSITY);
      this.maskAO = brains.makeSparseMask(NA, O, brains.LOBE_SPARSITY);
      this.maskBO = brains.makeSparseMask(NB, O, brains.LOBE_SPARSITY);
    }

    this.lIA = maskLists(this.maskIA, I, NA);
    this.lIB = maskLists(this.maskIB, I, NB);
    this.lAB = maskLists(this.maskAB, NA, NB);
    this.lBA = maskLists(this.maskBA, NB, NA);
    this.lAO = maskLists(this.maskAO, NA, O);
    this.lBO = maskLists(this.maskBO, NB, O);

    this.wIA = brains.makeMaskedWeights(I, NA, this.maskIA);
    this.wIB = brains.makeMaskedWeights(I, NB, this.maskIB);
    this.wAB = brains.makeMaskedWeights(NA, NB, this.maskAB);
    this.wBA = brains.makeMaskedWeights(NB, NA, this.maskBA);
    this.wAO = brains.makeMaskedWeights(NA, O, this.maskAO);
    this.wBO = brains.makeMaskedWeights(NB, O, this.maskBO);

    this.biasA = new Float32Array(NA);
    this.biasB = new Float32Array(NB);
    this.biasO = new Float32Array(O);

    // Plasticity state: a tag per synapse and bias, an activity average per neuron, tonic dopamine.
    this.eIA = new Float32Array(I * NA);
    this.eIB = new Float32Array(I * NB);
    this.eAB = new Float32Array(NA * NB);
    this.eBA = new Float32Array(NB * NA);
    this.eAO = new Float32Array(NA * O);
    this.eBO = new Float32Array(NB * O);
    this.eBiasA = new Float32Array(NA);
    this.eBiasB = new Float32Array(NB);
    this.eBiasO = new Float32Array(O);
    this.caA = new Float32Array(NA);
    this.caB = new Float32Array(NB);
    this.caO = new Float32Array(O);
    this.fA = new Float32Array(NA);      // post factor this step: activity minus its average
    this.fB = new Float32Array(NB);
    this.fO = new Float32Array(O);
    this.prevB = new Float32Array(NB);   // B spikes that A read this step (one-step lag)
    this.daTonic = 0;

    this.hA = new Float32Array(NA);      // membranes
    this.hB = new Float32Array(NB);
    this.actA = new Float32Array(NA);    // spikes, 0 or 1
    this.actB = new Float32Array(NB);
    this.actO = new Float32Array(O);     // softmax over the output ring

    this.prefSin = new Float32Array(O);
    this.prefCos = new Float32Array(O);
    for (let i = 0; i < O; i++) {
      const phi = (i / O) * Math.PI * 2;
      this.prefSin[i] = Math.sin(phi);
      this.prefCos[i] = Math.cos(phi);
    }
  }

  getMasks() {
    return {
      lobeSizeA: this.lobeSizeA, lobeSizeB: this.lobeSizeB,
      maskIA: this.maskIA, maskIB: this.maskIB,
      maskAB: this.maskAB, maskBA: this.maskBA,
      maskAO: this.maskAO, maskBO: this.maskBO,
    };
  }

  // One LIF step: leak, add the weighted input, spike (1) and reset at threshold, else 0.
  static lifStep(h, act, i, net) {
    const v = h[i] * LIF_LEAK + net;
    if (v >= LIF_THRESHOLD) { act[i] = 1; h[i] = LIF_RESET; }
    else { act[i] = 0; h[i] = v; }
  }

  propagate(inp) {
    const NA = this.lobeSizeA, NB = this.lobeSizeB, O = this.outputDims;
    const actA = this.actA, actB = this.actB, actO = this.actO;
    const lIA = this.lIA, lIB = this.lIB, lAB = this.lAB, lBA = this.lBA, lAO = this.lAO, lBO = this.lBO;
    const wIA = this.wIA, wIB = this.wIB, wAB = this.wAB, wBA = this.wBA, wAO = this.wAO, wBO = this.wBO;

    // A first: inputs plus B's spikes from the previous step
    for (let i = 0; i < NA; i++) {
      let net = this.biasA[i];
      for (let m = lIA.colStart[i], mEnd = lIA.colStart[i + 1]; m < mEnd; m++) net += wIA[lIA.colK[m]] * inp[lIA.colPre[m]];
      for (let m = lBA.colStart[i], mEnd = lBA.colStart[i + 1]; m < mEnd; m++) net += wBA[lBA.colK[m]] * actB[lBA.colPre[m]];
      SpikingNetwork.lifStep(this.hA, actA, i, net);
    }

    // B: inputs plus A's spikes from this step
    for (let i = 0; i < NB; i++) {
      let net = this.biasB[i];
      for (let m = lIB.colStart[i], mEnd = lIB.colStart[i + 1]; m < mEnd; m++) net += wIB[lIB.colK[m]] * inp[lIB.colPre[m]];
      for (let m = lAB.colStart[i], mEnd = lAB.colStart[i + 1]; m < mEnd; m++) net += wAB[lAB.colK[m]] * actA[lAB.colPre[m]];
      SpikingNetwork.lifStep(this.hB, actB, i, net);
    }

    for (let i = 0; i < O; i++) {
      let net = this.biasO[i];
      for (let m = lAO.colStart[i], mEnd = lAO.colStart[i + 1]; m < mEnd; m++) net += wAO[lAO.colK[m]] * actA[lAO.colPre[m]];
      for (let m = lBO.colStart[i], mEnd = lBO.colStart[i + 1]; m < mEnd; m++) net += wBO[lBO.colK[m]] * actB[lBO.colPre[m]];
      actO[i] = net;
    }

    let maxV = actO[0];
    for (let i = 1; i < O; i++) if (actO[i] > maxV) maxV = actO[i];
    let sum = 0;
    for (let i = 0; i < O; i++) { actO[i] = Math.exp(actO[i] - maxV); sum += actO[i]; }
    for (let i = 0; i < O; i++) actO[i] /= sum;
    return actO;
  }

  // Returns the turn (radians, relative to facing): the direction of forward plus the output ring's population vector,
  // plus jitter. A flat ring (no preference) keeps going straight; a confident ring turns up to nearly 90 degrees per decision.
  think(inputs) {
    this.input.set(inputs);
    this.prevB.set(this.actB);
    const values = this.propagate(inputs);

    const O = this.outputDims;
    let vx = 0, vz = 0;
    for (let i = 0; i < O; i++) { vx += values[i] * this.prefSin[i]; vz += values[i] * this.prefCos[i]; }
    let turn = Math.atan2(vx, 1 + vz);
    // exploration: the turn taken deviates a little from the one the brain chose, and the tags credit what was taken
    turn += (Math.random() * 2 - 1) * HEADING_JITTER;
    const TWO_PI = Math.PI * 2;
    turn = ((turn % TWO_PI) + TWO_PI) % TWO_PI;
    this.turnAngle = turn;
    this.output = Math.round(turn / TWO_PI * O) % O;
    this.tagSynapses(inputs, turn);
    return turn;
  }

  // SYNAPTIC TAGGING, once per think(): each decaying tag = pre activity x (post activity - its recent average).
  // Outputs count as active by how well their turn matches the one taken, so reward credits the ones that pulled that way.
  tagSynapses(inp, turn) {
    const NA = this.lobeSizeA, NB = this.lobeSizeB, O = this.outputDims;
    const d = TAG_DECAY, g = 1 - d;
    const fA = this.fA, fB = this.fB, fO = this.fO;

    for (let i = 0; i < NA; i++) {
      const a = this.actA[i];
      fA[i] = a - this.caA[i];
      this.caA[i] = this.caA[i] * d + g * a;
    }
    for (let i = 0; i < NB; i++) {
      const a = this.actB[i];
      fB[i] = a - this.caB[i];
      this.caB[i] = this.caB[i] * d + g * a;
    }
    const ts = Math.sin(turn), tc = Math.cos(turn);
    for (let i = 0; i < O; i++) {
      const tuned = this.prefSin[i] * ts + this.prefCos[i] * tc;   // cos(preferred - turn)
      const a = tuned > 0 ? tuned : 0;
      fO[i] = a - this.caO[i];
      this.caO[i] = this.caO[i] * d + g * a;
    }

    this._tag(this.eIA, this.lIA, inp, fA, d, g);
    this._tag(this.eIB, this.lIB, inp, fB, d, g);
    this._tag(this.eBA, this.lBA, this.prevB, fA, d, g);
    this._tag(this.eAB, this.lAB, this.actA, fB, d, g);
    this._tag(this.eAO, this.lAO, this.actA, fO, d, g);
    this._tag(this.eBO, this.lBO, this.actB, fO, d, g);

    // a bias is a weight from a constant input of 1
    for (let i = 0; i < NA; i++) this.eBiasA[i] = this.eBiasA[i] * d + g * fA[i];
    for (let i = 0; i < NB; i++) this.eBiasB[i] = this.eBiasB[i] * d + g * fB[i];
    for (let i = 0; i < O; i++) this.eBiasO[i] = this.eBiasO[i] * d + g * fO[i];
  }

  // Weights are laid out [pre * nPost + post], as in propagate; only the mask's synapses, in ascending order.
  _tag(e, L, pre, post, d, g) {
    const idx = L.idx, pr = L.pre, po = L.post;
    for (let m = 0; m < idx.length; m++) {
      const k = idx[m];
      e[k] = e[k] * d + (g * pre[pr[m]]) * post[po[m]];
    }
  }

  _stepWeights(w, e, L, gain, keep) {
    const idx = L.idx;
    for (let m = 0; m < idx.length; m++) {
      const k = idx[m];
      w[k] = w[k] * keep + gain * e[k];
    }
  }

  _stepBias(b, e, gain, keep) {
    for (let k = 0; k < b.length; k++) b[k] = b[k] * keep + gain * e[k];
  }

  // THIRD FACTOR (dopamine): reward minus its expected level turns tags into lasting change (burst) or reverses them (dip).
  adjustWeights(reward) {
    const da = reward - this.daTonic;
    this.daTonic += DA_TONIC_RATE * da;
    const gain = this.learningRate * da;
    const keep = 1 - this.weightDecay;

    this._stepWeights(this.wIA, this.eIA, this.lIA, gain, keep);
    this._stepWeights(this.wIB, this.eIB, this.lIB, gain, keep);
    this._stepWeights(this.wAB, this.eAB, this.lAB, gain, keep);
    this._stepWeights(this.wBA, this.eBA, this.lBA, gain, keep);
    this._stepWeights(this.wAO, this.eAO, this.lAO, gain, keep);
    this._stepWeights(this.wBO, this.eBO, this.lBO, gain, keep);
    this._stepBias(this.biasA, this.eBiasA, gain, keep);
    this._stepBias(this.biasB, this.eBiasB, gain, keep);
    this._stepBias(this.biasO, this.eBiasO, gain, keep);
  }
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

export class Animal extends Entity {
  static TWO_PI = TWO_PI;
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
    this.setSizeZ(brains.gauss());
    this.look = type === 'human' ? humanLook(this.sex) : null;   // appearance (render only), kept for life
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
    this.priority = null;          // deer: 'predator', 'hunt', 'food', 'water', 'mate', or null while exploring
    this.speedScale = 1;
    this.sprinting = false;
    this.nextAttackAt = 0;   // sim seconds: when this hunter may attack again
    this.nextBiteAt = 0;     // sim seconds: when this grazer may bite a plant again
    this.noEatUntil = 0;     // sim seconds: eating is blocked until then after being hit
    // fight move and hold (startFightMove); while ecosystem.time < fightUntil the animal takes no steps
    this.moveAt = -Infinity; this.playing = null; this.moveSide = 1; this.fightFrom = 0; this.fightUntil = 0;
    this.quarry = null;      // night hunts: the animal or player avatar being chased (priority 'hunt')
    this.pounceAt = -Infinity;   // sim seconds: start of the current or last pounce (NPC_POUNCES)
    this.nextPounceAt = 0;       // sim seconds: when this hunter may pounce again
    this.fleeFrom = null;    // who a fleeing species' move answered; it runs from them once the move ends
    this.fleeUntil = 0;      // sim seconds: a fleeing species plays no new move until then
    this.bumpScale = 1;

    // no target reads as distance 1 (the edge of sight), never 0, which would mean touching it
    this.rayFoodSin = 0; this.rayFoodCos = 0; this.rayFoodElev = 0; this.rayFoodDist = 1;
    this.rayWaterSin = 0; this.rayWaterCos = 0; this.rayWaterElev = 0; this.rayWaterDist = 1;
    this.rayPredatorSin = 0; this.rayPredatorCos = 0; this.rayPredatorElev = 0; this.rayPredatorDist = 1;
    this.rayMateSin = 0; this.rayMateCos = 0; this.rayMateElev = 0; this.rayMateDist = 1;

    this.brain = spec.brain ? new SpikingNetwork(Animal.INPUT_DIMS) : null;
    this.ACTION_HOLD = spec.brain ? 60 : DEER_THINK_TICKS;
    this.actionTimer = Math.floor(Math.random() * this.ACTION_HOLD);
    // City: heading in radians, direction (sin, cos) in (x, z); people turn toward targetHeading.
    this.heading = Math.random() * Animal.TWO_PI;
    this.targetHeading = this.heading;
    this.moving = true;
    this.facingAngle = this.heading;
    this.prevHealth = this.health;
    this.prevWaterNeed = this.waterNeed;
    this.prevFoodNeed = this.foodNeed;
    this._inputs = new Float32Array(Animal.INPUT_DIMS);

    this.isAdult = true;
    this.birthTick = 0;
    // age in years at ageBaseTick: a random adult age when spawned, NPC_ADULT_AGE when a child matures
    this.ageBaseTick = ecosystem.ticks;
    this.ageBase = NPC_START_AGE[0] + Math.random() * (NPC_START_AGE[1] - NPC_START_AGE[0]);

    this.animTime = Math.random() * Math.PI * 2;
    // people's gait (render only, AnimalRenderer.stepGait): phase advanced by distance walked, swing and run share from speed
    this.gaitPhase = Math.random() * Animal.TWO_PI;
    this.gaitSwing = 0; this.gaitRun = 0; this.gaitSpeed = 0;
    this.gaitX = NaN; this.gaitZ = NaN;

    this.focusX = this.position.x;
    this.focusZ = this.position.z;
    this.tob = ecosystem.time;   // time of birth, sim seconds

    this._hx = NaN; this._hz = NaN; this._hv = -1; this._h = 0;

    // City: last wall-clear position, the fallback in Ecosystem.collide
    this.freeX = this.position.x; this.freeZ = this.position.z;
    this._fx = NaN; this._fz = NaN;

    this.mesh = null;
    this.home = null;
    this._gk = -1;   // Ecosystem.animalGrid bucket this animal is filed under, -1 when not filed
  }

  remove() { }

  setFov(h, v) {
    this.fovH = tools.clamp(h, Animal.FOV_H_MIN, Animal.FOV_H_MAX);
    this.fovV = tools.clamp(v, Animal.FOV_V_MIN, Animal.FOV_V_MAX);
    this.cosFovH = Math.cos(this.fovH);
    this.tanFovV = Math.tan(this.fovV);
  }

  // City: body-centre height above the feet in Arena units, from the rig; scales with heightScale.
  footLift() {
    const hs = this.heightScale;
    return this.spec.lift * hs;
  }

  eyeY() {
    return this.position.y + this.eyeOffset * this.heightScale * NPC_UNIT;
  }

  senseTarget(px, py, pz, ax, az, cosH, tanV, tx, ty, tz) {
    const dx = tx - px, dy = ty - py, dz = tz - pz;
    const h2 = dx * dx + dz * dz;
    if (h2 === 0) return false;
    const d3sq = h2 + dy * dy;
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

  // Brained senses (vision cone): hunted types are food, hunters are predators, plants food, opposite-sex kin mates, water.
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

    // Buckets read in place; the horizontal-distance reject matches senseTarget's, so what is sensed is unchanged.
    const r = this.visionDistance;
    const gCells = grid.cells;
    const gcs = grid.cellSize, gcols = grid.cols, grows = grid.rows;
    const gcx0 = Math.floor((px - r) / gcs), gcx1 = Math.floor((px + r) / gcs);
    const gcy0 = Math.floor((pz - r) / gcs), gcy1 = Math.floor((pz + r) / gcs);
    if (gCells !== null) for (let gcy = gcy0; gcy <= gcy1; gcy++) {
      const grow = (((gcy % grows) + grows) % grows) * gcols;
      for (let gcx = gcx0; gcx <= gcx1; gcx++) {
        const bucket = gCells[grow + ((gcx % gcols) + gcols) % gcols];
        if (bucket === null) continue;
        for (let _i = 0; _i < bucket.length; _i++) {
      const obj = bucket[_i];
      if (obj === this) continue;
      const ox = obj.position.x, oy = obj.position.y, oz = obj.position.z;
      const hx = ox - px, hz = oz - pz;
      if (hx * hx + hz * hz > vd) continue;
      const oid = obj.typeId, obit = 1 << oid;
      const isPred = (huntedBy & obit) !== 0;
      const isFood = (hunts & obit) !== 0;
      const isMate = oid === tid && this.sex !== obj.sex;
      if (!isPred && !isFood && !isMate) continue;
      if (!this.senseTarget(px, py, pz, ax, az, cosH, tanV, ox, oy, oz)) continue;

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
      }
    }

    // City: in Survivor mode the player is a predator too, to whatever people hunt (game.avatar decides)
    const gp = ecosystem.avatar;
    if (gp.isThreatTo(tid) &&
      this.senseTarget(px, py, pz, ax, az, cosH, tanV, gp.position.x, gp.position.y, gp.position.z) &&
      hit.d3sq < bestPredDist) {
      bestPredDist = hit.d3sq;
      this.memPredatorX = gp.position.x; this.memPredatorY = gp.position.y; this.memPredatorZ = gp.position.z;
      this.hasPredator = true;
      this.rayPredatorSin = hit.sin; this.rayPredatorCos = hit.cos;
      this.rayPredatorElev = hit.elev; this.rayPredatorDist = hit.dist;
    }

    // City: plants are food for people too (nearer of plant and animal wins), read in place from the sight grid.
    const ps = ecosystem.plantSight, pCells = ps.cells;
    const pcs = ps.cellSize, pcols = ps.cols, prows = ps.rows;
    const pcx0 = Math.floor((px - r) / pcs), pcx1 = Math.floor((px + r) / pcs);
    const pcy0 = Math.floor((pz - r) / pcs), pcy1 = Math.floor((pz + r) / pcs);
    if (pCells !== null) for (let pcy = pcy0; pcy <= pcy1; pcy++) {
      const prow = (((pcy % prows) + prows) % prows) * pcols;
      for (let pcx = pcx0; pcx <= pcx1; pcx++) {
        const bucket = pCells[prow + ((pcx % pcols) + pcols) % pcols];
        if (bucket === null) continue;
        for (let _i = 0; _i < bucket.length; _i++) {
          const plant = bucket[_i];
          if (!plant.alive) continue;
          const qx = plant.position.x - px, qz = plant.position.z - pz;
          if (qx * qx + qz * qz > vd) continue;
          if (!this.senseTarget(px, py, pz, ax, az, cosH, tanV,
            plant.position.x, plant.position.y, plant.position.z)) continue;
          if (hit.d3sq < bestFoodDist) {
            bestFoodDist = hit.d3sq;
            this.memFoodX = plant.position.x; this.memFoodY = plant.position.y; this.memFoodZ = plant.position.z;
            this.hasFood = true;
            this.rayFoodSin = hit.sin; this.rayFoodCos = hit.cos;
            this.rayFoodElev = hit.elev; this.rayFoodDist = hit.dist;
          }
        }
      }
    }

    // food boxes are food for people: the nearest of animal, plant and crate wins
    if (type === 'human' && foodBoxes.list.length) {
      const nBox = foodBoxes.sight.queryInto(ecosystem._qBox, px, pz, this.visionDistance);
      for (let _i = 0; _i < nBox; _i++) {
        const bp = ecosystem._qBox[_i].position;
        if (!this.senseTarget(px, py, pz, ax, az, cosH, tanV, bp.x, bp.y, bp.z)) continue;
        if (hit.d3sq < bestFoodDist) {
          bestFoodDist = hit.d3sq;
          this.memFoodX = bp.x; this.memFoodY = bp.y; this.memFoodZ = bp.z;
          this.hasFood = true;
          this.rayFoodSin = hit.sin; this.rayFoodCos = hit.cos;
          this.rayFoodElev = hit.elev; this.rayFoodDist = hit.dist;
        }
      }
    }

    // water, from the sight grid of the provider's water sources
    const nWater = ecosystem.waterSight.queryInto(ecosystem._qWater, px, pz, this.visionDistance);
    for (let _i = 0; _i < nWater; _i++) {
      const wp = ecosystem._qWater[_i].position;
      const qx = wp.x - px, qz = wp.z - pz;
      if (qx * qx + qz * qz > vd) continue;
      if (!this.senseTarget(px, py, pz, ax, az, cosH, tanV, wp.x, wp.y, wp.z)) continue;
      if (hit.d3sq < bestWaterDist) {
        bestWaterDist = hit.d3sq;
        this.memWaterX = wp.x; this.memWaterY = wp.y; this.memWaterZ = wp.z;
        this.hasWater = true;
        this.rayWaterSin = hit.sin; this.rayWaterCos = hit.cos;
        this.rayWaterElev = hit.elev; this.rayWaterDist = hit.dist;
      }
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

  // Remembered targets: ray (world-frame sin, cos, elevation, distance) from the current eye to the remembered spot,
  // so a target walked past keeps pointing where it is, not where it was when last seen.
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

  // World-frame (sin, cos) of a target rotated into the body's frame: (0, 1) is straight ahead, sin > 0 to the right
  // of facing as atan2(x, z) measures it. No target (0, 0) stays (0, 0).
  static egoSin(s, c, fs, fc) { return s * fc - c * fs; }
  static egoCos(s, c, fs, fc) { return c * fc + s * fs; }

  think(grid) {
    this.locate(grid);
    const inp = this._inputs;

    // directions relative to facing, so "food ahead and to the left" means the same thing whichever way the body points
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

  // DEER AND COYOTE AI (species.py): thinkDeer picks the top known need to flee or seek; steerDeer moves every tick.
  thinkDeer(grid) {
    if (Math.random() <= 1 - Math.pow(1 - DEER_EXPLORE_P, DEER_THINK_TICKS)) this.newExploreCoords();
    this.searchDeer(grid);

    let best = null, bestV = -Infinity;
    if (this.hasPredator && this.avoidNeed > bestV) { best = 'predator'; bestV = this.avoidNeed; }
    // a night hunt outranks every need but fleeing
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
    // sprinting burns DEER_SPRINT_ENERGY times walking energy; update() added the base
    if (this.sprinting) this.foodNeed += this.foodIncrement * (DEER_SPRINT_ENERGY - 1);

    if (this.priority === 'hunt') { this.steerHunt(); return; }
    // the decision's heading holds until the next one; only arrival is checked (fleeing never arrives)
    if (this.priority === 'predator' || !this.moving) return;
    const dx = this.focusX - this.position.x, dz = this.focusZ - this.position.z;
    const step = this.stepLength();
    if (dx * dx + dz * dz <= step * step) {
      // at the focus: stand (contact does the rest); a reached explore point is replaced
      if (this.priority === null) { this.newExploreCoords(); this.aimAtFocus(); }
      else this.moving = false;
    }
  }

  // Is `q` (an animal or the player's avatar) still fair game for this night hunter?
  canHunt(q) {
    if (q === null || !q.alive || !ecosystem.night) return false;
    return q === ecosystem.avatar ? q.isPreyFor(this.typeId) : (NIGHT_PREY_MASK[this.typeId] & (1 << q.typeId)) !== 0;
  }

  // NIGHT HUNT, every tick: run at the quarry wherever it is now; within the leap's length, pounce. A pounce in the
  // air keeps the heading it launched on. A lost quarry (dead, sheltered, daybreak) ends the hunt at once.
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
    if (P === undefined || now < this.nextPounceAt || now < this.fightUntil) return;
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

  // metres per second of a pounce's flight, and the metres the flight covers
  leapSpeed(P) { return P.leapOver * this.sprintSpeed(); }
  leapLength(P) { return this.leapSpeed(P) * P.moveS * (1 - P.leapAt); }

  // A pounce's step this tick: 0 while crouched, then the flight, never past POUNCE_LAND_SHORT of the contact
  // distance short of the quarry along the heading; -1 when not pouncing.
  pounceStep() {
    const now = ecosystem.time;
    if (!this.pouncing(now)) return -1;
    const P = NPC_POUNCES[this.type];
    if ((now - this.pounceAt) / P.moveS < P.leapAt) return 0;
    const q = this.quarry, flight = this.leapSpeed(P) * this.bumpScale * NPC_TICK_S;
    if (q === null) return flight;   // the hunt ended in the air: the leap carries on
    const along = (q.position.x - this.position.x) * Math.sin(this.heading) + (q.position.z - this.position.z) * Math.cos(this.heading);
    return Math.max(0, Math.min(flight, along - Ecosystem.CONTACT_DIST * POUNCE_LAND_SHORT));
  }

  searchDeer(grid) {
    const x = this.position.x, z = this.position.z;
    const vd = this.visionDistSq, r = this.visionDistance;
    this.hasPredator = this.hasFood = this.hasWater = this.hasMate = false;
    this.avoidNeed = 0;
    this.quarry = null;
    const food = this.spec.food, tid = this.typeId, sex = this.sex;
    // at night, night prey is quarry even when it would be fled by day
    const quarryMask = ecosystem.night ? NIGHT_PREY_MASK[tid] : 0;
    const huntedBy = HUNTED_BY_MASK[tid] & ~quarryMask, foodId = FOOD_TYPE_ID[tid];
    const needP = huntedBy !== 0, needQ = quarryMask !== 0;
    // prey (PREY CHOICE): food animals and night prey in one pick; a smaller one may lie farther out, so no early stop
    const needT = (food !== null && food !== 'plant') || needQ;
    const needJ = needQ && this.spec.pack === true;   // a pack hunter at night: packmates' hunts to join
    let bP = Infinity, bM = Infinity, bJ = Infinity, kP = -1, kM = -1, kJ = -1;
    let oP = null, oM = null, oJ = null;
    // the prey pick: its size step, squared distance, scan key (ties) and the target
    let sT = Infinity, bT = Infinity, kT = -1, oT = null;

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
            if ((!needP || bP < L2) && !needT && (!needJ || bJ < L2) && bM < L2) break;
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
                const s = Animal.preySize(obj);
                if ((Animal.preyAhead(s, d2, sT, bT) || (s === sT && d2 === bT && key > kT)) &&
                  this.inSight(ox, obj.position.y, oz)) { sT = s; bT = d2; kT = key; oT = obj; }
              } else if ((huntedBy & (1 << oid)) !== 0) {
                if ((d2 < bP || (d2 === bP && key > kP)) && this.inSight(ox, obj.position.y, oz)) { bP = d2; kP = key; oP = obj; }
              } else if (oid === tid) {
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

    // City: in Survivor mode the player is a predator to whatever people hunt, and at night quarry to people's night hunters
    const gp = ecosystem.avatar;
    if (gp.isThreatTo(tid) || gp.isPreyFor(tid)) {
      const ox = gp.position.x, oz = gp.position.z;
      const d2 = (ox - x) * (ox - x) + (oz - z) * (oz - z);
      if (gp.isThreatTo(tid)) {
        if (d2 <= vd && d2 <= bP && this.inSight(ox, gp.position.y, oz)) { bP = d2; this.seen(0, ox, gp.position.y, oz); this.avoidNeed = Infinity; }
      } else {
        const s = Animal.preySize(gp);
        if (d2 <= vd && Animal.preyAhead(s, d2, sT, bT) && this.inSight(ox, gp.position.y, oz)) { sT = s; bT = d2; oT = gp; }
      }
    }
    // a pack hunter that sees a packmate hunting joins the nearest one's attack unless its own pick ranks ahead;
    // joiners draw in the packmates that see them, so a group closes on one quarry
    if (oJ) {
      const q = oJ.quarry, dq = (q.position.x - x) * (q.position.x - x) + (q.position.z - z) * (q.position.z - z);
      if (Animal.preyAhead(Animal.preySize(q), dq, sT, bT)) oT = q;
    }
    // the pick's direction shows as the food ray; night prey is hunted, food chased when hunger leads
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

  // Is the line from this animal's eye to (tx, ty, tz) clear of cover (building and cabin walls, parked cars, lamp posts)?
  inSight(tx, ty, tz) {
    return !cover.blocks(this.position.x, this.eyeY(), this.position.z, tx, ty, tz);
  }

  // Metres moved this tick: a pounce's (pounceStep), a sprint (fleeing or chasing) at the fastest run of its own
  // predators, else the Arena speed.
  stepLength() {
    const leap = this.pounceStep();
    if (leap >= 0) return leap;
    const ms = this.sprinting ? this.sprintSpeed() : this.speed * this.speedScale * NPC_UNIT;
    return (this.submerged ? ms * this.WATER_SPEED_FACTOR : ms) * this.bumpScale * NPC_TICK_S;
  }

  // metres per second of a sprint (fleeing or chasing)
  sprintSpeed() { return DEER_SPRINT_OVER * Math.max(RUN_SPEED, ecosystem.fastestHunterMSById[this.typeId]); }

  // City: deer collide like the car: substeps pushed out of walls, speed lost into the wall, glancing hits turn along it.
  moveDeer(step) {
    const p = this.position, w = Animal._wallPos;
    const feet = this._b ?? baseAt(p.x, p.z);
    const n = Math.max(1, Math.ceil(step / NPC_SUBSTEP));
    const b0 = this.bumpScale || 1;
    const d0 = step / n;
    for (let k = 0; k < n; k++) {
      const d = d0 * (this.bumpScale / b0);
      let fx = Math.sin(this.heading), fz = Math.cos(this.heading);
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

  // Record a sighting (0 predator, 1 food, 2 water, 3 mate) and its direction for the arrows.
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

  // PREY CHOICE: `q`'s size (an animal or the player's avatar) in whole PREY_SIZE_STEP_KG steps of body mass
  static preySize(q) { return Math.round(q.bodyMassKg() / PREY_SIZE_STEP_KG); }
  // PREY CHOICE: does prey of size s at squared distance d2 rank ahead of the pick so far (sB, dB)? smaller, then nearer
  static preyAhead(s, d2, sB, dB) { return s < sB || (s === sB && d2 < dB); }

  move() {
    const lift = this.footLift() * NPC_UNIT;
    if (this.moving && ecosystem.time >= this.fightUntil) {
      if (this.heading !== this.targetHeading) {
        this.heading = turnToward(this.heading, this.targetHeading, HUMAN_TURN_RATE * NPC_TICK_S);
      }
      this.facingAngle = this.heading;
      const step = this.stepLength();
      const sx = Math.sin(this.heading) * step, sz = Math.cos(this.heading) * step;
      const n = Math.ceil(step / NPC_SUBSTEP);
      if (!this.brain) {
        this.moveDeer(step);
      } else if (n <= 1) {
        // walking step: Ecosystem.collide settles walls; the provider decides clamp or torus wrap
        this.position.x = ecosystem.fitX(this.position.x + sx);
        this.position.z = ecosystem.fitZ(this.position.z + sz);
      } else {
        // sprinting step: sub-steps, each refused or slid along one axis at a blocked cell
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
    // footing from the provider: base (floor, ground or water surface) + dip below it, floating past the float depth
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
    // people: the Arena's rule; deer: species.py's, one increment per tick
    const rn = this.reproductionNeed;
    this.reproductionNeed = !this.lookForMate ? 0
      : this.brain ? Math.min(rn + rn, REPRO_NEED_MAX) : rn + this.reproductionIncrement;
    this.health -= (now - this.tob) * this.ageDepl
      + this.waterNeed * 0.0001
      + this.foodNeed * 0.0001;
    this.avoidNeed = 0;
    if (this.health <= 1) { this.alive = false; return; }
    if (this.fleeFrom !== null && now >= this.fightUntil) this.fleeAttacker();

    if (!this.brain) {
      // City: deer decide once per DEER_THINK_TICKS (staggered) and steer every tick; a pounce in the air finishes first
      if (--this.actionTimer <= 0 && !this.pouncing(now)) {
        this.thinkDeer(grid);
        this.actionTimer = this.ACTION_HOLD;
      }
      this.steerDeer();
    } else if (--this.actionTimer <= 0) {
      // credit the decision just held with what it earned, then make the next one (its tags are set by think)
      this.learnFromLastDecision();
      this.think(grid);
      this.actionTimer = this.ACTION_HOLD;
    }
    this.move();
  }

  // Reward since the previous decision: the mean of health gained, food need met and water need met,
  // in units of 5% of starting health, clipped to [-1, 1].
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

  // One hit; the per-hit share keeps the damage rate at NPC_ATTACK_DAMAGE_PER_S whatever the cooldown.
  attacked(predator) {
    this.takeHit(predator, this.startHealth * NPC_ATTACK_DAMAGE_PER_S * NPC_ATTACK_COOLDOWN_S);
  }

  // Damage from a hit: no eating for NPC_HIT_NO_EAT_S, and a kill feeds the attacker.
  takeHit(attacker, damage) {
    this.health -= damage;
    this.noEatUntil = ecosystem.time + NPC_HIT_NO_EAT_S;
    if (this.health <= 1) {
      this.alive = false;
      attacker.feedOn(this);
    } else this.answerHit(attacker);
  }

  // A striker landing a hit on `target`: its fight move, facing the target, and it holds its ground (move()).
  strike(target) {
    this.faceToward(target.position.x, target.position.z, 1);
    startFightMove(this, NPC_FIGHT_MOVES[this.type], ecosystem.time);
  }

  // A species that flees answers a hit with its move, rump to the attacker, then runs (update()); once per fleeS.
  answerHit(attacker) {
    const move = NPC_FIGHT_MOVES[this.type], now = ecosystem.time;
    if (!move.flees || now < this.fleeUntil) return;
    this.faceToward(attacker.position.x, attacker.position.z, -1);
    startFightMove(this, move, now);
    this.fleeFrom = attacker;
    this.fleeUntil = now + move.moveS + move.fleeS;
  }

  // The move is over: sprint straight away from the attacker; the next decisions keep fleeing while it is in sight.
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

  // Turn the body toward (sign 1) or away from (sign -1) the point (x, z) at once; people's brains keep their own target.
  faceToward(x, z, sign) {
    const dx = (x - this.position.x) * sign, dz = (z - this.position.z) * sign;
    if (dx === 0 && dz === 0) return;
    this.heading = this.facingAngle = wrapAngle(Math.atan2(dx, dz));
    if (!this.brain) this.targetHeading = this.heading;
  }

  // A kill's meal: the victim's starting health as health, food and the water that comes with it.
  feedOn(victim) {
    this.health += victim.startHealth;
    this.foodNeed = Math.max(0, this.foodNeed - victim.startHealth);
    this.dietWater(victim.startHealth);
  }

  // City: water eaten with `food` units of food (see DIET_WATER_SHARE).
  dietWater(food) {
    const perFood = DIET_WATER_SHARE * this.waterIncrement / this.foodIncrement;
    this.waterNeed = Math.max(0, this.waterNeed - food * perFood);
  }

  ageYears() {
    return this.ageBase + (ecosystem.ticks - this.ageBaseTick) / NPC_TICKS_PER_YEAR;
  }

  // Height in metres as drawn (children grow into it), as the stats readout measures it.
  bodyHeightM() {
    const growth = this.isAdult ? 1 : Math.min(1, (ecosystem.ticks - this.birthTick) / NPC_MATURITY_TICKS);
    const s = GROWTH_MIN_SCALE + (1 - GROWTH_MIN_SCALE) * growth;
    return this.heightScale * NPC_SIZE[this.type].rig * NPC_UNIT * s;
  }

  // Mass in kg: people by humanMassKg (the readout's), animals by their reference mass x height ratio^3.
  bodyMassKg() {
    const h = this.bodyHeightM();
    if (this.type === 'human') return humanMassKg(this.sex, this.look ? this.look.buildDev : 0, h);
    const k = h / NPC_SIZE[this.type][this.sex][0];
    return NPC_REF_MASS_KG[this.type][this.sex] * k * k * k;
  }

  // Adult size from a z-score on this species' and sex's normal curve (cut at NPC_SIZE_Z_MAX).
  setSizeZ(z) {
    this.sizeZ = Math.max(-NPC_SIZE_Z_MAX, Math.min(NPC_SIZE_Z_MAX, z));
    const sz = NPC_SIZE[this.type], [mean, std] = sz[this.sex];
    this.heightScale = (mean + std * this.sizeZ) / (sz.rig * NPC_UNIT);
  }

  // Mate bar fill (0..1); only an adult with a full bar may mate.
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

    // mid-parent z-score times the heritability plus noise; variance stays 1, so every generation keeps the bell curve
    const midZ = (this.sizeZ + partner.sizeZ) / 2, h = NPC_SIZE_HERITABILITY;
    child.setSizeZ(h * midZ + Math.sqrt(1 - h * h / 2) * brains.gauss());
    if (child.look) inheritHumanLook(child.look, this.look, partner.look);

    if (this.brain && partner.brain) {
      const ParentBrain = Math.random() < 0.5 ? this.brain : partner.brain;
      // the parent's wiring with small mutations (lobe sizes, synapses); weights start fresh
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
    this.health = Math.min(this.health + nutrition, this.maxHealth);
    this.foodNeed = Math.max(0, this.foodNeed - nutrition * 0.01);
    this.dietWater(nutrition * 0.01);
    plant.health -= 1;
    plantView.touch(plant);
    if (plant.health <= 0) { plant.alive = false; ecosystem.plantsDied = true; }
  }

  // A food box: full health, hunger cleared, and the water that comes with that much food. The crate then moves.
  eatBox() {
    this.health = this.maxHealth;
    this.dietWater(this.foodNeed);
    this.foodNeed = 0;
  }

  // Every species drinks the same way: an empty water bar refills in NPC_DRINK_SECONDS.
  drinkWater() {
    this.waterNeed = Math.max(0, Math.min(this.waterNeed, 100) - 100 / NPC_DRINK_SECONDS * NPC_TICK_S);
    this.health = Math.min(this.health + this.waterIncrement * 25, this.maxHealth);
  }
}

export function humanLook(sex) {
  const pick = list => list[Math.floor(Math.random() * list.length)];
  const outfit = Math.floor(Math.random() * HUMAN_OUTFITS), shirt = outfit === 5 ? pick(HUMAN_SUITS) : pick(HUMAN_SHIRTS);
  const look = {
    tone: Math.random(), variant: Math.floor(Math.random() * HUMAN_FACE_VARIANTS), female: sex === 'female',
    buildDev: Math.max(-0.12, Math.min(0.12, 0.05 * brains.gauss())), outfit, shirt,
    pants: outfit === 5 ? shirt : pick(HUMAN_PANTS), skinRGB: 0, code: 0
  };
  packHumanLook(look);
  return look;
}

// skinRGB: the tone's sRGB as one integer; code: face tile + outfit * 8 + build step * 64 (all exact in a float).
export function packHumanLook(L) {
  const t = L.tone * (HUMAN_SKIN.length - 1), i = Math.min(HUMAN_SKIN.length - 2, Math.floor(t)), f = t - i;
  const mix = sh => Math.round(((HUMAN_SKIN[i] >> sh) & 255) * (1 - f) + ((HUMAN_SKIN[i + 1] >> sh) & 255) * f);
  L.skinRGB = mix(16) * 65536 + mix(8) * 256 + mix(0);
  const build = Math.max(0.8, Math.min(1.2, (L.female ? 0.93 : 1) + L.buildDev));
  L.code = (L.female ? HUMAN_FACE_VARIANTS : 0) + L.variant + L.outfit * 8 + Math.round((build - 0.8) * 200) * 64;
}

export function inheritHumanLook(L, a, b) {
  L.tone = Math.max(0, Math.min(1, (a.tone + b.tone) / 2 + (Math.random() - 0.5) * 0.12));
  L.variant = (Math.random() < 0.5 ? a : b).variant;
  L.buildDev = Math.max(-0.12, Math.min(0.12, (a.buildDev + b.buildDev) / 2 + 0.02 * brains.gauss()));
  packHumanLook(L);
}

// PLANTS: the Arena's Plant and PlantRenderer; a stem and four leaves that shrink with health (10 bites).

// PLANT VIEW: how plants reach their renderer without the sim calling it. The plant renderer fills add, remove and
// touch, and raises pending when a plant waits for a free slot (step then retries plant.update).
export const plantView = { add: null, remove: null, touch: null, pending: false };

export class Plant extends Entity {
  constructor(position) {
    super(position, 'plant');
    this.health = PLANT_MAX_HEALTH;
    this.maxHealth = PLANT_MAX_HEALTH;
    // On the provider's footing (a lake bed under water), sunk 3 Arena units as in the Arena.
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
    // spawned past MAX_INSTANCES: retry each tick so a freed slot gets adopted
    if (this._slot < 0) plantView.add(this);
  }
}

// ECOSYSTEM: the Arena's World loop, one engine for every provider; stepped from frame().
export class Ecosystem {
  static CONTACT_QUERY_RADIUS = 20 * NPC_UNIT;
  static CONTACT_DIST_SQ = 200 * NPC_UNIT * NPC_UNIT;
  static CONTACT_DIST = Math.sqrt(200) * NPC_UNIT;

  constructor() {
    this.animals = [];
    this.plants = [];
    this.ticks = 0;
    this.ready = false;
    this.shownPop = -1;
    this.minX = 0; this.maxX = 0; this.minZ = 0; this.maxZ = 0;
    this.wraps = false;

    this.animalGrid = null;
    this.plantGrid = null;
    // Plants for vision queries, so sight reads nearby cells; plants never move, rebuilt with plantGrid to drop the dead.
    this.plantSight = null;
    // The provider's water points, for vision queries; they never move.
    this.waterSight = null;
    this.aliveById = new Int32Array(NPC_TYPE_COUNT);             // per species id: live count this tick
    this.canHuntById = new Uint8Array(NPC_TYPE_COUNT);           // per species id: 1 while something it hunts lives
    this.fastestHunterMSById = new Float64Array(NPC_TYPE_COUNT); // per species id: its fastest live hunter, metres per second
    this.night = false;   // the sun below NIGHT_SUN_ALT_DEG, set each step: night hunts (NIGHT_PREY_MASK) are on
    this.afterContacts = [];   // fn(dt) run after each tick's contacts, before the dead are removed (the game registers)
    this.avatar = null;        // the player's avatar, an external agent animals sense and hunt (the game registers)

    this._qPlant = [];
    this._qWater = [];
    this._qBox = [];
    this._plantAdds = [];
    this._plantDrops = [];
    this._animalGridDrops = [];    // animals removed from `animals` since the last grid sync, still filed in the grid
    this.plantsDied = false;       // set where a plant dies (eaten), so step's removal pass runs only on those ticks
    this.drift2 = 0;
    this.contact = null;
    this._contactR = Ecosystem.CONTACT_DIST;
  }

  // SIM CLOCK: sim seconds since init; aging and mate readiness run on it, so they pause with the sim.
  get time() { return this.ticks * NPC_TICK_S; }

  // Keep a coordinate in the world: the Arena's torus wrap, or City's clamp.
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
    this.plants.length = 0;
    this._plantAdds.length = 0;
    this._plantDrops.length = 0;
    this.plantsDied = false;
    this.ready = false;
  }

  // true once per population change; main refreshes the HUD on it
  populationChanged() {
    if (this.animals.length === this.shownPop) return false;
    this.shownPop = this.animals.length;
    return true;
  }

  // Spatial indexes over the provider's extent, then its population through its own spawn rules.
  initialize(provider) {
    this.animals.length = 0;
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

  // Places `count` of `type` at open spawn spots NPC_SPAWN_GAP apart (gap halves when crowded); returns how many.
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
        // City: a child that would land in or through a wall is born at the mother's spot.
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

  // Contact: hunters kill what they hunt, everyone mates and drinks, grazers (people, deer) eat plants.
  handleCollisions() {
    if (this.ticks % 3 === 0) this.syncPlantGrids();
    // Contact candidates come from a grid up to 2 ticks old, queried at contact distance plus the largest move since.
    this._contactR = Ecosystem.CONTACT_DIST + Math.sqrt(this.drift2);
    const cg = this.contact, items = cg.items, start = cg.start;
    const now = this.time;

    for (const a of this.animals) {
      if (!a.alive) continue;
      const px = a.position.x, pz = a.position.z;

      if (this.canHuntById[a.typeId]) {
        // with nothing it hunts alive the query can only return animals it would skip
        const hunts = HUNTS_MASK[a.typeId], abit = 1 << a.typeId;
        const nh = cg.cellsFor(px, pz, this._contactR), hs = cg.hs;
        hunt: for (let q = 0; q < nh; q++) for (let i = start[hs[q]], iEnd = start[hs[q] + 1]; i < iEnd; i++) {
          const other = items[i];
          if (other.alive && (hunts & (1 << other.typeId)) !== 0 &&
            tools.distSq(px, pz, other.position.x, other.position.z) < Ecosystem.CONTACT_DIST_SQ) {
            if (a.nextAttackAt <= now) {
              // one hit per cooldown, on the first prey in reach; prey that hunts back strikes on its own turn
              a.strike(other);
              if ((HUNTS_MASK[other.typeId] & abit) !== 0) this.fightHit(a, other);
              else other.attacked(a);
              a.nextAttackAt = now + NPC_ATTACK_COOLDOWN_S;
            }
            if (!a.alive) break hunt;
          }
        }
        if (!a.alive) continue;
      }
      if (a.lookForMate) this.tryMate(a, px, pz);

      const canEat = a.noEatUntil <= now;
      const nPlant = canEat && a.spec.grazes && a.nextBiteAt <= now ? this.plantGrid.queryInto(this._qPlant, px, pz, Ecosystem.CONTACT_QUERY_RADIUS) : 0;
      for (let i = 0; i < nPlant; i++) {
        const plant = this._qPlant[i];
        if (plant.alive &&
          tools.distSq(px, pz, plant.position.x, plant.position.z) < Ecosystem.CONTACT_DIST_SQ) {
          // one bite per cooldown; the plant lives on until its health runs out
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

  // Two mutual hunters in contact: a strikes b once, scaled by a's height x mass x health against the reference
  // fighter; b strikes a on its own turn, and whoever drops to 1 health is eaten by the other.
  fightHit(a, b) {
    const strength = a.bodyHeightM() * a.bodyMassKg() * Math.max(0, a.health);
    b.takeHit(a, NPC_FIGHT_DAMAGE_PER_S * NPC_ATTACK_COOLDOWN_S * strength / NPC_FIGHT_REF_STRENGTH);
  }

  // Occupancy-grid wall check: a step into a blocked cell keeps its free axis (slides) or is undone.
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
    // a provider that drives its own NPCs (the intro scene) replaces the sim
    if (providers.active && providers.active.drive) return providers.active.drive(this, dt);
    const now = this.time;
    this.night = simSky.sunAltDeg < NIGHT_SUN_ALT_DEG;

    // Grid sync every 3 ticks, incremental: only animals whose cell changed move bucket; same sets as a full rebuild.
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
          const ms = a.speed * NPC_UNIT, prey = HUNTS_LIST[a.typeId];
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

    // Plant.update only retries a render slot for a plant spawned past MAX_INSTANCES; skip the pass when there is none
    if (plantView.pending) {
      plantView.pending = false;
      for (const p of this.plants) {
        if (p.alive) p.update();
      }
    }

    this.handleCollisions();
    for (const f of this.afterContacts) f(dt);

    for (let i = this.animals.length - 1; i >= 0; i--) {
      if (!this.animals[i].alive) {
        this.animals[i].remove();
        this._animalGridDrops.push(this.animals[i]);
        this.animals.splice(i, 1);
      }
    }
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

  // The tick's clock advances once main has drawn it (the renderers read this tick's ticks and time).
  endTick() { this.ticks++; }
}
export const brains = new BrainFactory();
export const ecosystem = new Ecosystem();

// GAME SKY: own clock and weather (opens to afternoon rain, then random; 20-minute day); an Observer preset overrides it.
export const simSky = {
  running: false,              // a world is in play
  DAY_S: 1200,                 // real seconds per game day
  OPENING_RAIN_S: 30,
  SPAN: [60, 180],             // seconds each weather lasts
  STEP_S: 0.25,                // sky redraw interval; the sun moves 0.075 degree in it
  KINDS: ['Clear', 'Cloudy', 'Overcast', 'Fog', 'Rain', 'Snow', 'Storm'],
  hour: 15, kind: 'Rain', timer: 0, acc: 0, lastNow: 0, shownMinute: -1,

  site: null,   // where the world is on Earth { lat, lon, offset } (the loads set it)
  sunAltDeg: 90,   // the drawn sun's altitude (degrees), set by updateSky; night reads it
  onSkyStep: null, onMinute: null,   // the sky redraw and the HUD minute (main fills them)
  get on() { return this.running; },

  start() {
    this.running = true;
    this.hour = presetHour('Afternoon');
    this.kind = 'Rain';
    this.timer = this.OPENING_RAIN_S;
    this.opening = true;
    this.acc = 0;
    this.lastNow = 0;
    this.shownMinute = -1;
  },
  stop() { this.running = false; },

  // New ecosystem: any hour, any weather, no opening rain
  randomize() {
    this.hour = Math.random() * 24;
    this.kind = this.KINDS[Math.floor(Math.random() * this.KINDS.length)];
    this.timer = this.SPAN[0] + Math.random() * (this.SPAN[1] - this.SPAN[0]);
    this.opening = false;
  },

  conditions() { return SKIES[this.kind]; },

  // real elapsed time, not the frame's clamped physics step, so a slow frame rate cannot stretch the day
  update(now) {
    if (!this.running || document.hidden) { this.lastNow = 0; return; }
    const dt = this.lastNow ? Math.min(Math.max((now - this.lastNow) / 1000, 0), 5) : 0;
    this.lastNow = now;
    this.hour = (this.hour + dt * 24 / this.DAY_S) % 24;
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
