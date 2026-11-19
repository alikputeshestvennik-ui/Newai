import { describe, expect, it } from 'vitest';
import { Vector3 } from 'three';
import tuning from '../data/player.json';
import { createWalker } from '../src/player/movement';
import { createFollowCamera } from '../src/render/follow-camera';
import { followCameraDistance, harborFieldOfView } from '../src/render/framing';

function turnTo(follow: ReturnType<typeof createFollowCamera>, yaw: number) {
  const change = follow.walkYaw - yaw;
  const stepCount = Math.ceil(Math.abs(change) / (tuning.camera.lookSpeed * 0.1));
  for (let step = 0; step < stepCount; step++) {
    follow.look(Math.sign(change), 0, Math.abs(change) / (stepCount * tuning.camera.lookSpeed));
  }
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
    follow.follow(x, y, z);
    const initialHeight = follow.camera.getWorldDirection(direction).y;

    follow.look(0, -1, 0.1);
    follow.follow(x, y, z);
    expect(follow.camera.getWorldDirection(direction).y).toBeGreaterThan(initialHeight);

    follow.resetLook();
    follow.look(0, 1, 0.1);
    follow.follow(x, y, z);
    expect(follow.camera.getWorldDirection(direction).y).toBeLessThan(initialHeight);
  });

  it('raises the camera to clear the wall beside the pavilion', () => {
    const follow = createFollowCamera();
    turnTo(follow, -Math.PI / 2);
    follow.follow(4.46, 1.01, -6.65);
    expect(follow.camera.position.y).toBeGreaterThan(3.66);
  });

  it('finds a clear view under the awning when the pavilion is directly behind the camera', () => {
    const follow = createFollowCamera();
    turnTo(follow, -Math.PI);
    follow.follow(0, 1.01, -4.72);
    expect(follow.camera.position.distanceTo(new Vector3(0, 2.26, -4.72))).toBeGreaterThan(2);
  });
});
