// 8b-player-game.js: PLAYER and GAME. What the player drives, and Survivor.
// Player owns: player, keys, play { active, locked }, stance, touch (touchKnob), fly and climb, swimming, playerStep,
// movementHeld, the car and chase camera, the cat and petting, pov and VR.
// Game owns: SURVIVOR_ACTIONS, SURVIVOR_FIELD_ACTIONS, cabinAt and game (Survivor rules, inventory, the run summary).
// Binds: bindInventory, bindKeys, bindMouseLook, bindTouch, bindCar register this file's listeners; 9-main calls
// them in the original listener order. Construction (meshes, canvases) runs at load.
// Fills 8a-render's renderInputs at the end of its load (the only way render sees the player and the game).
// May import: 1-config.js to 8a-render.js and three. It registers into the sim (avatar, afterContacts, plantView)
// only through statements in 9-main.
import * as THREE from 'three';
import {
  HEAD_CLEAR, EYE_HEIGHT, PLAYER_RADIUS, WALK_SPEED, RUN_SPEED, JUMP_SPEED, CROUCH_SPEED, FOOT_TURN_RATE,
  FOOT_CAM_FOLLOW, LOOK_PITCH_MAX, FLY_SPEED, CROUCH_RATE, GRAVITY, LAND_EPS, STEP_UP, GROUND_SNAP, ROAD_WIDTH,
  PATH_KINDS, NPC_TICK_S, DIET_WATER_SHARE, NPC_ATTACK_COOLDOWN_S, NPC_FIGHT_MOVES, NPC_ADULT_AGE, NPC_TICKS_PER_YEAR,
  NPC_START_AGE, NPC_UNIT, PLAYER_HS, NPC_SIZE, NPC_SIZE_Z_MAX, SPECIES, HUMAN_TYPE_ID, HUNTS_MASK, NIGHT_PREY_MASK,
  HUMAN_STRIDE_BASE, HUMAN_STRIDE_PER_V, HUMAN_STRIDE_MAX, HUMAN_CADENCE_MAX, HUMAN_SWING_MAX, HUMAN_IDLE_SPEED,
  HUMAN_GAIT_EASE, HUMAN_GAIT_JUMP, HUMAN_LEG, CROUCH_DROP, HUMAN_PET, PET_BEND_LEVELS, STREET_STEP, CABIN_SCALE,
  CABIN_M, CAT_HEAD_TOP, CAT_SCALE, CAT_SEAT, CAT_DOOR, CAT_RUN_FROM, CAT_WALK_WITHIN, CAT_RUN_SPEED, CAT_BOARD_SPEED,
  CAT_JUMP_TIME, CAT_BOARD_TIMEOUT, CAT_HEAD_FWD, CAT_PET_STEP_SPEED, CAT_PET_SETTLED, CAT_PET_TURN_RATE, TPP_BACK,
  TPP_UP, PLAYER_JOG_ANIM, SURVIVOR_CONFIG, playerPlantFood, STICK_RADIUS, FLICK_RADIUS, TAP_GAP_MS, TAP_SLOP,
  TAP_SWALLOW_MS, TAP_BUTTONS, HOLD_SAFE, CAR_SCALE, CAR_LEN, CAR_WID, CAR_TOP, CAR_WHEELBASE, CAR_TRACK, CAR_WHEEL_R,
  CAR_R, CAR_CIRCLES, CAR_STEP_UP, CAR_SUBSTEP, CAR_ACCEL_MAX, CAR_POWER, CAR_BRAKE, CAR_HANDBRAKE, CAR_REV_MAX,
  CAR_REV_ACCEL, CAR_ROLL, CAR_ENGINE_BRK, CAR_DRAG, CAR_GRIP, CAR_STEER_MAX, CAR_STEER_FALL, CAR_STEER_RATE, CAR_G,
  CAR_GLANCE, CAR_ALIGN, CAR_REACH, CAM_DIST, CAM_PIVOT, CAM_PITCH, CAM_FOLLOW, CAM_LOOK_HOLD, CABIN_CAR_GAP,
  CABIN_CAR_WALKWAY, SWIM_DEPTH, SWIM_FLOAT, SWIM_SPEED, SWIM_JUMP, SWIM_DRAG
} from './1-config.js';
import {
  fightEase, fightClamp01, tools, loop, wake, invalidate
} from './2-core.js';
import {
  renderer, scene, camera, rig, perf
} from './3-gfx-io.js';
import {
  providers, _surf, groundAt, isWaterAt
} from './4-provider.js';
import {
  collision, resolveCollisions, moveAndCollide, supportAt, ceilingAt, solidOverlap, shellAt
} from './5-collision.js';
import {
  foodBoxes, shelters
} from './6-worlds.js';
import {
  startFightMove, humanFightAct, humanMassKg, humanFightMassKg, personInfoKey, personInfoFields, Animal, humanLook, brains, ecosystem,
  simSky
} from './7-sim.js';
import {
  renderInputs, petBendAt, humanPetPack, humanPetHand, graphics, animalRenderer, plantRenderer, populationText,
  HUMAN_INSTANCE_ATTRS, writeHumanLook
} from './8a-render.js';

