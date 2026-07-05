const cross = (a,b)=>[a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0]];
const norm = (a)=>{const l=Math.hypot(a[0],a[1],a[2])||1;return [a[0]/l,a[1]/l,a[2]/l];};

// Build a generalized cylinder along a centerline: centerFn(t)->[x,y,z], radiusFn(t)->r,
// segs radial subdivisions. Appends into pos[]/tris[] from vbase; returns new vertex count.
function addTube(pos, tris, vbase, { rings, segs, centerFn, radiusFn }) {
  for (let r = 0; r < rings; r++) {
    const t = rings === 1 ? 0 : r / (rings - 1);
    const c = centerFn(t);
    const rad = radiusFn(t);
    // approximate tangent via finite difference, build a ring perpendicular to it
    const t0 = Math.max(0, t - 1e-3), t1 = Math.min(1, t + 1e-3);
    const a = centerFn(t0), b = centerFn(t1);
    let tang = [b[0]-a[0], b[1]-a[1], b[2]-a[2]];
    const tl = Math.hypot(...tang) || 1; tang = [tang[0]/tl, tang[1]/tl, tang[2]/tl];
    let up = Math.abs(tang[1]) > 0.9 ? [1,0,0] : [0,1,0];
    let u = norm(cross(up, tang));
    let v = norm(cross(tang, u));
    for (let s = 0; s < segs; s++) {
      const ang = (s / segs) * Math.PI * 2;
      const cosA = Math.cos(ang), sinA = Math.sin(ang);
      pos.push(
        c[0] + (u[0]*cosA + v[0]*sinA) * rad,
        c[1] + (u[1]*cosA + v[1]*sinA) * rad,
        c[2] + (u[2]*cosA + v[2]*sinA) * rad,
      );
    }
  }
  // stitch quads between consecutive rings; ring r occupies verts [vbase+r*segs, +segs)
  for (let r = 0; r < rings - 1; r++) {
    for (let s = 0; s < segs; s++) {
      const s1 = (s + 1) % segs;
      const a = vbase + r*segs + s,     b = vbase + r*segs + s1;
      const c = vbase + (r+1)*segs + s, d = vbase + (r+1)*segs + s1;
      tris.push(a, c, b,  b, c, d);
    }
  }
  return vbase + rings * segs;
}

// Bakes one canonical quadruped (torso + 4 legs + neck + head) in local space oriented
// +X = forward (nose), +Y = up, +Z = right. Per-species proportions are applied as VS
// deformation, so this single mesh serves every creature. Interleaved pos+normal, u32 index.
export function buildCreatureMesh() {
  const pos = [];     // flat xyz
  const tris = [];    // flat index triples
  let vb = 0;

  const SEG = 8;      // radial segments per tube (low-poly but rounded)

  // Torso: runs along X from tail (x=-0.5) to chest (x=+0.45), fattest mid-body.
  vb = addTube(pos, tris, vb, {
    rings: 9, segs: SEG,
    centerFn: (t) => {
      const x = -0.5 + t * 0.95;
      const y = 0.55 + Math.sin(t * Math.PI) * 0.05;
      return [x, y, 0];
    },
    radiusFn: (t) => 0.10 + Math.sin(t * Math.PI) * 0.12,
  });

  // Neck: from chest forward (+X) and up (+Y).
  vb = addTube(pos, tris, vb, {
    rings: 6, segs: SEG,
    centerFn: (t) => {
      const x = 0.42 + t * 0.22;
      const y = 0.60 + t * 0.30;
      return [x, y, 0];
    },
    radiusFn: (t) => 0.10 - t * 0.04,
  });

  // Head: short tube ending in the nose, tip at +X.
  vb = addTube(pos, tris, vb, {
    rings: 5, segs: SEG,
    centerFn: (t) => {
      const x = 0.64 + t * 0.22;
      const y = 0.90 - t * 0.06;
      return [x, y, 0];
    },
    radiusFn: (t) => 0.085 * (1 - t * 0.55),
  });

  // Legs: 4 thin tubes hanging down (-Y) at front/back x and left/right z.
  const legDefs = [
    [ 0.34,  0.16], [ 0.34, -0.16],   // front R / L
    [-0.34,  0.16], [-0.34, -0.16],   // rear  R / L
  ];
  for (const [lx, lz] of legDefs) {
    vb = addTube(pos, tris, vb, {
      rings: 4, segs: 6,
      centerFn: (t) => [lx, 0.48 - t * 0.48, lz],
      radiusFn: (t) => 0.045 * (1 - t * 0.3),
    });
  }

  // Tail: a tapered tube trailing back/down along -X. This is the ONLY geometry with local
  // x < -0.5, so the VS identifies tail verts purely by position (no per-vertex attribute)
  // and applies species-specific shaping there. Rest pose is a gentle downward droop.
  vb = addTube(pos, tris, vb, {
    rings: 6, segs: 6,
    centerFn: (t) => {
      const x = -0.52 - t * 0.20;      // keep x strictly < -0.5
      const y = 0.55 - t * t * 0.10;   // droops as it extends
      return [x, y, 0];
    },
    radiusFn: (t) => 0.055 * (1 - t * 0.55),
  });

  // smooth normals: accumulate face normals per vertex, normalize
  const vCount = pos.length / 3;
  const nrm = new Float32Array(pos.length);
  for (let i = 0; i < tris.length; i += 3) {
    const ia = tris[i]*3, ib = tris[i+1]*3, ic = tris[i+2]*3;
    const ax=pos[ia],ay=pos[ia+1],az=pos[ia+2];
    const bx=pos[ib],by=pos[ib+1],bz=pos[ib+2];
    const cx=pos[ic],cy=pos[ic+1],cz=pos[ic+2];
    const e1=[bx-ax,by-ay,bz-az], e2=[cx-ax,cy-ay,cz-az];
    const fn=cross(e1,e2);
    for (const idx of [ia,ib,ic]) { nrm[idx]+=fn[0]; nrm[idx+1]+=fn[1]; nrm[idx+2]+=fn[2]; }
  }
  for (let i = 0; i < nrm.length; i += 3) {
    const l = Math.hypot(nrm[i],nrm[i+1],nrm[i+2]) || 1;
    nrm[i]/=l; nrm[i+1]/=l; nrm[i+2]/=l;
  }

  // interleave pos+nrm
  const vertexData = new Float32Array(vCount * 6);
  for (let i = 0; i < vCount; i++) {
    vertexData[i*6]   = pos[i*3];
    vertexData[i*6+1] = pos[i*3+1];
    vertexData[i*6+2] = pos[i*3+2];
    vertexData[i*6+3] = nrm[i*3];
    vertexData[i*6+4] = nrm[i*3+1];
    vertexData[i*6+5] = nrm[i*3+2];
  }
  const indexData = new Uint32Array(tris);

  return { vertexData, indexData, vertexCount: vCount, indexCount: tris.length };
}

