import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { World } from '../sim/types';
import type { Quality } from '../core/settings';
import { eventConfig } from '../sim/events';
import { D, T } from '../sim/config';
import { alignment } from '../sim/alignment';
import { roadPath } from '../sim/roads';
const merged = (parts: THREE.BufferGeometry[]) => { const geometry=mergeGeometries(parts);parts.forEach(p=>p.dispose());return geometry; };
export class Actors {
  private matrix=new THREE.Matrix4();
  private scale=new THREE.Vector3();
  private color=new THREE.Color();
  private point=new THREE.Vector3();
  private carParts:THREE.InstancedMesh[]=[];
  private peopleParts:THREE.InstancedMesh[]=[];
  private legs:THREE.InstancedMesh;
  private poles:THREE.InstancedMesh;
  private paths:THREE.Vector3[][]=[];
  private taxiPath:THREE.Vector3[];
  private lengths:number[]=[];
  private signature='';
  visiblePeople=0;visibleVehicles=0;visibleTaxis=0;
  constructor(scene:THREE.Scene){
    const mesh=(geometry:THREE.BufferGeometry,color:string,count:number)=>{
      const item=new THREE.InstancedMesh(geometry,new THREE.MeshLambertMaterial({color,flatShading:true}),count);item.instanceMatrix.setUsage(THREE.DynamicDrawUsage);item.frustumCulled=false;item.count=0;scene.add(item);return item;
    };
    this.carParts.push(mesh(new THREE.BoxGeometry(.20,.16,.44),'#ffffff',68));
    this.carParts.push(mesh(merged([new THREE.BoxGeometry(.205,.067,.27).translate(0,.033,0),new THREE.BoxGeometry(.17,.075,.012).translate(0,.025,.224)]),'#a6cdd2',68));
    const wheels:THREE.BufferGeometry[]=[];
    for(const x of [-.105,.105])for(const z of [-.14,.14])wheels.push(new THREE.CylinderGeometry(.043,.043,.025,8).rotateZ(Math.PI/2).translate(x,-.069,z));
    this.carParts.push(mesh(merged(wheels),'#263c41',68));
    this.carParts.push(mesh(merged([new THREE.BoxGeometry(.04,.025,.015).translate(-.065,-.025,.228),new THREE.BoxGeometry(.04,.025,.015).translate(.065,-.025,.228)]),'#ffe9b0',68));
    this.carParts.push(mesh(new THREE.BoxGeometry(.11,.035,.22).translate(0,.097,-.02),'#e1e0cc',68));
    this.poles=mesh(merged([new THREE.BoxGeometry(.012,.22,.012).rotateX(.6).translate(-.04,.18,-.04),new THREE.BoxGeometry(.012,.22,.012).rotateX(.6).translate(.04,.18,-.04)]),'#4b6165',60);
    this.peopleParts.push(mesh(new THREE.BoxGeometry(.06,.095,.04).translate(0,.16,0),'#ffffff',96));
    this.peopleParts.push(mesh(new THREE.IcosahedronGeometry(.032,1).translate(0,.24,0),'#dcb392',96));
    this.peopleParts.push(mesh(merged([new THREE.BoxGeometry(.018,.09,.022).translate(-.044,.15,0),new THREE.BoxGeometry(.018,.09,.022).translate(.044,.15,0)]),'#dcb392',96));
    this.peopleParts.push(mesh(new THREE.BoxGeometry(.058,.025,.048).translate(0,.263,-.005),'#4b4439',96));
    this.peopleParts.push(mesh(merged([new THREE.BoxGeometry(.008,.008,.008).translate(-.012,.243,.028),new THREE.BoxGeometry(.008,.008,.008).translate(.012,.243,.028)]),'#38494b',96));
    this.legs=mesh(new THREE.BoxGeometry(.023,.09,.026).translate(0,.065,0),'#3c5769',192);
    this.taxiPath=[...roadPath(D.districts[0],D.districts[8]),...roadPath(D.districts[8],D.districts[9]).slice(1),...roadPath(D.districts[9],D.districts[0]).slice(1)].map(p=>new THREE.Vector3(p[0],.23,p[1]));
  }
  updatePaths(w:World){
    const signature=JSON.stringify(w.routes.map(r=>[r.mode,r.stops]));if(signature===this.signature)return;this.signature=signature;
    this.paths=w.routes.map(r=>r.stops.slice(1).flatMap((id,i)=>alignment(r.mode,w.districts[r.stops[i]],w.districts[id]).map(p=>new THREE.Vector3(p[0],.23,p[1]))));
    this.lengths=this.paths.map(path=>path.reduce((s,p,i)=>i?s+p.distanceTo(path[i-1]):0,0));
  }
  private position(path:THREE.Vector3[],progress:number,reverse:boolean,sx:number,sz:number){
    for(let k=1;k<path.length;k++){
      const distance=path[k].distanceTo(path[k-1]);if(progress>distance){progress-=distance;continue;}
      this.point.copy(path[k-1]).lerp(path[k],distance?progress/distance:0);
      const angle=Math.atan2(path[k].x-path[k-1].x,path[k].z-path[k-1].z)+(reverse?Math.PI:0);
      this.point.x+=Math.cos(angle)*.09;this.point.z-=Math.sin(angle)*.09;
      this.matrix.makeRotationY(angle);this.scale.set(sx,1,sz);this.matrix.scale(this.scale);this.matrix.setPosition(this.point);return true;
    }return false;
  }
  draw(w:World,time:number,zoom:number,quality:Quality,center:THREE.Vector3){
    this.updatePaths(w);let cars=0,poles=0;const event=eventConfig(w),detail=zoom>1.35;
    for(let i=0;i<w.routes.length;i++){
      const route=w.routes[i],path=this.paths[i],length=this.lengths[i];
      if(route.mode==='metro'||!length||(event?.id==='repair'&&route.stops.includes(event.district)))continue;
      for(let v=0;v<route.vehicles;v++){
        let progress=(time*.65/T[route.mode].minutesPerUnit*(event?.speed??1)+v*length*2/Math.max(1,route.vehicles))%(length*2);const reverse=progress>length;if(reverse)progress=length*2-progress;
        if(!this.position(path,progress,reverse,route.mode==='marshrutka'?1:1.25,route.mode==='suburban'?3:route.mode==='tram'?2.1:route.mode==='marshrutka'?1:1.65))continue;
        this.carParts.forEach(part=>part.setMatrixAt(cars,this.matrix));this.color.set(D.colors[(route.id-1)%D.colors.length]);this.carParts[0].setColorAt(cars++,this.color);
        if(route.mode==='tram'||route.mode==='trolleybus')this.poles.setMatrixAt(poles++,this.matrix);
      }
    }
    const taxiCount=Math.min(8,Math.ceil(w.mobility.taxi/2)),taxiLength=this.taxiPath.reduce((s,p,i)=>i?s+p.distanceTo(this.taxiPath[i-1]):0,0);
    for(let i=0;i<taxiCount;i++)if(this.position(this.taxiPath,(time*.45*(event?.speed??1)+i*taxiLength/taxiCount)%taxiLength,false,.8,.75)){
      this.carParts.forEach(part=>part.setMatrixAt(cars,this.matrix));this.color.set('#e8b841');this.carParts[0].setColorAt(cars++,this.color);
    }
    this.visibleVehicles=cars-taxiCount;this.visibleTaxis=taxiCount;
    this.carParts.forEach((part,i)=>{part.count=cars;part.visible=i<2||detail;part.instanceMatrix.needsUpdate=true;});
    if(this.carParts[0].instanceColor)this.carParts[0].instanceColor.needsUpdate=true;
    this.poles.count=poles;this.poles.visible=detail;this.poles.instanceMatrix.needsUpdate=true;
    let people=0;const cap=quality==='low'?32:quality==='medium'?64:96;
    if(detail)for(const d of w.districts){
      if(Math.hypot(d.x-center.x,d.y-center.z)>6)continue;
      const waiting=w.queues[d.id].reduce((s,n)=>s+n,0),count=Math.min(24,Math.ceil(d.population/180+w.demand[d.id]/3+waiting/2));
      for(let i=0;i<count&&people<cap;i++){
        const inQueue=i<Math.min(12,Math.ceil(waiting/2)),walk=inQueue?i*.08:(time*.15+i*.19)%1.8;
        const x=d.x+.34+(inQueue?0:Math.floor(i/8)*.08),z=d.y-.8+walk;
        this.matrix.makeRotationY(inQueue?-Math.PI/2:0);this.matrix.setPosition(x,.07,z);
        this.peopleParts.forEach(part=>part.setMatrixAt(people,this.matrix));this.color.setHSL(((d.id*31+i*47)%360)/360,.4,.48);this.peopleParts[0].setColorAt(people,this.color);
        for(let foot=0;foot<2;foot++){const stride=inQueue?0:Math.sin(time*6+i+foot*Math.PI)*.035;this.matrix.makeTranslation(x+(foot?-.016:.016),.07,z+stride);this.legs.setMatrixAt(people*2+foot,this.matrix);}
        people++;
      }
    }
    this.visiblePeople=people;
    this.peopleParts.forEach((part,i)=>{part.count=people;part.visible=i<3||zoom>2;part.instanceMatrix.needsUpdate=true;});
    if(this.peopleParts[0].instanceColor)this.peopleParts[0].instanceColor.needsUpdate=true;
    this.legs.count=people*2;this.legs.instanceMatrix.needsUpdate=true;
  }
}
