import { describe, expect, it } from 'vitest';
import { Vector3 } from 'three';
import tuning from '../data/player.json';
import { createFollowCamera } from '../src/render/follow-camera';
import { followCameraDistance, harborFieldOfView } from '../src/render/framing';

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

  it('raises the camera to clear the wall beside the pavilion', () => {
    const follow = createFollowCamera();
    follow.look(Math.PI / 2 / tuning.camera.dragSensitivity, 0);
    follow.follow(4.46, 1.01, -6.65);
    expect(follow.camera.position.y).toBeGreaterThan(3.66);
  });

  it('finds a clear view under the awning when the pavilion is directly behind the camera', () => {
    const follow = createFollowCamera();
    follow.look(Math.PI / tuning.camera.dragSensitivity, 0);
    follow.follow(0, 1.01, -4.72);
    expect(follow.camera.position.distanceTo(new Vector3(0, 2.26, -4.72))).toBeGreaterThan(2);
  });
});
