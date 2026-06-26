// verifySense.js: checks sensing output (count, nearest, nearestD2) against an
// O(N^2) CPU reference. NOT hot-path. Run on small N in a WebGPU page.
import { createGrid } from "./grid.js";
import { createSense } from "./sense.js";

export async function verifySense(device, N = 1000, senseRadius = 12) {
  const worldMin=[0,0,0], worldMax=[100,100,100], cellSize=10;

  const pos = new Float32Array(N*4);
  for (let i=0;i<N;i++){
    pos[i*4]=Math.random()*100; pos[i*4+1]=Math.random()*100; pos[i*4+2]=Math.random()*100;
  }
  // a couple of deliberately co-located pairs so "nearest" has a clear answer
  pos.set([50,50,50,0], 0); pos.set([50.5,50,50,0], 4);

  const positions = device.createBuffer({ size: pos.byteLength,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST });
  device.queue.writeBuffer(positions, 0, pos);

  const grid  = createGrid(device,  { N, positions, worldMin, worldMax, cellSize, allowReadback:true });
  const sense = createSense(device, grid, { N, positions, senseRadius, allowReadback:true });

  const enc = device.createCommandEncoder();
  grid.buildFrame(enc);
  { const p = enc.beginComputePass(); sense.record(p); p.end(); }

  const rOut = device.createBuffer({ size: N*16,
    usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ });
  enc.copyBufferToBuffer(sense.buffers.senseOut, 0, rOut, 0, N*16);
  device.queue.submit([enc.finish()]);

  await rOut.mapAsync(1);
  const dv = new DataView(rOut.getMappedRange().slice(0));
  const gCount=new Uint32Array(N), gNear=new Uint32Array(N), gD2=new Float32Array(N);
  for(let i=0;i<N;i++){
    gCount[i]=dv.getUint32(i*16+0,true);
    gNear[i] =dv.getUint32(i*16+4,true);
    gD2[i]   =dv.getFloat32(i*16+8,true);
  }

  // ---- brute-force reference ----
  const r2 = senseRadius*senseRadius;
  let ok=true, msgs=[];
  for(let i=0;i<N;i++){
    let cnt=0, best=0xffffffff, bestD2=Infinity;
    const ax=pos[i*4],ay=pos[i*4+1],az=pos[i*4+2];
    for(let j=0;j<N;j++){
      if(j===i) continue;
      const dx=pos[j*4]-ax,dy=pos[j*4+1]-ay,dz=pos[j*4+2]-az;
      const dd=dx*dx+dy*dy+dz*dz;
      if(dd<=r2){ cnt++; if(dd<bestD2){bestD2=dd;best=j;} }
    }
    if(gCount[i]!==cnt){ ok=false; msgs.push(`count[${i}] gpu=${gCount[i]} ref=${cnt}`); }
    // nearest index can legitimately differ if two neighbors tie in distance; compare the
    // distance instead, which is unambiguous.
    if(cnt>0){
      if(Math.abs(gD2[i]-bestD2) > 1e-3*Math.max(1,bestD2)){
        ok=false; msgs.push(`nearestD2[${i}] gpu=${gD2[i].toFixed(3)} ref=${bestD2.toFixed(3)}`);
      }
    } else if(gNear[i]!==0xffffffff){
      ok=false; msgs.push(`entity ${i} has no neighbors but gpu nearest=${gNear[i]}`);
    }
  }
  console.log(ok?`PASS: sensing correct for ${N} entities (r=${senseRadius})`
                :`FAIL:\n`+msgs.slice(0,20).join("\n"));
  return ok;
}
