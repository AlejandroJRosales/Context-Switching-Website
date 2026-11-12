// 8b-player-game.js: PLAYER and GAME (Survivor). bind* register listeners, called by 9-main in order. Fills 8a-render's
// renderInputs. May import 1-config.js to 8a-render.js and three.
import * as THREE from 'three';
import {
  HEAD_CLEAR, EYE_HEIGHT, PLAYER_RADIUS, WALK_SPEED, RUN_SPEED, JUMP_SPEED, bodyJumpSpeed, CROUCH_SPEED, FOOT_TURN_RATE,
  LOOK_PITCH_MAX, FLY_SPEED, CROUCH_RATE, GRAVITY, LAND_EPS, STEP_UP, GROUND_SNAP, ROAD_WIDTH,
  PATH_KINDS, NPC_TICK_S, DIET_WATER_SHARE, NPC_ATTACK_COOLDOWN_S, NPC_FIGHT_MOVES, NPC_ADULT_AGE, NPC_TICKS_PER_YEAR,
  NPC_START_AGE, NPC_UNIT, PLAYER_HS, NPC_SIZE, NPC_SIZE_Z_MAX, SPECIES, HUMAN_TYPE_ID, HUNTS_MASK, NIGHT_PREY_MASK,
  HUMAN_STRIDE_BASE, HUMAN_STRIDE_PER_V, HUMAN_STRIDE_MAX, HUMAN_CADENCE_MAX, HUMAN_SWING_MAX, HUMAN_IDLE_SPEED,
  HUMAN_GAIT_EASE, HUMAN_GAIT_JUMP, HUMAN_LEG, CROUCH_DROP, HUMAN_PET, PET_BEND_LEVELS, STREET_STEP, CABIN_SCALE,
  CABIN_M, CAT_HEAD_TOP, CAT_SCALE, CAT_SEAT, CAT_DOOR, CAT_RUN_FROM, CAT_WALK_WITHIN, CAT_RUN_SPEED, CAT_BOARD_SPEED,
  CAT_JUMP_TIME, CAT_BOARD_TIMEOUT, CAT_HEAD_FWD, CAT_PET_STEP_SPEED, CAT_PET_SETTLED, CAT_PET_TURN_RATE, TPP_BACK,
  CAT_RADIUS, CAT_BODY_H,
  TPP_UP, PLAYER_JOG_ANIM, SURVIVOR_CONFIG, playerPlantFood, STICK_RADIUS, FLICK_RADIUS, TAP_GAP_MS, TAP_SLOP,
  TAP_SWALLOW_MS, TAP_BUTTONS, HOLD_SAFE, CAR_SCALE, CAR_LEN, CAR_WID, CAR_TOP, CAR_WHEELBASE, CAR_TRACK, CAR_WHEEL_R,
  CAR_R, CAR_CIRCLES, CAR_STEP_UP, CAR_SUBSTEP, CAR_ACCEL_MAX, CAR_POWER, CAR_BRAKE, CAR_HANDBRAKE, CAR_REV_MAX,
  CAR_REV_ACCEL, CAR_ROLL, CAR_ENGINE_BRK, CAR_MASS_KG, CAR_MAX_HEALTH, CAR_HEALTH_PER_J, carDragPerM, CAR_GRIP, CAR_STEER_MAX, CAR_STEER_FALL, CAR_STEER_RATE, CAR_G,
  CAR_GLANCE, CAR_ALIGN, CAR_REACH, CAM_DIST, CAM_PIVOT, CAM_PITCH, CAM_FOLLOW, CAM_LOOK_HOLD, CABIN_CAR_GAP,
  CABIN_CAR_WALKWAY, CAR_DOOR_SPOTS, CAR_TRANSIT, PLAYER_HEIGHT, SWIM_DEPTH, SWIM_FLOAT, SWIM_SPEED, SWIM_JUMP, SWIM_DRAG, NPC_RADIUS, CARRION_MASK, WEAPONS, BULLET_AIM_M, OBSERVER_WEAPON,
  GUN_POSE, GUN_VIEW, GUN_RECOIL, GUN_DRAW, GUN_RELOAD, AIM_BUTTON_GAP_PX, ICONS, ICON_STYLE, GUN_BUTTON_FACE, SOUND
} from './1-config.js';
import { SOUND_MODELS } from './1b-sound-models.js';
import {
  fightEase, fightClamp01, tools, loop, wake, invalidate, sound, footfallBetween
} from './2-core.js';
import {
  renderer, scene, camera, rig, perf
} from './3-gfx-io.js';
import {
  providers, _surf, groundAt, isWaterAt
} from './4-provider.js';
import {
  collision, resolveCollisions, moveAndCollide, supportAt, ceilingAt, solidOverlap, shellAt, occ
} from './5-collision.js';
import {
  foodBoxes, shelters
} from './6-worlds.js';
import {
  startFightMove, humanFightAct, humanMassKg, humanFightMassKg, personInfoKey, personInfoFields, personBodyFields, Animal, humanLook, customizeHumanLook, ecosystem,
  simSky, conditionShare, Ecosystem, regenStep
} from './7b-sim.js';
import {
  renderInputs, petBendAt, humanPetPack, humanPetHand, graphics, animalRenderer, plantRenderer, blobShadows, populationText,
  HUMAN_INSTANCE_ATTRS, writeHumanLook, humanGunPack, humanGaitTerms, humanGunHand, humanGunWaist, buildGunMesh, gunDrawShares,
  GUN_PACK, keyAt, humanSupportHand, buildMagMesh, gunMagWell, gunMagShown
} from './8a-render.js';

export const dotEl = document.getElementById('dot');
const stickEl = document.getElementById('stick');
export const knobEl = document.getElementById('knob');
const flyEl = document.getElementById('fly');
export const climbEl = document.getElementById('climb');
const upEl = document.getElementById('up');
const downEl = document.getElementById('down');

// DOM for the view chip and VR.
export const povEl = document.getElementById('pov');
const vrEl = document.getElementById('vr');
const vrOverlayEl = document.getElementById('vr-overlay');
const vrStatsEl = document.getElementById('vr-stats');

