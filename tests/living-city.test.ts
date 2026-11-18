import { describe, expect, it } from 'vitest';
import { createWorld, step, applyCommand } from '../src/sim/world';
import { E, D } from '../src/sim/config';
import { C, develop } from '../src/sim/development';
import { grow } from '../src/sim/growth';
import { restore } from '../src/core/save';
import { modeShares, routeLength } from '../src/sim/demand';
import { roadDistance, roadPath } from '../src/sim/roads';
import { shelterPlacement } from '../src/render/infrastructure';
import { Actors } from '../src/render/actors';
import { EventView } from '../src/render/events';
import { DevelopmentView } from '../src/render/development';
import * as THREE from 'three';

describe('живой город', () => {
  it('прибавляет жителей ежедневно и сохраняет дробный прирост маленьких районов', () => {
    const w=createWorld(),before=w.districts.map(d=>d.population);
    step(w,E.minutesPerDay);expect(w.lastGrowth).toBeGreaterThan(0);
    expect(w.districts[1].population).toBeGreaterThan(before[1]);
    step(w,E.minutesPerDay*2);
    expect(w.districts.reduce((s,d)=>s+d.population,0)).toBe(5000+w.lastGrowth);
    step(w,E.minutesPerDay*15);expect(w.districts[0].population).toBeGreaterThan(before[0]);
  });
  it('стройка завершается новым районом, спросом и доступной для маршрута остановкой', () => {
    const w=createWorld();expect(w.expansion?.index).toBe(0);
    step(w,C.constructionDays*E.minutesPerDay);
    expect(w.districts).toHaveLength(D.districts.length+1);
    const id=w.districts.length-1;expect(w.districts[id].population).toBe(C.quarterPopulation);
    expect(w.queues.every(q=>q.length===w.districts.length)).toBe(true);
    expect(applyCommand(w,{type:'editRoute',routeId:1,stops:[8,id]}).ok).toBe(true);
    step(w,5);expect(w.demand[id]).toBeGreaterThan(0);expect(w.served).toBeGreaterThan(0);
    expect(restore(JSON.stringify(w))).toEqual(w);
  });
  it('переносит v2, не теряет таймер строительства и продолжает тот же город', () => {
    const old:any=createWorld();old.version=2;delete old.development;delete old.expansion;delete old.mobility;
    const w=restore(JSON.stringify(old))!;expect(w.version).toBe(5);expect(w.money).toBe(old.money);
    step(w,E.minutesPerDay);const copy=restore(JSON.stringify(w))!;
    step(w,3*E.minutesPerDay);step(copy,3*E.minutesPerDay);expect(copy).toEqual(w);
    for(const change of [(s:any)=>s.development[0].growthRemainder=2,(s:any)=>s.development[0].phase='bad',(s:any)=>s.expansion={index:99,since:0,until:999999},(s:any)=>s.mobility.taxi=-1]){const invalid=structuredClone(w);change(invalid);expect(restore(JSON.stringify(invalid))).toBeNull();}
  });
  it('обновляет связанный участок, а заброшенный превращает в сквер без выселения всего района', () => {
    const w=createWorld(),d=w.districts[1];d.accessibility=1;d.population*=1.02;
    develop(w);expect(w.development[1].phase).toBe('renovation');
    w.minute+=C.renovationDays*E.minutesPerDay;develop(w);expect(w.development[1].level).toBe(1);
    d.accessibility=0;
    for(let i=0;i<C.abandonDays;i++){w.minute+=E.minutesPerDay;develop(w);}
    expect(w.development[1].phase).toBe('abandoned');const residents=d.population;
    w.minute+=C.parkDays*E.minutesPerDay;develop(w);expect(w.development[1].phase).toBe('park');expect(d.population).toBe(residents);
    for(let i=0;i<100;i++)grow(w);expect(d.population).toBeGreaterThan(residents*1.5);
  });
  it('такси участвует в выборе, дорогой билет и ожидание отдают ему пассажиров', () => {
    const cheap=modeShares(12,15,1,3),slow=modeShares(12,65,30,3);
    expect(Object.values(cheap).reduce((s,v)=>s+v,0)).toBeCloseTo(1,12);
    expect(slow.taxi).toBeGreaterThan(cheap.taxi);
    const w=createWorld();step(w,5);expect(w.mobility.taxi).toBeGreaterThan(0);
    expect(Object.values(w.mobility).reduce((s,n)=>s+n,0)).toBeCloseTo(w.demand.reduce((s,n)=>s+n,0));
  });
  it('дороги с поворотами используются и для расстояний, и для пути транспорта', () => {
    const w=createWorld();step(w,C.constructionDays*E.minutesPerDay);
    const a=w.districts[8],b=w.districts[12],path=roadPath(a,b);
    expect(path.length).toBeGreaterThan(2);expect(path[0]).toEqual([a.x,a.y]);expect(path.at(-1)).toEqual([b.x,b.y]);
    expect(roadDistance(a,b)).toBeCloseTo(roadDistance(b,a));
    expect(routeLength(w,{...w.routes[0],stops:[8,12]})).toBe(roadDistance(a,b));
  });
});

describe('ограничения визуализации', () => {
  it('павильоны стоят вдоль подходящей дороги и не выступают на проезжую часть',()=>{
    for(const d of D.districts){
      const p=shelterPlacement(d.x,d.y);
      expect(p.clearance, d.name).toBeGreaterThan(.215);
      expect(Math.hypot(p.x-d.x,p.z-d.y)).toBeGreaterThan(.8);
    }
  });
  it('количество людей связано с жителями и очередью, весь назначенный транспорт виден', () => {
    const scene=new THREE.Scene(),actors=new Actors(scene),w=createWorld(),center=new THREE.Vector3(5.5,0,5.5);
    actors.draw(w,1,1,'high',center);expect(actors.visiblePeople).toBe(0);
    actors.draw(w,1,3,'high',center);const before=actors.visiblePeople;
    w.districts.forEach(d=>d.population*=3);actors.draw(w,1,3,'high',center);
    expect(actors.visiblePeople).toBeGreaterThan(before);expect(actors.visiblePeople).toBeLessThanOrEqual(96);
    w.routes[0].vehicles=60;actors.draw(w,1,3,'low',center);expect(actors.visibleVehicles).toBe(60);expect(actors.visiblePeople).toBeLessThanOrEqual(32);
  });
  it('реновация не пересоздаёт геометрию каждый шаг, погода и матч не меняют симуляцию', () => {
    const scene=new THREE.Scene(),w=createWorld(),view=new DevelopmentView(scene),events=new EventView(scene);
    view.update(w);const occupied=scene.children.at(-1)!.children[0];
    w.minute+=5;view.update(w);expect(scene.children.at(-1)!.children[0]).toBe(occupied);
    for(const id of ['snow','rain','match','repair']){w.event={id,until:1000};const saved=JSON.stringify(w);events.update(w,1,'high',new THREE.Vector3());expect(JSON.stringify(w)).toBe(saved);}
    let max=0;scene.traverse(o=>{if(o instanceof THREE.InstancedMesh)max=Math.max(max,o.count);});expect(max).toBeLessThan(500);
  });
});
