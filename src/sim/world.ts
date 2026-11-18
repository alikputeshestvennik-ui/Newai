import { E, T, D } from './config';
import { random } from '../core/rng';
import { demand, distance, modeShares, routeTravel, headway } from './demand';
import { grow } from './growth';
import { account } from './economy';
import { updateEvents, eventConfig } from './events';
import { initialDevelopment, initialExpansion } from './development';
import { emptyGoals, initializeGoals, updateGoals } from './goals';
import type { World } from './types';
export { applyCommand } from './commands';
export function createWorld(seed = 412781): World {
  const world: World = { version: 6, story: [], goals: emptyGoals(), development: D.districts.map(d => initialDevelopment(d.population)), expansion: initialExpansion(0), mobility: { transit: 0, taxi: 0, car: 0, walk: 0 }, seed: seed >>> 0, minute: 0, remainder: 0, money: E.initialMoney,
    ecology: E.initialEcology, satisfaction: E.initialSatisfaction, trust: E.initialTrust, districts: structuredClone(D.districts),
    routes: [{ id: 1, mode: 'marshrutka', stops: [0, 1, 2, 3], vehicles: 1, served: 0 }], fleet: E.initialFleet,
    fleets: {marshrutka:E.initialFleet,bus:0,trolleybus:0,tram:0,suburban:0,metro:0},wear:{marshrutka:0,bus:0,trolleybus:0,tram:0,suburban:0,metro:0},
    ledger:{tickets:0,advertising:0,subsidy:0,rent:0,wages:0,energy:0,maintenance:0,depreciation:0,interest:0,construction:0,purchases:0,storyReceipts:0,storyPayments:0},
    debt:0,gameOver:false,event:null,nextEvent:{id:'fair',at:E.firstEventMinute},fare: E.fare, nextRoute: 2, served: 0, missed: 0, income: 0, expenses: 0, lastGrowth: 0,
    demand: D.districts.map(() => 0), queues: D.districts.map(() => D.districts.map(() => 0)) };
  initializeGoals(world); return world;
}
function network(w: World) {
  const event=eventConfig(w);
  const routes = w.routes.filter(r => r.vehicles > 0 && !(event?.id==='repair'&&r.stops.includes(event.district)));
  const speed=event?.speed??1;
  const headways = routes.map(route => headway(w,route)/speed);
  const table = w.districts.map(a => w.districts.map(b => {
    let index = -1, time = Infinity, bestCost = Infinity;
    routes.forEach((route, position) => {
      const travel = routeTravel(w, route, a.id, b.id)/speed;
      const cost = E.alpha * travel + E.epsilon * headways[position] / 2;
      if (cost < bestCost) { bestCost = cost; time = travel; index = position; }
    });
    return { index, time, distance: distance(a,b), generation: 0, requests: 0 };
  }));
  const connected = table.flatMap((row, from) => row.flatMap((flow, to) => from !== to && flow.index >= 0 ? [{from,to,flow}] : []));
  return { routes, table, connected, rateHour: -1, headways };
}
function tick(w: World, net: ReturnType<typeof network>): void {
  const active = net.routes;
  const event=eventConfig(w);
  const remaining = active.map((r, i) => {
    const worn=w.wear[r.mode];
    const breakdown=worn>=E.breakdownWear&&random(w)<E.breakdownChance*(event?.breakdowns??1);
    return T[r.mode].capacity*E.minutesPerTick/net.headways[i]*(1-worn/100*E.wearSlowdown)*(breakdown?E.breakdownCapacity:1);
  });
  const hour=Math.floor(w.minute/60);
  if(net.rateHour!==hour){
    net.rateHour=hour;
    for(const a of w.districts)for(const b of w.districts)net.table[a.id][b.id].generation=demand(a,b,w.minute)*(event&&(event.district<0||b.id===event.district)?event.demand:1)*E.minutesPerTick/60;
  }
  const alternativeShares=new Map<number,ReturnType<typeof modeShares>>();
  const congestion=(w.mobility.car+w.mobility.taxi)*E.congestionFactor/E.minutesPerTick;
  const requested = active.map(() => 0);
  w.demand.fill(0);
  w.mobility = { transit: 0, taxi: 0, car: 0, walk: 0 };
  let served = 0, missed = 0;
  for (const a of w.districts) for (const b of w.districts) {
    if (a.id === b.id) continue;
    const generated = net.table[a.id][b.id].generation * (E.randomDemandMin + random(w) * E.randomDemandRange);
    w.demand[a.id] += generated;
    const { index: best, time, distance: dist } = net.table[a.id][b.id];
    const old = w.queues[a.id][b.id];
    let shares=best<0?alternativeShares.get(dist):undefined;
    if(!shares){shares=modeShares(time,w.fare,best<0?0:net.headways[best]/2,dist,best<0?0:old/T[active[best].mode].capacity,congestion);if(best<0)alternativeShares.set(dist,shares);}
    for (const mode of ['transit', 'taxi', 'car', 'walk'] as const) w.mobility[mode] += generated * shares[mode];
    if (best < 0) { w.queues[a.id][b.id] = 0; missed += generated + old; continue; }
    const requests = generated * shares.transit + old * E.queueRetention;
    net.table[a.id][b.id].requests = requests;
    requested[best] += requests;
    missed += generated * (1 - shares.transit) + old * (1 - E.queueRetention);
  }
  for (const {from,to,flow} of net.connected) {
    const {index: best, requests} = flow;
    const boarded = requests * (requested[best] > remaining[best] ? remaining[best] / requested[best] : 1);
    const waiting = requests - boarded;
    const queue = Math.min(waiting, w.districts[from].population * E.maxQueuePerPerson);
    w.queues[from][to] = queue;
    served += boarded; active[best].served += boarded;
    missed += waiting - queue;
  }
  const covered = new Set(active.flatMap(r => r.stops)).size;
  w.served += served; w.missed += missed;
  account(w,served,covered);
  if (w.minute % 60 === 0) {
    const total = served + missed;
    const target = Math.max(0, Math.min(100, E.satisfactionBase + covered / w.districts.length * E.coverageBonus - (total > 0 ? missed / total : 0) * E.complaintPenalty));
    w.satisfaction += (target - w.satisfaction) * E.satisfactionSmoothing;
    w.trust += (w.satisfaction - w.trust) * E.trustSmoothing;
  }
  if (w.minute % E.minutesPerDay === 0) { grow(w, true); net.rateHour=-1; }
  updateGoals(w);
}
export function step(world: World, dtMinutes: number): void {
  if (!Number.isFinite(dtMinutes) || dtMinutes < 0) throw new Error('Некорректный шаг времени');
  world.remainder += dtMinutes;
  let key: string | undefined, net: ReturnType<typeof network>;
  while (world.remainder >= E.minutesPerTick && !world.gameOver) {
    world.remainder -= E.minutesPerTick;world.minute += E.minutesPerTick;updateEvents(world);
    const nextKey=(world.event?.id??'')+':'+world.districts.length;
    if(key!==nextKey){net=network(world);key=nextKey;}
    tick(world,net!);
  }
  if(world.gameOver)world.remainder=0;
}
export function getSnapshot(world: World): World { return structuredClone(world); }
