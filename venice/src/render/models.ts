import * as T from 'three';

export const standard = (color: T.ColorRepresentation, metalness = 0, roughness = 0.65) =>
  new T.MeshStandardMaterial({color, metalness, roughness});
function mesh(parent: T.Object3D, geometry: T.BufferGeometry, material: T.Material, x=0, y=0, z=0) {
  const m = new T.Mesh(geometry, material); m.position.set(x,y,z); parent.add(m); return m;
}
function bar(parent: T.Object3D, a: number[], b: number[], radius: number, mat: T.Material) {
  const start = new T.Vector3(...a), end = new T.Vector3(...b);
  const rod = mesh(parent,new T.CylinderGeometry(radius,radius,start.distanceTo(end),10),mat);
  rod.position.copy(start).lerp(end,0.5);
  rod.quaternion.setFromUnitVectors(new T.Vector3(0,1,0),end.sub(start).normalize());
  return rod;
}
function disc(parent: T.Object3D, radius:number, thickness:number, mat:T.Material, z=0) {
  const body=mesh(parent,new T.CylinderGeometry(radius,radius,thickness,80),mat,0,0,z);
  body.rotation.x=Math.PI/2; return body;
}
export type Art = Record<'face'|'lion'|'hand'|'boatman'|'workshop'|'canal', T.Texture>;
export function watch(art: Art) {
  const group=new T.Group(), brass=standard(0xcc9b50,0.8,0.28);
  disc(group,0.51,0.105,brass);
  for (const [side, map] of [[1,art.face],[-1,art.lion]] as const) {
    const face=mesh(group,new T.CircleGeometry(0.495,90),new T.MeshStandardMaterial({
      map,roughness:side===1?0.41:0.50,metalness:side===1?0.1:0.34,
      bumpMap:map,bumpScale:side===1?0.001:0.012
    }),0,0,side*0.055);
    if(side<0) face.rotation.y=Math.PI;
    mesh(group,new T.TorusGeometry(0.495,0.015,10,96),brass,0,0,side*0.054);
  }
  const crown=mesh(group,new T.SphereGeometry(0.069,24,16),brass,0,0.545,0);
  crown.scale.y=0.8;
  mesh(group,new T.TorusGeometry(0.10,0.018,12,50),brass,0,0.65);
  return group;
}

function woodGrain() {
  const canvas=document.createElement('canvas'); canvas.width=512; canvas.height=128;
  const c=canvas.getContext('2d')!;
  c.fillStyle='#986544'; c.fillRect(0,0,512,128);
  let seed=73; const random=()=>((seed=(seed*1664525+1013904223)>>>0)/4294967296);
  for(let i=0;i<1550;i++){
    const x=random()*512,y=random()*128;
    c.strokeStyle=random()<0.5?'rgba(44,19,9,.16)':'rgba(245,199,128,.19)';
    c.beginPath(); c.moveTo(x,y); c.bezierCurveTo(x+20,y+2,x+45,y-3,x+random()*105,y); c.stroke();
  }
  for(let i=0;i<8;i++){c.fillStyle='#433020';c.fillRect(0,i*16,512,1);}
  const texture=new T.CanvasTexture(canvas);texture.colorSpace=T.SRGBColorSpace;return texture;
}

