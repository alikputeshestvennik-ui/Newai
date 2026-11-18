import * as THREE from 'three';
type Shape = 'box' | 'roof' | 'round' | 'cone' | 'cylinder';
/** Static coloured parts become one instanced draw call per primitive. */
export class CityGeometry {
  readonly group = new THREE.Group();
  private parts = new Map<Shape, { matrix: THREE.Matrix4; color: THREE.Color }[]>();
  add(shape: Shape, color: string, x: number, y: number, z: number, sx: number, sy: number, sz: number, rotation = 0, roll = 0) {
    const matrix = new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(0, rotation, roll, 'YXZ')).scale(new THREE.Vector3(sx, sy, sz)); matrix.setPosition(x, y, z);
    const list = this.parts.get(shape) ?? []; list.push({ matrix, color: new THREE.Color(color) }); this.parts.set(shape, list);
  }
  finish() {
    const shapes = {
      box: () => new THREE.BoxGeometry(1, 1, 1),
      roof: () => new THREE.ConeGeometry(Math.SQRT1_2, 1, 4).rotateY(Math.PI / 4),
      round: () => new THREE.IcosahedronGeometry(0.5, 1),
      cone: () => new THREE.ConeGeometry(0.5, 1, 7),
      cylinder: () => new THREE.CylinderGeometry(0.5, 0.5, 1, 10)
    };
    for (const [shape, parts] of this.parts) {
      const mesh = new THREE.InstancedMesh(shapes[shape](), new THREE.MeshLambertMaterial({ color: '#ffffff', flatShading: true }), parts.length);
      parts.forEach((part, i) => { mesh.setMatrixAt(i, part.matrix); mesh.setColorAt(i, part.color); });
      this.group.add(mesh);
    }
    this.parts.clear(); return this.group;
  }
}
export function removeGeometry(group: THREE.Group) {
  group.traverse(object => { if (object instanceof THREE.Mesh) { object.geometry.dispose(); const materials = Array.isArray(object.material) ? object.material : [object.material]; materials.forEach(m => m.dispose()); } });
  group.removeFromParent();
}
