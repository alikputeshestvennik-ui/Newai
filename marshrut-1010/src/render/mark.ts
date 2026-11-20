import {
  CircleGeometry, Group, Mesh, MeshBasicMaterial, type Bone, type Object3D,
} from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import tuning from '../../data/player.json';
import { buildBackpack } from './backpack';

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

function buildMark(model: Group) {
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

  let phase = 0;
  let stride = 0;
  let breathing = 0;
  let initialized = false;
  let strafe = 0;
  return {
    root,
    pose(heading: number, distanceWalked: number, seconds: number, reducedMotion: boolean, sideways: number) {
      const dt = Math.min(seconds, 0.1);
      const speed = dt > 0 ? Math.min(1, distanceWalked / (tuning.walkSpeed * dt)) : 0;
      const turn = Math.atan2(Math.sin(heading - figure.rotation.y), Math.cos(heading - figure.rotation.y));
      figure.rotation.y = initialized && !reducedMotion
        ? figure.rotation.y + turn * (1 - Math.exp(-16 * dt)) : heading;
      initialized = true;

      const blend = 1 - Math.exp(-13 * dt);
      stride = reducedMotion ? 0 : stride + (Math.sqrt(speed) - stride) * blend;
      if (stride < 0.002) stride = 0;
      strafe += (sideways - strafe) * blend;
      breathing = (breathing + dt * 2.1) % (2 * Math.PI);
      phase = stride > 0 ? (phase + distanceWalked * Math.PI / 0.73) % (2 * Math.PI) : 0;

      const swing = Math.sin(phase);
      const step = Math.cos(phase);
      const forward = 1 - Math.abs(strafe);
      const breath = reducedMotion ? 0 : Math.sin(breathing) * (1 - stride);
      figure.position.y = (Math.abs(step) * 0.029 - 0.023) * stride;
      waist.rotation.y = -swing * 0.075 * stride;
      chest.rotation.set(0.075 * forward * stride + 0.014 * breath, swing * 0.15 * stride, -0.1 * strafe * stride);
      head.rotation.set(-chest.rotation.x * 0.64, -chest.rotation.y * 0.5, -chest.rotation.z * 0.7);

      for (const { hip, knee, ankle, shoulder, elbow, side } of limbs) {
        const legSwing = swing * side;
        const lift = Math.max(0, step * side);
        hip.rotation.x = (-forward * legSwing * 0.46 - lift * 0.12 + 0.03) * stride;
        hip.rotation.z = strafe * (0.11 + legSwing * 0.18) * stride;
        knee.rotation.x = (0.07 + lift * 0.84) * stride;
        ankle.rotation.x = -(hip.rotation.x + knee.rotation.x) * 0.79;
        shoulder.rotation.x = (legSwing * 0.34 * forward - 0.07) * stride;
        elbow.rotation.x = 0.55 - (0.18 + Math.max(0, -legSwing) * 0.33) * stride;
      }
    },
  };
}
