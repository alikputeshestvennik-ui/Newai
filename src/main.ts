import { createWorld, getSnapshot, applyCommand, step } from './sim/world';
import { load, save } from './core/save';
import { E, MODES } from './sim/config';
import { reserved, unlocked } from './sim/commands';
import { t } from './core/i18n';
import { readSettings, writeSettings } from './core/settings';
import { CityAudio } from './core/audio';
import { Engagement } from './core/engagement';
import { CityMap } from './render/map';
import { GameUI } from './ui/app';
import { RouteDraft } from './core/route-draft';
import { TutorialGuide } from './ui/tutorial';
import './ui/style.css';
import './ui/compact.css';
import './ui/tutorial.css';
function start(){
  const storage={getItem:(key:string)=>window.localStorage.getItem(key),setItem:(key:string,value:string)=>window.localStorage.setItem(key,value)};
  const loaded=load(storage);let world=loaded.world,snapshot=getSnapshot(world);
  let engagement=new Engagement(world);
  const ui=new GameUI(document.getElementById('app')!);
  const map=new CityMap(ui.mapHost);
  const tutorial=new TutorialGuide(document.getElementById('app')!,storage);
  let settings=readSettings(storage);const audio=new CityAudio();map.configure(settings);ui.setSettings(settings);
  const persistSettings=()=>{if(!writeSettings(settings,storage))ui.toast('saveError');};
  ui.onSettings=next=>{settings=next;persistSettings();map.configure(settings);void audio.setEnabled(settings.sound).then(ok=>{if(!ok){settings.sound=false;ui.setSettings(settings);persistSettings();ui.toast('soundError');}});};
  map.onQuality=quality=>{settings.quality=quality;ui.setSettings(settings);persistSettings();ui.toast('qualityReduced');};
  document.addEventListener('pointerdown',()=>{if(settings.sound)void audio.setEnabled(true);},{once:true});
  let editing:number|undefined,editor:RouteDraft|undefined;
  let draft:number[]|null=null,speed=1,modal=false,accumulator=0,last=0,visualTime=0,saveElapsed=0,uiElapsed=0;
  let rewarded=world.goals.earned;
  const rewards=()=>{
    if(world.goals.earned<=rewarded)return;
    ui.celebrate(world,world.goals.earned-rewarded);rewarded=world.goals.earned;audio.cue();persist();
  };
  const refresh=()=>{snapshot=getSnapshot(world);ui.update(snapshot);map.update(snapshot,draft??[],editor?.extending?editor.endpoint:undefined);ui.build(draft,editing,editor);tutorial.render();};
  const persist=()=>{if(!save(world,storage))ui.toast('saveError');};
  const cancel=()=>{draft=null;editing=undefined;editor=undefined;map.building=false;accumulator=0;refresh();};
  ui.onCommand=cmd=>{
    const result=applyCommand(world,cmd);if(!result.ok){ui.toast(result.error);return;}
    const messages={storyChoice:'storySaved',changeRouteMode:'routeModeChanged',buyVehicle:'bought',assignVehicle:'assigned',releaseVehicle:'released',removeRoute:'removed',setFare:'fareChanged',serviceFleet:'serviced',takeLoan:'loanChanged',repayLoan:'loanChanged',editRoute:'edited',buildRoute:'newRoute'};
    engagement.decision();ui.toast(messages[cmd.type]);audio.cue();rewards();persist();refresh();
  };
  const begin=(id?:number,extending=false)=>{
    if(world.gameOver){ui.toast('gameOver');return;}
    editing=id;editor=new RouteDraft(id?world.routes.find(r=>r.id===id)!.stops:[],extending);draft=editor.stops;
    map.building=true;accumulator=0;ui.openPanel('map');refresh();
  };
  ui.onBuild=()=>begin();ui.onEdit=id=>begin(id);ui.onExtend=id=>{begin(id,true);tutorial.signal('extending');};ui.onCancel=()=>{cancel();ui.openPanel('routes');tutorial.signal('cancel');};
  ui.onSuggest=stops=>{ui.mode=MODES.find(mode=>unlocked(world,mode)&&reserved(world,mode)>0)??ui.mode;begin();if(draft){editor!.stops=[...stops];draft=editor!.stops;refresh();tutorial.signal('planned');}};
  ui.onConfirm=()=>{
    if(!draft||!editor||editing&&!editor.changed)return;
    const result=applyCommand(world,editing?{type:'editRoute',routeId:editing,stops:draft}:{type:'buildRoute',stops:draft,mode:ui.mode});
    if(!result.ok){ui.toast(result.error);return;}
    const extended=editor?.extending;engagement.decision();const message=extended?'extended':editing?'edited':'newRoute';cancel();rewards();persist();ui.openPanel('routes');ui.toast(message);audio.cue();tutorial.signal(extended?'extended':'built');
  };
  ui.onDraft=(action,index)=>{
    if(!editor)return;
    if(action==='start'||action==='end')editor.side=action;
    if(action==='clear')editor.clear();
    if(action==='undo')editor.undo();
    if(action==='remove'&&index!==undefined)editor.remove(index);
    draft=editor.stops;refresh();
  };
  map.onStop=id=>{
    if(ui.panelOpen)return;
    if(!editor)begin();
    if(!editor)return;
    const result=editor.add(id);draft=editor.stops;
    if(result==='existing')ui.toast('stopAlreadySelected');
    refresh();
  };
  ui.onSpeed=value=>{speed=value;accumulator=0;};ui.onModal=value=>{modal=value;accumulator=0;};
  ui.onReset=()=>{world=createWorld();rewarded=world.goals.earned;engagement=new Engagement(world);editing=undefined;editor=undefined;draft=null;map.building=false;accumulator=0;persist();refresh();};
  ui.onRotate=delta=>map.rotate(delta);ui.onZoom=factor=>map.changeZoom(factor);ui.onRecenter=()=>map.recenter();
  ui.onLayer=(layer,enabled)=>{if(enabled)map.layers.add(layer);else map.layers.delete(layer);map.update(snapshot,draft??[],editor?.extending?editor.endpoint:undefined);
    if(layer==='demand'&&enabled)tutorial.signal('demand');
    if(map.layers.has('load')&&map.layers.has('complaints'))tutorial.signal('layers');
  };
  tutorial.onPrepare=()=>{cancel();ui.openPanel('map');};
  tutorial.onDone=()=>{cancel();ui.openPanel('map');};
  ui.onTutorial=()=>tutorial.restart();ui.onPanel=tab=>{map.building=draft!==null&&tab==='map';tutorial.signal(tab);};
  document.addEventListener('keydown',e=>{if(e.key==='Escape'&&draft){cancel();tutorial.signal('cancel');}});
  document.addEventListener('visibilitychange',()=>{last=0;accumulator=0;audio.setBlocked(document.hidden);if(document.hidden)persist();});
  window.addEventListener('pagehide',persist);
  const frame=(now:number)=>{
    const elapsed=last?(now-last)/1000:0,dt=Math.min(elapsed,0.1);last=now;
    if(!document.hidden){
      engagement.advance(elapsed,Boolean(speed)&&!modal&&!tutorial.paused&&!world.gameOver);
      if(speed&&!modal&&!tutorial.paused&&draft===null&&!world.gameOver){accumulator+=dt*speed;visualTime+=dt*speed;while(accumulator>=E.realSecondsPerTick){accumulator-=E.realSecondsPerTick;step(world,E.minutesPerTick);}}
      uiElapsed+=dt;saveElapsed+=dt;
      if(uiElapsed>=0.4){
        uiElapsed=0;const opened=engagement.observe(world);
        if(opened.length)ui.toast('transportOpened',{modes:opened.map(mode=>t(mode)).join(', ')});
        rewards();refresh();ui.debug(map.stats());ui.engagement(engagement.snapshot());
      }
      if(saveElapsed>=10){saveElapsed=0;persist();}
      map.draw(visualTime,snapshot,dt,world.minute+accumulator/E.realSecondsPerTick*E.minutesPerTick);audio.update(map.light,Boolean(speed)&&!modal&&!tutorial.paused&&draft===null&&!world.gameOver);
    }
    requestAnimationFrame(frame);
  };
  refresh();if(loaded.warning)ui.toast(loaded.warning);requestAnimationFrame(frame);
}
try{start();}catch(error){const app=document.getElementById('app')!;app.textContent=t('errorTitle')+': '+t('renderError');console.error(error);}