class CatCompanion {
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
    this.boarding = null;          // walk-to-the-door state while boarding
    this.held = null;              // { x, z, yaw } while petted
    this._w = new THREE.Vector3();
    this._seat = new THREE.Vector3();
  }

  // Walls push him out, and the world's edge keeps him in (x, z only; footing is the caller's).
  blockByWalls() {
    const feet = this.position.y;
    this._w.set(this.position.x, 0, this.position.z);
    resolveCollisions(this._w, CAT_RADIUS, feet, feet + CAT_BODY_H, STEP_UP);
    this.position.x = ecosystem.fitX(this._w.x);
    this.position.z = ecosystem.fitZ(this._w.z);
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

  // Boards with the player: round to the passenger door, onto the seat.
  board() {
    if (!this.active || this.inCar || this.boarding) return;
    const [cx, cf] = this.carLocal(this.position.x, this.position.z);
    this.boarding = { t: 0, jump: -1, from: new THREE.Vector3(), run: Math.hypot(cx, cf) > CAT_RUN_FROM };
    loop.sceneDirty = true;
  }

  // car frame (x, z): [right, forward]
  carLocal(x, z) {
    const dx = x - car.x, dz = z - car.z, c = Math.cos(car.yaw), s = Math.sin(car.yaw);
    return [dx * c - dz * s, -dx * s - dz * c];
  }

  // car frame to world
  carWorld(lx, lf, out) {
    const c = Math.cos(car.yaw), s = Math.sin(car.yaw);
    out.x = car.x + c * lx - s * lf; out.z = car.z - s * lx - c * lf;
    return out;
  }

  // Next point toward the passenger door in the car's frame, round the nearer end.
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

  // hop start, kept in the car's frame so a moving car carries it
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
      // too long: appear at the door and hop in
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
        // run while far or the car moves, walk the rest
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
          this.blockByWalls();
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
      // leap in, settle facing forward
      const target = k < 0.5 ? car.yaw - Math.PI / 2 : car.yaw + Math.PI;
      this.yaw += CatCompanion.wrap(target - this.yaw) * Math.min(1, dt * 12);
      this.legs(0, Math.sin(Math.PI * k) * 0.6);
      if (k >= 1) { this.seat(); return; }
    }
    this.mesh.position.copy(this.position);
    this.mesh.rotation.y = this.yaw;
    loop.sceneDirty = true;
  }

  // No shadow while riding.
  setCastShadow(on) {
    this.mesh.traverse(o => {
      if (!o.isMesh) return;
      if (o.userData.builtCastShadow === undefined) o.userData.builtCastShadow = o.castShadow;
      o.castShadow = on && o.userData.builtCastShadow;
    });
    graphics.force = true;
  }

  // A still passenger on the car's mesh.
  seat() {
    this.boarding = null;
    this.inCar = true;
    car.mesh.add(this.mesh);
    this.setCastShadow(false);
    this.mesh.position.set(CAT_SEAT.x, CAT_SEAT.y, CAT_SEAT.z);
    this.mesh.rotation.set(0, Math.PI, 0);   // his forward +z, the car's -z
    for (const leg of this.mesh.userData.legs) leg.rotation.x = 0;
    loop.sceneDirty = true;
  }

  // Gets out by the passenger door if there is room, else beside the player.
  alight() {
    if (this.boarding) { this.boarding = null; return; }   // player left before he boarded
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

  // Petting: he steps to (x, z), faces yaw and stays until release().
  hold(x, z, yaw) { this.held = { x, z, yaw }; }
  release() { this.held = null; }

  // In front of the player, a little right, facing them.
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

  // Footing, floating a little under water.
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
      // petted: step to the held spot, then still
      const h = this.held, hx = h.x - this.position.x, hz = h.z - this.position.z, hd = Math.hypot(hx, hz);
      const step = Math.min(hd, CAT_PET_STEP_SPEED * deltaTime);
      if (hd > 1e-6) {
        this.position.x += hx / hd * step;
        this.position.z += hz / hd * step;
      }
      if (hd > CAT_PET_SETTLED) speed = CAT_PET_STEP_SPEED;
      this.yaw += CatCompanion.wrap(h.yaw - this.yaw) * Math.min(1, deltaTime * CAT_PET_TURN_RATE);
    } else if (distToPlayer > catchUpDist) {
      // too far behind: appear behind the player
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

    this.blockByWalls();

    // gravity to the footing
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

// The body's facing: the rig faces +z at 0, the camera -z.
const bodyYaw = () => player.heading + Math.PI;

export const pov = {
  mode: '3rd',
  body: null,
  // the player's body: a random person drawn each spawn; eye and collision stay PLAYER_HEIGHT's.
  look: null,
  heightScale: PLAYER_HS,
  ageBase: NPC_ADULT_AGE,   // years at tick 0
  ageYears() { return this.ageBase + ecosystem.ticks / NPC_TICKS_PER_YEAR; },
  // stats readout key, or -1 before the first body
  infoKey() {
    return this.look ? personInfoKey(Math.floor(this.ageYears()), this.sex, this.look, game.avatar.bodyHeightM()) : -1;
  },
  gait: { x: NaN, z: NaN, speed: 0, phase: 0, swing: 0, run: 0 },

  // one instance of the people rig, posed by its own transform
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

  // A fresh body from the start screen: null for Random, or Custom with only looks drawn.
  newBody(custom = null) {
    const sex = custom ? custom.sex : (Math.random() < 0.5 ? 'male' : 'female');
    this.sex = sex;
    this.look = humanLook(sex);
    if (custom) customizeHumanLook(this.look, custom);
    const sz = NPC_SIZE.human, [mean, std] = sz[sex];
    const heightM = custom ? custom.heightM : mean + std * Math.max(-NPC_SIZE_Z_MAX, Math.min(NPC_SIZE_Z_MAX, tools.gauss()));
    this.heightScale = heightM / (sz.rig * NPC_UNIT);
    // years at tick 0, aging on the people's clock
    this.ageBase = custom ? custom.age : NPC_START_AGE[0] + Math.random() * (NPC_START_AGE[1] - NPC_START_AGE[0]);
    const G = this.gait;
    G.x = G.z = NaN; G.speed = G.phase = G.swing = G.run = 0;
    if (this.body) this.writeLook();
  },

  writeLook() {
    const { iLook, iShape } = this.body.geometry.attributes;
    writeHumanLook(this.look, iLook.array, iShape.array, 0);
    iLook.needsUpdate = iShape.needsUpdate = true;
  },

  // the NPC gait on the frame's step; off a sprint the legs animate at PLAYER_JOG_ANIM
  stepGait(dt, kp) {
    const G = this.gait;
    const dx = player.pos.x - G.x, dz = player.pos.z - G.z;
    G.x = player.pos.x; G.z = player.pos.z;
    if (!dt) return;
    const moved = Math.sqrt(dx * dx + dz * dz);
    if (!(moved < HUMAN_GAIT_JUMP)) return;   // first sight or teleport: hold the pose
    const d = player.running ? moved : moved * PLAYER_JOG_ANIM;
    if (d === 0 && G.speed < 1e-3) { G.speed = G.swing = G.run = 0; return; }
    const leg = HUMAN_LEG * kp;
    G.speed += (d / dt - G.speed) * (1 - Math.pow(1 - HUMAN_GAIT_EASE, dt / NPC_TICK_S));
    const vl = G.speed / leg;
    const stride = Math.min(HUMAN_STRIDE_MAX, HUMAN_STRIDE_BASE + HUMAN_STRIDE_PER_V * vl);
    const ph = G.phase + Animal.TWO_PI * Math.min(d / (stride * leg), HUMAN_CADENCE_MAX * dt);
    // FOOTSTEP SOUND: a footfall on the ground (not swimming or mid-jump); playback only
    if (player.grounded && !swimming && footfallBetween(G.phase, ph)) {
      sound.emit('footstep', player.pos.x, player.pos.y - EYE_HEIGHT, player.pos.z, game.avatar);
    }
    G.phase = ph >= Animal.TWO_PI ? ph - Animal.TWO_PI : ph;
    G.swing = Math.min(HUMAN_SWING_MAX, Math.asin(Math.min(1, stride / 4))) * Math.min(1, G.speed / HUMAN_IDLE_SPEED);
    G.run = Math.max(0, Math.min(1, (vl - 2.6) / 2.6));
  },

  cycle() {
    this.mode = this.mode === '1st' ? '3rd' : '1st';
    povEl.textContent = this.mode === '1st' ? '1st person' : '3rd person';
    invalidate();
  },

  // Hide the body and its blob.
  hideBody() {
    if (this.body) this.body.visible = false;
    blobShadows.hidePlayer();
  },

  // After step(): step the gait whenever the player is on foot (its footfalls make footstep sounds in either view), then
  // pose the body in 3rd person.
  apply(dt) {
    if (!this.body) this.build();
    const onFoot = !player.inCar && play.active;   // the body walks: its gait (and footsteps) run in either view
    const show = onFoot && this.mode === '3rd' && !renderer.xr.isPresenting;
    const kp = NPC_UNIT * this.heightScale;
    const G = this.gait;
    if (onFoot) {
      // flying: the standing pose
      if (flying) { G.x = player.pos.x; G.z = player.pos.z; G.speed = G.swing = G.run = 0; }
      else this.stepGait(dt, kp);
    }
    if (!show) { this.hideBody(); return; }
    this.body.visible = true;

    const feet = player.pos.y - EYE_HEIGHT;
    const b = this.body;
    b.position.set(player.pos.x, feet + SPECIES.human.lift * kp, player.pos.z);
    b.rotation.y = bodyYaw();
    // no blob for a floating or submerged body
    if (flying || swimming) blobShadows.hidePlayer();
    else blobShadows.placePlayer(player.pos.x, feet, player.pos.z, b.rotation.y, kp);

    const gait = b.geometry.attributes.iGait;
    // iGait.w: negative crouch share while crouching, else run share
    const crouchShare = crouchY / CROUCH_DROP;
    gait.array[0] = kp; gait.array[1] = G.phase; gait.array[2] = G.swing; gait.array[3] = crouchShare > 0 ? -crouchShare : G.run;
    gait.needsUpdate = true;
    const act = b.geometry.attributes.iAct;
    humanFightAct(game.avatar, ecosystem.time, act.array, 0);
    act.array[3] = gunView.inHand ? humanGunPack(gunView.aim, player.pitch, gunView.shares.reach, gunView.shares.hold, gunView.reload) : petting.act();
    act.needsUpdate = true;
    // knocked down: ragdoll or lying pose (AnimalRenderer.bodyDown). Its ground is the feet while braced (standing or
    // swimming); airborne, the surface under the body (supportAt from the feet down), so a mid-jump fall reaches the floor.
    const downGround = game.avatar.braced() ? feet : supportAt(player.pos.x, player.pos.z, feet, -Infinity);
    const down = b.geometry.attributes.iDown;
    animalRenderer.bodyDown(game.avatar, ecosystem.time, kp, b.position.x, b.position.y, b.position.z, b.rotation.y, downGround, down.array);
    down.needsUpdate = true;

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

// VR: the Arena's WebXR session; the rig carries the headset to the feet.
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

  // The head sits EYE_HEIGHT over the rig in local-floor space.
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

// PETTING: the player squats and turns so the hand comes over the cat, who steps under it; moving off, the car, flying
// or dying ends it.
const petting = {
  t: -1,                       // seconds in; -1: not petting
  bendLevel: 0,                // bend level and shoulder angle for this pet
  a1: 0,
  turnAmp: 0,                  // sweep angle for sweepM either side
  at: new THREE.Vector3(),     // where the player stands
  get on() { return this.t >= 0; },
  get duration() { const P = HUMAN_PET; return 2 * P.reachS + P.strokes * P.strokeS; },

  // the cat can be petted
  canPet() { return !this.on && cat.active && !cat.inCar && !cat.boarding; },

  start() {
    if (!this.canPet() || !pov.look) return;
    const P = HUMAN_PET, kp = NPC_UNIT * pov.heightScale, shoulderW = pov.look.shape.shoulder;
    // hand height meeting his head, rig units
    const want = (cat.position.y + CAT_HEAD_TOP - (player.pos.y - EYE_HEIGHT)) / kp - SPECIES.human.lift;
    // shallowest bend that brings the hand to the head; nearest wins
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
    // sweep angle reaching sweepM (bisection)
    const side = P.sweepM / kp, reachAt = a => hand.x - humanPetHand(bend, this.a1, a, shoulderW).x;
    let lo = 0, hi = P.turnMax;
    if (reachAt(hi) <= side) lo = hi;
    else for (let i = 0; i < 24; i++) { const m = (lo + hi) / 2; if (reachAt(m) < side) lo = m; else hi = m; }
    this.turnAmp = lo;
    // his centre under the hand; the player turns toward the cat
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

  // cut short, so the squat ends too
  end(early) {
    this.t = -1;
    cat.release();
    if (early) stance.unsquat();
  },

  // iAct.w pose: reach eases, sweep runs left, right, left per stroke
  act() {
    if (!this.on) return 0;
    const P = HUMAN_PET, t = this.t;
    const share = fightEase(fightClamp01(Math.min(t, this.duration - t) / P.reachS));
    const strokes = Math.max(0, Math.min(P.strokes, (t - P.reachS) / P.strokeS));
    return humanPetPack(share, this.bendLevel, this.a1, -this.turnAmp * Math.cos(2 * Math.PI * strokes));
  }
};

// GUN VIEW: the gun in the hand (game.weapon, unless petting), else tucked flat at the small of the back while one is
// carried; in 1st person a view model before the camera. draw and holster animate between them (GUN_DRAW); Aim
// (toggleAim: the Aim button, right mouse) raises it along the view and zooms in. A reload (GUN_RELOAD) brings the gun
// in and the support hand to the belt and back with a fresh magazine, which seats in the grip.
const gunView = {
  hand: null, waist: null, view: null,   // meshes: the hand's and the waistband's on the 3rd-person body, the 1st-person one
  magHand: null, magView: null,   // the fresh magazine: in the 3rd-person support hand, under the 1st-person gun
  reload: -1,            // the reload's share drawn this frame (GUN_PACK's move steps), -1 with none or the gun not all the way in hand
  drawP: 0,              // draw progress, 0 tucked to 1 in hand (gunDrawShares)
  drawDir: 0,            // +1 drawing, -1 holstering, 0 still
  afterHolster: null,    // run once a holster ends (getting in the car)
  carGun: null,          // the gun holstered to get in the car, drawn again on getting out
  shares: { hold: 0, reach: 1, inHand: false },   // gunDrawShares(drawP)
  aim: 0,                // aim share, 0 low ready to 1 aimed
  inHand: false,         // the gun arm is in its gun pose this frame (a gun drawn or being drawn, not petting)
  aimOn: false,          // Aim toggled on; off whenever the gun leaves the hand
  aiming: false,         // Aim is on with the gun drawn and the body free to aim
  recoil: 0,             // radians of the view's recoil climb not yet settled back
  baseFov: NaN,          // the camera's own fov, before the aim zoom
  _terms: {}, _at: {}, _w: {}, _sup: {}, _v: new THREE.Vector3(), _p: new THREE.Vector3(), _q: new THREE.Quaternion(), _hq: new THREE.Quaternion(),
  _roll: new THREE.Quaternion(), _rv: [0, 0, 0, 0, 0],
  _flip: new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI),

  // the meshes, once the body exists
  build() {
    this.hand = buildGunMesh(); this.waist = buildGunMesh(); this.view = buildGunMesh();
    this.magHand = buildMagMesh(); this.magView = buildMagMesh();
    pov.body.add(this.hand, this.waist, this.magHand);
    this.view.castShadow = this.magView.castShadow = false;
    this.view.add(this.magView);   // in the gun's frame, below its well
    scene.add(this.view);
    this.baseFov = camera.fov;
  },

  // drawn all the way and still: it may aim and fire
  get ready() { return game.weapon !== null && this.drawP === 1 && this.drawDir === 0; },

  // the gun's place with no animation (game.equip): in hand for a gun, tucked for none
  settle(drawn) { this.drawP = drawn ? 1 : 0; this.drawDir = 0; this.afterHolster = null; },

  // Draw `item` from the back (or turn a holster of it around).
  draw(item) {
    if (game.weapon !== item) { game.equip(item, false); this.drawP = 0; }
    this.drawDir = 1; this.afterHolster = null;
    wake();
  },

  // Put the gun in hand back behind the back; `then` runs once it is there (now, with none in hand).
  holster(then = null) {
    if (game.weapon === null) { if (then) then(); return; }
    this.drawDir = -1; this.afterHolster = then; this.aimOn = false;
    wake();
  },

  // Aim on or off, with a gun drawn.
  toggleAim() { this.aimOn = !this.aimOn && this.ready; wake(); },

  // RECOIL: a shot climbs the view (player.pitch, so the next shot goes higher until it settles); step settles it back.
  kick() {
    const to = Math.min(LOOK_PITCH_MAX, player.pitch + GUN_RECOIL.kick);
    this.recoil += to - player.pitch;
    player.pitch = to;
    wake();
  },

  // In the car: no aim and no view model (the body and its guns hide with pov.hideBody).
  stow() {
    this.aimOn = this.aiming = false; this.aim = 0; this.recoil = 0;
    if (this.view) this.view.visible = false;
    if (!Number.isNaN(this.baseFov) && camera.fov !== this.baseFov) { camera.fov = this.baseFov; camera.updateProjectionMatrix(); }
  },

  // Before pov.apply: the draw's progress, what is drawn where, and the aim share and zoom.
  step(dt) {
    game.settleReload(ecosystem.time);
    if (this.drawDir !== 0) {
      this.drawP = Math.min(1, Math.max(0, this.drawP + this.drawDir * dt / GUN_DRAW.drawS));
      if (this.drawP === 1) this.drawDir = 0;
      else if (this.drawP === 0) {   // holstered
        const then = this.afterHolster;
        game.equip(null);
        if (then) then();
      }
    }
    gunDrawShares(this.drawP, this.shares);
    // the reload drawn: only with the gun all the way in hand (it shares the pack's move field with the draw's reach),
    // stepped as the pack steps it so the meshes placed here match the drawn arms
    const reloadShare = game.reloadShare(ecosystem.time), P = GUN_PACK.move[1];
    this.reload = reloadShare >= 0 && this.shares.reach === 0 ? Math.round(reloadShare * P) / P : -1;
    const down = game.avatar.isDown(ecosystem.time);
    this.inHand = game.weapon !== null && !petting.on;
    if (!this.ready) this.aimOn = false;
    // Aim stays on through a reload, the arms lowered until it ends
    this.aiming = this.inHand && this.aimOn && play.active && !player.inCar && !flying && !down && this.reload < 0;
    if (this.recoil > 0) {
      const settle = this.recoil * (1 - Math.exp(-dt / GUN_RECOIL.recoverS));   // this frame's share back
      player.pitch -= settle; this.recoil -= settle;
      if (this.recoil < 1e-4) { player.pitch -= this.recoil; this.recoil = 0; }
    }
    const to = this.aiming ? 1 : 0, rate = dt / GUN_POSE.aimS;
    this.aim = this.aim < to ? Math.min(to, this.aim + rate) : Math.max(to, this.aim - rate);
    if (this.aiming && !renderer.xr.isPresenting) player.heading = player.yaw;   // the body faces the view to aim
    if (!Number.isNaN(this.baseFov)) {
      const fov = this.baseFov / (1 + (GUN_POSE.zoom - 1) * this.aim);
      if (fov !== camera.fov) { camera.fov = fov; camera.updateProjectionMatrix(); }
    }
  },

  // a gun carried but not in hand: Survivor's inventory gun, Observer's chosen one
  carriedTucked() {
    const gun = game.carriedGun();
    return gun !== null && gun !== game.weapon;
  },

  // After pov.apply: the body's guns from the drawn gait, and the view model from the camera.
  place() {
    if (!pov.body) return;
    if (!this.hand) this.build();
    const b = pov.body, kp = NPC_UNIT * pov.heightScale, down = game.avatar.isDown(ecosystem.time), S = this.shares;
    const terms = humanGaitTerms(b.geometry.attributes.iGait.array, b.geometry.attributes.iAct.array, this._terms);
    const handShown = this.inHand && S.inHand && !down;   // past the draw's grab
    this.hand.visible = handShown;
    this.waist.visible = !handShown && !down && (game.weapon !== null || this.carriedTucked());
    const waist = pov.look ? humanGunWaist(terms, pov.look.shape.waist, this._w) : null;
    if (handShown && pov.look) {
      const h = humanGunHand(this.aim, player.pitch, S.reach, this.reload, terms, pov.look.shape.shoulder, this._at);
      this._hq.setFromAxisAngle(this._v.set(1, 0, 0), Math.atan2(Math.cos(h.angle), -Math.sin(h.angle)));   // barrel along the forearm
      // on the way from the back the gun turns from its tucked place to the hand's by the reach share
      this.hand.position.set(h.x, h.y, h.z).lerp(this._p.set(waist.x, waist.y, waist.z), S.reach).multiplyScalar(kp);
      this.hand.quaternion.copy(this._hq).slerp(waist.q, S.reach);
    }
    // the fresh magazine: its base in the support hand, parallel to the grip it seats in
    this.magHand.visible = handShown && pov.look !== null && gunMagShown(this.reload);
    if (this.magHand.visible) {
      const m = humanSupportHand(this.reload, terms, pov.look.shape.shoulder, this._sup);
      this.magHand.position.set(m.x * kp, m.y * kp, m.z * kp);
      this.magHand.quaternion.copy(this.hand.quaternion);
    }
    if (this.waist.visible && waist) {
      this.waist.position.set(waist.x * kp, waist.y * kp, waist.z * kp);
      this.waist.quaternion.copy(waist.q);
    }
    // 1st person: grip low right, moved to under the crosshair by the aim share; a draw brings it up from drawFrom; a
    // reload moves and turns it by GUN_RELOAD.view while the fresh magazine rises into its well
    const firstPerson = pov.mode === '1st' && handShown && play.active && !player.inCar && !renderer.xr.isPresenting;
    this.view.visible = firstPerson;
    if (firstPerson) {
      const k = this.aim, r = S.reach, H = GUN_VIEW.hold, A = GUN_VIEW.aim, F = GUN_VIEW.drawFrom, kicked = this.recoil / GUN_RECOIL.kick;   // kicked: 1 at a shot, to 0 settled
      const RV = GUN_RELOAD.view, u = Math.max(this.reload, 0), rv = this._rv;   // u 0 off a reload: the view keys' ends, no offset
      for (let c = 0; c < rv.length; c++) rv[c] = keyAt(RV, c + 1, u);   // x, y, z, pitch, roll
      const at = i => H[i] + (A[i] - H[i]) * k, from = i => at(i) + (F[i] - at(i)) * r + rv[i];
      this.view.position.set(from(0), from(1), from(2) + GUN_RECOIL.backM * kicked).applyQuaternion(camera.quaternion).add(camera.position);
      this._q.setFromAxisAngle(this._v.set(1, 0, 0), -(GUN_VIEW.holdPitch * (1 - k) + this.recoil + rv[3]));   // muzzle up by the tilt, flipping up with the kick and the reload (+x turns a +z barrel down)
      this._roll.setFromAxisAngle(this._v.set(0, 0, 1), rv[4]);   // the reload's cant about the barrel
      this.view.quaternion.copy(camera.quaternion).multiply(this._flip).multiply(this._q).multiply(this._roll);   // barrel ahead of the camera
      this.magView.visible = gunMagShown(this.reload);
      if (this.magView.visible) {
        const M = GUN_RELOAD.magAt, d = keyAt([[M[0], GUN_RELOAD.viewMagFromM], [M[1], 0]], 1, this.reload);   // metres below the well
        this.magView.position.copy(gunMagWell.at).addScaledVector(gunMagWell.down, d);
      }
    }
    loop.sceneDirty = true;
  }
};

// THE DOT in 3rd person shows where shots go, even with the HUD off (Survivor); 1st person keeps its own rule.
let dotForced = false;
function syncDot() {
  const force = pov.mode === '3rd' && play.active && !player.inCar && dotEl.classList.contains('on');
  if (force === dotForced) return;
  dotForced = force;
  // important, so a stylesheet rule that hides it (the HUD off) cannot win; cleared to give the stylesheet back
  for (const [k, v] of [['display', 'block'], ['visibility', 'visible'], ['opacity', '1']]) {
    if (force) dotEl.style.setProperty(k, v, 'important');
    else dotEl.style.removeProperty(k);
  }
}

// Item use by kind: run() applies it; `consumed` empties the slot.
const SURVIVOR_ACTIONS = {
  open: { verb: 'Open', consumed: false, run(g, slot) { g.inventory[slot] = g.rollLoot(); } },
  eat: { verb: 'Eat', past: 'Ate', consumed: true, run(g, slot, item) { g.eat(Math.min(item.food, g.foodNeed)); } },
  drink: { verb: 'Drink', past: 'Drank', consumed: true, run(g, slot, item) { g.drink(item.water); } },
  treat: { verb: 'Use', past: 'Used', consumed: true, run(g, slot, item) { g.cure(item.cures); } },
  // in hand, or back in the slot when it already is
  equip: { verb: 'Equip', consumed: false, run(g, slot, item) { if (g.weapon === item && gunView.drawDir >= 0) gunView.holster(); else gunView.draw(item); } }
};

// Action button choices on foot, first in reach first: find() returns a target; run() acts on press, or each tick for
// `hold`.
const SURVIVOR_FIELD_ACTIONS = {
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
  // a dead animal the player's species eats (SPECIES.human.carrion), cut up into one meat
  carcass: {
    label: 'Harvest',
    squat: true,
    find: (g, x, feet, z) => g.inventory.includes(null) ? g.carcassInReach(x, feet, z) : null,
    run: (g, body) => g.butcher(body)
  },
  drink: {
    label: 'Drink',
    hold: true,
    find: (g, x, feet, z) => g.atWater(x, z) ? true : null,
    run: (g, target, dt) => g.drink(SURVIVOR_CONFIG.needs.drinkPerS * dt)
  },
  // last, so a plant, box or water by the cat keeps the button
  pet: {
    label: 'Pet',
    find: (g, x, feet, z) => petting.canPet() && g.catInReach(x, feet, z) ? cat : null,
    run: () => petting.start()
  }
};

const needsEl = document.getElementById('needs');
const needHealthEl = document.getElementById('needHealth');
const needCarRowEl = document.getElementById('needCarRow');   // the car's health row, shown while driving
const needCarEl = document.getElementById('needCar');
const needFoodEl = document.getElementById('needFood');
const needWaterEl = document.getElementById('needWater');
const needDayEl = document.getElementById('needDay');
const needInfoEl = document.getElementById('needInfo');
const needBodyEl = document.getElementById('needBody');
// An icon svg `px` square, centred in its box (ICON_STYLE sizes).
const sizeIcon = (svg, px) => Object.assign(svg.style, {
  display: 'block', width: px + 'px', height: px + 'px', margin: '0 auto', pointerEvents: 'none'
});
// An icon into `el` at `px`: ICONS markup as markup, anything else (emoji, a word) as text. Icons come only from
// 1-config.js.
function showIcon(el, icon, px) {
  if (!icon.startsWith('<svg')) { el.textContent = icon; return; }
  el.innerHTML = icon;
  sizeIcon(el.firstElementChild, px);
}
// INVENTORY SLOTS: one button per key, then the craft slot.
const slotKeyLabel = code => code.replace(/^(Digit|Numpad|Key)/, '');
function slotButton(key, craft) {
  const b = document.createElement('button');
  b.disabled = true;
  b.style.color = ICON_STYLE.slotColor;   // the icons' currentColor
  if (craft) b.className = 'craft';
  b.setAttribute('aria-label', craft ? 'Nothing to craft' : 'Empty slot');
  const kbd = document.createElement('kbd');
  kbd.textContent = slotKeyLabel(key);
  b.append(document.createElement('span'), kbd);
  return b;
}
const slotEls = SURVIVOR_CONFIG.inventory.keys.map(key => slotButton(key, false));
const craftEl = slotButton(SURVIVOR_CONFIG.craft.key, true);
document.getElementById('slots').prepend(...slotEls, craftEl);   // before the injuries badge
const injuriesEl = document.getElementById('injuries');
const hurtFlashEl = document.getElementById('hurtflash');
const runOverEl = document.getElementById('runover');
const runCauseEl = document.getElementById('runCause');
const runStatsEl = document.getElementById('runStats');

// Inside a cabin at (x, y, z).
function cabinAt(x, y, z) {
  for (const c of shelters.list) {
    const qx = x - c.cx, qz = z - c.cz;
    const lx = qx * c.cosR - qz * c.sinR, lz = qx * c.sinR + qz * c.cosR;
    if (Math.abs(lx) < c.inHalfX && Math.abs(lz) < c.inHalfZ && y >= c.floorY - 0.5 && y < c.ceilY) return true;
  }
  return false;
}

// SIM-TIME STAMPS: each world's sim clock starts at 0, so game.reset puts these back (a stale stamp blocks the gun or fists).
const GAME_CLOCKS = { nextShotAt: 0, reloadUntil: -1 };   // next shot; magazine change end (-1: none)
const AVATAR_CLOCKS = { nextAttackAt: 0, moveAt: -Infinity, fightFrom: 0, fightUntil: 0, downAt: -Infinity, downUntil: 0 };

export const game = {
  on: false,
  dead: false,
  health: SURVIVOR_CONFIG.maxHealth,
  foodNeed: 0,
  waterNeed: 0,
  sheltered: false,       // in the car or a cabin: nothing hurts the player
  fieldHeld: null,        // held field action, or null
  inventory: new Array(SURVIVOR_CONFIG.inventory.keys.length).fill(null),   // item or null
  injuries: new Set(),    // injury keys the player has
  run: null,              // run record: hours, eaten, cause
  _lastHour: null,
  _q: [], _qp: [], _qb: [], _qBump: [],
  _bumpX: NaN, _bumpZ: NaN,   // position at the last bumpAnimals, for velocity
  _shown: -1, _shownCar: -2, _shownDay: -1, _shownSlots: '', _shownInjuries: '', _shownInfo: -1, _shownLook: null,
  // WEAPON in hand: an item with `mag` and `reserve` rounds (a Survivor slot's, or Observer's Weapon chip's), or null
  weapon: null,
  weaponChoice: false,    // Observer's Weapon chip: its gun in hand in Observer, carried into Survivor in a slot and in hand
  observerGun: null,      // Observer's chosen gun, kept (with its rounds) while the chip is on
  ...GAME_CLOCKS,         // sim time the next shot may go; sim time a magazine change ends (-1: not changing)
  _aimFrom: new THREE.Vector3(), _aimDir: new THREE.Vector3(),

  // The ecosystem's view of the player, alive only in Survivor play.
  avatar: {
    type: 'player', alive: false, prey: false, position: new THREE.Vector3(),
    startHealth: SURVIVOR_CONFIG.maxHealth,
    ...AVATAR_CLOCKS,   // next attack; fight move (drawn on the 3rd-person body); knockdown fall start and hold end
    playing: null, moveSide: 1,
    // KNOCKDOWNS, as an animal's: heading, launch speed
    downYaw: 0, downDV: 0,
    isDown(now) { return now < this.downUntil; },
    // knockable in play in either mode, not in the car or a cabin
    knockable() { return play.active && !game.sheltered && !game.dead; },
    braced() { return player.grounded || swimming; },          // no hold mid-jump or falling
    get facingAngle() { return bodyYaw(); },                  // body facing
    get health() { return game.health; },
    get look() { return pov.look; },                          // the player's look (the ragdoll's shape)
    strike() { startFightMove(this, NPC_FIGHT_MOVES.human, ecosystem.time); },
    bodyHeightM() { return pov.heightScale * NPC_SIZE.human.rig * NPC_UNIT; },
    bodyMassKg() { return humanMassKg(pov.sex, pov.look, this.bodyHeightM()); },
    fightMassKg() { return humanFightMassKg(pov.sex, pov.look, this.bodyHeightM()); },   // Ecosystem.fightHit
    // condition: health share x energy share
    condition() { return conditionShare(game.health, SURVIVOR_CONFIG.maxHealth, game.foodNeed, game.waterNeed); },
    // animal `tid` flees the player
    isThreatTo(tid) { return this.alive && (HUNTS_MASK[HUMAN_TYPE_ID] & (1 << tid)) !== 0 && !this.isPreyFor(tid); },
    // animal `tid` hunts the player at night
    isPreyFor(tid) { return this.alive && this.prey && (NIGHT_PREY_MASK[tid] & (1 << HUMAN_TYPE_ID)) !== 0; },
    // health only in Survivor; a kill feeds the attacker when `feeds` (false for bump impacts)
    takeHit(attacker, damage, feeds = true) {
      if (!game.on || game.sheltered || game.dead) return;
      game.hurt(damage, attacker.type);
      if (game.dead && feeds) attacker.feedOn(this);
      else game.rollInjuries(damage);
    },
    feedOn(victim) {
      if (!game.on) return;   // the player eats only in Survivor (an Observer punch can kill)
      game.eat(victim.startHealth);
      game.tally(victim.type);
    }
  },

  // ANIMAL DAMAGE: the player's bumps, car hits and punches cost animals health in Survivor, and in Observer with the
  // Animal damage chip on (9-main); otherwise bumps only push and punches miss. The player (avatar.takeHit) and the car
  // lose health only in Survivor.
  animalDamage: false,   // Observer's Animal damage chip
  playerHurtsAnimals() { return this.on || this.animalDamage; },
  carTakesDamage() { return this.on; },

  reset() {
    this.dead = false;
    this.health = SURVIVOR_CONFIG.maxHealth;
    this.foodNeed = 0;
    this.waterNeed = 0;
    if (this.on) this.equip(null);   // Survivor's gun was a slot's; Observer's chip keeps its own
    this.inventory.fill(null);
    if (this.on) this.applyWeaponChoice();   // a new run starts with the chosen gun
    this.injuries.clear();
    this.fieldHeld = null;
    this.run = { hours: 0, eaten: {}, cause: null };
    this._lastHour = null;
    Object.assign(this, GAME_CLOCKS);
    Object.assign(this.avatar, AVATAR_CLOCKS);
    this.showPanel();
    this.draw();
  },

  // Health loss; `cause` names it for the run summary. A hit flashes the edge.
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

  // REGEN by the animals' rule (regenStep) at the player's drink rate; needs run 0 (full) to 100 (empty)
  regen(dt) { regenStep(this, SURVIVOR_CONFIG.maxHealth, 100, SURVIVOR_CONFIG.needs.drinkPerS / 100, dt); },

  // food, with its water
  eat(food) {
    const N = SURVIVOR_CONFIG.needs;
    this.foodNeed = Math.max(0, this.foodNeed - food);
    this.waterNeed = Math.max(0, this.waterNeed - food * DIET_WATER_SHARE * N.waterPerS / N.foodPerS);
  },

  // water need removed
  drink(water) { this.waterNeed = Math.max(0, this.waterNeed - water); },

  // A hit or fall of `damage` health: each missing injury sets in for sure at sureDamageShare of maxHealth or more,
  // else with chanceBelowSure.
  rollInjuries(damage) {
    const all = SURVIVOR_CONFIG.injuries;
    for (const id in all) {
      const d = all[id], sure = damage >= d.sureDamageShare * SURVIVOR_CONFIG.maxHealth;   // true: always; false: chanceBelowSure
      if (!this.injuries.has(id) && (sure || Math.random() < d.chanceBelowSure)) this.injuries.add(id);
    }
    this.draw();
  },

  // Mend `ids`.
  cure(ids) { for (const id of ids) this.injuries.delete(id); },

  // May sprint: no running-stopping injury (Survivor only).
  canRun() {
    if (!this.on) return true;
    for (const id of this.injuries) if (SURVIVOR_CONFIG.injuries[id].noRun) return false;
    return true;
  },

  tally(kind) { this.run.eaten[kind] = (this.run.eaten[kind] || 0) + 1; },

  // An item of `kind`; `own` overrides its food and water.
  makeItem(kind, own = null) {
    const def = SURVIVOR_CONFIG.inventory.items[kind], gun = def.weapon ? WEAPONS[def.weapon] : null;   // gun: null unless a weapon
    return {
      kind, food: def.food ?? 0, water: def.water ?? 0, cures: def.cures ?? [],
      mag: gun ? gun.magazine : 0, reserve: gun ? gun.reserve : 0, ...own
    };
  },

  // WEAPONS: `item` in hand at once (null: bare hands), drawn all the way unless `drawn` is false (gunView.draw animates);
  // a magazine change in progress stops.
  equip(item, drawn = true) {
    this.weapon = item;
    this.reloadUntil = -1;
    gunView.settle(drawn && item !== null);
    this.draw();
  },

  // WEAPON CHOICE (the chip): Observer gets its gun in hand or none; Survivor gets a gun in a slot (an inventory gun, else
  // a new found-reserve one in the first free slot) in hand, and loses nothing when the choice is off. `animate`: the
  // chip's own change draws or holsters (in the car, it waits for getting out); mode changes and new runs are instant.
  chooseWeapon(on) { this.weaponChoice = on; this.applyWeaponChoice(true); },
  applyWeaponChoice(animate = false) {
    const W = OBSERVER_WEAPON;
    if (!this.on) {
      if (!this.weaponChoice) this.observerGun = null;
      const gun = this.carriedGun();
      if (player.inCar) { gunView.carGun = gun; return; }
      if (!animate) this.equip(gun);
      else if (gun) gunView.draw(gun);
      else gunView.holster();
      return;
    }
    if (this.weapon !== null && !this.inventory.includes(this.weapon)) this.equip(null);   // Observer's gun stays behind
    if (!this.weaponChoice) return;
    let gun = this.carriedGun();
    if (!gun) {
      const free = this.inventory.indexOf(null);
      if (free < 0) return;   // no room: the inventory as it is
      gun = this.inventory[free] = this.makeItem(W.item);
    }
    this.equip(gun);
  },

  // The gun the player carries (in hand or not), or null: Survivor's first inventory gun, Observer's chosen one.
  carriedGun() {
    if (this.on) return this.inventory.find(it => it !== null && SURVIVOR_CONFIG.inventory.items[it.kind].weapon) ?? null;
    if (!this.weaponChoice) return null;
    return this.observerGun ??= this.makeItem(OBSERVER_WEAPON.item, { reserve: OBSERVER_WEAPON.reserve });
  },

  gunOf(item) { return WEAPONS[SURVIVOR_CONFIG.inventory.items[item.kind].weapon]; },

  // A magazine change starts when there are spare rounds and room for them.
  startReload(w, gun, now) { if (w.reserve > 0 && w.mag < gun.magazine) this.reloadUntil = now + gun.reloadS; },
  finishReload(w, gun) {
    const n = Math.min(gun.magazine - w.mag, w.reserve);
    w.mag += n; w.reserve -= n;
    this.reloadUntil = -1;
  },
  // A magazine change ends once its time is up: each frame (gunView.step) and before a shot, so the rounds land as the
  // reload ring fills, not at the next tap. Returns true while one is still under way.
  settleReload(now) {
    if (this.reloadUntil < 0) return false;
    if (now < this.reloadUntil) return true;
    this.finishReload(this.weapon, this.gunOf(this.weapon));
    return false;
  },
  // Share of the magazine change done, 0 to 1, or -1 with none under way: the attack button's reload ring and the
  // reload animation (gunView.reload, GUN_RELOAD's keys) both run on it.
  reloadShare(now) {
    if (this.reloadUntil < 0 || this.weapon === null) return -1;
    const reloadAnimS = this.gunOf(this.weapon).reloadS;   // the animation's length: the gun's reload time, so they end together
    return Math.max(0, Math.min(1, 1 - (this.reloadUntil - now) / reloadAnimS));
  },

  // FIRE in either mode, once per shotS; an empty magazine changes over reloadS. The bullet leaves the eye toward what
  // the crosshair covers and costs animals health where the player hurts them (playerHurtsAnimals).
  fire() {
    const w = this.weapon;
    if (!w || !gunView.ready || !play.active || this.dead || !ecosystem.ready) return;
    const gun = this.gunOf(w), now = ecosystem.time;
    if (this.settleReload(now)) return;   // still changing magazines
    if (now < this.nextShotAt) return;
    if (w.mag <= 0) { this.startReload(w, gun, now); return; }
    w.mag--;
    this.nextShotAt = now + gun.shotS;
    // aim: the first thing on the camera's ray, BULLET_AIM_M at most
    const from = camera.getWorldPosition(this._aimFrom), dir = camera.getWorldDirection(this._aimDir);
    const hit = ecosystem.projectiles.cast(from.x, from.y, from.z,
      from.x + dir.x * BULLET_AIM_M, from.y + dir.y * BULLET_AIM_M, from.z + dir.z * BULLET_AIM_M);
    const reach = Math.min(1, hit.t) * BULLET_AIM_M;
    const ex = player.pos.x, ey = player.pos.y - crouchY, ez = player.pos.z;   // the eye
    let dx = from.x + dir.x * reach - ex, dy = from.y + dir.y * reach - ey, dz = from.z + dir.z * reach - ez;
    const len = Math.hypot(dx, dy, dz);
    // an aim point at or behind the eye (something between camera and body): straight along the view
    if (len < 1e-3 || dx * dir.x + dy * dir.y + dz * dir.z <= 0) { dx = dir.x; dy = dir.y; dz = dir.z; }
    else { dx /= len; dy /= len; dz /= len; }
    if (dx !== 0 || dz !== 0) player.heading = Math.atan2(-dx, -dz);   // the body faces the shot
    this.placeAvatar();
    ecosystem.projectiles.fire(this.avatar, ex, ey, ez, dx, dy, dz, gun, this.playerHurtsAnimals());
    sound.emit('gunshot', ex, ey, ez, this.avatar);
    gunView.kick();
    if (w.mag === 0) this.startReload(w, gun, now);
  },

  // The first recipe the inventory holds, with its slots, or null.
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

  // Craft: use the items, put the made one in the first freed slot.
  craft() {
    if (!this.on || this.dead) return;
    const c = this.craftable();
    if (!c) return;
    for (const i of c.slots) this.inventory[i] = null;
    this.inventory[Math.min(...c.slots)] = this.makeItem(c.recipe.makes);
    this.draw();
  },

  // A box's contents: one kind by loot weight.
  rollLoot() {
    const items = SURVIVOR_CONFIG.inventory.items;
    let total = 0;
    for (const k in items) total += items[k].loot ?? 0;
    let r = Math.random() * total;
    for (const k in items) {
      const w = items[k].loot ?? 0;
      if (w > 0 && (r -= w) < 0) return this.makeItem(k);
    }
    return null;   // empty box
  },

  // Landing at impactSpeed: drop height v^2 / 2g, so a teleport never counts as a fall.
  land(impactSpeed) {
    if (!this.on || !play.active || this.dead) return;
    const F = SURVIVOR_CONFIG.fall;
    const dropHeight = impactSpeed * impactSpeed / (2 * GRAVITY);
    if (dropHeight <= F.safeM) return;
    const damage = (dropHeight - F.safeM) * F.damagePerM;
    this.hurt(damage, 'fall');
    // a hurting fall may injure (rollInjuries: sure past sureDamageShare)
    if (!this.dead) this.rollInjuries(damage);
  },

  update(dt) {
    const av = this.avatar;
    // sheltered in both modes, since knockdowns reach the player in Observer
    const px = player.pos.x, pz = player.pos.z;
    const feet = this.placeAvatar();
    this.sheltered = player.inCar || cabinAt(px, feet, pz);
    av.alive = this.on && play.active && !this.dead;
    if (!av.alive) { av.prey = false; return; }
    const N = SURVIVOR_CONFIG.needs, R = SURVIVOR_CONFIG.reach;
    av.prey = ecosystem.night && !this.sheltered;

    // days survived on the sky's clock
    const hour = simSky.hour;
    if (this._lastHour !== null) this.run.hours += (hour - this._lastHour + 24) % 24;
    this._lastHour = hour;

    const cost = player.running ? N.sprintCost : 1;
    this.foodNeed = Math.min(100, this.foodNeed + N.foodPerS * cost * dt);
    this.waterNeed = Math.min(100, this.waterNeed + N.waterPerS * cost * dt);
    if (this.foodNeed >= 100) this.hurt(N.starvingPerS * dt, 'starving');
    if (this.waterNeed >= 100) this.hurt(N.parchedPerS * dt, 'parched');
    if (this.dead) return;
    this.regen(dt);

    // drink, harvest and collect use the action button; contact only fights
    if (!player.inCar) {
      this.touchAnimals(px, pz, R);
      if (this.dead) return;
      if (this.fieldHeld !== null) this.holdField(dt);
    }
    this.draw();
  },

  // The avatar at the body centre; returns the feet's height.
  placeAvatar() {
    const feet = player.pos.y - EYE_HEIGHT;
    this.avatar.position.set(player.pos.x, feet + (EYE_HEIGHT + HEAD_CLEAR) / 2, player.pos.z);
    return feet;
  },

  // BUMPING with the player: an overlapping animal is moved out to touching; the player is not. A contact's first tick
  // is one impact (Ecosystem.impact) on both through applyHit: the same push (Newton's third law), so the lighter or
  // weaker body falls first, or both, and the same damage from the impact energy where it hurts (playerHurtsAnimals; the
  // player's own share only in Survivor, by avatar.takeHit).
  bumpAnimals(px, pz, dt, R) {
    const av = this.avatar, now = ecosystem.time, playerKg = av.bodyMassKg();
    const hurts = this.playerHurtsAnimals();   // true: impacts cost health; false: push only
    const mx = px - this._bumpX, mz = pz - this._bumpZ, moved = Math.hypot(mx, mz);
    const still = !(moved < HUMAN_GAIT_JUMP) || !(dt > 0);   // no velocity: first call, teleport or no time
    const pvx = still ? 0 : mx / dt, pvz = still ? 0 : mz / dt;
    this._bumpX = px; this._bumpZ = pz;
    const touch = PLAYER_RADIUS + NPC_RADIUS;
    const n = ecosystem.animalGrid.queryInto(this._qBump, px, pz, touch + Math.sqrt(ecosystem.drift2));
    for (let i = 0; i < n; i++) {
      const d = this._qBump[i];
      if (!d.alive || Math.abs(d.position.y - av.position.y) > R.height) continue;
      const dx = d.position.x - px, dz = d.position.z - pz, d2 = dx * dx + dz * dz;
      if (d2 >= touch * touch) continue;
      const dist = Math.sqrt(d2), nx = dist > 1e-6 ? dx / dist : Math.sin(d.heading), nz = dist > 1e-6 ? dz / dist : Math.cos(d.heading);
      const ox = ecosystem.fitX(px + nx * touch), oz = ecosystem.fitZ(pz + nz * touch);
      if (!occ.blockedAt(ox, oz)) ecosystem.shove(d, ox, oz);
      if (!ecosystem.freshContact(d)) continue;   // still touching: moving together, no new impact
      const playerClosing = pvx * nx + pvz * nz;          // m/s into the animal
      const animalClosing = -d.speedAlong(nx, nz, now);   // m/s it moves into the player
      const closing = playerClosing + animalClosing;      // the pair's closing speed
      if (closing <= 0) continue;
      const hit = Ecosystem.impact(playerKg, d.bodyMassKg(), closing);   // same push and damage on both
      const damage = hurts ? hit.damage : 0;
      ecosystem.applyHit(d, av, damage, hit.pushN, false);
      ecosystem.applyHit(av, d, damage, hit.pushN, false);
    }
  },

  // Contact: prey that cannot fight back is eaten on touch; people-hunters trade fight hits.
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
      if (av.nextAttackAt <= now && !av.isDown(now)) {   // a downed player does not hit back
        av.strike(d);
        ecosystem.fightHit(av, d);
        av.nextAttackAt = now + NPC_ATTACK_COOLDOWN_S;
      }
      if (d.alive && !d.isDown(now) && d.nextAttackAt <= now) {   // a downed animal does not hit back
        d.strike(av);
        ecosystem.fightHit(d, av);
        d.nextAttackAt = now + NPC_ATTACK_COOLDOWN_S;
        if (this.dead) return;
      }
    }
  },

  // Attack: punches in either mode; lands where the player hurts animals (playerHurtsAnimals), on the nearest animal
  // ahead (people included), once per cooldown.
  punch() {
    const av = this.avatar, now = ecosystem.time;
    av.strike();
    if (!play.active || this.dead || !this.playerHurtsAnimals() || this.sheltered || av.nextAttackAt > now) return;
    const P = SURVIVOR_CONFIG.punch, R = SURVIVOR_CONFIG.reach;
    const px = player.pos.x, pz = player.pos.z;
    const fx = -Math.sin(player.heading), fz = -Math.cos(player.heading);   // body facing
    const n = ecosystem.animalGrid.queryInto(this._q, px, pz, P.reachM);
    let target = null, best = P.reachM * P.reachM;
    for (let i = 0; i < n; i++) {
      const d = this._q[i];
      if (!d.alive || Math.abs(d.position.y - av.position.y) > R.height) continue;
      const dx = d.position.x - px, dz = d.position.z - pz, d2 = dx * dx + dz * dz;
      if (d2 > best || dx * fx + dz * fz < P.coneCos * Math.sqrt(d2)) continue;
      best = d2;
      target = d;
    }
    if (!target) return;
    av.nextAttackAt = now + NPC_ATTACK_COOLDOWN_S;
    ecosystem.fightHit(av, target);   // every animal alike: damage from the player's strength
  },

  // FIELD ACTIONS: the first entry with a target in reach, or null.
  fieldAction() {
    if (!this.on || this.dead || !play.active || player.inCar || flying || !ecosystem.ready) return null;
    const px = player.pos.x, pz = player.pos.z, feet = player.pos.y - EYE_HEIGHT;
    for (const id in SURVIVOR_FIELD_ACTIONS) {
      const target = SURVIVOR_FIELD_ACTIONS[id].find(this, px, feet, pz);
      if (target !== null) return { id, target };
    }
    return null;
  },

  // Action pressed: press actions act now; hold actions tick while in reach.
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

  // A held action's tick, while it is the one in reach.
  holdField(dt) {
    const a = this.fieldAction();
    if (a && a.id === this.fieldHeld) SURVIVOR_FIELD_ACTIONS[a.id].run(this, a.target, dt);
  },

  // Nearest live plant in reach, or null.
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

  // Nearest dead body in reach that people eat (CARRION_MASK), or null; a lying body reaches NPC_RADIUS further.
  carcassInReach(px, feet, pz) {
    const R = SURVIVOR_CONFIG.reach, reach = R.radius + NPC_RADIUS, mask = CARRION_MASK[HUMAN_TYPE_ID];
    let best = null, bestD2 = reach * reach;
    for (const c of ecosystem.corpses) {
      if ((mask & (1 << c.typeId)) === 0 || Math.abs(c.position.y - feet) > R.height) continue;
      const d2 = tools.distSq(px, pz, c.position.x, c.position.z);
      if (d2 <= bestD2) { bestD2 = d2; best = c; }
    }
    return best;
  },

  // A dead body into meat in the first free slot; the body is gone.
  butcher(body) {
    const free = this.inventory.indexOf(null);
    if (free < 0) return;
    ecosystem.removeCorpse(body);
    this.inventory[free] = this.makeItem('meat');
  },

  // The cat in reach.
  catInReach(px, feet, pz) {
    const R = SURVIVOR_CONFIG.reach, c = cat.position;
    return Math.abs(c.y - feet) <= R.height && tools.distSq(px, pz, c.x, c.z) <= R.radius * R.radius;
  },

  // In water or swimming: can drink.
  atWater(px, pz) { return (player.grounded || swimming) && isWaterAt(px, pz); },

  // The plant into the first free slot.
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

  // The box into the first free slot, closed; the crate moves.
  collect(crate) {
    const free = this.inventory.indexOf(null);
    if (free < 0) return;
    foodBoxes.eat(crate);
    this.inventory[free] = this.makeItem('crate');
  },

  // Use slot i's item: a box opens, food is eaten, water drunk.
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
      const def = SURVIVOR_CONFIG.inventory.items[kind];   // none for kills
      row(`${def ? SURVIVOR_ACTIONS[def.action].past : 'Ate'} (${def?.label.toLowerCase() ?? kind})`, n);
    }
    if (!eaten.length) row('Ate', 'nothing');
    this.showPanel();
    if (play.locked) document.exitPointerLock();
  },

  // A red edge that follows the hit, fading.
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
    // CAR HEALTH: its row shows while the player drives
    const carShown = player.inCar ? Math.round(100 * car.health / CAR_MAX_HEALTH) : -1;   // bar percent, -1 = row hidden
    if (carShown !== this._shownCar) {
      this._shownCar = carShown;
      needCarRowEl.hidden = carShown < 0;
      if (carShown >= 0) needCarEl.style.width = carShown + '%';
    }
    const day = this.run ? Math.floor(this.run.hours / 24) + 1 : 1;
    if (day !== this._shownDay) { this._shownDay = day; needDayEl.textContent = `Day ${day}`; }
    // the player's readout rows; the look is checked too
    const info = pov.infoKey();
    if (info >= 0 && (info !== this._shownInfo || pov.look !== this._shownLook)) {
      this._shownInfo = info; this._shownLook = pov.look;
      // one span per field
      const spans = fields => fields.map(f => {
        const s = document.createElement('span');
        s.textContent = f;
        return s;
      });
      needInfoEl.replaceChildren(...spans(personInfoFields(info, pov.sex)));
      needBodyEl.replaceChildren(...spans(personBodyFields(info, pov.sex, pov.look)));
    }
    const slots = this.inventory.map(it => it ? it.kind : '').join(',') + '|' + this.inventory.indexOf(this.weapon);   // the equipped slot too
    if (slots !== this._shownSlots) {
      this._shownSlots = slots;
      this.inventory.forEach((it, i) => {
        const el = slotEls[i], item = it && SURVIVOR_CONFIG.inventory.items[it.kind];
        showIcon(el.querySelector('span'), item ? item.icon : '', ICON_STYLE.slotPx);
        el.disabled = !item;
        const verb = it && it === this.weapon ? 'Holster' : item && SURVIVOR_ACTIONS[item.action].verb;   // an equipped gun's slot holsters it
        el.setAttribute('aria-label', item ? `${verb} ${item.label.toLowerCase()}` : 'Empty slot');
      });
      // inventory changes can free or fill a needed slot
      updateCarButton();
      // the craft slot shows what the items make
      const c = this.craftable(), made = c && SURVIVOR_CONFIG.inventory.items[c.recipe.makes];
      showIcon(craftEl.querySelector('span'), made ? made.icon : '', ICON_STYLE.slotPx);
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

  // needs panel and run summary show in Survivor play
  showPanel(inPlay = play.active) {
    needsEl.classList.toggle('on', inPlay && this.on);
    runOverEl.classList.toggle('on', inPlay && this.on && this.dead);
  }
};

