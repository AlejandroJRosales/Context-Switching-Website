// sky_wgsl.js: full-screen sky gradient + sun disc/glow, drawn first as the backdrop.
// Also exports FOG_FN, mixed into terrain/creature/water frag shaders for a shared fog.

export const SKY_PARAMS_STRUCT = /* wgsl */`
struct SkyParams {
  sunDir    : vec3<f32>, _p0 : f32,
  sunColor  : vec3<f32>, _p1 : f32,
  skyTop    : vec3<f32>, _p2 : f32,
  skyBottom : vec3<f32>, sunVisible : f32,
  ambient   : vec3<f32>, _p3 : f32,
};
`;

// Shared fog helper. Expects FogParams (fogColor:vec3, fogDist:f32) bound somewhere
// in scope as `FOG`, and applies exponential-squared fog by camera distance.
export const FOG_FN = /* wgsl */`
struct FogParams { fogColor : vec3<f32>, fogDist : f32 };

fn applyFog(litColor : vec3<f32>, worldPos : vec3<f32>, eye : vec3<f32>, fog : FogParams) -> vec3<f32> {
  let d = length(worldPos - eye);
  // exp2 falloff: gentle near, then crushes to fog color past fogDist
  let f = 1.0 - exp(-pow(d / max(fog.fogDist, 1.0), 2.0));
  return mix(litColor, fog.fogColor, clamp(f, 0.0, 1.0));
}
`;

// Full-screen sky pass: 3-vert oversized triangle from vertex_index. Uses the camera's
// invViewProj to turn screen NDC into world-space view rays so sky/sun align with geometry.
export const SKY_RENDER = SKY_PARAMS_STRUCT + /* wgsl */`
struct Camera {
  viewProj    : mat4x4<f32>,
  eye         : vec3<f32>, _p : f32,
  invViewProj : mat4x4<f32>,
};
@group(0) @binding(0) var<uniform> CAM : Camera;
@group(0) @binding(1) var<uniform> SKY : SkyParams;

struct VsOut {
  @builtin(position) clip : vec4<f32>,
  @location(0) ndc : vec2<f32>,
};

@vertex
fn vs(@builtin(vertex_index) vid : u32) -> VsOut {
  // fullscreen triangle covering [-1,3]x[-1,3]-ish so it overdraws past the screen edges
  var p = array<vec2<f32>, 3>(
    vec2<f32>(-1.0, -1.0), vec2<f32>( 3.0, -1.0), vec2<f32>(-1.0,  3.0),
  );
  var out : VsOut;
  out.clip = vec4<f32>(p[vid], 0.9999, 1.0); // pinned at far plane
  out.ndc = p[vid];
  return out;
}

@fragment
fn fs(in : VsOut) -> @location(0) vec4<f32> {
  // reconstruct world-space view direction from NDC using the camera's inverse viewProj
  let nearP = CAM.invViewProj * vec4<f32>(in.ndc, -1.0, 1.0);
  let farP  = CAM.invViewProj * vec4<f32>(in.ndc,  1.0, 1.0);
  let nearW = nearP.xyz / nearP.w;
  let farW  = farP.xyz / farP.w;
  let dir   = normalize(farW - nearW);

  // gradient by view-ray height (dir.y in [-1,1] -> [0,1])
  let t = clamp(dir.y * 0.5 + 0.5, 0.0, 1.0);
  var col = mix(SKY.skyBottom, SKY.skyTop, smoothstep(0.0, 0.6, t));

  // sun disc + glow: angular distance between view dir and sun dir
  let cosA = dot(dir, normalize(SKY.sunDir));
  let disc = smoothstep(0.9995, 0.9998, cosA);             // tight bright disc
  let glow = pow(max(cosA, 0.0), 64.0) * 0.6;               // soft halo
  col = col + SKY.sunColor * (disc * 3.0 + glow) * SKY.sunVisible;

  return vec4<f32>(col, 1.0);
}
`;
