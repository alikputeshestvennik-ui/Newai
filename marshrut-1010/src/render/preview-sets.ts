import {
  BoxGeometry, CylinderGeometry, Group, Mesh, MeshStandardMaterial,
  TorusGeometry, Vector3,
} from 'three';
import chapter from '../../data/turkey-preview.json';
import signs from '../../data/signs.json';
import { laneCenter, type PreviewTarget } from '../story/turkey-preview';
import { buildSignPlate } from './signs';
import type { PreviewCast } from './preview-cast';

const oak = 0x976b4b;
const darkWood = 0x574642;
const yellow = 0xe1a048;
const blue = 0x234449;
const cream = 0xe6c785;

export function buildPreviewSets({ courier }: PreviewCast) {
  const boxShape = new BoxGeometry(1, 1, 1);
  const hullShape = new CylinderGeometry(1, 0.65, 1, 8);
  const ringShape = new TorusGeometry(0.37, 0.085, 8, 20);
  const materials = new Map<number, MeshStandardMaterial>();

  function material(color: number) {
    let result = materials.get(color);
    if (!result) {
      result = new MeshStandardMaterial({ color, flatShading: true, roughness: 0.88 });
      materials.set(color, result);
    }
    return result;
  }

  function block(group: Group, color: number, x: number, y: number, z: number, w: number, h: number, d: number) {
    const mesh = new Mesh(boxShape, material(color));
    mesh.position.set(x, y, z);
    mesh.scale.set(w, h, d);
    group.add(mesh);
    return mesh;
  }

  function distantShore(group: Group, z: number) {
    block(group, 0x72918b, 0, 0.15, z - 1, 80, 0.6, 5);
    for (let i = -3; i <= 3; i++) {
      const height = 1.8 + (Math.abs(i) % 3) * 1.1;
      block(group, i % 2 ? 0x87aaa2 : 0x8da5ac, i * 10, height / 2, z, 7, height, 3);
    }
  }

  function water(group: Group, length: number) {
    block(group, 0x347b7d, 0, -0.55, -15, 136, 0.06, length);
    const foam = 0x81ad9e;
    for (let i = 0; i < 9; i++) {
      const side = i % 2 ? -1 : 1;
      block(group, foam, side * (4.6 + i % 3 * 2.4), -0.51, -i * 4.2, 1.6, 0.02, 0.045);
    }
  }

  const drama = new Group();
  water(drama, 125);
  distantShore(drama, -21);
  block(drama, oak, 0, -0.14, -1.2, 11.8, 0.28, 11.8);
  block(drama, darkWood, 0, -0.16, -7.2, 11.95, 0.38, 0.16);
  block(drama, blue, 0, 2.81, -5.13, 10.8, 0.21, 3.3);
  block(drama, blue, 0, 0.14, -3.92, 10.7, 0.28, 0.15);

  for (const x of [-5.25, -2.6, 0, 2.6, 5.25]) {
    block(drama, blue, x, 1.42, -3.92, 0.13, 2.75, 0.16);
  }
  const glass = new Mesh(boxShape, new MeshStandardMaterial({
    color: 0xaddbd8, transparent: true, opacity: 0.19, depthWrite: false,
  }));
  glass.position.set(0, 1.52, -3.94);
  glass.scale.set(10.42, 2.43, 0.035);
  drama.add(glass);

  const envelope = block(courier.hand, cream, 0.015, -0.034, 0.033, 0.23, 0.16, 0.025);
  envelope.rotation.z = -0.28;
  const watch = new Mesh(new CylinderGeometry(0.067, 0.067, 0.024, 16), material(0xc98a42));
  watch.rotation.x = Math.PI / 2;
  watch.position.set(-0.007, 0.016, 0.053);
  courier.hand.add(watch);
  const dial = new Group();
  dial.position.copy(watch.position);
  dial.position.z += 0.016;
  for (const angle of [-Math.PI / 3, Math.PI / 3]) {
    const hand = block(dial, blue, 0, 0, 0, 0.007, 0.046, 0.008);
    hand.rotation.z = angle;
    hand.position.x = -Math.sin(angle) * 0.021;
    hand.position.y = Math.cos(angle) * 0.021;
  }
  courier.hand.add(dial);

  const ring = new Mesh(ringShape, material(0xc95437));
  ring.position.set(-2.3, 1.39, -2.34);
  drama.add(ring);
  block(drama, darkWood, -2.3, 0.94, -2.44, 0.13, 1.88, 0.15);

  const board = new Group();
  board.position.set(0.15, 1.12, -2.39);
  block(drama, darkWood, 0.15, 0.63, -2.48, 0.16, 1.26, 0.19);
  block(board, cream, 0, 0.47, 0, 1.42, 0.84, 0.09);
  const plate = buildSignPlate('linked', 1.27, 0.63);
  plate.position.set(0, 0.49, 0.052);
  board.add(plate);
  drama.add(board);

  block(drama, blue, 2.65, 1.06, -2.44, 0.13, 2.12, 0.14);
  block(drama, cream, 2.65, 2.14, -2.44, 0.37, 0.29, 0.37);
  block(drama, blue, 2.65, 2.33, -2.44, 0.48, 0.09, 0.44);
  const anchors: Record<PreviewTarget, Vector3> = {
    ring: new Vector3(-2.3, 1.96, -2.34),
    board: new Vector3(0.15, 2.22, -2.39),
    lamp: new Vector3(2.65, 2.58, -2.44),
  };

  const running = new Group();
  water(running, 145);
  distantShore(running, -53);
  block(running, oak, 0, -0.115, 1, 5.1, 0.23, 14);
  block(running, oak, 0, -0.115, -15, 5.1, 0.23, 5);
  block(running, oak, 0, -0.115, -29.75, 6.15, 0.23, 17.5);

  for (const z of [-9.25, -19.25]) {
    const hull = new Mesh(hullShape, material(z > -10 ? 0x466962 : 0xbb6745));
    hull.position.set(0, -0.42, z);
    hull.scale.set(2.95, 0.7, 4.1);
    running.add(hull);
    block(running, oak, 0, -0.105, z, 5.1, 0.21, 6.7);
  }
  for (let z = 4; z >= -36; z -= 2) {
    for (const side of [-1, 1]) {
      if (z % 4 === 0) block(running, darkWood, side * 2.48, 0.22, z, 0.16, 0.44, 0.16);
      block(running, yellow, side * 0.775, 0.011, z, 0.03, 0.022, 0.73);
    }
  }
  for (const gate of chapter.runner.gates) {
    for (const lane of gate.blocked ?? []) {
      const x = laneCenter(lane);
      block(running, darkWood, x, 0.48, -gate.at, 1.34, 0.96, 0.7);
      const stripe = block(running, yellow, x, 0.48, -gate.at + 0.355, 1.14, 0.14, 0.03);
      stripe.rotation.z = -0.32;
    }
    gate.signs?.forEach((id, lane) => {
      const x = laneCenter(lane);
      const sign = signs.find((item) => item.id === id)!;
      const face = buildSignPlate(sign.shape, 1.36, 0.68);
      face.position.set(x, 2.53, -gate.at + 0.19);
      running.add(face);
      block(running, blue, x - 0.75, 1.22, -gate.at, 0.11, 2.44, 0.27);
      if (lane === 2) block(running, blue, x + 0.75, 1.22, -gate.at, 0.11, 2.44, 0.27);
    });
  }

  const detour = new Group();
  water(detour, 110);
  distantShore(detour, -26);
  block(detour, oak, 0, -0.14, 1.9, 7.5, 0.28, 6.1);
  block(detour, oak, -2.25, -0.14, -2.4, 2.2, 0.28, 2.5);
  block(detour, oak, 1.34, -0.14, -4.08, 2.9, 0.28, 5.9);
  block(detour, oak, 1.34, -0.14, -8.65, 6.2, 0.28, 3.35);
  block(detour, darkWood, 1.34, -0.23, -7.0, 6.25, 0.38, 0.19);

  function rail(x: number, near: number, far: number, color: number, posts: number) {
    block(detour, color, x, 0.85, (near + far) / 2, 0.13, 0.12, near - far + 0.13);
    for (let i = 0; i < posts; i++) {
      const z = near + (far - near) * i / (posts - 1);
      block(detour, color, x, 0.43, z, 0.12, 0.86, 0.13);
    }
  }

  for (const x of [-0.02, 2.7]) rail(x, -0.8, -6.8, 0x285aa1, 4);
  for (const x of [-3.26, -1.26]) rail(x, -0.8, -3.45, 0xa84036, 2);
  block(detour, 0xa84036, -2.26, 0.59, -3.47, 2.04, 0.16, 0.12);

  for (const z of [-1.5, -2.5, -3.5, -4.5, -5.5, -6.5]) {
    block(detour, darkWood, 1.34, 0.002, z, 2.9, 0.006, 0.024);
  }
  for (const x of [-1.6, 4.28]) {
    block(detour, blue, x, 1.3, -8.4, 0.16, 2.6, 0.17);
  }
  block(detour, blue, 1.34, 2.64, -8.4, 6.15, 0.16, 0.34);
  const exit = buildSignPlate('linked', 1.1, 0.54);
  exit.position.set(1.34, 2.41, -8.21);
  detour.add(exit);

  return { drama, running, detour, props: [envelope, watch, dial], board, anchors };
}
