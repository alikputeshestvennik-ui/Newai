import { CanvasTexture, Mesh, MeshBasicMaterial, PlaneGeometry, SRGBColorSpace } from 'three';
import { ticketStand } from '../harbor/layout';
import { matchingSign } from '../harbor/ticket';
import { drawSignSymbol } from './signs';

export function paintTicket(canvas: HTMLCanvasElement) {
  canvas.width = 320;
  canvas.height = 144;
  const ink = canvas.getContext('2d')!;
  ink.fillStyle = '#efd9ab';
  ink.fillRect(0, 0, canvas.width, canvas.height);
  ink.strokeStyle = '#25544b';
  ink.lineWidth = 2;
  ink.strokeRect(7, 7, canvas.width - 14, canvas.height - 14);
  drawSignSymbol(ink, matchingSign.shape, 160, 72, 1.35, '#174a40');
}

export function buildTicket() {
  const paper = document.createElement('canvas');
  paintTicket(paper);
  const texture = new CanvasTexture(paper);
  texture.colorSpace = SRGBColorSpace;
  const ticket = new Mesh(new PlaneGeometry(0.43, 0.194), new MeshBasicMaterial({ map: texture }));
  ticket.position.set(ticketStand.x, ticketStand.y + ticketStand.height / 2 + 0.002, ticketStand.z);
  ticket.rotation.x = -Math.PI / 2;
  ticket.rotation.z = -0.12;
  return ticket;
}
