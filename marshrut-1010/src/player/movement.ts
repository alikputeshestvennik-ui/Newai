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

export function floorHeight(x: number, z: number) {
  let height = 0;
  for (const surface of walkSurfaces) {
    if (inside(surface, x, z)) height = Math.max(height, surface.y + surface.height / 2);
  }
  return height;
}

export function createWalker() {
  const x = 0;
  const z = 3.5;
  const heading = Math.PI + tuning.camera.walkYaw;
  return { x, y: floorHeight(x, z), z, heading, targetHeading: heading, sideways: 0, forward: 0 };
}

export function steerWalker(walker: ReturnType<typeof createWalker>, dx: number) {
  walker.targetHeading = (walker.targetHeading - dx * tuning.camera.lookRadiansPerPixel) % (2 * Math.PI);
}

export function updateWalker(
  walker: ReturnType<typeof createWalker>, walking: boolean, sideways: number, dt: number, reducedMotion: boolean,
) {
  const turn = walker.targetHeading - walker.heading;
  const angle = Math.atan2(Math.sin(turn), Math.cos(turn));
  walker.heading = Math.abs(angle) < 0.001 || reducedMotion
    ? walker.targetHeading : walker.heading + angle * -Math.expm1(-tuning.turnResponse * dt);

  const forward = walking && sideways === 0 ? 1 : 0;
  const lateral = walking ? sideways * tuning.strafeSpeed / tuning.walkSpeed : 0;
  const speed = Math.hypot(walker.forward, walker.sideways);
  const response = !walking ? tuning.stopResponse : speed === 0 ? tuning.startResponse : tuning.directionResponse;
  const weight = reducedMotion ? 1 : -Math.expm1(-response * dt);
  walker.forward += (forward - walker.forward) * weight;
  walker.sideways += (lateral - walker.sideways) * weight;
  if (Math.abs(walker.forward - forward) < 0.002) walker.forward = forward;
  if (Math.abs(walker.sideways - lateral) < 0.002) walker.sideways = lateral;
  return walk(walker, walker.sideways, walker.forward, dt);
}

export function walk(
  walker: ReturnType<typeof createWalker>,
  sideways: number, forward: number, seconds: number,
) {
  const strength = Math.hypot(sideways, forward);
  if (strength === 0 || seconds <= 0) return 0;

  const distance = tuning.walkSpeed * Math.min(seconds, 0.1) / Math.max(strength, 1);
  const subdivisions = Math.ceil(distance * Math.min(strength, 1) / (tuning.radius / 2));
  const sin = Math.sin(walker.heading);
  const cos = Math.cos(walker.heading);
  const dx = (forward * sin - sideways * cos) * distance / subdivisions;
  const dz = (forward * cos + sideways * sin) * distance / subdivisions;
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

  const moved = Math.hypot(walker.x - startX, walker.z - startZ);
  if (moved > 0) walker.y = floorHeight(walker.x, walker.z);
  return moved;
}
