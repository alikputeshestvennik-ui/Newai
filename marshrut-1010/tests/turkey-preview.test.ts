import { describe, expect, it } from 'vitest';
import {
  advanceRun, checkSignal, createRun, loadProgress, reachCheckpoint, saveProgress, shiftLane,
} from '../src/story/turkey-preview';

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
    advanceRun(run, 2.02);
    shiftLane(run, 1);
    expect(advanceRun(run, 0.2)).toBe('blocked');
  });

  it('runs slightly faster than the 3.5 m/s prototype without changing the course', () => {
    const run = startRun();
    advanceRun(run, 1);
    expect(run.distance).toBeCloseTo(3.9);
    expect(run.gate).toBe(0);
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

describe('Turkey checkpoint and detour', () => {
  function createStorage(initial: Record<string, string> = {}) {
    const values = new Map(Object.entries(initial));
    return {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => { values.set(key, value); },
    };
  }

  it('loads completed saves and earned connection from the previous version', () => {
    expect(loadProgress(createStorage({ 'route-1010:turkey-preview:v1': 'complete' })))
      .toEqual({ stage: 'complete', connected: true, helped: false, ledFamily: false });
    expect(loadProgress(createStorage({
      'route-1010:turkey-preview:v1': 'runner',
      'route-1010:turkey-connection:v1': 'earned',
    }))).toEqual({ stage: 'runner', connected: true, helped: false, ledFamily: false });
  });

  it('awards help after the escort and retains both marks during a replay', () => {
    const store = createStorage();
    const junction = reachCheckpoint(loadProgress(store), 'junction');
    expect(junction).toMatchObject({ connected: true, helped: false });
    const escort = reachCheckpoint(junction, 'escort');
    saveProgress(escort, store);
    expect(loadProgress(store)).toEqual(escort);

    const helped = reachCheckpoint(escort, 'outro', true);
    const ending = reachCheckpoint(helped, 'complete');
    saveProgress(ending, store);
    expect(loadProgress(store)).toEqual({ stage: 'complete', connected: true, helped: true, ledFamily: true });

    const skipped = reachCheckpoint(reachCheckpoint(ending, 'junction'), 'outro');
    expect(skipped).toMatchObject({ connected: true, helped: true, ledFamily: false });
  });
});
