import { E, D, MODES, EVENTS } from '../sim/config';
import { createWorld } from '../sim/world';
import { C, initialDevelopment, initialExpansion } from '../sim/development';
import { initializeGoals, validGoals } from '../sim/goals';
import { allowedStop } from '../sim/alignment';
import { validStory } from '../story/folder';
import type { World } from '../sim/types';
export const LEGACY_KEY = 'gorodskoy-marshrut:stage1:v1';
export const SAVE_KEY = 'gorodskoy-marshrut:stage2:v2';
const finite = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n);
export function restore(raw: string): World | null {
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || ![1,2,3,4,5,6].includes(parsed.version)) return null;
    const base = createWorld();
    if(parsed.version===1){
      parsed.version=2;parsed.ecology=base.ecology;parsed.debt=0;parsed.gameOver=false;
      parsed.fleets={...base.fleets,marshrutka:parsed.fleet};parsed.wear=base.wear;
      parsed.ledger={...base.ledger,tickets:parsed.income,maintenance:parsed.expenses};
      if(!Array.isArray(parsed.routes))return null;
      parsed.routes=parsed.routes.map((r:object)=>({...r,mode:'marshrutka'}));
      parsed.event=null;parsed.nextEvent={id:base.nextEvent.id,at:parsed.minute+E.firstEventMinute};
    }
    if (parsed.version === 2) {
      if (!Array.isArray(parsed.districts)) return null;
      parsed.development = parsed.districts.map((d: { population: number }) => initialDevelopment(d.population, parsed.minute));
      parsed.expansion = initialExpansion(parsed.minute); parsed.mobility = base.mobility; parsed.version = 3;
    }
    if (parsed.version < 5 && parsed.ledger) { parsed.ledger.storyReceipts=0; parsed.ledger.storyPayments=0; }
    if (parsed.version < 6 && parsed.fleets && parsed.wear) {
      for (const mode of ['metro','suburban']) { parsed.fleets[mode]=0; parsed.wear[mode]=0; }
    }
    const w=parsed as World;
    for (const [key, val] of Object.entries(base)) if (typeof val === 'number' && !finite(w[key as keyof World])) return null;
    if (!Number.isInteger(w.seed) || w.seed < 0 || w.seed > 0xffffffff || !Number.isInteger(w.minute) || w.minute < 0 || w.minute % E.minutesPerTick || w.remainder < 0 || w.remainder >= E.minutesPerTick || w.fare < E.fareMin || w.fare > E.fareMax || w.satisfaction < 0 || w.satisfaction > 100 || w.trust < 0 || w.trust > 100) return null;
    if (!Number.isInteger(w.fleet) || w.fleet < 0 || w.fleet > E.maxVehicles || !Array.isArray(w.routes) || w.routes.length > E.maxRoutes || !Array.isArray(w.districts) || (w.districts.length < D.districts.length || w.districts.length > D.districts.length + C.quarters.length)) return null;
    if (w.districts.some((d, i) => {
      const quarter = C.quarters[i - D.districts.length];
      const template = D.districts[i] ?? (quarter ? { ...D.districts[1], name: quarter.name, x: C.nodes[quarter.node][0], y: C.nodes[quarter.node][1] } : null);
      return !d || !template || d.id !== i || d.name !== template.name || d.type !== template.type || Object.entries(template).some(([k,v]) => typeof v === 'number' && (!finite(d[k as keyof typeof d]) || Number(d[k as keyof typeof d]) < 0)) || d.x !== template.x || d.y !== template.y;
    })) return null;
    if (!Array.isArray(w.development) || w.development.length !== w.districts.length || w.development.some(lot => !lot || !['occupied','construction','renovation','abandoned','park'].includes(lot.phase) || ['since','until','level','badDays','capacity','growthRemainder'].some(k => !finite(lot[k as keyof typeof lot]) || Number(lot[k as keyof typeof lot]) < 0) || lot.since > w.minute || !Number.isInteger(lot.level) || lot.level > C.maxTowerLevel + 100 || lot.growthRemainder >= 1)) return null;
    if (w.expansion !== null && (!w.expansion || w.expansion.index !== w.districts.length - D.districts.length || !C.quarters[w.expansion.index] || !finite(w.expansion.since) || w.expansion.since < 0 || w.expansion.since > w.minute || !finite(w.expansion.until) || w.expansion.until <= w.minute)) return null;
    if (!w.mobility || ['transit','taxi','car','walk'].some(k => !finite(w.mobility[k as keyof typeof w.mobility]) || w.mobility[k as keyof typeof w.mobility] < 0)) return null;
    if (!w.fleets || !w.wear || !w.ledger || MODES.some(mode=>!Number.isInteger(w.fleets[mode]) || w.fleets[mode]<0 || !finite(w.wear[mode]) || w.wear[mode]<0 || w.wear[mode]>100) || MODES.reduce((s,m)=>s+w.fleets[m],0)!==w.fleet) return null;
    if(Object.keys(w.ledger).length!==Object.keys(base.ledger).length || Object.keys(base.ledger).some(k=>!finite(w.ledger[k as keyof typeof w.ledger]) || w.ledger[k as keyof typeof w.ledger]<0))return null;
    if(w.ecology<0 || w.ecology>100 || w.debt<0 || w.debt>E.loanMax || typeof w.gameOver!=='boolean')return null;
    const validEvent=(e:{id:string})=>e&&EVENTS.some(item=>item.id===e.id);
    if(!validEvent(w.nextEvent) || !Number.isInteger(w.nextEvent.at) || w.nextEvent.at<=w.minute || w.nextEvent.at%E.minutesPerTick) return null;
    if(w.event!==null && (!validEvent(w.event) || !Number.isInteger(w.event.until) || w.event.until<=w.minute || w.event.until%E.minutesPerTick || w.nextEvent.at<=w.event.until))return null;
    const ids = new Set<number>();
    for (const r of w.routes) {
      if (!r || !MODES.includes(r.mode) || !Number.isInteger(r.id) || r.id < 1 || ids.has(r.id) || !Number.isInteger(r.vehicles) || r.vehicles < 0 || !finite(r.served) || r.served < 0 || !Array.isArray(r.stops) || r.stops.length < 2 || new Set(r.stops).size !== r.stops.length || r.stops.some(i => !Number.isInteger(i) || !w.districts[i] || !allowedStop(r.mode,w.districts[i]))) return null;
      ids.add(r.id);
    }
    if(MODES.some(mode=>w.routes.filter(r=>r.mode===mode).reduce((s,r)=>s+r.vehicles,0)>w.fleets[mode]))return null;
    if (!Number.isInteger(w.nextRoute) || w.nextRoute <= Math.max(0, ...ids) || w.routes.reduce((s,r) => s + r.vehicles, 0) > w.fleet) return null;
    if (!Array.isArray(w.demand) || w.demand.length !== w.districts.length || w.demand.some(n => !finite(n) || n < 0)) return null;
    if (!Array.isArray(w.queues) || w.queues.length !== w.districts.length || w.queues.some(q => !Array.isArray(q) || q.length !== w.districts.length || q.some(n => !finite(n) || n < 0))) return null;
    if (w.served < 0 || w.missed < 0 || w.income < 0 || w.expenses < 0 || w.lastGrowth < 0) return null;
    if (parsed.version === 3) initializeGoals(w);
    if (parsed.version < 5) w.story = [];
    w.version = 6;
    return validGoals(w) && validStory(w.story) ? w : null;
  } catch { return null; }
}
export function load(storage: Pick<Storage, 'getItem'>): { world: World; warning?: string } {
  try {
    const raw = storage.getItem(SAVE_KEY) ?? storage.getItem(LEGACY_KEY);
    if (!raw) return { world: createWorld() };
    const world = restore(raw);
    return world ? { world } : { world: createWorld(), warning: 'saveInvalid' };
  } catch { return { world: createWorld(), warning: 'saveBlocked' }; }
}
export function save(world: World, storage: Pick<Storage, 'setItem'>): boolean {
  try { storage.setItem(SAVE_KEY, JSON.stringify(world)); return true; } catch { return false; }
}
