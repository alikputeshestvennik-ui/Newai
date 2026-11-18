import { expect, it } from 'vitest';
import { createWorld, applyCommand, step } from '../src/sim/world';
import { routeLength } from '../src/sim/demand';
import { constructionCost, routeCost } from '../src/sim/commands';
import { alignment, railway } from '../src/sim/alignment';
import { restore } from '../src/core/save';
import { E, T } from '../src/sim/config';
import { layoutNetwork } from '../src/render/network';

for (const mode of ['metro','suburban'] as const) it(`покупка, постройка, поездка и загрузка: ${mode}`,()=>{
  const world=createWorld();world.money=1e6;
  expect(applyCommand(world,{type:'buyVehicle',mode})).toMatchObject({ok:false,error:'modeLocked'});
  world.served=T[mode].unlockServed;expect(applyCommand(world,{type:'buyVehicle',mode})).toEqual({ok:true});
  const stops=mode==='suburban'?[0,11,10]:[0,6];
  expect(applyCommand(world,{type:'buildRoute',mode,stops})).toEqual({ok:true});
  const route=world.routes[1],length=routeLength(world,route);
  expect(length).toBeCloseTo(mode==='metro'?Math.hypot(6,6):6);
  expect(constructionCost(world,stops,mode)).toBeCloseTo(routeCost(stops.length)+length*T[mode].infrastructurePerUnit);
  if(mode==='suburban'){
    const before=structuredClone(world);
    expect(applyCommand(world,{type:'editRoute',routeId:route.id,stops:[...stops,1]})).toEqual({ok:false,error:'railPlatforms'});
    expect(world).toEqual(before);
    expect(layoutNetwork(world,[])[1].segments.every(segment=>segment.start[1]===railway.trackZ&&segment.end[1]===railway.trackZ)).toBe(true);
  }else expect(alignment(mode,world.districts[0],world.districts[6])).toHaveLength(2);
  step(world,E.minutesPerDay);expect(route.served).toBeGreaterThan(0);expect(restore(JSON.stringify(world))).toEqual(world);
});

it('загрузка v5 сохраняет маршруты, бюджет и решения, не выдавая бесплатный состав',()=>{
  const world=createWorld();expect(applyCommand(world,{type:'storyChoice',choice:'nightShift'}).ok).toBe(true);
  const {metro,suburban,...fleets}=world.fleets,{metro:metroWear,suburban:railWear,...wear}=world.wear;
  expect(restore(JSON.stringify({...world,fleets,wear,version:5}))).toEqual(world);
  expect(restore(JSON.stringify({...world,fleets,wear}))).toBeNull();
});
