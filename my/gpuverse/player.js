// player.js — first-person walker driven by TWO input sources at once:
//   keyboard: W/A/S/D to move, Space to jump, mouse-drag to look
//   touch:    on-screen joystick to move, on-screen JUMP button, drag-to-look
// Both modes are always live regardless of device; their movement intents are summed,
// so a gamepad-less laptop and a phone behave identically and can even be used together.
//
// The player owns its own position + look angles and produces an {eye,target} camera
// each frame. Ground height is read from the SAME baked heightfield the renderer draws
// (passed in via setTerrain as {heights, gridN, worldMin, worldMax}), then bilinearly
// sampled — so the walker stands exactly on the rendered terrain. We do NOT recompute
// the noise on the CPU: WGSL's fp32 sin-hash and JS's fp64 Math.sin diverge badly as
// world coords grow, which is what previously buried the player when walking out.

const mixf = (a, b, t) => a + (b - a) * t;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

// Bilinear sample of the baked heightfield at world (wx,wz).
// tp: { heights:Float32Array(gridN*gridN), gridN, worldMin:[x,z], worldMax:[x,z] }.
// Mirrors the terrain vertex shader: vertex iz*gridN+ix sits at uv=(ix,iz)/(gridN-1)
// across [worldMin,worldMax]. Sampling the same grid the same way => identical ground.
function sampleHeight(tp, wx, wz) {
  if (!tp || !tp.heights) return 0;
  const g = tp.gridN;
  const spanX = tp.worldMax[0] - tp.worldMin[0];
  const spanZ = tp.worldMax[1] - tp.worldMin[1];
  // world -> grid coords (in vertices, 0..g-1)
  let fx = (wx - tp.worldMin[0]) / spanX * (g - 1);
  let fz = (wz - tp.worldMin[1]) / spanZ * (g - 1);
  fx = clamp(fx, 0, g - 1);
  fz = clamp(fz, 0, g - 1);
  const x0 = Math.floor(fx), z0 = Math.floor(fz);
  const x1 = Math.min(x0 + 1, g - 1), z1 = Math.min(z0 + 1, g - 1);
  const tx = fx - x0, tz = fz - z0;
  const h = tp.heights;
  const h00 = h[z0 * g + x0], h10 = h[z0 * g + x1];
  const h01 = h[z1 * g + x0], h11 = h[z1 * g + x1];
  return mixf(mixf(h00, h10, tx), mixf(h01, h11, tx), tz);
}

