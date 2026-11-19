import {
  BoxGeometry, CylinderGeometry, Group, InstancedMesh, Mesh, MeshLambertMaterial, Matrix4, Vector3,
} from 'three';
import {
  awning, awningPosts, bollards, decks, lamps, pavilion, planters, quay, steps, type HarborBox,
} from '../harbor/layout';
import { buildSigns } from './signs';

const box = new BoxGeometry();
const post = new CylinderGeometry(0.5, 0.5, 1, 8);
const hull = new CylinderGeometry(0.5, 0.38, 1, 10);

const palette = {
  water: 0x437a70,
  ripple: 0x54877a,
  foam: 0x82a79a,
  stone: 0xc3ab84,
  wall: 0xf1dbb3,
  concrete: 0x9f8869,
  wood: 0xc48b5d,
  grain: 0xad754b,
  roof: 0x345b54,
  steel: 0x3e5148,
  glass: 0x487c79,
  ivory: 0xf2dfbf,
  rust: 0xba654a,
  brass: 0xf6c87e,
  cypress: 0x56785e,
  distance: 0xa49079,
};

type Surface = keyof typeof palette;
type Geometry = typeof box | typeof post;

const materials = Object.fromEntries(
  Object.entries(palette).map(([name, color]) => [name, new MeshLambertMaterial({ color })]),
) as Record<Surface, MeshLambertMaterial>;

function scenery(parent: Group) {
  const batches = new Map<Geometry, Map<Surface, Matrix4[]>>();

  return {
    piece(
      surface: Surface, x: number, y: number, z: number,
      width: number, height: number, depth: number, geometry: Geometry = box, yaw = 0,
    ) {
      if (!batches.has(geometry)) batches.set(geometry, new Map());
      const surfaces = batches.get(geometry)!;
      if (!surfaces.has(surface)) surfaces.set(surface, []);
      const matrix = new Matrix4().makeRotationY(yaw);
      matrix.scale(new Vector3(width, height, depth));
      matrix.setPosition(x, y, z);
      surfaces.get(surface)!.push(matrix);
    },
    mount() {
      for (const [geometry, surfaces] of batches) {
        for (const [surface, transforms] of surfaces) {
          const mesh = new InstancedMesh(geometry, materials[surface], transforms.length);
          transforms.forEach((matrix, index) => mesh.setMatrixAt(index, matrix));
          parent.add(mesh);
        }
      }
    },
  };
}

function ferry(x: number, z: number, small: boolean) {
  const group = new Group();
  group.position.set(x, 0, z);
  group.rotation.y = small ? -0.08 : 0.04;
  const deck = scenery(group);
  const { piece } = deck;

  const keel = new Mesh(hull, materials[small ? 'roof' : 'rust']);
  keel.scale.set(2.55, 0.66, 6.4);
  keel.position.y = 0.12;
  group.add(keel);
  piece('ivory', 0, 0.49, 0, 2.2, 0.15, 5.5);
  piece('ivory', 0, 0.92, -0.35, 1.7, 0.72, 3);
  piece('roof', 0, 1.32, -0.35, 1.94, 0.15, 3.18);
  piece('glass', 0, 1.01, 1.17, 1.28, 0.3, 0.04);
  for (const side of [-1, 1]) {
    for (const window of [-1.3, -0.62, 0.06, 0.74]) {
      piece('glass', side * 0.86, 1.01, window, 0.035, 0.31, 0.48);
    }
  }
  piece('rust', 0, 1.51, -0.96, 0.51, 0.46, 0.52, post);
  piece('steel', 0, 1.76, -0.96, 0.55, 0.08, 0.55, post);
  deck.mount();
  if (small) group.scale.setScalar(0.7);
  return group;
}

export function buildPier() {
  const pier = new Group();
  const harbor = scenery(pier);
  const { piece } = harbor;
  const place = (surface: Surface, { x, y, z, width, height, depth }: HarborBox, geometry: Geometry = box) => {
    piece(surface, x, y, z, width, height, depth, geometry);
  };

  piece('water', 0, -0.18, 0, 100, 0.35, 100);
  for (let i = 0; i < 72; i++) {
    const x = ((i * 23) % 79 - 39) * 0.58;
    const z = ((i * 31) % 61 - 8) * 0.59;
    piece(i % 6 ? 'ripple' : 'foam', x, 0.005, z, 0.55 + i % 4 * 0.43, 0.01, 0.046);
  }

  piece('concrete', 0, 0.34, -10, 49, 1.1, 14);
  place('stone', quay);
  piece('stone', 0, 0.78, -3, 49, 0.37, 0.38);

  for (let i = 0; i < 16; i++) {
    const x = i * 3.1 - 23;
    const height = 2.2 + (i * 5 % 7) * 0.31;
    piece(i % 2 ? 'stone' : 'distance', x, height / 2 + 1, -12.8, 2.85, height, 3);
    piece(i % 3 ? 'roof' : 'rust', x, height + 1.08, -12.8, 3.04, 0.16, 3.18);
    for (const offset of [-0.65, 0.65]) {
      piece('glass', x + offset, height * 0.68 + 1, -11.29, 0.58, 0.67, 0.04);
    }
  }
  for (const planter of planters) {
    place('concrete', planter);
    piece('cypress', planter.x, 2.6, planter.z, 0.56, 2.6, 0.56, post);
  }

  place('wall', pavilion);
  piece('roof', 0, 3.51, -6.65, 8.8, 0.3, 3.55);
  piece('ivory', 0, 3.33, -4.97, 8.65, 0.15, 0.22);
  place('rust', awning);
  for (const x of [-3.3, -2.1, -0.9, 0.3, 1.5, 2.7]) {
    piece('glass', x, 2.02, -5.038, 0.78, 1.56, 0.048);
  }
  for (const post of awningPosts) place('wall', post);

  for (const step of steps) place('concrete', step);
  for (const deck of decks) place('wood', deck);
  for (let step = 0; step <= 26; step++) {
    piece('grain', 0, 0.618, -2 + step * 0.333, 4.12, 0.012, 0.025);
  }
  for (const { x, y, z, height, width } of bollards) {
    piece('steel', x, y, z, 0.2, height, 0.2, post);
    piece('brass', x, 1.1, z, width, 0.09, width, post);
  }
  for (const lamp of lamps) {
    place('steel', lamp, post);
    piece('steel', lamp.x, 3.48, -3.35, 0.13, 0.13, 0.5);
    piece('brass', lamp.x, 3.38, -3.12, 0.34, 0.18, 0.29);
  }
  harbor.mount();

  const boats = [ferry(-3.72, 1, false), ferry(3.4, 3.67, true)];
  pier.add(buildSigns(), ...boats);
  return { pier, boats };
}