function hull(parent:T.Group, timber:T.Material, trim:T.Material) {
  const vertices:number[]=[],uv:number[]=[],indices:number[]=[];
  const sections=27;
  for(let i=0;i<=sections;i++){
    const t=i/sections,x=(t-0.5)*3.9;
    const width=0.55*Math.pow(Math.max(0.001,Math.sin(t*Math.PI)),0.65);
    const sheer=0.37+0.16*Math.pow(Math.abs(2*t-1),2.6);
    for(const [z,y] of [[-width,sheer],[-width*0.72,0.05],[0,-0.09],[width*0.72,0.05],[width,sheer]]){
      // Fine ends rake out above the surface; a broad midship section sits in the water.
      const rake=(1-Math.min(1,(y+0.09)/sheer))*0.31*Math.pow(Math.abs(2*t-1),4);
      vertices.push(x-Math.sign(x)*rake,y,z);uv.push(t,(y+0.1)*1.6);
    }
    if(i>0)for(let j=0;j<4;j++){const k=i*5+j;indices.push(k-5,k,k+1,k-5,k+1,k-4);}
  }
  const geo=new T.BufferGeometry();geo.setAttribute('position',new T.Float32BufferAttribute(vertices,3));
  geo.setAttribute('uv',new T.Float32BufferAttribute(uv,2));geo.setIndex(indices);geo.computeVertexNormals();mesh(parent,geo,timber);
  for(const j of [0,4]){
    const points=Array.from({length:sections+1},(_,i)=>new T.Vector3().fromArray(vertices,(i*5+j)*3));
    mesh(parent,new T.TubeGeometry(new T.CatmullRomCurve3(points),32,0.033,7,false),trim);
  }
  const deck=mesh(parent,new T.BoxGeometry(2.9,0.055,0.49),timber,0,0.17);deck.rotation.y=0.015;
  for(const x of [-1.0,-0.15,0.78])mesh(parent,new T.BoxGeometry(0.29,0.09,0.73),timber,x,0.35);
}
function anchorTexture() {
  const canvas=document.createElement('canvas'); canvas.width=canvas.height=256;
  const ctx=canvas.getContext('2d')!;
  ctx.fillStyle='#34545a';ctx.fillRect(0,0,256,256);ctx.strokeStyle='#f2d891';ctx.lineWidth=9;
  ctx.beginPath();ctx.arc(128,128,116,0,Math.PI*2);ctx.stroke();
  ctx.beginPath();ctx.arc(128,68,12,0,2*Math.PI);ctx.moveTo(128,81);ctx.lineTo(128,188);
  ctx.moveTo(98,107);ctx.lineTo(158,107);ctx.moveTo(69,151);ctx.quadraticCurveTo(82,180,128,190);
  ctx.quadraticCurveTo(176,180,188,151);ctx.stroke();
  const map=new T.CanvasTexture(canvas);map.colorSpace=T.SRGBColorSpace;return map;
}
export function launch(art:Art, lion:boolean) {
  const root=new T.Group(), trim=standard(0xcda65f,0.58,0.36);
  const timber=new T.MeshStandardMaterial({map:woodGrain(),color:lion?0xb17c55:0x77939a,side:T.DoubleSide,roughness:0.37});
  hull(root,timber,trim);
  for(const x of [-1.42,-0.56])bar(root,[x,0.30,0.26],[x,1.48,0.26],0.031,timber);
  bar(root,[-1.48,1.48,0.26],[-0.49,1.48,0.26],0.04,timber);
  const gong=new T.Group();gong.position.set(-1,1.05,0.29);root.add(gong);
  for(const x of [-0.20,0.20])bar(gong,[x,0.24,0],[x*1.20,0.42,0],0.012,trim);
  disc(gong,0.36,0.06,trim);
  const target=mesh(gong,new T.CircleGeometry(0.348,48),new T.MeshStandardMaterial({
    map:lion?art.lion:anchorTexture(),roughness:0.48,metalness:0.23
  }),0,0,0.033);
  const man=mesh(root,new T.PlaneGeometry(1.40,1.65),new T.MeshBasicMaterial({
    map:art.boatman,transparent:true,alphaTest:0.10,side:T.DoubleSide
  }),0.43,1.01,0.03);
  const oar=new T.Group();oar.position.set(0.86,0.99,0.10);root.add(oar);
  bar(oar,[-0.12,0.25,-0.1],[1.20,-0.93,0.66],0.026,timber);
  const blade=mesh(oar,new T.SphereGeometry(1,12,8),timber,1.23,-0.97,0.68);
  blade.scale.set(0.22,0.065,0.089);blade.rotation.z=-0.68;
  if(!lion){
    man.visible=false;oar.visible=false;
    // The mail launch carries a canvas awning over its enclosed cockpit.
    const roof=new T.Group();roof.position.set(0.56,0.95,0);root.add(roof);
    const canvas=standard(0x68756b,0.03,0.9), frame=standard(0x67472c);
    for(const x of [-0.65,0.65]){
      for(const z of [-0.39,0.39])bar(roof,[x,-0.64,z],[x,0.08,z],0.026,frame);
    }
    const cover=mesh(roof,new T.SphereGeometry(1,24,12,0,Math.PI*2,0,Math.PI/2),canvas,0,0.08);
    cover.scale.set(.90,.20,.51);
    mesh(roof,new T.BoxGeometry(1.46,0.24,0.73),timber,0,-.45);
    for(const z of [-.38,.38])mesh(roof,new T.BoxGeometry(1.4,.045,.035),trim,0,-.29,z);
  }
  const envelope=mesh(root,new T.BoxGeometry(0.34,0.21,0.02),standard(0xffdda0),1.08,1.29,0.12);
  envelope.visible=false;
  return {root,gong,target,man,oar,envelope};
}
