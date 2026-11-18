import * as THREE from 'three';
import { CityGeometry } from './geometry';
import { valley } from './valley';
import { infrastructure, isLandmark, roadClearance } from './infrastructure';
import { plotPosition } from './development';
import { D } from '../sim/config';
import type { Quality } from '../core/settings';

const palette: Record<string, string> = { residential: '#d7b99a', business: '#9fb9bc', commercial: '#e7c594', industrial: '#a4a5a0', leisure: '#9cbd86' };
export class Scenery {
  readonly windows = new THREE.MeshBasicMaterial({ color: '#658b95' });
  private chunks: { detail: THREE.Group; simple: THREE.Group; bounds: THREE.Sphere }[] = [];
  private frustum = new THREE.Frustum();
  private view = new THREE.Matrix4();
  private matrix = new THREE.Matrix4();
  private tint = new THREE.Color();
  private box = new THREE.BoxGeometry(1, 1, 1);
  private cone = new THREE.ConeGeometry(0.35, 0.8, 5);
  constructor(scene: THREE.Scene) {
    valley(scene);
    infrastructure(scene);
    const buildingMaterial = new THREE.MeshLambertMaterial({ color: '#ffffff', flatShading: true });
    const roofMaterial = new THREE.MeshLambertMaterial({ color: '#857e70', flatShading: true });
    const leafMaterial = new THREE.MeshLambertMaterial({ color: '#659368', flatShading: true });
    const trunkMaterial = new THREE.MeshLambertMaterial({ color: '#8d7456' });
    const shadowMaterial = new THREE.MeshBasicMaterial({ color: '#344e43', transparent: true, opacity: 0.13, depthWrite: false });
    for (let cx = 0; cx < 2; cx++) for (let cz = 0; cz < 2; cz++) {
      const detail = new THREE.Group(), simple = new THREE.Group();
      const buildings = new THREE.InstancedMesh(this.box, buildingMaterial, 36);
      const roofs = new THREE.InstancedMesh(this.box, roofMaterial, 36);
      const windows = new THREE.InstancedMesh(this.box, this.windows, 360);
      const trees = new THREE.InstancedMesh(this.cone, leafMaterial, 108);
      const broadleaf = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.42,1),leafMaterial,108);
      const poplars = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.38,0),leafMaterial,108);
      const accents = new CityGeometry();
      const trunks = new THREE.InstancedMesh(this.box, trunkMaterial, 108);
      const shadows = new THREE.InstancedMesh(this.box, shadowMaterial, 144);
      const distant = new THREE.InstancedMesh(this.box, buildingMaterial, 36);
      let b = 0, w = 0, tree = 0, shadow = 0, pine = 0, broad = 0, poplar = 0;
      for (let x = cx * 6; x < cx * 6 + 6; x++) for (let z = cz * 6; z < cz * 6 + 6; z++) {
        if (roadClearance(x,z)<0.65 || x===8 || x===9 || isLandmark(x,z) || D.districts.some(d=>{const p=plotPosition(d);return p[0]===x&&p[1]===z;})) continue;
        let nearest = D.districts[0], distance = Infinity;
        for (const district of D.districts) { const d = Math.hypot(x - district.x, z - district.y); if (d < distance) { distance = d; nearest = district; } }
        const park = nearest.type === 'leisure';
        const variety = (x * 17 + z * 31) % 7;
        if (!park) {
          const height = nearest.type === 'business' ? 1.05 + variety * 0.17 : nearest.type === 'industrial' ? 0.45 : 0.38 + variety * 0.12;
          const pitched = nearest.type === 'residential' && variety % 2 === 0;
          const width = nearest.type === 'industrial' ? 0.81 : 0.56 + variety * 0.02;
          this.tint.set(palette[nearest.type]); this.tint.multiplyScalar(0.91 + variety * 0.025);
          this.put(buildings, b, x, height / 2 + 0.06, z, width, height, 0.65); buildings.setColorAt(b, this.tint);
          this.put(distant, b, x, height / 2 + 0.06, z, width, height, 0.65); distant.setColorAt(b, this.tint);
          this.put(roofs, b++, x, height + 0.09, z, width + 0.06, pitched ? 0.01 : 0.08, 0.72);
          if(pitched)accents.add('roof',variety%3?'#a6644e':'#707d79',x,height+.24,z,width+.13,.35,.8);
          if(nearest.type==='business')accents.add('box','#6b98a3',x+.25,height/2+.06,z,.11,height*.86,.67);
          if(nearest.type==='residential'&&!pitched)for(let level=.3;level<height;level+=.27)accents.add('box','#e9dbbf',x,level,z+.37,width*.6,.06,.14);
          if(nearest.type==='industrial')accents.add('cylinder','#ad7556',x+.3,height+.22,z-.2,.12,.5,.12);
          this.put(shadows, shadow++, x + 0.16, 0.049, z - 0.07, width + 0.28, 0.007, 0.87);
          for (let level = 0.23; level < height; level += 0.26) for (const side of [-1, 1]) {
            this.put(windows, w++, x, level + 0.06, z + side * 0.328, width * 0.65, 0.1, 0.012);
          }
        }
        const count = park ? 3 : 1;
        for (let i = 0; i < count; i++) {
          const tx = x + (park ? (i - 1) * 0.28 : 0.42), tz = z + (i % 2 ? 0.22 : -0.34);
          this.put(trunks, tree, tx, 0.2, tz, 0.06, 0.3, 0.06);
          const species=(x+z+i)%3;
          if(species===0)this.put(trees,pine++,tx,.58,tz,.75,.9+variety*.06,.75);
          else if(species===1)this.put(broadleaf,broad++,tx,.57,tz,1,.9,1);
          else this.put(poplars,poplar++,tx,.64,tz,.55,1.65,.55);
          tree++;
        }
      }
      buildings.count = roofs.count = distant.count = b; windows.count = w; trees.count = pine; broadleaf.count = broad; poplars.count = poplar; trunks.count = tree; shadows.count = shadow;
      detail.add(buildings, roofs, windows, trees, broadleaf, poplars, trunks, shadows, accents.finish()); simple.add(distant);
      scene.add(detail, simple); this.chunks.push({ detail, simple, bounds: new THREE.Sphere(new THREE.Vector3(cx * 6 + 2.5, 0.8, cz * 6 + 2.5), 5) });
    }
    // Riverfront avenue trees, shared by both banks without blocking stop intersections.
    const avenue = new THREE.InstancedMesh(this.cone, leafMaterial, 16);
    const promenade=[0,2,3,5,6,8,9,11];
    for (let i = 0; i < 16; i++) this.put(avenue, i, i < 8 ? 7.75 : 9.25, 0.4, promenade[i%8], 0.55, 0.8, 0.55);
    scene.add(avenue);
  }
  private put(mesh: THREE.InstancedMesh, index: number, x: number, y: number, z: number, sx: number, sy: number, sz: number) {
    this.matrix.makeScale(sx, sy, sz); this.matrix.setPosition(x, y, z); mesh.setMatrixAt(index, this.matrix);
  }
  update(camera: THREE.Camera, zoom: number, quality: Quality) {
    this.view.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse); this.frustum.setFromProjectionMatrix(this.view);
    for (const chunk of this.chunks) {
      const visible = this.frustum.intersectsSphere(chunk.bounds), detail = zoom >= (quality === 'low' ? 0.9 : 0.75);
      chunk.detail.visible = visible && detail; chunk.simple.visible = visible && !detail;
    }
  }
}
