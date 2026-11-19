import { describe, expect, it } from 'vitest';
import { Vector3 } from 'three';
import tuning from '../data/player.json';
import signs from '../data/signs.json';
import { createWalker } from '../src/player/movement';
import { createFollowCamera } from '../src/render/follow-camera';
import { followCameraDistance, harborFieldOfView } from '../src/render/framing';
import { signFace } from '../src/render/signs';

const targetHeight = 1.25;

function turnTo(follow: ReturnType<typeof createFollowCamera>, yaw: number) {
  follow.look((tuning.camera.walkYaw - yaw) / tuning.camera.lookRadiansPerPixel, 0);
}

function bearing(follow: ReturnType<typeof createFollowCamera>, x: number, z: number) {
  return Math.atan2(follow.camera.position.x - x, follow.camera.position.z - z);
}

describe('pier camera framing', () => {
  it.each([[360, 800], [800, 360], [768, 768], [320, 960]])(
    'keeps space around Mark and matches the display at %d × %d',
    (width, height) => {
      const follow = createFollowCamera();
      follow.resize(width, height);
      expect(follow.camera.aspect).toBeCloseTo(width / height);
      const halfWidth = followCameraDistance(follow.camera.aspect)
        * Math.tan(harborFieldOfView * Math.PI / 360) * follow.camera.aspect;
      expect(halfWidth).toBeGreaterThan(1);
    },
  );

  it('looks up when the right stick is raised and down when it is lowered', () => {
    const follow = createFollowCamera();
    const { x, y, z } = createWalker();
    const direction = new Vector3();
    follow.follow(x, y, z, 0.016);
    const initialHeight = follow.camera.getWorldDirection(direction).y;

    follow.look(0, -25);
    follow.follow(x, y, z, 0.016);
    expect(follow.camera.getWorldDirection(direction).y).toBeGreaterThan(initialHeight);

    follow.look(0, 50);
    follow.follow(x, y, z, 0.016);
    expect(follow.camera.getWorldDirection(direction).y).toBeLessThan(initialHeight);
  });

  it.each([[360, 800], [844, 390]])('frames the three sign symbols at %d × %d', (width, height) => {
    const follow = createFollowCamera();
    follow.resize(width, height);
    const mark = createWalker();
    follow.follow(mark.x, mark.y, mark.z, 0.016);
    follow.camera.updateMatrixWorld();
    expect(signs.map(({ shape }) => shape)).toEqual(['circle', 'linked', 'ring']);
    for (const { x } of signs) {
      for (const offset of [-0.35, 0.35]) {
        const corner = new Vector3(x + offset, signFace.y + 0.32, signFace.z).project(follow.camera);
        expect(Math.abs(corner.x)).toBeLessThan(1);
        expect(Math.abs(corner.y)).toBeLessThan(1);
      }
    }
  });

  it('returns behind Mark gradually by the shortest arc when he starts walking', () => {
    const follow = createFollowCamera();
    const x = 0;
    const z = 2;
    const y = 0.615;
    turnTo(follow, Math.PI - 0.5);
    follow.look(0, -20);
    follow.follow(x, y, z, 0.016);
    const startYaw = bearing(follow, x, z);
    const startHeight = follow.camera.position.y;
    const heading = 0.5;
    follow.alignBehind(heading);
    follow.follow(x, y, z, 0.016);
    expect(bearing(follow, x, z)).toBeGreaterThan(startYaw);
    expect(bearing(follow, x, z)).toBeLessThan(Math.PI);
    expect(follow.camera.position.y).toBeGreaterThan(startHeight);
    expect(follow.camera.position.y).toBeLessThan(y + targetHeight + followCameraDistance(1)
      * Math.sin(tuning.camera.walkPitch));

    for (let frame = 0; frame < 90; frame++) follow.follow(x, y, z, 0.016);
    expect(bearing(follow, x, z)).toBeCloseTo(heading - Math.PI);
    expect(follow.camera.position.y).toBeCloseTo(y + targetHeight + followCameraDistance(1)
      * Math.sin(tuning.camera.walkPitch));
  });

  it('lowers the camera smoothly after leaving the pavilion', () => {
    const follow = createFollowCamera();
    turnTo(follow, -1.7);
    follow.follow(5.4, 1.01, -6.65, 0.016);
    const raised = follow.camera.position.y;
    const normal = 1.01 + targetHeight + followCameraDistance(1) * Math.sin(tuning.camera.walkPitch);
    follow.follow(5.4, 1.01, -2, 0.016);
    expect(follow.camera.position.y).toBeLessThan(raised);
    expect(follow.camera.position.y).toBeGreaterThan(normal);
    for (let frame = 0; frame < 75; frame++) follow.follow(5.4, 1.01, -2, 0.016);
    expect(follow.camera.position.y).toBeCloseTo(normal);
  });

  it('clears the pavilion in the walking view without turning sideways', () => {
    const follow = createFollowCamera();
    const yaw = -1.7;
    follow.alignBehind(yaw + Math.PI);
    follow.follow(5.4, 1.01, -6.65, 0.016);
    const offset = follow.camera.position.clone().sub(new Vector3(5.4, 2.26, -6.65));
    expect(offset.length()).toBeCloseTo(followCameraDistance(1));
    expect(Math.atan2(offset.x, offset.z)).toBeCloseTo(yaw);
    expect(follow.camera.position.y).toBeGreaterThan(3.66);
  });

  it('raises the camera to clear the wall beside the pavilion', () => {
    const follow = createFollowCamera();
    turnTo(follow, -Math.PI / 2);
    follow.follow(4.46, 1.01, -6.65, 0.016);
    expect(follow.camera.position.y).toBeGreaterThan(3.66);
  });

  it('finds a clear view under the awning when the pavilion is directly behind the camera', () => {
    const follow = createFollowCamera();
    turnTo(follow, -Math.PI);
    follow.follow(0, 1.01, -4.72, 0.016);
    expect(follow.camera.position.distanceTo(new Vector3(0, 2.26, -4.72))).toBeGreaterThan(2);
  });
});
