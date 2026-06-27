// renderer.js: WebGPU render system. Reads the positions GPUBuffer directly as
// instance data (no CPU round-trip). Bakes a heightfield once on GPU; draws sky,
// terrain (indexed grid), instanced creatures, and a blended water plane.
import { TERRAIN_BAKE, TERRAIN_RENDER, CREATURE_RENDER, WATER_RENDER } from "./world_wgsl.js";
import { SKY_RENDER } from "./sky.js";
import { perspective, lookAt, mul, invertMat4 } from "./mat.js";

export function createRenderer(device, context, format, {
  worldMin, worldMax,            // [x,y,z]
  gridN = 256,                   // terrain resolution per side
  amplitude = 40,                // max terrain height
  seed = 7,
  creatureRadius = 1.5,
  mountainThreshold = 0.55,      // biome-mask cutoff (0..1) above which mountains blend in
  waterLevel = null,             // world Y of the water plane; null = derive from seed
}) {
  const wXZmin = [worldMin[0], worldMin[2]];
  const wXZmax = [worldMax[0], worldMax[2]];

  // Seed-derived water level: deterministic fraction of amplitude so different seeds
  // get different lake levels. Local hash to avoid wiring in the host RNG for one scalar.
  function hashSeedTo01(s) {
    let x = Math.sin(s * 12.9898) * 43758.5453;
    x = x - Math.floor(x);
    return x;
  }
  const resolvedWaterLevel = waterLevel ?? (amplitude * (0.08 + 0.10 * hashSeedTo01(seed + 0.37)));

  // TerrainParams uniform (std140: vec2,vec2,u32,f32,f32,f32 -> 32 bytes)
  const tpBuf = device.createBuffer({ size: 32, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
  {
    const f = new Float32Array(8), u = new Uint32Array(f.buffer);
    f[0]=wXZmin[0]; f[1]=wXZmin[1]; f[2]=wXZmax[0]; f[3]=wXZmax[1];
    u[4]=gridN; f[5]=amplitude; f[6]=seed; f[7]=mountainThreshold;
    device.queue.writeBuffer(tpBuf, 0, f);
  }

  // SkyParams uniform (80 bytes: 5x vec4-aligned slots)
  const skyBuf = device.createBuffer({ size: 80, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
  const skyScratch = new Float32Array(16);
  function setSky(sky) {
    skyScratch[0]=sky.sunDir[0];    skyScratch[1]=sky.sunDir[1];    skyScratch[2]=sky.sunDir[2];    skyScratch[3]=0;
    skyScratch[4]=sky.sunColor[0];  skyScratch[5]=sky.sunColor[1];  skyScratch[6]=sky.sunColor[2];  skyScratch[7]=0;
    skyScratch[8]=sky.skyTop[0];    skyScratch[9]=sky.skyTop[1];    skyScratch[10]=sky.skyTop[2];   skyScratch[11]=0;
    skyScratch[12]=sky.skyBottom[0];skyScratch[13]=sky.skyBottom[1];skyScratch[14]=sky.skyBottom[2];skyScratch[15]=sky.sunVisible;
    device.queue.writeBuffer(skyBuf, 0, skyScratch);
    device.queue.writeBuffer(skyBuf, 64, new Float32Array([sky.ambient[0], sky.ambient[1], sky.ambient[2], 0]));
  }

  // FogParams uniform (16 bytes: vec3 + f32)
  const fogBuf = device.createBuffer({ size: 16, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
  function setFog(fogColor, fogDist) {
    device.queue.writeBuffer(fogBuf, 0, new Float32Array([fogColor[0], fogColor[1], fogColor[2], fogDist]));
  }

  // height buffer + bake pipeline
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

  // bake once now
  {
    const enc = device.createCommandEncoder();
    const p = enc.beginComputePass();
    p.setPipeline(bakePipe); p.setBindGroup(0,bakeBG);
    const g = Math.ceil(gridN/8);
    p.dispatchWorkgroups(g, g);
    p.end();
    device.queue.submit([enc.finish()]);
  }

  // terrain index buffer (triangle list over the vertex grid)
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

  // sky render pipeline (drawn first, no depth test/write)
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

  // terrain render pipeline
  const terrBGL = device.createBindGroupLayout({ entries:[
    {binding:0,visibility:GPUShaderStage.VERTEX|GPUShaderStage.FRAGMENT,buffer:{type:"uniform"}},
    {binding:1,visibility:GPUShaderStage.VERTEX|GPUShaderStage.FRAGMENT,buffer:{type:"uniform"}},
    {binding:2,visibility:GPUShaderStage.VERTEX,buffer:{type:"read-only-storage"}},
    {binding:3,visibility:GPUShaderStage.FRAGMENT,buffer:{type:"uniform"}},
    {binding:4,visibility:GPUShaderStage.FRAGMENT,buffer:{type:"uniform"}},
  ]});
  const terrBG = device.createBindGroup({layout:terrBGL,entries:[
    {binding:0,resource:{buffer:camBuf}},
    {binding:1,resource:{buffer:tpBuf}},
    {binding:2,resource:{buffer:heights}},
    {binding:3,resource:{buffer:skyBuf}},
    {binding:4,resource:{buffer:fogBuf}},
  ]});
  const terrMod = device.createShaderModule({code:TERRAIN_RENDER});
  const terrPipe = device.createRenderPipeline({
    layout: device.createPipelineLayout({bindGroupLayouts:[terrBGL]}),
    vertex:{module:terrMod,entryPoint:"vs"},
    fragment:{module:terrMod,entryPoint:"fs",targets:[{format}]},
    primitive:{topology:"triangle-list",cullMode:"none"},
    depthStencil:{format:"depth24plus",depthWriteEnabled:true,depthCompare:"less"},
  });

  // creature render pipeline (instanced; positions buffer is instance-step)
  const sizeBuf = device.createBuffer({ size:16, usage:GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST });
  device.queue.writeBuffer(sizeBuf,0,new Float32Array([creatureRadius,0,0,0]));
  const creBGL = device.createBindGroupLayout({ entries:[
    // CAM read by vs (billboard) and fs (fog uses CAM.eye), so VERTEX|FRAGMENT.
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
    vertex:{module:creMod,entryPoint:"vs", buffers:[{
      arrayStride:16, stepMode:"instance",
      attributes:[{shaderLocation:0,offset:0,format:"float32x4"}],
    }]},
    fragment:{module:creMod,entryPoint:"fs",targets:[{format}]},
    primitive:{topology:"triangle-list",cullMode:"none"},
    depthStencil:{format:"depth24plus",depthWriteEnabled:true,depthCompare:"less"},
  });

  // water render pipeline (alpha-blended, drawn after opaque geometry)
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

  // depth texture (recreated on resize)
  let depth = null, dw=0, dh=0;
  function ensureDepth(width,height){
    if(depth && dw===width && dh===height) return;
    depth?.destroy?.();
    depth = device.createTexture({ size:[width,height],
      format:"depth24plus", usage:GPUTextureUsage.RENDER_ATTACHMENT });
    dw=width; dh=height;
  }

  // camera update from orbit params
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

  // per-frame draw. positions = the compute positions buffer, N = entity count
  // `time` drives the water animation; pass simTime from the host loop.
  function render(encoder, positions, N, width, height, time = 0){
    ensureDepth(width,height);
    writeWaterParams(time);

    const pass = encoder.beginRenderPass({
      colorAttachments:[{ view: context.getCurrentTexture().createView(),
        clearValue:{r:0.05,g:0.07,b:0.1,a:1}, loadOp:"clear", storeOp:"store" }],
      depthStencilAttachment:{ view: depth.createView(),
        depthClearValue:1.0, depthLoadOp:"clear", depthStoreOp:"store" },
    });

    // sky first: full-screen backdrop, no depth test/write
    pass.setPipeline(skyPipe);
    pass.setBindGroup(0, skyBG);
    pass.draw(3);

    pass.setPipeline(terrPipe);
    pass.setBindGroup(0, terrBG);
    pass.setIndexBuffer(terrIndexBuf, "uint32");
    pass.drawIndexed(terrIndexCount);

    pass.setPipeline(crePipe);
    pass.setBindGroup(0, creBG);
    pass.setVertexBuffer(0, positions);
    pass.draw(6, N);            // 6 verts per quad, N instances

    // water last: alpha-blended over opaque terrain/creatures, depth-tested but not written
    pass.setPipeline(waterPipe);
    pass.setBindGroup(0, waterBG);
    pass.draw(6);

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
    heights, readHeights, terrainParams:tpBuf, gridN, amplitude,
    waterLevel: resolvedWaterLevel,
  };
}