// BIND INVENTORY: slot keys and taps, the craft slot.
export function bindInventory() {
  // a slot's key or tap uses its item; the craft slot crafts
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
  yaw: 0,            // view direction
  pitch: 0,
  heading: 0,        // body facing on foot, turning toward the move
  grounded: true,
  running: false,    // sprinting this frame
  inCar: false       // driving; the cat's is cat.inCar
};
export const keys = new Set();
// In play: input accepted (active), pointer locked (locked); main sets both.
export const play = {
  active: false,
  locked: false
};
// Last pointer type, so a tap load skips pointer lock.
export let lastPointerType = 'mouse';
// BIND KEYS: pointer type and held keys.
export function bindKeys() {
  addEventListener('pointerdown', e => { lastPointerType = e.pointerType; }, true);
  addEventListener('keydown', e => {
    keys.add(e.code);
    wake();
    if (e.code === 'Space' && play.active) e.preventDefault();
  });
  addEventListener('keyup', e => { keys.delete(e.code); wake(); });
}

// BIND MOUSE BUTTONS (pointer locked): with a gun in hand, the left button shoots (semi-auto, while aiming) and the right
// button toggles Aim.
const MOUSE_SHOOT = 0, MOUSE_AIM = 2;   // MouseEvent.button values
export function bindMouseButtons() {
  addEventListener('mousedown', e => {
    if (!play.locked || game.weapon === null) return;
    if (e.button === MOUSE_SHOOT) attackQueued = true;
    else if (e.button === MOUSE_AIM) gunView.toggleAim();
    wake();
  });
}

