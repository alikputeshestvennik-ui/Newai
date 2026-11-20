import chapter from '../../data/turkey-preview.json';
import { matchingSign } from '../harbor/ticket';

const saveKey = 'route-1010:turkey:v2';
const checkpoints = ['intro', 'aim', 'runner', 'junction', 'escort', 'outro', 'complete'] as const;
const connectedStages: readonly string[] = ['junction', 'escort', 'outro', 'complete'];

export type Checkpoint = typeof checkpoints[number];
export type Cutscene = 'intro' | 'outro';
export type PreviewTarget = 'ring' | 'board' | 'lamp';

export interface TurkeyProgress {
  stage: Checkpoint;
  connected: boolean;
  helped: boolean;
  ledFamily: boolean;
}

export function loadProgress(storage?: Pick<Storage, 'getItem'>): TurkeyProgress {
  const initial: TurkeyProgress = { stage: 'intro', connected: false, helped: false, ledFamily: false };
  try {
    const store = storage ?? localStorage;
    const saved = JSON.parse(store.getItem(saveKey) ?? 'null');
    const stage = checkpoints.find((entry) => entry === saved?.stage);
    if (stage) {
      const ledFamily = saved.ledFamily === true && (stage === 'outro' || stage === 'complete');
      const helped = ledFamily || saved.helped === true;
      return { stage, connected: helped || saved.connected === true || connectedStages.includes(stage), helped, ledFamily };
    }
    const legacy = store.getItem('route-1010:turkey-preview:v1');
    initial.stage = checkpoints.find((entry) => entry === legacy) ?? initial.stage;
    initial.connected = connectedStages.includes(initial.stage)
      || store.getItem('route-1010:turkey-connection:v1') === 'earned';
  } catch {
    // Keep the scene playable when storage is unavailable.
  }
  return initial;
}

export function saveProgress(progress: TurkeyProgress, storage?: Pick<Storage, 'setItem'>) {
  try {
    (storage ?? localStorage).setItem(saveKey, JSON.stringify(progress));
  } catch {
    // Keep progress in memory for the current session.
  }
}

export function reachCheckpoint(progress: TurkeyProgress, stage: Checkpoint, ledFamily = false): TurkeyProgress {
  return {
    stage,
    connected: progress.connected || connectedStages.includes(stage),
    helped: progress.helped || ledFamily,
    ledFamily: ledFamily || ((stage === 'outro' || stage === 'complete') && progress.ledFamily),
  };
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