export const dotEl = document.getElementById('dot');
export const stickEl = document.getElementById('stick');
export const knobEl = document.getElementById('knob');
export const flyEl = document.getElementById('fly');
export const climbEl = document.getElementById('climb');
export const upEl = document.getElementById('up');
export const downEl = document.getElementById('down');

// DOM for the view chip and VR, read by the systems below.
export const povEl = document.getElementById('pov');
export const vrEl = document.getElementById('vr');
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
    return this.look ? personInfoKey(Math.floor(this.ageYears()), this.sex, this.look, game.avatar.bodyHeightM()) : -1;
  },
  gait: { x: NaN, z: NaN, speed: 0, phase: 0, swing: 0, run: 0 },

  // one instance of the people renderer's rig and materials; posed by the mesh's own transform, so iPose stays at the origin
  build() {
    const H = animalRenderer.human;
    const g = new THREE.InstancedBufferGeometry();
    g.setIndex(H.rest.index);
    for (const k in H.rest.attributes) g.setAttribute(k, H.rest.attributes[k]);
    for (const name of HUMAN_INSTANCE_ATTRS) g.setAttribute(name, new THREE.InstancedBufferAttribute(new Float32Array(4), 4));
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
    const { iLook, iShape } = this.body.geometry.attributes;
    writeHumanLook(this.look, iLook.array, iShape.array, 0);
    iLook.needsUpdate = iShape.needsUpdate = true;
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
    const P = HUMAN_PET, kp = NPC_UNIT * pov.heightScale, shoulderW = pov.look.shape.shoulder;
    // the hand's height that meets his head top, in rig units over the body centre (pov.apply's placement)
    const want = (cat.position.y + CAT_HEAD_TOP - (player.pos.y - EYE_HEIGHT)) / kp - SPECIES.human.lift;
    // shallowest bend first, over the shoulder angles the pack can carry, forward first, until the hand (in front of
    // the body) comes down to the head (deeper bends only reach lower); the pose that came nearest wins
    let best = null, bestErr = Infinity;
    search: for (let b = 0; b < PET_BEND_LEVELS; b++) {
      for (let k = 0; k <= 255; k++) {
        const a = P.shoulder[0] + (P.shoulder[1] - P.shoulder[0]) * k / 255, h = humanPetHand(petBendAt(b), a, 0, shoulderW);
        if (h.z <= 0) continue;
        const err = Math.abs(h.y - want);
        if (err < bestErr) { bestErr = err; best = [b, a]; }
        if (h.y <= want) break search;
      }
    }
    if (!best) return;
    [this.bendLevel, this.a1] = best;
    const bend = petBendAt(this.bendLevel), hand = humanPetHand(bend, this.a1, 0, shoulderW);
    // the sweep angle whose sideways reach is sweepM (bisection; the reach grows with the angle up to turnMax)
    const side = P.sweepM / kp, reachAt = a => hand.x - humanPetHand(bend, this.a1, a, shoulderW).x;
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
// INVENTORY SLOTS: one button per SURVIVOR_CONFIG.inventory.keys entry, then the craft slot, built here so the page
// and the config can never disagree on how many slots there are. Each shows its key ('Digit3' shows 3).
export const slotKeyLabel = code => code.replace(/^(Digit|Numpad|Key)/, '');
export function slotButton(key, craft) {
  const b = document.createElement('button');
  b.disabled = true;
  if (craft) b.className = 'craft';
  b.setAttribute('aria-label', craft ? 'Nothing to craft' : 'Empty slot');
  const kbd = document.createElement('kbd');
  kbd.textContent = slotKeyLabel(key);
  b.append(document.createElement('span'), kbd);
  return b;
}
export const slotEls = SURVIVOR_CONFIG.inventory.keys.map(key => slotButton(key, false));
export const craftEl = slotButton(SURVIVOR_CONFIG.craft.key, true);
document.getElementById('slots').prepend(...slotEls, craftEl);   // ahead of the injuries badge
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
  inventory: new Array(SURVIVOR_CONFIG.inventory.keys.length).fill(null),   // makeItem's { kind, food, water, cures } or null
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
    bodyMassKg() { return humanMassKg(pov.sex, pov.look, this.bodyHeightM()); },
    fightMassKg() { return humanFightMassKg(pov.sex, pov.look, this.bodyHeightM()); },   // Ecosystem.fightHit
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

// RENDER INPUTS: what 8a-render reads from this file, wired last so every name here is initialised.
renderInputs.player = player;
renderInputs.casters = () => [cat.mesh, pov.body];
renderInputs.survivor = () => game.on;
renderInputs.pointerTaken = id => id === stickId || id === lookId;
renderInputs.locked = () => play.locked;