// BIND MOUSELOOK: look while the pointer is locked.
export function bindMouseLook() {
  addEventListener('mousemove', e => {
    if (!play.locked) return;
    player.yaw -= e.movementX * 0.0022;
    player.pitch -= e.movementY * 0.0022;
    player.pitch = Math.max(-LOOK_PITCH_MAX, Math.min(LOOK_PITCH_MAX, player.pitch));
    wake();
  });
}

const touchMove = { x: 0, z: 0 };
let stickId = null, stickCx = 0, stickCy = 0;
let lookId = null, lookX = 0, lookY = 0;
let jumpQueued = false;
// double tap toggles crouch
export let lastStickTapAt = 0, crouchY = 0;

// STANCE: crouch and sprint exclude each other, latest wins. squat(seconds) holds the body low. `low`: crouched or
// squatting.
export const stance = {
  crouched: false,
  squatLeft: 0,           // squat seconds left
  sprintBlocked: false,   // crouched while sprint was held
  _sprintWas: false,

  get squatting() { return this.squatLeft > 0; },
  get low() { return this.crouched || this.squatting; },

  toggleCrouch() {
    this.crouched = !this.crouched;
    if (this.crouched) this.sprintBlocked = true;
  },
  stand() { this.crouched = false; this.squatLeft = 0; },
  squat(seconds) { this.squatLeft = Math.max(this.squatLeft, seconds); wake(); },   // a longer squat stands
  unsquat() { this.squatLeft = 0; },
  tick(dt) { this.squatLeft = Math.max(0, this.squatLeft - dt); },

  // sprint input to running
  sprinting(held) {
    if (held && !this._sprintWas) { this.crouched = false; this.sprintBlocked = false; }
    if (!held) this.sprintBlocked = false;
    this._sprintWas = held;
    return held && !this.sprintBlocked;
  }
};
// knob offset (px), drawn once per frame
export const touchKnob = {
  dx: 0,
  dy: 0,
  dirty: false
};

