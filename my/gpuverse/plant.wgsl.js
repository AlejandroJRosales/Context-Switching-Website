// plant.wgsl.js: GPU-resident plants (Tier 3.2, fixed-population first step).
//
// Plants are a SECOND entity system alongside the creatures. They live in one storage
// buffer  plants : array<vec4<f32>>  (xyz = world pos baked onto the terrain, w = a
// per-plant seed in [0,1) driving size / phase / tint variation). The buffer is never
// read back to the CPU: it's seeded once on the host (see plant.js) and thereafter only
// read — by the instanced render here, and by the grid's count/scatter passes so that
// sensing/eating can find plants. There is NO per-plant compute in this first step
// (fixed population, no growth); growth is a birth problem deferred to Tier 4.x, exactly
// as the prompt sequences it.
//
// RENDER: instanced foliage. Each plant draws TWO crossed quads (a 12-vertex fan, 6 per
// quad) rooted at the ground point and rising along world-up. The quads are billboarded
// only about the Y axis (turned to face the camera in the horizontal plane) so they read
// as upright plants from any yaw without the "spinning card" look of a full spherical
// billboard. Wind sway is a VS deformation: the top of each quad is displaced by a
// per-plant-phased sine of time, tapering to zero at the root so the base stays planted.
//
// Unlike rain/water, plants are OPAQUE geometry: depth-tested AND depth-writing, drawn
// before water (so water blends over submerged stems) and after creatures. Alpha is a
// cutout (leaf silhouette), resolved by discard in the FS rather than blending, so no
// sorting between plants is needed.

import { SKY_PARAMS_STRUCT, FOG_FN } from "./sky.js";

// ---------------------------------------------------------------------------
// Render: instanced crossed billboards with vertex-shader wind sway.
// One instance per plant; 12 vertices (two quads). Camera + Sky + Fog + PlantDraw.
// ---------------------------------------------------------------------------
export const PLANT_RENDER = SKY_PARAMS_STRUCT + FOG_FN + /* wgsl */`
struct Camera { viewProj : mat4x4<f32>, eye : vec3<f32>, _p : f32, invViewProj : mat4x4<f32> };
struct PlantDraw {
  colA   : vec3<f32>, time  : f32,   // base foliage color (young), sim time (sway phase)
  colB   : vec3<f32>, height: f32,   // tip foliage color (mature/dry), base world height
  width  : f32, sway : f32, _p0 : f32, _p1 : f32,   // half-width, sway amplitude (world units)
};

@group(0) @binding(0) var<uniform> CAM : Camera;
@group(0) @binding(1) var<uniform> PD  : PlantDraw;
@group(0) @binding(2) var<uniform> SKY : SkyParams;
@group(0) @binding(3) var<uniform> FOG : FogParams;

struct VsOut {
  @builtin(position) clip : vec4<f32>,
  @location(0) worldPos : vec3<f32>,
  @location(1) tv       : f32,    // 0 at root, 1 at tip (vertical param, for tint + sway)
  @location(2) uvx      : f32,    // -1..1 across the quad width (for the leaf-edge cutout)
  @location(3) tint     : vec3<f32>,
};

fn hash11(x : f32) -> f32 { return fract(sin(x * 91.345) * 47453.21); }

@vertex
fn vs(@builtin(vertex_index) vid : u32,
      @location(0) inst : vec4<f32>) -> VsOut {
  // Two quads share this corner pattern (x = width axis in [-1,1], y = height in [0,1]).
  // 6 verts each; vid < 6 -> quad A, else quad B (rotated 90 deg about Y so they cross).
  var corners = array<vec2<f32>, 6>(
    vec2<f32>(-1.0, 0.0), vec2<f32>( 1.0, 0.0), vec2<f32>( 1.0, 1.0),
    vec2<f32>(-1.0, 0.0), vec2<f32>( 1.0, 1.0), vec2<f32>(-1.0, 1.0),
  );
  let quad = vid / 6u;
  let c = corners[vid % 6u];

  let seed = inst.w;
  // per-plant size: vary height and width a little so a field doesn't look stamped.
  let hgt = PD.height * (0.65 + 0.70 * seed);
  let halfW = PD.width * (0.75 + 0.50 * hash11(seed * 7.13 + 1.0));

  // Billboard the width axis about Y only: build a horizontal "right" vector pointing
  // across the view direction (in XZ), so the card turns to face the camera in yaw but
  // stays vertical. Quad B uses the perpendicular horizontal axis so the two cross.
  let toEye = CAM.eye - inst.xyz;
  var rightA = normalize(vec3<f32>(-toEye.z, 0.0, toEye.x) + vec3<f32>(1e-4, 0.0, 0.0));
  var rightB = vec3<f32>(-rightA.z, 0.0, rightA.x);   // 90 deg in the XZ plane
  let right = select(rightA, rightB, quad == 1u);

  // Wind sway: displace the top along a per-plant-phased sine, tapered by height^2 so the
  // root stays fixed. Direction is a gentle world-space drift (matches the rain wind feel).
  let phase = seed * 6.2831853;
  let s = sin(PD.time * 1.6 + phase) + 0.35 * sin(PD.time * 3.1 + phase * 1.7);
  let swayOff = vec3<f32>(0.8, 0.0, 0.5) * (PD.sway * s * c.y * c.y);

  let worldPos = inst.xyz
    + right * (c.x * halfW)
    + vec3<f32>(0.0, 1.0, 0.0) * (c.y * hgt)
    + swayOff;

  // per-plant tint: lerp young->dry by seed, plus a hair of hue jitter.
  let dry = hash11(seed * 3.77 + 0.5);
  var out : VsOut;
  out.worldPos = worldPos;
  out.clip = CAM.viewProj * vec4<f32>(worldPos, 1.0);
  out.tv = c.y;
  out.uvx = c.x;
  out.tint = mix(PD.colA, PD.colB, dry * 0.85);
  return out;
}

@fragment
fn fs(in : VsOut) -> @location(0) vec4<f32> {
  // Leaf cutout: taper the silhouette toward the tip so the quad reads as a frond/blade
  // rather than a rectangle. Width allowed shrinks as tv->1; discard fragments outside it.
  let allowed = 1.0 - in.tv * 0.85;
  if (abs(in.uvx) > allowed) { discard; }

  // Vertical shade: darker near the root (self-shadowed base), brighter at the tip.
  let shade = 0.45 + 0.55 * in.tv;

  // Sky-driven light: flat-ish foliage lit by ambient + a soft sun wrap + faint moon fill,
  // then fogged like everything else so distant plants recede into the fog wall.
  let sunWrap = clamp(SKY.sunDir.y * 0.5 + 0.5, 0.0, 1.0);   // brighter by day
  let sun = SKY.sunColor * (0.35 + 0.65 * sunWrap);
  let moon = SKY.moonColor * SKY.moonVisible * 0.10;
  let lit = in.tint * shade * (SKY.ambient + sun + moon);

  let foggy = applyFog(lit, in.worldPos, CAM.eye, FOG);
  return vec4<f32>(foggy, 1.0);
}
`;
