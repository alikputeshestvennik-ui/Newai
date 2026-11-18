import * as THREE from 'three';
import { D, T } from '../sim/config';
import type { World } from '../sim/types';
import { Actors } from './actors';
import { DevelopmentView } from './development';
import { EventView } from './events';
import { SnowCover } from './snow';
import { roadPath } from '../sim/roads';
import { eventConfig } from '../sim/events';
import { demandFlows } from '../sim/insights';
import feedback from '../../data/balance/feedback.json' with { type: 'json' };
import { t, number } from '../core/i18n';
import { MAP_LAYERS, type Layer } from '../core/layers';
import { MapCamera } from './camera';
import { Scenery } from './scenery';
import { Atmosphere } from './atmosphere';
import type { Settings, Quality } from '../core/settings';
export class CityMap {
  private scene = new THREE.Scene();
  private controls: MapCamera;
  private scenery: Scenery;
  private atmosphere: Atmosphere;
  private quality: Quality = 'medium';
  private time: Settings['time'] = 'auto';
  private slowSeconds = 0;
  private daylight = 1;
  onQuality: (quality: Quality) => void = () => {};
  private renderer: THREE.WebGLRenderer;
  private projected = new THREE.Vector3();
  private labelCamera = new THREE.Matrix4();
  private currentCamera = new THREE.Matrix4();
  private positionedLabels = -1;
  private matrix = new THREE.Matrix4();
  private stops: THREE.Mesh[] = [];
  private labels: HTMLButtonElement[] = [];
  private lines = new THREE.Group();
  private flowArrows = new THREE.LineSegments(new THREE.BufferGeometry(),new THREE.LineBasicMaterial({color:'#5bff83',depthTest:false,transparent:true,opacity:.55}));
  private flowSignature = '';
  private actors: Actors;
  private development: DevelopmentView;
  private events: EventView;
  private snowCover = new SnowCover();
  private heat = new Map<Layer, THREE.InstancedMesh>();
  private tint=new THREE.Color();
  private signature = '';
  private observer: ResizeObserver;
  private width = 1;
  private height = 1;
  private frames = 0;
  private fps = 0;
  private lastCounter = performance.now() / 1000;
  onStop: (id: number) => void = () => {};
  set building(value: boolean) { this.controls.building = value; }
  readonly layers = new Set<Layer>();
  constructor(private host: HTMLElement) {
    this.renderer = new THREE.WebGLRenderer({ antialias: false, alpha: false, powerPreference: 'low-power' });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
    this.renderer.domElement.setAttribute('aria-label', t('mapLabel'));
    host.append(this.renderer.domElement);
    this.controls = new MapCamera(this.renderer.domElement,host); this.controls.onStop = id => this.onStop(id);
    this.scenery = new Scenery(this.scene); this.atmosphere = new Atmosphere(this.scene, this.scenery.windows);
    this.actors = new Actors(this.scene);this.development = new DevelopmentView(this.scene);this.events = new EventView(this.scene);
    this.scene.add(this.lines,this.flowArrows);this.flowArrows.renderOrder=3;
    const shapes=[new THREE.CircleGeometry(.48,24),new THREE.RingGeometry(.55,.62,24),new THREE.RingGeometry(.70,.77,24)];
    MAP_LAYERS.forEach((layer,index)=>{
      const heat=new THREE.InstancedMesh(shapes[index],new THREE.MeshBasicMaterial({transparent:true,opacity:0.32,depthWrite:false,depthTest:false}),20);
      heat.renderOrder=4;heat.instanceMatrix.setUsage(THREE.DynamicDrawUsage);heat.visible=false;heat.frustumCulled=false;
      this.heat.set(layer.id,heat);this.scene.add(heat);
    });
    this.observer=new ResizeObserver(()=>this.resize()); this.observer.observe(host);
    this.resize();
  }
  private resize() {
    this.positionedLabels = -1;
    this.width=this.host.clientWidth;this.height=this.host.clientHeight;
    this.renderer.setSize(this.width,this.height); this.controls.resize(this.width,this.height);
  }
  configure(settings: Settings) {
    this.quality=settings.quality;this.time=settings.time;this.slowSeconds=0;
    this.renderer.setPixelRatio(Math.min(devicePixelRatio || 1,settings.quality==='low'?1:settings.quality==='medium'?1.5:2));this.resize();
  }
  changeZoom(factor:number){this.controls.changeZoom(factor);}
  rotate(delta:number){this.controls.rotate(delta);}
  recenter(){this.controls.recenter();}
  get light(){return this.daylight;}
  update(world:World,draft:number[],endpoint?:number) {
    const flows=this.layers.has('demand')?demandFlows(world):[],hourly=world.districts.map(()=>0);
    for(const flow of flows)hourly[flow.from]+=flow.perHour;
    const top=flows.slice(0,feedback.topFlowCount),flowSignature=JSON.stringify(top.map(f=>[f.from,f.to]));
    this.flowArrows.visible=this.layers.has('demand');
    if(flowSignature!==this.flowSignature){
      this.flowSignature=flowSignature;const points:number[]=[];
      for(const flow of top){
        const a=world.districts[flow.from],b=world.districts[flow.to],dx=b.x-a.x,dz=b.y-a.y,len=Math.hypot(dx,dz);
        const x=a.x+dx*.72,z=a.y+dz*.72,ux=dx/len,uz=dz/len;
        points.push(a.x,.23,a.y,x,.23,z,x,.23,z,x-ux*.45-uz*.2,.23,z-uz*.45+ux*.2,x,.23,z,x-ux*.45+uz*.2,.23,z-uz*.45-ux*.2);
      }
      this.flowArrows.geometry.dispose();this.flowArrows.geometry=new THREE.BufferGeometry();
      this.flowArrows.geometry.setAttribute('position',new THREE.Float32BufferAttribute(points,3));
    }
    this.controls.districts=world.districts;this.development.update(world);
    this.host.dataset.layers=MAP_LAYERS.filter(layer=>this.layers.has(layer.id)).map(layer=>layer.id).join(' ');
    while(this.stops.length>world.districts.length){const stop=this.stops.pop()!;stop.geometry.dispose();(stop.material as THREE.Material).dispose();stop.removeFromParent();this.labels.pop()!.remove();}
    for(let id=this.stops.length;id<world.districts.length;id++){
      const d=world.districts[id];
      const stop=new THREE.Mesh(new THREE.CylinderGeometry(.18,.18,.06,16),new THREE.MeshBasicMaterial({color:'#31896b'}));stop.position.set(d.x,.17,d.y);this.stops.push(stop);this.scene.add(stop);
      const label=document.createElement('button');label.className='stop-label';label.setAttribute('aria-label',t(d.name));label.dataset.stop=String(d.id);label.onclick=e=>{if(e.detail===0)this.onStop(d.id);};
      const name=document.createElement('span');name.textContent=t(d.name);label.append(name);
      for(const layer of MAP_LAYERS){const value=document.createElement('span');value.dataset.value=layer.id;value.style.setProperty('--layer-color',layer.color);value.hidden=true;label.append(value);}
      this.host.append(label);this.labels.push(label);
    }
    for(const [layer,heat] of this.heat){heat.count=world.districts.length;heat.visible=this.layers.has(layer);}
    const signature=JSON.stringify([world.routes.map(r=>[r.id,r.stops,r.vehicles,r.mode]),draft,world.event?.id]);
    if(signature!==this.signature){
      this.signature=signature;
      for(const child of [...this.lines.children]){const line=child as THREE.Line;line.geometry.dispose();(line.material as THREE.Material).dispose();this.lines.remove(line);}
      for(const r of [...world.routes,{id:0,stops:draft,vehicles:0}]){
        const points:THREE.Vector3[]=[];
        for(let j=1;j<r.stops.length;j++){
          const a=world.districts[r.stops[j-1]],b=world.districts[r.stops[j]];
          points.push(...roadPath(a,b).map(p=>new THREE.Vector3(p[0],.15,p[1])));
        }
        if(points.length){const line=new THREE.Line(new THREE.BufferGeometry().setFromPoints(points),new THREE.LineBasicMaterial({color:r.id?D.colors[(r.id-1)%D.colors.length]:'#e28e42',depthTest:false}));line.renderOrder=5;this.lines.add(line);}
      }
    }
    for(const d of world.districts){
      const waiting=world.queues[d.id].reduce((s,n)=>s+n,0),generated=world.demand[d.id];
      const event=eventConfig(world);
      const capacity=world.routes.filter(r=>r.stops.includes(d.id)&&!(event?.id==='repair'&&r.stops.includes(event.district))).reduce((s,r)=>s+r.vehicles*T[r.mode].capacity,0);
      const load=waiting/Math.max(1,capacity);
      const complaint=generated>0?(capacity?Math.min(1,load):1):0;
      this.matrix.makeRotationX(-Math.PI/2);this.matrix.setPosition(d.x,0.13,d.y);
      for(const layer of MAP_LAYERS){
        const active=this.layers.has(layer.id),value=this.labels[d.id].children[MAP_LAYERS.indexOf(layer)+1] as HTMLElement;value.hidden=!active;
        if(!active)continue;
        const intensity=layer.id==='demand'?Math.min(1,hourly[d.id]/feedback.demandHighPerHour):layer.id==='load'?Math.min(1,load):complaint;
        this.tint.set(layer.color).multiplyScalar(.12+intensity*.88);
        const heat=this.heat.get(layer.id)!;heat.setMatrixAt(d.id,this.matrix);heat.setColorAt(d.id,this.tint);
        const count=layer.id==='demand'?hourly[d.id].toLocaleString('ru-RU',{maximumFractionDigits:1}):number((layer.id==='load'?load:complaint)*100);
        value.textContent=t(layer.value,{count});
      }
      (this.stops[d.id].material as THREE.MeshBasicMaterial).color.set(draft.includes(d.id)?'#e28e42':'#31896b');
      this.stops[d.id].scale.setScalar(draft.includes(d.id)?1.6:1);
      this.labels[d.id].classList.toggle('analytical',this.layers.size>0);
      this.labels[d.id].title=Array.from(this.labels[d.id].children).filter(el=>!(el as HTMLElement).hidden).map(el=>el.textContent).join('\n');
      this.labels[d.id].classList.toggle('selected',draft.includes(d.id));
      this.labels[d.id].classList.toggle('extend-endpoint',d.id===endpoint);
    }
    for(const heat of this.heat.values())if(heat.visible){heat.instanceMatrix.needsUpdate=true;if(heat.instanceColor)heat.instanceColor.needsUpdate=true;}
  }

