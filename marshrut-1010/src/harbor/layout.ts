import { pickup } from '../../data/harbor-ticket.json';

export const quay = { x: 0, y: 0.93, z: -10, width: 49, height: 0.16, depth: 14 };
export const pavilion = { x: 0, y: 2.18, z: -6.65, width: 8.4, height: 2.36, depth: 3.2 };
export const awning = { x: 0, y: 2.96, z: -4.52, width: 7.7, height: 0.13, depth: 0.86 };
export const signFace = { y: 3.25, z: awning.z + awning.depth / 2 + 0.025, width: 1.92, height: 0.88 };
export const ticketStand = { x: pickup.x, y: 1, z: pickup.z, width: 0.62, height: 0.77, depth: 0.46 };
export const awningPosts = [-3.75, -1.25, 1.25, 3.75].map((x) => (
  { x, y: 1.98, z: -4.15, width: 0.13, height: 1.96, depth: 0.13 }
));
export const steps = [
  { x: 0, y: 0.75, z: -2.8, width: 3.15, height: 0.4, depth: 0.5 },
  { x: 0, y: 0.61, z: -2.35, width: 3.15, height: 0.3, depth: 0.5 },
];
export const decks = [
  { x: 0, y: 0.49, z: 2.38, width: 4.2, height: 0.25, depth: 9 },
  { x: 1.15, y: 0.49, z: 6.02, width: 6.5, height: 0.25, depth: 1.72 },
];

export const planters = [-8.8, -6.8, 6.8, 8.8].map((x) => (
  { x, y: 1.23, z: -7.4, width: 0.7, height: 0.45, depth: 0.7 }
));
export const lamps = [-3.85, 3.85].map((x) => (
  { x, y: 2.22, z: -3.58, width: 0.13, height: 2.6, depth: 0.13 }
));
export const bollards = [-1, 1].flatMap((side) => (
  [-1.82, 0.48, 2.78, 5.14, 6.54].map((z) => (
    { x: side * 1.97, y: 0.57, z, width: 0.24, height: 1.03, depth: 0.24 }
  ))
));

// The back edge meets the facades behind the pavilion.
const openQuay = { ...quay, z: -7.15, depth: 8.3 };
export const walkSurfaces = [openQuay, ...steps, ...decks];
export const walkingObstacles = [pavilion, ...awningPosts, ...planters, ...lamps, ...bollards, ticketStand];

export const cameraWalls = [
  pavilion,
  awning,
  { x: 0, y: 3.51, z: -6.65, width: 8.8, height: 0.3, depth: 3.55 },
  { x: 0, y: 3, z: -12.8, width: 49, height: 4, depth: 3.18 },
];

export type HarborBox = typeof quay;
