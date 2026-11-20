import { Quaternion, Vector3, type Bone, type Group } from 'three';
import tuning from '../../data/player.json';
import { floorHeight } from '../player/movement';

const settings = tuning.gait;
const turn = 2 * Math.PI;
const up = new Vector3(0, 1, 0);
const across = new Vector3(1, 0, 0);
const angleDelta = (angle: number) => Math.atan2(Math.sin(angle), Math.cos(angle));

function createFoot(hip: Bone, knee: Bone, ankle: Bone, side: number) {
  const hipPosition = hip.position.clone().add(hip.parent!.position);
  const upper = knee.position.clone();
  const lower = ankle.position.clone();
  const thighLength = upper.length();
  const shinLength = lower.length();
  const ankleHeight = hipPosition.y + upper.y + lower.y;
  const neutralZ = hipPosition.z + upper.z + lower.z;
  upper.normalize();
  lower.normalize();
  const direction = new Vector3();
  const bend = new Vector3();
  const thigh = new Vector3();
  const shin = new Vector3();
  const rotation = new Quaternion();
  return {
    side, ankleHeight, neutralZ, hipPosition,
    position: new Vector3(),
    yaw: 0,
    pitch: 0,
    maxDrop(x: number, z: number) {
      const horizontal = Math.hypot(x - hipPosition.x, z - hipPosition.z);
      return Math.sqrt(Math.max(0, (thighLength + shinLength - 0.004) ** 2 - horizontal ** 2));
    },
    solve(x: number, y: number, z: number, yaw: number, pitch: number) {
      direction.set(x, y, z).sub(hipPosition);
      const length = Math.max(0.08, direction.length());
      direction.normalize();
      const reach = Math.min(length, thighLength + shinLength - 0.002);
      const along = (thighLength ** 2 - shinLength ** 2 + reach ** 2) / (2 * reach);
      const away = Math.sqrt(Math.max(0, thighLength ** 2 - along ** 2));
      // Keep the knee bending towards the toes, with a small outward bias.
      bend.set(side * 0.12, 0, 1).addScaledVector(direction, -direction.z - side * 0.12 * direction.x).normalize();
      thigh.copy(direction).multiplyScalar(along).addScaledVector(bend, away);
      shin.copy(direction).multiplyScalar(reach).sub(thigh);
      hip.quaternion.setFromUnitVectors(upper, thigh.normalize());
      shin.applyQuaternion(rotation.copy(hip.quaternion).invert()).normalize();
      knee.quaternion.setFromUnitVectors(lower, shin);
      rotation.setFromAxisAngle(across, pitch);
      ankle.quaternion.setFromAxisAngle(up, yaw).multiply(rotation);
      ankle.quaternion.premultiply(rotation.copy(hip.quaternion).multiply(knee.quaternion).invert());
    },
  };
}

