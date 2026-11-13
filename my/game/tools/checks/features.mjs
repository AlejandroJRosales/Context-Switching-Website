// FEATURES: world switches, armed people, aiming at people, gun loot, the slot menu, zombie skin; usage in tools/README.md.
import { openGame, WAIT_LIMIT_MS } from './lib/game-page.mjs';

const args = process.argv.slice(2);
const rootDir = args[0];
const threeDir = args.includes('--three') ? args[args.indexOf('--three') + 1] : null;
const LOOT_DRAWS = 4000;   // gun loots drawn for the rounds check

const results = [];
function check(name, ok, detail) {
  results.push({ name, ok });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ': ' + detail : ''}`);
}
// One test: a wait past WAIT_LIMIT_MS (or another error) is reported for it, and the next test runs.
async function section(name, fn) {
  console.log(`-- ${name}`);
  try { await fn(); } catch (e) {
    const timedOut = /Timeout/i.test(e.message);
    check(`${name}: ${timedOut ? `timed out after ${WAIT_LIMIT_MS / 60000} min, not finished` : 'stopped by an error'}`, false, timedOut ? '' : e.message.split('\n')[0]);
  }
}

// Survivor, with Zombies off.
const g = await openGame({ rootDir, threeDir, survivor: true, switches: { zombies: false } });
await g.page.evaluate(async () => {
  const sim = await import('/src/7b-sim.js'), cfg = await import('/src/1-config.js'), col = await import('/src/5-collision.js');
  const pg = await import('/src/8b-player-game.js');
  const E = sim.ecosystem, shots = [];
  const strike = E.projectiles.strike.bind(E.projectiles);
  E.projectiles.strike = (b, body, zone) => { shots.push({ shooter: b.shooter, body }); strike(b, body, zone); };
  const open = (x, z) => x > E.minX && x < E.maxX && z > E.minZ && z < E.maxZ && col.isOpen(x, z) && !col.occ.blockedAt(x, z);
  // Moves a to (x, z), keeping the contact search's drift small (_fx, _fz).
  const place = (a, x, z) => { a.position.x = x; a.position.z = z; a.freeX = x; a.freeZ = z; a._fx = x; a._fz = z; };
  // Puts t at distance d from p at an open spot p's eye sees; false if none found.
  const inView = (t, p, d) => {
    for (let k = 0; k < 64; k++) {
      const ang = Math.random() * Math.PI * 2, x = p.position.x + Math.sin(ang) * d, z = p.position.z + Math.cos(ang) * d;
      if (open(x, z) && p.inSight(x, t.position.y, z)) { place(t, x, z); return true; }
    }
    return false;
  };
  window.F = { sim, cfg, pg, E, shots, inView, cur: {} };
});

await section('Zombies switch off', async () => {
  const line = /(\d[\d,]*) zombies/.exec(g.loadText);
  const n = await g.page.evaluate(() => F.E.animals.filter(a => a.zombie).length);
  check('no zombies when the Zombies switch is off', n === 0 && line !== null && line[1] === '0', `${n} zombies alive; loading line "${line ? line[0] : 'none'}"`);
});

await section('rule people', async () => {
  const r = await g.page.evaluate(() => {
    const rule = F.E.animals.filter(a => a.type === 'human' && a.brain === null && !a.zombie);
    const people = F.E.animals.filter(a => a.type === 'human').length;
    return { n: rule.length, armed: rule.filter(a => a.gun !== null).length, people };
  });
  check('every rule person carries a gun', r.n > 0 && r.armed === r.n, `${r.armed} of ${r.n}`);
  const sd = Math.sqrt(r.people * 0.25);
  check('about half of all people have no brain', Math.abs(r.n - r.people / 2) < 4 * sd, `${r.n} of ${r.people} (4 sd = ${(4 * sd).toFixed(0)})`);
});

await section('armed people shoot coyotes', async () => {
  const mask = await g.page.evaluate(() => (F.cfg.SHOOTS_ON_SIGHT_MASK[F.cfg.HUMAN_KIND_ID] & (1 << F.cfg.NPC_KIND_IDS.coyote)) !== 0);
  check('coyotes are shot on sight (relation mask)', mask);
  await g.page.evaluate(() => {
    const s = F.E.animals.find(a => a.alive && a.gun !== null && a.foe === null);
    F.cur = { s, n0: F.shots.length, fled: false, sawSight: false };
  });
  const hit = await g.until(() => {
    const c = F.cur, s = c.s;
    if (!s.alive) return { died: true };
    if (s.onSight && s.onSight.type === 'coyote') c.sawSight = true;
    if (s.priority === 'predator') c.fled = true;
    const shot = F.shots.slice(c.n0).find(h => h.shooter === s && h.body.type === 'coyote');
    if (shot) return { sawSight: c.sawSight, fled: c.fled };
    if (!c.coyote || !c.coyote.alive) c.coyote = F.E.animals.find(a => a.alive && a.type === 'coyote');
    if (s.onSight === null && c.coyote) F.inView(c.coyote, s, 15);   // a coyote held in view until one is seen
    return false;
  });
  check('an armed person shoots a coyote it sees and does not flee', !hit.died && hit.sawSight && !hit.fled,
    hit.died ? 'the shooter died first' : `onSight was a coyote: ${hit.sawSight}, fled: ${hit.fled}`);
});

await section('gun loot', async () => {
  const r = await g.page.evaluate(n => {
    const game = F.pg.game, gun = F.cfg.WEAPONS[F.cfg.RULE_PEOPLE.weapon], counts = new Array(32).fill(0);
    let bad = 0, kinds = new Set();
    for (let k = 0; k < n; k++) {
      game.inventory.fill(null);
      game.loot({ gun });   // a searched dead armed person
      const it = game.inventory[0];
      if (!it) { bad++; continue; }
      kinds.add(it.kind);
      if (it.mag > gun.magazine || it.mag < 1 || (it.reserve > 0 && it.mag < gun.magazine)) bad++;
      counts[Math.min(31, it.mag + it.reserve)]++;
    }
    game.inventory.fill(null);
    const { max, nextShare } = F.cfg.RULE_PEOPLE.lootRounds;
    let w = 0, m = 0, m2 = 0;
    for (let x = 1; x <= max; x++) { const p = nextShare ** (x - 1); w += p; m += x * p; m2 += x * x * p; }
    const mean = m / w, sd = Math.sqrt(m2 / w - mean * mean);
    let sum = 0, total = 0; counts.forEach((c, x) => { sum += c * x; total += c; });
    return { bad, kinds: [...kinds], outside: counts[0] + counts[31], mean: sum / total, want: mean, se: sd / Math.sqrt(total), total };
  }, LOOT_DRAWS);
  check('a dead armed person always yields the gun, magazine filled first', r.bad === 0 && r.kinds.length === 1 && r.kinds[0] === 'glock', `kinds ${r.kinds.join(',')}, ${r.bad} bad`);
  check('rounds are 1 to 30, each count 5% less likely than the one below', r.outside === 0 && Math.abs(r.mean - r.want) < 4 * r.se,
    `mean ${r.mean.toFixed(2)} vs ${r.want.toFixed(2)} expected (4 se = ${(4 * r.se).toFixed(2)}), ${r.total} direct game.loot calls`);
});

await section('slot menu', async () => {
  const key = code => g.page.keyboard.press(code);
  await g.page.evaluate(() => { const game = F.pg.game; game.inventory.fill(null); game.inventory[0] = game.makeItem('water'); game.inventory[1] = game.makeItem('glock'); game.draw(); });
  await key('Digit1');
  const opened = await g.page.evaluate(() => ({ slot: F.pg.game.menuSlot, shown: !document.getElementById('slotMenu').hidden, use: document.querySelector('#slotMenu button span').textContent }));
  check('a slot key opens its menu with the item\'s verb', opened.slot === 0 && opened.shown && opened.use === 'Drink', JSON.stringify(opened));
  await key('Digit2');
  const dropped = await g.page.evaluate(() => ({ slot: F.pg.game.inventory[0], open: F.pg.game.menuSlot, shown: !document.getElementById('slotMenu').hidden }));
  check('key 2 drops the item and closes the menu', dropped.slot === null && dropped.open === -1 && !dropped.shown, JSON.stringify(dropped));
  // the gun: equipped through the menu (key 1), then dropped by tapping the slot and the Drop button
  await key('Digit2'); await key('Digit1');
  await g.page.waitForTimeout(500);
  const equipped = await g.page.evaluate(() => F.pg.game.weapon === F.pg.game.inventory[1]);
  await g.page.evaluate(() => document.querySelectorAll('#slots button')[1].click());
  const holster = await g.page.evaluate(() => document.querySelector('#slotMenu button span').textContent);
  await g.page.evaluate(() => document.querySelectorAll('#slotMenu button')[1].click());
  const gone = await g.page.evaluate(() => ({ slot: F.pg.game.inventory[1], weapon: F.pg.game.weapon }));
  check('key 1 uses (equips the gun); tapping the slot and Drop removes it from hand and inventory',
    equipped && holster === 'Holster' && gone.slot === null && gone.weapon === null, `equipped ${equipped}, menu verb "${holster}", after drop ${JSON.stringify(gone)}`);
  await g.page.evaluate(() => { const game = F.pg.game; game.inventory[0] = game.makeItem('water'); game.draw(); });
  await key('Digit1'); await key('Digit3');
  const closed = await g.page.evaluate(() => ({ open: F.pg.game.menuSlot, kept: F.pg.game.inventory[0] !== null, shown: !document.getElementById('slotMenu').hidden }));
  check('key 3 closes the menu and keeps the item', closed.open === -1 && closed.kept && !closed.shown, JSON.stringify(closed));
});

await section('gun rounds merge', async () => {
  const r = await g.page.evaluate(() => {
    const game = F.pg.game, gun = F.cfg.WEAPONS[F.cfg.RULE_PEOPLE.weapon];
    game.inventory.fill(null);
    const carried = game.inventory[0] = game.makeItem('glock', { mag: 5, reserve: 7 });
    game.inventory[1] = game.makeItem('water'); game.inventory[2] = game.makeItem('water');   // no free slot
    const before = carried.mag + carried.reserve;
    game.loot({ gun });
    const after = carried.mag + carried.reserve, guns = game.inventory.filter(it => it && it.kind === 'glock').length;
    game.inventory.fill(null);
    return { before, after, guns, mag: carried.mag };
  });
  check('a looted gun\'s rounds join the carried gun\'s reserve, even with no free slot', r.after > r.before && r.guns === 1 && r.mag === 5,
    `rounds ${r.before} to ${r.after}, ${r.guns} gun in the inventory, magazine still ${r.mag}`);
});

await section('zombie skin', async () => {
  await g.page.evaluate(async () => {
    F.r = await import('/src/8a-render.js');
    const av = F.E.avatar, z = F.E.animals.find(a => a.alive && a.type === 'human' && !a.zombie && a.gun === null);
    z.turn(); z.foodNeed = 0;   // test setup: a person turned directly
    F.cur = { z };
  });
  // polled from here every 2 s until WAIT_LIMIT_MS: the zombie is held 3 m from the player until it is drawn up close
  let r = false;
  for (const end = Date.now() + WAIT_LIMIT_MS; !r && Date.now() < end; await g.page.waitForTimeout(2000)) {
    r = await g.page.evaluate(() => {
      const { z } = F.cur, H = F.r.animalRenderer.human, av = F.E.avatar;
      if (!z.alive) return { died: true };
      const k = H.lookOwner.indexOf(z);
      if (k >= 0) return { drawn: H.look.array[k * 4], want: F.r.zombieSkinRGB(z.look), own: z.look.skinRGB };
      const x = av.position.x + 3, w = av.position.z;
      z.position.x = x; z.position.z = w; z.freeX = x; z.freeZ = w; z._fx = x; z._fz = w;
      return false;
    });
  }
  if (!r) throw new Error('Timeout');
  check('a zombie is drawn with the green-blended skin', !r.died && r.drawn === r.want && r.want !== r.own,
    r.died ? 'it died first' : `drawn ${r.drawn.toString(16)}, own ${r.own.toString(16)}`);
});

await section('aiming at people (Survivor)', async () => {
  // the player may start in a cabin, whose walls hide it from everyone: moved to open, dry ground until unsheltered
  await g.page.evaluate(async () => { F.prov = await import('/src/4-provider.js'); F.col = await import('/src/5-collision.js'); });
  await g.until(() => {
    if (!F.pg.game.sheltered) return true;
    const E = F.E, x = E.minX + Math.random() * (E.maxX - E.minX), z = E.minZ + Math.random() * (E.maxZ - E.minZ);
    if (F.col.isOpen(x, z) && !F.col.occ.blockedAt(x, z) && !F.prov.isWaterAt(x, z)) {
      F.pg.player.pos.set(x, F.prov.surfaceY(x, z) + F.cfg.EYE_HEIGHT, z); F.pg.player.vel.set(0, 0, 0);
    }
    return false;
  });
  // a rule person of each kind put on the crosshair's ray 15 m out, then the game's own aim check run once
  const setup = await g.page.evaluate(() => {
    const av = F.E.avatar, now = F.E.time;
    const rule = F.E.animals.filter(a => a.alive && a.type === 'human' && a.brain === null && !a.zombie && a.gun !== null && a.foe === null);
    const out = {};
    for (const armed of [true, false]) {
      const p = rule[armed ? 0 : 1];
      if (!armed) p.gun = null;   // every rule person is armed now, so the unarmed case is set up by taking one gun away
      const yaw = Math.random() * Math.PI * 2, x = av.position.x + Math.sin(yaw) * 15, z = av.position.z + Math.cos(yaw) * 15;
      p.position.x = x; p.position.z = z; p.freeX = x; p.freeZ = z; p._fx = x; p._fz = z;
      p.aimedAtBy(av, now);   // what aimAtPeople calls when the ray finds p
      out[armed ? 'armed' : 'unarmed'] = { foe: p.foe === av, avoid: p.avoidPlayerUntil > now };
      F.cur[armed ? 'armed' : 'unarmed'] = p;
    }
    F.cur.n0 = F.shots.length;
    return out;
  });
  check('aimed at, an armed rule person makes the player its foe; an unarmed one a threat', setup.armed?.foe && setup.unarmed?.avoid, JSON.stringify(setup));
  const r = await g.until(() => {
    const u = F.cur.unarmed, s = F.cur.armed, av = F.E.avatar;
    if (u.priority === 'predator' && Math.hypot(u.memPredatorX - av.position.x, u.memPredatorZ - av.position.z) < 2) F.cur.fled = true;
    if (F.shots.slice(F.cur.n0).some(h => h.shooter === s && h.body === av)) F.cur.shot = true;
    return F.cur.fled && (F.cur.shot || s.lastShotAt > 0) ? { fled: true, shotHit: !!F.cur.shot, fired: s.lastShotAt > 0 } : false;
  });
  check('the unarmed one flees the player, the armed one fires at the player', r.fled && r.fired, JSON.stringify(r));
});

await section('outbreak share', async () => {
  const r = await g.page.evaluate(() => {
    const count = () => F.E.animals.filter(a => a.type === 'human' && a.zombie).length, before = count();
    const want = Math.round(F.cfg.ZOMBIES.startShare * F.E.animals.filter(a => a.type === 'human').length);
    F.E.startOutbreak();   // the Zombies switch's start, run directly on this world
    return { z: count() - before, want };
  });
  check('ZOMBIES.startShare of the people turn at the start', r.z === r.want, `${r.z} zombies, ${r.want} expected`);
});

await section('death fall', async () => {
  // the Collision mode at load is Ragdoll: the body goes down for good at death
  const r = await g.page.evaluate(() => {
    const game = F.pg.game, av = F.E.avatar;
    game.die('fall');
    return { deathFall: game.deathFall, ragdolls: F.E.ragdolls, down: av.isDown(F.E.time), forever: av.downUntil === Infinity };
  });
  check('the player goes down for good at death (Ragdoll mode)', r.deathFall && r.ragdolls && r.down && r.forever, JSON.stringify(r));
});

check('no script errors', g.errors.length === 0, g.errors.join(' | ') || 'none');
await g.close();

// a second load: the Brainless people switch on
const g2 = await openGame({ rootDir, threeDir, switches: { brainless: true } });
await section('Brainless people switch', async () => {
  const r = await g2.page.evaluate(async () => {
    const E = (await import('/src/7b-sim.js')).ecosystem, people = E.animals.filter(a => a.type === 'human' && !a.zombie);   // zombies drop their guns
    const cfg = await import('/src/1-config.js');
    return { people: people.length, brained: people.filter(a => a.brain !== null).length, armed: people.filter(a => a.gun !== null).length, share: cfg.RULE_PEOPLE.allBrainlessArmedShare };
  });
  check('with Brainless people on, no person has a brain', r.people > 0 && r.brained === 0, `${r.brained} brained of ${r.people}`);
  const sd = Math.sqrt(r.people * r.share * (1 - r.share));
  check('with Brainless people on, allBrainlessArmedShare of them are armed', Math.abs(r.armed - r.share * r.people) < 4 * sd, `${r.armed} of ${r.people} (4 sd = ${(4 * sd).toFixed(0)})`);
});
check('no script errors (second load)', g2.errors.length === 0, g2.errors.join(' | ') || 'none');
await g2.close();
const failed = results.filter(r => !r.ok).length;
console.log(`\n# ${results.length - failed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
