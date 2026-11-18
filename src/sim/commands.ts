import { E, T, MODES } from './config';
import { allowedStop } from './alignment';
import { routeLength } from './demand';
import { updateGoals } from './goals';
import { decide } from '../story/folder';
import type { Command, Mode, Result, World } from './types';
export const routeCost = (count: number) => E.routeBaseCost + count * E.stopCost;
export const reserved = (w: World, mode?: Mode) => mode ? w.fleets[mode] - w.routes.filter(r=>r.mode===mode).reduce((s,r)=>s+r.vehicles,0) : w.fleet-w.routes.reduce((s,r)=>s+r.vehicles,0);
export const unlocked = (w: World, mode: Mode) => w.districts.reduce((s,d)=>s+d.population,0) >= T[mode].unlockPopulation || (T[mode].unlockServed>0 && w.served >= T[mode].unlockServed);
const validStops = (w: World, ids: number[]) => Array.isArray(ids) && ids.length >= 2 && ids.length <= w.districts.length && new Set(ids).size===ids.length && ids.every(id=>Number.isInteger(id)&&!!w.districts[id]);
export function constructionCost(w: World, stops: number[], mode: Mode, routeId?: number): number {
  const old = w.routes.find(r=>r.id===routeId);
  const edges = new Set<string>();
  const key = (a:number,b:number)=>a<b?`${a}:${b}`:`${b}:${a}`;
  if(old) old.stops.slice(1).forEach((b,i)=>edges.add(key(old.stops[i],b)));
  let length=0;
  stops.slice(1).forEach((b,i)=>{if(!edges.has(key(stops[i],b))) length+=routeLength(w,{id:0,mode,stops:[stops[i],b],vehicles:0,served:0});});
  return (old ? stops.filter(id=>!old.stops.includes(id)).length * E.stopCost : routeCost(stops.length)) + length*T[mode].infrastructurePerUnit;
}
export function applyCommand(w: World, cmd: Command): Result {
  const fail = (error:string):Result=>({ok:false,error});
  if(w.gameOver) return fail('gameOver');
  if(cmd.type==='storyChoice') return decide(w,cmd.choice);
  if (cmd.type==='buildRoute' || cmd.type==='editRoute') {
    if(!validStops(w,cmd.stops)) return fail('invalidStops');
    const old=cmd.type==='editRoute'?w.routes.find(r=>r.id===cmd.routeId):undefined;
    if(cmd.type==='editRoute'&&!old) return fail('invalidRoute');
    const mode=old?.mode ?? (cmd.type==='buildRoute'?cmd.mode:undefined) ?? 'marshrutka';
    if(!MODES.includes(mode))return fail('invalidCommand');
    if(cmd.stops.some(id=>!allowedStop(mode,w.districts[id])))return fail('railPlatforms');
    if(!old){
      if(!unlocked(w,mode))return fail('modeLocked');
      if(w.routes.length>=E.maxRoutes)return fail('routeLimit');
      if(reserved(w,mode)<1)return fail('noReserve');
    }
    const cost=constructionCost(w,cmd.stops,mode,old?.id);
    if(cost>0&&w.money<cost)return fail('noMoney');
    w.money-=cost;w.expenses+=cost;w.ledger.construction+=cost;
    if(old){old.stops=[...cmd.stops];}else w.routes.push({id:w.nextRoute++,mode,stops:[...cmd.stops],vehicles:1,served:0});
  } else if(cmd.type==='changeRouteMode') {
    const route=w.routes.find(r=>r.id===cmd.routeId);if(!route)return fail('invalidRoute');
    if(!['marshrutka','bus'].includes(route.mode)||!['marshrutka','bus'].includes(cmd.mode)||route.mode===cmd.mode)return fail('invalidCommand');
    if(!unlocked(w,cmd.mode))return fail('modeLocked');
    if(reserved(w,cmd.mode)<1)return fail('noReserve');
    // Existing vehicles return to their own reserve; one vehicle of the new type starts service.
    route.mode=cmd.mode;route.vehicles=1;
  } else if(cmd.type==='buyVehicle') {
    const mode=cmd.mode??'marshrutka';
    if(!MODES.includes(mode))return fail('invalidCommand');
    if(!unlocked(w,mode))return fail('modeLocked');
    if(w.fleet>=E.maxVehicles)return fail('fleetLimit');
    if(w.money<T[mode].price)return fail('noMoney');
    w.wear[mode]=w.wear[mode]*w.fleets[mode]/(w.fleets[mode]+1);
    w.fleet++;w.fleets[mode]++;w.money-=T[mode].price;w.expenses+=T[mode].price;w.ledger.purchases+=T[mode].price;
  } else if(cmd.type==='assignVehicle'||cmd.type==='releaseVehicle') {
    const route=w.routes.find(r=>r.id===cmd.routeId);if(!route)return fail('invalidRoute');
    if(cmd.type==='assignVehicle'){if(reserved(w,route.mode)<1)return fail('noReserve');route.vehicles++;}
    else {if(route.vehicles===0)return fail('noAssigned');route.vehicles--;}
  } else if(cmd.type==='removeRoute') {
    if(!w.routes.some(r=>r.id===cmd.routeId))return fail('invalidRoute');
    w.routes=w.routes.filter(r=>r.id!==cmd.routeId);
  } else if(cmd.type==='setFare') {
    if(!Number.isInteger(cmd.fare)||cmd.fare<E.fareMin||cmd.fare>E.fareMax)return fail('invalidFare');
    w.fare=cmd.fare;
  } else if(cmd.type==='serviceFleet') {
    if(!MODES.includes(cmd.mode))return fail('invalidCommand');
    const cost=w.fleets[cmd.mode]*T[cmd.mode].serviceCost;
    if(w.money<cost)return fail('noMoney');
    w.money-=cost;w.expenses+=cost;w.ledger.maintenance+=cost;w.wear[cmd.mode]=0;
  } else if(cmd.type==='takeLoan') {
    if(w.debt+E.loanAmount>E.loanMax)return fail('loanLimit');
    w.debt+=E.loanAmount;w.money+=E.loanAmount;
  } else if(cmd.type==='repayLoan') {
    const amount=Math.min(w.debt,E.loanAmount);if(w.money<amount)return fail('noMoney');
    w.debt-=amount;w.money-=amount;
  } else return fail('invalidCommand');
  updateGoals(w); return {ok:true};
}
