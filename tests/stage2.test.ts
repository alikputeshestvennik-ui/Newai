import { describe, it, expect } from 'vitest';
import { createWorld, step, applyCommand, getSnapshot } from '../src/sim/world';
import { constructionCost, reserved, unlocked } from '../src/sim/commands';
import { E, T, MODES } from '../src/sim/config';
import { headway } from '../src/sim/demand';
import { restore, load, save, LEGACY_KEY, SAVE_KEY } from '../src/core/save';
describe('редактирование маршрутов и типы транспорта',()=>{
  it('продлевает линию, сохраняет её номер и машины, отклоняет плохой путь без побочных действий',()=>{
    const w=createWorld(),before=getSnapshot(w);
    const cost=constructionCost(w,[0,1,2,3,6],'marshrutka',1);
    expect(cost).toBe(E.stopCost);
    expect(applyCommand(w,{type:'editRoute',routeId:1,stops:[0,1,2,3,6]}).ok).toBe(true);
    expect(w.routes[0]).toMatchObject({id:1,vehicles:1,mode:'marshrutka',stops:[0,1,2,3,6]});
    expect(w.money).toBe(before.money-cost);
    const copy=getSnapshot(w);
    for(const stops of [[0],[0,0],[0,99]])expect(applyCommand(w,{type:'editRoute',routeId:1,stops}).ok).toBe(false);
    expect(w).toEqual(copy);
    expect(applyCommand(w,{type:'editRoute',routeId:1,stops:[7,6]}).ok).toBe(true);
    expect(w.routes[0].stops).toEqual([7,6]);
    w.money=-100;expect(applyCommand(w,{type:'editRoute',routeId:1,stops:[6,7]}).ok).toBe(true);
  });
  it('уменьшает автопарк до нуля и возвращает его в резерв при удалении',()=>{
    const w=createWorld();
    expect(applyCommand(w,{type:'releaseVehicle',routeId:1}).ok).toBe(true);expect(reserved(w)).toBe(2);
    const frozen=getSnapshot(w);expect(applyCommand(w,{type:'releaseVehicle',routeId:1}).ok).toBe(false);expect(w).toEqual(frozen);
    applyCommand(w,{type:'assignVehicle',routeId:1});applyCommand(w,{type:'assignVehicle',routeId:1});
    expect(reserved(w)).toBe(0);applyCommand(w,{type:'removeRoute',routeId:1});expect(reserved(w)).toBe(2);
  });
  it('разделяет резерв и вместимость разных типов и открывает электротранспорт по потребности',()=>{
    const empty=createWorld();empty.districts.forEach(d=>d.population=0);expect(unlocked(empty,'bus')).toBe(false);
    const w=createWorld();expect(unlocked(w,'bus')).toBe(true);expect(unlocked(w,'tram')).toBe(false);
    const old=getSnapshot(w);expect(applyCommand(w,{type:'buyVehicle',mode:'tram'}).ok).toBe(false);expect(w).toEqual(old);
    expect(applyCommand(w,{type:'buyVehicle',mode:'bus'}).ok).toBe(true);
    expect(applyCommand(w,{type:'buildRoute',mode:'bus',stops:[6,7]}).ok).toBe(true);
    expect(reserved(w,'bus')).toBe(0);expect(reserved(w,'marshrutka')).toBe(1);
    expect(applyCommand(w,{type:'assignVehicle',routeId:2}).ok).toBe(false);
    w.served=T.tram.unlockServed;expect(unlocked(w,'tram')).toBe(true);expect(unlocked(w,'trolleybus')).toBe(true);
    expect(headway(w,{...w.routes[0],mode:'bus'})).toBeGreaterThan(headway(w,w.routes[0]));
  });
  it('берёт оплату новых участков электрической линии, сохраняя оплату старых',()=>{
    const w=createWorld();w.routes[0].mode='tram';w.fleets={marshrutka:1,bus:0,trolleybus:0,tram:1,suburban:0,metro:0};
    expect(constructionCost(w,[0,1,2,3],'tram',1)).toBe(0);
    expect(constructionCost(w,[3,2,1,0],'tram',1)).toBe(0);
    expect(constructionCost(w,[0,1,2,3,6],'tram',1)).toBe(E.stopCost+3*T.tram.infrastructurePerUnit);
    w.money=0;const old=getSnapshot(w);expect(applyCommand(w,{type:'editRoute',routeId:1,stops:[0,1,2,3,6]}).ok).toBe(false);expect(w).toEqual(old);
  });
});
describe('смена типа дорожной линии',()=>{
  it('назначает купленный с первого дня автобус и возвращает все маршрутки в резерв',()=>{
    const w=createWorld();applyCommand(w,{type:'assignVehicle',routeId:1});
    expect(reserved(w,'marshrutka')).toBe(0);
    expect(applyCommand(w,{type:'buyVehicle',mode:'bus'}).ok).toBe(true);
    const money=w.money,stops=[...w.routes[0].stops];
    expect(applyCommand(w,{type:'changeRouteMode',routeId:1,mode:'bus'}).ok).toBe(true);
    expect(w.routes[0]).toMatchObject({id:1,mode:'bus',vehicles:1,stops});
    expect(reserved(w,'marshrutka')).toBe(2);expect(reserved(w,'bus')).toBe(0);expect(w.money).toBe(money);
    expect(restore(JSON.stringify(w))).toEqual(w);
    expect(applyCommand(w,{type:'changeRouteMode',routeId:1,mode:'marshrutka'}).ok).toBe(true);
    expect(reserved(w,'bus')).toBe(1);expect(reserved(w,'marshrutka')).toBe(1);
  });
  it('не меняет линию без резерва, для неверного номера или электротранспорта',()=>{
    const w=createWorld(),before=getSnapshot(w);
    for(const cmd of [{type:'changeRouteMode',routeId:1,mode:'bus'},{type:'changeRouteMode',routeId:99,mode:'bus'},{type:'changeRouteMode',routeId:1,mode:'tram'}] as const)expect(applyCommand(w,cmd).ok).toBe(false);
    expect(w).toEqual(before);
  });
});
describe('экономика, износ и события',()=>{
  it('сводит все статьи и кредиты, сохраняет допустимую цену',()=>{
    const w=createWorld();applyCommand(w,{type:'takeLoan'});applyCommand(w,{type:'buyVehicle',mode:'bus'});applyCommand(w,{type:'buildRoute',mode:'bus',stops:[6,7]});
    step(w,E.minutesPerDay);applyCommand(w,{type:'repayLoan'});
    expect(w.money).toBeCloseTo(E.initialMoney+w.income-w.expenses+w.debt,5);
    const l=w.ledger;expect(w.income).toBeCloseTo(l.tickets+l.advertising+l.subsidy+l.rent,5);
    expect(w.expenses).toBeCloseTo(l.wages+l.energy+l.maintenance+l.depreciation+l.interest+l.construction+l.purchases,5);
    expect(l.interest).toBeGreaterThan(0);
    const old=getSnapshot(w);expect(applyCommand(w,{type:'setFare',fare:E.fareMax+1}).ok).toBe(false);expect(w).toEqual(old);
    expect(applyCommand(w,{type:'setFare',fare:E.fareMin}).ok).toBe(true);
  });
  it('износ снижает перевозки, обслуживание восстанавливает парк',()=>{
    const fresh=createWorld(),worn=createWorld();worn.wear.marshrutka=100;
    step(fresh,120);step(worn,120);expect(worn.served).toBeLessThan(fresh.served);
    const money=worn.money;applyCommand(worn,{type:'serviceFleet',mode:'marshrutka'});
    expect(worn.wear.marshrutka).toBe(0);expect(worn.money).toBe(money-worn.fleets.marshrutka*T.marshrutka.serviceCost);
  });
  it('ярмарка меняет спрос, ремонт требует объезда, снег замедляет перевозки',()=>{
    const base=createWorld(),fair=createWorld(),repair=createWorld(),snow=createWorld();
    for(const w of [base,fair,repair,snow])w.nextEvent={id:'fair',at:10000};
    fair.event={id:'fair',until:120};repair.event={id:'repair',until:120};snow.event={id:'snow',until:120};
    step(base,60);step(fair,60);step(repair,60);step(snow,60);
    expect(fair.demand.reduce((s,n)=>s+n,0)).toBeGreaterThan(base.demand.reduce((s,n)=>s+n,0));
    expect(repair.served).toBe(0);expect(snow.served).toBeLessThan(base.served);
    applyCommand(repair,{type:'editRoute',routeId:1,stops:[0,1,4]});step(repair,5);expect(repair.served).toBeGreaterThan(0);
    step(repair,55);expect(repair.event).toBeNull();
  });
  it('сохраняет детерминизм через начало и завершение событий',()=>{
    const a=createWorld(42),b=createWorld(42);step(a,3000);for(let n=0;n<600;n++)step(b,5);expect(a).toEqual(b);
    const restored=restore(JSON.stringify(a))!;expect(restored).not.toBeNull();step(a,1000);step(restored,1000);expect(restored).toEqual(a);
  });
  it('экологичный транспорт улучшает показатель; кризис обратим, поражение требует двух условий',()=>{
    const dirty=createWorld(),clean=createWorld();
    clean.routes[0].mode='tram';clean.fleets={marshrutka:1,bus:0,trolleybus:0,tram:1,suburban:0,metro:0};step(dirty,60);step(clean,60);expect(clean.ecology).toBeGreaterThan(dirty.ecology);
    const w=createWorld();w.money=-E.gameOverMoney-1000;step(w,5);expect(w.gameOver).toBe(false);
    w.trust=0;step(w,5);expect(w.gameOver).toBe(true);const minute=w.minute;step(w,60);expect(w.minute).toBe(minute);
    expect(applyCommand(w,{type:'takeLoan'}).ok).toBe(false);
  });
});
describe('перенос сохранений первого этапа',()=>{
  it('переносит прогресс, оставляет старую копию и изолирует новый формат',()=>{
    const old:any=createWorld();old.version=1;old.routes.forEach((r:any)=>delete r.mode);
    for(const key of ['fleets','wear','ledger','debt','gameOver','event','nextEvent','ecology'])delete old[key];
    const memory=new Map([[LEGACY_KEY,JSON.stringify(old)]]);
    const storage={getItem:(key:string)=>memory.get(key)??null,setItem:(key:string,value:string)=>{memory.set(key,value);}};
    const migrated=load(storage);expect(migrated.warning).toBeUndefined();expect(migrated.world.version).toBe(6);expect(migrated.world.money).toBe(old.money);
    expect(migrated.world.fleets.marshrutka).toBe(old.fleet);expect(migrated.world.routes[0].mode).toBe('marshrutka');
    save(migrated.world,storage);expect(memory.get(LEGACY_KEY)).toBe(JSON.stringify(old));expect(memory.has(SAVE_KEY)).toBe(true);
    for(const mode of MODES){const invalid=getSnapshot(migrated.world);invalid.fleets[mode]=-1;expect(restore(JSON.stringify(invalid))).toBeNull();}
    const invalid=getSnapshot(migrated.world);invalid.nextEvent.id='unknown';expect(restore(JSON.stringify(invalid))).toBeNull();
  });
});
