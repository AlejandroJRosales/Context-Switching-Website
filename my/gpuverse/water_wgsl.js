// water_wgsl.js: one large quad at fixed Y (waterLevel), alpha-blended after opaque
// geometry. Animated normal from two scrolling noise layers, Fresnel mix between deep-
// water tint and sky reflection, plus a specular sun glint. One static quad, one draw.
import { SKY_PARAMS_STRUCT, FOG_FN } from "./sky_wgsl.js";

export const WATER_RENDER = SKY_PARAMS_STRUCT + FOG_FN + /* wgsl */`
struct Camera { viewProj : mat4x4<f32>, eye : vec3<f32>, _p : f32, invViewProj : mat4x4<f32> };
struct WaterParams { worldMin : vec2<f32>, worldMax : vec2<f32>, waterLevel : f32, time : f32, _p0:f32, _p1:f32 };

@group(0) @binding(0) var<uniform> CAM : Camera;
@group(0) @binding(1) var<uniform> SKY : SkyParams;
@group(0) @binding(2) var<uniform> WP  : WaterParams;
@group(0) @binding(3) var<uniform> FOG : FogParams;

struct VsOut {
  @builtin(position) clip : vec4<f32>,
  @location(0) worldPos : vec3<f32>,
};

// 6 vertex_index values draw 2 triangles; no index buffer needed for one static quad.
@vertex
fn vs(@builtin(vertex_index) vid : u32) -> VsOut {
  var corners = array<vec2<f32>, 6>(
    vec2<f32>(0.0, 0.0), vec2<f32>(1.0, 0.0), vec2<f32>(1.0, 1.0),
    vec2<f32>(0.0, 0.0), vec2<f32>(1.0, 1.0), vec2<f32>(0.0, 1.0),
  );
  let uv = corners[vid];
  let xz = WP.worldMin + uv * (WP.worldMax - WP.worldMin);
  let worldPos = vec3<f32>(xz.x, WP.waterLevel, xz.y);

  var out : VsOut;
  out.clip = CAM.viewProj * vec4<f32>(worldPos, 1.0);
  out.worldPos = worldPos;
  return out;
}

fn hash2(p : vec2<f32>) -> f32 {
  return fract(sin(dot(p, vec2<f32>(127.1, 311.7))) * 43758.5453123);
}
fn vnoise(p : vec2<f32>) -> f32 {
  let i = floor(p); let f = fract(p);
  let u = f * f * (3.0 - 2.0 * f);
  let a = hash2(i); let b = hash2(i + vec2<f32>(1.0, 0.0));
  let c = hash2(i + vec2<f32>(0.0, 1.0)); let d = hash2(i + vec2<f32>(1.0, 1.0));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}

// Animated normal: two scrolling noise layers perturbing the flat normal (0,1,0).
fn waterNormal(xz : vec2<f32>, t : f32) -> vec3<f32> {
  let p1 = xz * 0.05 + vec2<f32>(t * 0.6, t * 0.35);
  let p2 = xz * 0.13 - vec2<f32>(t * 0.4, t * 0.5);
  let n1 = vnoise(p1) - 0.5;
  let n2 = vnoise(p2) - 0.5;
  let slope = vec2<f32>(n1, n2) * 0.35;
  return normalize(vec3<f32>(-slope.x, 1.0, -slope.y));
}

@fragment
fn fs(in : VsOut) -> @location(0) vec4<f32> {
  let nrm = waterNormal(in.worldPos.xz, WP.time);
  let viewDir = normalize(CAM.eye - in.worldPos);

  // Fresnel: grazing angles reflect sky, head-on shows deep-water tint
  let fresnel = pow(1.0 - max(dot(nrm, viewDir), 0.0), 4.0);
  let deepColor = vec3<f32>(0.04, 0.12, 0.16);
  let skyReflect = mix(SKY.skyBottom, SKY.skyTop, 0.5);
  var col = mix(deepColor, skyReflect, clamp(fresnel, 0.0, 0.85));

  // specular sun glint
  let halfV = normalize(normalize(SKY.sunDir) + viewDir);
  let spec = pow(max(dot(nrm, halfV), 0.0), 120.0) * SKY.sunVisible;
  col = col + SKY.sunColor * spec * 1.5;

  col = applyFog(col, in.worldPos, CAM.eye, FOG);
  return vec4<f32>(col, 0.85); // slightly transparent; blended over terrain
}
`;