export function createMarkGait(root: Group, legs: { hip: Bone; knee: Bone; ankle: Bone; side: number }[]) {
  const feet = legs.map(({ hip, knee, ankle, side }) => createFoot(hip, knee, ankle, side));
  const target = new Vector3();
  const takeoff = new Vector3();
  const landing = new Vector3();
  const order = [0, 1];
  const pose = { offset: 0, armSwing: 0, effort: 0, sideways: 0, active: false };
  let initialized = false;
  let next = 0;
  let swing = -1;
  let elapsed = 0;
  let duration = 0;
  let takeoffYaw = 0;
  let landingYaw = 0;
  let stepHeight = 0;
  let toeLift = 0;
  let previousHeading = 0;
  let bodyHeight = 0;
  let effort = 0;
  let armSwing = 0;
  let sideways = 0;

  function placeFoot(index: number, cos: number, sin: number, leadX: number, leadZ: number, preventCrossing: boolean) {
    const { x, y, z } = root.position;
    const foot = feet[index];
    let px = x + cos * foot.side * settings.stanceWidth / 2 + sin * foot.neutralZ + leadX;
    let pz = z - sin * foot.side * settings.stanceWidth / 2 + cos * foot.neutralZ + leadZ;
    if (preventCrossing) {
      const other = feet[1 - index].position;
      const gap = ((px - other.x) * cos - (pz - other.z) * sin) * foot.side;
      const correction = Math.max(0, 0.12 - gap) * foot.side;
      px += cos * correction;
      pz -= sin * correction;
    }
    const floor = floorHeight(px, pz);
    return floor ? target.set(px, floor + foot.ankleHeight, pz) : target.set(x, y + foot.ankleHeight, z);
  }

  return function step(heading: number, dx: number, dz: number, dt: number) {
    const { x, y, z } = root.position;
    const cos = Math.cos(heading);
    const sin = Math.sin(heading);
    const speed = dt > 0 ? Math.hypot(dx, dz) / dt : 0;
    const moving = speed > 0.10;
    const vx = moving ? dx / dt : 0;
    const vz = moving ? dz / dt : 0;
    const sideSpeed = dt > 0 ? (dz * sin - dx * cos) / dt : 0;
    const lateral = moving ? Math.min(1, Math.abs(sideSpeed) / speed) : 0;
    const turning = initialized ? Math.abs(angleDelta(heading - previousHeading)) : 0;
    const blend = -Math.expm1(-12 * dt);
    effort += (Math.min(1, speed / tuning.walkSpeed) - effort) * blend;
    sideways += ((moving ? sideSpeed / speed : 0) - sideways) * blend;
    previousHeading = heading;

    if (!initialized) {
      for (let index = 0; index < feet.length; index++) {
        feet[index].position.copy(placeFoot(index, cos, sin, 0, 0, false));
        feet[index].yaw = heading;
      }
      bodyHeight = y;
      initialized = true;
    }

    if (swing < 0) {
      if (!moving) {
        // Finish a stop or pivot with the feet under the hips.
        for (const offset of order) {
          const index = (next + offset) % 2;
          const foot = feet[index];
          if (foot.position.distanceTo(placeFoot(index, cos, sin, 0, 0, false)) > 0.11
            || Math.abs(angleDelta(heading - foot.yaw)) > 0.36) {
            swing = index;
            break;
          }
        }
      } else {
        // Start a lateral step with the foot on the side we're heading towards.
        swing = effort < 0.25 && lateral > 0.75 ? (sideSpeed * feet[0].side < 0 ? 0 : 1) : next;
      }
      if (swing >= 0) {
        takeoff.copy(feet[swing].position);
        takeoffYaw = feet[swing].yaw;
        elapsed = 0;
        duration = moving
          ? settings.stepSeconds + (settings.strafeStepSeconds - settings.stepSeconds) * lateral
          : settings.settleStepSeconds;
        stepHeight = moving
          ? settings.stepHeight + (settings.strafeStepHeight - settings.stepHeight) * lateral
          : settings.strafeStepHeight * 0.7;
        toeLift = moving ? 0.19 * (1 - lateral) : 0;
        const lead = duration + settings.stepLeadSeconds;
        landing.copy(placeFoot(swing, cos, sin, vx * lead, vz * lead, lateral > 0.6));
        landingYaw = heading;
      }
    }

    let lift = 0;
    let swingArm = 0;
    if (swing >= 0) {
      const foot = feet[swing];
      elapsed = Math.min(duration, elapsed + dt);
      const phase = elapsed / duration;
      const progress = phase * phase * (3 - 2 * phase);
      const arch = Math.sin(Math.PI * phase);
      lift = arch * stepHeight;
      const lead = Math.max(0, duration - elapsed) + settings.stepLeadSeconds;
      const adjust = 1 - Math.min(1, Math.max(0, (phase - 0.5) / 0.38));
      const weight = -Math.expm1(-28 * dt) * adjust;
      landing.lerp(placeFoot(swing, cos, sin, vx * lead, vz * lead, lateral > 0.6), weight);
      landing.y = (floorHeight(landing.x, landing.z) || y) + foot.ankleHeight;
      landingYaw += angleDelta(heading - landingYaw) * weight;
      foot.position.copy(takeoff).lerp(landing, progress);
      foot.position.y += lift;
      foot.yaw = takeoffYaw + angleDelta(landingYaw - takeoffYaw) * progress;
      foot.pitch = -Math.sin(turn * phase) * arch * toeLift;
      swingArm = -Math.cos(Math.PI * phase) * foot.side;
      if (phase === 1) {
        next = 1 - swing;
        swing = -1;
      }
    }

    const goal = y - settings.hipDrop * effort + lift * 0.10;
    bodyHeight += (goal - bodyHeight) * blend;
    if (Math.abs(goal - bodyHeight) < 0.001) bodyHeight = goal;

    let hips = bodyHeight;
    for (const foot of feet) {
      const localX = (foot.position.x - x) * cos - (foot.position.z - z) * sin;
      const localZ = (foot.position.x - x) * sin + (foot.position.z - z) * cos;
      hips = Math.min(hips, foot.position.y + foot.maxDrop(localX, localZ) - foot.hipPosition.y);
    }
    const offset = Math.max(y - 0.19, hips);
    for (const foot of feet) {
      const localX = (foot.position.x - x) * cos - (foot.position.z - z) * sin;
      const localZ = (foot.position.x - x) * sin + (foot.position.z - z) * cos;
      foot.solve(localX, foot.position.y - offset, localZ, foot.yaw - heading, foot.pitch);
    }

    armSwing += (swingArm * effort * (1 - Math.abs(sideways)) - armSwing) * blend;
    pose.offset = offset - y;
    pose.armSwing = armSwing;
    pose.effort = effort;
    pose.sideways = sideways;
    pose.active = swing >= 0 || moving || turning > 0.001 || Math.abs(goal - bodyHeight) > 0.001;
    return pose;
  };
}
