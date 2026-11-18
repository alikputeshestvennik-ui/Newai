import { expect, it } from 'vitest';
import { createWorld, applyCommand, step } from '../src/sim/world';
import { chapters, ending, isReady } from '../src/story/folder';
import { restore } from '../src/core/save';
import { E } from '../src/sim/config';

it('доводит новую компанию до титров обычными командами и продолжает игру после финала',()=>{
  const world=createWorld(743);
  expect(applyCommand(world,{type:'buildRoute',stops:[3,4,5,6]}).ok).toBe(true);
  const choices=['nightShift','refuseGrant','publish','publicBoard','stay'];
  for(const choice of choices){
    for(let ticks=0;!isReady(world)&&ticks<1500;ticks++)step(world,E.minutesPerTick);
    expect(applyCommand(world,{type:'storyChoice',choice})).toEqual({ok:true});
    expect(applyCommand(world,{type:'storyChoice',choice}).ok).toBe(false);
    expect(restore(JSON.stringify(world))).toEqual(world);
  }
  expect(ending(world.story)).toBe('citizens');
  const before=world.served;step(world,60);expect(world.served).toBeGreaterThan(before);
});
it('каждая развязка достижима; в долгах остаётся бесплатный выбор',()=>{
  const results=new Set<string|null>();
  for(let path=0;path<2**chapters.length;path++){
    const world=createWorld();world.served=2000;world.routes[0].stops=world.districts.map(district=>district.id);
    for(const [index,chapter] of chapters.entries())expect(applyCommand(world,{type:'storyChoice',choice:chapter.choices[(path>>index)&1].id}).ok).toBe(true);
    results.add(ending(world.story));
  }
  expect(results).toEqual(new Set(['walkAway','citizens','deal','machine']));
  const world=createWorld();world.money=-10;expect(applyCommand(world,{type:'storyChoice',choice:'nightShift'}).ok).toBe(false);
  expect(applyCommand(world,{type:'storyChoice',choice:'sellSpares'}).ok).toBe(true);
  expect(world.ledger.storyReceipts).toBe(4500);expect(world.ledger.storyPayments).toBe(0);
});
it('читает настоящую структуру v4 и отклоняет переставленные письма',()=>{
  const {story,...old}=createWorld();const {storyReceipts,storyPayments,...ledger}=old.ledger;
  const restored=restore(JSON.stringify({...old,version:4,ledger}));expect(restored?.story).toEqual([]);
  expect(restore(JSON.stringify({...restored,story:['publish']}))).toBeNull();
});
it('делит места между перегруженными направлениями, а не отдаёт все первому району',()=>{
  const world=createWorld();world.queues[0][1]=10;world.queues[1][0]=10;
  step(world,E.minutesPerTick);
  expect(world.queues[0][1]).toBeGreaterThan(0);expect(world.queues[1][0]).toBeGreaterThan(0);
  for(const [from,to] of [[0,1],[1,0]]){
    const empty=createWorld();empty.queues[from][to]=10;step(empty,E.minutesPerTick);
    expect(world.queues[from][to]).toBeGreaterThan(empty.queues[from][to]);
  }
});
