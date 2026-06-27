// mesh.js: bakes ONE canonical quadruped mesh on the host (torso tube + 4 legs +
// neck + head), interleaved position+normal, plus a u32 index buffer. The mesh lives
// in a canonical, roughly unit-ish local space oriented +X = forward (nose), +Y = up,
// +Z = right. Per-species proportions (deer vs wolf) are applied as deformation in the
// vertex shader, so this single mesh serves every creature — no per-species buffers.
//
// Smooth normals: accumulated per-vertex from face normals, then normalized. The body
// is built from a handful of generalized cylinders ("limbs"); each ring shares vertices
// along its length so lighting is smooth.
//
// Layout per vertex: [px,py,pz, nx,ny,nz] -> arrayStride 24 bytes, two float32x3 attrs.

const cross = (a,b)=>[a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0]];
const norm = (a)=>{const l=Math.hypot(a[0],a[1],a[2])||1;return [a[0]/l,a[1]/l,a[2]/l];};

// Build a generalized cylinder/tube along a centerline of `rings` cross-sections.
// centerFn(t) -> [x,y,z] center for t in [0,1]; radiusFn(t) -> radius.
// segs = radial subdivisions. Appends into pos[] (flat) and tris[] (index triples),
// using the running vertex base. Returns the new vertex count.
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

// Build the full canonical creature. Returns { vertexData:Float32Array(interleaved pos+nrm),
// indexData:Uint32Array, vertexCount, indexCount }.
export function buildCreatureMesh() {
  const pos = [];     // flat xyz
  const tris = [];    // flat index triples
  let vb = 0;

  const SEG = 8;      // radial segments per tube (low-poly but rounded)

  // --- Torso: runs along X from tail (x=-0.5) to chest (x=+0.45). Belly dips, fattest
  //     mid-body. Radius tapers toward both ends.
  vb = addTube(pos, tris, vb, {
    rings: 9, segs: SEG,
    centerFn: (t) => {
      const x = -0.5 + t * 0.95;
      // slight belly sag and a small rise toward the shoulders
      const y = 0.55 + Math.sin(t * Math.PI) * 0.05;
      return [x, y, 0];
    },
    radiusFn: (t) => 0.10 + Math.sin(t * Math.PI) * 0.12, // fat middle, slim ends
  });

  // --- Neck: from chest up toward where the head sits. Forward (+X) and up (+Y).
  vb = addTube(pos, tris, vb, {
    rings: 6, segs: SEG,
    centerFn: (t) => {
      const x = 0.42 + t * 0.22;
      const y = 0.60 + t * 0.30;     // rises
      return [x, y, 0];
    },
    radiusFn: (t) => 0.10 - t * 0.04,
  });

  // --- Head: short tube ending in the nose, tip at +X.
  vb = addTube(pos, tris, vb, {
    rings: 5, segs: SEG,
    centerFn: (t) => {
      const x = 0.64 + t * 0.22;
      const y = 0.90 - t * 0.06;     // muzzle dips slightly
      return [x, y, 0];
    },
    radiusFn: (t) => 0.085 * (1 - t * 0.55),
  });

  // --- Legs: 4 thin tubes hanging down (-Y) from the torso underside. Positioned at
  //     front/back x and left/right z. Built straight; the VS can bend them later.
  const legDefs = [
    [ 0.34,  0.16], [ 0.34, -0.16],   // front R / L
    [-0.34,  0.16], [-0.34, -0.16],   // rear  R / L
  ];
  for (const [lx, lz] of legDefs) {
    vb = addTube(pos, tris, vb, {
      rings: 4, segs: 6,
      centerFn: (t) => [lx, 0.48 - t * 0.48, lz],  // from belly (y~0.48) to ground (y~0)
      radiusFn: (t) => 0.045 * (1 - t * 0.3),
    });
  }

  // --- smooth normals: accumulate face normals per vertex, normalize ---
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
