import { railway } from '../sim/alignment';
import * as THREE from 'three';
import { CityGeometry } from './geometry';
import { roadSegments } from '../sim/roads';

export const landmarks = [[0,10],[6,3],[6,0],[0,0],[3,3],[12,8.6],[3,12]];
export const isLandmark = (x: number, z: number) => landmarks.some(p => Math.hypot(x - p[0], z - p[1]) < 0.8);
export function roadClearance(x: number, z: number) {
  let distance = Infinity;
  for (const path of roadSegments) for (let i = 1; i < path.length; i++) {
    const [ax, az] = path[i - 1], [bx, bz] = path[i], dx = bx - ax, dz = bz - az;
    const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz)));
    distance = Math.min(distance, Math.hypot(x - ax - t * dx, z - az - t * dz));
  }
  return distance;
}
/** Place the shelter along an outgoing street, beyond the junction and outside the carriageway. */
export function shelterPlacement(x:number,z:number) {
  let best={x:x+.46,z:z+.9,angle:0,clearance:-1};
  for(const path of roadSegments)for(let i=1;i<path.length;i++){
    const a=path[i-1],b=path[i];
    const other=a[0]===x&&a[1]===z?b:b[0]===x&&b[1]===z?a:undefined;if(!other)continue;
    const length=Math.hypot(other[0]-x,other[1]-z);if(length<1.4)continue;
    const dx=(other[0]-x)/length,dz=(other[1]-z)/length,angle=Math.atan2(dx,dz);
    for(const side of [1,-1]){
      const sx=x+dx*.9+dz*.46*side,sz=z+dz*.9-dx*.46*side;
      let clearance=Infinity;
      for(const across of [-.135,.135])for(const along of [-.31,.31])clearance=Math.min(clearance,roadClearance(sx+dz*across+dx*along,sz-dx*across+dz*along));
      if(clearance>best.clearance)best={x:sx,z:sz,angle,clearance};
    }
  }
  return best;
}
export function infrastructure(scene: THREE.Scene) {
  const g = new CityGeometry();
  const box = (c: string, x: number, y: number, z: number, sx: number, sy: number, sz: number, r = 0) => g.add('box', c, x, y, z, sx, sy, sz, r);
  for (const path of roadSegments) for (let i = 1; i < path.length; i++) {
    const [ax, az] = path[i - 1], [bx, bz] = path[i], length = Math.hypot(bx - ax, bz - az), angle = Math.atan2(bx - ax, bz - az);
    box('#d9cfb9', (ax+bx)/2, .06, (az+bz)/2, .67, .07, length+.08, angle);
    box('#59666a', (ax+bx)/2, .106, (az+bz)/2, .43, .024, length+.04, angle);
    for (let t = .15; t < length; t += .45) box('#dfd8b8', ax+(bx-ax)*t/length, .124, az+(bz-az)*t/length, .022, .005, .18, angle);
  }
  // Railway station, canopy, platform, rails and a stationary passenger train.
  box('#e1b77e', 0,.44,10, 1.1,.78,.64); g.add('roof','#865c4e',0,.96,10,1.25,.3,.83);
  box('#f6e4b8',0,.76,9.66,.36,.5,.06); g.add('cylinder','#fff5d5',0,.84,9.61,.23,.04,.23,Math.PI/2);
  box('#516b77',-.06,.49,10.65,1.7,.09,.63);
  for (const x of [-.7,.65]) box('#7c827c',x,.27,10.65,.055,.48,.06);
  for (const z of [11.3,11.6]) box('#7e827c',6,.13,z,15,.05,.035);
  for (let x=-1; x<13.5; x+=.35) box('#92836e',x,.08,11.45,.13,.06,.5);
  for(const platform of railway.platformXs){box('#d4bd92',platform,.16,railway.trackZ-.38,1.1,.16,.38);box('#f5d179',platform,.25,railway.trackZ-.22,1.1,.025,.04);}
  // Hospital wings and red cross, university columns and pediment.
  box('#e6e4d6',6,.6,3,.86,1.08,.62);box('#b5c9c4',6,.3,3,.4,.5,1.15);
  box('#cc5650',6,.91,3.32,.3,.08,.035);box('#cc5650',6,.91,3.33,.08,.3,.035);
  box('#e7d6ae',6,.44,0,1.15,.78,.68);g.add('roof','#a35f4c',6,.99,0,1.28,.35,.84);
  for (let i=0;i<5;i++) g.add('cylinder','#f8e9c7',5.55+i*.22,.46,.43,.08,.75,.08);
  // Workshops, sawtooth roofs and chimneys.
  box('#ad9b87',0,.28,0,1.35,.48,.8);
  for(let i=0;i<3;i++)g.add('roof','#697c7b',-.43+i*.43,.64,0,.45,.3,.87);
  for (const x of [-.5,.5]) { g.add('cylinder','#ad7356',x,.83,-.42,.14,1.5,.14);g.add('cylinder','#ddd0b7',x,1.25,-.42,.16,.12,.16); }
  // Market tents, depot and taxi rank near the station.
  for(let i=0;i<4;i++){box('#d0b188',2.55+(i%2)*.75,.2,2.65+Math.floor(i/2)*.65,.55,.27,.4);g.add('roof',i%2?'#c85f49':'#e8d59c',2.55+(i%2)*.75,.48,2.65+Math.floor(i/2)*.65,.65,.24,.53);}
  box('#a9b6ae',3,.3,12,1.8,.5,.62);box('#5d7074',3,.59,12,1.9,.08,.75);
  for(let i=0;i<4;i++)box('#405966',2.38+i*.42,.25,12.32,.31,.33,.025);
  box('#d7b348',.6,.09,9.2,1.1,.02,.35);
  // Football ground with stands, floodlight towers and goals.
  box('#3e9368',12,.07,8.6,1.7,.04,2.2);
  for(const x of [11.17,12.83])box('#eee5c8',x,.1,8.6,.025,.01,2.15);
  for(const z of [7.55,8.6,9.65])box('#eee5c8',12,.1,z,1.68,.01,.025);
  for(const x of [10.95,13.05]) for(let i=0;i<3;i++)box(i%2?'#c3b48f':'#8eaaa4',x+(x<12?-i:i)*.1,.12+i*.1,8.6,.15,.16,2.1);
  for(const z of [7.6,9.6]){box('#eeeece',12,.26,z,.54,.04,.03);for(const x of [11.75,12.25])box('#eeeece',x,.18,z,.035,.23,.035);}
  for(const x of [11,13])for(const z of [7.3,9.9]){box('#6a7e7d',x,.8,z,.04,1.5,.04);box('#fff0b7',x,1.56,z,.25,.13,.09);}
  // Bridge abutments, railings and a roundabout at the outer interchange.
  for(const crossing of [1,4,7,10]) {
    for(const bank of [7.87,9.13]) box('#808c87',bank,.08,crossing,.2,.26,.66);
    for(const side of [-.29,.29]) {
      const shore=crossing+side;
      box('#c8caaf',8.5,.23,shore,1.48,.07,.05);
      if(crossing!==4)continue;
      for(let index=0;index<6;index++){
        const left=7.76+index*1.48/6,right=7.76+(index+1)*1.48/6;
        const arch=(x:number)=>.26+.62*(1-((x-8.5)/.74)**2);
        const rise=arch(right)-arch(left),run=right-left;
        g.add('box','#aa573e',(left+right)/2,(arch(left)+arch(right))/2,shore,Math.hypot(rise,run)+.025,.075,.085,0,Math.atan2(rise,run));
        if(index)box('#657e78',left,(arch(left)+.24)/2,shore,.032,arch(left)-.24,.035);
      }
    }
    if(crossing===4)for(const crossbeam of [8.25,8.75])box('#a96a4c',crossbeam,.80,crossing,.075,.065,.62);
  }
  for(const bank of [7.92,9.08])for(const stretch of [2.5,5.5,8.5]){
    box('#b2aa94',bank,.105,stretch,.16,.14,2.18);
    box('#e3d7ba',bank,.19,stretch,.19,.04,2.2);
  }
  box('#997b60',8.12,.13,5.65,.32,.08,.86);
  for(const mooring of [5.29,6.01])box('#675b4d',8.24,.17,mooring,.055,.24,.055);
  box('#375667',8.49,.14,5.65,.28,.14,.8);box('#f7dbab',8.49,.26,5.66,.23,.13,.59);
  box('#487e8a',8.49,.37,5.73,.21,.10,.34);box('#f1d5ad',8.49,.435,5.73,.25,.035,.38);
  g.add('cylinder','#718275',13,.13,4,.7,.1,.7);g.add('cylinder','#95a879',13,.19,4,.4,.07,.4);
  // Bus shelters: recognisable platforms, seats, roof and glass side panels.
  for(const p of [[1,10],[1,7],[4,7],[4,4],[1,1],[7,1],[7,4],[10,4],[10,1],[10,7],[7,10],[4,10]]){
    const {x,z,angle}=shelterPlacement(p[0],p[1]);
    const part=(c:string,y:number,across:number,sx:number,sy:number,sz:number)=>box(c,x+Math.cos(angle)*across,y,z-Math.sin(angle)*across,sx,sy,sz,angle);
    part('#bbc9be',.12,0,.25,.06,.6);part('#56766d',.49,0,.27,.05,.62);
    part('#84b5bb',.31,.1,.035,.34,.55);part('#ad7952',.24,0,.1,.045,.4);
  }
  scene.add(g.finish());
}
