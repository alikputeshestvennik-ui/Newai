import { CanvasTexture, DoubleSide, Group, Mesh, MeshBasicMaterial, PlaneGeometry, SRGBColorSpace } from 'three';
import signs from '../../data/signs.json';
import { awning } from '../harbor/layout';

export const signFace = { y: 3.12, z: awning.z + awning.depth / 2 + 0.025, width: 1.92, height: 0.88 };

function makeFace(shape: string) {
  const canvas = document.createElement('canvas');
  canvas.width = 384;
  canvas.height = 176;
  const ink = canvas.getContext('2d')!;
  ink.fillStyle = '#102e39';
  ink.fillRect(0, 0, 384, 176);
  ink.strokeStyle = '#f3d48c';
  ink.lineWidth = 4;
  ink.strokeRect(6, 6, 372, 164);
  ink.strokeStyle = '#fff6df';
  ink.fillStyle = '#fff6df';
  ink.lineWidth = 9;
  ink.lineCap = 'round';
  ink.lineJoin = 'round';

  function circle(x: number, radius: number, fill = false) {
    ink.beginPath();
    ink.arc(x, 63, radius, 0, Math.PI * 2);
    if (fill) ink.fill();
    else ink.stroke();
  }

  if (shape === 'linked') {
    circle(151, 29);
    circle(233, 29);
    ink.beginPath();
    ink.moveTo(180, 63);
    ink.lineTo(204, 63);
    ink.stroke();
  } else {
    circle(192, 34);
    if (shape === 'ring') circle(192, 13, true);
  }

  ink.beginPath();
  ink.moveTo(192, 114);
  ink.lineTo(192, 151);
  ink.moveTo(177, 137);
  ink.lineTo(192, 151);
  ink.lineTo(207, 137);
  ink.stroke();

  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  return texture;
}

export function buildSigns() {
  const group = new Group();
  const plate = new PlaneGeometry(signFace.width, signFace.height);
  for (const { id, x, shape } of signs) {
    const sign = new Mesh(plate, new MeshBasicMaterial({ map: makeFace(shape), side: DoubleSide }));
    sign.name = id;
    sign.position.set(x, signFace.y, signFace.z);
    group.add(sign);
  }
  return group;
}
