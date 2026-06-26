// creature_wgsl.js: instanced creatures. Each instance reads one entry from the positions
// buffer (the same buffer compute writes) via an instance-step vertex buffer; no CPU
// per-entity work. Bodies are cheap camera-facing quads. Shading reads SkyParams + fog.
import { SKY_PARAMS_STRUCT, FOG_FN } from "./sky_wgsl.js";

export const CREATURE_RENDER = SKY_PARAMS_STRUCT + FOG_FN + /* wgsl */`
struct Camera { viewProj : mat4x4<f32>, eye : vec3<f32>, _p : f32, invViewProj : mat4x4<f32> };
@group(0) @binding(0) var<uniform> CAM : Camera;
@group(0) @binding(1) var<uniform> SIZE : vec4<f32>; // x = creature radius
@group(0) @binding(2) var<uniform> SKY : SkyParams;
@group(0) @binding(3) var<uniform> FOG : FogParams;

struct VsOut {
  @builtin(position) clip : vec4<f32>,
  @location(0) nrm : vec3<f32>,
  @location(1) tint : vec3<f32>,
  @location(2) uv : vec2<f32>,
  @location(3) worldPos : vec3<f32>,
};

// Camera-facing quad (2 tris), corner index 0..5, expanded around the instance center.
fn cornerOffset(i : u32) -> vec2<f32> {
  var c = array<vec2<f32>, 6>(
    vec2<f32>(-1.0, -1.0), vec2<f32>( 1.0, -1.0), vec2<f32>( 1.0,  1.0),
    vec2<f32>(-1.0, -1.0), vec2<f32>( 1.0,  1.0), vec2<f32>(-1.0,  1.0),
  );
  return c[i];
}

@vertex
fn vs(@builtin(vertex_index) vid : u32,
      @location(0) instPos : vec4<f32>) -> VsOut {
  let center = instPos.xyz;
  let r = SIZE.x;

  // camera-facing basis
  let fwd   = normalize(CAM.eye - center);
  let right = normalize(cross(vec3<f32>(0.0, 1.0, 0.0), fwd));
  let up    = cross(fwd, right);

  let off = cornerOffset(vid);
  let worldPos = center + (right * off.x + up * off.y) * r;

  var out : VsOut;
  out.clip = CAM.viewProj * vec4<f32>(worldPos, 1.0);
  out.worldPos = worldPos;
  out.nrm = fwd;
  out.uv = off;   // [-1,1] quad coords for the fragment radial fade
  // tint by a hash of instance position so the field reads as many individuals
  let h = fract(sin(dot(center.xz, vec2<f32>(12.9898, 78.233))) * 43758.5453);
  out.tint = mix(vec3<f32>(0.9, 0.5, 0.2), vec3<f32>(0.95, 0.85, 0.3), h);
  return out;
}

@fragment
fn fs(in : VsOut) -> @location(0) vec4<f32> {
  // round the quad into a disc; drop the corners entirely
  let d = length(in.uv);
  if (d > 1.0) { discard; }

  // reconstruct a hemisphere normal from disc coords for a little shaded roundness.
  let z = sqrt(max(0.0, 1.0 - d * d));
  let sphereN = normalize(in.nrm * z + vec3<f32>(in.uv.x, in.uv.y, 0.0));
  let lightDir = normalize(SKY.sunDir);
  let ndl = max(dot(sphereN, lightDir), 0.0);

  let lit = in.tint * (SKY.ambient + SKY.sunColor * ndl);
  let foggy = applyFog(lit, in.worldPos, CAM.eye, FOG);

  // opaque output (alpha-blending many overlapping sprites would need sorting we skip).
  return vec4<f32>(foggy, 1.0);
}
`;
