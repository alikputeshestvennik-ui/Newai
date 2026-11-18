import * as T from 'three';
import {RoomEnvironment} from 'three/examples/jsm/environments/RoomEnvironment.js';
import {launch, standard, watch, type Art} from './models';
import {text, type Phase, type Contact} from '../story/episode';

const clamp=T.MathUtils.clamp;
const vertex=`varying vec2 screenUV;
void main(){screenUV=uv;gl_Position=vec4(position.xy,1.,1.);}`;
const fragment=`uniform sampler2D plate;uniform vec2 viewScale;uniform vec2 offset;
uniform float time;uniform float outside;varying vec2 screenUV;
void main(){
 vec2 uv=(screenUV-.5)*viewScale+.5+offset;
 if(outside>.5 && uv.y<0.) uv.y=-uv.y;
 float wet=(1.-smoothstep(.21,.305,uv.y))*outside;
 uv.x+=wet*.0014*(sin(uv.y*225.+time*1.4)+sin(uv.x*71.+uv.y*149.-time));
 uv.y+=wet*.0012*sin(uv.y*194.-time*1.6+uv.x*33.);
 vec3 color=texture2D(plate,clamp(uv,vec2(.001),vec2(.999))).rgb;
 gl_FragColor=vec4(color,1.);
 #include <colorspace_fragment>
}`;

