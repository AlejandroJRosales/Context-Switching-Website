import { TERRAIN_BAKE, TERRAIN_RENDER, CREATURE_RENDER, WATER_RENDER, SHADOW_BAKE, PLANT_RENDER, CAT_RENDER } from "./world_wgsl.js";
import { SKY_RENDER } from "./sky.js";
import { perspective, lookAt, mul, invertMat4 } from "./mat.js";
import { buildCreatureMesh, buildCatMesh } from "./mesh.js";

export function createRenderer(device, context, format, {
  worldMin, worldMax,
  gridN = 256,
  amplitude = 40,
  seed = 7,
  creatureRadius = 1.5,
  mountainThreshold = 0.55,      // biome-mask cutoff (0..1) above which mountains blend in
  waterLevel = null,             // world Y of the water plane; null = derive from seed
  shadowResolution = 2048,       // sun-view depth map size per side (quality-scaled by host)

}) {
  const wXZmin = [worldMin[0], worldMin[2]];
  const wXZmax = [worldMax[0], worldMax[2]];

  // Seed-derived water level: deterministic fraction of amplitude so different seeds
  // get different lake levels. `seed` here is already the small bounded GPU float from
  // the host (seedToGpuFloat), so a plain integer-mixing hash decorrelates cleanly
  // without sin() of a large argument (which clumps and loses precision).
  function hashSeedTo01(s) {
    let h = Math.imul((s * 65536) | 0 ^ 0x9e3779b9, 2654435761);
    h = Math.imul(h ^ (h >>> 15), 2246822519);
    return ((h ^ (h >>> 13)) >>> 0) / 4294967296;
  }
  const resolvedWaterLevel = waterLevel ?? (amplitude * (0.08 + 0.50 * hashSeedTo01(seed + 0.37)));

  // TerrainParams uniform (std140: vec2,vec2,u32,f32,f32,f32 -> 32 bytes)
  const tpBuf = device.createBuffer({ size: 32, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
  {
    const f = new Float32Array(8), u = new Uint32Array(f.buffer);
    f[0]=wXZmin[0]; f[1]=wXZmin[1]; f[2]=wXZmax[0]; f[3]=wXZmax[1];
    u[4]=gridN; f[5]=amplitude; f[6]=seed; f[7]=mountainThreshold;
    device.queue.writeBuffer(tpBuf, 0, f);
  }

  // SkyParams uniform (112 bytes: 7x vec4-aligned slots)
  const skyBuf = device.createBuffer({ size: 112, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
  const skyScratch = new Float32Array(16);
  function setSky(sky) {
    skyScratch[0]=sky.sunDir[0];    skyScratch[1]=sky.sunDir[1];    skyScratch[2]=sky.sunDir[2];    skyScratch[3]=0;
    skyScratch[4]=sky.sunColor[0];  skyScratch[5]=sky.sunColor[1];  skyScratch[6]=sky.sunColor[2];  skyScratch[7]=0;
    skyScratch[8]=sky.skyTop[0];    skyScratch[9]=sky.skyTop[1];    skyScratch[10]=sky.skyTop[2];   skyScratch[11]=0;
    skyScratch[12]=sky.skyBottom[0];skyScratch[13]=sky.skyBottom[1];skyScratch[14]=sky.skyBottom[2];skyScratch[15]=sky.sunVisible;
    device.queue.writeBuffer(skyBuf, 0, skyScratch);
    // ambient (slot 4) + moonDir/moonVisible (slot 5) + moonColor (slot 6) = 48 bytes from offset 64
    device.queue.writeBuffer(skyBuf, 64, new Float32Array([
      sky.ambient[0], sky.ambient[1], sky.ambient[2], 0,
      sky.moonDir[0], sky.moonDir[1], sky.moonDir[2], sky.moonVisible,
      sky.moonColor[0], sky.moonColor[1], sky.moonColor[2], 0,
    ]));
  }

  // FogParams uniform (16 bytes: vec3 + f32)
  const fogBuf = device.createBuffer({ size: 16, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
  function setFog(fogColor, fogDist) {
    device.queue.writeBuffer(fogBuf, 0, new Float32Array([fogColor[0], fogColor[1], fogColor[2], fogDist]));
  }

  const heights = device.createBuffer({ size: gridN*gridN*4, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC });
  const bakeBGL = device.createBindGroupLayout({ entries:[
    {binding:0,visibility:GPUShaderStage.COMPUTE,buffer:{type:"uniform"}},
    {binding:1,visibility:GPUShaderStage.COMPUTE,buffer:{type:"storage"}},
  ]});
  const bakeBG = device.createBindGroup({layout:bakeBGL,entries:[
    {binding:0,resource:{buffer:tpBuf}},{binding:1,resource:{buffer:heights}},
  ]});
  const bakePipe = device.createComputePipeline({
    layout: device.createPipelineLayout({bindGroupLayouts:[bakeBGL]}),
    compute:{module:device.createShaderModule({code:TERRAIN_BAKE}),entryPoint:"main"},
  });

  {
    const enc = device.createCommandEncoder();
    const p = enc.beginComputePass();
    p.setPipeline(bakePipe); p.setBindGroup(0,bakeBG);
    const g = Math.ceil(gridN/8);
    p.dispatchWorkgroups(g, g);
    p.end();
    device.queue.submit([enc.finish()]);
  }

  const quads = (gridN-1)*(gridN-1);
  const terrIndexCount = quads*6;
  const idx = new Uint32Array(terrIndexCount);
  let w=0;
  for(let z=0;z<gridN-1;z++) for(let x=0;x<gridN-1;x++){
    const a=z*gridN+x, b=a+1, c=a+gridN, d=c+1;
    idx[w++]=a; idx[w++]=c; idx[w++]=b;
    idx[w++]=b; idx[w++]=c; idx[w++]=d;
  }
  const terrIndexBuf = device.createBuffer({ size: idx.byteLength,
    usage: GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST });
  device.queue.writeBuffer(terrIndexBuf, 0, idx);

  // camera uniform: mat4 viewProj (64) + vec3 eye + pad (16) + mat4 invViewProj (64) = 144
  const camBuf = device.createBuffer({ size: 144, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });

  // Depth map rendered from the sun's orthographic frustum; terrain samples it with
  // hardware PCF. Resolution is host-tunable (quality scale). Texel-snapping of the
  // light frustum is done host-side and uploaded via setShadow().
  let shadowRes = shadowResolution;
  let shadowTex = device.createTexture({
    size: [shadowRes, shadowRes], format: "depth24plus",
    usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING });
  let shadowView = shadowTex.createView();
  const shadowSamp = device.createSampler({
    compare: "less", magFilter: "linear", minFilter: "linear" });

  const shadowBuf = device.createBuffer({ size: 80, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
  const shadowScratch = new Float32Array(20);
  // host overrides these per-frame via setShadow().
  let shadowTunables = { bias: 0.0015, pcfRadius: 2.0, strength: 0.85 };
  // Identity light matrix until the host fits one (avoids sampling garbage on frame 0).
  shadowScratch.set([1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1], 0);
  shadowScratch[16] = 1 / shadowRes;
  shadowScratch[17] = shadowTunables.bias;
  shadowScratch[18] = shadowTunables.pcfRadius;
  shadowScratch[19] = shadowTunables.strength;
  device.queue.writeBuffer(shadowBuf, 0, shadowScratch);

  function setShadow(lightViewProj, tunables) {
    if (tunables) shadowTunables = { ...shadowTunables, ...tunables };
    shadowScratch.set(lightViewProj, 0);
    shadowScratch[16] = 1 / shadowRes;
    shadowScratch[17] = shadowTunables.bias;
    shadowScratch[18] = shadowTunables.pcfRadius;
    shadowScratch[19] = shadowTunables.strength;
    device.queue.writeBuffer(shadowBuf, 0, shadowScratch);
  }

  function setShadowResolution(res) {
    if (res === shadowRes) return;
    shadowRes = res;
    shadowTex.destroy?.();
    shadowTex = device.createTexture({
      size: [shadowRes, shadowRes], format: "depth24plus",
      usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING });
    shadowView = shadowTex.createView();
    rebuildTerrainBG();   // bind group references the old view; rebuild it
  }

  const shadowBakeBGL = device.createBindGroupLayout({ entries:[
    {binding:0,visibility:GPUShaderStage.VERTEX,buffer:{type:"uniform"}},
    {binding:1,visibility:GPUShaderStage.VERTEX,buffer:{type:"uniform"}},
    {binding:2,visibility:GPUShaderStage.VERTEX,buffer:{type:"read-only-storage"}},
  ]});
  const shadowBakeBG = device.createBindGroup({layout:shadowBakeBGL,entries:[
    {binding:0,resource:{buffer:shadowBuf}},
    {binding:1,resource:{buffer:tpBuf}},
    {binding:2,resource:{buffer:heights}},
  ]});
  const shadowMod = device.createShaderModule({code:SHADOW_BAKE});
  const shadowPipe = device.createRenderPipeline({
    layout: device.createPipelineLayout({bindGroupLayouts:[shadowBakeBGL]}),
    vertex:{module:shadowMod,entryPoint:"vs"},
    primitive:{topology:"triangle-list",cullMode:"none"},
    depthStencil:{format:"depth24plus",depthWriteEnabled:true,depthCompare:"less"},
  });

  const skyBGL = device.createBindGroupLayout({ entries:[
    {binding:0,visibility:GPUShaderStage.VERTEX|GPUShaderStage.FRAGMENT,buffer:{type:"uniform"}},
    {binding:1,visibility:GPUShaderStage.FRAGMENT,buffer:{type:"uniform"}},
  ]});
  const skyBG = device.createBindGroup({layout:skyBGL,entries:[
    {binding:0,resource:{buffer:camBuf}},
    {binding:1,resource:{buffer:skyBuf}},
  ]});
  const skyMod = device.createShaderModule({code:SKY_RENDER});
  const skyPipe = device.createRenderPipeline({
    layout: device.createPipelineLayout({bindGroupLayouts:[skyBGL]}),
    vertex:{module:skyMod,entryPoint:"vs"},
    fragment:{module:skyMod,entryPoint:"fs",targets:[{format}]},
    primitive:{topology:"triangle-list",cullMode:"none"},
    // every pipeline in a pass with a depth attachment must match it; always/no-write
    // keeps the backdrop from touching depth.
    depthStencil:{format:"depth24plus",depthWriteEnabled:false,depthCompare:"always"},
  });

  const terrBGL = device.createBindGroupLayout({ entries:[
    {binding:0,visibility:GPUShaderStage.VERTEX|GPUShaderStage.FRAGMENT,buffer:{type:"uniform"}},
    {binding:1,visibility:GPUShaderStage.VERTEX|GPUShaderStage.FRAGMENT,buffer:{type:"uniform"}},
    {binding:2,visibility:GPUShaderStage.VERTEX,buffer:{type:"read-only-storage"}},
    {binding:3,visibility:GPUShaderStage.FRAGMENT,buffer:{type:"uniform"}},
    {binding:4,visibility:GPUShaderStage.FRAGMENT,buffer:{type:"uniform"}},
    {binding:5,visibility:GPUShaderStage.FRAGMENT,buffer:{type:"uniform"}},
    {binding:6,visibility:GPUShaderStage.FRAGMENT,texture:{sampleType:"depth"}},
    {binding:7,visibility:GPUShaderStage.FRAGMENT,sampler:{type:"comparison"}},
  ]});
  let terrBG;
  function rebuildTerrainBG(){
    terrBG = device.createBindGroup({layout:terrBGL,entries:[
      {binding:0,resource:{buffer:camBuf}},
      {binding:1,resource:{buffer:tpBuf}},
      {binding:2,resource:{buffer:heights}},
      {binding:3,resource:{buffer:skyBuf}},
      {binding:4,resource:{buffer:fogBuf}},
      {binding:5,resource:{buffer:shadowBuf}},
      {binding:6,resource:shadowView},
      {binding:7,resource:shadowSamp},
    ]});
  }
  rebuildTerrainBG();
  const terrMod = device.createShaderModule({code:TERRAIN_RENDER});
  const terrPipe = device.createRenderPipeline({
    layout: device.createPipelineLayout({bindGroupLayouts:[terrBGL]}),
    vertex:{module:terrMod,entryPoint:"vs"},
    fragment:{module:terrMod,entryPoint:"fs",targets:[{format}]},
    primitive:{topology:"triangle-list",cullMode:"none"},
    depthStencil:{format:"depth24plus",depthWriteEnabled:true,depthCompare:"less"},
  });

  const sizeBuf = device.createBuffer({ size:16, usage:GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST });
  device.queue.writeBuffer(sizeBuf,0,new Float32Array([creatureRadius,0,0,0]));

  const mesh = buildCreatureMesh();
  const creVtxBuf = device.createBuffer({ size: mesh.vertexData.byteLength,
    usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST });
  device.queue.writeBuffer(creVtxBuf, 0, mesh.vertexData);
  const creIdxBuf = device.createBuffer({ size: mesh.indexData.byteLength,
    usage: GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST });
  device.queue.writeBuffer(creIdxBuf, 0, mesh.indexData);
  const creIndexCount = mesh.indexCount;

  const creBGL = device.createBindGroupLayout({ entries:[
    {binding:0,visibility:GPUShaderStage.VERTEX|GPUShaderStage.FRAGMENT,buffer:{type:"uniform"}},
    {binding:1,visibility:GPUShaderStage.VERTEX,buffer:{type:"uniform"}},
    {binding:2,visibility:GPUShaderStage.FRAGMENT,buffer:{type:"uniform"}},
    {binding:3,visibility:GPUShaderStage.FRAGMENT,buffer:{type:"uniform"}},
  ]});
  const creBG = device.createBindGroup({layout:creBGL,entries:[
    {binding:0,resource:{buffer:camBuf}},{binding:1,resource:{buffer:sizeBuf}},
    {binding:2,resource:{buffer:skyBuf}},{binding:3,resource:{buffer:fogBuf}},
  ]});
  const creMod = device.createShaderModule({code:CREATURE_RENDER});
  const crePipe = device.createRenderPipeline({
    layout: device.createPipelineLayout({bindGroupLayouts:[creBGL]}),
    vertex:{module:creMod,entryPoint:"vs", buffers:[
      { arrayStride:24, stepMode:"vertex", attributes:[
        {shaderLocation:0,offset:0,  format:"float32x3"},
        {shaderLocation:1,offset:12, format:"float32x3"},
      ]},
      { arrayStride:16, stepMode:"instance", attributes:[
        {shaderLocation:2,offset:0, format:"float32x4"},
      ]},
      { arrayStride:8, stepMode:"instance", attributes:[
        {shaderLocation:3,offset:0, format:"float32x2"},
      ]},
    ]},
    fragment:{module:creMod,entryPoint:"fs",targets:[{format}]},
    primitive:{topology:"triangle-list",cullMode:"none"},
    depthStencil:{format:"depth24plus",depthWriteEnabled:true,depthCompare:"less"},
  });

  const waterBuf = device.createBuffer({ size: 32, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
  let currentWaterLevel = resolvedWaterLevel;
  function writeWaterParams(time) {
    device.queue.writeBuffer(waterBuf, 0, new Float32Array([
      wXZmin[0], wXZmin[1], wXZmax[0], wXZmax[1], currentWaterLevel, time, 0, 0,
    ]));
  }
  writeWaterParams(0);
  const waterBGL = device.createBindGroupLayout({ entries:[
    {binding:0,visibility:GPUShaderStage.VERTEX|GPUShaderStage.FRAGMENT,buffer:{type:"uniform"}},
    {binding:1,visibility:GPUShaderStage.FRAGMENT,buffer:{type:"uniform"}},
    {binding:2,visibility:GPUShaderStage.VERTEX|GPUShaderStage.FRAGMENT,buffer:{type:"uniform"}},
    {binding:3,visibility:GPUShaderStage.FRAGMENT,buffer:{type:"uniform"}},
  ]});
  const waterBG = device.createBindGroup({layout:waterBGL,entries:[
    {binding:0,resource:{buffer:camBuf}},
    {binding:1,resource:{buffer:skyBuf}},
    {binding:2,resource:{buffer:waterBuf}},
    {binding:3,resource:{buffer:fogBuf}},
  ]});
  const waterMod = device.createShaderModule({code:WATER_RENDER});
  const waterPipe = device.createRenderPipeline({
    layout: device.createPipelineLayout({bindGroupLayouts:[waterBGL]}),
    vertex:{module:waterMod,entryPoint:"vs"},
    fragment:{module:waterMod,entryPoint:"fs",targets:[{
      format,
      blend:{
        color:{srcFactor:"src-alpha",dstFactor:"one-minus-src-alpha",operation:"add"},
        alpha:{srcFactor:"one",dstFactor:"one-minus-src-alpha",operation:"add"},
      },
    }]},
    primitive:{topology:"triangle-list",cullMode:"none"},
    depthStencil:{format:"depth24plus",depthWriteEnabled:false,depthCompare:"less"},
  });

  let depth = null, dw=0, dh=0;
  function ensureDepth(width,height){
    if(depth && dw===width && dh===height) return;
    depth?.destroy?.();
    depth = device.createTexture({ size:[width,height],
      format:"depth24plus", usage:GPUTextureUsage.RENDER_ATTACHMENT });
    dw=width; dh=height;
  }

  // camScratch reused every frame (viewProj 16 + eye+pad 4 + invViewProj 16 = 36 floats).
  const camScratch = new Float32Array(36);
  function setCamera({eye, target, up=[0,1,0], fovy=Math.PI/3, aspect, near=0.5, far=5000}){
    const view = lookAt(eye, target, up);
    const proj = perspective(fovy, aspect, near, far);
    const vp = mul(proj, view);
    const invVp = invertMat4(vp);
    camScratch.set(vp, 0);
    camScratch[16]=eye[0]; camScratch[17]=eye[1]; camScratch[18]=eye[2]; camScratch[19]=0;
    camScratch.set(invVp, 20);
    device.queue.writeBuffer(camBuf, 0, camScratch);
  }

  // Render the sun-view depth map. Call once per frame (or every N frames) BEFORE
  // render(), since the terrain main pass samples shadowTex. Own render pass, depth-only.
  function bakeShadow(encoder){
    const pass = encoder.beginRenderPass({
      colorAttachments: [],
      depthStencilAttachment:{ view: shadowView,
        depthClearValue:1.0, depthLoadOp:"clear", depthStoreOp:"store" },
    });
    pass.setPipeline(shadowPipe);
    pass.setBindGroup(0, shadowBakeBG);
    pass.setIndexBuffer(terrIndexBuf, "uint32");
    pass.drawIndexed(terrIndexCount);
    pass.end();
  }

  // per-frame draw. positions = the compute positions buffer (instance pos), N = count,
  // speciesHeading = per-instance (species, heading) buffer. `time` drives water.
  function render(encoder, positions, N, speciesHeading, width, height, time = 0, rain = null, skyState = null, plants = null, cat = null){
    ensureDepth(width,height);
    writeWaterParams(time);

    const pass = encoder.beginRenderPass({
      colorAttachments:[{ view: context.getCurrentTexture().createView(),
        clearValue:{r:0.05,g:0.07,b:0.1,a:1}, loadOp:"clear", storeOp:"store" }],
      depthStencilAttachment:{ view: depth.createView(),
        depthClearValue:1.0, depthLoadOp:"clear", depthStoreOp:"store" },
    });

    pass.setPipeline(skyPipe);
    pass.setBindGroup(0, skyBG);
    pass.draw(3);

    pass.setPipeline(terrPipe);
    pass.setBindGroup(0, terrBG);
    pass.setIndexBuffer(terrIndexBuf, "uint32");
    pass.drawIndexed(terrIndexCount);

    pass.setPipeline(crePipe);
    pass.setBindGroup(0, creBG);
    pass.setVertexBuffer(0, creVtxBuf);
    pass.setVertexBuffer(1, positions);
    pass.setVertexBuffer(2, speciesHeading);
    pass.setIndexBuffer(creIdxBuf, "uint32");
    pass.drawIndexed(creIndexCount, N);

    // cat companion: single CPU-driven follower, opaque, lit like creatures (sky+fog, no
    // shadow map). Drawn after creatures so it shares the depth buffer (terrain occludes it),
    // before plants/water. No-op when disabled.
    if (cat) cat.draw(pass, skyState);

    // plants after creatures, before water: opaque cutout foliage, depth-tested AND
    // depth-writing, so water correctly blends over any submerged stems and creatures
    // occlude/are occluded by plants. No-op when the plant system is disabled.
    if (plants) plants.draw(pass, skyState, time);

    // water last: alpha-blended over opaque terrain/creatures, depth-tested but not written
    pass.setPipeline(waterPipe);
    pass.setBindGroup(0, waterBG);
    pass.draw(6);

    // rain after water: also alpha-blended + depth-tested/no-write. No-ops when it isn't
    // raining. Records into this same pass so it shares the depth buffer (drops occlude
    // behind terrain). Billboarding is per-drop in the VS, so no camera-right needed here.
    if (rain) rain.draw(pass, skyState, width / height);

    pass.end();
  }

  // Read the baked heightfield back to the CPU (once per world build). Row-major
  // heights[z*gridN + x]. The player samples THIS so it walks the exact rendered terrain.
  async function readHeights(){
    const bytes = gridN*gridN*4;
    const rb = device.createBuffer({ size: bytes,
      usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ });
    const enc = device.createCommandEncoder();
    enc.copyBufferToBuffer(heights, 0, rb, 0, bytes);
    device.queue.submit([enc.finish()]);
    await rb.mapAsync(GPUMapMode.READ);
    const data = new Float32Array(rb.getMappedRange().slice(0));
    rb.unmap(); rb.destroy?.();
    return { data, gridN };
  }

  function setWaterLevel(y) { currentWaterLevel = y; }

  return {
    render, setCamera, setSky, setFog, setWaterLevel,
    bakeShadow, setShadow, setShadowResolution,
    heights, readHeights, terrainParams:tpBuf, gridN, amplitude,
    waterLevel: resolvedWaterLevel,
    // exposed so weather (rain) and plants can bind the same Camera + Sky + Fog uniforms read-only.
    camBuf, skyBuf, fogBuf,
  };
}

// ===========================================================================
// PLANTS — GPU-resident instanced billboard foliage. Shader (PLANT_RENDER) lives in
// world_wgsl.js; this is the host factory. Reuses the renderer's Camera/Sky/Fog uniforms
// read-only (pass them via camBuf/skyBuf/fogBuf, same as rain).
// ===========================================================================
export function createPlants(device, format, {
  camBuf,                 // renderer Camera uniform (144 B) — reused read-only
  skyBuf,                 // renderer SkyParams uniform (112 B) — reused read-only
  fogBuf,                 // renderer FogParams uniform (16 B) — reused read-only
  worldMin, worldMax,     // [x,y,z] world bounds (placement domain)
  count = 20000,          // fixed plant population
  clusters = 48,          // number of seed clusters; plants scatter around these
  clusterRadius = 220,    // world-units spread of a cluster
  height = 2,             // base billboard height (per-plant varied in the VS)
  width = 7,              // base billboard half-width
  sway = 3.2,             // wind sway amplitude at the tip (world units)
  maxWaterLevel = -1e30,  // (reserved) underwater culling deferred to growth
  seed = 1,
}) {
  // plant buffer. STORAGE (grid reads it) | VERTEX (instanced draw) | COPY_DST (seed).
  const plantBuf = device.createBuffer({
    size: Math.max(count, 1) * 16,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
  });

  // deterministic RNG independent of the creature/rain seed streams.
  function makeRng(s0) {
    let s = (s0 * 2654435761) >>> 0;
    return () => { s = (Math.imul(s ^ (s >>> 15), 2246822519)) >>> 0; return s / 4294967296; };
  }

  // Reused scratch for the seed upload (allocated once; re-placement after the async
  // heightfield arrives reuses it rather than re-allocating).
  const initScratch = new Float32Array(Math.max(count, 1) * 4);

  // Precompute cluster centers once (deterministic). Plants scatter around a random center
  // each — the static form of the "clustering" the growth pass will later reinforce.
  const spanX = worldMax[0] - worldMin[0];
  const spanZ = worldMax[2] - worldMin[2];
  const rng = makeRng(seed + 0x51ed);
  const centers = new Float32Array(clusters * 2);
  for (let c = 0; c < clusters; c++) {
    centers[c * 2 + 0] = worldMin[0] + rng() * spanX;
    centers[c * 2 + 1] = worldMin[2] + rng() * spanZ;
  }

  // place(sampleHeight): fill the buffer with clustered, ground-baked positions.
  // sampleHeight(x,z) -> terrain world Y. If omitted, flat scatter at y=worldMin[1].
  let placed = false;
  function place(sampleHeight) {
    const prng = makeRng(seed + 1);
    for (let i = 0; i < count; i++) {
      // pick a cluster, then a gaussian-ish offset (two uniforms averaged) around it.
      const cc = (Math.min(clusters - 1, (prng() * clusters) | 0)) * 2;
      const ang = prng() * Math.PI * 2;
      const rr = (prng() * 0.5 + prng() * 0.5) * clusterRadius; // triangular -> denser center
      let x = centers[cc + 0] + Math.cos(ang) * rr;
      let z = centers[cc + 1] + Math.sin(ang) * rr;
      // clamp inside the world so grid cellCoord never sees out-of-range XZ.
      x = Math.min(worldMax[0], Math.max(worldMin[0], x));
      z = Math.min(worldMax[2], Math.max(worldMin[2], z));

      const y = sampleHeight ? sampleHeight(x, z) : worldMin[1];

      initScratch[i * 4 + 0] = x;
      initScratch[i * 4 + 1] = y;
      initScratch[i * 4 + 2] = z;
      initScratch[i * 4 + 3] = prng();   // per-plant seed (size/phase/tint)
    }
    device.queue.writeBuffer(plantBuf, 0, initScratch);
    placed = true;
  }
  place(null);   // immediate fallback scatter so a draw before place(withHeights) is valid.

  // PlantDraw uniform. Static fields written once; writeDraw refreshes tint + time.
  const pdBuf = device.createBuffer({ size: 64, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
  const pdScratch = new Float32Array(16);
  pdScratch[7] = height;   // .height
  pdScratch[8] = width;    // .width
  pdScratch[9] = sway;     // .sway
  function writeDraw(time, sunVisible) {
    const day = 0.35 + 0.65 * Math.max(0, Math.min(1, sunVisible)); // dimmed a touch at night
    pdScratch[0] = 0.16 * day; pdScratch[1] = 0.42 * day; pdScratch[2] = 0.14 * day; // colA
    pdScratch[3] = time;                                                             // .time
    pdScratch[4] = 0.45 * day; pdScratch[5] = 0.52 * day; pdScratch[6] = 0.20 * day; // colB
    device.queue.writeBuffer(pdBuf, 0, pdScratch);
  }

  // render pipeline: instanced crossed billboards, opaque (depth test + write), cutout alpha
  // via discard. Drawn after creatures, before water.
  const drawBGL = device.createBindGroupLayout({ entries: [
    { binding: 0, visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT, buffer: { type: "uniform" } }, // Camera
    { binding: 1, visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT, buffer: { type: "uniform" } }, // PlantDraw
    { binding: 2, visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT, buffer: { type: "uniform" } }, // Sky
    { binding: 3, visibility: GPUShaderStage.FRAGMENT,                        buffer: { type: "uniform" } }, // Fog
  ]});
  const drawBG = device.createBindGroup({ layout: drawBGL, entries: [
    { binding: 0, resource: { buffer: camBuf } },
    { binding: 1, resource: { buffer: pdBuf } },
    { binding: 2, resource: { buffer: skyBuf } },
    { binding: 3, resource: { buffer: fogBuf } },
  ]});
  const drawMod = device.createShaderModule({ code: PLANT_RENDER });
  const drawPipe = device.createRenderPipeline({
    layout: device.createPipelineLayout({ bindGroupLayouts: [drawBGL] }),
    vertex: { module: drawMod, entryPoint: "vs", buffers: [
      { arrayStride: 16, stepMode: "instance", attributes: [
        { shaderLocation: 0, offset: 0, format: "float32x4" },   // inst pos.xyz + seed.w
      ]},
    ]},
    fragment: { module: drawMod, entryPoint: "fs", targets: [{ format }] },
    primitive: { topology: "triangle-list", cullMode: "none" },   // double-sided cards
    depthStencil: { format: "depth24plus", depthWriteEnabled: true, depthCompare: "less" },
  });

  // HUD-controlled toggle. When off, draw() is a no-op but the buffer still exists so a
  // plant grid (if built) stays consistent.
  let enabled = true;
  function setEnabled(v) { enabled = !!v; return enabled; }

  // record the draw into the caller's already-open render pass. `time` drives the sway phase.
  function draw(pass, sky, time) {
    if (!enabled || count === 0) return;
    writeDraw(time, sky?.sunVisible ?? 1);
    pass.setPipeline(drawPipe);
    pass.setBindGroup(0, drawBG);
    pass.setVertexBuffer(0, plantBuf);
    pass.draw(12, count);   // 2 crossed quads, one instance per plant
  }

  return {
    draw, place, setEnabled,
    get enabled() { return enabled; },
    get placed() { return placed; },
    buffers: { plants: plantBuf, draw: pdBuf },
    count,
  };
}

// ===========================================================================
// CAT COMPANION — a single first-person follower ("Nibbler"). NOT a GPU-simulated
// population: exactly one object whose follow state lives on the CPU. Host-side
// bookkeeping (a follow state machine) + one per-frame uniform write (model matrix + tint)
// + one non-instanced draw recorded into the renderer's main pass, after creatures.
//
// Mesh (buildCatMesh) is baked in mesh.js and consumes the SAME vertex layout as the
// creature pipeline (pos+nrm) plus a tint stream. Shader (CAT_RENDER) lives in world_wgsl.js.
//
// Ground follows the SAME baked heightfield the player samples (bilinear, via setTerrain),
// NOT a re-evaluated noise: WGSL fp32 and JS fp64 diverge as world coords grow, which buries
// walkers. Sampling the identical grid identically => the cat stands on exactly the rendered
// terrain, same as player.js.
// ===========================================================================

// Bilinear heightfield sample — identical to player.js sampleHeight so the cat and the
// player agree on the ground exactly. tp: { heights, gridN, worldMin:[x,z], worldMax:[x,z] }.
function catSampleHeight(tp, wx, wz) {
  const clampf = (v, a, b) => (v < a ? a : v > b ? b : v);
  const mixf = (a, b, t) => a + (b - a) * t;
  if (!tp || !tp.heights) return 0;
  const g = tp.gridN;
  const spanX = tp.worldMax[0] - tp.worldMin[0];
  const spanZ = tp.worldMax[1] - tp.worldMin[1];
  let fx = (wx - tp.worldMin[0]) / spanX * (g - 1);
  let fz = (wz - tp.worldMin[1]) / spanZ * (g - 1);
  fx = clampf(fx, 0, g - 1);
  fz = clampf(fz, 0, g - 1);
  const x0 = Math.floor(fx), z0 = Math.floor(fz);
  const x1 = Math.min(x0 + 1, g - 1), z1 = Math.min(z0 + 1, g - 1);
  const tx = fx - x0, tz = fz - z0;
  const h = tp.heights;
  const h00 = h[z0 * g + x0], h10 = h[z0 * g + x1];
  const h01 = h[z1 * g + x0], h11 = h[z1 * g + x1];
  return mixf(mixf(h00, h10, tx), mixf(h01, h11, tx), tz);
}

// createCat(device, format, opts) -> {
//   update(dt, playerPos, playerYaw), draw(pass, sky), setTerrain(tp),
//   setEnabled(b), get enabled, get position, get yaw, placeBehindPlayer, buffers
// }
// opts:
//   camBuf, skyBuf, fogBuf : renderer uniforms, reused read-only (from createRenderer)
//   terrain                : { heights, gridN, worldMin:[x,z], worldMax:[x,z] } or null
//   worldWidth, worldHeight: world span for toroidal wrap (defaults from terrain bounds)
//   scale                  : world size multiplier (default 0.35; local mesh is ~14 wide)
//   followDist, catchUpDist, backAwayDist : follow tuning (world units)
export function createCat(device, format, {
  camBuf, skyBuf, fogBuf,
  terrain = null,
  worldWidth = null, worldHeight = null,
  scale = 0.35,
  followDist = 26,
  catchUpDist = 90,
  backAwayDist = 4,
  eyeHeight = 0.0,   // extra lift above terrain for the paws (0 = feet exactly on ground)
  waterLevel = -1e30, // world Y of the water plane; default off (no water so terrain always wins)
  floatDepth = 0.0,   // how far below the surface the floating body sits (matches the MOVE pass)
} = {}) {
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const mixf = (a, b, t) => a + (b - a) * t;

  const mesh = buildCatMesh();

  const vtxBuf = device.createBuffer({ size: mesh.vertexData.byteLength, usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST });
  device.queue.writeBuffer(vtxBuf, 0, mesh.vertexData);
  const tintBuf = device.createBuffer({ size: mesh.tintData.byteLength, usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST });
  device.queue.writeBuffer(tintBuf, 0, mesh.tintData);
  const idxBuf = device.createBuffer({ size: mesh.indexData.byteLength, usage: GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST });
  device.queue.writeBuffer(idxBuf, 0, mesh.indexData);

  // CatDraw uniform: model(64) + normalM(64) + eyeBoost+pad(16) = 144 bytes.
  const cdBuf = device.createBuffer({ size: 144, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
  const cdScratch = new Float32Array(36);   // reused every frame, no per-frame allocation

  const bgl = device.createBindGroupLayout({ entries: [
    { binding: 0, visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT, buffer: { type: "uniform" } }, // Camera
    { binding: 1, visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT, buffer: { type: "uniform" } }, // CatDraw
    { binding: 2, visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT, buffer: { type: "uniform" } }, // Sky
    { binding: 3, visibility: GPUShaderStage.FRAGMENT,                         buffer: { type: "uniform" } }, // Fog
  ]});
  const bg = device.createBindGroup({ layout: bgl, entries: [
    { binding: 0, resource: { buffer: camBuf } },
    { binding: 1, resource: { buffer: cdBuf } },
    { binding: 2, resource: { buffer: skyBuf } },
    { binding: 3, resource: { buffer: fogBuf } },
  ]});
  const mod = device.createShaderModule({ code: CAT_RENDER });
  const pipe = device.createRenderPipeline({
    layout: device.createPipelineLayout({ bindGroupLayouts: [bgl] }),
    vertex: { module: mod, entryPoint: "vs", buffers: [
      { arrayStride: 24, stepMode: "vertex", attributes: [
        { shaderLocation: 0, offset: 0,  format: "float32x3" },   // pos
        { shaderLocation: 1, offset: 12, format: "float32x3" },   // nrm
      ]},
      { arrayStride: 12, stepMode: "vertex", attributes: [
        { shaderLocation: 2, offset: 0, format: "float32x3" },    // tint
      ]},
    ]},
    fragment: { module: mod, entryPoint: "fs", targets: [{ format }] },
    primitive: { topology: "triangle-list", cullMode: "none" },   // low-poly, keep both sides
    depthStencil: { format: "depth24plus", depthWriteEnabled: true, depthCompare: "less" },
  });

  // ---- world bounds for wrap ----
  let tp = terrain;
  function boundsFromTerrain() {
    if (tp && tp.worldMin && tp.worldMax) {
      return {
        minX: tp.worldMin[0], minZ: tp.worldMin[1],
        w: tp.worldMax[0] - tp.worldMin[0], h: tp.worldMax[1] - tp.worldMin[1],
      };
    }
    return { minX: 0, minZ: 0, w: worldWidth || 1, h: worldHeight || 1 };
  }

  // ---- follow state (ported from the Three.js updateCat) ----
  const state = {
    x: 0, y: 0, z: 0,
    yaw: 0,
    vy: 0,
    animTime: 0,
    speed: 0,
    placed: false,
  };
  // effective ground = higher of the terrain surface and the water plane (offset down by
  // floatDepth). Same rule as the creature MOVE pass: where terrain dips below water, the cat
  // rides ON the water rather than sinking to the submerged floor; elsewhere it walks the land.
  // Player deliberately has NO float term, so it wades/sinks instead of floating.
  let waterY = waterLevel;
  function groundY(x, z) { return Math.max(catSampleHeight(tp, x, z), waterY - floatDepth); }

  function placeBehindPlayer(px, pz, pyaw) {
    state.x = px - Math.sin(pyaw) * followDist;
    state.z = pz - Math.cos(pyaw) * followDist;
    state.y = groundY(state.x, state.z) + eyeHeight;
    state.yaw = pyaw;
    state.vy = 0;
    state.placed = true;
  }

  // setTerrain(newTp, newWaterLevel?): rebind the heightfield (and optionally the water plane,
  // whose seed-derived level can change on a world rebuild), then re-ground in place.
  function setTerrain(newTp, newWaterLevel) {
    tp = newTp;
    if (newWaterLevel !== undefined) waterY = newWaterLevel;
    if (state.placed) state.y = groundY(state.x, state.z) + eyeHeight;
  }

  // shortest signed angular difference a->b in (-pi,pi]
  function angDelta(a, b) {
    let d = (b - a) % (Math.PI * 2);
    if (d > Math.PI) d -= Math.PI * 2;
    if (d < -Math.PI) d += Math.PI * 2;
    return d;
  }

  const GRAVITY = 260;   // matches player.js gravity scale

  // update(dt, playerPos, playerYaw): playerPos = {x,y,z} (or [x,y,z]); playerYaw in radians.
  function update(dt, playerPos, playerYaw) {
    if (!enabled) return;
    const px = Array.isArray(playerPos) ? playerPos[0] : playerPos.x;
    const pz = Array.isArray(playerPos) ? playerPos[2] : playerPos.z;

    if (!state.placed) placeBehindPlayer(px, pz, playerYaw || 0);

    state.animTime += dt;

    const dx = px - state.x, dz = pz - state.z;
    const distToPlayer = Math.hypot(dx, dz);
    let speed = 0;

    if (distToPlayer > catchUpDist) {
      // too far behind: recycle next to the player (like the rain pool bracketing the camera)
      placeBehindPlayer(px, pz, playerYaw || state.yaw);
    } else if (distToPlayer > followDist) {
      // chase: quantized heading gives a slightly stepped, less twitchy track (as in the port)
      speed = distToPlayer > followDist * 1.6 ? 80 : 25;
      const dxr = Math.round(dx / 2) * 2, dzr = Math.round(dz / 2) * 2;
      const target = Math.atan2(dxr, dzr);
      state.yaw += angDelta(state.yaw, target) * Math.min(1, dt * 6);
      state.x += Math.sin(state.yaw) * speed * dt;
      state.z += Math.cos(state.yaw) * speed * dt;
    } else if (distToPlayer < backAwayDist) {
      // too close: back away so it doesn't clip into the camera
      speed = 20;
      const target = Math.atan2(-dx, -dz);
      state.yaw += angDelta(state.yaw, target) * Math.min(1, dt * 5);
      state.x += Math.sin(state.yaw) * speed * dt;
      state.z += Math.cos(state.yaw) * speed * dt;
    } else {
      // idle: face the player, no wandering
      const face = Math.atan2(dx, dz);
      state.yaw += angDelta(state.yaw, face) * Math.min(1, dt * 2);
    }
    state.speed = speed;

    // gravity + clamp against the effective floor (terrain OR water surface, whichever is
    // higher — see groundY). Over deep water this floors at the float line so the cat rides
    // on top rather than sinking to the submerged terrain.
    state.vy -= GRAVITY * dt;
    state.y += state.vy * dt;
    const floor = groundY(state.x, state.z) + eyeHeight;
    if (state.y <= floor) { state.y = floor; state.vy = 0; }

    // toroidal world wrap (matches gpuverse terrain domain)
    const B = boundsFromTerrain();
    state.x = ((state.x - B.minX) % B.w + B.w) % B.w + B.minX;
    state.z = ((state.z - B.minZ) % B.h + B.h) % B.h + B.minZ;
  }

  // Compose the model matrix (column-major, matching mat.js) = T * Ry * S, and its normal
  // matrix (rotation only — uniform scale, so no inverse-transpose needed). Written into the
  // reused scratch; one writeBuffer per frame.
  function writeDraw(sky) {
    const c = Math.cos(state.yaw), s = Math.sin(state.yaw);
    const sc = scale;
    // The follow logic sets yaw via atan2(dx,dz) and steps by (sin yaw, cos yaw), so the cat
    // TRAVELS along world (sin yaw, cos yaw) in XZ. The mesh nose is local +X, so we map
    // local +X -> world (sin,0,cos) to keep the body aligned with travel. Local +Z (right)
    // is then the perpendicular (cos,0,-sin). Column-major columns [c0|c1|c2|c3].
    const model = [
       s*sc, 0,   c*sc, 0,   // col0: local +X (nose) -> world (sin,0,cos) = travel dir
       0,    sc,  0,    0,   // col1: local +Y -> world up
      -c*sc, 0,   s*sc, 0,   // col2: local +Z (right) -> world (-cos,0,sin), right-handed
       state.x, state.y, state.z, 1,   // col3: translation
    ];
    const normalM = [
       s, 0,  c, 0,
       0, 1,  0, 0,
      -c, 0,  s, 0,
       0, 0,  0, 1,
    ];
    cdScratch.set(model, 0);
    cdScratch.set(normalM, 16);
    // brighter eye self-emission at night so the glow reads; fades out in daylight.
    const sunVis = sky?.sunVisible ?? 1;
    cdScratch[32] = mixf(0.9, 0.2, clamp(sunVis, 0, 1));
    cdScratch[33] = 0; cdScratch[34] = 0; cdScratch[35] = 0;
    device.queue.writeBuffer(cdBuf, 0, cdScratch);
  }

  let enabled = true;
  function setEnabled(v) { enabled = !!v; return enabled; }

  // record the draw into the caller's already-open main pass (after creatures, before water).
  function draw(pass, sky) {
    if (!enabled) return;
    writeDraw(sky);
    pass.setPipeline(pipe);
    pass.setBindGroup(0, bg);
    pass.setVertexBuffer(0, vtxBuf);
    pass.setVertexBuffer(1, tintBuf);
    pass.setIndexBuffer(idxBuf, "uint32");
    pass.drawIndexed(mesh.indexCount);
  }

  return {
    update, draw, setTerrain, setEnabled, placeBehindPlayer,
    get enabled() { return enabled; },
    get position() { return { x: state.x, y: state.y, z: state.z }; },
    get yaw() { return state.yaw; },
    buffers: { vtx: vtxBuf, tint: tintBuf, idx: idxBuf, draw: cdBuf },
    indexCount: mesh.indexCount,
  };
}