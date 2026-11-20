import {
  CircleGeometry, Group, Mesh, MeshBasicMaterial, type Bone, type Object3D,
} from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { buildBackpack } from './backpack';
import { createMarkGait } from './mark-gait';

const modelUrl = new URL('../assets/mark.glb', import.meta.url).href;

function bone(model: Object3D, name: string) {
  const joint = model.getObjectByName(name) as Bone | undefined;
  if (!joint?.isBone) throw new Error(`Mark's model is missing bone ${name}`);
  return joint;
}

export async function loadMark() {
  const { scene: model } = await new GLTFLoader().loadAsync(modelUrl);
  return buildMark(model);
}

export function buildMark(model: Group) {
  const root = new Group();
  const figure = new Group();
  root.add(figure);
  figure.add(model);

  const waist = bone(model, 'spine02');
  const chest = bone(model, 'spine01');
  const head = bone(model, 'head');
  chest.add(buildBackpack());

  const limbs = (['L', 'R'] as const).map((suffix, index) => {
    const side = index === 0 ? 1 : -1;
    const shoulder = bone(model, `upperarm01_${suffix}`);
    const elbow = bone(model, `lowerarm01_${suffix}`);
    const armAngle = Math.atan2(elbow.position.x, -elbow.position.y);
    shoulder.rotation.z = -armAngle + side * 0.09;
    for (const finger of [2, 3, 4, 5]) {
      bone(model, `finger${finger}-1_${suffix}`).rotation.x = 0.24;
    }
    return {
      side, shoulder, elbow,
      hip: bone(model, `upperleg01_${suffix}`),
      knee: bone(model, `lowerleg01_${suffix}`),
      ankle: bone(model, `foot_${suffix}`),
    };
  });

  const shadow = new Mesh(new CircleGeometry(0.36, 20), new MeshBasicMaterial({
    color: 0x241b15, transparent: true, opacity: 0.25, depthWrite: false,
  }));
  shadow.rotation.x = -Math.PI / 2;
  shadow.scale.y = 0.74;
  shadow.position.y = 0.014;
  root.add(shadow);

  const step = createMarkGait(root, limbs);
  const previewStep = createMarkGait(root, limbs, () => 0);
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
    chest.rotation.set((running ? 0.15 : 0.055) * effort + 0.008 * breath, armSwing * 0.065, -0.07 * sideways * effort);
    head.rotation.set(-chest.rotation.x * 0.7, -chest.rotation.y * 0.55, -chest.rotation.z * 0.75);

    for (const { shoulder, elbow, side } of limbs) {
      const swing = armSwing * side;
      shoulder.rotation.x = swing * (running ? 0.36 : 0.24) - 0.04 * effort;
      elbow.rotation.x = (running ? 0.98 : 0.55) - (0.08 * effort + Math.max(0, -swing) * 0.16);
    }
    return active;
  }

  return {
    root,
    pose(heading: number, dx: number, dz: number, dt: number, reducedMotion: boolean) {
      return poseWith(step(heading, dx, dz, dt), heading, dt, reducedMotion, false);
    },
    posePreview(heading: number, dx: number, dz: number, dt: number, reducedMotion: boolean, running: boolean, reset: boolean) {
      if (reset) previewStep.reset();
      return poseWith(previewStep(heading, dx, dz, dt, running), heading, dt, reducedMotion, running);
    },
  };
}
