import { TERRAIN_BAKE, TERRAIN_RENDER, CREATURE_RENDER, WATER_RENDER, SHADOW_BAKE } from "./world_wgsl.js";
import { SKY_RENDER } from "./sky.js";
import { perspective, lookAt, mul, invertMat4 } from "./mat.js";
import { buildCreatureMesh } from "./mesh.js";

export function createRenderer(device, context, format, {
  worldMin, worldMax,
  gridN = 256,
  amplitude = 40,
  seed = 7,
  creatureRadius = 1.5,
  mountainThreshold = 0.55,      // biome-mask cutoff (0..1) above which mountains blend in
  waterLevel = null,             // world Y of the water plane; null = derive from seed
  shadowResolution = 1024,       // sun-view depth map size per side (quality-scaled by host).
                                 // Dropped 2048->1024: 4x fewer depth texels to bake and a
                                 // 4x-smaller texture for the terrain PCF taps to sample.

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
  function render(encoder, positions, N, speciesHeading, width, height, time = 0, rain = null, skyState = null){
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

    // water last: alpha-blended over opaque terrain/creatures, depth-tested but not written
    pass.setPipeline(waterPipe);
    pass.setBindGroup(0, waterBG);
    pass.draw(6);

    // rain after water: also alpha-blended + depth-tested/no-write. No-ops when it isn't
    // raining. Records into this same pass so it shares the depth buffer (drops occlude
    // behind terrain). Billboarding is per-drop in the VS, so no camera-right needed here.
    if (rain) rain.draw(pass, skyState);

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
    // exposed so weather (rain) can bind the same Camera + Sky uniforms read-only.
    camBuf, skyBuf,
  };
}