  draw(time:number,world:World,dt=1/60,minute=world.minute){
    this.controls.update(dt);this.scenery.update(this.controls.camera,this.controls.zoom,this.quality);
    this.daylight=this.atmosphere.update(minute,this.time,world.event?.id,dt);
    this.snowCover.update(this.scene,world.event?.id==='snow',dt);
    this.events.update(world,time,this.quality,this.controls.center,dt,this.controls.zoom,this.renderer.getPixelRatio());this.host.dataset.event=world.event?.id??'';
    this.actors.draw(world,time,this.controls.zoom,this.quality,this.controls.center);
    this.host.dataset.people=String(this.actors.visiblePeople);this.host.dataset.vehicles=String(this.actors.visibleVehicles);this.host.dataset.taxis=String(this.actors.visibleTaxis);
    this.currentCamera.multiplyMatrices(this.controls.camera.projectionMatrix,this.controls.camera.matrixWorldInverse);
    if(this.positionedLabels!==world.districts.length || !this.labelCamera.equals(this.currentCamera)){
      this.positionedLabels=world.districts.length;this.labelCamera.copy(this.currentCamera);
      for(const d of world.districts){
      this.projected.set(d.x,0.2,d.y).project(this.controls.camera);const label=this.labels[d.id];
      label.style.maxWidth=`${Math.max(44,Math.min(140,3*this.width/(this.controls.camera.right-this.controls.camera.left)-4))}px`;
      label.style.left=`${(this.projected.x+1)*this.width/2}px`;label.style.top=`${(-this.projected.y+1)*this.height/2}px`;
      label.hidden=Math.abs(this.projected.x)>1||Math.abs(this.projected.y)>1;
      }
    }
    this.renderer.render(this.scene,this.controls.camera);this.frames++;
    const wallTime = performance.now() / 1000;
    if(wallTime-this.lastCounter>=1){this.fps=Math.round(this.frames/(wallTime-this.lastCounter));this.frames=0;this.lastCounter=wallTime;
      if(this.fps>0&&this.fps<25)this.slowSeconds++;else this.slowSeconds=0;
      if(this.slowSeconds>=8&&this.quality!=='low'){
        const quality=this.quality==='high'?'medium':'low';this.configure({version:1,quality,time:this.time,sound:false});this.onQuality(quality);
      }
    }
  }
  dispose(){
    this.observer.disconnect();
    const geometries=new Set<THREE.BufferGeometry>(),materials=new Set<THREE.Material>();
    this.scene.traverse(object=>{if(object instanceof THREE.Mesh||object instanceof THREE.Line||object instanceof THREE.Points){geometries.add(object.geometry);const list=Array.isArray(object.material)?object.material:[object.material];for(const material of list)materials.add(material);}});
    geometries.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());this.renderer.dispose();this.labels.forEach(label=>label.remove());
  }
  stats(){return `${this.fps} FPS · ${this.renderer.info.render.calls} calls · ${this.renderer.info.render.triangles} triangles`;}
}
