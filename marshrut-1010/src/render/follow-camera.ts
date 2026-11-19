import { Box3, PerspectiveCamera, Ray, Vector3 } from 'three';
import tuning from '../../data/player.json';
import { cameraWalls } from '../harbor/layout';
import { followCameraDistance, harborFieldOfView } from './framing';

const closeDistance = 2.25;
const sideViews = [-Math.PI / 4, Math.PI / 4, -Math.PI / 2, Math.PI / 2, Math.PI];

export function createFollowCamera() {
  const camera = new PerspectiveCamera(harborFieldOfView, 1, 0.08, 130);
  const target = new Vector3();
  const direction = new Vector3();
  const hit = new Vector3();
  const ray = new Ray();
  const walls = cameraWalls.map(({ x, y, z, width, height, depth }) => (
    new Box3().setFromCenterAndSize(new Vector3(x, y, z), new Vector3(width, height, depth))
  ));
  const settings = tuning.camera;
  let yaw = settings.walkYaw;
  let pitch = settings.walkPitch;
  let lookingAround = false;

  function clearDistance(angle: number, desiredDistance: number, bearing: number) {
    const horizontal = Math.cos(angle);
    direction.set(Math.sin(bearing) * horizontal, Math.sin(angle), Math.cos(bearing) * horizontal);
    ray.set(target, direction);
    let distance = desiredDistance;
    for (const wall of walls) {
      if (ray.intersectBox(wall, hit)) {
        distance = Math.min(distance, Math.max(0.1, hit.distanceTo(target) - 0.16));
      }
    }
    return distance;
  }

  return {
    camera,
    walkYaw: settings.walkYaw,
    resetLook() {
      yaw = settings.walkYaw;
      pitch = settings.walkPitch;
      lookingAround = false;
    },
    look(x: number, y: number, seconds: number) {
      if (seconds <= 0) return;
      const turn = settings.lookSpeed * Math.min(seconds, 0.1);
      yaw = (yaw - x * turn) % (2 * Math.PI);
      pitch = Math.min(settings.maxPitch, Math.max(settings.minPitch, pitch + y * turn));
      lookingAround = true;
    },
    resize(width: number, height: number) {
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
    },
    follow(x: number, y: number, z: number) {
      target.set(x, y + 1.25, z);
      let range = followCameraDistance(camera.aspect);
      let angle = pitch;
      let viewYaw = yaw;
      let distance = clearDistance(angle, range, viewYaw);
      if (lookingAround && distance < closeDistance) {
        // Lift the view by a wall before it gets too close to Mark.
        range = closeDistance;
        let low = pitch;
        let high = 1.55;
        if (clearDistance(high, range, yaw) >= range) {
          for (let step = 0; step < 6; step++) {
            const candidate = (low + high) / 2;
            if (clearDistance(candidate, range, yaw) < range) low = candidate;
            else high = candidate;
          }
          angle = high;
        } else {
          // Beneath the awning, look for a clear view along the quay.
          let best = distance;
          for (const offset of sideViews) {
            const candidate = clearDistance(settings.minPitch, range, yaw + offset);
            if (candidate > best) {
              best = candidate;
              viewYaw = yaw + offset;
              angle = settings.minPitch;
            }
            if (best >= range) break;
          }
        }
        distance = clearDistance(angle, range, viewYaw);
      }
      camera.position.copy(target).addScaledVector(direction, distance);
      camera.lookAt(target);
    },
  };
}