// A UV sphere centered at ctr with per-axis scale (sx,sy,sz). Appends into pos[]/tris[]
// from vbase; returns new vertex count. (Used by the cat mesh for head/eyes/nose.)
function addSphere(pos, tris, vbase, ctr, rad, scl = [1, 1, 1], stacks = 8, slices = 10) {
  const start = vbase;
  for (let i = 0; i <= stacks; i++) {
    const v = i / stacks, phi = v * Math.PI;
    const sy = Math.cos(phi), sr = Math.sin(phi);
    for (let j = 0; j <= slices; j++) {
      const u = j / slices, th = u * Math.PI * 2;
      pos.push(
        ctr[0] + Math.cos(th) * sr * rad * scl[0],
        ctr[1] + sy * rad * scl[1],
        ctr[2] + Math.sin(th) * sr * rad * scl[2],
      );
      vbase++;
    }
  }
  const rowV = slices + 1;
  for (let i = 0; i < stacks; i++) {
    for (let j = 0; j < slices; j++) {
      const a = start + i*rowV + j,     b = a + 1;
      const c = start + (i+1)*rowV + j, d = c + 1;
      tris.push(a, c, b,  b, c, d);
    }
  }
  return vbase;
}

// A cone (for ears): apex up, base ring at ctr. Appends; returns new vertex count.
function addCone(pos, tris, vbase, ctr, rad, height, segs = 6) {
  const apexIdx = vbase;
  pos.push(ctr[0], ctr[1] + height, ctr[2]); vbase++;
  const ringStart = vbase;
  for (let s = 0; s < segs; s++) {
    const ang = (s / segs) * Math.PI * 2;
    pos.push(ctr[0] + Math.cos(ang) * rad, ctr[1], ctr[2] + Math.sin(ang) * rad);
    vbase++;
  }
  for (let s = 0; s < segs; s++) {
    const s1 = (s + 1) % segs;
    tris.push(apexIdx, ringStart + s, ringStart + s1);
  }
  return vbase;
}

