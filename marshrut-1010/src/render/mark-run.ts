import tuning from '../../data/player.json';
import chapter from '../../data/turkey-preview.json';
import { createFoot, type Leg } from './mark-gait';

const settings = tuning.runGait;
const stride = chapter.runner.speed * settings.cycleSeconds;
const reach = stride * settings.contactFraction / 2;
const turn = Math.PI * 2;

export function createMarkRun(legs: Leg[]) {
  const feet = legs.map(({ hip, knee, ankle, side }) => createFoot(hip, knee, ankle, side));
  const targets = feet.map(() => ({ x: 0, y: 0, z: 0, pitch: 0 }));
  const pose = { offset: 0, armSwing: 0, effort: 0, sideways: 0, active: false };

  return function step(distance: number, dx: number, dt: number, moving: boolean) {
    const change = dt / settings.poseBlendSeconds;
    pose.effort = moving ? Math.min(1, pose.effort + change) : Math.max(0, pose.effort - change);
    if (!moving && distance === 0) pose.effort = pose.sideways = 0;
    const effort = pose.effort * pose.effort * (3 - 2 * pose.effort);
    const steer = moving && dt > 0 ? Math.max(-1, Math.min(1, -dx / dt / chapter.runner.sideSpeed)) : 0;
    pose.sideways += (steer - pose.sideways) * -Math.expm1(-settings.leanResponse * dt);
    const cycle = (distance / stride) % 1;
    pose.armSwing = Math.cos(cycle * turn) * effort;
    const rebound = Math.sin(2 * turn * (cycle - 0.13));
    let offset = (-settings.hipDrop + settings.bounce * rebound) * effort;

    feet.forEach((foot, index) => {
      const phase = (cycle + index / 2) % 1;
      const target = targets[index];
      target.x = foot.side * settings.stanceWidth / 2 + pose.sideways * 0.08 * effort;
      target.y = foot.ankleHeight;
      target.pitch = 0;
      let forward = reach - stride * phase;
      if (phase >= settings.contactFraction) {
        const swing = (phase - settings.contactFraction) / (1 - settings.contactFraction);
        const arch = Math.sin(Math.PI * swing);
        const eased = swing * swing * (3 - 2 * swing);
        forward = reach * (2 * eased - 1) - (stride - 2 * reach) * swing * (1 - swing) * (1 - 2 * swing);
        target.y += settings.swingHeight * arch * arch * effort;
        target.pitch = (0.48 - 0.75 * swing) * arch * effort;
      }
      target.z = foot.neutralZ + forward * effort;
      offset = Math.min(offset, target.y + foot.maxDrop(target.x, target.z) - foot.hipPosition.y);
    });
    feet.forEach((foot, index) => {
      const { x, y, z, pitch } = targets[index];
      foot.solve(x, y - offset, z, 0, pitch);
    });
    pose.offset = offset;
    pose.active = moving || pose.effort > 0 || Math.abs(pose.sideways) > 0.01;
    return pose;
  };
}
