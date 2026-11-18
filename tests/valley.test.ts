import { expect, it } from 'vitest';
import { Mesh, Scene } from 'three';
import { valley } from '../src/render/valley';

it('река выложена одной поверхностью ниже мостов; оба берега продолжаются за город', () => {
  const scene=new Scene();valley(scene);
  const river=scene.getObjectByName('river') as Mesh;
  expect(river.userData.noSnow).toBe(true);
  const position=river.geometry.getAttribute('position');
  for(let index=0;index<position.count;index++) expect(position.getY(index)).toBeCloseTo(-.005);
  river.geometry.computeBoundingBox();const bounds=river.geometry.boundingBox!;
  expect(bounds.min.z).toBeLessThan(-40);expect(bounds.max.z).toBeGreaterThan(50);
  let meshes=0;scene.traverse(object=>{if(object instanceof Mesh) meshes++;});expect(meshes).toBeLessThanOrEqual(4);
});
