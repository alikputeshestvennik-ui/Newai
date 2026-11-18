import * as THREE from 'three';
import { CityGeometry } from './geometry';

type Vertex = [number, number, number, string];
function ribbon(rows: Vertex[][]) {
  const positions: number[] = [], colors: number[] = [], indices: number[] = [];
  const tint = new THREE.Color(), width = rows[0].length;
  for (const [row, vertices] of rows.entries()) for (const [column, [x, y, z, color]] of vertices.entries()) {
    positions.push(x, y, z); tint.set(color); colors.push(tint.r, tint.g, tint.b);
    if (row && column) {
      const end = row * width + column;
      indices.push(end-width-1, end-1, end, end-width-1, end, end-width);
    }
  }
  const geometry = new THREE.BufferGeometry(); geometry.setIndex(indices);
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions,3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors,3)); geometry.computeVertexNormals();
  return new THREE.Mesh(geometry, new THREE.MeshLambertMaterial({vertexColors:true}));
}

function channel(z: number) {
  const outside = Math.max(0,-1-z,z-13), blend = Math.min(1,outside/5);
  return {center:8.5+blend*(1.3*Math.sin(z*.27)+.75*Math.cos(z*.62)), half:.54+blend*(.36+.22*Math.sin(z*.64))};
}

export function valley(scene: THREE.Scene) {
  const west: Vertex[][] = [], east: Vertex[][] = [], water: Vertex[][] = [];
  const grove = new CityGeometry();
  for (let z=-70;z<=70;z++) {
    const {center,half}=channel(z), left=center-half, right=center+half;
    const outer=Math.min(1, Math.max(0,-2-z,z-14)/4);
    west.push([[-80,1,z,'#a2b593'],[-14,1.9+.9*Math.sin(z*.31),z,'#849e7b'],[-5,.09+outer*.2,z,'#a5b78d'],[-1,.035,z,'#bcc2a1'],[left-.32,.035,z,outer?'#aec096':'#c6c8ac'],[left,.035,z,'#c1bf9d'],[left+.12,-.12,z,'#887e65']]);
    east.push([[right-.12,-.12,z,'#887e65'],[right,.035,z,'#c1bf9d'],[right+.32,.035,z,outer?'#aec096':'#c6c8ac'],[15,.035,z,'#bdc5a3'],[18,.09+outer*.2,z,'#a6b995'],[28,2+Math.cos(z*.33),z,'#8fa882'],[80,1,z,'#a2b593']]);
    water.push([[left+.025,-.005,z,'#84b9a9'],[left+.19,-.005,z,'#66abac'],[center,-.005,z,'#498e9d'],[right-.18,-.005,z,'#5ea5ae'],[right-.025,-.005,z,'#83b5a9']]);
  }
  for(let row=-12;row<=22;row+=2) for(let col=-9;col<=22;col+=2) {
    if(col>=-2&&col<=15&&row>=-2&&row<=15) continue;
    const variation=Math.sin(row*7+col*13),bank=channel(row);
    if(variation<-.17 || Math.abs(col-bank.center)<bank.half+1.2)continue;
    for(let tree=0;tree<3;tree++){
      const x=col+Math.cos(tree*2+row)*.55,z=row+Math.sin(tree*2+col)*.61;
      const height=.55+.28*(1+Math.sin(x*3+z));
      const foot=x< -5?(Math.min(-5-x,9)/9)*(1.9+.9*Math.sin(z*.31)):x>18?(Math.min(x-18,10)/10)*(2+Math.cos(z*.33)):.04;
      grove.add('cone',tree===0?'#587b67':tree===1?'#70957b':'#66876b',x,foot+height*.5,z,height*.68,height,height*.68);
    }
  }
  const river=ribbon(water); river.name='river'; river.userData.noSnow=true;
  scene.add(ribbon(west),ribbon(east),river,grove.finish());
}
