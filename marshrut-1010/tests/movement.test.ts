import { describe, expect, it } from 'vitest';
import tuning from '../data/player.json';
import { canWalk, createWalker, walk } from '../src/player/movement';

function hold(walker: ReturnType<typeof createWalker>, sideways: number, forward: number, frames: number) {
  for (let i = 0; i < frames; i++) walk(walker, sideways, forward, 0, 0.1);
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

  it('moves relative to the camera and caps diagonal speed', () => {
    const mark = createWalker();
    const moved = walk(mark, 0, 1, Math.PI / 2, 0.1);
    expect(mark.x).toBeCloseTo(-tuning.walkSpeed / 10);
    expect(mark.z).toBeCloseTo(3.5);
    expect(mark.heading).toBeCloseTo(-Math.PI / 2);
    expect(walk(mark, 1, 1, 0, 0.1)).toBeCloseTo(moved);
    expect(walk(mark, 0.5, 0, 0, 0.1)).toBeCloseTo(moved / 2);
    expect(walk(mark, 0, 0, Math.PI, 0.1)).toBe(0);
  });
});