// ---------------------------------------------------------------------------
// createPlayer(canvas, opts) -> { update(dt), getCamera(aspect), setTerrain(tp),
//                                 position, destroy() }
//
// opts:
//   terrain   : { heights:Float32Array, gridN, worldMin:[x,z], worldMax:[x,z] }
//               the baked heightfield from renderer.readHeights() + world XZ bounds.
//               May be null at construction and supplied later via setTerrain().
//   eyeHeight : meters above ground the camera sits          (default 6)
//   moveSpeed : horizontal units/sec                          (default 120)
//   jumpSpeed : initial vertical velocity on jump             (default 90)
//   gravity   : downward accel units/sec^2                    (default 260)
//   flySpeed  : vertical units/sec while flying               (default 160)
//   start     : [x,z] spawn (defaults to world center)
//
// Controls — both input modes always live:
//   move : W/A/S/D or arrows, or the joystick
//   jump : Space or the JUMP button (only while walking; independent of moving)
//   look : drag anywhere on the canvas
//   fly  : F or the FLY button toggles. While flying: Space/JUMP/▲ ascend,
//          Shift or C or ▼ descend; gravity is off and you can't sink below ground.
// ---------------------------------------------------------------------------
export function createPlayer(canvas, opts = {}) {
  let terrain   = opts.terrain || null;
  const eyeH    = opts.eyeHeight ?? 6;
  const moveSpd = opts.moveSpeed ?? 120;
  const jumpSpd = opts.jumpSpeed ?? 90;
  const gravity = opts.gravity   ?? 260;

  // ---- player state ----
  const center = terrain
    ? [(terrain.worldMin[0] + terrain.worldMax[0]) / 2, (terrain.worldMin[1] + terrain.worldMax[1]) / 2]
    : [0, 0];
  const start = opts.start || center;
  const pos = { x: start[0], y: 0, z: start[1] }; // y is the camera/eye height in world space
  let yaw = -Math.PI / 2;   // look toward -Z initially
  let pitch = -0.15;        // slight downward tilt
  let vy = 0;               // vertical velocity
  let onGround = false;
  let flying = false;       // toggled by F / FLY button
  const flySpd = opts.flySpeed ?? 160;  // vertical units/sec while flying

  function groundY(x, z) {
    return sampleHeight(terrain, x, z);
  }
  // start grounded
  pos.y = groundY(pos.x, pos.z) + eyeH;

  // ===== KEYBOARD =====
  const keys = Object.create(null);
  let toggleFly = () => {};   // assigned once the touch UI exists (keeps button + state in sync)
  const onKeyDown = (e) => {
    const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
    const wasDown = keys[k];
    keys[k] = true;
    if (k === " " || k === "Spacebar") { keys[" "] = true; e.preventDefault(); }
    if (k === "f" && !wasDown) toggleFly();   // only on the press edge, not key-repeat
    // don't trap modifier combos (devtools, reload, etc.)
  };
  const onKeyUp = (e) => {
    const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
    keys[k] = false;
    if (k === " " || k === "Spacebar") keys[" "] = false;
  };
  addEventListener("keydown", onKeyDown);
  addEventListener("keyup", onKeyUp);

  // ===== LOOK (drag anywhere on canvas that isn't a touch control) =====
  // Shared by mouse and touch-drag. Joystick/jump swallow their own pointers.
  // pointermove can fire many times per frame; rather than mutate yaw/pitch in the
  // handler (which also competes with rendering), we ACCUMULATE the raw pixel delta
  // here and apply it exactly once per frame in update(). preventDefault() on the
  // move stops the browser from treating the drag as a scroll/pinch gesture.
  let looking = false, lookId = -1, lx = 0, ly = 0;
  let pendingDX = 0, pendingDY = 0;   // accumulated, consumed each frame
  const LOOK_SENS = 0.0042;
  const onPointerDown = (e) => {
    if (e.target.closest && e.target.closest("#playerControls")) return; // joystick/jump own it
    looking = true; lookId = e.pointerId; lx = e.clientX; ly = e.clientY;
    canvas.setPointerCapture?.(e.pointerId);
  };
  const onPointerMove = (e) => {
    if (!looking || e.pointerId !== lookId) return;
    pendingDX += e.clientX - lx;
    pendingDY += e.clientY - ly;
    lx = e.clientX; ly = e.clientY;
    if (e.cancelable) e.preventDefault();   // suppress scroll/pinch gesture recognition
  };
  const onPointerUp = (e) => {
    if (e.pointerId === lookId) { looking = false; lookId = -1; }
  };
  canvas.addEventListener("pointerdown", onPointerDown);
  canvas.addEventListener("pointermove", onPointerMove, { passive: false });
  canvas.addEventListener("pointerup", onPointerUp);
  canvas.addEventListener("pointercancel", onPointerUp);

  // ===== TOUCH CONTROLS (joystick + jump + fly), always on screen =====
  const ui = buildTouchUI();
  const joy = ui.joystick; // {x,y} in [-1,1], updated by its own pointer handlers
  let touchJumpQueued = false;
  ui.onJump = () => { touchJumpQueued = true; };

  // single source of truth for the fly toggle; keeps keyboard, button, and physics aligned
  toggleFly = () => {
    flying = !flying;
    if (flying) { vy = 0; onGround = false; } // stop falling the instant we lift off
    ui.setFlying(flying);
  };
  ui.onFlyToggle = toggleFly;

  // ---- per-frame update ----
  function update(dt) {
    // apply look accumulated from pointermove since last frame (coalesced to one update)
    if (pendingDX !== 0 || pendingDY !== 0) {
      yaw   += pendingDX * LOOK_SENS;
      pitch  = clamp(pitch - pendingDY * LOOK_SENS, -1.45, 1.45);
      pendingDX = 0; pendingDY = 0;
    }

    // forward/right basis on the XZ plane from yaw (ignore pitch for walking)
    const fx = Math.cos(yaw), fz = Math.sin(yaw);     // forward
    const rx = Math.cos(yaw + Math.PI / 2), rz = Math.sin(yaw + Math.PI / 2); // right

    // --- gather movement intent from BOTH sources, then clamp magnitude ---
    let mf = 0, mr = 0; // forward, right in [-1,1]ish
    if (keys["w"] || keys["arrowup"])    mf += 1;
    if (keys["s"] || keys["arrowdown"])  mf -= 1;
    if (keys["d"] || keys["arrowright"]) mr += 1;
    if (keys["a"] || keys["arrowleft"])  mr -= 1;
    // joystick: up on stick = forward, right on stick = right
    mf += -joy.y;
    mr +=  joy.x;

    // normalize so diagonals/combined sources aren't faster than 1
    const mag = Math.hypot(mf, mr);
    if (mag > 1) { mf /= mag; mr /= mag; }

    pos.x += (fx * mf + rx * mr) * moveSpd * dt;
    pos.z += (fz * mf + rz * mr) * moveSpd * dt;

    // clamp to world bounds if we have terrain
    if (terrain) {
      pos.x = clamp(pos.x, terrain.worldMin[0], terrain.worldMax[0]);
      pos.z = clamp(pos.z, terrain.worldMin[1], terrain.worldMax[1]);
    }

    // --- vertical ---
    const floor = groundY(pos.x, pos.z) + eyeH;  // never go below ground, in either mode
    const jumpTapped = keys[" "] || touchJumpQueued;
    touchJumpQueued = false;   // consume the one-shot latch regardless of mode

    if (flying) {
      // direct vertical control, no gravity. up: Space / JUMP-button / ▲ ;  down: Shift|C / ▼
      let up = 0;
      if (keys[" "] || ui.flyUp) up += 1;
      if (keys["Shift"] || keys["c"] || ui.flyDown) up -= 1;
      vy = up * flySpd;
      pos.y += vy * dt;
      if (pos.y < floor) { pos.y = floor; }   // land softly if we descend into terrain
      onGround = false;
    } else {
      // walking: jump impulse + gravity. Jump is independent of horizontal movement,
      // so you can hold W and tap Space to jump while walking.
      if (onGround && jumpTapped) { vy = jumpSpd; onGround = false; }

      vy -= gravity * dt;
      pos.y += vy * dt;

      if (pos.y <= floor) { pos.y = floor; vy = 0; onGround = true; }
      else { onGround = false; }
    }
  }

  // ---- produce {eye,target} for renderer.setCamera ----
  function getCamera(aspect) {
    const cp = Math.cos(pitch);
    const dir = [Math.cos(yaw) * cp, Math.sin(pitch), Math.sin(yaw) * cp];
    const eye = [pos.x, pos.y, pos.z];
    const target = [eye[0] + dir[0], eye[1] + dir[1], eye[2] + dir[2]];
    return { eye, target, aspect, near: 0.5, far: 6000 };
  }

  let placed = !!opts.start;   // did the caller pick a spawn? if not, center on first terrain

  function setTerrain(tp) {
    terrain = tp;
    if (!placed) {
      pos.x = (tp.worldMin[0] + tp.worldMax[0]) / 2;
      pos.z = (tp.worldMin[1] + tp.worldMax[1]) / 2;
      placed = true;
    }
    // clamp into (possibly rescaled) world
    pos.x = clamp(pos.x, tp.worldMin[0], tp.worldMax[0]);
    pos.z = clamp(pos.z, tp.worldMin[1], tp.worldMax[1]);
    const floor = groundY(pos.x, pos.z) + eyeH;
    if (flying) {
      pos.y = Math.max(pos.y, floor);   // stay airborne; just don't end up under new terrain
    } else {
      pos.y = floor; vy = 0; onGround = true;  // re-ground the walker on the new heightfield
    }
  }

  function destroy() {
    removeEventListener("keydown", onKeyDown);
    removeEventListener("keyup", onKeyUp);
    canvas.removeEventListener("pointerdown", onPointerDown);
    canvas.removeEventListener("pointermove", onPointerMove);
    canvas.removeEventListener("pointerup", onPointerUp);
    canvas.removeEventListener("pointercancel", onPointerUp);
    ui.destroy();
  }

  return { update, getCamera, setTerrain, destroy, position: pos,
           toggleFly, get flying(){return flying;},
           get yaw(){return yaw;}, get pitch(){return pitch;} };
}

