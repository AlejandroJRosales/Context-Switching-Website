export const v3 = {
  sub:(a,b)=>[a[0]-b[0],a[1]-b[1],a[2]-b[2]],
  cross:(a,b)=>[a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0]],
  norm:(a)=>{const l=Math.hypot(a[0],a[1],a[2])||1;return [a[0]/l,a[1]/l,a[2]/l];},
  dot:(a,b)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2],
};

export function perspective(fovy, aspect, near, far) {
  const f = 1/Math.tan(fovy/2), nf = 1/(near-far);
  return [
    f/aspect,0,0,0,
    0,f,0,0,
    0,0,(far+near)*nf,-1,
    0,0,2*far*near*nf,0,
  ];
}

// Clip-space Z in [0,1] (WebGPU/D3D), NOT GL's [-1,1]. The shadow bake writes clip Z straight
// into a depth24plus target and the terrain sampler compares against that same [0,1] depth,
// so the projection must already be [0,1] with no remap.
export function ortho(left, right, bottom, top, near, far) {
  const lr = 1 / (left - right), bt = 1 / (bottom - top), nf = 1 / (near - far);
  return [
    -2 * lr, 0, 0, 0,
    0, -2 * bt, 0, 0,
    0, 0, nf, 0,
    (left + right) * lr, (top + bottom) * bt, near * nf, 1,
  ];
}

export function lookAt(eye, center, up) {
  const z = v3.norm(v3.sub(eye, center));
  const x = v3.norm(v3.cross(up, z));
  const y = v3.cross(z, x);
  return [
    x[0],y[0],z[0],0,
    x[1],y[1],z[1],0,
    x[2],y[2],z[2],0,
    -v3.dot(x,eye),-v3.dot(y,eye),-v3.dot(z,eye),1,
  ];
}

export function mul(a,b){ // a*b, column-major
  const o=new Array(16);
  for(let c=0;c<4;c++)for(let r=0;r<4;r++){
    o[c*4+r]=a[0*4+r]*b[c*4+0]+a[1*4+r]*b[c*4+1]+a[2*4+r]*b[c*4+2]+a[3*4+r]*b[c*4+3];
  }
  return o;
}

export function invertMat4(m) {
  const inv = new Array(16);
  const a00=m[0],a01=m[1],a02=m[2],a03=m[3];
  const a10=m[4],a11=m[5],a12=m[6],a13=m[7];
  const a20=m[8],a21=m[9],a22=m[10],a23=m[11];
  const a30=m[12],a31=m[13],a32=m[14],a33=m[15];

  const b00=a00*a11-a01*a10, b01=a00*a12-a02*a10, b02=a00*a13-a03*a10;
  const b03=a01*a12-a02*a11, b04=a01*a13-a03*a11, b05=a02*a13-a03*a12;
  const b06=a20*a31-a21*a30, b07=a20*a32-a22*a30, b08=a20*a33-a23*a30;
  const b09=a21*a32-a22*a31, b10=a21*a33-a23*a31, b11=a22*a33-a23*a32;

  let det = b00*b11 - b01*b10 + b02*b09 + b03*b08 - b04*b07 + b05*b06;
  if (Math.abs(det) < 1e-12) {
    return [1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1]; // degenerate: identity, not NaN-poison
  }
  det = 1.0 / det;

  inv[0]  = ( a11*b11 - a12*b10 + a13*b09) * det;
  inv[1]  = (-a01*b11 + a02*b10 - a03*b09) * det;
  inv[2]  = ( a31*b05 - a32*b04 + a33*b03) * det;
  inv[3]  = (-a21*b05 + a22*b04 - a23*b03) * det;
  inv[4]  = (-a10*b11 + a12*b08 - a13*b07) * det;
  inv[5]  = ( a00*b11 - a02*b08 + a03*b07) * det;
  inv[6]  = (-a30*b05 + a32*b02 - a33*b01) * det;
  inv[7]  = ( a20*b05 - a22*b02 + a23*b01) * det;
  inv[8]  = ( a10*b10 - a11*b08 + a13*b06) * det;
  inv[9]  = (-a00*b10 + a01*b08 - a03*b06) * det;
  inv[10] = ( a30*b04 - a31*b02 + a33*b00) * det;
  inv[11] = (-a20*b04 + a21*b02 - a23*b00) * det;
  inv[12] = (-a10*b09 + a11*b07 - a12*b06) * det;
  inv[13] = ( a00*b09 - a01*b07 + a02*b06) * det;
  inv[14] = (-a30*b03 + a31*b01 - a32*b00) * det;
  inv[15] = ( a20*b03 - a21*b01 + a22*b00) * det;

  return inv;
}