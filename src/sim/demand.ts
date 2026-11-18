import { lineDistance } from './alignment';
import { E, D, T } from './config';
import type { District, Route, World } from './types';
export const distance = (a: District, b: District) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
export function demand(a: District, b: District, minute: number): number {
  if (a.id === b.id) return 0;
  const hour = (E.startHour + Math.floor(minute / 60)) % 24;
  const period = hour >= 7 && hour < 10 ? 0 : hour >= 10 && hour < 17 ? 1 : hour >= 17 && hour < 21 ? 2 : 3;
  const weekend = Math.floor(minute / E.minutesPerDay) % 7 >= 5;
  const origin = D.originWeights[a.type as keyof typeof D.originWeights][period];
  const dest = D.destinationWeights[b.type as keyof typeof D.destinationWeights][period];
  const dayWeight = weekend ? D.weekendDestinationWeights[b.type as keyof typeof D.weekendDestinationWeights] : 1;
  return a.population * origin * b.pull * dest * dayWeight / (1 + distance(a, b) / E.distanceDecay) ** 2 * E.demandScale;
}
export function modeShares(transitTime: number, fare: number, wait: number, dist: number, load = 0, congestion = 0) {
  const discomfort = Math.max(0, load - E.comfortLoadThreshold) ** 2;
  const transit = -E.alpha * transitTime - E.beta * fare - E.epsilon * wait - E.gamma * discomfort;
  const car = -E.alpha * dist * E.carMinutesPerUnit * (1 + congestion) - E.beta * E.carFare;
  const walk = -E.alpha * dist * E.walkMinutesPerUnit;
  const taxi = -E.alpha * (dist * E.taxiMinutesPerUnit * (1 + congestion) + E.taxiWaitMinutes) - E.beta * (E.taxiBaseFare + dist * E.taxiFarePerUnit);
  const max = Math.max(transit, car, walk, taxi);
  const t = Math.exp(transit - max), c = Math.exp(car - max), w = Math.exp(walk - max), x = Math.exp(taxi - max);
  const sum = t + c + w + x;
  return { transit: t / sum, car: c / sum, walk: w / sum, taxi: x / sum };
}
export function routeLength(world: World, route: Route): number {
  return route.stops.slice(1).reduce((sum, id, i) => sum + lineDistance(route.mode,world.districts[route.stops[i]], world.districts[id]), 0);
}
export function routeTravel(world: World, route: Route, from: number, to: number): number {
  const a = route.stops.indexOf(from), b = route.stops.indexOf(to);
  if (a < 0 || b < 0) return Infinity;
  const ids = route.stops.slice(Math.min(a, b), Math.max(a, b) + 1);
  return routeLength(world, { ...route, stops: ids }) * T[route.mode].minutesPerUnit;
}
export function headway(world: World, route: Route): number {
  return (routeLength(world, route) * T[route.mode].minutesPerUnit * 2 + T[route.mode].turnaroundMinutes) / Math.max(1, route.vehicles);
}