// ---------------------------------------------------------------------------
// On-screen touch controls: a draggable joystick (bottom-left) and a right-side
// button cluster (bottom-right): FLY toggle on top, then JUMP/UP, and a DOWN
// button shown only while flying. Built in JS so player.js is drop-in.
// joystick.{x,y} live in [-1,1]; (0,0) at rest.
// API: { joystick, onJump(), flyUp, flyDown, onFlyToggle(), setFlying(bool), destroy() }
//   flyUp/flyDown are HELD booleans (true while the button is pressed).
// ---------------------------------------------------------------------------
function buildTouchUI() {
  const root = document.createElement("div");
  root.id = "playerControls";
  root.innerHTML = `
    <style>
      #playerControls{position:fixed;inset:0;pointer-events:none;z-index:20;
        font:600 13px 'Courier New',monospace;color:#cdd6e0;user-select:none;-webkit-user-select:none}
      #playerControls .pad{position:absolute;bottom:max(24px,env(safe-area-inset-bottom));
        width:130px;height:130px;border-radius:50%;background:rgba(17,22,29,.55);
        border:1px solid #2a3340;pointer-events:auto;touch-action:none;left:24px}
      #playerControls .nub{position:absolute;left:50%;top:50%;width:54px;height:54px;
        margin:-27px 0 0 -27px;border-radius:50%;background:rgba(154,165,177,.85);
        border:1px solid #3a4554;transition:none}
      #playerControls .cluster{position:absolute;right:28px;bottom:max(40px,env(safe-area-inset-bottom));
        display:flex;flex-direction:column;align-items:center;gap:12px;pointer-events:none}
      #playerControls .btn{width:84px;height:84px;border-radius:50%;background:rgba(17,22,29,.6);
        border:1px solid #2a3340;color:#cdd6e0;pointer-events:auto;touch-action:none;
        display:grid;place-items:center;letter-spacing:1px;cursor:pointer;font:inherit}
      #playerControls .btn:active{background:rgba(40,52,66,.85);color:#fff}
      #playerControls .fly{width:84px;height:40px;border-radius:20px}
      #playerControls .fly.on{background:rgba(56,139,168,.7);border-color:#4aa0c0;color:#fff}
      #playerControls .dn{display:none}
      #playerControls.flying .dn{display:grid}
    </style>
    <div class="pad" id="pcPad"><div class="nub" id="pcNub"></div></div>
    <div class="cluster">
      <button class="btn fly" id="pcFly" type="button">FLY</button>
      <button class="btn" id="pcJump" type="button">JUMP</button>
      <button class="btn dn" id="pcDown" type="button">▼ DN</button>
    </div>
  `;
  document.body.appendChild(root);

  const pad = root.querySelector("#pcPad");
  const nub = root.querySelector("#pcNub");
  const jumpBtn = root.querySelector("#pcJump");
  const flyBtn = root.querySelector("#pcFly");
  const downBtn = root.querySelector("#pcDown");

  const joystick = { x: 0, y: 0 };
  let joyId = -1;
  const R = 50; // max nub travel in px

  function setNub(dx, dy) {
    const d = Math.hypot(dx, dy);
    if (d > R) { dx = dx / d * R; dy = dy / d * R; }
    nub.style.transform = `translate(${dx}px, ${dy}px)`;
    joystick.x = dx / R;
    joystick.y = dy / R;
  }
  function resetNub() {
    nub.style.transform = "translate(0,0)";
    joystick.x = 0; joystick.y = 0; joyId = -1;
  }
  const padDown = (e) => {
    joyId = e.pointerId; pad.setPointerCapture?.(e.pointerId);
    const r = pad.getBoundingClientRect();
    setNub(e.clientX - (r.left + r.width / 2), e.clientY - (r.top + r.height / 2));
    e.preventDefault();
  };
  const padMove = (e) => {
    if (e.pointerId !== joyId) return;
    const r = pad.getBoundingClientRect();
    setNub(e.clientX - (r.left + r.width / 2), e.clientY - (r.top + r.height / 2));
    e.preventDefault();
  };
  const padUp = (e) => { if (e.pointerId === joyId) resetNub(); };
  pad.addEventListener("pointerdown", padDown);
  pad.addEventListener("pointermove", padMove);
  pad.addEventListener("pointerup", padUp);
  pad.addEventListener("pointercancel", padUp);

  const api = {
    joystick, flyUp: false, flyDown: false,
    onJump: () => {}, onFlyToggle: () => {},
    setFlying: (on) => {
      root.classList.toggle("flying", on);
      flyBtn.classList.toggle("on", on);
      jumpBtn.textContent = on ? "▲ UP" : "JUMP";
      if (!on) { api.flyUp = false; api.flyDown = false; }
    },
    destroy: () => root.remove(),
  };

  // JUMP doubles as "hold to ascend" while flying, and a one-shot jump on the ground.
  const jumpDown = (e) => { api.onJump(); api.flyUp = true; e.preventDefault(); };
  const jumpUp   = () => { api.flyUp = false; };
  jumpBtn.addEventListener("pointerdown", jumpDown);
  jumpBtn.addEventListener("pointerup", jumpUp);
  jumpBtn.addEventListener("pointercancel", jumpUp);
  jumpBtn.addEventListener("pointerleave", jumpUp);

  const downDown = (e) => { api.flyDown = true; e.preventDefault(); };
  const downUp   = () => { api.flyDown = false; };
  downBtn.addEventListener("pointerdown", downDown);
  downBtn.addEventListener("pointerup", downUp);
  downBtn.addEventListener("pointercancel", downUp);
  downBtn.addEventListener("pointerleave", downUp);

  const flyTap = (e) => { api.onFlyToggle(); e.preventDefault(); };
  flyBtn.addEventListener("pointerdown", flyTap);

  return api;
}