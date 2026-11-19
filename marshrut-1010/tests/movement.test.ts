import { describe, expect, it } from 'vitest';
import tuning from '../data/player.json';
import { canWalk, createWalker, steerWalker, walk } from '../src/player/movement';

function hold(walker: ReturnType<typeof createWalker>, sideways: number, forward: number, frames: number) {
  for (let i = 0; i < frames; i++) walk(walker, sideways, forward, 0.1);
}

describe('walking around the Istanbul pier', () => {
  it('walks up the steps to the quay, stops at the pavilion, and can return', () => {
    const mark = createWalker();
    expect(mark.y).toBeCloseTo(0.615);
    hold(mark, 0, 1, 120);
    expect(mark.z).toBeGreaterThan(-4.81);
    expect(mark.z).toBeLessThan(-4.68);
    expect(mark.y).toBeCloseTo(1.01);
    hold(mark, 0, -1, 120);
    expect(mark.z).toBeGreaterThan(6.5);
    expect(mark.z).toBeLessThan(6.65);
    expect(mark.y).toBeCloseTo(0.615);
  });

  it('can reach the cross deck past the bollards and remains on solid ground', () => {
    const mark = { ...createWalker(), z: 5.74 };
    hold(mark, 1, 0, 120);
    expect(mark.x).toBeGreaterThan(4.05);
    expect(mark.x).toBeLessThan(4.17);
    expect(canWalk(mark.x, mark.z)).toBe(true);
    expect(canWalk(2.6, 4.9)).toBe(false);
    expect(canWalk(1.93, 5.14)).toBe(false);
    expect(canWalk(-8.8, -7.4)).toBe(false);
  });

  it('walks forward as soon as the movement button is held', () => {
    const mark = createWalker();
    const startZ = mark.z;
    expect(walk(mark, 0, 1, 0.1)).toBeCloseTo(tuning.walkSpeed / 10);
    expect(mark.x).toBeCloseTo(0);
    expect(mark.z).toBeCloseTo(startZ - tuning.walkSpeed / 10);
    expect(walk(mark, 0, 0, 0.1)).toBe(0);
  });

  it('steps sideways without changing heading and bends its path with a right swipe', () => {
    const mark = createWalker();
    const heading = mark.heading;
    const startZ = mark.z;
    const step = tuning.walkSpeed / 10;
    walk(mark, -1, 0, 0.1);
    expect(mark.x).toBeCloseTo(-step);
    expect(mark.z).toBeCloseTo(startZ);
    expect(mark.heading).toBe(heading);

    steerWalker(mark, Math.PI / (2 * tuning.camera.lookRadiansPerPixel));
    expect(mark.heading).toBeCloseTo(Math.PI / 2);
    walk(mark, 0, 1, 0.1);
    expect(mark.x).toBeCloseTo(0);
    expect(mark.z).toBeCloseTo(startZ);
    walk(mark, 0, 1, 0.1);
    expect(mark.x).toBeCloseTo(step);
    expect(mark.heading).toBeCloseTo(Math.PI / 2);
  });

  it('can turn away from an obstacle even without a successful step', () => {
    const mark = { ...createWalker(), z: -4.8 };
    expect(walk(mark, 0, 1, 0.1)).toBeCloseTo(0);
    steerWalker(mark, -Math.PI / (2 * tuning.camera.lookRadiansPerPixel));
    expect(walk(mark, 0, 1, 0.1)).toBeGreaterThan(0);
    expect(mark.x).toBeLessThan(0);
  });
});
