import rail from '../../data/balance/rail.json' with { type: 'json' };
import { roadPath, roadDistance, type RoadPoint } from './roads';
import type { District, Mode } from './types';

export const railway = rail;
export const allowedStop = (mode: Mode, stop: District) => mode !== 'suburban' || rail.platforms.includes(stop.name);
export function alignment(mode: Mode, from: District, to: District): RoadPoint[] {
  if (mode === 'metro') return [[from.x,from.y],[to.x,to.y]];
  if (mode !== 'suburban') return roadPath(from,to);
  const middle=rail.platformXs.filter(x=>x>Math.min(from.x,to.x)&&x<Math.max(from.x,to.x));
  return [from.x,...(from.x<to.x?middle:middle.reverse()),to.x].map(x=>[x,rail.trackZ]);
}
export const lineDistance=(mode:Mode,from:District,to:District)=>mode==='metro'?Math.hypot(from.x-to.x,from.y-to.y):mode==='suburban'?Math.abs(from.x-to.x):roadDistance(from,to);
