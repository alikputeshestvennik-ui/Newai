import chapter from '../../data/turkey-preview.json';
import { matchingSign } from '../harbor/ticket';

const saveKey = 'route-1010:turkey-preview:v1';
const checkpoints = ['intro', 'aim', 'runner', 'outro', 'complete'] as const;

export type Checkpoint = typeof checkpoints[number];
export type Cutscene = 'intro' | 'outro';
export type PreviewTarget = 'ring' | 'board' | 'lamp';

export function loadCheckpoint(): Checkpoint {
  try {
    return checkpoints.find((stage) => stage === localStorage.getItem(saveKey)) ?? 'intro';
  } catch {
    return 'intro';
  }
}

export function saveCheckpoint(stage: Checkpoint) {
  try {
    localStorage.setItem(saveKey, stage);
  } catch {
    // The scene still works when storage is unavailable.
  }
}

export function checkSignal(target: PreviewTarget | undefined) {
  return target === chapter.viewfinder.switch;
}

const course = chapter.runner;

export function createRun() {
  return { lane: 1, x: 0, distance: 0, gate: 0, result: 'ready' as RunResult };
}

type RunResult = 'ready' | 'running' | 'blocked' | 'wrong' | 'finish';
export type Run = ReturnType<typeof createRun>;

export function laneCenter(lane: number) {
  return (lane - 1) * course.laneWidth;
}

export function shiftLane(run: Run, direction: -1 | 1) {
  if (run.result !== 'running') return;
  run.lane = Math.max(0, Math.min(2, run.lane + direction));
}

export function advanceRun(run: Run, seconds: number): RunResult {
  if (run.result !== 'running' || seconds <= 0) return run.result;

  const target = laneCenter(run.lane);
  const dx = target - run.x;
  const nextDistance = Math.min(run.distance + seconds * course.speed, course.finish);

  function xAt(distance: number) {
    const time = (distance - run.distance) / course.speed;
    return run.x + Math.sign(dx) * Math.min(Math.abs(dx), course.sideSpeed * time);
  }

  let gate = course.gates[run.gate];
  while (gate && gate.at <= nextDistance) {
    const x = xAt(gate.at);
    const lane = Math.round(x / course.laneWidth) + 1;
    if (gate.blocked?.includes(lane) || (gate.signs && gate.signs[lane] !== matchingSign.id)) {
      run.result = gate.signs ? 'wrong' : 'blocked';
      run.x = x;
      run.distance = gate.at;
      return run.result;
    }
    gate = course.gates[++run.gate];
  }

  run.x = xAt(nextDistance);
  run.distance = nextDistance;
  if (nextDistance === course.finish) run.result = 'finish';
  return run.result;
}
