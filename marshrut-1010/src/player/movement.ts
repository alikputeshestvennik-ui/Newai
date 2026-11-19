import tuning from '../../data/player.json';
import { walkingObstacles, walkSurfaces, type HarborBox } from '../harbor/layout';

function inside(box: HarborBox, x: number, z: number, margin = 0) {
  return Math.abs(x - box.x) <= box.width / 2 + margin
    && Math.abs(z - box.z) <= box.depth / 2 + margin;
}

function supported(x: number, z: number) {
  return walkSurfaces.some((surface) => inside(surface, x, z));
}

export function canWalk(x: number, z: number) {
  const r = tuning.radius;
  return supported(x - r, z - r) && supported(x + r, z - r)
    && supported(x - r, z + r) && supported(x + r, z + r)
    && !walkingObstacles.some((box) => inside(box, x, z, r));
}

function floorHeight(x: number, z: number) {
  let height = 0;
  for (const surface of walkSurfaces) {
    if (inside(surface, x, z)) height = Math.max(height, surface.y + surface.height / 2);
  }
  return height;
}

export function createWalker() {
  const x = 0;
  const z = 3.5;
  return { x, y: floorHeight(x, z), z, heading: Math.PI + tuning.camera.walkYaw };
}

export function walk(
  walker: ReturnType<typeof createWalker>,
  sideways: number, forward: number, cameraYaw: number, seconds: number,
) {
  const strength = Math.hypot(sideways, forward);
  if (strength === 0 || seconds <= 0) return 0;

  const distance = tuning.walkSpeed * Math.min(seconds, 0.1) / Math.max(strength, 1);
  const subdivisions = Math.ceil(distance * Math.min(strength, 1) / (tuning.radius / 2));
  const sin = Math.sin(cameraYaw);
  const cos = Math.cos(cameraYaw);
  const dx = (sideways * cos - forward * sin) * distance / subdivisions;
  const dz = (-sideways * sin - forward * cos) * distance / subdivisions;
  const { x: startX, z: startZ } = walker;

  for (let step = 0; step < subdivisions; step++) {
    if (canWalk(walker.x + dx, walker.z + dz)) {
      walker.x += dx;
      walker.z += dz;
    } else {
      if (canWalk(walker.x + dx, walker.z)) walker.x += dx;
      if (canWalk(walker.x, walker.z + dz)) walker.z += dz;
    }
  }

  const movedX = walker.x - startX;
  const movedZ = walker.z - startZ;
  const moved = Math.hypot(movedX, movedZ);
  if (moved > 0) {
    walker.heading = Math.atan2(movedX, movedZ);
    walker.y = floorHeight(walker.x, walker.z);
  }
  return moved;
}
