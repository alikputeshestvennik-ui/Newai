import { BoxGeometry, CircleGeometry, Group, Mesh, MeshBasicMaterial, MeshLambertMaterial } from 'three';

const box = new BoxGeometry();

export function buildMark() {
  const root = new Group();
  const figure = new Group();
  root.add(figure);

  const jacket = new MeshLambertMaterial({ color: 0xca5b3c });
  const trousers = new MeshLambertMaterial({ color: 0x263842 });
  const boots = new MeshLambertMaterial({ color: 0x312b27 });
  const skin = new MeshLambertMaterial({ color: 0xc98a60 });
  const hair = new MeshLambertMaterial({ color: 0x46352b });
  const bag = new MeshLambertMaterial({ color: 0xd7b985 });

  function piece(
    parent: Group, material: MeshLambertMaterial, x: number, y: number, z: number,
    width: number, height: number, depth: number,
  ) {
    const mesh = new Mesh(box, material);
    mesh.position.set(x, y, z);
    mesh.scale.set(width, height, depth);
    parent.add(mesh);
  }

  piece(figure, jacket, 0, 1.055, 0, 0.53, 0.61, 0.31);
  piece(figure, skin, 0, 1.55, 0.02, 0.31, 0.38, 0.30);
  piece(figure, hair, 0, 1.73, 0.005, 0.33, 0.12, 0.33);
  piece(figure, hair, 0, 1.6, -0.13, 0.32, 0.19, 0.07);
  piece(figure, bag, 0, 1.05, -0.21, 0.33, 0.4, 0.15);

  const limbs = [-1, 1].map((side) => {
    const leg = new Group();
    leg.position.set(side * 0.135, 0.77, 0);
    piece(leg, trousers, 0, -0.3, 0, 0.23, 0.6, 0.24);
    piece(leg, boots, 0, -0.665, 0.045, 0.245, 0.19, 0.35);
    const arm = new Group();
    arm.position.set(side * 0.34, 1.31, 0);
    piece(arm, jacket, 0, -0.24, 0, 0.158, 0.5, 0.175);
    piece(arm, skin, 0, -0.52, 0, 0.14, 0.15, 0.14);
    figure.add(leg, arm);
    return { arm, leg };
  });

  const shadow = new Mesh(new CircleGeometry(0.39, 16), new MeshBasicMaterial({
    color: 0x241b15, transparent: true, opacity: 0.25, depthWrite: false,
  }));
  shadow.rotation.x = -Math.PI / 2;
  shadow.scale.y = 0.74;
  shadow.position.y = 0.014;
  root.add(shadow);

  let phase = 0;
  return {
    root,
    pose(heading: number, distanceWalked: number, reducedMotion: boolean) {
      phase = distanceWalked ? (phase + distanceWalked * 6.8) % (2 * Math.PI) : 0;
      const stride = reducedMotion ? 0 : Math.sin(phase) * 0.55;
      figure.rotation.y = heading;
      figure.position.y = Math.abs(stride) * 0.09;
      limbs[0].leg.rotation.x = limbs[1].arm.rotation.x = stride;
      limbs[1].leg.rotation.x = limbs[0].arm.rotation.x = -stride;
    },
  };
}