// Bakes the single first-person COMPANION cat ("Nibbler") in local space:
//   +X = forward (nose), +Y = up, +Z = right. Feet at local y=0 so placement at the
// terrain height puts paws on the ground with no fudge factor
export function buildCatMesh() {
  const pos = [];   // flat xyz
  const tris = [];  // flat index triples
  // vertex ranges tagged with a tint so eyes/nose read as emissive-ish without a real light.
  const tintRanges = []; // {start,end,color}
  let vb = 0;
  const SEG = 10;

  const black = [0.07, 0.07, 0.08];
  const eyeGlow = [0.55, 0.95, 0.05]; // yellow-green, matches the Three.js eye emissive
  const pink = [0.95, 0.55, 0.55];

  const tag = (start, end, color) => tintRanges.push({ start, end, color });

  // Body: long low tube along X (tail x=-9 .. chest x=+9)
  let s0 = vb;
  vb = addTube(pos, tris, vb, {
    rings: 11, segs: SEG,
    centerFn: (t) => [-9 + t * 18, 5 + Math.sin(t * Math.PI) * 0.6, 0],
    radiusFn: (t) => 3.0 + Math.sin(t * Math.PI) * 1.4,
  });
  tag(s0, vb, black);

  // Head: sphere forward and up from the chest.
  s0 = vb; vb = addSphere(pos, tris, vb, [10.5, 8.0, 0], 4.3, [1, 1, 1], 8, 10); tag(s0, vb, black);

  // Ears: two cones atop the head.
  s0 = vb; vb = addCone(pos, tris, vb, [ 8.6, 11.0,  2.4], 1.5, 3.5, 5); tag(s0, vb, black);
  s0 = vb; vb = addCone(pos, tris, vb, [ 8.6, 11.0, -2.4], 1.5, 3.5, 5); tag(s0, vb, black);

  // Eyes: small glowing spheres on the face (tinted, no light).
  s0 = vb; vb = addSphere(pos, tris, vb, [13.5, 8.6,  1.7], 1.1, [1,1,1], 6, 8); tag(s0, vb, eyeGlow);
  s0 = vb; vb = addSphere(pos, tris, vb, [13.5, 8.6, -1.7], 1.1, [1,1,1], 6, 8); tag(s0, vb, eyeGlow);

  // Nose: tiny pink sphere at the tip.
  s0 = vb; vb = addSphere(pos, tris, vb, [14.2, 7.6, 0], 0.6, [1,1,1], 5, 6); tag(s0, vb, pink);

  // Legs: 4 tapered tubes hanging down (-Y) at front/back X and left/right Z.
  const legDefs = [[6.0, 3.2], [6.0, -3.2], [-5.0, 3.2], [-5.0, -3.2]];
  for (const [lx, lz] of legDefs) {
    s0 = vb;
    vb = addTube(pos, tris, vb, {
      rings: 4, segs: 6,
      centerFn: (t) => [lx, 4.5 - t * 4.5, lz],
      radiusFn: (t) => 1.2 * (1 - t * 0.2),
    });
    tag(s0, vb, black);
  }

  // Tail: tapered tube trailing back (-X) and rising, curving at the tip (t*t)
  s0 = vb;
  vb = addTube(pos, tris, vb, {
    rings: 8, segs: 6,
    centerFn: (t) => [-9 - t * 3.0, 5 + t * 9.0, -1 - t * t * 4.0],
    radiusFn: (t) => 1.0 * (1 - t * 0.5),
  });
  tag(s0, vb, black);

  // smooth normals
  const vCount = pos.length / 3;
  const nrm = new Float32Array(pos.length);
  for (let i = 0; i < tris.length; i += 3) {
    const ia = tris[i]*3, ib = tris[i+1]*3, ic = tris[i+2]*3;
    const e1 = [pos[ib]-pos[ia], pos[ib+1]-pos[ia+1], pos[ib+2]-pos[ia+2]];
    const e2 = [pos[ic]-pos[ia], pos[ic+1]-pos[ia+1], pos[ic+2]-pos[ia+2]];
    const fn = cross(e1, e2);
    for (const idx of [ia, ib, ic]) { nrm[idx]+=fn[0]; nrm[idx+1]+=fn[1]; nrm[idx+2]+=fn[2]; }
  }
  for (let i = 0; i < nrm.length; i += 3) {
    const l = Math.hypot(nrm[i], nrm[i+1], nrm[i+2]) || 1;
    nrm[i]/=l; nrm[i+1]/=l; nrm[i+2]/=l;
  }

  // interleave pos+nrm (float32x6)
  const vertexData = new Float32Array(vCount * 6);
  for (let i = 0; i < vCount; i++) {
    vertexData[i*6]   = pos[i*3];
    vertexData[i*6+1] = pos[i*3+1];
    vertexData[i*6+2] = pos[i*3+2];
    vertexData[i*6+3] = nrm[i*3];
    vertexData[i*6+4] = nrm[i*3+1];
    vertexData[i*6+5] = nrm[i*3+2];
  }
  // per-vertex tint (float32x3), default black then painted per tagged range
  const tintData = new Float32Array(vCount * 3);
  for (let i = 0; i < vCount; i++) { tintData[i*3]=black[0]; tintData[i*3+1]=black[1]; tintData[i*3+2]=black[2]; }
  for (const { start, end, color } of tintRanges) {
    for (let i = start; i < end; i++) { tintData[i*3]=color[0]; tintData[i*3+1]=color[1]; tintData[i*3+2]=color[2]; }
  }

  return {
    vertexData, tintData,
    indexData: new Uint32Array(tris),
    vertexCount: vCount, indexCount: tris.length,
  };
}