// BIND TOUCH: stick, look, tap buttons, climb and fly.
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
      // only a tap ending on the button counts
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

    // no long-press haptics while playing; cancelled only where touch never scrolls
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

let climb = 0;

function holdClimb(btn, dir) {
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
  // drop focus so space does not re-click
  flyEl.blur();
  player.vel.y = 0;
  player.grounded = false;
  wake();
}

const carEl = document.getElementById('car');
const useEl = document.getElementById('use');

// Seconds from boarding until the car drives: the start sound's length (its last breakpoint, where the engine loop takes over).
const CAR_START_S = SOUND_MODELS[SOUND.car.startModel].breakpointsMs.at(-1) / 1000;

export const car = {
  reset() { setPlayerInCar(false); this.placed = false; this.mesh.visible = false; this.speed = this.steer = this.spin = 0; this.startLeftS = 0; },   // teardownWorld's entry
  startLeftS: 0,            // seconds until the engine has started (boardCar sets CAR_START_S); no throttle or steering until 0
  placed: false,
  health: CAR_MAX_HEALTH,   // a placed car starts full (setCar)
  hurt(amount) { this.health = Math.max(0, this.health - amount); },
  wrecked() { return this.health <= 0; },   // no throttle or steering (carPhysics); it coasts to a stop
  x: 0, y: 0, z: 0, yaw: 0, pitch: 0, roll: 0,
  speed: 0,        // m/s, negative in reverse
  steer: 0,        // front wheel angle, rad, + left
  spin: 0,
  mesh: null, front: [], wheels: []
};