export async function buildScene(host:HTMLElement) {
  const renderer=new T.WebGLRenderer({antialias:true,powerPreference:'high-performance',alpha:false});
  host.append(renderer.domElement);
  const keys=['workshop','canal','face','lion','hand','boatman'] as const;
  const loader=new T.TextureLoader();
  const art=Object.fromEntries(await Promise.all(keys.map(async k=>{
    const tex=await loader.loadAsync('./art/'+k+'.webp');tex.colorSpace=T.SRGBColorSpace;return [k,tex];
  }))) as Art;
  const scene=new T.Scene(), camera=new T.PerspectiveCamera(48,1,0.05,100);
  const pmrem=new T.PMREMGenerator(renderer),room=new RoomEnvironment();
  scene.environment=pmrem.fromScene(room,0.05).texture; scene.environmentIntensity=0.65;room.dispose();pmrem.dispose();
  const uniforms={plate:{value:art.canal},viewScale:{value:new T.Vector2(1,1)},offset:{value:new T.Vector2()},time:{value:0},outside:{value:1}};
  const plate=new T.Mesh(new T.PlaneGeometry(2,2),new T.ShaderMaterial({uniforms,vertexShader:vertex,fragmentShader:fragment,depthTest:false,depthWrite:false}));
  plate.frustumCulled=false;plate.renderOrder=-100;scene.add(plate);
  const sun=new T.DirectionalLight(0xffecc6,2.3);sun.position.set(3,4,3);scene.add(sun,new T.HemisphereLight(0xffeed1,0x564b40,1.2));
  const interior=new T.Group(), canal=new T.Group();scene.add(interior,canal);
  const pocket=watch(art);interior.add(pocket);
  const hand=new T.Mesh(new T.PlaneGeometry(1.94,1.95),new T.MeshBasicMaterial({map:art.hand,transparent:true,alphaTest:0.08}));
  interior.add(hand);
  const launches=[launch(art,true),launch(art,false)];canal.add(...launches.map(b=>b.root));
  const wash=document.createElement('canvas');wash.width=256;wash.height=64;
  const washCtx=wash.getContext('2d')!;
  washCtx.save();washCtx.scale(4,1);
  const shade=washCtx.createRadialGradient(32,32,2,32,32,32);
  shade.addColorStop(0,'rgba(34,28,17,.64)');shade.addColorStop(.63,'rgba(44,35,23,.38)');shade.addColorStop(1,'rgba(35,29,21,0)');
  washCtx.fillStyle=shade;washCtx.fillRect(0,0,64,64);washCtx.restore();
  const shadowMaterial=new T.MeshBasicMaterial({map:new T.CanvasTexture(wash),depthWrite:false,transparent:true,polygonOffset:true,polygonOffsetFactor:1});
  for(const b of launches){
    const shadow=new T.Mesh(new T.PlaneGeometry(4.65,1.63),shadowMaterial);
    shadow.rotation.x=-Math.PI/2;shadow.position.y=-.10;b.root.add(shadow);
  }
  const wakeMat=new T.MeshBasicMaterial({color:0xe8e1b7,transparent:true,opacity:0.36,depthWrite:false});
  const ripple=new T.Mesh(new T.RingGeometry(0.88,1,40),wakeMat);ripple.rotation.x=-Math.PI/2;canal.add(ripple);
  for(const b of launches){
    for(const side of [-1,1]){
      const geometry=new T.BufferGeometry().setFromPoints([[0.8,0.02,0.47],[0,0.015,0.54],[-1.3,0.01,0.62],[-2.4,0.005,0.75],[-3,0,0.85]].map(([x,y,z])=>new T.Vector3(x,y,z*side)));
      b.root.add(new T.Line(geometry,new T.LineBasicMaterial({color:0xd0d5b8,transparent:true,opacity:.43})));
    }
  }
  const quay=new T.Group();scene.add(quay);
  const stone=standard(0xad9a7e),metal=standard(0x3d493f,0.6);
  const coping=new T.Mesh(new T.BoxGeometry(12,0.17,0.7),stone);coping.position.set(0,-1.2,-2.8);quay.add(coping);
  for(const x of [-4.6,-2.4,2.4,4.6]){
    const post=new T.Mesh(new T.CylinderGeometry(0.09,0.12,1.8,18),metal);post.position.set(x,-0.46,-3.1);quay.add(post);
    const finial=new T.Mesh(new T.SphereGeometry(.13,18,12),metal);finial.position.set(x,.49,-3.1);quay.add(finial);
  }
  const rail=new T.Mesh(new T.CylinderGeometry(.035,.035,12,12),metal);rail.position.set(0,.19,-3.1);rail.rotation.z=Math.PI/2;quay.add(rail);
  const specks=new Float32Array(90);
  for(let i=0;i<90;i++)specks[i]=Math.sin(i*29.41)*(i%3===2?0.65:2.7);
  const dust=new T.Points(new T.BufferGeometry().setAttribute('position',new T.BufferAttribute(specks,3)),
    new T.PointsMaterial({color:0xffdf93,size:0.006,opacity:.39,transparent:true,depthWrite:false}));
  interior.add(dust); dust.position.z=-2.12;
  const ray=new T.Raycaster(), pointer=new T.Vector2(), point=new T.Vector3(), waterPlane=new T.Plane(new T.Vector3(0,1,0),1.66);
  const targets=launches.map(b=>b.target);
  let phase:Phase='quay',turn=0,tilt=0,yaw=0,pitch=0,clock=0,age=0,splash=-1,zoom=false;
  let dpr=Math.min(window.devicePixelRatio||1,1.65), slow=0;
  function resize(){
    const w=host.clientWidth,h=host.clientHeight;camera.aspect=w/Math.max(h,1);
    renderer.setPixelRatio(dpr);renderer.setSize(w,h,false);camera.updateProjectionMatrix();
  }
  const observer=new ResizeObserver(resize);observer.observe(host);resize();
  function setPhase(next:Phase){
    if(phase===next)return;
    phase=next;age=0;
    if(next==='quay'||next==='aim'){clock=0;yaw=0;pitch=0;zoom=false;splash=-1;}
    if(next==='table'){turn=0;tilt=0;}
  }
  function drag(dx:number,dy:number){
    if(phase==='inspect'){
      turn+=dx/Math.min(host.clientWidth,host.clientHeight)*7;
      tilt=clamp(tilt+dy/host.clientHeight*2,-0.65,0.65);
    }else if(phase==='aim'||phase==='quay'){
      const gain=(zoom?0.53:1)*0.95/host.clientHeight;
      yaw=clamp(yaw+dx*gain,-0.48,0.48);pitch=clamp(pitch+dy*gain,-0.17,0.12);
    }
  }
  function update(dt:number,rawDt:number){
    clock+=dt;age+=dt;
    if(rawDt>0.044)slow+=dt;else slow=Math.max(0,slow-dt);
    if(slow>2.8 && dpr>0.81){dpr=Math.max(.8,dpr-.22);resize();slow=0;}
    const outside=phase==='aim'||phase==='won'||phase==='quay';
    canal.visible=outside;interior.visible=!outside;quay.visible=phase==='quay';
    uniforms.plate.value=outside?art.canal:art.workshop;uniforms.outside.value=outside?1:0;
    const base=camera.aspect<0.85?58:48,desired=base*(zoom&&outside?0.64:1);
    camera.fov=T.MathUtils.damp(camera.fov,desired,11,dt);camera.updateProjectionMatrix();
    camera.rotation.order='YXZ';camera.rotation.set(outside?pitch:0,outside?yaw:0,0,'YXZ');
    camera.position.set(0,0,phase==='quay'?0.3*Math.exp(-age*0.65):0);
    const ratio=Math.tan(T.MathUtils.degToRad(camera.fov/2))/Math.tan(T.MathUtils.degToRad(base/2));
    const sy=Math.min(.83,2.84/camera.aspect)*ratio;
    uniforms.viewScale.value.set(sy*camera.aspect/3,sy);
    const offset=uniforms.offset.value;
    const tangent=Math.tan(T.MathUtils.degToRad(camera.fov/2));
    // Align the photographed waterline with the height of the far quay.
    const bankY=0.305+sy*(1.65/19+Math.tan(pitch))/(2*tangent);
    offset.set(outside?-yaw*0.30:(phase==='table'?0:.022),outside?bankY-.5:0);
    offset.x=clamp(offset.x,-(1-uniforms.viewScale.value.x)/2,(1-uniforms.viewScale.value.x)/2);
    if(!outside)offset.y=clamp(offset.y,-(1-sy)/2,(1-sy)/2);
    uniforms.time.value=clock;
    if(!outside){
      const inHand=phase!=='table', rise=inHand?Math.min(age*2.2,1):0;
      const t=phase==='inspect'?T.MathUtils.smootherstep(rise,0,1):inHand?1:0;
      pocket.scale.setScalar(T.MathUtils.lerp(.87,.63,t));
      pocket.position.set(0,T.MathUtils.lerp(-.67,.02,t),T.MathUtils.lerp(-2.64,-2.26,t));
      if(phase==='found'){turn=T.MathUtils.damp(turn,Math.round((turn-Math.PI)/(2*Math.PI))*2*Math.PI+Math.PI,6,dt);tilt=T.MathUtils.damp(tilt,0,6,dt);}
      pocket.rotation.set(T.MathUtils.lerp(-1.1,tilt,t),turn,Math.sin(clock*1.1)*.018);
      hand.visible=inHand;hand.position.copy(pocket.position);hand.scale.setScalar(1.1);hand.position.x-=.09;hand.position.y-=.12;hand.position.z-=.18;
      hand.rotation.z=-.13+.035*Math.sin(turn);
      dust.rotation.z=Math.sin(clock*.10)*.045;
    }else{
      launches.forEach((b,i)=>{
        const theta=clock*2*Math.PI/text.rules.boatPeriod;
        const x=i===0?4.4*Math.sin(theta+.12):3.6*Math.sin(.82*theta+2.6);
        b.root.position.set(x,-1.65+.026*Math.sin(clock*2.2+i),i===0?-5.9:-8.9);
        b.root.rotation.set(.018*Math.sin(clock*1.6+i),.11*Math.cos(theta+i),.014*Math.sin(clock*2+i));
        b.man.rotation.z=.055*Math.sin(clock*2+i);b.oar.rotation.y=.29*Math.sin(clock*2+i);
        b.envelope.visible=phase==='won'&&i===0;
        b.gong.rotation.x=phase==='won'&&i===0?.30*Math.exp(-age)*Math.sin(age*15):0;
      });
      splash-=dt;ripple.visible=splash>0;const life=1-Math.max(0,splash)/.85;
      ripple.scale.setScalar(.06+life*.75);wakeMat.opacity=(1-life)*.65;
    }
    renderer.render(scene,camera);
    return -Math.cos(turn)*Math.cos(tilt);
  }
  function contact(nx:number,ny:number):Contact {
    pointer.set(nx,ny);ray.setFromCamera(pointer,camera);
    const hits=ray.intersectObjects(targets,false);
    // A nearer hull or its gong can conceal the other boat.
    if(hits.length){
      const first=ray.intersectObjects(launches.map(b=>b.root),true)
        .find(h=>!(h.object instanceof T.Line) && h.object instanceof T.Mesh &&
          !(h.object.material instanceof T.MeshBasicMaterial && h.object.material.transparent));
      if(!first||first.distance>=hits[0].distance-.007)return hits[0].object===targets[0]?'lion':'anchor';
    }
    if(ray.ray.intersectPlane(waterPlane,point)){ripple.position.copy(point);ripple.position.y+=.015;splash=.85;}
    return 'water';
  }
  function targetScreen(index:number) {
    targets[index].getWorldPosition(point).project(camera);
    return {x:(point.x+1)*host.clientWidth/2,y:(1-point.y)*host.clientHeight/2};
  }
  return {update,setPhase,drag,contact,targetScreen,toggleZoom:()=>zoom=!zoom,
    stats:()=>({calls:renderer.info.render.calls,triangles:renderer.info.render.triangles})};
}
