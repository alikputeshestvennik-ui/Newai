import { Group, MathUtils, PerspectiveCamera, Vector3 } from 'three';
import type { Checkpoint, PreviewTarget, Run } from '../story/turkey-preview';
import type { loadMark } from './mark';
import type { PreviewCast } from './preview-cast';
import { buildPreviewSets } from './preview-sets';

export interface PreviewFrame {
  stage: Checkpoint;
  line: number;
  signaled: boolean;
  ledFamily: boolean;
  escortDistance: number;
  run: Run;
}

const introShots = [
  { from: [-0.32, 1.64, -2.66], to: [-0.22, 1.25, -4.59] },
  { from: [0.63, 1.67, -2.92], to: [0.77, 1.42, -4.67] },
  { from: [2.8, 2, 2.95], to: [0.15, 1.65, -2.43] },
];
const familyShot = { from: [2.92, 1.63, 1.73], to: [1.5, 1.06, -0.55] };
const outroShots = [
  { from: [3.8, 2.35, 3.8], to: [0.12, 1.18, 0] },
  { from: [0.03, 1.56, 1.75], to: [0.62, 1.30, -0.2] },
  { from: [-3.55, 2.15, 2.6], to: [0, 1.13, -0.23] },
  { from: [1.55, 1.64, 1.12], to: [1.52, 1.35, -0.73] },
];

export function createPreviewView(
  mark: Awaited<ReturnType<typeof loadMark>>,
  cast: PreviewCast,
  placeTarget: (target: PreviewTarget, x: number, y: number) => void,
) {
  const camera = new PerspectiveCamera(44, 1, 0.08, 140);
  const sets = buildPreviewSets(cast);
  const root = new Group();
  root.add(sets.drama, sets.running, sets.detour, cast.courier.root, cast.leila.root, cast.samir.root);
  const projected = new Vector3();
  const look = new Vector3();
  const goal = new Vector3();
  const target = new Vector3();
  const anchors = Object.entries(sets.anchors) as [PreviewTarget, Vector3][];
  let previousStage: Checkpoint | undefined;
  let previousLine = -1;
  let previousSignaled = false;
  let previousDistance = 0;
  let easing = false;

  function update(frame: PreviewFrame, dt: number, reducedMotion: boolean) {
    const { stage, line, signaled, run, ledFamily, escortDistance } = frame;
    root.visible = true;
    const stageChanged = stage !== previousStage;
    const cutChanged = previousLine !== line;
    const cueChanged = signaled !== previousSignaled;
    previousStage = stage;
    previousLine = line;
    previousSignaled = signaled;

    const onDetour = stage === 'junction' || stage === 'escort';
    const finishing = stage === 'outro' || stage === 'complete';
    sets.running.visible = stage === 'runner';
    sets.detour.visible = onDetour;
    sets.drama.visible = !onDetour && !sets.running.visible;
    cast.courier.root.visible = sets.drama.visible;
    cast.leila.root.visible = !sets.running.visible;
    cast.samir.root.visible = onDetour || finishing;
    const fov = MathUtils.clamp(44 * (1.8 / camera.aspect), 44, 63);
    if (fov !== camera.fov) {
      camera.fov = fov;
      camera.updateProjectionMatrix();
    }

    if (stage === 'runner') {
      const dx = stageChanged ? 0 : run.x - mark.root.position.x;
      mark.root.position.set(run.x, 0, -run.distance);
      mark.root.visible = true;
      const moving = mark.poseRun(run.distance, dx, dt, run.result === 'running');
      camera.position.set(run.x * 0.36, 3.28, 5.55 - run.distance);
      camera.lookAt(run.x * 0.18, 0.78, -run.distance - 3.6);
      return moving;
    }

    if (onDetour) {
      const dz = stageChanged || escortDistance < previousDistance ? 0 : previousDistance - escortDistance;
      previousDistance = escortDistance;
      const walking = escortDistance > 0;
      const heading = walking ? Math.PI : -1.79;
      mark.root.visible = true;
      mark.root.position.set(0.67, 0, 0.35 - escortDistance);
      mark.posePreview(walking ? Math.PI : 1.02, 0, dz, dt, reducedMotion, stageChanged);
      const leilaMoving = cast.leila.pose(1.43, 0.89 - escortDistance, heading,
        stage === 'junction', false, dt, stageChanged, true);
      const samirMoving = cast.samir.pose(2.11, 1.26 - escortDistance, heading,
        stage === 'escort' && !walking, false, dt, stageChanged, true);

      if (walking) {
        camera.position.set(4.1, 2.38, -2.0 - escortDistance);
        camera.lookAt(1.15, 0.92, 0.25 - escortDistance);
      } else if (stage === 'junction') {
        camera.position.set(3.05, 2.68, 4.82);
        camera.lookAt(0.04, 0.97, -1.64);
      } else {
        camera.position.set(2.65, 2.24, 4.34);
        camera.lookAt(0.05, 0.99, -1.47);
      }
      return leilaMoving || samirMoving;
    }

    const watching = stage === 'aim' || (stage === 'intro' && line === 2);
    const drift = reducedMotion ? 1 : -Math.expm1(-5 * dt);
    if (stageChanged || cutChanged || cueChanged) easing = !reducedMotion;
    const reset = stageChanged || reducedMotion;
    const weight = reset ? 1 : drift;

    const courierX = finishing ? 0.42 : signaled ? 1.95 : 0.82;
    const leilaX = finishing ? 1.65 : signaled ? 2.72 : -0.83;
    const courierMoving = cast.courier.pose(courierX, finishing ? -0.42 : -4.77,
      finishing ? -0.35 : signaled ? Math.PI / 2 : -0.19,
      (stage === 'intro' && line === 1) || (stage === 'outro' && line === 0 && !ledFamily),
      finishing && line > 0, dt, reset);
    const leilaMoving = cast.leila.pose(leilaX, finishing ? -0.79 : -4.57,
      finishing ? -0.35 : signaled ? Math.PI / 2 : 0.4,
      (stage === 'intro' && line === 0) || (stage === 'outro' && line === 4), false, dt, reset);
    const samirMoving = finishing && cast.samir.pose(1.23, 0.02, -0.54,
      stage === 'outro' && line === 0 && ledFamily, false, dt, reset);
    for (const prop of sets.props) prop.visible = finishing;
    const angle = signaled ? -1.54 : 0;
    sets.board.rotation.z = MathUtils.lerp(sets.board.rotation.z, angle, weight);

    mark.root.visible = watching || finishing;
    mark.root.position.set(finishing ? -0.69 : -1.72, 0, finishing ? 0.14 : 2.32);
    mark.posePreview(finishing ? 1.87 : Math.PI, 0, 0, dt, reducedMotion, stageChanged);

    if (stage === 'aim') {
      camera.position.set(0.12, 1.92, 4.55);
      look.set(0.12, 1.72, -2.4);
    } else {
      const shot = finishing
        ? (line === 0 && stage === 'outro' && ledFamily ? familyShot
          : outroShots[stage === 'complete' ? 2 : Math.max(0, line - 1)])
        : introShots[line];
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
    return easing || courierMoving || leilaMoving || samirMoving;
  }

  return {
    camera, root, update,
    reset() { previousStage = undefined; },
  };
}
