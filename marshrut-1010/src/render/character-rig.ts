import type { Bone, Object3D } from 'three';

export function bindCharacterRig(model: Object3D) {
  function bone(name: string) {
    const joint = model.getObjectByName(name) as Bone | undefined;
    if (!joint?.isBone) throw new Error(`Character model is missing bone ${name}`);
    return joint;
  }

  const limbs = (['L', 'R'] as const).map((suffix, index) => {
    const side = index === 0 ? 1 : -1;
    const shoulder = bone(`upperarm01_${suffix}`);
    const elbow = bone(`lowerarm01_${suffix}`);
    const armAngle = Math.atan2(elbow.position.x, -elbow.position.y);
    shoulder.rotation.z = -armAngle + side * 0.09;
    for (const finger of [2, 3, 4, 5]) {
      bone(`finger${finger}-1_${suffix}`).rotation.x = 0.24;
    }
    return {
      side, shoulder, elbow, wrist: bone(`wrist_${suffix}`),
      hip: bone(`upperleg01_${suffix}`),
      knee: bone(`lowerleg01_${suffix}`),
      ankle: bone(`foot_${suffix}`),
    };
  });
  return { waist: bone('spine02'), chest: bone('spine01'), head: bone('head'), limbs };
}
