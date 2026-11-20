import { describe, expect, it } from 'vitest';
import { advanceRun, checkSignal, createRun, shiftLane } from '../src/story/turkey-preview';

function startRun() {
  const run = createRun();
  run.result = 'running';
  return run;
}

describe('Turkey scene preview', () => {
  it('triggers the scripted signal only at the pier board', () => {
    expect(checkSignal('board')).toBe(true);
    expect(checkSignal('ring')).toBe(false);
    expect(checkSignal('lamp')).toBe(false);
    expect(checkSignal(undefined)).toBe(false);
  });

  it('stops on a blocked lane even if the next frame would pass it', () => {
    const run = startRun();
    expect(advanceRun(run, 3)).toBe('blocked');
    expect(run.distance).toBe(8);
    expect(advanceRun(run, 1)).toBe('blocked');
    expect(createRun()).toMatchObject({ lane: 1, distance: 0, result: 'ready' });
  });

  it('requires time to move to the next lane before the obstacle', () => {
    const run = startRun();
    advanceRun(run, 2.25);
    shiftLane(run, 1);
    expect(advanceRun(run, 0.2)).toBe('blocked');
  });

  it('goes through both boats and checks the chosen sign at the exit', () => {
    const run = startRun();
    shiftLane(run, 1);
    advanceRun(run, 2.5);
    expect(run.gate).toBe(1);
    shiftLane(run, -1);
    shiftLane(run, -1);
    advanceRun(run, 3);
    expect(run.gate).toBe(2);
    expect(advanceRun(run, 4)).toBe('wrong');

    const retry = startRun();
    shiftLane(retry, 1);
    advanceRun(retry, 2.5);
    shiftLane(retry, -1);
    shiftLane(retry, -1);
    advanceRun(retry, 3);
    shiftLane(retry, 1);
    shiftLane(retry, 1);
    expect(advanceRun(retry, 4)).toBe('finish');
  });
});