// CHASE CAMERA (the car only): driving swings the view behind the heading CAM_LOOK_HOLD after the last look.
export const chaseCam = {
  camYaw: 0, lookYaw: 0, lookPitch: 0, lookAt: 0, shownYaw: 0, shownPitch: 0, settling: false,

  // behind `heading`
  reset(heading) {
    this.camYaw = heading;
    this.lookYaw = this.lookPitch = this.lookAt = 0;
    this.shownYaw = player.yaw; this.shownPitch = player.pitch;
    this.settling = false;
  },

  // Follow `heading`, pitch within [minPitch, maxPitch]; writes player.yaw and pitch.
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
  }
};

// Face body and view along `yaw`.
export function facePlayer(yaw, pitch) {
  player.yaw = player.heading = yaw;
  player.pitch = pitch;
  chaseCam.reset(yaw);
}

// Mesh: body, glasshouse, roof, lamps, wheels (front on pivots).
{
  const mat = c => new THREE.MeshLambertMaterial({ color: c });
  const paint = mat(0x9c2f2a), glass = mat(0x28313b), trim = mat(0x1d1f22);
  const tyre = mat(0x151617), head = mat(0xf2ecd8), tail = mat(0xb3261e);
  // built full size, scaled by CAR_SCALE
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
  // Lower body: core plus arched side panels and liners.
  {
    const yb = 0.31, yt = 0.93, L = LEN / 2, R = WR + 0.09;
    const arches = [-WB / 2, WB / 2];
    const core = 0.46;                 // core half-width, clear at full lock
    const side = WID / 2 - core;   // side panel thickness
    // profile in (z, y)
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
    panelGeo.rotateY(Math.PI / 2);     // profile z to car z; extrusion to +x
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

// Ground under axles and sides sets height, pitch, roll.
function settleCar() {
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

function syncCarMesh() {
  const m = car.mesh;
  m.position.set(car.x, car.y, car.z);
  m.rotation.set(car.pitch, car.yaw, car.roll);
  for (const p of car.front) p.rotation.y = car.steer;
  for (const w of car.wheels) w.rotation.x = -car.spin;
  loop.sceneDirty = true;
}

function carFits(x, z, yaw, margin = 0.2) {
  const fx = -Math.sin(yaw), fz = -Math.cos(yaw);
  for (const o of CAR_CIRCLES) {
    const cx = x + fx * o, cz = z + fz * o, g = groundAt(cx, cz);
    if (shellAt(cx, cz) >= 0 || isWaterAt(cx, cz)) return false;
    if (solidOverlap(cx, cz, CAR_R + margin, g + CAR_STEP_UP, g + CAR_TOP)) return false;
  }
  return true;
}

// Parked on the right of the nearest street, off the player.
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
    // no street: nearest open ground
    for (let d = 5; d <= 80 && !spot; d += 1) {
      for (let i = 0; i < 24; i++) {
        const a = i / 24 * 2 * Math.PI, px = x + Math.cos(a) * d, pz = z + Math.sin(a) * d;
        if (carFits(px, pz, player.yaw)) { spot = { px, pz, yaw: player.yaw }; break; }
      }
    }
  }
  setCar(spot);
}

function setCar(spot) {
  car.placed = !!spot;
  car.mesh.visible = car.placed;
  car.speed = car.steer = car.spin = 0;
  car.health = CAR_MAX_HEALTH;
  if (!spot) return;
  car.x = spot.px; car.z = spot.pz; car.yaw = spot.yaw;
  settleCar();
  syncCarMesh();
  invalidate();
}
export function parkBesideCabin(c, yaw) {
  const s = CABIN_SCALE * CABIN_M;
  const fx = -Math.sin(yaw), fz = -Math.cos(yaw), rx = Math.cos(yaw), rz = -Math.sin(yaw);
  const halfDoor = 9 * s;   // Cabin DOOR_WIDTH / 2 in metres
  const floorFront = 34 * s;   // cabin floor's front edge
  const carBack = -CAR_CIRCLES[0] + CAR_R;   // car centre to its rear
  const ahead = floorFront + CABIN_CAR_GAP + carBack;
  const side = halfDoor + CABIN_CAR_WALKWAY + CAR_WID / 2;
  // only step out or aside, never into the doorway's lane
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

const _carPos = new THREE.Vector3();

// Move by (dx, dz), push circles out of walls; returns the push or null.
const _push = { x: 0, z: 0 };
function moveCar(dx, dz) {
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

// Car mass in kg: curb mass, plus the player when in it.
function carMassKg() { return CAR_MASS_KG + (player.inCar ? game.avatar.bodyMassKg() : 0); }

// CAR HITS, one sim tick: an overlapping animal is moved out to touching. A contact's first tick is one impact
// (Ecosystem.impact): the same impulse on both (Newton's third law) pushes the animal against its hold and slows the car
// along its heading by impulse / car mass, and the impact energy costs the animal (game.playerHurtsAnimals) and the car
// (game.carTakesDamage) health at their own rates.
// The sideways share of the car's impulse is lost, since the bicycle model has no sideways speed.
const _carQ = [], _carHitter = { type: 'car', position: new THREE.Vector3() };   // the car as applyHit's attacker
export function carHits() {
  if (!car.placed || !ecosystem.ready) return;
  const fx = -Math.sin(car.yaw), fz = -Math.cos(car.yaw);   // heading
  const vx = fx * car.speed, vz = fz * car.speed;            // its velocity, m/s
  const touch = CAR_R + NPC_RADIUS, reach = Math.max(...CAR_CIRCLES.map(Math.abs)) + touch + Math.sqrt(ecosystem.drift2);
  const n = ecosystem.animalGrid.queryInto(_carQ, car.x, car.z, reach);
  if (n === 0) return;
  const carKg = carMassKg(), now = ecosystem.time;
  const hurtsAnimal = game.playerHurtsAnimals(), hurtsCar = game.carTakesDamage();   // true: impacts cost that one health
  _carHitter.position.set(car.x, car.y, car.z);
  for (let i = 0; i < n; i++) {
    const a = _carQ[i];
    if (!a.alive) continue;
    const feet = a.position.y - a.footLift() * NPC_UNIT;
    if (feet < car.y - CAR_STEP_UP || feet > car.y + CAR_TOP) continue;   // another floor or a roof
    for (const o of CAR_CIRCLES) {
      const cx = car.x + fx * o, cz = car.z + fz * o;
      const dx = a.position.x - cx, dz = a.position.z - cz, d2 = dx * dx + dz * dz;
      if (d2 >= touch * touch) continue;
      const d = Math.sqrt(d2), nx = d > 1e-6 ? dx / d : -fz, nz = d > 1e-6 ? dz / d : fx;   // dead centre: out the side
      const ox = ecosystem.fitX(cx + nx * touch), oz = ecosystem.fitZ(cz + nz * touch);
      // a falling body is pushed by the car's box in its own physics (Ecosystem.fallBox), not moved out here
      if (!a.fall && !occ.blockedAt(ox, oz)) { a.position.x = ox; a.position.z = oz; }
      if (!ecosystem.freshContact(a)) break;   // still touching: moving together, no new impact
      const closing = vx * nx + vz * nz - a.speedAlong(nx, nz, now);   // m/s the pair closes: the car's in, the animal's toward it
      if (closing <= 0) break;
      const hit = Ecosystem.impact(carKg, a.bodyMassKg(), closing);
      ecosystem.applyHit(a, _carHitter, hurtsAnimal ? hit.damage : 0, hit.pushN, false);
      car.speed -= hit.impulseNs * (fx * nx + fz * nz) / carKg;   // -impulse along n, its heading share
      if (hurtsCar) car.hurt(Ecosystem.impactDamage(hit.energyJ, CAR_HEALTH_PER_J));
      break;
    }
  }
}

// PLAYER BUMPS, one sim tick, on foot and in play in either mode.
export function playerBumps(dt) {
  if (!play.active || player.inCar || flying || !ecosystem.ready) { game._bumpX = game._bumpZ = NaN; return; }
  game.placeAvatar();
  game.bumpAnimals(player.pos.x, player.pos.z, dt, SURVIVOR_CONFIG.reach);
}

// One physics step; throttle, steer in [-1, 1], + left; ignored once the car is wrecked.
function carPhysics(dt, throttle, steer, handbrake) {
  if (dt <= 0) return;
  const v = car.speed;
  // a wrecked car takes no throttle or steering; it coasts to a stop on its resistance
  if (car.wrecked()) throttle = steer = 0;

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
  let resist = CAR_ROLL + carDragPerM(carMassKg()) * v * v + (throttle === 0 ? CAR_ENGINE_BRK : 0);
  if (handbrake) resist += CAR_HANDBRAKE;
  const slope = -CAR_G * Math.sin(car.pitch);

  let nv = v + (a + slope) * dt;
  // resistance never reverses motion, so a stopped car stays on gentle slopes
  const r = resist * dt;
  if (nv > 0) nv = Math.max(0, nv - r);
  else if (nv < 0) nv = Math.min(0, nv + r);
  if (nv < -CAR_REV_MAX) nv = -CAR_REV_MAX;
  car.speed = nv;

  // bicycle-model yaw, capped at tyre slide
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
        // a glancing hit turns along the wall
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

function carNear() {
  if (!car.placed || flying) return false;
  const d = Math.hypot(player.pos.x - car.x, player.pos.z - car.z);
  const feet = player.pos.y - EYE_HEIGHT;
  return d < CAR_REACH && feet > car.y - 1 && feet < car.y + CAR_TOP;
}

function pushPlayerFromCar() {
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

// Touch pedals; brake reverses once stopped.
const gasEl = document.getElementById('gas');
const brakeEl = document.getElementById('brake');
const sprintEl = document.getElementById('sprint');
const jumpEl = document.getElementById('jump');
const attackEl = document.getElementById('attack');
const pedal = { gas: false, brake: false, sprint: false, jump: false, attack: false };
// GUN BUTTONS, made here beside the attack button with its classes and placed each time one shows (placeGunButtons):
// Draw/Holster left of the attack button while a gun is carried, Aim above it while one is in hand.
// A face is a `label` (its accessible name) and what it shows (`face`: ICONS markup, or text).
function setButtonFace(b, { label, face }) { b.setAttribute('aria-label', label); showIcon(b, face, ICON_STYLE.buttonPx); }
function gunButton(id, face) {
  const b = document.createElement('button');
  b.id = id;
  b.className = attackEl.className.replace(/\b(on|held)\b/g, '').trim();
  setButtonFace(b, face);
  b.style.display = 'none';
  attackEl.before(b);
  return b;
}
// the Draw/Holster button's faces: holster (true) while a gun is in hand and not on its way back, else draw
const DRAW_FACES = { true: { label: 'Holster', face: ICONS.holster }, false: { label: 'Draw', face: ICONS.draw } };
const aimEl = gunButton('aim', { label: 'Aim', face: ICONS.aim });
const drawEl = gunButton('draw', DRAW_FACES[false]);
const fistHtml = attackEl.innerHTML, fistLabel = attackEl.getAttribute('aria-label');   // the attack button's own face
// THE GUN FACE (GUN_BUTTON_FACE): the fire icon, a reload ring centred over it, and the magazine's rounds above it,
// built once and swapped in for the fist while a gun is in hand. Inline styles, so the stylesheet's `#attack svg` size
// (the fist's) does not reach them.
const gunFace = (() => {
  const F = GUN_BUTTON_FACE, c = F.ringPx / 2, r = (F.ringPx - F.ringStrokePx) / 2;
  const host = document.createElement('span');
  host.innerHTML = ICONS.fire + `<svg viewBox="0 0 ${F.ringPx} ${F.ringPx}" aria-hidden="true">` +
    `<circle cx="${c}" cy="${c}" r="${r}" fill="none" stroke="${F.ringColor}" stroke-width="${F.ringStrokePx}" ` +
    'stroke-linecap="round" pathLength="1" stroke-dasharray="1"/></svg>';
  const [fire, ring] = host.querySelectorAll('svg');
  sizeIcon(fire, ICON_STYLE.firePx);
  Object.assign(ring.style, {
    position: 'absolute', left: '50%', top: '50%', width: F.ringPx + 'px', height: F.ringPx + 'px',
    margin: `${-c}px 0 0 ${-c}px`, transform: 'rotate(-90deg)', display: 'none'   // rotated so it fills from the top
  });
  const ammo = document.createElement('span');
  Object.assign(ammo.style, {
    position: 'absolute', left: '0', right: '0', top: F.ammoTopPx + 'px', textAlign: 'center',
    font: `400 ${F.ammoFontPx}px/1 var(--font-ui)`, letterSpacing: '0', pointerEvents: 'none'
  });
  return { fire, ring, arc: ring.querySelector('circle'), ammo };
})();
const touchUi = () => matchMedia('(pointer: coarse)').matches || lastPointerType === 'touch';

function holdPedal(btn, name) {
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
// BIND CAR: pedals, jump and attack taps, car and action buttons, E.
export function bindCar() {
  holdPedal(gasEl, 'gas');
  holdPedal(brakeEl, 'brake');
  holdPedal(sprintEl, 'sprint');
  holdPedal(jumpEl, 'jump');
  holdPedal(attackEl, 'attack');
  aimEl.addEventListener('pointerdown', () => { gunView.toggleAim(); aimEl.blur(); });
  drawEl.addEventListener('pointerdown', () => {
    if (gunHolsters()) gunView.holster();
    else { const gun = game.weapon ?? game.carriedGun(); if (gun) gunView.draw(gun); }   // a holster under way turns around
    drawEl.blur();
  });
  addEventListener('resize', () => { if (drawShown || aimShown) placeGunButtons(); });
  // a short tap still jumps or punches; holding attack keeps punching
  jumpEl.addEventListener('pointerdown', () => { jumpQueued = true; });
  attackEl.addEventListener('pointerdown', () => { attackQueued = true; });
  carEl.addEventListener('click', () => { toggleCar(); carEl.blur(); });
  // The action button on its own pointer: press acts, hold lasts until release.
  useEl.addEventListener('pointerdown', e => {
    useEl.setPointerCapture(e.pointerId);   // before the action, which may hide the button
    game.pressField();
    updateCarButton();
  });
  for (const ev of ['pointerup', 'pointercancel', 'lostpointercapture']) useEl.addEventListener(ev, () => game.releaseField());
  // E: the car when its button shows, else the action
  addEventListener('keydown', e => {
    if (e.code !== 'KeyE' || e.repeat || !play.active) return;
    if (carBtnState !== '') toggleCar();
    else { game.pressField(); updateCarButton(); }
  });
  addEventListener('keyup', e => { if (e.code === 'KeyE') game.releaseField(); });
  addEventListener('blur', () => game.releaseField());
}
let attackQueued = false;

// Touch sprint, jump and attack on foot, hidden while flying.
let footTouch = false, sprintShown = false;
function updateSprintButton() {
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

// The gun buttons and the attack button's face: with a gun carried, Draw/Holster shows left of the attack button; with
// one in hand, Aim shows above it and the fire icon replaces the fist.
let aimShown = false, drawShown = false, gunFaceShown = false, aimLit = false, holsterShown = false;
// the gun face as last drawn: reload ring step (-1: no reload) and rounds in the magazine; NaN redraws both
let shownReloadStep = NaN, shownMag = NaN;
// the Draw/Holster button holsters now: a gun in hand, not already going back
const gunHolsters = () => game.weapon !== null && gunView.drawDir >= 0;
// Draw/Holster left of the attack button, Aim above Draw/Holster; each the attack button's size, AIM_BUTTON_GAP_PX apart.
function placeGunButtons() {
  const r = attackEl.getBoundingClientRect(), left = r.left - r.width - AIM_BUTTON_GAP_PX;
  [[drawEl, r.top], [aimEl, r.top - r.height - AIM_BUTTON_GAP_PX]].forEach(([el, top]) => {
    const st = el.style;
    st.position = 'fixed';
    st.left = left + 'px'; st.top = top + 'px';
    st.width = r.width + 'px'; st.height = r.height + 'px';
  });
}
// Show or hide a gun button; returns the new shown state.
function showGunButton(el, show) {
  el.style.display = show ? '' : 'none';
  el.classList.toggle('on', show);
  if (show) placeGunButtons();
  return show;
}
function updateGunButtons() {
  const inHand = game.weapon !== null;   // a gun in hand (or being drawn or holstered)
  if (inHand !== gunFaceShown) {
    gunFaceShown = inHand;
    if (inHand) { attackEl.replaceChildren(gunFace.fire, gunFace.ring, gunFace.ammo); shownReloadStep = shownMag = NaN; }
    else attackEl.innerHTML = fistHtml;
    if (inHand) attackEl.setAttribute('aria-label', 'Shoot');
    else if (fistLabel === null) attackEl.removeAttribute('aria-label');
    else attackEl.setAttribute('aria-label', fistLabel);
  }
  if (inHand) {
    const F = GUN_BUTTON_FACE, share = game.reloadShare(ecosystem.time);   // share: -1 with no reload under way
    const step = share < 0 ? -1 : Math.round(share * F.ringSteps);
    if (step !== shownReloadStep) {
      shownReloadStep = step;
      const loading = step >= 0, done = loading ? step / F.ringSteps : 1;
      gunFace.ring.style.display = loading ? '' : 'none';
      gunFace.arc.setAttribute('stroke-dashoffset', String(1 - done));
      gunFace.fire.style.opacity = String(F.loadingAlpha + (1 - F.loadingAlpha) * done);
    }
    const mag = game.weapon.mag;
    if (mag !== shownMag) { shownMag = mag; gunFace.ammo.textContent = String(mag); }
  }
  const holsters = gunHolsters();
  if (holsters !== holsterShown) { holsterShown = holsters; setButtonFace(drawEl, DRAW_FACES[holsters]); }
  if (gunView.aimOn !== aimLit) { aimLit = gunView.aimOn; aimEl.classList.toggle('held', aimLit); }   // lit while Aim is on
  // on foot with touch controls, not flying (sprintShown), and not getting in or out of the car
  const touchFoot = sprintShown && carTransit === null;
  const draw = touchFoot && (inHand || game.carriedGun() !== null), aim = touchFoot && inHand;
  if (draw !== drawShown) drawShown = showGunButton(drawEl, draw);
  if (aim !== aimShown) aimShown = showGunButton(aimEl, aim);
}

// Fly button: Observer on foot, unless the car takes its slot.
let flyShown = false;
function updateFlyButton(carState) {
  const show = play.active && !game.on && carState === '';
  if (show === flyShown) return;
  flyShown = show;
  flyEl.classList.toggle('on', show);
}

// Action button: Survivor on foot, unless the car takes its slot.
let useShown = '';
function updateUseButton(carState) {
  const a = carState === '' ? game.fieldAction() : null;
  const id = a ? a.id : '';
  if (id === useShown) return;
  useShown = id;
  useEl.classList.toggle('on', id !== '');
  useEl.textContent = id ? SURVIVOR_FIELD_ACTIONS[id].label : '';
}

let carBtnState = '';
// the car button's faces by carBtnState: a car door, to get in or out
const CAR_FACES = { enter: { label: 'Drive', face: ICONS.door }, exit: { label: 'Exit', face: ICONS.door } };
export function updateCarButton() {
  updateSprintButton();
  updateGunButtons();
  const state = !play.active ? '' : player.inCar ? 'exit' : carNear() ? 'enter' : '';
  updateFlyButton(state);
  updateUseButton(state);
  if (state === carBtnState) return;
  carBtnState = state;
  carEl.classList.toggle('on', state !== '');
  if (state !== '') setButtonFace(carEl, CAR_FACES[state]);
  const pedals = state === 'exit' && touchUi();
  for (const el of [gasEl, brakeEl]) {
    el.classList.toggle('on', pedals);
    if (!pedals) el.classList.remove('held');
  }
  if (!pedals) pedal.gas = pedal.brake = false;
}

// In or out of the car: no body shadow inside.
export function setPlayerInCar(on) {
  player.inCar = on;
  if (pov.body) pov.body.castShadow = !on;
  graphics.force = true;
}

// CAR ENTRY AND EXIT (CAR_TRANSIT): getting in walks to the driver's door and slides into the seat, then boards
// (boardCar); getting out slides from the seat to the place found, then lands (landFromCar). No input meanwhile.
let carTransit = null;   // { entering, t, walkS, x0, z0 (where the walk starts), x1, z1 (the place found to get out at) }
const _carAt = { x: 0, z: 0 };
// a car-frame point ([right, forward] metres) in the world, as it stands now
function carPoint(l, f, out) {
  out.x = car.x + Math.cos(car.yaw) * l - Math.sin(car.yaw) * f;
  out.z = car.z - Math.sin(car.yaw) * l - Math.cos(car.yaw) * f;
  return out;
}
const carDoor = out => carPoint(CAR_DOOR_SPOTS[0][0] * CAR_SCALE, CAR_DOOR_SPOTS[0][1] * CAR_SCALE, out);
const carSeat = out => carPoint(CAR_TRANSIT.seat[0], CAR_TRANSIT.seat[1], out);
// feet height in the seat: a crouched body's head headroomM under the roof
const seatFeetY = () => car.y + CAR_TOP - CAR_TRANSIT.headroomM - (PLAYER_HEIGHT - CROUCH_DROP);

// One frame of a transit: the player's place on its path, heading and crouch; it ends by boarding or landing.
function stepCarTransit(dt) {
  const T = carTransit;
  T.t += dt;
  const ease = x => x * x * (3 - 2 * x);
  let x, z, feet, heading = player.heading;
  if (T.entering && T.t < T.walkS) {   // walking to the door
    const u = T.t / T.walkS, d = carDoor(_carAt);
    x = T.x0 + (d.x - T.x0) * u; z = T.z0 + (d.z - T.z0) * u; feet = groundAt(x, z);
    if (d.x !== T.x0 || d.z !== T.z0) heading = Math.atan2(T.x0 - d.x, T.z0 - d.z);   // facing the walk
  } else {   // sliding between the door (or the place found) and the seat, ducked
    const u = ease(Math.min(1, (T.t - (T.entering ? T.walkS : 0)) / CAR_TRANSIT.slideS)), k = T.entering ? u : 1 - u;   // k: 0 outside, 1 seated
    const out = T.entering ? carDoor(_carAt) : { x: T.x1, z: T.z1 }, ox = out.x, oz = out.z, s = carSeat(_carAt);
    x = ox + (s.x - ox) * k; z = oz + (s.z - oz) * k;
    feet = groundAt(ox, oz) + (seatFeetY() - groundAt(ox, oz)) * k;
    heading = car.yaw;
    stance.squat(dt * 2);   // ducked for the slide
    if (u >= 1) { carTransit = null; if (T.entering) boardCar(); else landFromCar(); }
  }
  if (carTransit === null && T.entering) return true;   // boarded: the car step takes over
  player.pos.set(x, feet + EYE_HEIGHT, z);
  player.vel.set(0, 0, 0);
  player.heading = heading;
  return false;
}

function enterCar() {
  if (player.inCar || carTransit || !carNear()) return;
  // a gun in hand goes behind the back first (once), then the player gets in; it comes out again on getting out
  if (game.weapon !== null) {
    if (gunView.drawDir !== -1) { gunView.carGun = game.weapon; gunView.holster(enterCar); }
    return;
  }
  const d = carDoor(_carAt);
  carTransit = { entering: true, t: 0, x0: player.pos.x, z0: player.pos.z, x1: 0, z1: 0,
    walkS: Math.min(CAR_TRANSIT.walkMaxS, Math.hypot(d.x - player.pos.x, d.z - player.pos.z) / WALK_SPEED) };
  stance.stand();
  wake();
}

// In the seat: the car takes the player.
function boardCar() {
  setPlayerInCar(true);
  car.startLeftS = CAR_START_S;   // counted with or without sound, so driving never depends on the Sound setting
  sound.emit('carStart', car.x, car.y, car.z, car);
  stance.stand(); crouchY = 0;
  chaseCam.reset(car.yaw);
  player.vel.set(0, 0, 0);
  jumpQueued = false;
  touchMove.z = 0;
  cat.board();
  updateCarButton();
  wake();
}

function exitCar() {
  if (!player.inCar || carTransit) return;
  const fx = -Math.sin(car.yaw), fz = -Math.cos(car.yaw);
  const rx = Math.cos(car.yaw), rz = -Math.sin(car.yaw);
  for (const [l0, f0] of CAR_DOOR_SPOTS) {
    const l = l0 * CAR_SCALE, f = f0 * CAR_SCALE;
    const px = car.x + rx * l + fx * f, pz = car.z + rz * l + fz * f, g = groundAt(px, pz);
    if (shellAt(px, pz) >= 0) continue;
    if (solidOverlap(px, pz, PLAYER_RADIUS + 0.05, g, g + EYE_HEIGHT + HEAD_CLEAR)) continue;
    setPlayerInCar(false);
    sound.emit('carStop', car.x, car.y, car.z, car);
    const s = carSeat(_carAt);
    player.pos.set(s.x, seatFeetY() + EYE_HEIGHT, s.z);
    player.vel.set(0, 0, 0);
    facePlayer(car.yaw, 0);
    stance.squat(CAR_TRANSIT.slideS);
    carTransit = { entering: false, t: 0, walkS: 0, x0: s.x, z0: s.z, x1: px, z1: pz };
    cat.alight();
    updateCarButton();
    wake();
    return;
  }
}

// Out at the place found: standing, and the gun holstered for the car drawn again if still carried (Survivor: still in
// the inventory; Observer: still chosen).
function landFromCar() {
  stance.stand();
  player.grounded = false;
  const gun = gunView.carGun;
  gunView.carGun = null;
  if (gun && (game.on ? game.inventory.includes(gun) : game.weaponChoice)) gunView.draw(gun);
  updateCarButton();
  wake();
}

function toggleCar() {
  if (player.inCar) exitCar(); else enterCar();
}

function driveStep(dt) {
  jumpQueued = false;
  sound.emit('carEngine', car.x, car.y, car.z, car);   // every driving frame: the engine follows the car and its speed

  const starting = car.startLeftS > 0;   // the engine is still starting: no throttle or steering yet
  car.startLeftS = Math.max(0, car.startLeftS - dt);
  let throttle = 0, steer = 0;
  if (play.active && !starting) {
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

  // boom shortened before walls
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

const fwd = new THREE.Vector3();
const right = new THREE.Vector3();
let swimming = false;

export function playerStep(dt) {
  petting.update(dt);
  if (player.inCar) { player.running = false; swimming = false; pov.hideBody(); gunView.stow(); syncDot(); driveStep(dt); updateCarButton(); vr.placeRig(); return; }
  if (carTransit) {
    player.running = false; swimming = false;
    if (car.speed !== 0) carPhysics(dt, 0, 0, true);
    if (stepCarTransit(dt)) { playerStep(0); return; }   // boarded this frame: one car step places the camera
    gunView.step(dt);
    attackQueued = jumpQueued = false;
    poseFrame(dt);
    return;
  }
  // an empty rolling car brakes to a stop
  if (car.speed !== 0) carPhysics(dt, 0, 0, true);

  // knocked down: no moving, turning, jumping or punching until the hold ends
  const knockedDown = game.avatar.isDown(ecosystem.time);
  let mx = 0, mz = 0;
  if (keys.has('KeyW') || keys.has('ArrowUp')) mz += 1;
  if (keys.has('KeyS') || keys.has('ArrowDown')) mz -= 1;
  if (keys.has('KeyD') || keys.has('ArrowRight')) mx += 1;
  if (keys.has('KeyA') || keys.has('ArrowLeft')) mx -= 1;
  if (stickId !== null) { mx += touchMove.x; mz += touchMove.z; }
  if (renderer.xr.isPresenting) { mx += vr.moveX; mz -= vr.moveY; }

  // moves relative to the view
  fwd.set(-Math.sin(player.yaw), 0, -Math.cos(player.yaw));
  right.set(Math.cos(player.yaw), 0, -Math.sin(player.yaw));

  // deep water: swim
  if (providers.active) providers.active.surface(player.pos.x, player.pos.z, _surf);
  else { _surf.base = 0; _surf.dip = 0; }
  const waterTop = _surf.base, waterDip = _surf.dip;
  swimming = !!providers.active && !flying && -waterDip > SWIM_DEPTH && player.pos.y - EYE_HEIGHT < waterTop;

  const shiftHeld = keys.has('ShiftLeft') || keys.has('ShiftRight');
  // flying: shift means down
  const sprint = stance.sprinting(play.active && !flying && !swimming && game.canRun() && (shiftHeld || pedal.sprint));
  // on foot, the body's pace scales the speed; flying keeps FLY_SPEED
  const pace = pov.look ? pov.look.pace : 1;
  const jumpSpeed = bodyJumpSpeed(JUMP_SPEED, pace);   // jump or swim kick takeoff, by pace
  const footSpeed = swimming ? WALK_SPEED * SWIM_SPEED :
    stance.low ? CROUCH_SPEED :
      sprint ? RUN_SPEED : WALK_SPEED;
  const speed = flying ? FLY_SPEED : footSpeed * pace;
  const len = Math.hypot(mx, mz);
  // running: on foot at sprint speed
  player.running = sprint && !stance.low && len > 0 && play.active;
  let dx = 0, dz = 0, dy = 0;
  if (len > 0 && play.active && !knockedDown) {
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

  // 3rd person: the body turns toward the move. 1st person and VR: it faces the view. On foot the view turns only by
  // look input (mouse, the look side of the screen), never by moving, so the chase camera never settles here.
  chaseCam.settling = false;
  if (pov.mode !== '3rd' || renderer.xr.isPresenting) { if (!knockedDown) player.heading = player.yaw; }
  else if (dx !== 0 || dz !== 0) {
    let dh = Math.atan2(-dx, -dz) - player.heading;
    dh = Math.atan2(Math.sin(dh), Math.cos(dh));
    const maxTurn = FOOT_TURN_RATE * dt;
    player.heading += Math.max(-maxTurn, Math.min(maxTurn, dh));
  }

  // attack: with a gun in hand a tap fires once (semi-auto) while aiming; bare hands, a tap punches once and a hold keeps punching
  gunView.step(dt);
  if (play.active && !flying && !knockedDown) {
    if (game.weapon) { if (attackQueued && gunView.aiming) game.fire(); }
    else if (attackQueued || pedal.attack) game.punch();
  }
  attackQueued = false;

  if (flying) {
    // no collision while flying
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
    // walls stop a swimmer; drag, float cap and bed bound the vertical
    moveAndCollide(player.pos, dx, dz, STEP_UP);
    player.vel.y *= Math.max(0, 1 - SWIM_DRAG * dt);
    if (play.active && !knockedDown && (keys.has('Space') || jumpQueued || pedal.jump)) player.vel.y = jumpSpeed * SWIM_JUMP;
    jumpQueued = false;
    player.pos.y += player.vel.y * dt + dy;
    const cap = waterTop + SWIM_FLOAT;
    if (player.pos.y > cap) { player.pos.y = cap; if (player.vel.y > 0) player.vel.y = 0; }
    const bed = waterTop + waterDip + EYE_HEIGHT;
    if (player.pos.y < bed) { player.pos.y = bed; player.vel.y = 0; }
    player.grounded = false;
  } else {
    // horizontal first, so the roof lookup starts wall-clear
    const wasGrounded = player.grounded;
    moveAndCollide(player.pos, dx, dz, wasGrounded ? STEP_UP : 0);
    if (pushPlayerFromCar()) moveAndCollide(player.pos, 0, 0, wasGrounded ? STEP_UP : 0);

    if (player.grounded && play.active && !knockedDown && (keys.has('Space') || jumpQueued || pedal.jump)) {
      player.vel.y = jumpSpeed;
      player.grounded = false;
    }
    jumpQueued = false;
    player.vel.y -= GRAVITY * dt;

    const fromFeet = player.pos.y - EYE_HEIGHT;
    player.pos.y += player.vel.y * dt;
    if (player.vel.y > 0) {
      // indoors, a jump stops at the ceiling
      const c = ceilingAt(player.pos.x, player.pos.z,
        fromFeet + EYE_HEIGHT + HEAD_CLEAR, player.pos.y + HEAD_CLEAR);
      if (c < Infinity) { player.pos.y = c - HEAD_CLEAR; player.vel.y = 0; }
    }
    const toFeet = player.pos.y - EYE_HEIGHT;

    // re-decided each frame, so walking off an edge falls
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
  // the world's edge stops the player
  if (ecosystem.ready) { player.pos.x = ecosystem.fitX(player.pos.x); player.pos.z = ecosystem.fitZ(player.pos.z); }

  poseFrame(dt);
}

// A frame's end on foot: the crouch eases, the camera and body are placed, and the HUD follows.
function poseFrame(dt) {
  stance.tick(dt);
  const crouchTo = stance.low && !flying ? CROUCH_DROP : 0;
  crouchY = crouchY < crouchTo ? Math.min(crouchTo, crouchY + CROUCH_RATE * dt)
    : Math.max(crouchTo, crouchY - CROUCH_RATE * dt);
  camera.position.copy(player.pos);
  camera.position.y -= crouchY;
  camera.rotation.set(player.pitch, player.yaw, 0, 'YXZ');
  pov.apply(dt);
  gunView.place();
  syncDot();
  vr.placeRig();
  updateCarButton();
}

export function movementHeld() {
  return stickId !== null || climb !== 0 || jumpQueued || attackQueued || pedal.gas || pedal.brake || pedal.jump || pedal.attack ||
    gunView.aim !== (gunView.aiming ? 1 : 0) || gunView.recoil > 0 || gunView.drawDir !== 0 || game.reloadUntil >= 0 || carTransit !== null ||
    keys.has('KeyW') || keys.has('KeyA') || keys.has('KeyS') || keys.has('KeyD') ||
    keys.has('ArrowUp') || keys.has('ArrowDown') || keys.has('ArrowLeft') || keys.has('ArrowRight') ||
    keys.has('Space') ||
    (flying && (keys.has('ShiftLeft') || keys.has('ShiftRight')));
}

// RENDER INPUTS: what 8a-render reads, wired last.
renderInputs.player = player;
renderInputs.casters = () => [cat.mesh, pov.body];
renderInputs.survivor = () => game.on;
renderInputs.pointerTaken = id => id === stickId || id === lookId;
renderInputs.locked = () => play.locked;
// FALLS: the car as the falling bodies' box (Ecosystem.fallBox): centre, ground, front and right axes, half sizes, top
const _carFallBox = { cx: 0, cz: 0, y: 0, fx: 0, fz: 1, sx: 1, sz: 0, halfLen: CAR_LEN / 2, halfWid: CAR_WID / 2, top: CAR_TOP };
ecosystem.fallBox = () => {
  if (!car.placed) return null;
  const b = _carFallBox;
  b.cx = car.x; b.cz = car.z; b.y = car.y;
  b.fx = -Math.sin(car.yaw); b.fz = -Math.cos(car.yaw);   // heading (moveCar)
  b.sx = Math.cos(car.yaw); b.sz = -Math.sin(car.yaw);
  return b;
};