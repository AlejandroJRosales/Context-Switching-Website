// ZOMBIES: behaviour tests through the game's frame loop, each wait capped at WAIT_LIMIT_MS; usage in tools/README.md.
import { openGame, WAIT_LIMIT_MS } from './lib/game-page.mjs';

const args = process.argv.slice(2);
const rootDir = args[0];
const threeDir = args.includes('--three') ? args[args.indexOf('--three') + 1] : null;
const part = args.includes('--part') ? args[args.indexOf('--part') + 1] : 'observer';
const RATE_ROLLS = 100;   // infection rolls gathered before the rate is reported

const results = [];
function check(name, ok, detail) {
  results.push({ name, ok });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ': ' + detail : ''}`);
}

// In-page instruments: logs of contact hits, turns, matings, meals, shots and per-tick food; helpers to place bodies.
async function instrument(page) {
  await page.evaluate(async () => {
    const sim = await import('/src/7b-sim.js'), cfg = await import('/src/1-config.js');
    const col = await import('/src/5-collision.js'), pg = await import('/src/8b-player-game.js');
    const E = sim.ecosystem, A = sim.Animal, game = pg.game;
    const L = { hits: [], turns: [], mates: [], meals: [], shots: [], violations: new Set(), tickFood: [], death: null };
    const Z = window.Z = { sim, cfg, col, pg, E, A, game, L, cur: {}, watch: null };
    const isAv = b => b === E.avatar;
    const turnAtOf = b => isAv(b) ? game.turnAt : b.turnAt;
    Z.traits = a => ({ speed: a.speed, strength: a.strength, toughness: a.toughness, vision: a.visionDistance, fovH: a.fovH,
      fovV: a.fovV, sizeZ: a.sizeZ, maxHealth: a.maxHealth, foodIncrement: a.foodIncrement });
    const contactHit = E.contactHit.bind(E);
    E.contactHit = (a, b) => {
      const open = a.zombie && !(b.zombie === true) && turnAtOf(b) === Infinity;   // true: an uninfected body a zombie hits
      contactHit(a, b);
      L.hits.push({ t: E.time, a, b, av: isAv(b), rolled: open && b.alive, infected: open && turnAtOf(b) !== Infinity });
      if (a.kindId === cfg.NPC_KIND_IDS.coyote && b.zombie) L.violations.add('a coyote struck a zombie');
    };
    const turn = A.prototype.turn;
    A.prototype.turn = function () {
      const rec = { t: E.time, a: this, infectedAt: this.turnAt === Infinity ? NaN : this.turnAt - cfg.ZOMBIES.turnS,
        before: Z.traits(this), wasHuman: this.kindId === cfg.HUMAN_KIND_ID && !this.zombie };
      turn.call(this);
      Object.assign(rec, { after: Z.traits(this), kind: this.kindId, brain: this.brain, gun: this.gun });
      L.turns.push(rec);
    };
    const mate = A.prototype.mate;
    A.prototype.mate = function (p) { const c = mate.call(this, p); L.mates.push({ t: E.time, a: this, b: p, c }); return c; };
    const feedOn = A.prototype.feedOn;
    A.prototype.feedOn = function (v) { L.meals.push({ eater: this.kindId, victim: v.kindId }); return feedOn.call(this, v); };
    const eatPlant = A.prototype.eatPlant;
    A.prototype.eatPlant = function (p) { if (this.zombie) L.violations.add('a zombie ate a plant'); return eatPlant.call(this, p); };
    const eatBox = A.prototype.eatBox;
    A.prototype.eatBox = function () { if (this.zombie) L.violations.add('a zombie ate a food box'); return eatBox.call(this); };
    const strike = E.projectiles.strike.bind(E.projectiles);
    E.projectiles.strike = (b, body, zone) => { L.shots.push({ t: E.time, shooter: b.shooter, body, zombie: body.zombie === true }); strike(b, body, zone); };
    const die = game.die;
    game.die = function (cause) { L.death = { t: E.time, cause }; return die.call(this, cause); };
    const coyote = cfg.NPC_KIND_IDS.coyote;
    E.afterContacts.push(() => {
      const w = Z.watch;
      if (w && w.a.alive) {
        const f = w.a.foodNeed;
        if (w.last !== null) L.tickFood.push({ d: f - w.last, inc: w.a.foodIncrement, runs: w.a.runs() });
        w.last = f;
      }
      for (const a of E.animals) {
        if (!a.alive) continue;
        if (a.gun !== null && a.onSight !== null && !a.onSight.zombie) L.violations.add('an armed person targeted a non-zombie on sight');
        if (a.kindId === coyote && ((a.prey && a.prey.zombie) || (a.quarry && a.quarry.zombie))) L.violations.add('a coyote hunted a zombie');
        if (a.zombie && a.priority === 'predator') L.violations.add('a zombie fled');
        if (a.zombie && a.runs() && a.brokenBone) L.violations.add('a broken bone sprinted');
      }
    });
    // Moves a to (x, z), keeping the contact search's drift small (_fx, _fz).
    Z.place = (a, x, z) => {
      const p = a.position;
      p.x = E.fitX(x); p.z = E.fitZ(z);
      a.freeX = p.x; a.freeZ = p.z; a._fx = p.x; a._fz = p.z;
    };
    Z.open = (x, z) => x > E.minX && x < E.maxX && z > E.minZ && z < E.maxZ && col.isOpen(x, z) && !col.occ.blockedAt(x, z);
    // An open spot at distance d from (x, z), or null.
    Z.spotNear = (x, z, d) => {
      for (let k = 0; k < 64; k++) {
        const ang = Math.random() * Math.PI * 2, sx = x + Math.sin(ang) * d, sz = z + Math.cos(ang) * d;
        if (Z.open(sx, sz)) return [sx, sz];
      }
      return null;
    };
    // An open spot at least d from every living person and the avatar.
    Z.spotFar = d => {
      for (let k = 0; k < 400; k++) {
        const x = E.minX + Math.random() * (E.maxX - E.minX), z = E.minZ + Math.random() * (E.maxZ - E.minZ);
        if (!Z.open(x, z)) continue;
        const near = E.animals.some(a => a.alive && a.type === 'human' && Math.hypot(a.position.x - x, a.position.z - z) < d) ||
          (E.avatar.alive && Math.hypot(E.avatar.position.x - x, E.avatar.position.z - z) < d);
        if (!near) return [x, z];
      }
      return null;
    };
    // Puts z at distance d from p (ahead of p's facing if `ahead`) at an open spot p's eye sees; false if none found.
    Z.inView = (z, p, d, ahead) => {
      for (let k = 0; k < 64; k++) {
        const ang = ahead ? p.facingAngle + (Math.random() - 0.5) * 0.4 : Math.random() * Math.PI * 2;
        const x = p.position.x + Math.sin(ang) * d, zz = p.position.z + Math.cos(ang) * d;
        if (Z.open(x, zz) && p.inSight(x, z.position.y, zz)) { Z.place(z, x, zz); return true; }
      }
      return false;
    };
    // The test's zombie: Z.cur.z while it lives, else another free one (or null).
    Z.zombie = () => { if (!Z.cur.z || !Z.cur.z.alive) Z.cur.z = Z.zombies()[0] ?? null; return Z.cur.z; };
    Z.free = a => a.alive && !a.isDown(E.time) && a.fall === null;
    Z.zombies = () => E.animals.filter(a => a.zombie && Z.free(a));
    Z.living = () => E.animals.filter(a => a.type === 'human' && !a.zombie && a.turnAt === Infinity && Z.free(a) && a.isAdult);
    // Sends every zombie within d of (x, z) to a far spot.
    Z.clear = (x, z, d) => {
      for (const a of E.animals) if (a.zombie && a.alive && Math.hypot(a.position.x - x, a.position.z - z) < d) {
        const s = Z.spotFar(60) ?? Z.spotFar(30); if (s) Z.place(a, s[0], s[1]);
      }
    };
  });
}

// One infection then a turn, retried until a victim (of `sex`, if given) both is infected and turns. Returns its record.
async function infectAndTurn(g, sex) {
  for (let attempt = 1; ; attempt++) {
    const ok = await g.page.evaluate(sex => {
      const zs = Z.zombies(), vs = Z.living().filter(a => a.gun === null && (!sex || a.sex === sex));
      if (!zs.length || !vs.length) return false;
      const z = zs[0], v = vs[Math.floor(Math.random() * vs.length)], s = Z.spotNear(v.position.x, v.position.z, 0.3);
      if (!s) return false;
      z.foodNeed = 90; z.waterNeed = 0; z.reproductionNeed = 0; z.actionTimer = 0;
      Z.place(z, s[0], s[1]);
      Z.cur = { z, v, brained: v.brain !== null, t0: Z.E.ticks, hits0: Z.L.hits.length };
      return true;
    }, sex);
    if (!ok) { console.log('  (no zombie or victim free this moment; waiting for the next tick)'); await g.page.waitForTimeout(500); continue; }
    // the zombie is held at the victim until a hit infects it (or kills it)
    const out = await g.until(() => {
      const v = Z.cur.v, z = Z.zombie();
      if (!v.alive) return 'died';
      if (v.turnAt !== Infinity) return 'infected';
      if (Z.E.ticks - Z.cur.t0 > 300 && !Z.L.hits.slice(Z.cur.hits0).some(h => h.b === v)) return 'unreached';   // no hit in 300 ticks: a new victim
      if (z && Math.hypot(z.position.x - v.position.x, z.position.z - v.position.z) > 0.5) {
        const s = Z.spotNear(v.position.x, v.position.z, 0.3); if (s) Z.place(z, s[0], s[1]);
      }
      return false;
    });
    if (out !== 'infected') { console.log(`  attempt ${attempt}: victim ${out} before infection`); continue; }
    // the zombies leave, so the victim's 10 s are its own
    await g.page.evaluate(() => { const { v } = Z.cur; Z.clear(v.position.x, v.position.z, 40); Z.cur.infectedSample = { kind: v.kindId, zombie: v.zombie, brain: v.brain !== null }; });
    const end = await g.until(() => { const { v } = Z.cur; return v.zombie ? 'turned' : !v.alive ? 'died' : false; });
    if (end !== 'turned') { console.log(`  attempt ${attempt}: infected victim died before turning`); continue; }
    return g.page.evaluate(attempt => {
      const { v } = Z.cur, rec = Z.L.turns.find(r => r.a === v);
      return { attempt, sex: v.sex, delay: rec.t - rec.infectedAt, wasHuman: rec.wasHuman, before: rec.before, after: rec.after,
        kindOk: rec.kind === Z.cfg.ZOMBIE_KIND_ID, brainNull: rec.brain === null, gunNull: rec.gun === null, brained: Z.cur.brained,
        sample: Z.cur.infectedSample, humanKind: Z.cfg.HUMAN_KIND_ID };
    }, attempt);
  }
}

// One test: a wait past WAIT_LIMIT_MS (or another error) is reported for it, and the next test runs.
async function section(name, fn) {
  console.log(`-- ${name}`);
  try { await fn(); } catch (e) {
    const timedOut = /Timeout/i.test(e.message);
    check(`${name}: ${timedOut ? `timed out after ${WAIT_LIMIT_MS / 60000} min, not finished` : 'stopped by an error'}`, false, timedOut ? '' : e.message.split('\n')[0]);
  }
}

const sameTraits = (a, b) => ['speed', 'strength', 'toughness', 'vision', 'fovH', 'fovV', 'sizeZ', 'maxHealth', 'foodIncrement'].every(k => a[k] === b[k]);

async function observer(g) {
  const zombieLine = /(\d[\d,]*) zombies/.exec(g.loadText);
  check('outbreak: loading line counts the starting zombies', zombieLine !== null && zombieLine[1] === '3', zombieLine ? zombieLine[0] : g.loadText.slice(0, 200));
  await instrument(g.page);
  await section('infection and turning', async () => {
    const r = await infectAndTurn(g);
    check('infected victim acts normally until it turns', r.sample.kind === r.humanKind && !r.sample.zombie && (r.brained ? r.sample.brain : true),
      `kind ${r.sample.kind}, zombie ${r.sample.zombie}, brain kept ${r.sample.brain}`);
    check('turns ZOMBIES.turnS after infection', r.delay >= 10 && r.delay < 10 + 0.016 + 1e-9, `${r.delay.toFixed(4)} s sim (attempt ${r.attempt})`);
    check('a turned person is a zombie with no brain or gun', r.wasHuman && r.kindOk && r.brainNull && r.gunNull, `was brained: ${r.brained}`);
    check('a convert keeps its own body traits', sameTraits(r.before, r.after), JSON.stringify(r.after));
  });
  await section('chase and attack', async () => {
    await g.page.evaluate(() => {
      const z = Z.zombies()[0], t = Z.living().find(a => a.brain !== null && a.gun === null);
      const s = Z.spotNear(t.position.x, t.position.z, 12);
      z.foodNeed = 90; z.waterNeed = 0; z.reproductionNeed = 0; z.actionTimer = 0;
      Z.place(z, s[0], s[1]);
      Z.cur = { z, n0: Z.L.hits.length, firstDist: null, sawFood: false };
    });
    const chase = await g.until(() => {
      const c = Z.cur;
      if (!c.z.alive) { c.z = Z.zombie(); c.z.foodNeed = 90; c.z.waterNeed = 0; c.z.reproductionNeed = 0; c.firstDist = null; }
      const z = c.z;
      if (z.prey && c.firstDist === null) c.firstDist = Math.hypot(z.prey.position.x - z.position.x, z.prey.position.z - z.position.z);
      if (z.priority === 'food') c.sawFood = true;
      const hit = Z.L.hits.slice(c.n0).find(h => h.a === z);
      return hit ? { firstDist: c.firstDist, sawFood: c.sawFood, victimHuman: hit.b.kindId === Z.cfg.HUMAN_KIND_ID } : false;
    });
    check('a hungry zombie chases a living person and strikes it', chase.sawFood && chase.victimHuman,
      `prey ${chase.firstDist?.toFixed(1)} m away at its first pick; struck a living person`);
  });
  await section('armed people shoot zombies on sight', async () => {
    await g.page.evaluate(() => {
      const s = Z.living().find(a => a.gun !== null && a.foe === null);
      Z.cur = { s, z: null, n0: Z.L.shots.length, sawSight: false };
    });
    const shot = await g.until(() => {
      const c = Z.cur, z = Z.zombie();
      if (c.s.onSight !== null) c.sawSight = true;
      if (!c.s.alive) return { shooterDied: true };
      if (z && c.s.onSight === null) Z.inView(z, c.s, 15, false);   // a zombie kept in its view until it sees one
      const hit = Z.L.shots.slice(c.n0).find(h => h.shooter === c.s);
      return hit ? { zombie: hit.zombie, sawSight: c.sawSight, sinceFoe: c.s.foe === null } : false;
    });
    check('an armed person shoots a zombie it sees', !shot.shooterDied && shot.zombie && shot.sawSight,
      shot.shooterDied ? 'shooter died first' : `first hit on a zombie, onSight set: ${shot.sawSight}, never attacked first: ${shot.sinceFoe}`);
  });
  await section('living people react to zombies', async () => {
    await g.page.evaluate(() => {
      Z.cur = { p: Z.living().find(a => a.brain === null && a.gun === null), z: null };
    });
    const fled = await g.until(() => {
      const p = Z.cur.p, z = Z.zombie();
      if (!p.alive) return 'died';
      if (p.priority === 'predator' && Math.hypot(p.memPredatorX - z.position.x, p.memPredatorZ - z.position.z) < 3) return 'fled';
      if (Math.hypot(p.position.x - z.position.x, p.position.z - z.position.z) > 8) Z.inView(z, p, 6, false);
      return false;
    });
    check('an unarmed rule person flees a zombie', fled === 'fled', fled);
    await g.page.evaluate(() => {
      Z.cur = { p: Z.living().find(a => a.brain !== null), z: null };
    });
    const seen = await g.until(() => {
      const p = Z.cur.p, z = Z.zombie();
      if (!p.alive) return 'died';
      if (p.hasPredator && Math.hypot(p.memPredatorX - z.position.x, p.memPredatorZ - z.position.z) < 3) return 'seen';
      Z.inView(z, p, 5, true);   // held in front of its eyes until the brain's next look
      return false;
    });
    check('a brained person sees a zombie on its predator input', seen === 'seen', seen);
  });
  await section('zombie mating and inheritance', async () => {
    const have = await g.page.evaluate(() => ({ m: Z.zombies().some(a => a.sex === 'male' && a.isAdult), f: Z.zombies().some(a => a.sex === 'female' && a.isAdult) }));
    if (!have.m) await infectAndTurn(g, 'male');
    if (!have.f) await infectAndTurn(g, 'female');
    await g.page.evaluate(() => { Z.cur = { n0: Z.L.mates.length }; });
    let mated;
    for (; ;) {
      mated = await g.until(() => {
      const c = Z.cur, now = Z.E.time;
      const m = Z.zombies().find(a => a.sex === 'male' && a.isAdult), f = Z.zombies().find(a => a.sex === 'female' && a.isAdult);
      if (!m) return 'male'; if (!f) return 'female';
      const rec = Z.L.mates.slice(c.n0).find(r => r.a.zombie && r.b.zombie);
      if (rec) {
        const ch = rec.c, mean = k => (rec.a[k] + rec.b[k]) / 2, share = k => ch[k] / mean(k);
        return { zombie: ch.zombie, kind: ch.kindId === Z.cfg.ZOMBIE_KIND_ID, brain: ch.brain === null, gun: ch.gun === null,
          gen: ch.generation === Math.max(rec.a.generation, rec.b.generation) + 1,
          shares: { speed: share('speed'), strength: share('strength'), toughness: share('toughness'), vision: share('visionDistance') },
          health: Math.abs(ch.maxHealth - ch.startHealth * ch.toughness) < 1e-9 };
      }
      if (m && f && !c.placed) {   // once: side by side, both ready to mate
        for (const a of [m, f]) { a.lastChildTime = now - 1e6; a.foodNeed = 0; a.waterNeed = 0; }
        const s = Z.spotNear(f.position.x, f.position.z, 0.2); if (s) Z.place(m, s[0], s[1]);
        c.placed = true; c.m = m; c.f = f;
      } else if (c.placed && c.m && Math.hypot(c.m.position.x - c.f.position.x, c.m.position.z - c.f.position.z) > 0.6) c.placed = false;
      return false;
      });
      if (typeof mated !== 'string') break;
      console.log(`  no adult ${mated} zombie free; turning one`);
      await infectAndTurn(g, mated);
      await g.page.evaluate(() => { Z.cur.placed = false; });
    }
    const inRange = Object.values(mated.shares).every(v => v >= 0.5 - 1e-9 && v <= 1.1 + 1e-9);
    check('zombie parents have a zombie child with no brain or gun', mated.zombie && mated.kind && mated.brain && mated.gun && mated.gen);
    check("the child's genes follow mate()'s rule (0.5x to 1.1x the parents' mean)", inRange && mated.health, JSON.stringify(mated.shares));
    await g.page.evaluate(() => {
      const z = Z.zombies().find(a => a.isAdult);
      for (const p of Z.living().filter(a => a.sex !== z.sex && a.gun === null)) {   // the first with an open spot beside it
        const s = Z.spotNear(p.position.x, p.position.z, 0.2);
        if (!s) continue;
        for (const a of [z, p]) { a.lastChildTime = Z.E.time - 1e6; a.foodNeed = 0; a.waterNeed = 0; }
        Z.place(z, s[0], s[1]);
        break;
      }
      Z.cur = { t0: Z.E.ticks };
    });
    await g.until(() => Z.E.ticks - Z.cur.t0 >= 60);
    const mixed = await g.page.evaluate(() => Z.L.mates.filter(r => r.a.zombie !== r.b.zombie).length);
    check('a zombie and a living person never mate', mixed === 0, `${mixed} mixed matings in the session`);
  });
  await section('hunger rule', async () => {
    const rule = await g.page.evaluate(() => {
      const cfg = Z.cfg, per = {};
      for (const a of Z.E.animals) {
        const key = a.startHealth * cfg.NPC_FOOD_PER_HEALTH_TICK * (a.speed / a.spec.speed) * a.strength * a.toughness * a.massAtHeightKg(a.adultHeightM());
        (per[a.type] ??= []).push(key / a.foodIncrement);   // = the species' reference mass if the rule holds
      }
      const out = {};
      for (const t in per) {
        const v = per[t], lo = Math.min(...v), hi = Math.max(...v);
        const ref = ['male', 'female'].reduce((s, sex) => s + (t === 'human' ? cfg.NPC_REF_BMI[sex] * cfg.NPC_SIZE.human[sex][0] ** 2 : cfg.NPC_REF_MASS_KG[t][sex]), 0) / 2;
        out[t] = { n: v.length, spread: (hi - lo) / lo, impliedRefKg: lo, refKg: ref };
      }
      const humans = Z.E.animals.filter(a => a.type === 'human');
      out.meanHumanMassShare = humans.reduce((s, a) => s + a.massAtHeightKg(a.adultHeightM()), 0) / humans.length / out.human.refKg;
      return out;
    });
    for (const t of ['human', 'deer', 'coyote']) {
      const r2 = rule[t];
      check(`hunger = base x speed x strength x toughness x mass (${t}, ${r2.n} animals)`, r2.spread < 1e-9 && Math.abs(r2.impliedRefKg - r2.refKg) < 1e-6 * r2.refKg,
        `reference ${r2.refKg.toFixed(2)} kg`);
    }
    console.log(`  people's mean adult mass is ${rule.meanHumanMassShare.toFixed(3)} x the reference body's`);
    await g.page.evaluate(() => {
      const z = Z.zombies()[0], s = Z.spotFar(80) ?? Z.spotFar(40) ?? Z.spotFar(20);   // as far from people as this world allows
      Z.place(z, s[0], s[1]); z.foodNeed = 10;
      Z.watch = { a: z, last: null }; Z.L.tickFood.length = 0;
    });
    const ticks = await g.until(() => {
      const T = Z.L.tickFood;
      if (T.length < 300 && Z.watch.a.alive) return false;
      const exact = T.filter(r => Math.abs(r.d - r.inc * (r.runs ? Z.cfg.DEER_SPRINT_ENERGY : 1)) < 1e-12).length;
      return { n: T.length, exact, alive: Z.watch.a.alive };
    });
    await g.page.evaluate(() => { Z.watch = null; });
    check('a lone zombie\'s food need rises by its rate each tick (x DEER_SPRINT_ENERGY sprinting)', ticks.exact === ticks.n && ticks.n > 0,
      `${ticks.exact} of ${ticks.n} ticks exact`);
  });
  await section('broken bones', async () => {
    const bone = await g.page.evaluate(() => {
      const r = Z.living().find(a => a.brain === null && !a.brokenBone && a.health > 0.7 * a.maxHealth), by = Z.E.animals.find(a => a.type === 'deer' && a.alive);
      Z.E.applyHit(r, by, 0.6 * r.maxHealth, 0);
      r.sprinting = true;
      const walk = r.moveSpeed() * r.speedScale * Z.cfg.NPC_UNIT * r.bumpScale * Z.cfg.NPC_TICK_S;
      const step = r.submerged ? null : r.stepLength();
      const res = { broke: r.brokenBone, alive: r.alive, runs: r.runs(), walkStep: step === null || Math.abs(step - walk) < 1e-12 };
      // the chance below the sure share, on unplaced deer: toughness 1 and 2
      const rate = t => {
        const d = new Z.A([Z.E.minX, 0, Z.E.minZ], 'deer'); d.setToughness(t);
        let n = 0; for (let k = 0; k < 40000; k++) { d.brokenBone = false; d.rollBone(0.01); if (d.brokenBone) n++; }
        return n / 40000;
      };
      res.rate1 = rate(1); res.rate2 = rate(2);
      return res;
    });
    check('a hit of half its max health or more breaks a bone', bone.broke && bone.alive);
    check('a broken bone stops sprinting (walk-length steps)', !bone.runs && bone.walkStep);
    check('toughness divides the break chance below the sure share', Math.abs(bone.rate1 - 0.05) < 0.006 && Math.abs(bone.rate2 - 0.025) < 0.005,
      `toughness 1: ${(bone.rate1 * 100).toFixed(2)}%, toughness 2: ${(bone.rate2 * 100).toFixed(2)}% (direct rollBone calls, 40,000 each)`);
  });
  await section('infection rate', async () => {
    await g.page.evaluate(() => { Z.rateFrom = Z.L.hits.length; });
    const rateEnd = Date.now() + WAIT_LIMIT_MS;   // rolls gathered for at most one test's limit
    for (; Date.now() < rateEnd;) {
      const n = await g.page.evaluate(() => Z.L.hits.filter(h => h.rolled && !h.av).length);
      if (n >= RATE_ROLLS) break;
      await g.page.evaluate(() => {
        const zs = Z.zombies(), vs = Z.living().filter(a => a.gun === null);
        for (const z of zs.slice(0, 3)) {
          const v = vs.splice(Math.floor(Math.random() * vs.length), 1)[0]; if (!v) break;
          const s = Z.spotNear(v.position.x, v.position.z, 0.3); if (!s) continue;
          z.foodNeed = 90; z.actionTimer = 0; Z.place(z, s[0], s[1]);
        }
        Z.cur = { t0: Z.E.ticks };
      });
      await g.until(() => Z.E.ticks - Z.cur.t0 >= 120);
    }
    const rate = await g.page.evaluate(() => { const R = Z.L.hits.filter(h => h.rolled && !h.av); return { n: R.length, k: R.filter(h => h.infected).length }; });
    const p = rate.k / rate.n, sd = Math.sqrt(0.25 * 0.75 / rate.n);
    check('infection chance per hit is ZOMBIES.infectChance', Math.abs(p - 0.25) < 3 * sd, `${rate.k} of ${rate.n} rolls (${(p * 100).toFixed(1)}%; 3 sd = ${(3 * sd * 100).toFixed(1)} points)`);
    // observation, not a check: of the people infected in the rate phase, how many lived to turn
    const fate = await g.until(() => {
      const v = [...new Set(Z.L.hits.slice(Z.rateFrom).filter(h => h.infected && !h.av).map(h => h.b))];
      if (v.some(a => a.alive && !a.zombie)) return false;
      return { n: v.length, turned: v.filter(a => a.zombie).length };
    });
    console.log(`  observed: of ${fate.n} people infected in the rate phase (each zombie moved to a new victim every 120 ticks), ${fate.turned} lived to turn, ${fate.n - fate.turned} died first`);

    const diet = await g.page.evaluate(() => {
      const c = Z.cfg, zk = c.ZOMBIE_KIND_ID, ck = c.NPC_KIND_IDS.coyote, hk = c.HUMAN_KIND_ID, bit = 1 << zk;
      const zMeals = Z.L.meals.filter(m => m.eater === zk);
      return {
        zMeals: zMeals.length, zBad: zMeals.filter(m => m.victim !== hk && m.victim !== zk).length,
        coyoteZ: Z.L.meals.filter(m => m.eater === ck && m.victim === zk).length,
        masks: (c.HUNTS_MASK[ck] & bit) === 0 && (c.HUNTED_BY_MASK[ck] & bit) === 0 && (c.CARRION_MASK[ck] & bit) === 0 && (c.NIGHT_PREY_MASK[ck] & bit) === 0,
        violations: [...Z.L.violations]
      };
    });
    check('zombies eat only people (kills and bodies)', diet.zBad === 0 && !diet.violations.some(v => /plant|food box/.test(v)), `${diet.zMeals} zombie meals seen`);
    check('coyotes ignore zombies (masks and behaviour seen)', diet.masks && diet.coyoteZ === 0 && !diet.violations.some(v => /coyote/.test(v)));
    check('no rule violations sampled each tick', diet.violations.length === 0, diet.violations.join('; ') || 'none');
  });
}

async function survivorDeath(g, want) {
  await instrument(g.page);
  const alive = await g.page.evaluate(() => Z.E.avatar.alive && Z.game.on);
  if (!alive) { check(`Survivor ${want}: avatar in play`, false); return; }
  // the player may start in a cabin, where nothing hurts it: it is moved to open, dry ground until it is unsheltered
  await g.page.evaluate(async () => { Z.prov = await import('/src/4-provider.js'); Z.EYE = Z.cfg.EYE_HEIGHT; });
  await g.until(() => {
    if (!Z.game.sheltered) return true;
    const s = Z.spotFar(30);
    if (s && !Z.prov.isWaterAt(s[0], s[1])) { Z.pg.player.pos.set(s[0], Z.prov.surfaceY(s[0], s[1]) + Z.EYE, s[1]); Z.pg.player.vel.set(0, 0, 0); }
    return false;
  });
  await g.page.evaluate(want => {
    const av = Z.E.avatar;
    Z.clear(av.position.x, av.position.z, 60);
    Z.cur = { z: null, sawPrey: false, gap: want === 'turned' ? 0.4 : 8 };
    // the test's zombie, hungry; a new one is sent from the gap away if the last one died
    Z.hunter = () => {
      const was = Z.cur.z, z = Z.zombie();
      if (z && z !== was) {
        z.foodNeed = 90; z.waterNeed = 0; z.reproductionNeed = 0; z.actionTimer = 0;
        const s = Z.spotNear(av.position.x, av.position.z, Z.cur.gap); if (s) Z.place(z, s[0], s[1]);
      }
      if (z && z.prey === av) Z.cur.sawPrey = true;
      return z;
    };
    Z.hunter();
  }, want);
  if (want === 'turned') {
    const got = await g.until(() => {
      const z = Z.hunter(), av = Z.E.avatar;
      if (Z.game.turnAt !== Infinity) return 'infected';
      if (Z.game.dead) return 'dead';
      if (z && Math.hypot(z.position.x - av.position.x, z.position.z - av.position.z) > 0.6) { const s = Z.spotNear(av.position.x, av.position.z, 0.4); if (s) Z.place(z, s[0], s[1]); }
      return false;
    });
    if (got !== 'infected') { check('Survivor turned: infected before dying', false, 'died of hits first; rerun the part'); return; }
    await g.page.evaluate(() => { const av = Z.E.avatar; Z.clear(av.position.x, av.position.z, 400); Z.cur.infectedAt = Z.game.turnAt - Z.cfg.ZOMBIES.turnS; });
  }
  const end = await g.until(() => {
    if (Z.cur.infectedAt === undefined) {   // killed part: the zombie is held at the player
      const z = Z.hunter(), av = Z.E.avatar;
      if (z && Math.hypot(z.position.x - av.position.x, z.position.z - av.position.z) > 0.6) { const s = Z.spotNear(av.position.x, av.position.z, 0.4); if (s) Z.place(z, s[0], s[1]); }
    }
    else { const av = Z.E.avatar; Z.clear(av.position.x, av.position.z, 40); }   // turned part: zombies kept away every poll
    return Z.game.dead ? { cause: Z.L.death.cause, text: document.getElementById('runCause').textContent, t: Z.L.death.t, infectedAt: Z.cur.infectedAt ?? null, sawPrey: Z.cur.sawPrey } : false;
  });
  const hits = await g.page.evaluate(() => Z.L.hits.filter(h => h.av && h.a.zombie).length);
  if (want === 'killed') {
    console.log(`  observed: the test's zombie picked the player as prey: ${end.sawPrey}; ${hits} zombie hits on the player`);
    check('Survivor: killed by a zombie', end.cause === 'zombie' && end.text === 'Killed by a zombie', `cause ${end.cause}, panel "${end.text}"`);
  } else {
    const delay = end.t - end.infectedAt;
    check('Survivor: the infected player turns', end.cause === 'turned' && end.text === 'Turned into a zombie', `cause ${end.cause}, panel "${end.text}"`);
    check('Survivor: the run ends ZOMBIES.turnS after infection', delay >= 10 && delay < 10.1, `${delay.toFixed(3)} s sim`);
  }
}

const g = await openGame({ rootDir, threeDir, survivor: part !== 'observer' });
try {
  if (part === 'observer') await observer(g);
  else await section(`Survivor ${part}`, () => survivorDeath(g, part));
} catch (e) {
  check('test ran to the end', false, e.message);
}
check('no script errors', g.errors.length === 0, g.errors.join(' | ') || 'none');
await g.close();
const failed = results.filter(r => !r.ok).length;
console.log(`\n# ${results.length - failed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
