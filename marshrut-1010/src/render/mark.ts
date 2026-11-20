import {
  CircleGeometry, Group, Mesh, MeshBasicMaterial,
} from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { buildBackpack } from './backpack';
import { createMarkGait } from './mark-gait';
import { createMarkRun } from './mark-run';
import { bindCharacterRig } from './character-rig';

const modelUrl = new URL('../assets/mark.glb', import.meta.url).href;

export async function loadMark() {
  const { scene: model } = await new GLTFLoader().loadAsync(modelUrl);
  return buildMark(model);
}

export function buildMark(model: Group) {
  const root = new Group();
  const figure = new Group();
  root.add(figure);
  figure.add(model);

  const { waist, chest, head, limbs } = bindCharacterRig(model);
  chest.add(buildBackpack());

  const shadow = new Mesh(new CircleGeometry(0.36, 20), new MeshBasicMaterial({
    color: 0x241b15, transparent: true, opacity: 0.25, depthWrite: false,
  }));
  shadow.rotation.x = -Math.PI / 2;
  shadow.scale.y = 0.74;
  shadow.position.y = 0.014;
  root.add(shadow);

  const step = createMarkGait(root, limbs);
  const previewStep = createMarkGait(root, limbs, () => 0);
  const runStep = createMarkRun(limbs);
  let breathing = 0;

  function poseWith(
    { offset, armSwing, effort, sideways, active }: ReturnType<typeof step>,
    heading: number, dt: number, reducedMotion: boolean, running: boolean,
  ) {
    breathing = (breathing + dt * 2.1) % (2 * Math.PI);
    const breath = reducedMotion ? 0 : Math.sin(breathing) * (1 - effort);
    figure.rotation.y = heading;
    figure.position.y = offset;
    waist.rotation.y = -armSwing * 0.035;
    chest.rotation.set((running ? 0.22 : 0.055) * effort + 0.008 * breath, armSwing * 0.065,
      -(running ? 0.22 : 0.07) * sideways * effort);
    head.rotation.set(-chest.rotation.x * 0.7, -chest.rotation.y * 0.55, -chest.rotation.z * 0.75);

    for (const { shoulder, elbow, bendAxis, side } of limbs) {
      const swing = armSwing * side;
      shoulder.rotation.x = swing * (running ? 0.56 : 0.24) - 0.04 * effort;
      if (running) {
        elbow.quaternion.setFromAxisAngle(bendAxis, 0.43 - effort * (1.07 - swing * 0.13));
      } else {
        elbow.rotation.set(0.55 - (0.08 * effort + Math.max(0, -swing) * 0.16), 0, 0);
      }
    }
    return active;
  }

  return {
    root,
    pose(heading: number, dx: number, dz: number, dt: number, reducedMotion: boolean) {
      return poseWith(step(heading, dx, dz, dt), heading, dt, reducedMotion, false);
    },
    posePreview(heading: number, dx: number, dz: number, dt: number, reducedMotion: boolean, reset: boolean) {
      if (reset) previewStep.reset();
      return poseWith(previewStep(heading, dx, dz, dt), heading, dt, reducedMotion, false);
    },
    poseRun(distance: number, dx: number, dt: number, moving: boolean) {
      return poseWith(runStep(distance, dx, dt, moving), Math.PI, dt, true, true);
    },
  };
}
