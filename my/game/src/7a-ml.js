// 7a-ml.js: ML. The in-game machine learning: the two-lobe spiking network people think with, its tunables, and
// the factory that wires and mutates brains for neuroevolution.
// Owns: the brain tunables (LIF, tagging, dopamine, learning rate, weight decay, heading jitter), BrainFactory
// (brains), maskLists and SpikingNetwork.
// May import: 1-config.js to 6-worlds.js. It never calls the sim, render, player, game or main layers: Animal (7b-sim)
// builds a SpikingNetwork, feeds it inputs (think) and rewards (adjustWeights), and mates brains via brains.mutateMasks.
import { tools } from './2-core.js';

// TWO-LOBE SPIKING NETWORK
// Input -> A, Input -> B, A <-> B (A reads B's spikes from the previous step), A,B -> Output.
// Lobes are leaky integrate-and-fire neurons with binary spikes. Outputs are a ring of preferred turns.
// Learning is three-factor: tagSynapses after each decision, adjustWeights when the next reward arrives.
const LIF_LEAK = 0.85;              // share of the membrane kept each step
const LIF_THRESHOLD = 0.25;         // membrane at which a neuron spikes
const LIF_RESET = -0.1;             // membrane right after a spike
const TAG_DECAY = 0.95;              // per decision: eligibility tags and each neuron's activity average
const DA_TONIC_RATE = 0.05;         // how fast tonic dopamine (expected reward) tracks reward
const BRAIN_LEARNING_RATE = 0.01;
const BRAIN_WEIGHT_DECAY = 0.00001; // per weight update (one per decision): half-life ~69,000 decisions, ~19 sim hours
const HEADING_JITTER = 0.3;         // radians: the turn taken is the population vector plus up to this much noise

class BrainFactory {
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

}

// ACTIVE-SYNAPSE LISTS for a mask laid out [pre * nPost + post]: `idx`, the set entries in ascending order (as the
// dense loops visit them), and per post neuron its entries by ascending pre (colStart / colPre / colK), the order
// propagate sums in. Masks never change after creation and children share their parent's, so one list per mask.
const _maskLists = new WeakMap();
function maskLists(mask, nPre, nPost) {
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

export const brains = new BrainFactory();