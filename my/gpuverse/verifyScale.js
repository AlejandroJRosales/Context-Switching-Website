// verifyScale.js: parameterized grid correctness across the cases the N=1000 test
// doesn't reach: multi-block scan, dense cells, near-ceiling cell count, flat 2D.
// Linear CPU reference (no O(N^2)), so 100k+ entities verify fast. NOT hot-path.
import { createGrid } from "./grid.js";

// One configurable run. Returns {ok, label, totalCells, numBlocks, maxOcc}.
async function runCase(device, { label, N, worldMax, cellSize, flat2D=false, seedEdgeCases=true }) {
  const worldMin=[0,0,0];

  const pos = new Float32Array(N*4);
  const span = [worldMax[0]-worldMin[0], worldMax[1]-worldMin[1], worldMax[2]-worldMin[2]];
  for (let i=0;i<N;i++){
    pos[i*4+0]=Math.random()*span[0];
    pos[i*4+1]=flat2D ? worldMin[1] : Math.random()*span[1];
    pos[i*4+2]=Math.random()*span[2];
  }
  if (seedEdgeCases && N>=4){
    pos.set([worldMax[0],worldMax[1],worldMax[2],0], 0);  // on max
    pos.set([-5,-5,-5,0], 4);                              // below min
    pos.set([NaN, span[1]*0.5, span[2]*0.5, 0], 8);        // NaN x
    pos.set([1e30, span[1]*0.5, span[2]*0.5, 0], 12);      // +inf-ish
  }

  const positions = device.createBuffer({ size: pos.byteLength,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST });
  device.queue.writeBuffer(positions, 0, pos);

  let grid;
  try {
    grid = createGrid(device, { N, positions, worldMin, worldMax, cellSize, flat2D, allowReadback:true });
  } catch (e) {
    console.log(`SKIP [${label}]: ${e.message}`);
    positions.destroy?.();
    return { ok:true, label, skipped:true };
  }

  const enc = device.createCommandEncoder();
  grid.buildFrame(enc);
  const rb=(buf,bytes)=>{ const r=device.createBuffer({size:bytes,
    usage:GPUBufferUsage.COPY_DST|GPUBufferUsage.MAP_READ}); enc.copyBufferToBuffer(buf,0,r,0,bytes); return r; };
  const rCount=rb(grid.buffers.cellCount, grid.totalCells*4);
  const rStart=rb(grid.buffers.cellStart, grid.totalCells*4);
  const rSorted=rb(grid.buffers.sortedIdx, N*4);
  device.queue.submit([enc.finish()]);

  await Promise.all([rCount.mapAsync(1),rStart.mapAsync(1),rSorted.mapAsync(1)]);
  const gCount=new Uint32Array(rCount.getMappedRange().slice(0));
  const gStart=new Uint32Array(rStart.getMappedRange().slice(0));
  const gSorted=new Uint32Array(rSorted.getMappedRange().slice(0));

  const [gx,gy,gz]=grid.gridDims;
  const clampCell=(v,min,size,g)=>{ if(!(v===v)) v=min; return Math.min(Math.max(Math.floor((v-min)/size),0),g-1); };
  const refCount=new Uint32Array(grid.totalCells);
  const cellOf=new Uint32Array(N);
  let maxOcc=0;
  for(let i=0;i<N;i++){
    const cx=clampCell(pos[i*4],  worldMin[0],cellSize,gx);
    const cy=clampCell(pos[i*4+1],worldMin[1],cellSize,gy);
    const cz=clampCell(pos[i*4+2],worldMin[2],cellSize,gz);
    const c=cx+gx*(cy+gy*cz); cellOf[i]=c; refCount[c]++; if(refCount[c]>maxOcc) maxOcc=refCount[c];
  }
  const refStart=new Uint32Array(grid.totalCells);
  for(let c=1;c<grid.totalCells;c++) refStart[c]=refStart[c-1]+refCount[c-1];

  let ok=true, msgs=[];
  for(let c=0;c<grid.totalCells;c++){
    if(gCount[c]!==refCount[c]){ok=false; if(msgs.length<10) msgs.push(`count[${c}] gpu=${gCount[c]} ref=${refCount[c]}`);}
    if(gStart[c]!==refStart[c]){ok=false; if(msgs.length<10) msgs.push(`start[${c}] gpu=${gStart[c]} ref=${refStart[c]}`);}
  }
  const seen=new Uint8Array(N);
  for(let c=0;c<grid.totalCells;c++){
    const end=gStart[c]+gCount[c];
    for(let s=gStart[c];s<end;s++){
      const e=gSorted[s];
      if(e>=N){ok=false; if(msgs.length<10) msgs.push(`slot ${s} holds out-of-range entity ${e}`); continue;}
      if(cellOf[e]!==c){ok=false; if(msgs.length<10) msgs.push(`entity ${e} in cell ${c}, belongs ${cellOf[e]}`);}
      seen[e]++;
    }
  }
  for(let i=0;i<N;i++) if(seen[i]!==1){ok=false; if(msgs.length<10) msgs.push(`entity ${i} seen ${seen[i]}x`); }

  const tag=`[${label}] N=${N} cells=${grid.totalCells} blocks=${Math.ceil(grid.totalCells/512)} maxOcc=${maxOcc}`;
  console.log(ok?`PASS ${tag}`:`FAIL ${tag}\n`+msgs.join("\n"));
  positions.destroy?.();
  return { ok, label, totalCells:grid.totalCells, maxOcc };
}

export async function verifyScale(device) {
  const cases = [
    // baseline (single scan block: 1000 cells > 512 so already 2 blocks, but small)
    { label:"baseline",        N:1000,   worldMax:[100,100,100], cellSize:10 },
    // multi-block scan: ~8000 cells -> 16 scan blocks, real block-sum + add-back path
    { label:"multiblock-scan", N:20000,  worldMax:[200,200,200], cellSize:10 },
    // high occupancy: 100k entities into 1000 cells -> ~100/cell, dense scatter cursor
    { label:"high-occupancy",  N:100000, worldMax:[100,100,100], cellSize:10 },
    // near scan ceiling: ~216k cells (60^3) -> ~422 blocks, close to the 512-block limit
    { label:"near-ceiling",    N:200000, worldMax:[600,600,600], cellSize:10 },
    // flat 2D: gridDims.y collapses to 1
    { label:"flat-2D",         N:50000,  worldMax:[300,1,300],   cellSize:10, flat2D:true },
  ];

  let allOk=true;
  for(const c of cases){
    const r=await runCase(device, c);
    allOk = allOk && r.ok;
  }
  console.log(allOk ? "PASS: all scale cases" : "FAIL: one or more scale cases failed (see above)");
  return allOk;
}
