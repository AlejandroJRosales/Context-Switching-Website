// renderer.js — WebGPU render system. Reads the positions GPUBuffer directly as
// instance data; no CPU round-trip. Bakes a heightfield once on GPU, draws terrain
// as an indexed grid mesh, draws creatures as instanced camera-facing quads.
import { TERRAIN_BAKE, TERRAIN_RENDER } from "./terrain_wgsl.js";
import { CREATURE_RENDER } from "./creature_wgsl.js";
import { perspective, lookAt, mul } from "./mat.js";

export function createRenderer(device, context, format, {
  worldMin, worldMax,            // [x,y,z]
  gridN = 256,                   // terrain resolution per side
  amplitude = 40,                // max terrain height
  seed = 7,
  creatureRadius = 1.5,
}) {
  const wXZmin = [worldMin[0], worldMin[2]];
  const wXZmax = [worldMax[0], worldMax[2]];

  // ---- TerrainParams uniform (std140: vec2,vec2,u32,f32,f32,f32 -> 32 bytes) ----
  const tpBuf = device.createBuffer({ size: 32, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
  {
    const f = new Float32Array(8), u = new Uint32Array(f.buffer);
    f[0]=wXZmin[0]; f[1]=wXZmin[1]; f[2]=wXZmax[0]; f[3]=wXZmax[1];
    u[4]=gridN; f[5]=amplitude; f[6]=seed; f[7]=0;
    device.queue.writeBuffer(tpBuf, 0, f);
  }

  // ---- height buffer + bake pipeline ----
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

  // ---- terrain index buffer (triangle list over the vertex grid) ----
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

  // ---- camera uniform: mat4 viewProj (64) + vec3 eye + pad (16) = 80 ----
  const camBuf = device.createBuffer({ size: 80, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });

  // ---- terrain render pipeline ----
  const terrBGL = device.createBindGroupLayout({ entries:[
    {binding:0,visibility:GPUShaderStage.VERTEX|GPUShaderStage.FRAGMENT,buffer:{type:"uniform"}},
    {binding:1,visibility:GPUShaderStage.VERTEX|GPUShaderStage.FRAGMENT,buffer:{type:"uniform"}},
    {binding:2,visibility:GPUShaderStage.VERTEX,buffer:{type:"read-only-storage"}},
  ]});
  const terrBG = device.createBindGroup({layout:terrBGL,entries:[
    {binding:0,resource:{buffer:camBuf}},
    {binding:1,resource:{buffer:tpBuf}},
    {binding:2,resource:{buffer:heights}},
  ]});
  const terrMod = device.createShaderModule({code:TERRAIN_RENDER});
  const terrPipe = device.createRenderPipeline({
    layout: device.createPipelineLayout({bindGroupLayouts:[terrBGL]}),
    vertex:{module:terrMod,entryPoint:"vs"},
    fragment:{module:terrMod,entryPoint:"fs",targets:[{format}]},
    primitive:{topology:"triangle-list",cullMode:"none"},
    depthStencil:{format:"depth24plus",depthWriteEnabled:true,depthCompare:"less"},
  });

  // ---- creature render pipeline (instanced; positions buffer is instance-step) ----
  const sizeBuf = device.createBuffer({ size:16, usage:GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST });
  device.queue.writeBuffer(sizeBuf,0,new Float32Array([creatureRadius,0,0,0]));
  const creBGL = device.createBindGroupLayout({ entries:[
    {binding:0,visibility:GPUShaderStage.VERTEX,buffer:{type:"uniform"}},
    {binding:1,visibility:GPUShaderStage.VERTEX,buffer:{type:"uniform"}},
  ]});
  const creBG = device.createBindGroup({layout:creBGL,entries:[
    {binding:0,resource:{buffer:camBuf}},{binding:1,resource:{buffer:sizeBuf}},
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

  // ---- depth texture (recreated on resize) ----
  let depth = null, dw=0, dh=0;
  function ensureDepth(width,height){
    if(depth && dw===width && dh===height) return;
    depth?.destroy?.();
    depth = device.createTexture({ size:[width,height],
      format:"depth24plus", usage:GPUTextureUsage.RENDER_ATTACHMENT });
    dw=width; dh=height;
  }

  // ---- camera update from orbit params ----
  // camScratch is reused every frame (mat4 viewProj + vec3 eye + pad = 20 floats) so
  // setCamera doesn't allocate a fresh typed array 60x/sec.
  const camScratch = new Float32Array(20);
  function setCamera({eye, target, up=[0,1,0], fovy=Math.PI/3, aspect, near=0.5, far=5000}){
    const view = lookAt(eye, target, up);
    const proj = perspective(fovy, aspect, near, far);
    const vp = mul(proj, view);
    camScratch.set(vp, 0);
    camScratch[16]=eye[0]; camScratch[17]=eye[1]; camScratch[18]=eye[2]; camScratch[19]=0;
    device.queue.writeBuffer(camBuf, 0, camScratch);
  }

  // ---- per-frame draw. positions = the compute positions buffer, N = entity count ----
  function render(encoder, positions, N, width, height){
    ensureDepth(width,height);
    const pass = encoder.beginRenderPass({
      colorAttachments:[{ view: context.getCurrentTexture().createView(),
        clearValue:{r:0.05,g:0.07,b:0.1,a:1}, loadOp:"clear", storeOp:"store" }],
      depthStencilAttachment:{ view: depth.createView(),
        depthClearValue:1.0, depthLoadOp:"clear", depthStoreOp:"store" },
    });

    pass.setPipeline(terrPipe);
    pass.setBindGroup(0, terrBG);
    pass.setIndexBuffer(terrIndexBuf, "uint32");
    pass.drawIndexed(terrIndexCount);

    pass.setPipeline(crePipe);
    pass.setBindGroup(0, creBG);
    pass.setVertexBuffer(0, positions);
    pass.draw(6, N);            // 6 verts per quad, N instances

    pass.end();
  }

  // Read the baked heightfield back to the CPU (once per world build, not per frame).
  // Returns { data:Float32Array(gridN*gridN), gridN } laid out row-major as
  // heights[z*gridN + x], matching the bake shader. The player samples THIS so it
  // walks the exact terrain the renderer draws — no CPU noise recompute, no fp drift.
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

  return { render, setCamera, heights, readHeights, terrainParams:tpBuf, gridN, amplitude };
}