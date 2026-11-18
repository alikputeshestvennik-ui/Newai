import './style.css';
import {advance,newGame,signal,text,tick} from './story/episode';
import {buildScene} from './render/scene';
import {play,setSound,wake} from './audio';

const el=<E extends HTMLElement=HTMLElement>(id:string)=>document.getElementById(id) as E;
const game=newGame(), stage=el('stage'), act=el<HTMLButtonElement>('act'), zoom=el<HTMLButtonElement>('zoom');
const light=el<HTMLProgressElement>('light'),loading=el('loading'),notice=el('notice');
const sound=el<HTMLButtonElement>('sound'),metrics=el<HTMLButtonElement>('metrics');
el('location').textContent=text.location;loading.textContent=text.loading;
light.setAttribute('aria-label',text.light);sound.setAttribute('aria-label',text.sound);metrics.setAttribute('aria-label',text.stats);
let enabled=true, showStats=false, noticeTime=0, zoomed=false;
let scene:Awaited<ReturnType<typeof buildScene>>;
function paint() {
  scene.setPhase(game.phase);
  const [place,title,detail,action]=text[game.phase];
  document.body.dataset.phase=game.phase;
  el('place').textContent=place; document.querySelector('h1')!.textContent=title;
  document.querySelector('#caption p')!.textContent=detail;
  act.textContent=action;act.hidden=!action;light.hidden=game.phase!=='inspect';
  zoom.hidden=game.phase!=='aim';el('reticle').hidden=zoom.hidden;
  if(game.phase==='aim')zoomed=false;
  zoom.textContent=zoomed?text.unzoom:text.zoom;
  notice.textContent='';
}
function feedback(message:string){ notice.textContent=message; noticeTime=1.8; }
function shoot(x:number,y:number){
  if(game.phase!=='aim'||game.cooldown>0)return;
  const result=scene.contact(x,y);
  if(!signal(game,result))return;
  if(result==='lion'){paint();play('gong');feedback(text.hit);}
  else {play(result==='anchor'?'tick':'water');feedback(result==='anchor'?text.wrong:text.miss);}
}
function action(){
  wake();
  if(game.phase==='aim'){shoot(0,0);return;}
  const old=game.phase;advance(game);if(game.phase!==old){paint();play(old==='found'?'water':'tick');}
}
function toggleZoom(){zoomed=scene.toggleZoom();zoom.textContent=zoomed?text.unzoom:text.zoom;}
function unavailable(){
  loading.hidden=false;loading.textContent=text.failed;
  const retry=document.createElement('button');retry.textContent=text.retry;retry.onclick=()=>location.reload();loading.append(retry);
}
async function start(){
  scene=await buildScene(stage);paint();loading.hidden=true;
  if(import.meta.env.DEV && new URLSearchParams(location.search).has('probe'))
    Object.assign(window,{veniceProbe:{target:scene.targetScreen,stats:scene.stats}});
  stage.addEventListener('webglcontextlost',e=>{e.preventDefault();unavailable();},true);
  act.onclick=action;zoom.onclick=()=>{wake();toggleZoom();};
  sound.onclick=()=>{enabled=!enabled;setSound(enabled);sound.setAttribute('aria-pressed',String(enabled));if(enabled){wake();play('tick');}};
  metrics.onclick=()=>{showStats=!showStats;el('stats').hidden=!showStats;metrics.setAttribute('aria-pressed',String(showStats));};
  let finger:number|null=null,prevX=0,prevY=0,dist=0;
  stage.onpointerdown=e=>{
    if(finger!==null)return;
    wake();finger=e.pointerId;prevX=e.clientX;prevY=e.clientY;dist=0;stage.setPointerCapture(e.pointerId);
  };
  stage.onpointermove=e=>{
    if(finger!==e.pointerId)return;
    const dx=e.clientX-prevX,dy=e.clientY-prevY;dist+=Math.hypot(dx,dy);scene.drag(dx,dy);
    prevX=e.clientX;prevY=e.clientY;
  };
  stage.onpointerup=e=>{
    if(finger!==e.pointerId)return;finger=null;
    if(dist>7)return;
    if(game.phase==='aim')shoot(e.clientX/stage.clientWidth*2-1,1-e.clientY/stage.clientHeight*2);
    else if(game.phase==='table'||game.phase==='quay')action();
  };
  stage.onlostpointercapture=stage.onpointercancel=()=>{finger=null;};
  let handle=0,last=0,elapsed=0,frames=0,tickTime=0;
  function frame(now:number){
    const raw=last?(now-last)/1000:1/60,dt=Math.min(.06,raw);last=now;
    const facing=scene.update(dt,raw),before=game.phase;tick(game,dt,facing);
    if(before!==game.phase){paint();play('clue');}
    if(game.phase==='inspect'){
      light.value=game.exposure/text.rules.exposureSeconds;
      tickTime+=dt;if(tickTime>=1){tickTime%=1;play('tick');}
    }
    if(noticeTime>0){noticeTime-=dt;if(noticeTime<=0)notice.textContent='';}
    elapsed+=raw;frames++;
    if(elapsed>=.6){
      if(showStats){const stats=scene.stats();el('stats').textContent=Math.round(frames/elapsed)+' FPS · '+stats.calls+' DC · △ '+stats.triangles;}
      elapsed=0;frames=0;
    }
    handle=requestAnimationFrame(frame);
  }
  document.addEventListener('visibilitychange',()=>{
    cancelAnimationFrame(handle);last=0;finger=null;
    if(!document.hidden)handle=requestAnimationFrame(frame);
  });
  handle=requestAnimationFrame(frame);
}
start().catch(err=>{console.error(err);unavailable();});
