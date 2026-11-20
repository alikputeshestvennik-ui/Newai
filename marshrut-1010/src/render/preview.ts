import { MathUtils, PerspectiveCamera, Vector3 } from 'three';
import type { Checkpoint, PreviewTarget, Run } from '../story/turkey-preview';
import type { loadMark } from './mark';
import { buildPreviewSets } from './preview-sets';

export interface PreviewFrame {
  stage: Checkpoint;
  line: number;
  signaled: boolean;
  run: Run;
}

const introShots = [
  { from: [4.7, 2.9, 4.6], to: [0.4, 1.23, -4.46] },
  { from: [-2.1, 1.75, -1.95], to: [0.67, 1.4, -4.65] },
  { from: [2.8, 2, 2.95], to: [0.15, 1.65, -2.43] },
];
const outroShots = [
  { from: [3.8, 2.35, 3.8], to: [0.12, 1.18, 0] },
  { from: [0.03, 1.56, 1.75], to: [0.57, 1.04, -0.2] },
  { from: [-3.55, 2.15, 2.6], to: [0, 1.13, -0.23] },
];

export function createPreviewView(
  mark: Awaited<ReturnType<typeof loadMark>>,
  placeTarget: (target: PreviewTarget, x: number, y: number) => void,
) {
  const camera = new PerspectiveCamera(44, 1, 0.08, 140);
  const sets = buildPreviewSets();
  const projected = new Vector3();
  const look = new Vector3();
  const previousPosition = new Vector3();
  const goal = new Vector3();
  const target = new Vector3();
  const anchors = Object.entries(sets.anchors) as [PreviewTarget, Vector3][];
  let previousStage: Checkpoint | undefined;
  let previousLine = -1;
  let previousSignaled = false;
  let easing = false;

  function update(frame: PreviewFrame, dt: number, reducedMotion: boolean) {
    const { stage, line, signaled, run } = frame;
    const stageChanged = stage !== previousStage;
    const cutChanged = previousLine !== line;
    const cueChanged = signaled !== previousSignaled;
    previousStage = stage;
    previousLine = line;
    previousSignaled = signaled;

    sets.running.visible = stage === 'runner';
    sets.drama.visible = stage !== 'runner';
    const fov = MathUtils.clamp(44 * (1.8 / camera.aspect), 44, 63);
    if (fov !== camera.fov) {
      camera.fov = fov;
      camera.updateProjectionMatrix();
    }

    if (stage === 'runner') {
      previousPosition.copy(mark.root.position);
      mark.root.position.set(run.x, 0, -run.distance);
      const moving = !stageChanged && run.distance > -previousPosition.z;
      const dx = moving ? run.x - previousPosition.x : 0;
      const dz = moving ? -run.distance - previousPosition.z : 0;
      const direction = Math.PI + MathUtils.clamp(-dx / Math.max(dt, 0.001) * 0.06, -0.22, 0.22);
      mark.root.visible = true;
      mark.posePreview(direction, dx, dz, dt, reducedMotion, moving, stageChanged || previousPosition.z < mark.root.position.z);
      camera.position.set(run.x * 0.36, 3.28, 5.55 - run.distance);
      camera.lookAt(run.x * 0.18, 0.78, -run.distance - 3.6);
      return run.result === 'running';
    }

    const watching = stage === 'aim' || (stage === 'intro' && line === 2);
    const finishing = stage === 'outro' || stage === 'complete';
    const drift = reducedMotion ? 1 : -Math.expm1(-5 * dt);
    if (stageChanged || cutChanged || cueChanged) easing = !reducedMotion;
    const reset = stageChanged || reducedMotion;
    const weight = reset ? 1 : drift;

    const courierX = finishing ? 0.42 : signaled ? 1.95 : 0.82;
    const leilaX = finishing ? 1.65 : signaled ? 2.72 : -0.83;
    sets.courier.position.lerp(goal.set(courierX, 0, finishing ? -0.42 : -4.77), weight);
    sets.leila.position.lerp(goal.set(leilaX, 0, finishing ? -0.79 : -4.57), weight);
    sets.courier.rotation.y = finishing ? -0.35 : -0.55;
    sets.leila.rotation.y = finishing ? -0.6 : 0.4;
    for (const prop of sets.props) prop.visible = finishing;
    const angle = signaled ? -1.54 : 0;
    sets.board.rotation.z = MathUtils.lerp(sets.board.rotation.z, angle, weight);

    mark.root.visible = watching || finishing;
    mark.root.position.set(finishing ? -0.69 : -1.72, 0, finishing ? 0.14 : 2.32);
    mark.posePreview(finishing ? 1.87 : Math.PI, 0, 0, dt, reducedMotion, false, stageChanged);

    if (stage === 'aim') {
      camera.position.set(0.12, 1.92, 4.55);
      look.set(0.12, 1.72, -2.4);
    } else {
      const shot = finishing ? outroShots[stage === 'complete' ? 2 : line] : introShots[line];
      goal.fromArray(shot.from);
      target.fromArray(shot.to);
      if (reset) {
        camera.position.copy(goal);
        look.copy(target);
      } else {
        camera.position.lerp(goal, drift);
        look.lerp(target, drift);
      }
    }
    camera.lookAt(look);

    if (stage === 'aim' && !signaled) {
      camera.updateMatrixWorld();
      for (const [id, anchor] of anchors) {
        projected.copy(anchor).project(camera);
        placeTarget(id, (projected.x + 1) / 2, (1 - projected.y) / 2);
      }
    }
    if (easing) {
      easing = stage === 'aim'
        ? Math.abs(sets.board.rotation.z - angle) > 0.005
        : camera.position.distanceToSquared(goal) + look.distanceToSquared(target) > 0.0001;
    }
    return easing;
  }

  return {
    camera, sets, update,
    reset() { previousStage = undefined; },
  };
}
