// verify.js — correctness check. NOT part of the hot path. Reads grid buffers back
// once for a small N and compares against a CPU reference. Run in a WebGPU page.
import { createGrid } from "./grid.js";

export async function verify(device, N = 1000) {
  const worldMin=[0,0,0], worldMax=[100,100,100], cellSize=10; // 10x10x10 = 1000 cells
  // include nasty inputs: exactly-on-max, slightly-below-min, a NaN, a huge value
  const pos = new Float32Array(N*4);
  for (let i=0;i<N;i++){
    pos[i*4+0]=Math.random()*100; pos[i*4+1]=Math.random()*100; pos[i*4+2]=Math.random()*100;
  }
  pos.set([100,100,100,0], 0);              // on worldMax -> must clamp to cell (9,9,9)
  pos.set([-5,-5,-5,0], 4);                 // below min  -> cell (0,0,0)
  pos.set([NaN, 50, 50, 0], 8);             // NaN x      -> x cell 0
  pos.set([1e30, 50, 50, 0], 12);           // +inf-ish   -> clamp to x=9

  const positions = device.createBuffer({ size: pos.byteLength,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST });
  device.queue.writeBuffer(positions, 0, pos);

  const grid = createGrid(device, { N, positions, worldMin, worldMax, cellSize, allowReadback:true });

  const enc = device.createCommandEncoder();
  grid.buildFrame(enc);

  // copy grid buffers to readback buffers (verification only)
  const rb = (buf,bytes)=>{ const r=device.createBuffer({size:bytes,
    usage:GPUBufferUsage.COPY_DST|GPUBufferUsage.MAP_READ}); enc.copyBufferToBuffer(buf,0,r,0,bytes); return r; };
  const rCount = rb(grid.buffers.cellCount, grid.totalCells*4);
  const rStart = rb(grid.buffers.cellStart, grid.totalCells*4);
  const rSorted= rb(grid.buffers.sortedIdx, N*4);
  device.queue.submit([enc.finish()]);

  await Promise.all([rCount.mapAsync(1), rStart.mapAsync(1), rSorted.mapAsync(1)]);
  const gpuCount=new Uint32Array(rCount.getMappedRange().slice(0));
  const gpuStart=new Uint32Array(rStart.getMappedRange().slice(0));
  const gpuSorted=new Uint32Array(rSorted.getMappedRange().slice(0));

  // ---- CPU reference ----
  const [gx,gy,gz]=grid.gridDims;
  const clampCell=(v,min,size,g)=>{
    if(!(v===v)) v=min;                         // NaN -> min
    let c=Math.floor((v-min)/size);
    return Math.min(Math.max(c,0),g-1);
  };
  const refCount=new Uint32Array(grid.totalCells);
  const cellOf=new Uint32Array(N);
  for(let i=0;i<N;i++){
    const cx=clampCell(pos[i*4],worldMin[0],cellSize,gx);
    const cy=clampCell(pos[i*4+1],worldMin[1],cellSize,gy);
    const cz=clampCell(pos[i*4+2],worldMin[2],cellSize,gz);
    const c=cx+gx*(cy+gy*cz); cellOf[i]=c; refCount[c]++;
  }
  const refStart=new Uint32Array(grid.totalCells);
  for(let c=1;c<grid.totalCells;c++) refStart[c]=refStart[c-1]+refCount[c-1];

  let ok=true, msgs=[];
  for(let c=0;c<grid.totalCells;c++){
    if(gpuCount[c]!==refCount[c]){ok=false;msgs.push(`count[${c}] gpu=${gpuCount[c]} ref=${refCount[c]}`);}
    if(gpuStart[c]!==refStart[c]){ok=false;msgs.push(`start[${c}] gpu=${gpuStart[c]} ref=${refStart[c]}`);}
  }
  // every entity must appear exactly once, in its own cell's [start,start+count) slice
  const seen=new Uint8Array(N);
  for(let c=0;c<grid.totalCells;c++){
    for(let s=gpuStart[c];s<gpuStart[c]+gpuCount[c];s++){
      const e=gpuSorted[s];
      if(cellOf[e]!==c){ok=false;msgs.push(`entity ${e} placed in cell ${c}, belongs in ${cellOf[e]}`);}
      seen[e]++;
    }
  }
  for(let i=0;i<N;i++) if(seen[i]!==1){ok=false;msgs.push(`entity ${i} seen ${seen[i]}x`);}

  console.log(ok?`PASS: ${N} entities sorted correctly`:`FAIL:\n`+msgs.slice(0,20).join("\n"));
  return ok;
}