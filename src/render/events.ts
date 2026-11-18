import * as THREE from 'three';
import type { World } from '../sim/types';
import type { Quality } from '../core/settings';
import { CityGeometry } from './geometry';
export class EventView {
  private snow: THREE.Points;
  private rain: THREE.LineSegments;
  private weatherTime = 0;
  private repair: THREE.Group;
  private forecast: THREE.Group;
  private match: THREE.Group;
  private fair: THREE.Group;
  private snowPositions = new Float32Array(960 * 3);
  private rainPositions = new Float32Array(360 * 6);
  constructor(scene: THREE.Scene) {
    const snowGeometry=new THREE.BufferGeometry();snowGeometry.setAttribute('position',new THREE.BufferAttribute(this.snowPositions,3).setUsage(THREE.DynamicDrawUsage));
    const sizes=Float32Array.from({length:960},(_,i)=>2.5+(i*0.618%1)*4.5);
    snowGeometry.setAttribute('flakeSize',new THREE.BufferAttribute(sizes,1));
    this.snow=new THREE.Points(snowGeometry,new THREE.ShaderMaterial({
      uniforms:{pixelScale:{value:1}},transparent:true,depthWrite:false,
      vertexShader:`attribute float flakeSize; uniform float pixelScale; varying float softness;
        void main(){softness=flakeSize/7.0;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);gl_PointSize=flakeSize*pixelScale;}`,
      fragmentShader:`varying float softness;
        void main(){float r=length(gl_PointCoord-0.5)*2.0;if(r>1.0)discard;
          float alpha=(1.0-smoothstep(0.15,1.0,r))*mix(0.5,0.95,softness);
          gl_FragColor=vec4(0.93,0.97,1.0,alpha);}`
    }));
    this.snow.name='snowflakes';
    const rainGeometry=new THREE.BufferGeometry();rainGeometry.setAttribute('position',new THREE.BufferAttribute(this.rainPositions,3).setUsage(THREE.DynamicDrawUsage));
    this.rain=new THREE.LineSegments(rainGeometry,new THREE.LineBasicMaterial({color:'#a7cddd',transparent:true,opacity:.65}));
    this.snow.frustumCulled=this.rain.frustumCulled=false;
    const g=new CityGeometry(),f=new CityGeometry();
    for(let i=0;i<8;i++){
      const x=3.35+(i%4)*.42,z=6.5+Math.floor(i/4);
      g.add('box',i%2?'#dcb750':'#a75c3e',x,.25,z,.3,.3,.07);
      f.add('cone','#d1893e',x,.22,z,.11,.2,.11);
    }
    g.add('box','#b4a28a',4,.13,7,1,.05,.8);
    g.add('box','#dcab39',4.5,.31,7,.32,.27,.5);g.add('box','#536b73',4.5,.5,7,.25,.18,.23);
    g.add('box','#414e50',4.5,.18,7,.38,.12,.52);g.add('box','#d6a23a',4.2,.64,7,.55,.08,.08);
    this.repair=g.finish();this.forecast=f.finish();
    const match=new CityGeometry();
    for(let i=0;i<96;i++){const side=i%2?1:-1;match.add('box',i%3?'#d6a14c':'#cc6150',12+side*(1.04+Math.floor(i/32)*.1),.34+Math.floor(i/32)*.1,7.65+(i%32)*.06,.07,.12,.055);}
    for(let i=0;i<22;i++){match.add('box',i<11?'#c34e44':'#e9dbac',11.4+(i%4)*.4,.19,7.9+Math.floor(i/4)*.27,.07,.15,.055);match.add('round','#dfb58c',11.4+(i%4)*.4,.29,7.9+Math.floor(i/4)*.27,.065,.065,.065);}
    match.add('round','#f5eddf',12,.14,8.6,.07,.07,.07);this.match=match.finish();
    const fair=new CityGeometry();for(let i=0;i<12;i++)fair.add('round',i%2?'#d99a49':'#e3c891',2.5+(i%4)*.3,.8+Math.sin(i)*.15,3.3+Math.floor(i/4)*.18,.12,.17,.12);this.fair=fair.finish();
    scene.add(this.snow,this.rain,this.repair,this.forecast,this.match,this.fair);
  }
  update(w:World,time:number,quality:Quality,center:THREE.Vector3,dt=1/60,zoom=1,pixelRatio=1){
    this.weatherTime+=dt;
    const id=w.event?.id;
    this.repair.visible=id==='repair';this.forecast.visible=w.nextEvent.id==='repair'&&id!=='repair';
    this.match.visible=id==='match';this.fair.visible=id==='fair';this.snow.visible=id==='snow';this.rain.visible=id==='rain';
    if(id!=='snow'&&id!=='rain')return;
    const snowing=id==='snow',clock=snowing?this.weatherTime:time;
    const count=snowing?(quality==='low'?280:quality==='medium'?600:960):(quality==='low'?100:quality==='medium'?220:360);
    (this.snow.material as THREE.ShaderMaterial).uniforms.pixelScale.value=pixelRatio*Math.min(1.6,Math.max(.8,zoom));
    for(let i=0;i<count;i++){
      const phase=i*2.39996,fall=snowing?.45+(i*.17%1)*.65:6;
      const x=center.x+((i*7.37+clock*(snowing?.26:.6))%22)-11+(snowing?Math.sin(clock*.7+phase)*.45:0);
      const z=center.z+((i*3.73)%22)-11+(snowing?Math.cos(clock*.45+phase)*.32:0);
      const y=8-((clock*fall+i*.47)%8);
      if(snowing){const k=i*3;this.snowPositions[k]=x;this.snowPositions[k+1]=y;this.snowPositions[k+2]=z;}
      else{const k=i*6;this.rainPositions[k]=x;this.rainPositions[k+1]=y;this.rainPositions[k+2]=z;this.rainPositions[k+3]=x-.06;this.rainPositions[k+4]=y-.4;this.rainPositions[k+5]=z;}
    }
    const geometry=snowing?this.snow.geometry:this.rain.geometry;
    geometry.setDrawRange(0,snowing?count:count*2);
    geometry.attributes.position.needsUpdate=true;
  }
}
