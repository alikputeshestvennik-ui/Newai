import {
  BoxGeometry, CircleGeometry, CylinderGeometry, Group, Mesh, MeshBasicMaterial, MeshLambertMaterial,
} from 'three';
import tuning from '../../data/player.json';

const box = new BoxGeometry();
const taper = new CylinderGeometry(0.5, 0.4, 1, 8);

export function buildMark() {
  const root = new Group();
  const figure = new Group();
  const torso = new Group();
  root.add(figure);
  figure.add(torso);

  const jacket = new MeshLambertMaterial({ color: 0xca5b3c });
  const trim = new MeshLambertMaterial({ color: 0x994732 });
  const shirt = new MeshLambertMaterial({ color: 0xe6c9a5 });
  const trousers = new MeshLambertMaterial({ color: 0x263842 });
  const boots = new MeshLambertMaterial({ color: 0x312b27 });
  const skin = new MeshLambertMaterial({ color: 0xc98a60 });
  const hair = new MeshLambertMaterial({ color: 0x46352b });
  const bag = new MeshLambertMaterial({ color: 0xc3a26b });
  const bagTrim = new MeshLambertMaterial({ color: 0x806244 });

  function piece(
    parent: Group, material: MeshLambertMaterial, x: number, y: number, z: number,
    width: number, height: number, depth: number, geometry: BoxGeometry | CylinderGeometry = box,
  ) {
    const mesh = new Mesh(geometry, material);
    mesh.position.set(x, y, z);
    mesh.scale.set(width, height, depth);
    parent.add(mesh);
    return mesh;
  }

  function joint(parent: Group, x: number, y: number, z: number) {
    const group = new Group();
    group.position.set(x, y, z);
    parent.add(group);
    return group;
  }

  torso.position.y = 0.83;
  piece(figure, trousers, 0, 0.825, 0, 0.43, 0.2, 0.26, taper);
  piece(torso, jacket, 0, 0.27, 0, 0.53, 0.51, 0.32, taper);
  piece(torso, trim, 0, 0.048, 0, 0.45, 0.1, 0.3, taper);
  piece(torso, shirt, 0, 0.48, 0.125, 0.15, 0.13, 0.055);
  piece(torso, trim, 0, 0.235, 0.149, 0.022, 0.37, 0.03);
  piece(torso, skin, 0, 0.54, 0.02, 0.14, 0.14, 0.14, taper);
  piece(torso, skin, 0, 0.72, 0.03, 0.29, 0.32, 0.29, taper);
  piece(torso, skin, 0, 0.715, 0.161, 0.06, 0.07, 0.075);
  piece(torso, hair, 0, 0.862, 0.015, 0.31, 0.125, 0.305, taper);
  piece(torso, hair, 0, 0.767, -0.079, 0.247, 0.17, 0.108);

  piece(torso, bagTrim, 0, 0.29, -0.214, 0.35, 0.45, 0.19);
  piece(torso, bag, 0, 0.29, -0.299, 0.31, 0.39, 0.106, taper);
  piece(torso, bagTrim, 0, 0.198, -0.349, 0.24, 0.14, 0.055);
  piece(torso, bag, 0, 0.249, -0.379, 0.22, 0.032, 0.016);

  const limbs = [-1, 1].map((side) => {
    piece(torso, hair, side * 0.064, 0.767, 0.153, 0.026, 0.019, 0.023);
    piece(torso, bagTrim, side * 0.151, 0.402, 0.131, 0.047, 0.22, 0.031)
      .rotation.z = -side * 0.15;
    piece(torso, bagTrim, side * 0.165, 0.506, -0.053, 0.047, 0.035, 0.31);

    const hip = joint(figure, side * 0.123, 0.808, 0);
    piece(hip, trousers, 0, -0.174, 0, 0.2, 0.386, 0.23, taper);
    const knee = joint(hip, 0, -0.351, 0);
    piece(knee, trousers, 0, -0.166, 0, 0.162, 0.35, 0.181, taper);
    const ankle = joint(knee, 0, -0.344, 0);
    piece(ankle, boots, 0, -0.049, 0.052, 0.182, 0.12, 0.31);
    piece(ankle, trim, 0, -0.104, 0.052, 0.189, 0.022, 0.318);

    const shoulder = joint(torso, side * 0.281, 0.462, 0);
    shoulder.rotation.z = side * 0.13;
    piece(shoulder, jacket, 0, -0.116, 0, 0.16, 0.285, 0.173, taper);
    const elbow = joint(shoulder, 0, -0.245, 0);
    piece(elbow, jacket, 0, -0.095, 0, 0.129, 0.21, 0.14, taper);
    piece(elbow, trim, 0, -0.183, 0, 0.124, 0.057, 0.13, taper);
    piece(elbow, skin, 0, -0.246, 0.014, 0.107, 0.108, 0.113, taper);
    return { hip, knee, ankle, shoulder, elbow, side };
  });

  const shadow = new Mesh(new CircleGeometry(0.39, 16), new MeshBasicMaterial({
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
  return {
    root,
    pose(heading: number, distanceWalked: number, seconds: number, reducedMotion: boolean) {
      const dt = Math.min(seconds, 0.1);
      const speed = dt > 0 ? Math.min(1, distanceWalked / (tuning.walkSpeed * dt)) : 0;
      const turn = Math.atan2(Math.sin(heading - figure.rotation.y), Math.cos(heading - figure.rotation.y));
      figure.rotation.y = initialized && !reducedMotion
        ? figure.rotation.y + turn * (1 - Math.exp(-16 * dt)) : heading;
      initialized = true;
      stride = reducedMotion ? 0 : stride + (Math.sqrt(speed) - stride) * (1 - Math.exp(-13 * dt));
      if (stride < 0.002) stride = 0;
      breathing = (breathing + dt * 2.1) % (2 * Math.PI);
      phase = stride > 0 ? (phase + distanceWalked * 6.4) % (2 * Math.PI) : 0;

      figure.position.y = -0.026 * stride + Math.abs(Math.sin(phase)) * 0.023 * stride;
      torso.position.y = 0.83 + (reducedMotion ? 0 : Math.sin(breathing) * 0.012 * (1 - stride));
      torso.rotation.y = Math.sin(phase) * 0.115 * stride;
      torso.rotation.x = 0.11 * stride;
      for (const { hip, knee, ankle, shoulder, elbow, side } of limbs) {
        const swing = Math.sin(phase) * side;
        const lift = Math.max(0, Math.cos(phase) * side);
        hip.rotation.x = (swing * 0.5 - lift * 0.25) * stride;
        knee.rotation.x = lift * 0.78 * stride;
        ankle.rotation.x = -(hip.rotation.x + knee.rotation.x) * 0.6;
        shoulder.rotation.x = (-0.34 * swing - 0.06) * stride;
        elbow.rotation.x = -0.15 - (0.12 + Math.max(0, swing) * 0.44) * stride;
      }
    },
  };
}
