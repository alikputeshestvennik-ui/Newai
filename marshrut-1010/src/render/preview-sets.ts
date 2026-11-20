import {
  BoxGeometry, CylinderGeometry, Group, Mesh, MeshStandardMaterial, SphereGeometry,
  TorusGeometry, Vector3,
} from 'three';
import chapter from '../../data/turkey-preview.json';
import signs from '../../data/signs.json';
import { laneCenter, type PreviewTarget } from '../story/turkey-preview';
import { buildSignPlate } from './signs';

const oak = 0x976b4b;
const darkWood = 0x574642;
const yellow = 0xe1a048;
const blue = 0x234449;
const cream = 0xe6c785;

export function buildPreviewSets() {
  const boxShape = new BoxGeometry(1, 1, 1);
  const headShape = new SphereGeometry(0.19, 10, 8);
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

  function person(color: number) {
    const figure = new Group();
    const head = new Mesh(headShape, material(0xc18d68));
    head.position.y = 1.59;
    figure.add(head);
    block(figure, 0x46342e, 0, 1.74, -0.015, 0.31, 0.12, 0.31);
    block(figure, color, 0, 1.1, 0, 0.44, 0.64, 0.28);
    for (const side of [-1, 1]) {
      block(figure, blue, side * 0.12, 0.36, 0, 0.17, 0.72, 0.2);
      const arm = block(figure, color, side * 0.29, 1.07, 0.01, 0.13, 0.56, 0.15);
      arm.rotation.z = side * 0.15;
    }
    return figure;
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

  const courier = person(0x49726d);
  const leila = person(0xbb704c);
  drama.add(courier, leila);
  const envelope = block(courier, cream, 0.31, 0.95, 0.13, 0.23, 0.16, 0.025);
  envelope.rotation.z = 0.2;
  const watch = new Mesh(new CylinderGeometry(0.067, 0.067, 0.024, 16), material(0xc98a42));
  watch.rotation.x = Math.PI / 2;
  watch.position.set(0.27, 1.045, 0.15);
  courier.add(watch);
  const dial = new Group();
  dial.position.set(0.27, 1.045, 0.165);
  for (const angle of [-Math.PI / 3, Math.PI / 3]) {
    const hand = block(dial, blue, 0, 0, 0, 0.007, 0.046, 0.008);
    hand.rotation.z = angle;
    hand.position.x = -Math.sin(angle) * 0.021;
    hand.position.y = Math.cos(angle) * 0.021;
  }
  courier.add(dial);

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

  return { drama, running, courier, leila, props: [envelope, watch, dial], board, anchors };
}
