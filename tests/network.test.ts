import { expect, it } from 'vitest';
import { createWorld } from '../src/sim/world';
import { layoutNetwork } from '../src/render/network';

it('разводит линии и черновик на общей улице независимо от направления', () => {
  const world = createWorld();
  world.routes.push({ ...world.routes[0], id: 2, stops: [2, 1] });
  const lines = layoutNetwork(world, [1, 2]);
  const shared = lines[1].segments[0].key;
  const lanes = lines.map(line => line.segments.find(segment => segment.key === shared)!)
    .map(segment => segment.direction * segment.lane);
  expect(new Set(lanes)).toEqual(new Set([-1, 0, 1]));
  expect(lines[0].segments.filter(segment => segment.key !== shared).every(segment => segment.lane === 0)).toBe(true);
});
