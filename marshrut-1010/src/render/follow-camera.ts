import { Box3, PerspectiveCamera, Ray, Vector3 } from 'three';
import tuning from '../../data/player.json';
import { cameraWalls } from '../harbor/layout';
import { followCameraDistance, harborFieldOfView } from './framing';

const turn = 2 * Math.PI;
const closeDistance = 2.25;
const maxLift = 1.556;
const tolerance = 0.001;
const sideViews = [-Math.PI / 4, Math.PI / 4, -Math.PI / 2, Math.PI / 2, Math.PI];

export function createFollowCamera() {
  const camera = new PerspectiveCamera(harborFieldOfView, 1, 0.08, 130);
  const target = new Vector3();
  const direction = new Vector3();
  const hit = new Vector3();
  const ray = new Ray();
  const walls = cameraWalls.map(({ x, y, z, width, height, depth }) => (
    new Box3().setFromCenterAndSize(new Vector3(x, y, z), new Vector3(width, height, depth))
      .expandByScalar(0.015)
  ));
  const settings = tuning.camera;
  let yaw = settings.walkYaw;
  let pitch = settings.walkPitch;
  let targetYaw = yaw;
  let targetPitch = pitch;
  let lift = 0;
  let cameraDistance = 0;
  let lookingAround = false;
  let initialized = false;

  function clearDistance(angle: number, range: number, bearing: number) {
    const horizontal = Math.cos(angle);
    direction.set(Math.sin(bearing) * horizontal, Math.sin(angle), Math.cos(bearing) * horizontal);
    ray.set(target, direction);
    let distance = range;
    for (const wall of walls) {
      if (ray.intersectBox(wall, hit)) {
        distance = Math.min(distance, Math.max(camera.near + 0.02, hit.distanceTo(target) - 0.08));
      }
    }
    return distance;
  }

  function clearPitch(range: number) {
    let bestPitch = pitch;
    let bestDistance = clearDistance(pitch, range, yaw);
    if (bestDistance >= range) return pitch;

    // An awning can block steep angles too. Sample the arc before refining the first clear angle.
    const samples = 12;
    for (let step = 1; step <= samples; step++) {
      const candidate = pitch + (maxLift - pitch) * step / samples;
      const distance = clearDistance(candidate, range, yaw);
      if (distance >= range) {
        let low = pitch + (maxLift - pitch) * (step - 1) / samples;
        let high = candidate;
        for (let refinement = 0; refinement < 8; refinement++) {
          const mid = (low + high) / 2;
          if (clearDistance(mid, range, yaw) >= range) high = mid;
          else low = mid;
        }
        return high;
      }
      if (distance > bestDistance + 0.03) {
        bestDistance = distance;
        bestPitch = candidate;
      }
    }
    return bestPitch;
  }

  return {
    camera,
    alignBehind(heading: number) {
      targetYaw = (heading + Math.PI) % turn;
      targetPitch = settings.walkPitch;
      lookingAround = false;
    },
    look(dx: number, dy: number) {
      if (!dx && !dy) return;
      // Take over from the visible angle if a swipe begins during the return to walking view.
      yaw = targetYaw = (yaw - dx * settings.lookRadiansPerPixel) % turn;
      pitch = targetPitch = Math.min(settings.maxPitch, Math.max(
        settings.minPitch, pitch + dy * settings.lookRadiansPerPixel,
      ));
      lookingAround = true;
    },
    resize(width: number, height: number) {
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
    },
    follow(x: number, y: number, z: number, seconds: number) {
      const dt = Math.min(seconds, 0.1);
      const turnWeight = initialized ? 1 - Math.exp(-8 * dt) : 1;
      const liftWeight = initialized ? 1 - Math.exp(-12 * dt) : 1;
      const yawDelta = Math.atan2(Math.sin(targetYaw - yaw), Math.cos(targetYaw - yaw));
      yaw = (yaw + yawDelta * (Math.abs(yawDelta) < tolerance ? 1 : turnWeight)) % turn;
      pitch = approach(pitch, targetPitch, turnWeight);

      target.set(x, y + 1.25, z);
      const range = followCameraDistance(camera.aspect);
      let viewYaw = yaw;
      let viewPitch = clearPitch(range);
      let viewDistance = clearDistance(viewPitch, range, yaw);
      if (lookingAround && viewDistance < closeDistance) {
        // Allow a view along the quay when Mark is standing beneath the awning.
        for (const offset of sideViews) {
          const candidate = clearDistance(settings.minPitch, closeDistance, yaw + offset);
          if (candidate > viewDistance) {
            viewDistance = candidate;
            viewYaw = yaw + offset;
            viewPitch = settings.minPitch;
          }
          if (viewDistance >= closeDistance) break;
        }
      }

      lift = approach(lift, viewPitch - pitch, liftWeight);
      const freeDistance = clearDistance(pitch + lift, viewDistance, viewYaw);
      cameraDistance = Math.min(freeDistance, approach(cameraDistance, viewDistance, liftWeight));
      ray.at(cameraDistance, camera.position);
      camera.lookAt(target);
      initialized = true;
      return Math.abs(Math.sin((targetYaw - yaw) / 2)) > tolerance / 4
        || Math.abs(targetPitch - pitch) > tolerance / 2
        || Math.abs(viewPitch - pitch - lift) > tolerance / 2
        || Math.abs(viewDistance - cameraDistance) > tolerance / 2;
    },
  };

  function approach(value: number, goal: number, weight: number) {
    return Math.abs(goal - value) < tolerance ? goal : value + (goal - value) * weight;
  }
}
