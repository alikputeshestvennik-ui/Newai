import { Group, MathUtils } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import tuning from '../../data/player.json';
import { bindCharacterRig } from './character-rig';
import { createMarkGait } from './mark-gait';

function buildActor(model: Group) {
  const root = new Group();
  root.add(model);
  const { chest, head, limbs } = bindCharacterRig(model);
  const walk = createMarkGait(root, limbs, () => 0);
  const hand = new Group();
  hand.position.set(0, -0.06, 0.055);
  limbs[0].wrist.add(hand);
  let gesture = 0;

  return {
    root,
    hand,
    pose(x: number, z: number, heading: number, speaking: boolean, presenting: boolean, dt: number, reset: boolean) {
      const previousX = root.position.x;
      const weight = reset ? 1 : -Math.expm1(-8 * dt);
      const desiredGesture = presenting ? 1 : speaking ? 0.45 : 0;
      gesture = MathUtils.lerp(gesture, desiredGesture, weight);
      const dx = reset ? 0 : MathUtils.clamp(x - previousX, -tuning.walkSpeed * dt, tuning.walkSpeed * dt);
      root.position.set(reset ? x : previousX + dx, 0, z);
      root.rotation.y = heading;
      if (reset) walk.reset();
      const step = walk(heading, dx, 0, dt);
      model.position.y = step.offset;
      head.rotation.set(-0.06 * gesture, 0.16 * gesture, -0.075 * gesture);
      chest.rotation.y = 0.075 * gesture + step.armSwing * 0.04;
      for (const { shoulder, elbow, bendAxis, side } of limbs) {
        const raising = side === 1 ? gesture : 0;
        shoulder.rotation.x = -0.24 * raising + step.armSwing * side * 0.25;
        elbow.quaternion.setFromAxisAngle(bendAxis, 0.34 - 0.91 * raising);
      }
      return !reset && (Math.abs(root.position.x - x) > 0.001 || step.active
        || Math.abs(gesture - desiredGesture) > 0.001);
    },
  };
}

export async function loadPreviewCast() {
  const loader = new GLTFLoader();
  const [courier, leila] = await Promise.all([
    loader.loadAsync(new URL('../assets/courier.glb', import.meta.url).href),
    loader.loadAsync(new URL('../assets/leila.glb', import.meta.url).href),
  ]);
  return { courier: buildActor(courier.scene), leila: buildActor(leila.scene) };
}

export type PreviewCast = Awaited<ReturnType<typeof loadPreviewCast>>;
