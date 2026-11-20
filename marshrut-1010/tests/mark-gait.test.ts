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
