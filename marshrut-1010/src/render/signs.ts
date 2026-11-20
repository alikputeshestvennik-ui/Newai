import { CanvasTexture, DoubleSide, Group, Mesh, MeshBasicMaterial, PlaneGeometry, SRGBColorSpace } from 'three';
import signs from '../../data/signs.json';
import { signFace } from '../harbor/layout';

export function drawSignSymbol(
  ink: CanvasRenderingContext2D, shape: string, x: number, y: number, scale: number, color: string,
) {
  ink.save();
  ink.translate(x, y);
  ink.scale(scale, scale);
  ink.strokeStyle = color;
  ink.fillStyle = color;
  ink.lineWidth = 9;

  function circle(x: number, radius: number, fill = false) {
    ink.beginPath();
    ink.arc(x, 0, radius, 0, Math.PI * 2);
    if (fill) ink.fill();
    else ink.stroke();
  }

  if (shape === 'linked') {
    circle(-41, 29);
    circle(41, 29);
    ink.beginPath();
    ink.moveTo(-12, 0);
    ink.lineTo(12, 0);
    ink.stroke();
  } else {
    circle(0, 34);
    if (shape === 'ring') circle(0, 13, true);
  }
  ink.restore();
}

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
  drawSignSymbol(ink, shape, 192, 63, 1, '#fff6df');

  ink.strokeStyle = '#fff6df';
  ink.lineWidth = 9;
  ink.lineCap = 'round';
  ink.lineJoin = 'round';
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

export function buildSignPlate(shape: string, width: number, height: number) {
  return new Mesh(new PlaneGeometry(width, height), new MeshBasicMaterial({ map: makeFace(shape), side: DoubleSide }));
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
