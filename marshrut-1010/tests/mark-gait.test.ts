import { readFileSync } from 'node:fs';
import { Bone, Group, Vector3 } from 'three';
import { expect, it } from 'vitest';
import { createWalker, updateWalker } from '../src/player/movement';
import { buildMark } from '../src/render/mark';

function loadRig() {
  const glb = readFileSync(new URL('../src/assets/mark.glb', import.meta.url));
  const manifest = JSON.parse(glb.subarray(20, 20 + glb.readUInt32LE(12)).toString());
  const nodes = manifest.nodes.slice(0, -1) as {
    name: string; translation: [number, number, number]; children?: number[];
  }[];
  const bones = nodes.map(({ name, translation }) => {
    const bone = new Bone();
    bone.name = name;
    bone.position.fromArray(translation);
    return bone;
  });
  nodes.forEach(({ children }, index) => children?.forEach((child) => bones[index].add(bones[child])));
  const model = new Group().add(bones[0]);
  return { model, ankles: ['foot_L', 'foot_R'].map((name) => model.getObjectByName(name)!) };
}

it.each([0, -1, 1])('plants a foot while walking with sideways input %d and settles after release', (side) => {
  const { model, ankles } = loadRig();
  const mark = buildMark(model);
  const walker = createWalker();
  const dt = 1 / 60;
  const sampleFeet = () => ankles.map((ankle) => ankle.getWorldPosition(new Vector3()));
  function frame(walking: boolean) {
    const { x, z } = walker;
    updateWalker(walker, walking, side, dt, false);
    mark.root.position.set(walker.x, walker.y, walker.z);
    mark.pose(walker.heading, walker.x - x, walker.z - z, dt, false);
    return sampleFeet();
  }

  let previous = frame(false);
  const sole = previous[0].y;
  let highest = sole;
  for (let index = 0; index < 69; index++) {
    const feet = frame(true);
    highest = Math.max(highest, ...feet.map(({ y }) => y));
    const drifts = feet.map((foot, footIndex) => foot.distanceTo(previous[footIndex]));
    expect(Math.min(...drifts)).toBeLessThan(0.005);
    expect(Math.min(...feet.map(({ y }) => y))).toBeCloseTo(sole, 2);
    previous = feet;
  }
  expect(Math.hypot(walker.x, walker.z - 3.5)).toBeGreaterThan(1);
  expect(highest - sole).toBeGreaterThan(0.06);

  for (let index = 0; index < 60; index++) previous = frame(false);
  const resting = frame(false);
  resting.forEach((foot, index) => {
    expect(foot.distanceTo(previous[index])).toBeLessThan(0.001);
    expect(foot.y).toBeCloseTo(sole, 2);
    expect(Math.hypot(foot.x - walker.x, foot.z - walker.z)).toBeLessThan(0.25);
  });
});

it('runs with alternating push-offs and flight, even when changing lanes', () => {
  const { model, ankles } = loadRig();
  const mark = buildMark(model);
  const dt = 1 / 120;
  mark.posePreview(Math.PI, 0, 0, dt, false, true);
  const sole = ankles[0].getWorldPosition(new Vector3()).y;
  const contacts = new Set<number>();
  let flightFrames = 0;
  let highest = sole;
  const shoulders = ['L', 'R'].map((side) => model.getObjectByName(`upperarm01_${side}`)!);
  const elbows = ['L', 'R'].map((side) => model.getObjectByName(`lowerarm01_${side}`)!);
  const wrists = ['L', 'R'].map((side) => model.getObjectByName(`wrist_${side}`)!);
  let swing = 0;
  for (let index = 1; index <= 240; index++) {
    const distance = index * dt * 3.9;
    const shifting = index > 85 && index <= 105;
    const dx = shifting ? 9 * dt : 0;
    mark.root.position.x += dx;
    mark.root.position.z = -distance;
    mark.poseRun(distance, dx, dt, true);
    const feet = ankles.map((ankle) => ankle.getWorldPosition(new Vector3()));
    if (index > 30) {
      feet.forEach((foot, leg) => {
        if (!shifting && Math.abs(foot.y - sole) < 0.009) contacts.add(leg);
        expect(foot.y).toBeGreaterThan(sole - 0.016);
        expect(Math.abs(foot.x - mark.root.position.x)).toBeLessThan(0.37);
      });
      if (feet.every(({ y }) => y > sole + 0.025)) flightFrames++;
      if (!shifting && index < 85) {
        wrists.forEach((wrist, arm) => {
          const elbow = elbows[arm].getWorldPosition(new Vector3());
          expect(Math.abs(wrist.getWorldPosition(new Vector3()).x - elbow.x)).toBeLessThan(0.11);
        });
      }
      highest = Math.max(highest, ...feet.map(({ y }) => y));
      swing = Math.max(swing, Math.abs(shoulders[0].rotation.x - shoulders[1].rotation.x));
    }
  }
  expect([...contacts].sort()).toEqual([0, 1]);
  expect(flightFrames).toBeGreaterThan(25);
  expect(highest - sole).toBeGreaterThan(0.22);
  expect(swing).toBeGreaterThan(0.75);

  for (let index = 0; index < 30; index++) mark.poseRun(7.8, 0, dt, false);
  ankles.forEach((ankle) => expect(ankle.getWorldPosition(new Vector3()).y).toBeCloseTo(sole, 2));
});
