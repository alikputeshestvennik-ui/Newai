import { canPlanGoal } from '../src/ui/goals';
import { describe, expect, it } from 'vitest';
import { createWorld, applyCommand, step } from '../src/sim/world';
import { GOALS, goalProgress, initializeGoals, updateGoals } from '../src/sim/goals';
import { demandFlows } from '../src/sim/insights';
import { constructionCost } from '../src/sim/commands';
import { restore } from '../src/core/save';
import { Engagement } from '../src/core/engagement';
import { E } from '../src/sim/config';

describe('три задачи города', () => {
  it('выбирает востребованную необслуживаемую пару, новые перевозки и расширение сети', () => {
    const w = createWorld(), [quick, medium, long] = w.goals.active;
    const flow = demandFlows(w).find(f => !f.connected)!;
    expect(quick).toMatchObject({ slot: 'quick', kind: 'connect', from: flow.from, to: flow.to });
    expect(medium).toMatchObject({ slot: 'medium', kind: 'passengers', baseline: 0, target: GOALS.medium.passengers });
    expect(long).toMatchObject({ slot: 'long', kind: 'coverage', target: 8 });
    expect(w.goals.completed).toBe(0); expect(w.goals.earned).toBe(0);
    expect(w.money).toBe(E.initialMoney); expect(w.seed).toBe(412781);
  });
  it('награда приходит после работающего соединения один раз; замена требует нового действия', () => {
    const w = createWorld(), goal = w.goals.active[0];
    if (goal.kind !== 'connect') throw Error('Expected connection');
    const stops = [goal.from, goal.to], price = constructionCost(w, stops, 'marshrutka'), metrics = new Engagement(w);
    const before = structuredClone(w);
    expect(applyCommand(w, { type: 'buildRoute', stops: [goal.from] }).ok).toBe(false); expect(w).toEqual(before);
    metrics.advance(25, true); metrics.decision();
    expect(applyCommand(w, { type: 'buildRoute', stops }).ok).toBe(true); metrics.observe(w);
    expect(w.money).toBe(E.initialMoney - price + GOALS.quick.reward);
    expect(w.goals).toMatchObject({ completed: 1, earned: GOALS.quick.reward, lastCompleted: goal });
    expect(w.goals.active[0].id).not.toBe(goal.id);
    expect(metrics.snapshot()).toMatchObject({ activeGoals: 3, rewards: 1, sinceReward: 0 });
    updateGoals(w); expect(w.goals.completed).toBe(1);
    const copy = restore(JSON.stringify(w))!; expect(copy).toEqual(w);
    updateGoals(copy); expect(copy).toEqual(w);
    step(copy, 5); expect(copy.goals.completed).toBe(1);
    expect(demandFlows(w).find(f => f.from === goal.from && f.to === goal.to)?.connected).toBe(true);
  });
  it('не считает линию без машин или с ремонтом и не предлагает восстановить временно закрытый путь', () => {
    const w = createWorld(), quick = w.goals.active[0];
    if (quick.kind !== 'connect') throw Error('Expected connection');
    w.routes[0].stops = [quick.from, 2, quick.to]; w.routes[0].vehicles = 0;
    updateGoals(w); expect(w.goals.completed).toBe(0);
    w.routes[0].vehicles = 1; w.event = { id: 'repair', until: 1000 };
    updateGoals(w); expect(w.goals.completed).toBe(0);
    initializeGoals(w);
    const next = w.goals.active[0];
    expect(next.kind === 'connect' && w.routes[0].stops.includes(next.from) && w.routes[0].stops.includes(next.to)).toBe(false);
    w.event = null; w.goals.active[0] = quick;
    updateGoals(w); expect(w.goals.completed).toBe(1);
  });
  it('учитывает одновременные задачи в бухгалтерии и сразу восстанавливает три карточки', () => {
    const w = createWorld(), quick = w.goals.active[0];
    if (quick.kind !== 'connect') throw Error('Expected connection');
    expect(applyCommand(w, { type: 'editRoute', routeId: 1, stops: [0, 1, 2, 3, quick.from, quick.to, 4, 5] }).ok).toBe(true);
    expect(w.goals.completed).toBe(2);
    expect(w.goals.earned).toBe(GOALS.quick.reward + GOALS.long.reward);
    expect(w.money).toBeCloseTo(E.initialMoney + w.income - w.expenses);
    expect(w.income).toBe(w.ledger.subsidy);
    expect(w.goals.active).toHaveLength(3);
    expect(goalProgress(w, w.goals.active[2]).current).toBeLessThan(goalProgress(w, w.goals.active[2]).target);
    w.served = GOALS.medium.passengers;
    updateGoals(w); const completed = w.goals.completed;
    expect(w.goals.active[1]).toMatchObject({ baseline: w.served, target: GOALS.medium.passengers });
    updateGoals(w); expect(w.goals.completed).toBe(completed);
    expect(restore(JSON.stringify(w))).toEqual(w);
  });
  it('на полностью связанной карте даёт достижимые перевозки, а старые достижения не переоплачивает', () => {
    const old: any = createWorld(); old.routes[0].stops = old.districts.map((d: {id: number}) => d.id);
    old.version = 3; old.served = 12000; delete old.goals;
    const w = restore(JSON.stringify(old))!;
    expect(w).not.toBeNull(); expect(w.version).toBe(5); expect(w.money).toBe(old.money);
    for (const goal of w.goals.active) {
      expect(goal).toMatchObject({ kind: 'passengers', baseline: old.served });
      expect(goalProgress(w, goal).current).toBe(0);
    }
    updateGoals(w); expect(w.goals.completed).toBe(0);
    const copy = restore(JSON.stringify(w))!;
    step(w, 2000); for (let i = 0; i < 400; i++) step(copy, 5);
    expect(copy).toEqual(w);
  });
  it('отвергает повреждённые карточки, повторные номера и подмену накопленной награды', () => {
    for (const corrupt of [
      (w: any) => delete w.goals,
      (w: any) => w.goals.active.pop(),
      (w: any) => w.goals.active[1].id = w.goals.active[0].id,
      (w: any) => w.goals.active[0].from = 99,
      (w: any) => w.goals.active[1].baseline = 500,
      (w: any) => w.goals.active[1].target = -1,
      (w: any) => w.goals.active[2].target = 999,
      (w: any) => w.goals.completed = 1,
      (w: any) => w.goals.earned = 1e9,
      (w: any) => w.goals.links = ['7:6'],
    ]) { const w = createWorld(); corrupt(w); expect(restore(JSON.stringify(w))).toBeNull(); }
  });
});

it('предлагает быструю задачу для резервного автобуса без свободных маршруток',()=>{
  const w=createWorld();applyCommand(w,{type:'assignVehicle',routeId:1});
  expect(canPlanGoal(w)).toBe(false);
  expect(applyCommand(w,{type:'buyVehicle',mode:'bus'}).ok).toBe(true);
  expect(canPlanGoal(w)).toBe(true);
  applyCommand(w,{type:'buildRoute',mode:'bus',stops:[6,7]});
  expect(canPlanGoal(w)).toBe(false);
});
